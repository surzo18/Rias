# Esdeath v2 Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a sandboxed, multi-LLM personal AI assistant platform on top of OpenClaw with tiered approval, audit logging, and tool containers for shell, email, web, memory, fitness, and market data.

**Architecture:** OpenClaw gateway is the brain (unmodified). New OpenClaw skills provide intelligence. New Docker containers provide isolated tool execution. All inter-container communication via HTTP on internal Docker network. Security: least-privilege, per-container network policies, no shared credentials.

**Tech Stack:** TypeScript/Node.js, Vitest, SQLite (better-sqlite3), Docker Compose, Ollama, Puppeteer, OpenClaw skills (Markdown)

**Design doc:** `docs/plans/2026-02-15-esdeath-v2-platform-design.md`

---

## Phase 1: Project Scaffolding + Core Infrastructure

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.workspace.ts`
- Create: `src/shared/types.ts`
- Create: `src/shared/auth.ts`
- Create: `.env.example` (update existing)

**Step 1: Initialize Node.js project**

```bash
cd D:/REPOS/tools/esdeath
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install express better-sqlite3 uuid jsonwebtoken
npm install -D typescript vitest @types/node @types/express @types/better-sqlite3 @types/jsonwebtoken @vitest/coverage-v8
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/__tests__/**"]
}
```

**Step 4: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/__tests__/**", "**/*.test.ts"]
}
```

**Step 5: Create vitest.workspace.ts**

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['src/**/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node',
      testTimeout: 30000,
    },
  },
  {
    test: {
      name: 'e2e',
      include: ['tests/e2e/**/*.test.ts'],
      environment: 'node',
      testTimeout: 60000,
    },
  },
]);
```

**Step 6: Create shared types**

Create `src/shared/types.ts`:

```typescript
export type Tier = 'safe' | 'notice' | 'dangerous' | 'forbidden';

export type ApprovalState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'timed_out'
  | 'executing'
  | 'success'
  | 'failed';

export interface ToolRequest {
  request_id: string;
  action: string;
  params: Record<string, unknown>;
  timeout_ms?: number;
}

export interface ToolResponse {
  request_id: string;
  status: 'success' | 'error';
  result: Record<string, unknown>;
  metadata: {
    duration_ms: number;
    action: string;
    tier: Tier;
  };
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  source: 'user' | 'cron' | 'heartbeat' | 'system';
  action: string;
  tool: string | null;
  tier: Tier;
  params: Record<string, unknown>;
  state: 'success' | 'failed' | 'blocked' | 'pending' | 'timeout';
  result_summary: string;
  error: string | null;
  duration_ms: number;
  llm_provider: string | null;
  tokens_used: number;
  estimated_cost_usd: number;
  approval_id: string | null;
}

export interface ApprovalRecord {
  id: string;
  action: string;
  tier: Tier;
  params: string;
  reason: string | null;
  state: ApprovalState;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  execution_result: string | null;
  error: string | null;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  uptime_s: number;
}
```

**Step 7: Create shared auth utility**

Create `src/shared/auth.ts`:

```typescript
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export function verifyInternalToken(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization header' });
      return;
    }

    const token = header.slice(7);
    try {
      jwt.verify(token, secret);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

export function generateInternalToken(secret: string): string {
  return jwt.sign({ iss: 'esdeath-gateway', iat: Math.floor(Date.now() / 1000) }, secret, {
    expiresIn: '24h',
  });
}
```

**Step 8: Update .env.example with new variables**

Append to existing `.env.example`:

```env

# === Esdeath v2 Platform ===

# Claude API (LLM fallback)
ANTHROPIC_API_KEY=

# Audit logging
TELEGRAM_LOG_CHANNEL_ID=

# Inter-container auth (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
TOOL_INTERNAL_SECRET=

# Stock market (free tier)
ALPHA_VANTAGE_KEY=

# Budget
DAILY_BUDGET_USD=1.00
```

**Step 9: Add scripts to package.json**

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:e2e": "vitest run --project e2e",
    "test:watch": "vitest --project unit",
    "test:coverage": "vitest run --project unit --coverage"
  }
}
```

**Step 10: Commit**

```bash
git add package.json tsconfig.json tsconfig.build.json vitest.workspace.ts src/shared/ .env.example
git commit -m "chore: scaffold Esdeath v2 project (TS, Vitest, shared types)"
```

---

### Task 2: Audit DB container

**Files:**
- Create: `src/audit-db/server.ts`
- Create: `src/audit-db/schema.ts`
- Create: `src/audit-db/sanitize.ts`
- Create: `src/audit-db/__tests__/schema.test.ts`
- Create: `src/audit-db/__tests__/sanitize.test.ts`
- Create: `scripts/audit-db/Dockerfile`

**Step 1: Write failing tests for sanitization**

Create `src/audit-db/__tests__/sanitize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sanitize } from '../sanitize.js';

