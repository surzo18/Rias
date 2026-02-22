# RIAS Control Plane Phase 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Vybudovať kostru RIAS Control Plane — nový TypeScript service (`src/control-plane/`) s policy engine (Tier A/B/C), RBAC modelom, SQLite job store a HTTP job submission API.

**Architecture:** Control plane je samostatný Node.js service sedí medzi OpenClaw gateway (esdeath) a agentmi. Prijíma job submission requesty, klasifikuje ich na Tier A/B/C pomocou policy engine, overuje RBAC oprávnenia actora, ukladá job do SQLite store a vracia rozhodnutie. Phase 1 je lokálne spustiteľný bez Dockera — Docker integrácia príde v Phase 2.

**Tech Stack:** TypeScript (ESM NodeNext), Express 5.x, better-sqlite3, Vitest, jsonwebtoken, uuid. Rovnaké nastavenie ako `src/esdeath/`.

**Reference:** `docs/theoretical_model/01-system-architecture.md` — Section 4 (agent model), Section 6 (HITL tiers), Section 13 (job record contract), Section 17 (RBAC matrix).

---

## Task 1: Inicializácia projektu

**Files:**
- Create: `src/control-plane/package.json`
- Create: `src/control-plane/tsconfig.json`
- Create: `src/control-plane/vitest.config.ts`

**Step 1: Vytvor adresárovú štruktúru**

```bash
mkdir -p src/control-plane/src/__tests__
```

**Step 2: Vytvor package.json**

```json
{
  "name": "@rias/control-plane",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^12.6.2",
    "express": "^5.2.1",
    "jsonwebtoken": "^9.0.3",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/express": "^5.0.3",
    "@types/jsonwebtoken": "^9.0.9",
    "@types/node": "^22.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 3: Vytvor tsconfig.json**

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
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/__tests__/**"]
}
```

