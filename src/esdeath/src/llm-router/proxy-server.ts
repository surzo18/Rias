import express from 'express';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { classifyRequest } from './classifier.js';
import { route, loadRoutingConfig, type RoutingConfig } from './router.js';
import { BudgetTracker } from './budget.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderConfig {
  base_url: string;
  api_key?: string | null;
  api_key_env?: string;
  models: string[];
  cost_per_1m_tokens: number;
  timeout_ms: number;
  model_map?: Record<string, string>;
}

interface ProvidersFile {
  providers: Record<string, ProviderConfig>;
  routing_rules: Array<{ match: Record<string, unknown>; model: string; fallback: string | null }>;
  default_model: string;
  budget: { daily_limit_usd: number; warning_threshold_usd: number; when_exceeded: string };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const OPENAI_ROUTER_URL = process.env.OPENAI_ROUTER_URL ?? 'http://openai-router:8080/v1';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://ollama:11434/v1';
const AUDIT_DB_URL = process.env.AUDIT_DB_URL ?? 'http://audit-db:9000';
const DAILY_BUDGET = parseFloat(process.env.DAILY_BUDGET_USD ?? '1.00');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';
const CONFIG_PATH = process.env.CONFIG_PATH ?? './config/llm-providers.json';

const startTime = Date.now();

// ---------------------------------------------------------------------------
// Load config
// ---------------------------------------------------------------------------

let providers: Record<string, ProviderConfig> = {};
let routingConfig: RoutingConfig;
const tracker = new BudgetTracker(DAILY_BUDGET);

async function loadConfig(): Promise<void> {
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as ProvidersFile;
    providers = raw.providers;
    routingConfig = loadRoutingConfig({
      rules: raw.routing_rules,
      default_model: raw.default_model,
    });
    // eslint-disable-next-line no-console
    console.log(`Loaded config: ${Object.keys(providers).length} providers, ${raw.routing_rules.length} rules`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to load config from ${CONFIG_PATH}:`, (err as Error).message);
    // Fallback: direct passthrough to openai-router
    providers = {
      openai: {
        base_url: OPENAI_ROUTER_URL,
        api_key: OPENAI_API_KEY,
        models: ['gpt-5.2'],
        cost_per_1m_tokens: 5.0,
        timeout_ms: 60000,
      },
    };
    routingConfig = loadRoutingConfig({ rules: [], default_model: 'openai/gpt-5.2' });
  }
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

function parseModelString(modelStr: string): { provider: string; model: string } {
  const slash = modelStr.indexOf('/');
  if (slash === -1) return { provider: 'openai', model: modelStr };
  return { provider: modelStr.slice(0, slash), model: modelStr.slice(slash + 1) };
}

function resolveProvider(providerName: string): { baseUrl: string; apiKey: string; config: ProviderConfig } | null {
  const config = providers[providerName];
  if (!config) return null;

  let baseUrl = config.base_url;
  let apiKey = '';

  // Override base_url from env if available
  if (providerName === 'ollama') baseUrl = OLLAMA_URL;
  else if (providerName === 'openai') baseUrl = OPENAI_ROUTER_URL;

  // Resolve API key
  if (config.api_key) {
    apiKey = config.api_key;
  } else if (config.api_key_env) {
    apiKey = process.env[config.api_key_env] ?? '';
  }

  return { baseUrl, apiKey, config };
}

function resolveModelName(providerName: string, model: string): string {
  const config = providers[providerName];
  if (config?.model_map?.[model]) {
    return config.model_map[model];
  }
  return model;
}

// ---------------------------------------------------------------------------
// Proxy logic
// ---------------------------------------------------------------------------

function proxyRequest(
  targetUrl: string,
  apiKey: string,
  body: Buffer,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(body.length),
    };
    if (apiKey) reqHeaders['Authorization'] = `Bearer ${apiKey}`;
    // Forward select headers
    if (headers['accept']) reqHeaders['Accept'] = headers['accept'];

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: reqHeaders,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 500,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.write(body);
    req.end();
  });
}

function streamProxy(
  targetUrl: string,
  apiKey: string,
  body: Buffer,
  headers: Record<string, string>,
  timeoutMs: number,
  clientRes: express.Response,
): Promise<{ totalTokens: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(body.length),
      'Accept': 'text/event-stream',
    };
    if (apiKey) reqHeaders['Authorization'] = `Bearer ${apiKey}`;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: reqHeaders,
        timeout: timeoutMs,
      },
      (res) => {
        // Forward status and headers
        clientRes.writeHead(res.statusCode ?? 200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Transfer-Encoding': 'chunked',
        });

        let totalTokens = 0;
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          clientRes.write(chunk);

          // Parse SSE for usage extraction
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data) as { usage?: { total_tokens?: number } };
              if (parsed.usage?.total_tokens) {
                totalTokens = parsed.usage.total_tokens;
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        });

        res.on('end', () => {
          clientRes.end();
          resolve({ totalTokens });
        });
      },
    );

    req.on('error', (err) => {
      clientRes.destroy();
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy(new Error('Stream timed out'));
    });

    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Budget seeding
// ---------------------------------------------------------------------------

async function seedBudget(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const resp = await fetch(`${AUDIT_DB_URL}/costs/${today}`, {
      headers: { Authorization: `Bearer ${INTERNAL_SECRET}` },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const costs = await resp.json() as Array<{ total_cost: number }>;
      const total = costs.reduce((sum, c) => sum + (c.total_cost ?? 0), 0);
      if (total > 0) {
        tracker.record(total);
        // eslint-disable-next-line no-console
        console.log(`Seeded budget: $${total.toFixed(4)} spent today`);
      }
    }
  } catch {
    // eslint-disable-next-line no-console
    console.log('Could not seed budget from audit-db (may not be running)');
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// Raw body for proxying
app.use('/v1', express.raw({ type: 'application/json', limit: '10mb' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime_s: Math.floor((Date.now() - startTime) / 1000),
    budget: {
      spent: tracker.todaySpent(),
      remaining: tracker.remaining(),
      limit: DAILY_BUDGET,
    },
  });
});

app.get('/budget', (_req, res) => {
  res.json({
    spent: tracker.todaySpent(),
    remaining: tracker.remaining(),
    limit: DAILY_BUDGET,
    can_spend: tracker.canSpend(),
    warning: tracker.isWarning(DAILY_BUDGET * 0.5),
  });
});

// ---------------------------------------------------------------------------
// Chat completions — classify, route, proxy
// ---------------------------------------------------------------------------

app.post('/v1/chat/completions', async (req, res) => {
  const rawBody = req.body as Buffer;
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(rawBody.toString()) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const isStream = parsed.stream === true;

  // 1. Classify request
  const attributes = classifyRequest(parsed as Parameters<typeof classifyRequest>[0]);

  // 2. Check budget
  let forcedLocal = false;
  if (!tracker.canSpend()) {
    forcedLocal = true;
  }

  // 3. Route
  let decision = route(attributes as Record<string, unknown>, routingConfig);

  // If budget exceeded, force to Ollama
  if (forcedLocal) {
    const { provider } = parseModelString(decision.model);
    if (provider !== 'ollama') {
      decision = {
        model: routingConfig.default_model ?? 'ollama/qwen3-8b',
        fallback: null,
        reason: 'Budget exceeded, forced to local model',
      };
    }
  }

  // 4. Resolve provider
  const { provider: providerName, model: modelName } = parseModelString(decision.model);
  const resolved = resolveProvider(providerName);

  if (!resolved) {
    res.status(500).json({ error: `Unknown provider: ${providerName}` });
    return;
  }

  // 5. Build proxied body with resolved model name
  const resolvedModelName = resolveModelName(providerName, modelName);
  parsed.model = resolvedModelName;
  const proxiedBody = Buffer.from(JSON.stringify(parsed));

  const targetUrl = `${resolved.baseUrl}/chat/completions`;
  const incomingHeaders = req.headers as Record<string, string>;

  try {
    if (isStream) {
      // Set provider headers before streaming
      res.setHeader('X-LLM-Provider', providerName);
      res.setHeader('X-LLM-Model', resolvedModelName);

      const { totalTokens } = await streamProxy(
        targetUrl,
        resolved.apiKey,
        proxiedBody,
        incomingHeaders,
        resolved.config.timeout_ms,
        res,
      );

      // Record cost after stream completes
      const cost = (totalTokens * resolved.config.cost_per_1m_tokens) / 1_000_000;
      if (cost > 0) tracker.record(cost);
    } else {
      const result = await proxyRequest(
        targetUrl,
        resolved.apiKey,
        proxiedBody,
        incomingHeaders,
        resolved.config.timeout_ms,
      );

      // Extract usage for cost tracking
      try {
        const respBody = JSON.parse(result.body.toString()) as {
          usage?: { total_tokens?: number };
        };
        const tokens = respBody.usage?.total_tokens ?? 0;
        const cost = (tokens * resolved.config.cost_per_1m_tokens) / 1_000_000;
        if (cost > 0) tracker.record(cost);

        res.setHeader('X-LLM-Cost', cost.toFixed(6));
      } catch {
        // Can't parse response for cost, skip
      }

      res.setHeader('X-LLM-Provider', providerName);
      res.setHeader('X-LLM-Model', resolvedModelName);

      // Forward content-type from upstream
      if (result.headers['content-type']) {
        res.setHeader('Content-Type', result.headers['content-type']);
      }

      res.status(result.statusCode).send(result.body);
    }
  } catch (err) {
    // Primary failed — try fallback
    if (decision.fallback) {
      const { provider: fbProvider, model: fbModel } = parseModelString(decision.fallback);
      const fbResolved = resolveProvider(fbProvider);

      if (fbResolved) {
        const fbModelName = resolveModelName(fbProvider, fbModel);
        parsed.model = fbModelName;
        const fbBody = Buffer.from(JSON.stringify(parsed));
        const fbUrl = `${fbResolved.baseUrl}/chat/completions`;

        try {
          if (isStream) {
            res.setHeader('X-LLM-Provider', fbProvider);
            res.setHeader('X-LLM-Model', fbModelName);
            res.setHeader('X-LLM-Fallback', 'true');

            const { totalTokens } = await streamProxy(
              fbUrl,
              fbResolved.apiKey,
              fbBody,
              incomingHeaders,
              fbResolved.config.timeout_ms,
              res,
            );

            const cost = (totalTokens * fbResolved.config.cost_per_1m_tokens) / 1_000_000;
            if (cost > 0) tracker.record(cost);
          } else {
            const fbResult = await proxyRequest(
              fbUrl,
              fbResolved.apiKey,
              fbBody,
              incomingHeaders,
              fbResolved.config.timeout_ms,
            );

            try {
              const respBody = JSON.parse(fbResult.body.toString()) as {
                usage?: { total_tokens?: number };
              };
              const tokens = respBody.usage?.total_tokens ?? 0;
              const cost = (tokens * fbResolved.config.cost_per_1m_tokens) / 1_000_000;
              if (cost > 0) tracker.record(cost);
              res.setHeader('X-LLM-Cost', cost.toFixed(6));
            } catch {
              // skip
            }

            res.setHeader('X-LLM-Provider', fbProvider);
            res.setHeader('X-LLM-Model', fbModelName);
            res.setHeader('X-LLM-Fallback', 'true');

            if (fbResult.headers['content-type']) {
              res.setHeader('Content-Type', fbResult.headers['content-type']);
            }

            res.status(fbResult.statusCode).send(fbResult.body);
          }
          return;
        } catch (fbErr) {
          // Fallback also failed
          // eslint-disable-next-line no-console
          console.error('Fallback failed:', (fbErr as Error).message);
        }
      }
    }

    // No fallback or fallback failed
    if (!res.headersSent) {
      res.status(502).json({
        error: `Upstream provider ${providerName} failed: ${(err as Error).message}`,
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Audio/speech passthrough to openai-router (TTS)
// ---------------------------------------------------------------------------

app.post('/v1/audio/speech', (req, res) => {
  const rawBody = req.body as Buffer;
  const url = new URL(`${OPENAI_ROUTER_URL}/audio/speech`);

  const proxyReq = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(rawBody.length),
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `TTS proxy failed: ${err.message}` });
    }
  });

  proxyReq.write(rawBody);
  proxyReq.end();
});

// ---------------------------------------------------------------------------
// All other /v1/* — passthrough to openai-router
// ---------------------------------------------------------------------------

app.all('/v1/{*path}', (req, res) => {
  const path = req.path.replace(/^\/v1/, '');
  const url = new URL(`${OPENAI_ROUTER_URL}${path}`);
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

  const proxyReq = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] ?? 'application/json',
        'Content-Length': String(rawBody.length),
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Proxy failed: ${err.message}` });
    }
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    proxyReq.write(rawBody);
  }
  proxyReq.end();
});

// ---------------------------------------------------------------------------
// Daily budget reset
// ---------------------------------------------------------------------------

function scheduleMidnightReset(): void {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const msUntilMidnight = tomorrow.getTime() - now.getTime();

  setTimeout(() => {
    tracker.resetDaily();
    // eslint-disable-next-line no-console
    console.log('Budget reset for new day');
    // Schedule next reset
    setInterval(() => {
      tracker.resetDaily();
      // eslint-disable-next-line no-console
      console.log('Budget reset for new day');
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await loadConfig();
  await seedBudget();
  scheduleMidnightReset();

  app.listen(PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`llm-router listening on port ${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Budget: $${tracker.todaySpent().toFixed(4)} / $${DAILY_BUDGET.toFixed(2)}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start llm-router:', err);
  process.exit(1);
});

// Export for testing
export { app, loadConfig, parseModelString, resolveModelName, resolveProvider, tracker };
