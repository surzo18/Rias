# Esdeath v2 - Personal AI Assistant Platform Design

**Date:** 2026-02-15
**Status:** Approved
**Author:** Adrian + Claude

## 1. Vision

Transform Esdeath from a Telegram chatbot with TTS into a full personal AI assistant platform that can autonomously handle tasks across email, calendar, filesystem, web, fitness coaching, and stock market - with the user approving dangerous actions via Telegram.

## 2. Design Principles

- **Security-first:** Every component sandboxed, least-privilege, no shared credentials
- **Build ON OpenClaw, not beside it:** OpenClaw is the brain, we add skills and tool containers
- **TDD mandatory:** RED-GREEN-REFACTOR for every component
- **Cost-optimized:** Local LLMs for simple tasks, cloud API only when needed
- **Portable:** `git clone` + `.env` + `docker compose up` = running system
- **Quality over speed:** Code review, test coverage, clean architecture

## 3. Current State (What Exists)

| Component | Status |
|-----------|--------|
| Telegram gateway (OpenClaw) | Working - allowlist, voice, streaming |
| LLM brain (GPT-5.2) | Working - via OpenAI router |
| Memory (file-based) | Working - MEMORY.md, daily logs, SOUL.md |
| TTS/Voice cloning | Working - 4 backends (Chatterbox, Fish, XTTS, Kokoro) |
| Cron jobs | Working - 7 scheduled (morning brief, health check...) |
| Gmail/Calendar CLI | Installed - pending OAuth setup |
| GitHub CLI | Installed - pending auth |
| Personal tracking | Basic - FOOD.md, EXERCISE.md, HABITS.md |
| Security hardening | Solid - read-only FS, cap_drop, localhost-only |
| Shell on PC | Missing |
| Web browsing | Missing |
| Stock market | Missing |
| Tests | Missing |
| Multi-LLM routing | Missing |
| Approval workflow | Missing |
| Audit logging | Missing |

## 4. Architecture Overview

### OpenClaw as Foundation

OpenClaw (v2026.2.13, MIT license, 145K+ GitHub stars) provides:
- Telegram message handling with security (allowlist, read-only config)
- Session management and lifecycle
- Cron job engine with timezone support and session isolation
- Heartbeat polling system (configurable interval)
- Skills/tools framework (3000+ community skills on ClawHub)
- Subagent spawning for isolated child tasks
- Workspace file persistence (git-managed)
- Multi-LLM provider support (OpenAI, Anthropic, Gemini, Groq...)

We build **skills and tool containers** on top of OpenClaw, not a separate orchestrator.

### Three-Layer Skill Architecture

```
OPENCLAW GATEWAY (core runtime - unmodified)
    │
    ▼
ESDEATH SKILL LAYER (new OpenClaw skills)
    │
    ├── Infrastructure Skills
    │   ├── approval-gate     → Tiered approval via Telegram
    │   ├── audit-logger      → TG log channel + SQLite
    │   ├── llm-router        → Ollama local / Cloud fallback
    │   └── enhanced-memory   → Semantic search, auto-summarization
    │
    ├── Assistant Skills (intelligence)
    │   ├── email-assistant   → Categorization, priority, drafts
    │   ├── calendar-assist   → Planning, conflicts, reminders
    │   ├── fitness-coach     → Plans, nutrition, adaptation
    │   └── web-researcher    → Search, scrape, summarize
    │
    └── Tool Skills (actions)
        ├── shell-exec        → Sandboxed PC commands (allowlist)
        ├── file-manager      → Read/write/move files
        └── market-data       → Prices, alerts, portfolio
    │
    ▼
DOCKER SERVICES (sandboxed containers)
    ├── ollama          → Local LLM models (GPU)
    ├── shell-sandbox   → Isolated command execution
    ├── web-browser     → Headless Chrome
    ├── email-tool      → gog CLI wrapper
    ├── market-tool     → Stock API wrapper
    └── audit-db        → SQLite storage
```

### Container Security Matrix

```
                  TG     OpenAI  Google  File    Shell  Net     GPU
                  Token  Key     OAuth   System  Exec   work
                  ─────  ─────   ──────  ──────  ─────  ─────   ───
Gateway           YES    YES     NO      WS¹     NO     YES     NO
Ollama            NO     NO      NO      NO      NO     INT²    YES
Shell-sandbox     NO     NO      NO      MNT³    YES⁴   NONE    NO
Web-browser       NO     NO      NO      NO      NO     HTTPS   NO
Email-tool        NO     NO      YES     NO      NO     GOG⁵    NO
Market-tool       NO     NO      NO      NO      NO     STK⁶    NO
Audit-DB          NO     NO      NO      AUD⁷    NO     NONE    NO

¹ Workspace volume only
² Internal Docker network only
³ Explicitly mounted directories, default read-only
⁴ Allowlisted commands only
⁵ *.google.com, *.googleapis.com only
⁶ Stock API endpoints only
⁷ Audit volume, append-only
```

