import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createApproval,
  resolveApproval,
  checkTimeouts,
  getApproval,
} from '../state-machine.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE approvals (
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
  `);
});

afterEach(() => {
  db.close();
});

describe('createApproval', () => {
  it('should create a pending approval', () => {
    const id = createApproval(db, {
      action: 'shell_exec',
      tier: 'dangerous',
      params: '{"command":"dir"}',
      reason: 'List files',
    });

    const record = getApproval(db, id);
    expect(record).not.toBeNull();
    expect(record!.state).toBe('pending');
    expect(record!.action).toBe('shell_exec');
  });
});

describe('resolveApproval', () => {
  it('should transition pending -> approved', () => {
    const id = createApproval(db, {
      action: 'shell_exec',
      tier: 'dangerous',
      params: '{}',
      reason: null,
    });

    resolveApproval(db, id, 'approved', 'user');
    const record = getApproval(db, id);
    expect(record!.state).toBe('approved');
    expect(record!.resolved_by).toBe('user');
  });

  it('should transition pending -> rejected', () => {
    const id = createApproval(db, {
      action: 'shell_exec',
      tier: 'dangerous',
      params: '{}',
      reason: null,
    });

    resolveApproval(db, id, 'rejected', 'user');
    expect(getApproval(db, id)!.state).toBe('rejected');
  });

  it('should reject invalid transitions', () => {
    const id = createApproval(db, {
      action: 'shell_exec',
      tier: 'dangerous',
      params: '{}',
      reason: null,
    });

    resolveApproval(db, id, 'approved', 'user');
    expect(() => resolveApproval(db, id, 'pending', 'system')).toThrow('Invalid state transition');
  });

  it('should reject transition from rejected', () => {
    const id = createApproval(db, {
      action: 'shell_exec',
      tier: 'dangerous',
      params: '{}',
      reason: null,
    });

    resolveApproval(db, id, 'rejected', 'user');
    expect(() => resolveApproval(db, id, 'approved', 'user')).toThrow('Invalid state transition');
  });
});

describe('checkTimeouts', () => {
  it('should timeout old pending approvals', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T10:00:00Z'));

    const id = createApproval(db, {
      action: 'shell_exec',
      tier: 'dangerous',
      params: '{}',
      reason: null,
    });

    vi.setSystemTime(new Date('2026-02-15T10:31:00Z')); // 31 min later
    const timedOut = checkTimeouts(db, 30);
    expect(timedOut).toContain(id);
    expect(getApproval(db, id)!.state).toBe('timed_out');

    vi.useRealTimers();
  });

  it('should not timeout recent approvals', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T10:00:00Z'));

    createApproval(db, {
      action: 'shell_exec',
      tier: 'dangerous',
      params: '{}',
      reason: null,
    });

    vi.setSystemTime(new Date('2026-02-15T10:15:00Z')); // 15 min later
    const timedOut = checkTimeouts(db, 30);
    expect(timedOut).toHaveLength(0);

    vi.useRealTimers();
  });
});
