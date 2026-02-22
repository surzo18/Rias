import express from 'express';
import { verifyInternalToken } from '../shared/auth.js';
import { createTierGate } from '../shared/tier-gate.js';
import { createAuditMiddleware } from '../shared/audit-middleware.js';
import {
  ACTIONS,
  getActionTier,
  buildApiUrl,
  extractCurrentWeather,
  extractForecast,
} from './actions.js';

const PORT = parseInt(process.env.PORT ?? '9005', 10);
const SECRET = process.env.INTERNAL_SECRET ?? '';
const DEFAULT_LOCATION = process.env.WEATHER_DEFAULT_LOCATION ?? 'Kysucke+Nove+Mesto';
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
  tool: 'weather-tool',
  secret: SECRET,
  getRequestTier: (action) => getActionTier(action),
}));
app.use('/execute', createAuditMiddleware({ tool: 'weather-tool', secret: SECRET }));

app.post('/execute', async (req, res) => {
  const { request_id, action, params } = req.body;
  const start = Date.now();
  const tier = getActionTier(action);

  if (tier === 'forbidden') {
    const available = Object.keys(ACTIONS).join(', ');
    res.json({
      request_id,
      status: 'error',
      result: { error: `Unknown action: ${action}. Available actions: ${available}` },
      metadata: { duration_ms: Date.now() - start, action, tier: 'forbidden' },
    });
    return;
  }

  try {
    const p = (params ?? {}) as Record<string, unknown>;
    const location = String(p.location ?? DEFAULT_LOCATION);
    const url = buildApiUrl(action, { ...p, location });
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`wttr.in returned HTTP ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    let result: Record<string, unknown>;

    switch (action) {
      case 'current':
        result = extractCurrentWeather(data, location) as unknown as Record<string, unknown>;
        break;

      case 'forecast':
        result = extractForecast(data, location) as unknown as Record<string, unknown>;
        break;

      default:
        result = { error: `Unhandled action: ${action}` };
        break;
    }

    res.json({
      request_id,
      status: 'success',
      result,
      metadata: { duration_ms: Date.now() - start, action: `weather:${action}`, tier },
    });
  } catch (err) {
    res.json({
      request_id,
      status: 'error',
      result: { error: (err as Error).message },
      metadata: { duration_ms: Date.now() - start, action: `weather:${action}`, tier },
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`weather-tool listening on port ${PORT}`);
});
