import express from 'express';
import Database from 'better-sqlite3';
import { verifyInternalToken } from '../shared/auth.js';
import { initSchema, insertAuditLog, queryAuditLogs, getDailyCosts, updateTelegramSent } from './schema.js';
import { sanitize } from './sanitize.js';
import { createTelegramSender } from './telegram.js';
import { createApprovalRoutes } from './approval-routes.js';
import { checkTimeouts } from '../approval/state-machine.js';

const PORT = parseInt(process.env.PORT ?? '9000', 10);
const DB_PATH = process.env.DB_PATH ?? '/data/audit.db';
const SECRET = process.env.INTERNAL_SECRET ?? '';
const APPROVAL_TIMEOUT_MINUTES = 30;
const TIMEOUT_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
initSchema(db);

const telegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  channelId: process.env.TELEGRAM_LOG_CHANNEL_ID ?? '',
  enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_LOG_CHANNEL_ID),
};

const telegramSender = createTelegramSender(telegramConfig);

const app = express();
app.use(express.json());

const startTime = Date.now();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime_s: Math.floor((Date.now() - startTime) / 1000) });
});

app.use(verifyInternalToken(SECRET));

// Approval routes
app.use('/approvals', createApprovalRoutes(db, {
  telegram: {
    ...telegramConfig,
    chatId: process.env.TELEGRAM_CHAT_ID ?? '',
  },
}));

app.post('/log', (req, res) => {
  try {
    const entry = req.body;
    entry.params = JSON.stringify(sanitize(JSON.parse(entry.params || '{}')));
    insertAuditLog(db, entry);
    res.json({ status: 'ok' });

    // Fire-and-forget Telegram forwarding — does not block the response
    if (telegramSender.enabled) {
      telegramSender.send(entry)
        .then(msgId => {
          if (msgId) updateTelegramSent(db, entry.id, msgId);
        })
        .catch(err => {
          // eslint-disable-next-line no-console
          console.error('Telegram send failed:', (err as Error).message);
        });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', error: (err as Error).message });
  }
});

app.get('/query', (req, res) => {
  const { limit, tier, action } = req.query;
  const logs = queryAuditLogs(db, {
    limit: limit ? parseInt(limit as string, 10) : 100,
    tier: tier as string | undefined,
    action: action as string | undefined,
  });
  res.json(logs);
});

app.get('/costs/:day', (req, res) => {
  const costs = getDailyCosts(db, req.params.day);
  res.json(costs);
});

// Periodic approval timeout check
setInterval(() => {
  try {
    const timedOut = checkTimeouts(db, APPROVAL_TIMEOUT_MINUTES);
    if (timedOut.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`Timed out ${timedOut.length} approval(s): ${timedOut.join(', ')}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Timeout check failed:', (err as Error).message);
  }
}, TIMEOUT_CHECK_INTERVAL_MS);

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`audit-db listening on port ${PORT}`);
});
