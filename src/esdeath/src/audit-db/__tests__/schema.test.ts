import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema, insertAuditLog, queryAuditLogs, getDailyCosts, updateTelegramSent } from '../schema.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  initSchema(db);
});

afterEach(() => {
  db.close();
});

describe('audit schema', () => {
  it('should create tables and views', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('audit_log');
    expect(names).toContain('approvals');
  });

  it('should insert and query audit log', () => {
    insertAuditLog(db, {
      id: 'test-1',
      timestamp: '2026-02-15T10:00:00Z',
      source: 'user',
      action: 'chat',
      tool: null,
      tier: 'safe',
      params: '{}',
      state: 'success',
      result_summary: 'responded',
      error: null,
      duration_ms: 100,
      llm_provider: 'ollama/qwen3-8b',
      tokens_used: 500,
      estimated_cost_usd: 0,
      approval_id: null,
    });

    const logs = queryAuditLogs(db, { limit: 10 });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('chat');
  });

  it('should calculate daily costs', () => {
    insertAuditLog(db, {
      id: 'test-1',
      timestamp: '2026-02-15T10:00:00Z',
      source: 'user',
      action: 'chat',
      tool: null,
      tier: 'safe',
      params: '{}',
      state: 'success',
      result_summary: 'ok',
      error: null,
      duration_ms: 100,
      llm_provider: 'openai/gpt-5.2',
      tokens_used: 1000,
      estimated_cost_usd: 0.005,
      approval_id: null,
    });
    insertAuditLog(db, {
      id: 'test-2',
      timestamp: '2026-02-15T11:00:00Z',
      source: 'user',
      action: 'summarize',
      tool: null,
      tier: 'safe',
      params: '{}',
      state: 'success',
      result_summary: 'ok',
      error: null,
      duration_ms: 200,
      llm_provider: 'openai/gpt-5.2',
      tokens_used: 2000,
      estimated_cost_usd: 0.01,
      approval_id: null,
    });

    const costs = getDailyCosts(db, '2026-02-15');
    expect(costs).toHaveLength(1);
    expect(costs[0].total_cost).toBeCloseTo(0.015);
    expect(costs[0].total_tokens).toBe(3000);
  });

  it('should filter by tier', () => {
    insertAuditLog(db, {
      id: 'a1', timestamp: '2026-02-15T10:00:00Z', source: 'user',
      action: 'chat', tool: null, tier: 'safe', params: '{}',
      state: 'success', result_summary: 'ok', error: null,
      duration_ms: 100, llm_provider: null, tokens_used: 0,
      estimated_cost_usd: 0, approval_id: null,
    });
    insertAuditLog(db, {
      id: 'a2', timestamp: '2026-02-15T10:01:00Z', source: 'user',
      action: 'shell_exec', tool: 'shell', tier: 'dangerous', params: '{}',
      state: 'success', result_summary: 'ok', error: null,
      duration_ms: 200, llm_provider: null, tokens_used: 0,
      estimated_cost_usd: 0, approval_id: null,
    });

    const safe = queryAuditLogs(db, { tier: 'safe' });
    expect(safe).toHaveLength(1);
    expect(safe[0].action).toBe('chat');

    const dangerous = queryAuditLogs(db, { tier: 'dangerous' });
    expect(dangerous).toHaveLength(1);
    expect(dangerous[0].action).toBe('shell_exec');
  });

  it('should respect limit', () => {
    for (let i = 0; i < 10; i++) {
      insertAuditLog(db, {
        id: `bulk-${i}`, timestamp: `2026-02-15T10:0${i}:00Z`, source: 'user',
        action: 'chat', tool: null, tier: 'safe', params: '{}',
        state: 'success', result_summary: 'ok', error: null,
        duration_ms: 100, llm_provider: null, tokens_used: 0,
        estimated_cost_usd: 0, approval_id: null,
      });
    }

    const limited = queryAuditLogs(db, { limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('should have telegram tracking columns after migration', () => {
    const columns = db
      .prepare('PRAGMA table_info(audit_log)')
      .all() as { name: string }[];
    const names = columns.map((c) => c.name);
    expect(names).toContain('telegram_sent_at');
    expect(names).toContain('telegram_message_id');
  });

  it('should update telegram tracking via updateTelegramSent', () => {
    insertAuditLog(db, {
      id: 'tg-1', timestamp: '2026-02-15T10:00:00Z', source: 'user',
      action: 'chat', tool: null, tier: 'safe', params: '{}',
      state: 'success', result_summary: 'ok', error: null,
      duration_ms: 100, llm_provider: null, tokens_used: 0,
      estimated_cost_usd: 0, approval_id: null,
    });

    updateTelegramSent(db, 'tg-1', 42);

    const row = db.prepare('SELECT telegram_sent_at, telegram_message_id FROM audit_log WHERE id = ?')
      .get('tg-1') as { telegram_sent_at: string; telegram_message_id: number };
    expect(row.telegram_message_id).toBe(42);
    expect(row.telegram_sent_at).toBeTruthy();
  });
});