**Step 4: Vytvor tsconfig.build.json** (rovnaký ako tsconfig.json — používa sa pri `npm run build`)

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/__tests__/**"]
}
```

**Step 5: Vytvor vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

**Step 6: Nainštaluj závislosti**

```bash
cd src/control-plane && npm install
```

Expected: `node_modules/` vytvorený, žiadne errors.

**Step 7: Commit**

```bash
git add src/control-plane/
git commit -m "chore(control-plane): init project structure"
```

---

## Task 2: Core types

**Files:**
- Create: `src/control-plane/src/types.ts`
- Create: `src/control-plane/src/__tests__/types.test.ts`

Typy sú odvodené priamo z `docs/theoretical_model/01-system-architecture.md` Section 13 (job record contract) a Section 17 (RBAC matrix).

**Step 1: Napíš failujúci test**

`src/control-plane/src/__tests__/types.test.ts`:
```typescript
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { JobRecord, PolicyDecision, RoleBinding } from '../types.js';

describe('types', () => {
  it('should allow constructing a valid JobRecord', () => {
    const job: JobRecord = {
      job_id: 'abc-123',
      idempotency_key: 'idem-1',
      request_id: 'req-1',
      trace_id: 'trace-1',
      actor_id: 'user-1',
      project_id: 'proj-1',
      intent: 'query.list_files',
      risk_tier: 'A',
      requires_human_approval: false,
      constraints: { data_classification: 'internal' },
      payload: {},
      status: 'queued',
      created_at: new Date().toISOString(),
    };
    assert.equal(job.risk_tier, 'A');
  });

  it('should allow constructing a PolicyDecision', () => {
    const decision: PolicyDecision = {
      risk_tier: 'C',
      requires_human_approval: true,
      reason: 'infra change requires approval',
    };
    assert.equal(decision.requires_human_approval, true);
  });

  it('should allow constructing a RoleBinding', () => {
    const binding: RoleBinding = {
      actor_id: 'user-1',
      role: 'project-maintainer',
      project_ids: ['proj-1'],
    };
    assert.equal(binding.role, 'project-maintainer');
  });
});
```

**Step 2: Spusti test — overí že failuje**

```bash
cd src/control-plane && npm test
```

Expected: FAIL — `Cannot find module '../types.js'`

**Step 3: Implementuj typy**

`src/control-plane/src/types.ts`:
```typescript
export type RiskTier = 'A' | 'B' | 'C';

export type RBACRole =
  | 'owner'
  | 'admin'
  | 'project-maintainer'
  | 'infra-approver'
  | 'viewer';

export type JobStatus =
  | 'queued'
  | 'waiting_human_decision'
  | 'running'
  | 'done'
  | 'failed'
  | 'dead_letter';

export type DataClassification = 'public' | 'internal' | 'sensitive';

export interface JobConstraints {
  data_classification: DataClassification;
  cost_limit_usd?: number;
  prefer_local?: boolean;
}

export interface JobRecord {
  job_id: string;
  idempotency_key: string;
  request_id: string;
  trace_id: string;
  actor_id: string;
  project_id: string;
  intent: string;
  risk_tier: RiskTier;
  requires_human_approval: boolean;
  constraints: JobConstraints;
  payload: Record<string, unknown>;
  status: JobStatus;
  created_at: string;
}

export interface PolicyDecision {
  risk_tier: RiskTier;
  requires_human_approval: boolean;
  reason: string;
}

export interface CapabilityProfile {
  agent_id: string;
  allowed_resources: string[];
  allowed_tools: string[];
  allowed_actions: string[];
  risk_limit: RiskTier;
}

export interface RoleBinding {
  actor_id: string;
  role: RBACRole;
  project_ids?: string[];
}

export interface HealthResponse {
  status: 'ok';
  uptime_s: number;
}
```

**Step 4: Spusti test — overí že prechádza**

```bash
cd src/control-plane && npm test
```

Expected: PASS — 3 tests passing

**Step 5: Commit**

```bash
git add src/control-plane/src/types.ts src/control-plane/src/__tests__/types.test.ts
git commit -m "feat(control-plane): add core types from theoretical model"
```

---

## Task 3: Policy Engine

**Files:**
- Create: `src/control-plane/src/policy-engine.ts`
- Create: `src/control-plane/src/__tests__/policy-engine.test.ts`

Policy engine klasifikuje job intent na Tier A/B/C a určuje či je potrebné human approval.

Tier logika (z `01-system-architecture.md` Section 6):
- **Tier A** (low risk): read-only, query, safe tool calls → auto-run
- **Tier B** (medium risk): writes, API calls, moderate-risk ops → auto-run s guardrailmi
- **Tier C** (high risk): infra, schema, security, destructive, deploy → mandatory human approval

**Step 1: Napíš failujúce testy**

`src/control-plane/src/__tests__/policy-engine.test.ts`:
```typescript
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { classifyIntent } from '../policy-engine.js';

describe('policy-engine', () => {
  describe('classifyIntent', () => {
    it('should classify query.* intents as Tier A', () => {
      const result = classifyIntent('query.list_files');
      assert.equal(result.risk_tier, 'A');
      assert.equal(result.requires_human_approval, false);
    });

    it('should classify read.* intents as Tier A', () => {
      const result = classifyIntent('read.file_contents');
      assert.equal(result.risk_tier, 'A');
    });

    it('should classify write.* intents as Tier B', () => {
      const result = classifyIntent('write.update_config');
      assert.equal(result.risk_tier, 'B');
      assert.equal(result.requires_human_approval, false);
    });

    it('should classify infra.* intents as Tier C with human approval', () => {
      const result = classifyIntent('infra.create_db');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should classify schema.* intents as Tier C', () => {
      const result = classifyIntent('schema.alter_table');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should classify delete.* intents as Tier C', () => {
      const result = classifyIntent('delete.drop_table');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should classify deploy.* intents as Tier C', () => {
      const result = classifyIntent('deploy.production');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should classify security.* intents as Tier C', () => {
      const result = classifyIntent('security.rotate_key');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should default unknown intents to Tier B', () => {
      const result = classifyIntent('unknown.action');
      assert.equal(result.risk_tier, 'B');
    });

    it('should include a reason in every decision', () => {
      const result = classifyIntent('query.list_files');
      assert.ok(result.reason.length > 0);
    });
  });
});
```

**Step 2: Spusti testy — overí že failujú**

```bash
cd src/control-plane && npm test
```

Expected: FAIL — `Cannot find module '../policy-engine.js'`

**Step 3: Implementuj policy engine**

`src/control-plane/src/policy-engine.ts`:
```typescript
import type { PolicyDecision, RiskTier } from './types.js';

interface TierRule {
  tier: RiskTier;
  requires_human_approval: boolean;
  reason: string;
}

const TIER_C_PREFIXES = [
  'infra.',
  'schema.',
  'delete.',
  'deploy.',
  'security.',
  'secret.',
  'kill.',
  'policy.',
];

const TIER_A_PREFIXES = [
  'query.',
  'read.',
  'list.',
  'get.',
  'health.',
  'status.',
];

function matchesPrefix(intent: string, prefixes: string[]): boolean {
  const lower = intent.toLowerCase();
  return prefixes.some((p) => lower.startsWith(p));
}

function resolveRule(intent: string): TierRule {
  if (matchesPrefix(intent, TIER_C_PREFIXES)) {
    return {
      tier: 'C',
      requires_human_approval: true,
      reason: `intent '${intent}' matches high-risk prefix — mandatory human approval`,
    };
  }

  if (matchesPrefix(intent, TIER_A_PREFIXES)) {
    return {
      tier: 'A',
      requires_human_approval: false,
      reason: `intent '${intent}' matches low-risk prefix — auto-run`,
    };
  }

  return {
    tier: 'B',
    requires_human_approval: false,
    reason: `intent '${intent}' is unclassified — defaulting to Tier B with guardrails`,
  };
}

export function classifyIntent(intent: string): PolicyDecision {
  const rule = resolveRule(intent);
  return {
    risk_tier: rule.tier,
    requires_human_approval: rule.requires_human_approval,
    reason: rule.reason,
  };
}
```

**Step 4: Spusti testy — overí že prechádzajú**

```bash
cd src/control-plane && npm test
```

Expected: PASS — 10 tests passing

**Step 5: Commit**

```bash
git add src/control-plane/src/policy-engine.ts src/control-plane/src/__tests__/policy-engine.test.ts
git commit -m "feat(control-plane): add policy engine with Tier A/B/C classification"
```

---

## Task 4: RBAC Model

**Files:**
- Create: `src/control-plane/src/rbac.ts`
- Create: `src/control-plane/src/__tests__/rbac.test.ts`

RBAC overuje či má actor oprávnenie na danú akciu. Implementuje maticu z `01-system-architecture.md` Section 17.

**Step 1: Napíš failujúce testy**

`src/control-plane/src/__tests__/rbac.test.ts`:
```typescript
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { RBACEngine } from '../rbac.js';
import type { RoleBinding } from '../types.js';

function makeEngine(bindings: RoleBinding[]): RBACEngine {
  return new RBACEngine(bindings);
}

describe('RBACEngine', () => {
  describe('canSubmitJob', () => {
    it('owner can submit a job to any project', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'owner' }]);
      assert.equal(engine.canSubmitJob('u1', 'proj-x'), true);
    });

    it('project-maintainer can submit to assigned project', () => {
      const engine = makeEngine([
        { actor_id: 'u1', role: 'project-maintainer', project_ids: ['proj-1'] },
      ]);
      assert.equal(engine.canSubmitJob('u1', 'proj-1'), true);
    });

    it('project-maintainer cannot submit to unassigned project', () => {
      const engine = makeEngine([
        { actor_id: 'u1', role: 'project-maintainer', project_ids: ['proj-1'] },
      ]);
      assert.equal(engine.canSubmitJob('u1', 'proj-2'), false);
    });

    it('viewer cannot submit a job', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'viewer' }]);
      assert.equal(engine.canSubmitJob('u1', 'proj-1'), false);
    });

    it('unknown actor cannot submit a job', () => {
      const engine = makeEngine([]);
      assert.equal(engine.canSubmitJob('unknown', 'proj-1'), false);
    });
  });

  describe('canApproveTierC', () => {
    it('owner can approve Tier C jobs', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'owner' }]);
      assert.equal(engine.canApproveTierC('u1', 'proj-1'), true);
    });

    it('infra-approver can approve Tier C infra jobs', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'infra-approver' }]);
      assert.equal(engine.canApproveTierC('u1', 'proj-1'), true);
    });

    it('project-maintainer cannot directly approve Tier C', () => {
      const engine = makeEngine([
        { actor_id: 'u1', role: 'project-maintainer', project_ids: ['proj-1'] },
      ]);
      assert.equal(engine.canApproveTierC('u1', 'proj-1'), false);
    });

    it('viewer cannot approve Tier C', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'viewer' }]);
      assert.equal(engine.canApproveTierC('u1', 'proj-1'), false);
    });
  });

  describe('getRoleFor', () => {
    it('returns the role for a known actor', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'admin' }]);
      assert.equal(engine.getRoleFor('u1'), 'admin');
    });

    it('returns null for unknown actor', () => {
      const engine = makeEngine([]);
      assert.equal(engine.getRoleFor('unknown'), null);
    });
  });
});
```

**Step 2: Spusti testy — overí že failujú**

```bash
cd src/control-plane && npm test
```

Expected: FAIL — `Cannot find module '../rbac.js'`

**Step 3: Implementuj RBAC engine**

`src/control-plane/src/rbac.ts`:
```typescript
import type { RBACRole, RoleBinding } from './types.js';

const SUBMIT_ALLOWED: RBACRole[] = ['owner', 'admin', 'project-maintainer', 'infra-approver'];
const TIER_C_APPROVE_ALLOWED: RBACRole[] = ['owner', 'infra-approver'];

export class RBACEngine {
  private bindings: Map<string, RoleBinding>;

  constructor(bindings: RoleBinding[]) {
    this.bindings = new Map(bindings.map((b) => [b.actor_id, b]));
  }

  getRoleFor(actorId: string): RBACRole | null {
    return this.bindings.get(actorId)?.role ?? null;
  }

  canSubmitJob(actorId: string, projectId: string): boolean {
    const binding = this.bindings.get(actorId);
    if (!binding) return false;
    if (!SUBMIT_ALLOWED.includes(binding.role)) return false;

    if (binding.role === 'project-maintainer') {
      return binding.project_ids?.includes(projectId) ?? false;
    }

    return true;
  }

  canApproveTierC(actorId: string, _projectId: string): boolean {
    const role = this.getRoleFor(actorId);
    if (!role) return false;
    return TIER_C_APPROVE_ALLOWED.includes(role);
  }
}
```

**Step 4: Spusti testy — overí že prechádzajú**

```bash
cd src/control-plane && npm test
```

Expected: PASS — všetky testy zelené

**Step 5: Commit**

```bash
git add src/control-plane/src/rbac.ts src/control-plane/src/__tests__/rbac.test.ts
git commit -m "feat(control-plane): add RBAC engine with role matrix from Section 17"
```

---

## Task 5: Job Store (SQLite)

**Files:**
- Create: `src/control-plane/src/job-store.ts`
- Create: `src/control-plane/src/__tests__/job-store.test.ts`

Job store persistuje JobRecord do SQLite. Schéma je odvodená z theoretical model Section 13.

**Step 1: Napíš failujúce testy**

`src/control-plane/src/__tests__/job-store.test.ts`:
```typescript
import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { JobStore } from '../job-store.js';
import type { JobRecord } from '../types.js';

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    job_id: 'job-1',
    idempotency_key: 'idem-1',
    request_id: 'req-1',
    trace_id: 'trace-1',
    actor_id: 'user-1',
    project_id: 'proj-1',
    intent: 'query.list_files',
    risk_tier: 'A',
    requires_human_approval: false,
    constraints: { data_classification: 'internal' },
    payload: { path: '/home' },
    status: 'queued',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('JobStore', () => {
  let store: JobStore;

  beforeEach(() => {
    store = new JobStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('should insert and retrieve a job', () => {
    const job = makeJob();
    store.insert(job);
    const found = store.findById(job.job_id);
    assert.equal(found?.job_id, job.job_id);
    assert.equal(found?.intent, 'query.list_files');
    assert.deepEqual(found?.constraints, { data_classification: 'internal' });
    assert.deepEqual(found?.payload, { path: '/home' });
  });

  it('should enforce idempotency_key uniqueness', () => {
    store.insert(makeJob({ job_id: 'job-1', idempotency_key: 'idem-1' }));
    assert.throws(() => {
      store.insert(makeJob({ job_id: 'job-2', idempotency_key: 'idem-1' }));
    });
  });

  it('should update job status', () => {
    store.insert(makeJob());
    store.updateStatus('job-1', 'running');
    const found = store.findById('job-1');
    assert.equal(found?.status, 'running');
  });

  it('should return null for unknown job_id', () => {
    assert.equal(store.findById('nonexistent'), null);
  });

  it('should find existing job by idempotency_key', () => {
    store.insert(makeJob({ idempotency_key: 'idem-xyz' }));
    const found = store.findByIdempotencyKey('idem-xyz');
    assert.ok(found !== null);
    assert.equal(found.idempotency_key, 'idem-xyz');
  });
});
```

**Step 2: Spusti testy — overí že failujú**

```bash
cd src/control-plane && npm test
```

Expected: FAIL — `Cannot find module '../job-store.js'`

**Step 3: Implementuj job store**

`src/control-plane/src/job-store.ts`:
```typescript
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
```

**Step 4: Spusti testy — overí že prechádzajú**

```bash
cd src/control-plane && npm test
```

Expected: PASS — všetky testy zelené

**Step 5: Commit**

```bash
git add src/control-plane/src/job-store.ts src/control-plane/src/__tests__/job-store.test.ts
git commit -m "feat(control-plane): add SQLite job store with idempotency"
```

---

## Task 6: HTTP Server — Job Submission API

**Files:**
- Create: `src/control-plane/src/server.ts`
- Create: `src/control-plane/src/index.ts`
- Create: `src/control-plane/src/__tests__/server.test.ts`

Express server s dvoma endpointmi:
- `POST /jobs` — submit job (RBAC check → policy classification → store → response)
- `GET /health` — liveness check

**Step 1: Napíš failujúce testy**

`src/control-plane/src/__tests__/server.test.ts`:
```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import type { RoleBinding } from '../types.js';

const TEST_BINDINGS: RoleBinding[] = [
  { actor_id: 'owner-1', role: 'owner' },
  { actor_id: 'viewer-1', role: 'viewer' },
];

describe('control-plane HTTP server', () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createServer({ dbPath: ':memory:', bindings: TEST_BINDINGS });
    await new Promise<void>((resolve) => {
      server.app.listen(0, '127.0.0.1', function (this: { address(): { port: number } }) {
        baseUrl = `http://127.0.0.1:${this.address().port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.store.close();
  });

  it('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as { status: string };
    assert.equal(body.status, 'ok');
  });

  it('POST /jobs with owner actor submits a Tier A job', async () => {
    const res = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-test-1',
        request_id: 'req-1',
        trace_id: 'trace-1',
        actor_id: 'owner-1',
        project_id: 'proj-1',
        intent: 'query.list_files',
        constraints: { data_classification: 'internal' },
        payload: {},
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { risk_tier: string; requires_human_approval: boolean };
    assert.equal(body.risk_tier, 'A');
    assert.equal(body.requires_human_approval, false);
  });

  it('POST /jobs with viewer actor returns 403', async () => {
    const res = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-test-2',
        request_id: 'req-2',
        trace_id: 'trace-2',
        actor_id: 'viewer-1',
        project_id: 'proj-1',
        intent: 'query.list_files',
        constraints: { data_classification: 'public' },
        payload: {},
      }),
    });
    assert.equal(res.status, 403);
  });

  it('POST /jobs with duplicate idempotency_key returns existing job', async () => {
    const payload = {
      idempotency_key: 'idem-duplicate',
      request_id: 'req-3',
      trace_id: 'trace-3',
      actor_id: 'owner-1',
      project_id: 'proj-1',
      intent: 'query.list_files',
      constraints: { data_classification: 'public' },
      payload: {},
    };
    await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res2 = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res2.status, 200); // 200 = existing job returned (not 201 Created)
  });
});
```

**Step 2: Spusti testy — overí že failujú**

```bash
cd src/control-plane && npm test
```

Expected: FAIL — `Cannot find module '../server.js'`

**Step 3: Implementuj server**

`src/control-plane/src/server.ts`:
```typescript
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { classifyIntent } from './policy-engine.js';
import { RBACEngine } from './rbac.js';
import { JobStore } from './job-store.js';
import type { RoleBinding } from './types.js';

interface ServerOptions {
  dbPath: string;
  bindings: RoleBinding[];
}

interface SubmitJobBody {
  idempotency_key: string;
  request_id: string;
  trace_id: string;
  actor_id: string;
  project_id: string;
  intent: string;
  constraints: { data_classification: 'public' | 'internal' | 'sensitive'; cost_limit_usd?: number };
  payload: Record<string, unknown>;
}

export async function createServer(options: ServerOptions) {
  const app = express();
  const store = new JobStore(options.dbPath);
  const rbac = new RBACEngine(options.bindings);
  const startedAt = Date.now();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime_s: Math.floor((Date.now() - startedAt) / 1000) });
  });

  app.post('/jobs', (req, res) => {
    const body = req.body as SubmitJobBody;

    if (!rbac.canSubmitJob(body.actor_id, body.project_id)) {
      res.status(403).json({ error: 'Forbidden: actor lacks submit permission for this project' });
      return;
    }

    const existing = store.findByIdempotencyKey(body.idempotency_key);
    if (existing) {
      res.status(200).json(existing);
      return;
    }

    const policy = classifyIntent(body.intent);

    const job = {
      job_id: uuidv4(),
      idempotency_key: body.idempotency_key,
      request_id: body.request_id,
      trace_id: body.trace_id,
      actor_id: body.actor_id,
      project_id: body.project_id,
      intent: body.intent,
      risk_tier: policy.risk_tier,
      requires_human_approval: policy.requires_human_approval,
      constraints: body.constraints,
      payload: body.payload,
      status: policy.requires_human_approval
        ? ('waiting_human_decision' as const)
        : ('queued' as const),
      created_at: new Date().toISOString(),
    };

    store.insert(job);
    res.status(201).json(job);
  });

  return { app, store };
}
```

`src/control-plane/src/index.ts`:
```typescript
import { createServer } from './server.js';

const PORT = Number(process.env.PORT ?? 3100);
const DB_PATH = process.env.DB_PATH ?? 'control-plane.db';

const { app, store } = await createServer({ dbPath: DB_PATH, bindings: [] });

process.on('SIGTERM', () => {
  store.close();
  process.exit(0);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`control-plane listening on 127.0.0.1:${PORT}`);
});
```

**Step 4: Spusti testy — overí že prechádzajú**

```bash
cd src/control-plane && npm test
```

Expected: PASS — všetky testy zelené

**Step 5: Commit**

```bash
git add src/control-plane/src/server.ts src/control-plane/src/index.ts src/control-plane/src/__tests__/server.test.ts
git commit -m "feat(control-plane): add HTTP server with job submission and RBAC enforcement"
```

---

## Záverečný stav po Phase 1 skeleton

Po dokončení všetkých taskov:

```
src/control-plane/
├── src/
│   ├── types.ts           ✓ Core types (JobRecord, PolicyDecision, RoleBinding...)
│   ├── policy-engine.ts   ✓ Tier A/B/C classification by intent prefix
│   ├── rbac.ts            ✓ RBACEngine s role matrix zo Section 17
│   ├── job-store.ts       ✓ SQLite persistence s idempotency
│   ├── server.ts          ✓ Express HTTP server (POST /jobs, GET /health)
│   ├── index.ts           ✓ Entry point
│   └── __tests__/
│       ├── types.test.ts
│       ├── policy-engine.test.ts
│       ├── rbac.test.ts
│       ├── job-store.test.ts
│       └── server.test.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

Roadmap update po dokončení — v `docs/ROADMAP.md` odznačiť:
```
- [x] Control plane skeleton (authN/authZ, policy engine)
- [x] Risk tier classification (Tier A / B / C)
- [x] RBAC model (owner / admin / project-maintainer / viewer)
```

Nasleduje: **Scheduler + Queue** (Task 7+) — PostgreSQL job queue, idempotency ledger, serial-per-project execution.
