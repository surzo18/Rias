import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createApproval, getApproval, resolveApproval } from '../approval/state-machine.js';
import type { ApprovalState } from '../shared/types.js';
import { sendToChannel, type TelegramConfig } from './telegram.js';

interface ApprovalRoutesConfig {
  telegram: TelegramConfig & { chatId: string };
}

export function createApprovalRoutes(db: Database.Database, config: ApprovalRoutesConfig): Router {
  const router = Router();

  // POST /approvals — create a new approval request
  router.post('/', (req, res) => {
    try {
      const { action, tier, params, reason, timeout_minutes } = req.body as {
        action: string;
        tier: string;
        params: string;
        reason: string | null;
        timeout_minutes?: number;
      };

      const id = createApproval(db, { action, tier, params, reason });

      // Fire-and-forget Telegram notification to Adrian's chat
      if (config.telegram.enabled && config.telegram.chatId) {
        const paramsSummary = summarizeParams(params);
        const text = [
          `\u{1F534} APPROVAL REQUIRED`,
          ``,
          `Action: ${action}`,
          paramsSummary ? `Params: ${paramsSummary}` : null,
          reason ? `Reason: ${reason}` : null,
          `Timeout: ${timeout_minutes ?? 30} min`,
          ``,
          `Approval ID: \`${id}\``,
        ].filter(Boolean).join('\n');

        sendToChannel(
          { ...config.telegram, channelId: config.telegram.chatId },
          text,
        ).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Approval notification failed:', (err as Error).message);
        });
      }

      res.json({ id, state: 'pending' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /approvals/:id — get approval state
  router.get('/:id', (req, res) => {
    const record = getApproval(db, req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Approval not found' });
      return;
    }
    res.json(record);
  });

  // POST /approvals/:id/resolve — approve or reject
  router.post('/:id/resolve', (req, res) => {
    try {
      const { state, resolved_by } = req.body as {
        state: ApprovalState;
        resolved_by: string;
      };

      resolveApproval(db, req.params.id, state, resolved_by);
      const record = getApproval(db, req.params.id);
      res.json(record);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}

function summarizeParams(params: string): string | null {
  try {
    const parsed = JSON.parse(params);
    const str = JSON.stringify(parsed);
    if (str.length > 150) return str.slice(0, 147) + '...';
    return str;
  } catch {
    return null;
  }
}
