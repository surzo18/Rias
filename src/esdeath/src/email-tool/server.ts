import express from 'express';
import { verifyInternalToken } from '../shared/auth.js';
import { createTierGate } from '../shared/tier-gate.js';
import { createAuditMiddleware } from '../shared/audit-middleware.js';
import { ACTIONS, executeAction, getActionTier } from './actions.js';

const PORT = parseInt(process.env.PORT ?? '9003', 10);
const SECRET = process.env.INTERNAL_SECRET ?? '';
const GOG_PATH = process.env.GOG_PATH ?? 'gog';
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
  tool: 'email-tool',
  secret: SECRET,
  getRequestTier: (action) => getActionTier(action),
}));
app.use('/execute', createAuditMiddleware({ tool: 'email-tool', secret: SECRET }));

app.post('/execute', (req, res) => {
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
    const { tier: resolvedTier, result } = executeAction(action, params ?? {}, GOG_PATH);
    res.json({
      request_id,
      status: 'success',
      result,
      metadata: { duration_ms: Date.now() - start, action: `email:${action}`, tier: resolvedTier },
    });
  } catch (err) {
    res.json({
      request_id,
      status: 'error',
      result: { error: (err as Error).message },
      metadata: { duration_ms: Date.now() - start, action: `email:${action}`, tier },
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`email-tool listening on port ${PORT}`);
});
