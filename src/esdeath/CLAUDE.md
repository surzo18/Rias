# CLAUDE.md - esdeath (ClawdBot / OpenClaw)

## Project Overview

OpenClaw personal assistant (Telegram + food/exercise tracking + AI news). The **Esdeath** persona acts as Adrian's life assistant with scheduled briefings and life coaching. Runs as a Docker Compose stack.

**Isolation note:** esdeath is intentionally isolated from the hub & spoke Docker model used by other projects in `D:\REPOS`. It manages its own Docker Compose stack independently. Do not integrate it into `docker-infrastructure/` or any shared Docker network.

## Services

| Service | Container | Description | Profile |
|---------|-----------|-------------|---------|
| `openclaw-gateway` | clawdbot-gateway | Main gateway (Node.js), Telegram bot, GPT-5.2 | default |
| `openclaw-cli` | clawdbot-cli | Interactive CLI client | `cli` |
| `openai-router` | clawdbot-openai-router | Nginx reverse proxy: routes `/v1/audio/speech` to local TTS, everything else to OpenAI API | default |
| `chatterbox` | clawdbot-chatterbox | Default GPU-accelerated TTS (voice cloning, Resemble AI) | default |
| `fish-speech` | clawdbot-fish-speech | Alternative TTS engine (Fish Audio) | `fish-speech` |
| `tts-adapter` | clawdbot-tts-adapter | OpenAI-compatible adapter for Fish Speech | `fish-speech` |
| `xtts` | clawdbot-xtts | XTTS v2 voice cloning (multilingual) | `xtts` |
| `kokoro-tts` | clawdbot-kokoro-tts | Kokoro FastAPI TTS | `kokoro` |

### Esdeath v2 Platform Services

| Service | Container | Port | Description | Profile |
|---------|-----------|------|-------------|---------|
| `ollama` | clawdbot-ollama | - | Local LLM inference (Qwen3, EuroLLM, GLM4) | `v2` |
| `llm-router` | clawdbot-llm-router | 8080 | LLM request classifier + router (Ollama/OpenAI) | `v2` |
| `audit-db` | clawdbot-audit-db | 9000 | Audit logging + query + approvals (SQLite + Telegram) | `v2` |
| `shell-sandbox` | clawdbot-shell | 9001 | Sandboxed command execution | `v2` |
| `web-browser` | clawdbot-web | 9002 | Headless browser (Puppeteer/Chromium) | `v2` |
| `email-tool` | clawdbot-email | 9003 | Gmail + Calendar via gog CLI | `v2` |
| `market-tool` | clawdbot-market | 9004 | Stock market data (Alpha Vantage) | `v2` |
| `weather-tool` | clawdbot-weather | 9005 | Weather data (wttr.in, no API key) | `v2` |
| `searxng` | clawdbot-searxng | 8080 | Self-hosted search (SearXNG, internal only) | `v2` |

**Networks:** `esdeath-internal` (all v2 + gateway/router), `esdeath-google` (email only), `esdeath-web` (browser + searxng), `esdeath-market` (market only), `esdeath-weather` (weather only), `esdeath-telegram` (audit-db only, for Telegram Bot API)

**Tier system (code-enforced):** safe (auto-execute), notice (auto + log), dangerous (tier-gate middleware blocks, creates approval in audit-db, sends Telegram notification — requires `approval_id` to proceed), forbidden (403 block)

## Docker Commands

```bash
# Build the OpenClaw image
docker build -t openclaw:local .

# Start the gateway stack
docker compose up -d

# Run the CLI (interactive, profile-activated)
docker compose --profile cli run --rm openclaw-cli

# View gateway logs
docker logs -f clawdbot-gateway

# Rebuild and restart
docker compose up -d --build

# Restart gateway (picks up workspace file changes)
docker compose restart openclaw-gateway

# --- Esdeath v2 Platform ---

# Start v2 services (audit-db, shell, email, web, market, ollama)
docker compose --profile v2 up -d --build

# Pull Ollama models (first time)
docker compose --profile v2 exec ollama bash /scripts/init-models.sh

# View v2 service logs
docker logs -f clawdbot-audit-db
docker logs -f clawdbot-shell
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_GATEWAY_PORT` | `18789` | Host port for gateway API |
| `OPENCLAW_BRIDGE_PORT` | `18790` | Host port for bridge |
| `OPENCLAW_GATEWAY_TOKEN` | - | Auth token (generate with `openssl rand -hex 32`) |
| `OPENCLAW_IMAGE` | `openclaw:local` | Docker image name |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `OPENAI_MODEL` | `gpt-5.2` | Model to use |
| `OPENAI_BASE_URL` | `http://llm-router:8080/v1` | LLM router (classifies + routes to Ollama/OpenAI) |
| `TELEGRAM_BOT_TOKEN` | - | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | - | Allowed Telegram chat ID |
| `TTS_UPSTREAM` | `chatterbox:8004` | TTS backend (see TTS Stack section) |

### v2 Platform Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | - | Claude API key (LLM fallback) |
| `TELEGRAM_LOG_CHANNEL_ID` | - | Telegram channel for audit logs |
| `TOOL_INTERNAL_SECRET` | - | JWT secret for inter-container auth |
| `ALPHA_VANTAGE_KEY` | - | Stock market API key (free tier) |
| `DAILY_BUDGET_USD` | `1.00` | Daily cloud LLM spending limit |

## Architecture

