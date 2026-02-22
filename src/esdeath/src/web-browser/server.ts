import express from 'express';
import { verifyInternalToken } from '../shared/auth.js';
import { createTierGate } from '../shared/tier-gate.js';
import { createAuditMiddleware } from '../shared/audit-middleware.js';
import { ACTIONS, resolveAction, getActionTier, buildActionParams } from './actions.js';
import { withPage } from './browser-pool.js';

const PORT = parseInt(process.env.PORT ?? '9002', 10);
const SECRET = process.env.INTERNAL_SECRET ?? '';
const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://searxng:8080';
const startTime = Date.now();

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime_s: Math.floor((Date.now() - startTime) / 1000) });
});

app.use(verifyInternalToken(SECRET));

app.get('/actions', (_req, res) => {
  res.json({
    actions: Object.entries(ACTIONS).map(([name, def]) => ({
      name,
      tier: def.tier,
      required_params: def.requiredParams,
    })),
  });
});

app.use('/execute', createTierGate({
  tool: 'web-browser',
  secret: SECRET,
  getRequestTier: (action) => getActionTier(action),
}));
app.use('/execute', createAuditMiddleware({ tool: 'web-browser', secret: SECRET }));

// ---------------------------------------------------------------------------
// Search via SearXNG JSON API (no browser needed)
// ---------------------------------------------------------------------------
async function searchViaSearxng(query: string): Promise<Record<string, unknown>> {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&language=auto`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });

  if (!resp.ok) {
    throw new Error(`SearXNG returned ${resp.status}: ${resp.statusText}`);
  }

  const data = await resp.json() as {
    results?: Array<{ title: string; url: string; content: string }>;
    suggestions?: string[];
    answers?: string[];
  };

  const results = (data.results ?? []).slice(0, 10).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));

  return {
    results,
    count: results.length,
    suggestions: data.suggestions ?? [],
    answers: data.answers ?? [],
  };
}

// ---------------------------------------------------------------------------
// Lightweight fetch via node fetch() — for APIs, JSON, plain text
// ---------------------------------------------------------------------------
async function lightFetch(url: string): Promise<{ title: string; text: string; url: string; used_browser: boolean }> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });

  const contentType = resp.headers.get('content-type') ?? '';

  // JSON or plain text — return directly, no browser needed
  if (contentType.includes('application/json') || contentType.includes('text/plain')) {
    const text = await resp.text();
    return {
      title: '',
      text: text.slice(0, 10000),
      url: resp.url,
      used_browser: false,
    };
  }

  // HTML — need browser for JS rendering and innerText extraction
  return { title: '', text: '', url, used_browser: true };
}

// ---------------------------------------------------------------------------
// Full browser fetch — for HTML pages that need JS rendering
// ---------------------------------------------------------------------------
async function browserFetch(url: string): Promise<{ title: string; text: string; url: string }> {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const title = await page.title();
    const text = await page.evaluate(() => {
      const el = document.querySelector('body');
      return el ? el.innerText.slice(0, 10000) : '';
    });
    return { title, text, url: page.url() };
  });
}

async function browserScreenshot(url: string): Promise<{ screenshot_base64: string; url: string }> {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    return { screenshot_base64: Buffer.from(buffer).toString('base64'), url: page.url() };
  });
}

async function browserExtract(url: string, selector: string): Promise<{ elements: string[]; count: number; url: string }> {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const elements = await page.$$eval(selector, (els) =>
      els.map((el) => el.textContent?.trim() ?? '').filter(Boolean).slice(0, 50),
    );
    return { elements, count: elements.length, url: page.url() };
  });
}

// ---------------------------------------------------------------------------
// Main execute endpoint
// ---------------------------------------------------------------------------
app.post('/execute', async (req, res) => {
  const { request_id, params } = req.body;
  const rawAction: string = req.body.action;
  const action = resolveAction(rawAction);
  const start = Date.now();
  const tier = getActionTier(rawAction);

  if (tier === 'forbidden') {
    const available = Object.keys(ACTIONS).join(', ');
    res.json({
      request_id,
      status: 'error',
      result: { error: `Unknown action: ${rawAction}. Available actions: ${available}` },
      metadata: { duration_ms: Date.now() - start, action: rawAction, tier: 'forbidden' },
    });
    return;
  }

  try {
    const actionParams = buildActionParams(rawAction, params ?? {});
    let result: Record<string, unknown>;

    switch (action) {
      case 'search': {
        result = await searchViaSearxng(String((params ?? {} as Record<string, unknown>).query));
        break;
      }

      case 'fetch_url': {
        // Try lightweight fetch first; fall back to browser for HTML
        const light = await lightFetch(actionParams.url);
        if (!light.used_browser) {
          result = { title: light.title, text: light.text, url: light.url };
        } else {
          result = await browserFetch(actionParams.url);
        }
        break;
      }

      case 'screenshot': {
        result = await browserScreenshot(actionParams.url);
        break;
      }

      case 'extract': {
        const selector = actionParams.selector ?? 'body';
        result = await browserExtract(actionParams.url, selector);
        break;
      }

      default:
        result = { error: 'Unhandled action' };
    }

    res.json({
      request_id,
      status: 'success',
      result,
      metadata: { duration_ms: Date.now() - start, action: `web:${action}`, tier },
    });
  } catch (err) {
    res.json({
      request_id,
      status: 'error',
      result: { error: (err as Error).message },
      metadata: { duration_ms: Date.now() - start, action: `web:${action}`, tier },
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`web-browser listening on port ${PORT}`);
});
