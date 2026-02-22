import type Database from 'better-sqlite3';

export function initSchema(db: Database.Database): void {
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      action TEXT NOT NULL,
      tool TEXT,
      tier TEXT NOT NULL,
      params TEXT NOT NULL,
      state TEXT NOT NULL,
      result_summary TEXT,
      error TEXT,
      duration_ms INTEGER,
      llm_provider TEXT,
      tokens_used INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      approval_id TEXT,
      FOREIGN KEY (approval_id) REFERENCES approvals(id)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_tier ON audit_log(tier);
    CREATE INDEX IF NOT EXISTS idx_audit_state ON audit_log(state);
  `);

  // Migration: add Telegram tracking columns (idempotent)
  try {
    db.exec(`ALTER TABLE audit_log ADD COLUMN telegram_sent_at TEXT`);
  } catch {
    // Column already exists — ignore
  }
  try {
    db.exec(`ALTER TABLE audit_log ADD COLUMN telegram_message_id INTEGER`);
  } catch {
    // Column already exists — ignore
  }

  db.exec(`

    CREATE VIEW IF NOT EXISTS daily_costs AS
    SELECT
      date(timestamp) as day,
      llm_provider,
      COUNT(*) as requests,
      SUM(tokens_used) as total_tokens,
      SUM(estimated_cost_usd) as total_cost,
      CAST(AVG(duration_ms) AS INTEGER) as avg_duration
    FROM audit_log
    GROUP BY date(timestamp), llm_provider;

    CREATE VIEW IF NOT EXISTS security_events AS
    SELECT * FROM audit_log
    WHERE tier = 'forbidden' OR state = 'blocked'
    ORDER BY timestamp DESC;
  `);
}

export interface AuditLogRow {
  id: string;
  timestamp: string;
  source: string;
  action: string;
  tool: string | null;
  tier: string;
  params: string;
  state: string;
  result_summary: string | null;
  error: string | null;
  duration_ms: number;
  llm_provider: string | null;
  tokens_used: number;
  estimated_cost_usd: number;
  approval_id: string | null;
  telegram_sent_at: string | null;
  telegram_message_id: number | null;
}

export function insertAuditLog(db: Database.Database, row: AuditLogRow): void {
  db.prepare(`
    INSERT INTO audit_log (id, timestamp, source, action, tool, tier, params, state,
      result_summary, error, duration_ms, llm_provider, tokens_used, estimated_cost_usd, approval_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.timestamp, row.source, row.action, row.tool, row.tier,
    row.params, row.state, row.result_summary, row.error, row.duration_ms,
    row.llm_provider, row.tokens_used, row.estimated_cost_usd, row.approval_id,
  );
}

export function queryAuditLogs(
  db: Database.Database,
  opts: { limit?: number; tier?: string; action?: string },
): AuditLogRow[] {
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params: unknown[] = [];

  if (opts.tier) {
    query += ' AND tier = ?';
    params.push(opts.tier);
  }
  if (opts.action) {
    query += ' AND action = ?';
    params.push(opts.action);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(opts.limit ?? 100);

  return db.prepare(query).all(...params) as AuditLogRow[];
}

interface DailyCostRow {
  day: string;
  llm_provider: string;
  requests: number;
  total_tokens: number;
  total_cost: number;
  avg_duration: number;
}

export function getDailyCosts(db: Database.Database, day: string): DailyCostRow[] {
  return db.prepare('SELECT * FROM daily_costs WHERE day = ?').all(day) as DailyCostRow[];
}

export function updateTelegramSent(
  db: Database.Database,
  id: string,
  messageId: number,
): void {
  db.prepare(
    'UPDATE audit_log SET telegram_sent_at = datetime(\'now\'), telegram_message_id = ? WHERE id = ?',
  ).run(messageId, id);
}