```
Port 18789 (gateway)   Port 18790 (bridge)
         \                  /
      [openclaw-gateway]
              |
      [llm-router] (Node.js proxy, classify + route)
         /         \
  [ollama:11434]  [openai-router] (nginx)
  (free, local)      /         \
                [OpenAI API]  [chatterbox] (GPU TTS)
```

- Gateway binds to LAN (`--bind lan`) on port 18789
- Bridge runs on port 18790
- Healthcheck: `GET http://127.0.0.1:18789/health`
- All ports are bound to `127.0.0.1` (loopback only)

## Security Hardening

All containers run with:
- **Read-only filesystem** (`read_only: true`)
- **No new privileges** (`security_opt: no-new-privileges:true`)
- **All capabilities dropped** (`cap_drop: ALL`)
- **Localhost-only ports** - both 18789 and 18790 bind to `127.0.0.1` only
- **Non-root user** (`user: "1000:1000"`) on gateway and CLI
- **tmpfs** with `noexec,nosuid` for `/tmp` and cache dirs
- **Log rotation** (10MB max, 3 files)
- External volume `clawdbot_home` for persistent data

## TTS Stack

### Default: Chatterbox TTS (Resemble AI)

Chatterbox is the default voice cloning engine:
- **Native OpenAI `/v1/audio/speech` endpoint** - no adapter needed (unlike Fish Speech)
- Voice files go in `voices/` directory as WAV format, referenced by filename in API calls
- GPU-accelerated with NVIDIA runtime
- Custom build: `Dockerfile.cu128` for CUDA 12.8 support

### GPU Compatibility (RTX 5090 / Blackwell)

The RTX 5090 uses `sm_120` (Blackwell architecture) which requires **PyTorch 2.9.0+cu128**:
- **Fish Speech does NOT support sm_120** - its Docker image ships older PyTorch
- **Chatterbox** is built from source with cu128 support (works on RTX 5090)
- **Kokoro** and **XTTS** support depends on their shipped PyTorch version

### Switching TTS Backend

The TTS backend is switchable via the `TTS_UPSTREAM` environment variable in `.env`:

| Value | Engine | Notes |
|-------|--------|-------|
| `chatterbox:8004` | Chatterbox (default) | Native OpenAI API, voice cloning |
| `tts-adapter:3100` | Fish Speech (via adapter) | Requires `--profile fish-speech`, no sm_120 |
| `kokoro-tts:8880` | Kokoro FastAPI | Requires `--profile kokoro` |

To switch, set `TTS_UPSTREAM` in `.env` and bring up the corresponding profile:

```bash
# Switch to Kokoro
echo 'TTS_UPSTREAM=kokoro-tts:8880' >> .env
docker compose --profile kokoro up -d
```

## Scheduled Jobs

| Time | Event | Type |
|------|-------|------|
| 07:00 daily | Morning briefing (inbox, calendar, weather KNM, market, AI news, tracking, costs, GitHub) | Cron |
| 21:00 daily | Evening recap (unread emails, tomorrow's schedule, day summary, tracking nudges, market close) | Cron |
| 19:00 Sun | Weekly review (7-day stats, trends, lessons learned, goals for next week) | Cron |
| 18:00 1st | Monthly review (full month analysis: health, productivity, finance, retrospective, goals) | Cron |

Cron config: `openclaw-data/config/cron/jobs.json`

## Workspace Files

| File | Purpose |
|------|---------|
| `SOUL.md` | Esdeath persona, identity, life coaching directives |
| `USER.md` | Adrian's preferences and context |
| `AGENTS.md` | Agent operational guidelines (memory, safety, error tracking) |
| `TOOLS.md` | Infrastructure notes, TTS config, tracking file docs |
| `MEMORY.md` | Long-term memory (integrations, security, learnings, preferences) |
| `FOOD.md` | Food tracking log |
| `EXERCISE.md` | Exercise tracking log |
| `HABITS.md` | Habit streaks tracker |

All workspace files live in `openclaw-data/config/workspace/`.

**Split ownership:** Workspace has its own `.git` managed by OpenClaw runtime. The esdeath repo tracks infrastructure config (`openclaw.json`, `cron/jobs.json`, `router/*`, `docker-compose.yml`). Workspace files are NOT in the esdeath repo.

## Integrations

| Integration | Skill | Binary | Auth Status |
|-------------|-------|--------|-------------|
| Gmail + Calendar | gog | installed | Pending OAuth (`gog auth add`) |
| GitHub | github | gh installed | Pending (`gh auth login`) |
| Weather | weather-tool | v2 container | Ready (wttr.in, no API key) |

## v2 OpenClaw Skills

Skills in `skills/` directory (deploy to `workspace/skills/` at runtime):

| Skill | Description |
|-------|-------------|
| `shell-exec` | Execute sandboxed commands |
| `email-assistant` | Read/send emails via Gmail |
| `calendar-assistant` | Google Calendar management |
| `web-researcher` | Browse web, search, screenshots |
| `market-data` | Stock quotes, alerts, watchlist |
| `weather` | Current weather and forecast (wttr.in) |
| `fitness-coach` | Food/exercise logging, habit tracking |
| `approval-gate` | Approval flow for dangerous actions |
| `audit-logger` | Log all tool actions to audit DB |

## Testing (v2)

```bash
# Unit tests (all modules)
npm run test:unit

# Integration tests (requires v2 Docker containers running)
npm run test:integration

# E2E tests
npm run test:e2e

# All tests
npm test

# Coverage
npm run test:coverage
```