### Container Communication

All tool containers expose a unified HTTP API on the internal Docker network (`esdeath-internal`). Only the gateway can reach them. No tool container can reach another tool container.

```
POST /execute
Authorization: Bearer <internal-jwt>

Request:  { request_id, action, params, timeout_ms }
Response: { request_id, status, result, metadata }

GET /health → { status: "ok", uptime_s: 3600 }
```

## 5. Approval Flow

### Tiered Model

| Tier | Actions | Behavior |
|------|---------|----------|
| **SAFE** | Chat, weather, memory read, summarize, fitness read | Auto-execute, log |
| **NOTICE** | Email read, calendar read, web search, stock prices, GitHub read | Auto-execute, log, notify channel |
| **DANGEROUS** | Shell command, send email, file write/delete, calendar create | Wait for Telegram approval (30min timeout) |
| **FORBIDDEN** | .env access, config write, Docker exec, credential access | Always reject, alert |

### Approval via Telegram

Dangerous actions send an inline keyboard to the user's DM:

```
Action: shell_exec
Command: systeminfo
Tier: DANGEROUS
Reason: "System info check"

[Approve]  [Reject]

Auto-cancel in 30 minutes
```

### State Machine

```
PENDING → APPROVED → EXECUTING → SUCCESS
    │         │                     └→ FAILED
    ├→ REJECTED
    └→ TIMED_OUT
```

### Configuration