describe('sanitize', () => {
  it('should pass through safe values', () => {
    const result = sanitize({ name: 'test', count: 42 });
    expect(result).toEqual({ name: 'test', count: 42 });
  });

  it('should redact fields named password/token/secret/api_key', () => {
    const result = sanitize({
      password: 'hunter2',
      token: 'abc123',
      api_key: 'sk-xyz',
      secret: 'mysecret',
      name: 'safe',
    });
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.api_key).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.name).toBe('safe');
  });

  it('should redact nested sensitive fields', () => {
    const result = sanitize({
      config: { password: 'hunter2', host: 'localhost' },
    });
    expect((result.config as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((result.config as Record<string, unknown>).host).toBe('localhost');
  });

  it('should redact OpenAI key patterns in string values', () => {
    const result = sanitize({
      note: 'Key is sk-proj-abc123def456ghi789jkl012',
    });
    expect(result.note).toContain('[REDACTED]');
    expect(result.note).not.toContain('sk-proj');
  });

  it('should redact GitHub token patterns', () => {
    const result = sanitize({ token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' });
    expect(result.token).toBe('[REDACTED]');
  });

  it('should redact 16-digit card-like numbers', () => {
    const result = sanitize({ note: 'Card 4111111111111111 end' });
    expect(result.note).not.toContain('4111111111111111');
    expect(result.note).toContain('[REDACTED]');
  });

  it('should handle arrays', () => {
    const result = sanitize({ items: ['safe', 'sk-proj-secret123456789012'] });
    const items = result.items as string[];
    expect(items[0]).toBe('safe');
    expect(items[1]).toContain('[REDACTED]');
  });

  it('should handle null and undefined', () => {
    const result = sanitize({ a: null, b: undefined });
    expect(result.a).toBeNull();
    expect(result.b).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run --project unit src/audit-db/__tests__/sanitize.test.ts
```

Expected: FAIL (module not found)

**Step 3: Implement sanitize.ts**

Create `src/audit-db/sanitize.ts`:

```typescript
const SENSITIVE_FIELDS = new Set([
  'password', 'token', 'secret', 'api_key', 'apikey',
  'authorization', 'cookie', 'session_id', 'sessionid',
  'credit_card', 'creditcard', 'ssn', 'oauth_token',
  'private_key', 'privatekey',
]);

const SENSITIVE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9_-]{20,}/g,      // OpenAI keys
  /ghp_[a-zA-Z0-9]{36}/g,         // GitHub tokens
  /gho_[a-zA-Z0-9]{36}/g,         // GitHub OAuth tokens
  /\b\d{16}\b/g,                   // 16-digit numbers (cards)
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, // JWTs
];

const REDACTED = '[REDACTED]';

function redactString(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (SENSITIVE_FIELDS.has(key.toLowerCase())) return REDACTED;

  if (typeof value === 'string') return redactString(value);

  if (Array.isArray(value)) {
    return value.map((item, i) => sanitizeValue(String(i), item));
  }

  if (typeof value === 'object') {
    return sanitize(value as Record<string, unknown>);
  }

  return value;
}

export function sanitize(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] = sanitizeValue(key, value);
  }
  return result;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run --project unit src/audit-db/__tests__/sanitize.test.ts
```

Expected: ALL PASS

**Step 5: Write failing tests for schema**

Create `src/audit-db/__tests__/schema.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema, insertAuditLog, queryAuditLogs, getDailyCosts } from '../schema.js';

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
});
```

**Step 6: Run tests to verify they fail**

```bash
npx vitest run --project unit src/audit-db/__tests__/schema.test.ts
```

Expected: FAIL (module not found)

**Step 7: Implement schema.ts**

Create `src/audit-db/schema.ts`:

```typescript
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

interface AuditLogRow {
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
```

**Step 8: Run tests to verify they pass**

```bash
npx vitest run --project unit src/audit-db/__tests__/
```

Expected: ALL PASS

**Step 9: Create audit-db HTTP server**

Create `src/audit-db/server.ts`:

```typescript
import express from 'express';
import Database from 'better-sqlite3';
import { verifyInternalToken } from '../shared/auth.js';
import { initSchema, insertAuditLog, queryAuditLogs, getDailyCosts } from './schema.js';
import { sanitize } from './sanitize.js';

const PORT = parseInt(process.env.PORT ?? '9000', 10);
const DB_PATH = process.env.DB_PATH ?? '/data/audit.db';
const SECRET = process.env.INTERNAL_SECRET ?? '';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
initSchema(db);

const app = express();
app.use(express.json());
app.use(verifyInternalToken(SECRET));

const startTime = Date.now();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime_s: Math.floor((Date.now() - startTime) / 1000) });
});

app.post('/log', (req, res) => {
  try {
    const entry = req.body;
    entry.params = JSON.stringify(sanitize(JSON.parse(entry.params || '{}')));
    insertAuditLog(db, entry);
    res.json({ status: 'ok' });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`audit-db listening on port ${PORT}`);
});
```

**Step 10: Create Dockerfile**

Create `scripts/audit-db/Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY ../../package.json ../../package-lock.json ./
RUN npm ci --omit=dev

COPY ../../dist/audit-db/ ./dist/audit-db/
COPY ../../dist/shared/ ./dist/shared/

RUN mkdir -p /data && chown 1000:1000 /data

USER 1000:1000

EXPOSE 9000

CMD ["node", "dist/audit-db/server.js"]
```

**Step 11: Commit**

```bash
git add src/audit-db/ scripts/audit-db/
git commit -m "feat: add audit-db container with sanitization and schema"
```

---

### Task 3: Approval engine

**Files:**
- Create: `src/approval/__tests__/tier.test.ts`
- Create: `src/approval/__tests__/state-machine.test.ts`
- Create: `src/approval/__tests__/rate-limit.test.ts`
- Create: `src/approval/tier.ts`
- Create: `src/approval/state-machine.ts`
- Create: `src/approval/rate-limit.ts`
- Create: `src/approval/config.ts`
- Create: `config/approval-config.json`

**Step 1: Write failing tier classification tests**

Create `src/approval/__tests__/tier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyTier, loadTierConfig } from '../tier.js';

const config = loadTierConfig({
  tiers: {
    safe: { actions: ['chat', 'weather', 'memory_read', 'summarize', 'fitness_read'] },
    notice: { actions: ['email_read', 'calendar_read', 'web_search', 'market_read', 'github_read'] },
    dangerous: { actions: ['shell_exec', 'email_send', 'file_write', 'file_delete', 'calendar_create'] },
    forbidden: { actions: ['env_access', 'config_write', 'docker_exec', 'credential_access', 'network_change'] },
  },
  defaults: { unknown_action: 'dangerous' },
});

describe('classifyTier', () => {
  it('should classify safe actions', () => {
    expect(classifyTier('chat', config)).toBe('safe');
    expect(classifyTier('weather', config)).toBe('safe');
    expect(classifyTier('memory_read', config)).toBe('safe');
  });

  it('should classify notice actions', () => {
    expect(classifyTier('email_read', config)).toBe('notice');
    expect(classifyTier('web_search', config)).toBe('notice');
  });

  it('should classify dangerous actions', () => {
    expect(classifyTier('shell_exec', config)).toBe('dangerous');
    expect(classifyTier('email_send', config)).toBe('dangerous');
  });

  it('should classify forbidden actions', () => {
    expect(classifyTier('env_access', config)).toBe('forbidden');
    expect(classifyTier('docker_exec', config)).toBe('forbidden');
  });

  it('should classify unknown actions as dangerous (default)', () => {
    expect(classifyTier('something_new', config)).toBe('dangerous');
  });

  it('should be case-insensitive', () => {
    expect(classifyTier('CHAT', config)).toBe('safe');
    expect(classifyTier('Shell_Exec', config)).toBe('dangerous');
  });
});
```

**Step 2: Run test - verify fail**

```bash
npx vitest run --project unit src/approval/__tests__/tier.test.ts
```

**Step 3: Implement tier.ts**

Create `src/approval/tier.ts`:

```typescript
import type { Tier } from '../shared/types.js';

export interface TierConfig {
  actionMap: Map<string, Tier>;
  defaultTier: Tier;
}

interface RawTierConfig {
  tiers: Record<string, { actions: string[] }>;
  defaults: { unknown_action: string };
}

