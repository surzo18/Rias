import express from 'express';
import Database from 'better-sqlite3';
import { verifyInternalToken } from '../shared/auth.js';
import { createTierGate } from '../shared/tier-gate.js';
import { createAuditMiddleware } from '../shared/audit-middleware.js';
import {
  ACTIONS,
  getActionTier,
  buildApiUrl,
  initWatchlistSchema,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  addAlert,
  getAlerts,
  removeAlert,
} from './actions.js';

const PORT = parseInt(process.env.PORT ?? '9004', 10);
const SECRET = process.env.INTERNAL_SECRET ?? '';
const API_KEY = process.env.ALPHA_VANTAGE_KEY ?? '';
const DB_PATH = process.env.DB_PATH ?? '/data/market.db';
const startTime = Date.now();

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
initWatchlistSchema(db);

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
  tool: 'market-tool',
  secret: SECRET,
  getRequestTier: (action) => getActionTier(action),
}));
app.use('/execute', createAuditMiddleware({ tool: 'market-tool', secret: SECRET }));

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
    let result: Record<string, unknown>;

    switch (action) {
      case 'watchlist': {
        const op = (params as Record<string, unknown>)?.operation as string | undefined;
        const symbol = (params as Record<string, unknown>)?.symbol as string | undefined;

        if (op === 'add' && symbol) {
          addToWatchlist(db, symbol);
          result = { watchlist: getWatchlist(db), added: symbol };
        } else if (op === 'remove' && symbol) {
          removeFromWatchlist(db, symbol);
          result = { watchlist: getWatchlist(db), removed: symbol };
        } else {
          result = { watchlist: getWatchlist(db) };
        }
        break;
      }

      case 'alert_set': {
        const p = params as Record<string, unknown>;
        const id = addAlert(db, {
          symbol: String(p.symbol),
          condition: p.condition as 'above' | 'below',
          price: Number(p.price),
        });
        result = { alert_id: id, alerts: getAlerts(db, String(p.symbol)) };
        break;
      }

      case 'alert_list': {
        const symbol = (params as Record<string, unknown>)?.symbol as string | undefined;
        result = { alerts: getAlerts(db, symbol) };
        break;
      }

      default: {
        // API-backed actions (quote, history, news)
        if (!API_KEY) {
          result = { error: 'ALPHA_VANTAGE_KEY not configured' };
          res.json({
            request_id,
            status: 'error',
            result,
            metadata: { duration_ms: Date.now() - start, action: `market:${action}`, tier },
          });
          return;
        }

        const url = buildApiUrl(action, params ?? {}, API_KEY);
        const response = await fetch(url);
        result = await response.json() as Record<string, unknown>;
        break;
      }
    }

    res.json({
      request_id,
      status: 'success',
      result,
      metadata: { duration_ms: Date.now() - start, action: `market:${action}`, tier },
    });
  } catch (err) {
    res.json({
      request_id,
      status: 'error',
      result: { error: (err as Error).message },
      metadata: { duration_ms: Date.now() - start, action: `market:${action}`, tier },
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`market-tool listening on port ${PORT}`);
});