```jsonc
// approval-config.json
{
  "tiers": {
    "safe":      { "behavior": "auto_execute", "notify": false },
    "notice":    { "behavior": "auto_execute", "notify": true },
    "dangerous": { "behavior": "require_approval", "timeout_minutes": 30, "max_retries": 1 },
    "forbidden": { "behavior": "always_reject", "alert": true }
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

### Security Guarantees

- Unknown action = dangerous (require approval)
- Tier escalation only - skills cannot downgrade tiers
- Config is read-only at runtime
- Rate limiting: max 5 dangerous requests per hour
- Approval tokens: JWT with expiry, single-use, bound to request_id

### Persistence

```sql
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  tier TEXT NOT NULL,
  params TEXT NOT NULL,             -- JSON (sanitized)
  reason TEXT,
  state TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,                 -- 'user', 'timeout', 'system'
  execution_result TEXT,
  error TEXT
);
```

## 6. Audit Logging

### Dual-Write Architecture

Every action writes to two destinations simultaneously:

1. **Telegram Log Channel** - real-time, human-readable, searchable in Telegram
2. **SQLite Audit DB** - queryable, persistent, structured

### Log Entry Structure

```typescript
interface AuditEntry {
  id: string;                     // UUID
  timestamp: string;              // ISO8601
  source: 'user' | 'cron' | 'heartbeat' | 'system';
  action: string;
  tool: string | null;
  tier: 'safe' | 'notice' | 'dangerous' | 'forbidden';
  params: Record<string, any>;    // sanitized, no secrets
  state: 'success' | 'failed' | 'blocked' | 'pending' | 'timeout';
  result_summary: string;
  error: string | null;
  duration_ms: number;
  llm_provider: string | null;
  tokens_used: number;
  estimated_cost_usd: number;
  approval_id: string | null;
}
```

### Telegram Channel Behavior

- Safe actions: batched every 5 minutes (reduce spam)
- Dangerous/forbidden: sent immediately
- Daily summary at 23:00 (activity, costs, security events)

### Sanitization Rules

Never log: passwords, API keys, tokens, OAuth secrets, credit card numbers, session IDs. Patterns like `sk-*`, `ghp_*`, 16-digit numbers are auto-redacted to `[REDACTED]`.

### Retention Policy

- Safe/notice logs: 90 days
- Dangerous/forbidden logs: 1 year
- Daily cost aggregates: never delete

### SQLite Schema

```sql
CREATE TABLE audit_log (
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

CREATE VIEW daily_costs AS
SELECT
  date(timestamp) as day,
  llm_provider,
  COUNT(*) as requests,
  SUM(tokens_used) as total_tokens,
  SUM(estimated_cost_usd) as total_cost,
  AVG(duration_ms) as avg_duration
FROM audit_log
GROUP BY date(timestamp), llm_provider;

CREATE VIEW security_events AS
SELECT * FROM audit_log
WHERE tier = 'forbidden' OR state = 'blocked'
ORDER BY timestamp DESC;
```

## 7. LLM Routing

### Model Selection by Task

| Category | Examples | Model | Cost |
|----------|----------|-------|------|
| Routing | Request classification, tier detection | Qwen3-8B (local) | $0.00 |
| Simple chat | "What time is it?", reminders | Qwen3-8B (local) | $0.00 |
| Slovak conversation | Chat, coaching, motivation | EuroLLM-9B (local) | $0.00 |
| Summarization | Email digest, daily recap | EuroLLM-9B (local) | $0.00 |
| Tool calling | Tool selection + parameters | GLM-4.7 (local) | $0.00 |
| Complex reasoning | Planning, analysis, multi-step | GPT-5.2 (cloud) | ~$0.005/req |
| Code/technical | Debugging, scripts | GPT-5.2 / Claude (cloud) | ~$0.005/req |

### Ollama Setup (local models)

```
qwen3:8b      ~5GB   - routing, simple tasks
euroLLM:9b    ~6GB   - Slovak language, summarization
glm4:7b       ~5GB   - tool calling, agent tasks
─────────────────────
Total:        ~16GB  (of 32GB RTX 5090 VRAM, rest for Chatterbox TTS)
```

### Fallback Chain

```
Primary (selected) → Fallback #1 (cloud alt) → Fallback #2 (local degraded) → Error + alert
```

### Budget Control

```jsonc
{
  "budget": {
    "daily_limit_usd": 1.00,
    "warning_threshold_usd": 0.50,
    "when_exceeded": "local_only"
  }
}
```

When daily spend exceeds $1.00, all requests route to local models only. Notification sent to log channel.

### Provider Configuration

```jsonc
{
  "providers": {
    "ollama": {
      "base_url": "http://ollama:11434/v1",
      "cost_per_1m_tokens": 0,
      "max_concurrent": 3,
      "timeout_ms": 30000
    },
    "openai": {
      "base_url": "http://openai-router:8080/v1",
      "api_key": "${OPENAI_API_KEY}",
      "cost_per_1m_tokens": 5.00,
      "max_concurrent": 5,
      "timeout_ms": 60000
    },
    "anthropic": {
      "base_url": "https://api.anthropic.com/v1",
      "api_key": "${ANTHROPIC_API_KEY}",
      "cost_per_1m_tokens": 3.00,
      "max_concurrent": 5,
      "timeout_ms": 60000
    }
  }
}
```

## 8. Enhanced Memory

### Problem

Current file-based memory requires reading entire Markdown files for any query. A question like "what did I eat last Tuesday?" forces the LLM to read all of FOOD.md (potentially thousands of lines), wasting tokens and money.

### Solution: Hybrid Markdown + SQLite

- **Markdown files remain source of truth** (OpenClaw reads them natively at startup)
- **SQLite provides queryable index** (structured queries, full-text search)
- **Sync is one-directional:** Markdown → SQLite (never reverse)
- **If SQLite corrupts:** resync from Markdown, zero data loss

### Memory Database Schema

```sql
-- Factual knowledge (key-value with context)
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,           -- 'preference', 'health', 'work', 'personal'
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,      -- 0.0-1.0
  source TEXT,                      -- 'user_said', 'inferred', 'tracked'
  first_seen TEXT NOT NULL,
  last_confirmed TEXT NOT NULL,
  UNIQUE(category, key)
);

-- Episodic memory (events, conversations)
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,                -- 'conversation', 'task', 'event', 'decision'
  summary TEXT NOT NULL,
  details TEXT,
  tags TEXT,                         -- JSON array
  emotional_tone TEXT,
  importance REAL DEFAULT 0.5
);

-- Structured food tracking
CREATE TABLE food_log (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  meal TEXT NOT NULL,                -- 'breakfast', 'lunch', 'dinner', 'snack'
  description TEXT NOT NULL,
  calories_est INTEGER,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  logged_at TEXT NOT NULL
);

-- Structured exercise tracking
CREATE TABLE exercise_log (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  activity TEXT NOT NULL,
  duration_min INTEGER,
  intensity TEXT,
  notes TEXT,
  logged_at TEXT NOT NULL
);

-- Habit tracking
CREATE TABLE habits (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  habit TEXT NOT NULL,
  completed INTEGER NOT NULL,
  streak INTEGER DEFAULT 0,
  UNIQUE(date, habit)
);