export function loadTierConfig(raw: RawTierConfig): TierConfig {
  const actionMap = new Map<string, Tier>();
  for (const [tier, def] of Object.entries(raw.tiers)) {
    for (const action of def.actions) {
      actionMap.set(action.toLowerCase(), tier as Tier);
    }
  }
  return {
    actionMap,
    defaultTier: (raw.defaults.unknown_action as Tier) ?? 'dangerous',
  };
}

export function classifyTier(action: string, config: TierConfig): Tier {
  return config.actionMap.get(action.toLowerCase()) ?? config.defaultTier;
}
```

**Step 4: Run test - verify pass**

```bash
npx vitest run --project unit src/approval/__tests__/tier.test.ts
```

**Step 5: Write failing state machine tests**

Create `src/approval/__tests__/state-machine.test.ts`:

```typescript
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
  it('should transition pending → approved', () => {
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

  it('should transition pending → rejected', () => {
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
```

**Step 6: Run test - verify fail**

```bash
npx vitest run --project unit src/approval/__tests__/state-machine.test.ts
```

**Step 7: Implement state-machine.ts**

Create `src/approval/state-machine.ts`:

```typescript
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
    throw new Error(`Invalid state transition: ${record.state} → ${newState}`);
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
```

**Step 8: Run test - verify pass**

```bash
npx vitest run --project unit src/approval/__tests__/state-machine.test.ts
```

**Step 9: Write rate limiter tests, implement, verify**

Create `src/approval/__tests__/rate-limit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../rate-limit.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T10:00:00Z'));
    limiter = new RateLimiter(5, 60 * 60 * 1000); // 5 per hour
  });

  it('should allow requests within limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryAcquire()).toBe(true);
    }
  });

  it('should reject requests over limit', () => {
    for (let i = 0; i < 5; i++) limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('should reset after window expires', () => {
    for (let i = 0; i < 5; i++) limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1); // 1 hour later
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('should report remaining capacity', () => {
    expect(limiter.remaining()).toBe(5);
    limiter.tryAcquire();
    expect(limiter.remaining()).toBe(4);
  });
});
```

Create `src/approval/rate-limit.ts`:

```typescript
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  tryAcquire(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) return false;
    this.timestamps.push(now);
    return true;
  }

  remaining(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }
}
```

**Step 10: Run all approval tests**

```bash
npx vitest run --project unit src/approval/__tests__/
```

Expected: ALL PASS

**Step 11: Create approval config**

Create `config/approval-config.json`:

```json
{
  "tiers": {
    "safe": {
      "actions": ["chat", "weather", "memory_read", "summarize", "fitness_read", "habit_read"],
      "behavior": "auto_execute",
      "notify": false
    },
    "notice": {
      "actions": ["email_read", "calendar_read", "web_search", "market_read", "github_read", "file_read", "system_info"],
      "behavior": "auto_execute",
      "notify": true
    },
    "dangerous": {
      "actions": ["shell_exec", "email_send", "email_delete", "file_write", "file_delete", "calendar_create", "alert_set"],
      "behavior": "require_approval",
      "timeout_minutes": 30,
      "max_retries": 1
    },
    "forbidden": {
      "actions": ["env_access", "config_write", "docker_exec", "credential_access", "network_change"],
      "behavior": "always_reject",
      "alert": true
    }
  },
  "defaults": {
    "unknown_action": "dangerous",
    "offline_policy": "queue"
  },
  "rate_limits": {
    "dangerous_per_hour": 5
  }
}
```

**Step 12: Commit**

```bash
git add src/approval/ config/approval-config.json
git commit -m "feat: add approval engine with tier classification, state machine, rate limiting"
```

---

### Task 4: Shell sandbox container

**Files:**
- Create: `src/shell-sandbox/__tests__/allowlist.test.ts`
- Create: `src/shell-sandbox/__tests__/validator.test.ts`
- Create: `src/shell-sandbox/allowlist.ts`
- Create: `src/shell-sandbox/validator.ts`
- Create: `src/shell-sandbox/server.ts`
- Create: `scripts/shell-sandbox/Dockerfile`

**Step 1: Write failing allowlist tests**

Create `src/shell-sandbox/__tests__/allowlist.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ALLOWLIST, isAllowed, getTier } from '../allowlist.js';

describe('Shell Allowlist', () => {
  it('should allow whitelisted read-only commands', () => {
    expect(isAllowed('hostname')).toBe(true);
    expect(isAllowed('systeminfo')).toBe(true);
    expect(isAllowed('tasklist')).toBe(true);
  });

  it('should allow case-insensitive', () => {
    expect(isAllowed('HOSTNAME')).toBe(true);
    expect(isAllowed('SystemInfo')).toBe(true);
  });

  it('should reject unknown commands', () => {
    expect(isAllowed('powershell')).toBe(false);
    expect(isAllowed('cmd')).toBe(false);
    expect(isAllowed('rm')).toBe(false);
    expect(isAllowed('format')).toBe(false);
    expect(isAllowed('net')).toBe(false);
    expect(isAllowed('reg')).toBe(false);
  });

  it('should return correct tier', () => {
    expect(getTier('hostname')).toBe('safe');
    expect(getTier('systeminfo')).toBe('notice');
    expect(getTier('dir')).toBe('notice');
    expect(getTier('del')).toBe('dangerous');
    expect(getTier('start')).toBe('dangerous');
    expect(getTier('unknown')).toBeNull();
  });
});
```

**Step 2: Run test - verify fail**

**Step 3: Implement allowlist.ts**

Create `src/shell-sandbox/allowlist.ts`:

```typescript
import type { Tier } from '../shared/types.js';

interface CommandDef {
  tier: Tier;
  allowArgs: boolean;
  timeout: number;
  allowedPaths?: string[];
  allowedApps?: string[];
  maxCount?: number;
}

export const ALLOWLIST: Record<string, CommandDef> = {
  hostname:   { tier: 'safe',      allowArgs: false, timeout: 2000 },
  whoami:     { tier: 'safe',      allowArgs: false, timeout: 2000 },
  systeminfo: { tier: 'notice',    allowArgs: false, timeout: 10000 },
  tasklist:   { tier: 'notice',    allowArgs: false, timeout: 5000 },
  dir:        { tier: 'notice',    allowArgs: true,  timeout: 5000,
                allowedPaths: ['/mnt/documents', '/mnt/downloads'] },
  type:       { tier: 'notice',    allowArgs: true,  timeout: 5000,
                allowedPaths: ['/mnt/documents', '/mnt/downloads'] },
  copy:       { tier: 'dangerous', allowArgs: true,  timeout: 30000,
                allowedPaths: ['/mnt/downloads'] },
  move:       { tier: 'dangerous', allowArgs: true,  timeout: 30000,
                allowedPaths: ['/mnt/downloads'] },
  del:        { tier: 'dangerous', allowArgs: true,  timeout: 10000,
                allowedPaths: ['/mnt/downloads'] },
  mkdir:      { tier: 'dangerous', allowArgs: true,  timeout: 5000,
                allowedPaths: ['/mnt/downloads'] },
  start:      { tier: 'dangerous', allowArgs: true,  timeout: 10000,
                allowedApps: ['notepad', 'calc', 'explorer'] },
  ping:       { tier: 'notice',    allowArgs: true,  timeout: 10000,
                maxCount: 4 },
};

