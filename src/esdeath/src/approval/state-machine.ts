import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import type { ApprovalRecord, ApprovalState } from '../shared/types.js';

const VALID_TRANSITIONS: Record<string, ApprovalState[]> = {
  pending: ['approved', 'rejected', 'timed_out'],
  approved: ['executing'],
  executing: ['success', 'failed'],
  // Terminal states: rejected, timed_out, success, failed
};

interface CreateApprovalInput {
  action: string;
  tier: string;
  params: string;
  reason: string | null;
}

export function createApproval(db: Database.Database, input: CreateApprovalInput): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO approvals (id, action, tier, params, reason, state, requested_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, input.action, input.tier, input.params, input.reason, new Date().toISOString());
  return id;
}

export function getApproval(db: Database.Database, id: string): ApprovalRecord | null {
  return (db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRecord) ?? null;
}

export function resolveApproval(
  db: Database.Database,
  id: string,
  newState: ApprovalState,
  resolvedBy: string,
): void {
  const record = getApproval(db, id);
  if (!record) throw new Error(`Approval ${id} not found`);

  const allowed = VALID_TRANSITIONS[record.state];
  if (!allowed || !allowed.includes(newState)) {
    throw new Error(`Invalid state transition: ${record.state} -> ${newState}`);
  }

  db.prepare(`
    UPDATE approvals SET state = ?, resolved_at = ?, resolved_by = ? WHERE id = ?
  `).run(newState, new Date().toISOString(), resolvedBy, id);
}

export function checkTimeouts(db: Database.Database, timeoutMinutes: number): string[] {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  const pending = db.prepare(
    "SELECT id FROM approvals WHERE state = 'pending' AND requested_at < ?",
  ).all(cutoff) as { id: string }[];

  const ids: string[] = [];
  for (const { id } of pending) {
    db.prepare(`
      UPDATE approvals SET state = 'timed_out', resolved_at = ?, resolved_by = 'timeout' WHERE id = ?
    `).run(new Date().toISOString(), id);
    ids.push(id);
  }
  return ids;
}
