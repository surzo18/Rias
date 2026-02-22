import Database from 'better-sqlite3';
import type { JobRecord, JobStatus } from './types.js';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE NOT NULL,
    request_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    intent TEXT NOT NULL,
    risk_tier TEXT NOT NULL,
    requires_human_approval INTEGER NOT NULL,
    constraints TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

interface JobRow {
  job_id: string;
  idempotency_key: string;
  request_id: string;
  trace_id: string;
  actor_id: string;
  project_id: string;
  intent: string;
  risk_tier: string;
  requires_human_approval: number;
  constraints: string;
  payload: string;
  status: string;
  created_at: string;
}

function rowToRecord(row: JobRow): JobRecord {
  return {
    ...row,
    risk_tier: row.risk_tier as JobRecord['risk_tier'],
    status: row.status as JobStatus,
    requires_human_approval: row.requires_human_approval === 1,
    constraints: JSON.parse(row.constraints) as JobRecord['constraints'],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  };
}

export class JobStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(CREATE_TABLE);
  }

  insert(job: JobRecord): void {
    this.db
      .prepare(
        `INSERT INTO jobs
          (job_id, idempotency_key, request_id, trace_id, actor_id, project_id,
           intent, risk_tier, requires_human_approval, constraints, payload, status, created_at)
         VALUES
          (@job_id, @idempotency_key, @request_id, @trace_id, @actor_id, @project_id,
           @intent, @risk_tier, @requires_human_approval, @constraints, @payload, @status, @created_at)`
      )
      .run({
        ...job,
        requires_human_approval: job.requires_human_approval ? 1 : 0,
        constraints: JSON.stringify(job.constraints),
        payload: JSON.stringify(job.payload),
      });
  }

  findById(jobId: string): JobRecord | null {
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE job_id = ?')
      .get(jobId) as JobRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  findByIdempotencyKey(key: string): JobRecord | null {
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE idempotency_key = ?')
      .get(key) as JobRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  updateStatus(jobId: string, status: JobStatus): void {
    this.db
      .prepare('UPDATE jobs SET status = ? WHERE job_id = ?')
      .run(status, jobId);
  }

  close(): void {
    this.db.close();
  }
}