export function isAllowed(command: string): boolean {
  return command.toLowerCase() in ALLOWLIST;
}

export function getTier(command: string): Tier | null {
  const def = ALLOWLIST[command.toLowerCase()];
  return def?.tier ?? null;
}

export function getDef(command: string): CommandDef | null {
  return ALLOWLIST[command.toLowerCase()] ?? null;
}
```

**Step 4: Run test - verify pass**

**Step 5: Write failing validator tests (injection protection)**

Create `src/shell-sandbox/__tests__/validator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateArgs, validatePath } from '../validator.js';

describe('validateArgs', () => {
  it('should pass clean args', () => {
    expect(() => validateArgs(['C:\\Users'])).not.toThrow();
    expect(() => validateArgs(['test.txt'])).not.toThrow();
    expect(() => validateArgs(['-l'])).not.toThrow();
  });

  it('should block pipe injection', () => {
    expect(() => validateArgs(['| rm -rf /'])).toThrow('blocked pattern');
    expect(() => validateArgs(['file.txt | cat'])).toThrow('blocked pattern');
  });

  it('should block command separators', () => {
    expect(() => validateArgs(['file.txt; rm -rf /'])).toThrow('blocked pattern');
    expect(() => validateArgs(['file.txt & calc'])).toThrow('blocked pattern');
    expect(() => validateArgs(['file.txt && whoami'])).toThrow('blocked pattern');
  });

  it('should block backtick execution', () => {
    expect(() => validateArgs(['`whoami`'])).toThrow('blocked pattern');
  });

  it('should block subshell', () => {
    expect(() => validateArgs(['$(whoami)'])).toThrow('blocked pattern');
  });

  it('should block redirect', () => {
    expect(() => validateArgs(['> /etc/passwd'])).toThrow('blocked pattern');
    expect(() => validateArgs(['>> evil.txt'])).toThrow('blocked pattern');
  });

  it('should block path traversal', () => {
    expect(() => validateArgs(['../../etc/passwd'])).toThrow('blocked pattern');
    expect(() => validateArgs(['..\\..\\windows'])).toThrow('blocked pattern');
  });

  it('should block powershell/cmd escape', () => {
    expect(() => validateArgs(['powershell -c Get-Process'])).toThrow('blocked pattern');
    expect(() => validateArgs(['cmd /c dir'])).toThrow('blocked pattern');
  });
});

describe('validatePath', () => {
  it('should allow paths within allowed directories', () => {
    expect(validatePath('/mnt/documents/file.txt', ['/mnt/documents'])).toBe(true);
    expect(validatePath('/mnt/downloads/sub/file.txt', ['/mnt/downloads'])).toBe(true);
  });

  it('should reject paths outside allowed directories', () => {
    expect(validatePath('/etc/passwd', ['/mnt/documents'])).toBe(false);
    expect(validatePath('/mnt/secrets/key', ['/mnt/documents', '/mnt/downloads'])).toBe(false);
  });

  it('should reject path traversal attempts', () => {
    expect(validatePath('/mnt/documents/../../../etc/passwd', ['/mnt/documents'])).toBe(false);
  });
});
```

**Step 6: Run test - verify fail**

**Step 7: Implement validator.ts**

Create `src/shell-sandbox/validator.ts`:

```typescript
import path from 'node:path';