-- Auto-generated summaries
CREATE TABLE summaries (
  id INTEGER PRIMARY KEY,
  period TEXT NOT NULL,              -- '2026-W07', '2026-02'
  type TEXT NOT NULL,                -- 'weekly', 'monthly'
  content TEXT NOT NULL,
  stats TEXT,                        -- JSON
  generated_at TEXT NOT NULL
);

-- Full-text search
CREATE VIRTUAL TABLE episodes_fts USING fts5(summary, details, tags, content=episodes, content_rowid=id);
CREATE VIRTUAL TABLE summaries_fts USING fts5(content, content=summaries, content_rowid=id);
```

### Memory Skill Functions

1. **SYNC** (cron, hourly): Parse FOOD.md, EXERCISE.md, HABITS.md, daily logs → SQLite tables
2. **QUERY** (on-demand): Structured SQL queries instead of reading entire files (~95-99% token savings)
3. **SUMMARIZE** (cron, Sunday 18:00): LLM summarizes weekly episodes → summaries table

### Auto-Summarization Lifecycle

```
Daily logs (full detail) → 30 days
Weekly summaries (~200 words) → 12 months
Monthly summaries (~500 words) → never delete
Facts → never delete (update in place)
Food/exercise raw data → 6 months, aggregates forever
```

### Automatic Fact Extraction

When user states a preference or fact, the LLM extracts it into the facts table:
- "I switched to green tea" → `(preference, morning_drink, green tea, 1.0, user_said)`
- Next time Esdeath suggests a morning plan, she queries facts table → uses green tea, not coffee

## 9. Tool Containers

### 9a. Shell Sandbox

**Purpose:** Execute pre-approved commands on the host PC.
**Container:** No network, no API keys, only mounted directories.

**Allowlist categories:**
- System info (read-only): `systeminfo`, `tasklist`, `hostname`
- File listing (read): `dir`, `type` (only allowed paths)
- File operations (write): `copy`, `move`, `del`, `mkdir` (only /mnt/downloads)
- App launching: `start` (only allowlisted apps: notepad, calc, explorer)
- Network diagnostic: `ping` (max 4 count)

**Blocked patterns:** Pipe (`|`), command separator (`;`, `&`), backtick, subshell (`$(`), redirect (`>`), path traversal (`..`), powershell, cmd /c, registry, net commands, format.

**Mounted volumes:**
- `/mnt/documents` → `C:\Users\adria\Documents` (read-only)
- `/mnt/downloads` → `C:\Users\adria\Downloads` (read-write)

### 9b. Email Tool

**Purpose:** Gmail and Calendar operations via `gog` CLI.
**Container:** Network restricted to `*.google.com` and `*.googleapis.com` only.

**Actions:**
- Read: `list_unread`, `search`, `read_email`, `list_labels` (notice tier)
- Write: `send_email`, `reply_email`, `delete_email` (dangerous tier)
- Calendar: `calendar_today`, `calendar_week` (notice), `calendar_create` (dangerous)
- Multi-account: primary, work, spam (3 Gmail accounts)

### 9c. Web Browser

**Purpose:** Headless Chrome for web search and scraping.
**Container:** Outbound HTTPS only, no filesystem, no credentials. Memory limited to 1GB.

**Actions:** `search` (DuckDuckGo), `fetch_url`, `screenshot`, `extract` (CSS selectors).

**SSRF protection:** Blocks localhost, private networks (10.*, 172.16.*, 192.168.*), AWS metadata (169.254.*), file:// and ftp:// protocols.

### 9d. Market Tool

**Purpose:** Stock market data and price alerts.
**Container:** Network restricted to stock API endpoints only.

**Actions:** `quote`, `history`, `watchlist`, `news`, `alert_set`, `alert_list`.
**Read-only** - no trading capability. Uses Alpha Vantage free tier.

### 9e. Fitness Coach (skill in gateway, not container)

Runs as OpenClaw skill inside the gateway - reads/writes only workspace files and memory DB.

**Capabilities:**
- Meal analysis: Estimate calories/macros after food logging
- Daily check: Midday calorie progress vs target
- Workout plan: Weekly plan generation based on history
- Weekly report: Food, exercise, streaks, progress summary
- Streak alerts: Warn before streak breaks
- Adaptation: Adjust recommendations after 2+ weeks of data

## 10. Docker Infrastructure

### Container Inventory

| Container | New/Existing | Image Size | GPU | Network |
|-----------|-------------|------------|-----|---------|
| openclaw-gateway | Existing | ~500MB | No | internal + external |
| openai-router | Existing | ~30MB | No | internal + OpenAI |
| chatterbox | Existing | ~4GB | Yes | internal only |
| fish-speech | Existing (profile) | ~2GB | Yes | internal only |
| xtts | Existing (profile) | ~3GB | Yes | internal only |
| kokoro-tts | Existing (profile) | ~2GB | Yes | internal only |
| ollama | **New** | ~2GB + models | Yes | internal only |
| shell-sandbox | **New** | ~50MB | No | internal only, NO external |
| web-browser | **New** | ~400MB | No | internal + HTTPS |
| email-tool | **New** | ~80MB | No | internal + Google |
| market-tool | **New** | ~50MB | No | internal + stock APIs |
| audit-db | **New** | ~20MB | No | internal only, NO external |

**Total: ~12 containers** (6 existing + 6 new)

### Docker Networks

| Network | Purpose | Containers |
|---------|---------|------------|
| `esdeath-internal` | Inter-container communication | All |
| `esdeath-google` | Egress to Google APIs | email-tool |
| `esdeath-web` | Egress to HTTPS | web-browser |
| `esdeath-market` | Egress to stock APIs | market-tool |

### Hardening (all containers)

```yaml
read_only: true
cap_drop: [ALL]
security_opt: [no-new-privileges:true]
tmpfs: [/tmp:noexec,nosuid]
logging: { options: { max-size: "10m", max-file: "3" } }
```

### New Environment Variables

```env
# Existing (unchanged)
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_TOKEN=...
OPENAI_API_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=5914523498
TTS_UPSTREAM=openai

# New
ANTHROPIC_API_KEY=...              # Claude fallback
TELEGRAM_LOG_CHANNEL_ID=...        # Audit log channel
TOOL_INTERNAL_TOKEN=...            # JWT for inter-container auth
ALPHA_VANTAGE_KEY=...              # Stock market API (free tier)
DAILY_BUDGET_USD=1.00              # Cloud LLM spending limit
```

## 11. Testing Strategy

### Test Pyramid

```
        E2E (2-3)         Full flow: Telegram → Tool → Response
      Integration (15-20)  Container ↔ container communication
    Unit (100+)            Every function isolated, no Docker
```

### Framework

- **Runner:** Vitest
- **Workspaces:** unit (no Docker), integration (docker compose up), e2e (full stack)
- **CI pipeline:** Unit (30s) → Integration (2min) → E2E (5min)

### Coverage Targets

| Component | Target | Reason |
|-----------|--------|--------|
| Approval engine | 95%+ | Security-critical |
| Shell allowlist | 95%+ | Injection protection |
| Web URL validation | 95%+ | SSRF protection |
| Audit sanitization | 95%+ | Leak protection |
| LLM routing | 80%+ | Business logic |
| Memory sync/query | 80%+ | Data integrity |
| Tool API handlers | 70%+ | Basic functionality |

### Key Test Categories

- **Security tests:** Command injection, path traversal, SSRF, credential leakage
- **Approval tests:** State machine transitions, timeout handling, tier classification
- **Routing tests:** Model selection, fallback chains, budget enforcement
- **Memory tests:** Markdown parsing, sync deduplication, FTS search, fact extraction
- **Integration tests:** Gateway → tool container HTTP flow, auth validation
- **E2E tests:** Telegram message → complete response with audit trail

## 12. Implementation Priority

| Phase | Components | Depends On |
|-------|-----------|------------|
| **Phase 1: Core** | Orchestrator infra: approval-gate, audit-logger, llm-router, Ollama | Nothing |
| **Phase 2: Shell** | shell-sandbox container + skill | Phase 1 (approval) |
| **Phase 3: Email/Calendar** | email-tool container + assistant skills, OAuth setup | Phase 1 (audit) |
| **Phase 4: Web** | web-browser container + researcher skill | Phase 1 |
| **Phase 5: Memory** | enhanced-memory skill + SQLite, sync, FTS | Phase 1 (audit-db) |
| **Phase 6: Fitness** | fitness-coach skill (uses Phase 5 memory) | Phase 5 |
| **Phase 7: Market** | market-tool container + skill (lowest priority) | Phase 1 |

## 13. Non-Goals (Explicitly Out of Scope)

- Multi-user support (single user: Adrian)
- Kubernetes/cloud deployment
- Web dashboard/UI
- Trading/order execution
- Voice commands (TTS output only, Whisper input already exists)
- Mobile app
- Modifying OpenClaw core framework
