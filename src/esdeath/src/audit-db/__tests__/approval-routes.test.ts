import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import http from 'node:http';
import { createApprovalRoutes } from '../approval-routes.js';
import { getApproval, resolveApproval } from '../../approval/state-machine.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    tier TEXT NOT NULL,
    params TEXT NOT NULL,
    reason TEXT,
    state TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    execution_result TEXT,
    error TEXT
  );
`;

function createTestApp(db: Database.Database, telegramEnabled = false) {
  const app = express();
  app.use(express.json());

  const router = createApprovalRoutes(db, {
    telegram: {
      botToken: 'test-bot-token',
      channelId: 'test-channel',
      chatId: 'test-chat',
      enabled: telegramEnabled,
    },
  });

  app.use('/approvals', router);
  return app;
}

async function request(
  app: express.Express,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const server = http.createServer(app);

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;

      const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);

      fetch(url, opts)
        .then(async (r) => {
          const json = await r.json() as Record<string, unknown>;
          server.close();
          resolve({ status: r.status, body: json });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe('approval-routes', () => {
  let db: Database.Database;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    db.close();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('POST /approvals', () => {
    it('should create a pending approval', async () => {
      const app = createTestApp(db);

      const res = await request(app, 'POST', '/approvals', {
        action: 'email:send_email',
        tier: 'dangerous',
        params: '{"to":"test@example.com"}',
        reason: 'Sending test email',
      });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('pending');
      expect(res.body.id).toBeDefined();

      const record = getApproval(db, res.body.id as string);
      expect(record).not.toBeNull();
      expect(record!.state).toBe('pending');
      expect(record!.action).toBe('email:send_email');
    });

    it('should send Telegram notification when enabled', async () => {
      fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { message_id: 42 } }),
      });

      const realFetch = originalFetch;
      // Replace global fetch but only intercept Telegram calls
      globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
        const url = String(args[0]);
        if (url.includes('api.telegram.org')) return fetchSpy(...args);
        return realFetch(...args);
      }) as typeof fetch;

      const app = createTestApp(db, true);

      const res = await request(app, 'POST', '/approvals', {
        action: 'shell:del',
        tier: 'dangerous',
        params: '{"command":"del","args":["/mnt/downloads/test.txt"]}',
        reason: 'Deleting test file',
        timeout_minutes: 10,
      });

      expect(res.status).toBe(200);

      // Wait for fire-and-forget Telegram call
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('api.telegram.org/bottest-bot-token/sendMessage');
      const body = JSON.parse(opts.body as string) as { chat_id: string; text: string };
      expect(body.chat_id).toBe('test-chat');
      expect(body.text).toContain('APPROVAL REQUIRED');
      expect(body.text).toContain('shell:del');
    });
  });

  describe('GET /approvals/:id', () => {
    it('should return approval record', async () => {
      const app = createTestApp(db);

      const create = await request(app, 'POST', '/approvals', {
        action: 'test:action',
        tier: 'dangerous',
        params: '{}',
        reason: null,
      });

      const res = await request(app, 'GET', `/approvals/${create.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(create.body.id);
      expect(res.body.state).toBe('pending');
    });

    it('should return 404 for unknown id', async () => {
      const app = createTestApp(db);
      const res = await request(app, 'GET', '/approvals/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /approvals/:id/resolve', () => {
    it('should resolve pending to approved', async () => {
      const app = createTestApp(db);

      const create = await request(app, 'POST', '/approvals', {
        action: 'test:action',
        tier: 'dangerous',
        params: '{}',
        reason: null,
      });

      const res = await request(app, 'POST', `/approvals/${create.body.id}/resolve`, {
        state: 'approved',
        resolved_by: 'Adrian',
      });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('approved');
      expect(res.body.resolved_by).toBe('Adrian');
    });

    it('should resolve pending to rejected', async () => {
      const app = createTestApp(db);

      const create = await request(app, 'POST', '/approvals', {
        action: 'test:action',
        tier: 'dangerous',
        params: '{}',
        reason: null,
      });

      const res = await request(app, 'POST', `/approvals/${create.body.id}/resolve`, {
        state: 'rejected',
        resolved_by: 'Adrian',
      });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('rejected');
    });

    it('should reject invalid transitions', async () => {
      const app = createTestApp(db);

      const create = await request(app, 'POST', '/approvals', {
        action: 'test:action',
        tier: 'dangerous',
        params: '{}',
        reason: null,
      });

      // Reject first
      await request(app, 'POST', `/approvals/${create.body.id}/resolve`, {
        state: 'rejected',
        resolved_by: 'Adrian',
      });

      // Try to approve a rejected approval
      const res = await request(app, 'POST', `/approvals/${create.body.id}/resolve`, {
        state: 'approved',
        resolved_by: 'Adrian',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid state transition');
    });

    it('should transition approved to executing', async () => {
      const app = createTestApp(db);

      const create = await request(app, 'POST', '/approvals', {
        action: 'test:action',
        tier: 'dangerous',
        params: '{}',
        reason: null,
      });

      // Approve via state machine directly
      resolveApproval(db, create.body.id as string, 'approved', 'Adrian');

      // Transition to executing via HTTP
      const res = await request(app, 'POST', `/approvals/${create.body.id}/resolve`, {
        state: 'executing',
        resolved_by: 'shell-sandbox',
      });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('executing');
    });
  });
});