const BLOCKED_PATTERNS: RegExp[] = [
  /\|/,               // pipe
  /[;&]/,             // command separator
  /&&/,               // logical AND
  /\|\|/,             // logical OR
  /`/,                // backtick execution
  /\$\(/,             // subshell
  />/,                // redirect
  /\.\.[/\\]/,        // path traversal
  /powershell/i,      // PS escape
  /cmd\s+\/c/i,       // CMD escape
  /\bnet\s+/i,        // net commands
  /\breg\s+/i,        // registry
  /\bformat\b/i,      // disk format
  /\bwmic\b/i,        // WMI
];

export function validateArgs(args: string[]): void {
  const joined = args.join(' ');
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(joined)) {
      throw new Error(`Argument contains blocked pattern: ${pattern.source}`);
    }
  }
}

export function validatePath(targetPath: string, allowedPaths: string[]): boolean {
  const resolved = path.resolve(targetPath);
  return allowedPaths.some((allowed) => {
    const resolvedAllowed = path.resolve(allowed);
    return resolved.startsWith(resolvedAllowed + path.sep) || resolved === resolvedAllowed;
  });
}
```

**Step 8: Run test - verify pass**

**Step 9: Create shell-sandbox HTTP server**

Create `src/shell-sandbox/server.ts`:

```typescript
import express from 'express';
import { execSync } from 'node:child_process';
import { verifyInternalToken } from '../shared/auth.js';
import { isAllowed, getDef } from './allowlist.js';
import { validateArgs, validatePath } from './validator.js';

const PORT = parseInt(process.env.PORT ?? '9001', 10);
const SECRET = process.env.INTERNAL_SECRET ?? '';
const startTime = Date.now();

const app = express();
app.use(express.json());
app.use(verifyInternalToken(SECRET));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime_s: Math.floor((Date.now() - startTime) / 1000) });
});

app.post('/execute', (req, res) => {
  const { request_id, action, params } = req.body;
  const start = Date.now();

  if (action !== 'run_command') {
    res.json({ request_id, status: 'error', result: { error: `Unknown action: ${action}` },
      metadata: { duration_ms: Date.now() - start, action, tier: 'forbidden' } });
    return;
  }

  const { command, args = [] } = params as { command: string; args?: string[] };

  if (!isAllowed(command)) {
    res.json({ request_id, status: 'error', result: { error: `Command not in allowlist: ${command}` },
      metadata: { duration_ms: Date.now() - start, action, tier: 'forbidden' } });
    return;
  }

  const def = getDef(command)!;

  try {
    if (def.allowArgs && args.length > 0) {
      validateArgs(args);
      if (def.allowedPaths) {
        for (const arg of args) {
          if (arg.startsWith('/') && !validatePath(arg, def.allowedPaths)) {
            throw new Error(`Path not allowed: ${arg}`);
          }
        }
      }
    }

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    const stdout = execSync(fullCommand, {
      timeout: def.timeout,
      maxBuffer: 1024 * 1024,
      encoding: 'utf-8',
    });

    res.json({
      request_id,
      status: 'success',
      result: { stdout: stdout.trim() },
      metadata: { duration_ms: Date.now() - start, action: `shell:${command}`, tier: def.tier },
    });
  } catch (err) {
    res.json({
      request_id,
      status: 'error',
      result: { error: (err as Error).message },
      metadata: { duration_ms: Date.now() - start, action: `shell:${command}`, tier: def.tier },
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`shell-sandbox listening on port ${PORT}`);
});
```

**Step 10: Create Dockerfile**

Create `scripts/shell-sandbox/Dockerfile`:

```dockerfile
FROM node:22-alpine

RUN apk add --no-cache iputils procps

WORKDIR /app

COPY ../../package.json ../../package-lock.json ./
RUN npm ci --omit=dev

COPY ../../dist/shell-sandbox/ ./dist/shell-sandbox/
COPY ../../dist/shared/ ./dist/shared/

USER 1000:1000

EXPOSE 9001

CMD ["node", "dist/shell-sandbox/server.js"]
```

**Step 11: Run all unit tests**

```bash
npx vitest run --project unit src/shell-sandbox/__tests__/
```

Expected: ALL PASS

**Step 12: Commit**

```bash
git add src/shell-sandbox/ scripts/shell-sandbox/
git commit -m "feat: add shell-sandbox container with allowlist and injection protection"
```

---

### Task 5: LLM Router

**Files:**
- Create: `src/llm-router/__tests__/router.test.ts`
- Create: `src/llm-router/__tests__/budget.test.ts`
- Create: `src/llm-router/router.ts`
- Create: `src/llm-router/budget.ts`
- Create: `config/llm-providers.json`

**Step 1: Write failing router tests**

Create `src/llm-router/__tests__/router.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { route, loadRoutingConfig } from '../router.js';

const config = loadRoutingConfig({
  rules: [
    { match: { requires_tools: true }, model: 'ollama/glm4-7b', fallback: 'openai/gpt-5.2' },
    { match: { language: 'sk', complexity: 'standard' }, model: 'ollama/euroLLM-9b', fallback: 'openai/gpt-5.2' },
    { match: { task: 'summarize' }, model: 'ollama/euroLLM-9b', fallback: 'openai/gpt-5.2' },
    { match: { complexity: 'complex' }, model: 'openai/gpt-5.2', fallback: 'anthropic/claude-sonnet' },
  ],
  default_model: 'ollama/qwen3-8b',
});

describe('LLM Router', () => {
  it('should route tool calling to GLM', () => {
    const decision = route({ requires_tools: true }, config);
    expect(decision.model).toBe('ollama/glm4-7b');
  });

  it('should route Slovak chat to EuroLLM', () => {
    const decision = route({ language: 'sk', complexity: 'standard' }, config);
    expect(decision.model).toBe('ollama/euroLLM-9b');
  });

  it('should route summarization to EuroLLM', () => {
    const decision = route({ task: 'summarize' }, config);
    expect(decision.model).toBe('ollama/euroLLM-9b');
  });

  it('should route complex tasks to cloud', () => {
    const decision = route({ complexity: 'complex' }, config);
    expect(decision.model).toBe('openai/gpt-5.2');
  });

  it('should use default model for unmatched requests', () => {
    const decision = route({}, config);
    expect(decision.model).toBe('ollama/qwen3-8b');
  });

  it('should include fallback in decision', () => {
    const decision = route({ complexity: 'complex' }, config);
    expect(decision.fallback).toBe('anthropic/claude-sonnet');
  });
});
```

**Step 2: Run test - verify fail**

**Step 3: Implement router.ts**

Create `src/llm-router/router.ts`:

```typescript
interface RoutingRule {
  match: Record<string, unknown>;
  model: string;
  fallback: string | null;
}

export interface RoutingConfig {
  rules: RoutingRule[];
  default_model: string;
}

export interface RoutingDecision {
  model: string;
  fallback: string | null;
  reason: string;
}

export function loadRoutingConfig(raw: {
  rules: RoutingRule[];
  default_model: string;
}): RoutingConfig {
  return raw;
}

function matchesRule(request: Record<string, unknown>, rule: RoutingRule): boolean {
  for (const [key, value] of Object.entries(rule.match)) {
    if (request[key] !== value) return false;
  }
  return true;
}

export function route(
  request: Record<string, unknown>,
  config: RoutingConfig,
): RoutingDecision {
  for (const rule of config.rules) {
    if (matchesRule(request, rule)) {
      return {
        model: rule.model,
        fallback: rule.fallback,
        reason: `Matched rule: ${JSON.stringify(rule.match)}`,
      };
    }
  }

  return {
    model: config.default_model,
    fallback: null,
    reason: 'No rule matched, using default',
  };
}
```

**Step 4: Run test - verify pass**

**Step 5: Write failing budget tests**

Create `src/llm-router/__tests__/budget.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetTracker } from '../budget.js';

describe('BudgetTracker', () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    tracker = new BudgetTracker(1.0); // $1.00 daily limit
  });

  it('should allow spending within budget', () => {
    expect(tracker.canSpend()).toBe(true);
    tracker.record(0.50);
    expect(tracker.canSpend()).toBe(true);
  });

  it('should block spending over budget', () => {
    tracker.record(0.80);
    tracker.record(0.25);
    expect(tracker.canSpend()).toBe(false);
  });

  it('should report remaining budget', () => {
    tracker.record(0.30);
    expect(tracker.remaining()).toBeCloseTo(0.70);
  });

  it('should report warning threshold', () => {
    tracker.record(0.40);
    expect(tracker.isWarning(0.50)).toBe(false);
    tracker.record(0.20);
    expect(tracker.isWarning(0.50)).toBe(true);
  });

  it('should reset on new day', () => {
    tracker.record(1.50);
    expect(tracker.canSpend()).toBe(false);
    tracker.resetDaily();
    expect(tracker.canSpend()).toBe(true);
    expect(tracker.remaining()).toBeCloseTo(1.0);
  });
});
```

**Step 6: Implement budget.ts**

Create `src/llm-router/budget.ts`:

```typescript
export class BudgetTracker {
  private spent = 0;

  constructor(private readonly dailyLimit: number) {}

  record(cost: number): void {
    this.spent += cost;
  }

  canSpend(): boolean {
    return this.spent < this.dailyLimit;
  }

  remaining(): number {
    return Math.max(0, this.dailyLimit - this.spent);
  }

  isWarning(threshold: number): boolean {
    return this.spent >= threshold;
  }

  resetDaily(): void {
    this.spent = 0;
  }

  todaySpent(): number {
    return this.spent;
  }
}
```

**Step 7: Run all LLM router tests**

```bash
npx vitest run --project unit src/llm-router/__tests__/
```

Expected: ALL PASS

**Step 8: Create llm-providers config**

Create `config/llm-providers.json`:

```json
{
  "providers": {
    "ollama": {
      "base_url": "http://ollama:11434/v1",
      "api_key": null,
      "models": ["qwen3-8b", "euroLLM-9b", "glm4-7b"],
      "cost_per_1m_tokens": 0,
      "max_concurrent": 3,
      "timeout_ms": 30000
    },
    "openai": {
      "base_url": "http://openai-router:8080/v1",
      "api_key_env": "OPENAI_API_KEY",
      "models": ["gpt-5.2"],
      "cost_per_1m_tokens": 5.0,
      "max_concurrent": 5,
      "timeout_ms": 60000
    },
    "anthropic": {
      "base_url": "https://api.anthropic.com/v1",
      "api_key_env": "ANTHROPIC_API_KEY",
      "models": ["claude-sonnet-4-5"],
      "cost_per_1m_tokens": 3.0,
      "max_concurrent": 5,
      "timeout_ms": 60000
    }
  },
  "routing_rules": [
    { "match": { "requires_tools": true }, "model": "ollama/glm4-7b", "fallback": "openai/gpt-5.2" },
    { "match": { "language": "sk", "complexity": "standard" }, "model": "ollama/euroLLM-9b", "fallback": "openai/gpt-5.2" },
    { "match": { "language": "sk", "complexity": "trivial" }, "model": "ollama/qwen3-8b", "fallback": "ollama/euroLLM-9b" },
    { "match": { "task": "summarize" }, "model": "ollama/euroLLM-9b", "fallback": "openai/gpt-5.2" },
    { "match": { "complexity": "complex" }, "model": "openai/gpt-5.2", "fallback": "anthropic/claude-sonnet-4-5" }
  ],
  "default_model": "ollama/qwen3-8b",
  "budget": {
    "daily_limit_usd": 1.0,
    "warning_threshold_usd": 0.5,
    "when_exceeded": "local_only"
  }
}
```

**Step 9: Commit**

```bash
git add src/llm-router/ config/llm-providers.json
git commit -m "feat: add LLM router with task-based model selection and budget tracking"
```

---

### Task 6: Docker Compose networking

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Step 1: Add new services and networks to docker-compose.yml**

Append to existing `docker-compose.yml`:

**Networks section** (add at bottom, before `volumes:`):

```yaml
networks:
  esdeath-internal:
    driver: bridge
    internal: true
  esdeath-google:
    driver: bridge
  esdeath-web:
    driver: bridge
  esdeath-market:
    driver: bridge
```

**New services** (add after kokoro-tts service):

```yaml
  # === Esdeath v2 Platform Services ===

  ollama:
    image: ollama/ollama:latest
    container_name: clawdbot-ollama
    restart: unless-stopped
    volumes:
      - ollama_models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    networks:
      - esdeath-internal
    healthcheck:
      test: ["CMD", "ollama", "list"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    profiles:
      - v2

  audit-db:
    build:
      context: .
      dockerfile: scripts/audit-db/Dockerfile
    container_name: clawdbot-audit-db
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: "1000:1000"
    environment:
      PORT: "9000"
      DB_PATH: /data/audit.db
      INTERNAL_SECRET: ${TOOL_INTERNAL_SECRET}
    volumes:
      - audit_data:/data
    tmpfs:
      - /tmp:noexec,nosuid,size=16m
    networks:
      - esdeath-internal
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 60s
      timeout: 10s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    profiles:
      - v2

  shell-sandbox:
    build:
      context: .
      dockerfile: scripts/shell-sandbox/Dockerfile
    container_name: clawdbot-shell
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: "1000:1000"
    environment:
      PORT: "9001"
      INTERNAL_SECRET: ${TOOL_INTERNAL_SECRET}
    volumes:
      - /c/Users/adria/Documents:/mnt/documents:ro
      - /c/Users/adria/Downloads:/mnt/downloads:rw
    tmpfs:
      - /tmp:noexec,nosuid,size=16m
    networks:
      - esdeath-internal
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:9001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 60s
      timeout: 10s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    profiles:
      - v2

  email-tool:
    build:
      context: .
      dockerfile: scripts/email-tool/Dockerfile
    container_name: clawdbot-email
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: "1000:1000"
    environment:
      PORT: "9003"
      INTERNAL_SECRET: ${TOOL_INTERNAL_SECRET}
      GOG_KEYRING_PASSWORD: ${GOG_KEYRING_PASSWORD:-openclaw}
    volumes:
      - email_oauth:/data/oauth:ro
    tmpfs:
      - /tmp:noexec,nosuid,size=32m
    networks:
      - esdeath-internal
      - esdeath-google
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    profiles:
      - v2

  web-browser:
    build:
      context: .
      dockerfile: scripts/web-browser/Dockerfile
    container_name: clawdbot-web
    read_only: true
    cap_drop: [ALL]
    cap_add: [SYS_ADMIN]
    security_opt: [no-new-privileges:true]
    environment:
      PORT: "9002"
      INTERNAL_SECRET: ${TOOL_INTERNAL_SECRET}
    tmpfs:
      - /tmp:noexec,nosuid,size=256m
    networks:
      - esdeath-internal
      - esdeath-web
    deploy:
      resources:
        limits:
          memory: 1g
          cpus: '1.0'
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    profiles:
      - v2

  market-tool:
    build:
      context: .
      dockerfile: scripts/market-tool/Dockerfile
    container_name: clawdbot-market
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: "1000:1000"
    environment:
      PORT: "9004"
      INTERNAL_SECRET: ${TOOL_INTERNAL_SECRET}
      ALPHA_VANTAGE_KEY: ${ALPHA_VANTAGE_KEY:-}
    tmpfs:
      - /tmp:noexec,nosuid,size=16m
    networks:
      - esdeath-internal
      - esdeath-market
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    profiles:
      - v2
```

**New volumes** (add to existing volumes section):

```yaml
  ollama_models:
  audit_data:
  email_oauth:
```

**Step 2: Add existing services to esdeath-internal network**

Add `networks: [esdeath-internal]` to `openclaw-gateway` and `openai-router` services (alongside their existing config).

**Step 3: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: add v2 Docker services (ollama, audit-db, shell, email, web, market)"
```

---

### Task 7: Phase 1 integration tests

**Files:**
- Create: `tests/integration/audit-db.test.ts`
- Create: `tests/integration/shell-sandbox.test.ts`
- Create: `tests/integration/setup.ts`
- Create: `tests/integration/teardown.ts`

**Step 1: Create test setup/teardown**

Create `tests/integration/setup.ts`:

```typescript
import { execSync } from 'node:child_process';

export default function setup() {
  console.log('Starting v2 containers for integration tests...');
  execSync('docker compose --profile v2 up -d audit-db shell-sandbox', {
    cwd: 'D:/REPOS/tools/esdeath',
    stdio: 'inherit',
    timeout: 120000,
  });
  // Wait for healthchecks
  execSync('sleep 5');
}
```

Create `tests/integration/teardown.ts`:

```typescript
import { execSync } from 'node:child_process';

export default function teardown() {
  console.log('Stopping v2 containers...');
  execSync('docker compose --profile v2 stop audit-db shell-sandbox', {
    cwd: 'D:/REPOS/tools/esdeath',
    stdio: 'inherit',
  });
}
```

**Step 2: Write integration tests**

Create `tests/integration/audit-db.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

const BASE = 'http://localhost:9000';
const TOKEN = process.env.TOOL_INTERNAL_SECRET ?? 'test-secret';

describe('Audit DB Integration', () => {
  it('should respond to health check', async () => {
    const res = await fetch(`${BASE}/health`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('should accept and query audit logs', async () => {
    await fetch(`${BASE}/log`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `int-test-${Date.now()}`,
        timestamp: new Date().toISOString(),
        source: 'system',
        action: 'integration_test',
        tool: null,
        tier: 'safe',
        params: '{}',
        state: 'success',
        result_summary: 'test',
        error: null,
        duration_ms: 1,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: null,
      }),
    });

    const res = await fetch(`${BASE}/query?action=integration_test&limit=1`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const logs = await res.json();
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should reject unauthorized requests', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(401);
  });
});
```

Create `tests/integration/shell-sandbox.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

const BASE = 'http://localhost:9001';
const TOKEN = process.env.TOOL_INTERNAL_SECRET ?? 'test-secret';

describe('Shell Sandbox Integration', () => {
  it('should execute allowed command', async () => {
    const res = await fetch(`${BASE}/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: 'int-test-1',
        action: 'run_command',
        params: { command: 'hostname', args: [] },
      }),
    });
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.result.stdout).toBeTruthy();
  });

  it('should reject disallowed command', async () => {
    const res = await fetch(`${BASE}/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: 'int-test-2',
        action: 'run_command',
        params: { command: 'powershell', args: ['-c', 'Get-Process'] },
      }),
    });
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.result.error).toContain('not in allowlist');
  });

  it('should reject injection attempts', async () => {
    const res = await fetch(`${BASE}/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: 'int-test-3',
        action: 'run_command',
        params: { command: 'dir', args: ['/mnt/documents | cat /etc/passwd'] },
      }),
    });
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.result.error).toContain('blocked pattern');
  });
});
```

**Step 3: Run integration tests**

```bash
npm run build && npx vitest run --project integration
```

**Step 4: Commit**

```bash
git add tests/integration/
git commit -m "test: add integration tests for audit-db and shell-sandbox"
```

---

## Phase 2: Email Tool (follows same pattern)

### Task 8: Email tool container

**Files:**
- Create: `src/email-tool/__tests__/actions.test.ts`
- Create: `src/email-tool/actions.ts`
- Create: `src/email-tool/server.ts`
- Create: `scripts/email-tool/Dockerfile`

Follow the same TDD pattern:
1. Write tests for each action: `list_unread`, `search`, `read_email`, `send_email`, `calendar_today`, `calendar_week`, `calendar_create`
2. Test multi-account routing (primary, work, spam)
3. Test tier classification per action (read=notice, write=dangerous)
4. Implement as wrapper around `gog` CLI binary
5. Server exposes POST /execute with unified API
6. Dockerfile based on node:22-alpine with `gog` binary copied in

Key implementation notes:
- `gog` binary must be copied from gateway image or installed separately
- OAuth tokens stored in `email_oauth` volume (read-only mount)
- Network restricted to `esdeath-google` (only Google APIs reachable)

**Commit message:** `feat: add email-tool container with Gmail/Calendar integration`

---

## Phase 3: Web Browser

### Task 9: Web browser container

**Files:**
- Create: `src/web-browser/__tests__/url-validator.test.ts`
- Create: `src/web-browser/__tests__/actions.test.ts`
- Create: `src/web-browser/url-validator.ts`
- Create: `src/web-browser/actions.ts`
- Create: `src/web-browser/server.ts`
- Create: `scripts/web-browser/Dockerfile`

Critical security tests for `url-validator.ts`:
- Block `localhost`, `127.0.0.1`, `0.0.0.0`
- Block private networks: `10.*`, `172.16-31.*`, `192.168.*`
- Block AWS metadata: `169.254.169.254`
- Block `file://`, `ftp://`, `data:` protocols
- Block DNS rebinding (resolve hostname, check IP)
- Allow normal HTTPS URLs

Actions: `search` (DuckDuckGo), `fetch_url`, `screenshot`, `extract`

Dockerfile based on `node:22-alpine` with Chromium and Puppeteer.

**Commit message:** `feat: add web-browser container with SSRF protection`

---

## Phase 4: Enhanced Memory

### Task 10: Memory database schema and sync

**Files:**
- Create: `src/enhanced-memory/__tests__/memory-schema.test.ts`
- Create: `src/enhanced-memory/__tests__/sync.test.ts`
- Create: `src/enhanced-memory/__tests__/query.test.ts`
- Create: `src/enhanced-memory/memory-schema.ts`
- Create: `src/enhanced-memory/sync.ts`
- Create: `src/enhanced-memory/query.ts`

TDD steps:
1. Test schema creation (facts, episodes, food_log, exercise_log, habits, summaries, FTS tables)
2. Test Markdown parsing: FOOD.md → food_log rows
3. Test Markdown parsing: EXERCISE.md → exercise_log rows
4. Test Markdown parsing: HABITS.md → habits rows
5. Test deduplication on re-sync
6. Test querying: `queryFood(date)`, `queryExercise(activity)`, `searchEpisodes(text)`
7. Test FTS: full-text search across episodes and summaries
8. Test fact extraction: `extractFacts(text)` → `{category, key, value, confidence}`

Key: Memory DB lives in same `audit_data` volume (or separate `memory_data` volume). The memory skill runs inside gateway, querying the audit-db container's extended API, OR memory gets its own SQLite file mounted into gateway.

**Simpler approach:** Memory SQLite runs inside gateway container (not a separate service). Gateway already has workspace volume access. Add `better-sqlite3` to gateway's dependencies via an init script.

**Commit message:** `feat: add enhanced memory with Markdown sync, FTS, and fact extraction`

---

## Phase 5: Fitness Coach Skill

### Task 11: Fitness coach OpenClaw skill

**Files:**
- Create: `openclaw-data/config/workspace/skills/fitness-coach/SKILL.md`

This is a Markdown-based OpenClaw skill (not TypeScript). The skill instructs the agent how to:
- Query food_log, exercise_log, habits tables via memory skill
- Estimate calories/macros for logged meals
- Generate weekly workout plans
- Calculate streaks and progress
- Send weekly reports

**Commit message:** `feat: add fitness-coach OpenClaw skill`

---

## Phase 6: Market Tool

### Task 12: Market tool container

**Files:**
- Create: `src/market-tool/__tests__/actions.test.ts`
- Create: `src/market-tool/actions.ts`
- Create: `src/market-tool/server.ts`
- Create: `scripts/market-tool/Dockerfile`

Actions: `quote`, `history`, `watchlist`, `news`, `alert_set`, `alert_list`

Wrapper around Alpha Vantage API (free tier, 5 calls/min). Watchlist persisted in local SQLite.

**Commit message:** `feat: add market-tool container with stock data and alerts`

---

## Phase 7: OpenClaw Skills + Wiring

### Task 13: Create OpenClaw skills for all tools

**Files:**
- Create: `openclaw-data/config/workspace/skills/shell-exec/SKILL.md`
- Create: `openclaw-data/config/workspace/skills/email-assistant/SKILL.md`
- Create: `openclaw-data/config/workspace/skills/calendar-assistant/SKILL.md`
- Create: `openclaw-data/config/workspace/skills/web-researcher/SKILL.md`
- Create: `openclaw-data/config/workspace/skills/market-data/SKILL.md`
- Create: `openclaw-data/config/workspace/skills/approval-gate/SKILL.md`
- Create: `openclaw-data/config/workspace/skills/audit-logger/SKILL.md`

Each SKILL.md instructs the agent:
- When to use this tool
- What API endpoint to call
- What actions are available
- What tier each action is (so agent knows if approval is needed)
- Expected response format
- Error handling

Example structure:

```markdown
---
name: shell-exec
description: Execute sandboxed commands on Adrian's PC
---

## When to Use
Use when Adrian asks to run a command, check system info, list/manage files.

## API
Endpoint: http://shell-sandbox:9001/execute
Auth: Bearer ${TOOL_INTERNAL_TOKEN}

## Actions
| Action | Tier | Description |
|--------|------|-------------|
| run_command | varies | Execute allowlisted command |

## Commands Available
- hostname (safe), systeminfo (notice), tasklist (notice)
- dir, type (notice) - only /mnt/documents, /mnt/downloads
- copy, move, del, mkdir (dangerous) - only /mnt/downloads
- start (dangerous) - only notepad, calc, explorer
- ping (notice) - max 4 count

## Important
- ALWAYS check tier before executing
- DANGEROUS commands require approval - tell Adrian what you want to do and wait
- NEVER try commands not in the allowlist
- NEVER construct commands with pipes, redirects, or semicolons
```

**Commit message:** `feat: add OpenClaw skills for all v2 tool containers`

---

### Task 14: Ollama model initialization script

**Files:**
- Create: `scripts/ollama/init-models.sh`

```bash
#!/bin/bash
# Pull required models on first start
echo "Pulling Esdeath v2 models..."
ollama pull qwen3:8b
ollama pull euroLLM:9b
ollama pull glm4:7b
echo "All models ready."
```

**Commit message:** `feat: add Ollama model initialization script`

---

### Task 15: Update CLAUDE.md and MEMORY.md

**Files:**
- Modify: `CLAUDE.md` (add v2 platform documentation)
- Modify: `../../CLAUDE.md` (root - update port table, project description)
- Modify: `C:\Users\adria\.claude\projects\D--REPOS\memory\MEMORY.md` (update port mapping)

Add to esdeath CLAUDE.md:
- v2 platform services table
- New Docker commands (`docker compose --profile v2 up -d`)
- New environment variables
- Skill list
- Testing commands

Update root CLAUDE.md project routing table:
- Add v2 keywords: "approval, audit, shell sandbox, llm router"

Update MEMORY.md port mapping:
- 9000: audit-db
- 9001: shell-sandbox
- 9002: web-browser
- 9003: email-tool
- 9004: market-tool
- 11434: Ollama (internal only)

**Commit message:** `docs: update CLAUDE.md and MEMORY.md for Esdeath v2 platform`

---

### Task 16: E2E tests

**Files:**
- Create: `tests/e2e/full-flow.test.ts`

Test 3 critical paths:
1. Safe request → auto-execute → audit logged → no approval needed
2. Dangerous request → approval created → simulate approve → execute → result
3. Forbidden request → blocked → alert in audit log

**Commit message:** `test: add E2E tests for full Telegram → Tool → Response flow`

---

## Summary of All Commits

| # | Phase | Commit |
|---|-------|--------|
| 1 | Scaffold | `chore: scaffold Esdeath v2 project (TS, Vitest, shared types)` |
| 2 | Core | `feat: add audit-db container with sanitization and schema` |
| 3 | Core | `feat: add approval engine with tier classification, state machine, rate limiting` |
| 4 | Core | `feat: add shell-sandbox container with allowlist and injection protection` |
| 5 | Core | `feat: add LLM router with task-based model selection and budget tracking` |
| 6 | Core | `feat: add v2 Docker services (ollama, audit-db, shell, email, web, market)` |
| 7 | Core | `test: add integration tests for audit-db and shell-sandbox` |
| 8 | Email | `feat: add email-tool container with Gmail/Calendar integration` |
| 9 | Web | `feat: add web-browser container with SSRF protection` |
| 10 | Memory | `feat: add enhanced memory with Markdown sync, FTS, and fact extraction` |
| 11 | Fitness | `feat: add fitness-coach OpenClaw skill` |
| 12 | Market | `feat: add market-tool container with stock data and alerts` |
| 13 | Skills | `feat: add OpenClaw skills for all v2 tool containers` |
| 14 | Infra | `feat: add Ollama model initialization script` |
| 15 | Docs | `docs: update CLAUDE.md and MEMORY.md for Esdeath v2 platform` |
| 16 | Test | `test: add E2E tests for full Telegram → Tool → Response flow` |
