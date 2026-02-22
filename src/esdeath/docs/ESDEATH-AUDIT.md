# Esdeath Platform — Comprehensive Audit

**Date:** 2026-02-15
**Version:** v2 Platform (post-integration)
**Author:** Claude Code (Opus 4.6)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Inputs & Outputs](#3-inputs--outputs)
4. [Security Audit](#4-security-audit)
5. [Token & Cost Consumption](#5-token--cost-consumption)
6. [Use Case Possibilities](#6-use-case-possibilities)
7. [User Workflow](#7-user-workflow)
8. [Models & AI Stack](#8-models--ai-stack)
9. [Technical Implementation](#9-technical-implementation)
10. [Data Flow Analysis](#10-data-flow-analysis)
11. [Reliability & Observability](#11-reliability--observability)
12. [Scalability & Portability](#12-scalability--portability)
13. [Risk Assessment](#13-risk-assessment)
14. [Recommendations](#14-recommendations)

---

## 1. Executive Summary

Esdeath is a **self-hosted personal AI assistant platform** running as a Docker Compose stack on a Windows desktop (RTX 5090). It combines a cloud LLM (GPT-5.2) with local GPU-accelerated TTS, a character persona ("General Esdeath"), and 8 specialized tool containers for real-world interactions (email, calendar, shell, web, market, fitness tracking, audit logging, and approval gating).

**Key Strengths:**
- Defense-in-depth security (network isolation, read-only filesystems, capability drops)
- 4-tier approval system prevents unauthorized actions
- Full audit trail of all tool actions
- Local TTS with voice cloning (no data leaves the machine for voice)
- Modular architecture — tools are independently deployable containers

**Key Risks:**
- Single point of failure: user's desktop PC (sleep/reboot kills all services)
- Cloud LLM dependency: GPT-5.2 API key exposure is the highest-impact secret
- No automated backup strategy for workspace/memory files
- Exec tool allowlist is only as secure as the curl commands the LLM constructs

---

## 2. Architecture Overview

### 2.1 High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────┐  │
│  │ OpenAI API   │  │ Telegram API │  │ DuckDuckGo│  │Alpha Vant.│  │
│  │ (GPT-5.2)    │  │ (Bot API)    │  │ (Search)  │  │ (Stocks)  │  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  └─────┬─────┘  │
└─────────┼─────────────────┼────────────────┼───────────────┼────────┘
          │                 │                │               │
    ┌─────┴─────────────────┴────────────────┴───────────────┴─────┐
    │              esdeath-external (bridge network)                │
    └─────┬─────────────────┬──────────────────────────────────────┘
          │                 │
  ┌───────┴────────┐  ┌────┴────────────┐
  │ openai-router  │  │ openclaw-gateway│◄─── localhost:18789
  │ (nginx:1.27)   │  │ (Node.js)       │◄─── localhost:18790
  │ :8080 internal │  │ GPT-5.2 agent   │
  └───────┬────────┘  └────┬────────────┘
          │                │
    ┌─────┴────────────────┴───────────────────────────────────────┐
    │              esdeath-internal (bridge, NO internet)           │
    └─────┬──────┬──────┬──────┬──────┬──────┬─────────────────────┘
          │      │      │      │      │      │
     ┌────┴──┐┌──┴───┐┌─┴────┐┌┴─────┐┌┴────┐┌┴──────┐
     │audit  ││shell ││email ││ web  ││mrkt ││ollama │
     │ :9000 ││:9001 ││:9003 ││:9002 ││:9004││:11434 │
     └───────┘└──────┘└──┬───┘└──┬───┘└──┬──┘└───────┘
                         │       │       │
                    ┌────┴──┐┌───┴──┐┌───┴────┐
                    │google ││ web  ││market  │
                    │network││ net  ││network │
                    └───────┘└──────┘└────────┘
```

### 2.2 Container Inventory

```
┌────────────────────────────────────────────────────────────────────┐
│ CONTAINER              │ IMAGE                │ PROFILE │ GPU     │
├────────────────────────┼──────────────────────┼─────────┼─────────┤
│ clawdbot-gateway       │ openclaw-gateway     │ default │ No      │
│ clawdbot-openai-router │ nginx:1.27-alpine    │ default │ No      │
│ clawdbot-chatterbox    │ chatterbox-tts:cu128 │ default │ Yes     │
│ clawdbot-audit-db      │ audit-db (custom)    │ v2      │ No      │
│ clawdbot-shell         │ shell-sandbox (cust) │ v2      │ No      │
│ clawdbot-email         │ email-tool (custom)  │ v2      │ No      │
│ clawdbot-web           │ web-browser (custom) │ v2      │ No      │
│ clawdbot-market        │ market-tool (custom) │ v2      │ No      │
│ clawdbot-ollama        │ ollama/ollama:latest │ v2      │ Yes     │
├────────────────────────┼──────────────────────┼─────────┼─────────┤
│ clawdbot-fish-speech   │ fishaudio/fish-speech│ fish    │ Yes     │
│ clawdbot-tts-adapter   │ tts-adapter (custom) │ fish    │ No      │
│ clawdbot-xtts          │ xtts-v2:cu128        │ xtts    │ Yes     │
│ clawdbot-kokoro-tts    │ kokoro-fastapi-gpu   │ kokoro  │ Yes     │
│ clawdbot-cli           │ openclaw-gateway     │ cli     │ No      │
└────────────────────────┴──────────────────────┴─────────┴─────────┘
```

### 2.3 Network Topology

```
┌─────────────────────────────────────────────────────────┐
│ esdeath-internal (internal: true — NO internet access)  │
│                                                         │
│  gateway, router, audit-db, shell, email, web, market,  │
│  ollama                                                 │
│                                                         │
│  Purpose: All v2 tools communicate here. No egress.     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ esdeath-external (bridge — internet access)             │
│                                                         │
│  gateway, router                                        │
│                                                         │
│  Purpose: Telegram API, OpenAI API access               │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────────┐  ┌─────────────────────┐
│ esdeath-google (bridge)      │  │ esdeath-web (bridge) │
│  email-tool only             │  │  web-browser only    │
│  Purpose: Gmail/Calendar API │  │  Purpose: Web scrape │
└──────────────────────────────┘  └─────────────────────┘

┌──────────────────────────────┐
│ esdeath-market (bridge)      │
│  market-tool only            │
│  Purpose: Alpha Vantage API  │
└──────────────────────────────┘
```

**Key design:** Each tool gets its own dedicated external network for the specific API it needs. No tool can access APIs it shouldn't. The internal network has no internet access at all — tools on `esdeath-internal` can only talk to each other.

---

## 3. Inputs & Outputs

### 3.1 Inputs (Vstupy)

```
┌─────────────────────────────────────────────────────────────────┐
│                         INPUTS                                  │
├──────────────────┬──────────────┬────────────────────────────────┤
│ Source           │ Format       │ Example                        │
├──────────────────┼──────────────┼────────────────────────────────┤
│ Telegram text    │ UTF-8 string │ "Ake su Apple akcie?"          │
│ Telegram voice   │ OGG audio    │ /media/inbound/file_XXX.ogg    │
│ Cron trigger     │ JSON prompt  │ jobs.json → agentTurn message  │
│ Heartbeat poll   │ system event │ Every 60 min (HEARTBEAT.md)    │
├──────────────────┼──────────────┼────────────────────────────────┤
│ Workspace files  │ Markdown     │ SOUL.md, MEMORY.md, USER.md    │
│ Skill definitions│ Markdown     │ skills/*/SKILL.md              │
│ Voice reference  │ WAV audio    │ voices/esdeath.wav             │
│ Config           │ JSON         │ openclaw.json                  │
│ Env variables    │ .env         │ API keys, tokens, secrets      │
├──────────────────┼──────────────┼────────────────────────────────┤
│ OpenAI API       │ JSON         │ GPT-5.2 completion response    │
│ Google API       │ JSON         │ Gmail/Calendar data            │
│ Alpha Vantage    │ JSON         │ Stock quotes, history          │
│ DuckDuckGo       │ HTML         │ Web search results             │
│ Web pages        │ HTML         │ Scraped content                │
│ Shell output     │ stdout/stderr│ Command results from host PC   │
│ Host filesystem  │ Files        │ /mnt/documents (ro),           │
│                  │              │ /mnt/downloads (rw)            │
└──────────────────┴──────────────┴────────────────────────────────┘
```

### 3.2 Outputs (Výstupy)

```
┌─────────────────────────────────────────────────────────────────┐
│                         OUTPUTS                                 │
├──────────────────┬──────────────┬────────────────────────────────┤
│ Destination      │ Format       │ Example                        │
├──────────────────┼──────────────┼────────────────────────────────┤
│ Telegram text    │ UTF-8 string │ "Apple je na $198.50, +2.3%"   │
│ Telegram audio   │ MP3/OGG      │ TTS voice (Esdeath persona)    │
├──────────────────┼──────────────┼────────────────────────────────┤
│ FOOD.md          │ Markdown     │ "- Obed: Kurca (~500 kcal)"    │
│ EXERCISE.md      │ Markdown     │ "- Beh: 30 min, 5km"          │
│ HABITS.md        │ Markdown     │ Streak updates, checkboxes     │
│ memory/YYYY-MM-DD│ Markdown     │ Daily notes                    │
│ MEMORY.md        │ Markdown     │ Long-term memory (curated)     │
├──────────────────┼──────────────┼────────────────────────────────┤
│ Audit DB         │ SQLite rows  │ Every action with tier, dur.   │
│ Shell commands   │ via sandbox  │ Commands on host PC            │
│ Emails           │ via Gmail API│ Sent emails (DANGEROUS tier)   │
│ Calendar events  │ via Google   │ Created events (DANGEROUS tier)│
│ Market alerts    │ SQLite       │ Price alerts, watchlist         │
│ Files            │ filesystem   │ Writes to /mnt/downloads       │
└──────────────────┴──────────────┴────────────────────────────────┘
```

### 3.3 End-to-End Data Flow

```
  INPUT                    PROCESSING                   OUTPUT
  =====                    ==========                   ======

  Telegram msg ──>┐
  Voice msg ─────>┤    ┌──────────────────┐
  Cron trigger ──>├───>│  OpenClaw Gateway │
  Heartbeat ─────>┤    │                  │
                  │    │  1. Parse input   │
  Workspace ─────>┤    │  2. System prompt │───> Telegram text
  Skills ────────>┤    │     (SOUL+skills) │───> Telegram audio
  Config ────────>┘    │  3. GPT-5.2 call  │───> File updates
                       │  4. Tool exec?    │───> Audit log
                       │     ┌─────────┐   │───> Shell cmds
  Google API <────────>│     │exec curl│   │───> Emails
  Alpha Vantage <─────>│     │-> tool  │   │───> Calendar
  DuckDuckGo <────────>│     │  ctr    │   │───> Market data
  Host filesystem <───>│     └─────────┘   │
                       │  5. Generate resp  │
                       │  6. TTS (optional) │
                       └──────────────────┘
```

### 3.4 Input/Output Classification by Sensitivity

```
┌────────────────────────────────────────────────────────────────┐
│                    I/O SENSITIVITY MATRIX                       │
├──────────────────┬─────────────┬──────────┬─────────────────────┤
│ I/O              │ Direction   │ Sensitiv.│ Protection          │
├──────────────────┼─────────────┼──────────┼─────────────────────┤
│ API keys (.env)  │ Input       │ HIGH     │ .gitignore, no logs │
│ OAuth tokens     │ Input       │ HIGH     │ Encrypted volume    │
│ Telegram msgs    │ Both        │ MEDIUM   │ TLS, allowlist      │
│ Email content    │ Both        │ MEDIUM   │ OAuth2, TLS         │
│ MEMORY.md        │ Both        │ MEDIUM   │ Main session only   │
│ Food/Exercise    │ Output      │ LOW      │ Local files only    │
│ Market data      │ Input       │ LOW      │ Public data         │
│ Audit logs       │ Output      │ LOW      │ Local SQLite        │
│ Shell output     │ Input       │ MEDIUM   │ Allowlisted cmds    │
│ Web content      │ Input       │ LOW      │ SSRF protection     │
└──────────────────┴─────────────┴──────────┴─────────────────────┘
```

---

## 4. Security Audit

### 4.1 Container Hardening Matrix

```
┌──────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Container    │ read_only│ no-new-  │ cap_drop │ non-root │ tmpfs    │
│              │          │ privs    │ ALL      │ user     │ noexec   │
├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ gateway      │    ✓     │    ✓     │    ✓     │ 1000:1000│    ✓     │
│ router       │    ✓     │    ✓     │    ✓*    │ default  │    ✓     │
│ chatterbox   │    -     │    ✓     │    ✓     │ default  │    ✓     │
│ audit-db     │    ✓     │    ✓     │    ✓     │ 1000:1000│    ✓     │
│ shell-sandbox│    ✓     │    ✓     │    ✓     │ 1000:1000│    ✓     │
│ email-tool   │    ✓     │    ✓     │    ✓     │ 1000:1000│    ✓     │
│ web-browser  │    ✓     │    ✓     │    ✓**   │ default  │    ✓     │
│ market-tool  │    ✓     │    ✓     │    ✓     │ 1000:1000│    ✓     │
│ ollama       │    -     │    -     │    -     │ default  │    -     │
└──────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

*  router: cap_add CHOWN (required by nginx)
** web-browser: cap_add SYS_ADMIN (required by Chromium sandbox)
```

**Findings:**
- **GOOD:** 7 of 9 containers run with read-only filesystem
- **GOOD:** 8 of 9 containers drop all capabilities
- **CONCERN:** Ollama has NO hardening (no read_only, no cap_drop, no no-new-privs). It's GPU-bound and likely needs privileges, but should at least have `no-new-privileges`.
- **CONCERN:** Chatterbox lacks read-only filesystem (model downloads need write access to cache)
- **CONCERN:** web-browser has `SYS_ADMIN` capability — this is powerful but necessary for Chromium's sandboxing. Mitigated by 1GB memory limit and 1 CPU cap.

### 4.2 Network Security Analysis

```
┌────────────────────────────────────────────────────────────────┐
│                    ATTACK SURFACE MAP                          │
├──────────────────┬─────────────────────────────────────────────┤
│ Exposed Ports    │ 127.0.0.1:18789 (gateway)                  │
│ (host-accessible)│ 127.0.0.1:18790 (bridge)                   │
│                  │ 127.0.0.1:9000  (audit-db)                 │
│                  │ 127.0.0.1:9001  (shell-sandbox)            │
├──────────────────┼─────────────────────────────────────────────┤
│ Binding          │ ALL ports bind to 127.0.0.1 only            │
│                  │ Not accessible from LAN or internet         │
├──────────────────┼─────────────────────────────────────────────┤
│ Egress           │ Gateway → Telegram, OpenAI                  │
│ (outbound)       │ email-tool → Google Workspace               │
│                  │ web-browser → any URL (SSRF-validated)       │
│                  │ market-tool → Alpha Vantage                  │
│                  │ Everything else → blocked (internal network) │
└──────────────────┴─────────────────────────────────────────────┘
```

**Verdict:** Network isolation is excellent. Each tool has minimal, purpose-specific internet access. The internal network prevents cross-contamination.

### 4.3 Secret Management

```
┌────────────────────────────────┬────────────┬────────────────────────┐
│ Secret                         │ Stored In  │ Risk Level             │
├────────────────────────────────┼────────────┼────────────────────────┤
│ OPENAI_API_KEY                 │ .env file  │ HIGH — cloud billing   │
│ TELEGRAM_BOT_TOKEN             │ .env file  │ MEDIUM — bot takeover  │
│ OPENCLAW_GATEWAY_TOKEN         │ .env file  │ MEDIUM — gateway auth  │
│ TOOL_INTERNAL_SECRET           │ .env file  │ LOW — internal only    │
│ ALPHA_VANTAGE_KEY              │ .env file  │ LOW — free tier        │
│ GOG_KEYRING_PASSWORD           │ .env file  │ LOW — local keyring    │
│ ANTHROPIC_API_KEY              │ .env file  │ HIGH — cloud billing   │
└────────────────────────────────┴────────────┴────────────────────────┘
```

**Findings:**
- **.env file is NOT in git** (verified by .gitignore) — GOOD
- **No secrets vault** (Docker Secrets, HashiCorp Vault) — all secrets in plaintext .env
- **TOOL_INTERNAL_SECRET** is passed as env var to every container — if any container is compromised, attacker gets inter-container auth
- **No secret rotation** mechanism — tokens are static until manually changed

### 4.4 Exec Tool Security Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXEC TOOL ATTACK SURFACE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Config: host=gateway, security=allowlist, allowlist=[curl]       │
│                                                                 │
│ The LLM constructs curl commands from skill instructions.       │
│ These commands run inside the gateway container.                │
│                                                                 │
│ MITIGATIONS:                                                    │
│ ├─ Only curl is in the allowlist (no sh, bash, etc.)            │
│ ├─ Gateway filesystem is read-only                              │
│ ├─ Gateway runs as non-root (1000:1000)                         │
│ ├─ Gateway has no capabilities                                  │
│ ├─ Tool containers validate TOOL_INTERNAL_TOKEN                 │
│ └─ Tool containers validate action/params independently         │
│                                                                 │
│ RESIDUAL RISKS:                                                 │
│ ├─ LLM could craft curl to arbitrary internal endpoints         │
│ ├─ LLM could exfiltrate TOOL_INTERNAL_TOKEN via curl to         │
│ │   external URL (mitigated: gateway's curl has no internet     │
│ │   access on esdeath-internal... BUT gateway IS on             │
│ │   esdeath-external too, so curl CAN reach the internet)       │
│ ├─ Prompt injection via tool responses could redirect curl      │
│ └─ curl supports file:// protocol (read local files)            │
│                                                                 │
│ SEVERITY: MEDIUM                                                │
│ The LLM is bounded by the allowlist and container isolation,    │
│ but the fact that curl runs on the external network means       │
│ exfiltration is theoretically possible via prompt injection.    │
└─────────────────────────────────────────────────────────────────┘
```

**Recommendation:** Consider restricting curl with `--proto =https,http` and blocking access to metadata endpoints. Alternatively, add a network policy or curl wrapper that restricts destination hosts.

### 4.5 Tier System (Authorization Model)

```
                    User Request via Telegram
                              │
                              ▼
                   ┌──────────────────┐
                   │  LLM determines  │
                   │  which skill to  │
                   │     invoke       │
                   └────────┬─────────┘
                            │
                   ┌────────▼─────────┐
                   │  Check tier of   │
                   │  requested action│
                   └────────┬─────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
     ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
     │    SAFE     │ │   NOTICE    │ │  DANGEROUS  │
     │ Execute now │ │ Execute now │ │ ASK user &  │
     │ No logging  │ │ Log to audit│ │ WAIT for OK │
     └─────────────┘ └─────────────┘ └──────┬──────┘
                                            │
                                  ┌─────────▼─────────┐
                                  │  User approves?    │
                                  └────┬──────────┬────┘
                                       │          │
                                  ┌────▼───┐ ┌────▼───┐
                                  │  YES   │ │  NO    │
                                  │Execute │ │ Block  │
                                  └────────┘ └────────┘

     ┌─────────────┐
     │  FORBIDDEN  │  ── Always blocked, security alert logged
     └─────────────┘
```

**Coverage:**
- `send_email`, `calendar_create`, `copy`, `move`, `del`, `mkdir`, `start` → DANGEROUS
- `list_unread`, `search`, `read_email`, `calendar_today`, `quote`, `history` → NOTICE
- `hostname`, `whoami` → SAFE

### 4.6 SSRF Protection

- `web_fetch` tool has `allowPrivateNetwork: false` hardcoded — blocks internal IPs
- Web-browser container validates URLs independently — no localhost, no RFC1918 addresses
- Shell-sandbox restricts paths to `/mnt/documents` (ro) and `/mnt/downloads` (rw)
- No `file://` protocol validation on curl (residual risk)

---

## 5. Token & Cost Consumption

### 5.1 LLM Cost Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAILY TOKEN BUDGET                            │
├─────────────────┬───────────────┬───────────────────────────────┤
│ Event           │ Frequency     │ Est. Tokens (in/out)          │
├─────────────────┼───────────────┼───────────────────────────────┤
│ Morning brief   │ 1x/day        │ ~4,000 in / ~800 out          │
│ Midday checkin  │ 1x/day        │ ~2,000 in / ~400 out          │
│ Evening recap   │ 1x/day        │ ~3,000 in / ~600 out          │
│ System health   │ 1x/day        │ ~2,000 in / ~400 out          │
│ Heartbeats      │ ~16x/day      │ ~1,500 in / ~300 out each     │
│ User messages   │ ~10x/day      │ ~2,000 in / ~500 out each     │
│ Weekly review   │ 1x/week       │ ~6,000 in / ~1,500 out        │
│ Self-assessment │ 1x/week       │ ~5,000 in / ~1,000 out        │
│ Security audit  │ 1x/week       │ ~3,000 in / ~500 out          │
├─────────────────┼───────────────┼───────────────────────────────┤
│ DAILY TOTAL     │ ~30 calls     │ ~55K in / ~12K out            │
│ (estimated)     │               │                               │
└─────────────────┴───────────────┴───────────────────────────────┘
```

### 5.2 Cost Breakdown (Estimated)

```
┌──────────────────────────────────────────────────────────────┐
│                 MONTHLY COST ESTIMATE                         │
├──────────────────┬───────────┬────────────────────────────────┤
│ Component        │ Monthly   │ Notes                          │
├──────────────────┼───────────┼────────────────────────────────┤
│ GPT-5.2 API      │ ~$15-30   │ ~67K tokens/day, 30 days       │
│ TTS (Chatterbox)  │ $0        │ Local GPU, no API cost         │
│ TTS (OpenAI alt)  │ ~$5-15    │ If using cloud TTS instead     │
│ Alpha Vantage    │ $0        │ Free tier (5 calls/min)        │
│ Telegram Bot     │ $0        │ Free API                       │
│ Google APIs      │ $0        │ Free tier (read-only)          │
│ Electricity (GPU)│ ~$5-10    │ RTX 5090 at ~30W idle TTS      │
├──────────────────┼───────────┼────────────────────────────────┤
│ TOTAL            │ ~$20-40   │ With local TTS (default)       │
│                  │ ~$25-55   │ With cloud TTS                 │
└──────────────────┴───────────┴────────────────────────────────┘
```

### 5.3 Token Optimization Strategies

```
┌───────────────────────────────────────────────────────────────────┐
│                    OPTIMIZATION LEVERS                             │
├────────────────────┬──────────────────────────────────────────────┤
│ Heartbeat batching │ Single API call checks 4-5 things vs         │
│                    │ separate calls per check                     │
├────────────────────┼──────────────────────────────────────────────┤
│ Quiet hours        │ 23:00-08:00 → HEARTBEAT_OK (no LLM call)    │
├────────────────────┼──────────────────────────────────────────────┤
│ Skill context      │ Only relevant skill SKILL.md loaded per      │
│ pruning            │ request (not all 8 every time)               │
├────────────────────┼──────────────────────────────────────────────┤
│ Isolated sessions  │ Cron jobs use sessionTarget: "isolated" —    │
│                    │ no prior context, minimal prompt              │
├────────────────────┼──────────────────────────────────────────────┤
│ Local LLM fallback │ Ollama (Qwen3/EuroLLM) for low-priority     │
│                    │ tasks to avoid cloud API costs                │
├────────────────────┼──────────────────────────────────────────────┤
│ Budget gate        │ $DAILY_BUDGET_USD (default $1) — audit-db    │
│                    │ tracks daily costs                            │
└────────────────────┴──────────────────────────────────────────────┘
```

### 5.4 TTS Token Flow

```
   User sends text message via Telegram
                    │
                    ▼
         ┌──────────────────┐
         │  Gateway (GPT-5.2)│
         │  generates reply  │ ◄── LLM tokens consumed here
         └────────┬─────────┘
                  │
         response text (tagged for TTS)
                  │
                  ▼
         ┌──────────────────┐
         │  openai-router   │
         │  (nginx)         │
         └────────┬─────────┘
                  │
     ┌────────────┼────────────┐
     │ /v1/audio/speech        │ other /v1/*
     ▼                         ▼
┌──────────┐           ┌──────────────┐
│Chatterbox│           │ OpenAI API   │
│(local GPU│           │ (pass-thru)  │
│ FREE)    │           │              │
└──────────┘           └──────────────┘

TTS_UPSTREAM controls the routing:
  chatterbox:8004 → local, $0 cost, voice cloning
  openai          → cloud, ~$0.015/1K chars
  xtts:8005       → local, $0, multilingual
  kokoro-tts:8880 → local, $0, preset voices
```

---

## 6. Use Case Possibilities

### 6.1 Current Capabilities

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAPABILITY MATRIX                             │
├──────────────────┬──────────┬───────────────────────────────────┤
│ Capability       │ Status   │ Implementation                    │
├──────────────────┼──────────┼───────────────────────────────────┤
│ Chat (Telegram)  │ ✓ Active │ Gateway + GPT-5.2                 │
│ Voice replies    │ ✓ Active │ Chatterbox TTS (voice cloning)    │
│ Voice input      │ ✓ Active │ Whisper API transcription         │
│ Morning briefing │ ✓ Active │ Cron job → Telegram               │
│ Email reading    │ ~ Pending│ email-tool built, OAuth pending   │
│ Calendar reading │ ~ Pending│ email-tool built, OAuth pending   │
│ Email sending    │ ~ Pending│ Needs write scope OAuth           │
│ Web research     │ ✓ Ready  │ web-browser container             │
│ Shell commands   │ ✓ Ready  │ shell-sandbox container           │
│ Stock quotes     │ ✓ Ready  │ market-tool + Alpha Vantage       │
│ Price alerts     │ ✓ Ready  │ market-tool (local SQLite)        │
│ Food tracking    │ ✓ Active │ Workspace markdown files          │
│ Exercise tracking│ ✓ Active │ Workspace markdown files          │
│ Habit streaks    │ ✓ Active │ Workspace markdown files          │
│ Audit logging    │ ✓ Ready  │ audit-db container (SQLite)       │
│ Cost tracking    │ ✓ Ready  │ audit-db /costs endpoint          │
│ GitHub notifs    │ ~ Pending│ gh CLI installed, auth pending    │
│ Local LLM        │ ✓ Ready  │ Ollama (GPU)                      │
│ AI news digest   │ ✓ Active │ Web search in heartbeats          │
│ Security audit   │ ✓ Active │ Weekly cron job                   │
│ Memory system    │ ✓ Active │ Daily notes + long-term MEMORY.md │
└──────────────────┴──────────┴───────────────────────────────────┘
```

### 6.2 Potential Future Use Cases

```
┌──────────────────────────────────────────────────────────────────┐
│                    EXPANSION POSSIBILITIES                        │
├──────────────────┬───────────────────────────────────────────────┤
│ Smart Home       │ Shell-sandbox → Home Assistant API calls       │
│ Code Review      │ Web-browser fetches PRs, Ollama analyzes       │
│ Meeting Notes    │ Voice input → transcription → summary          │
│ Invoice Tracker  │ Email parsing → spreadsheet tracking           │
│ Travel Planning  │ Web research + calendar integration            │
│ News Aggregator  │ Web-browser + Ollama for summarization         │
│ Document Writer  │ Shell-sandbox → write files to Downloads       │
│ Expense Tracking │ Email receipt parsing → daily summary          │
│ Social Media     │ Web-browser → Twitter/LinkedIn monitoring      │
│ Backup Manager   │ Shell-sandbox → trigger backup scripts         │
│ Package Tracking │ Web-browser → track deliveries                 │
│ Recipe Assistant │ Web research + food tracking integration       │
└──────────────────┴───────────────────────────────────────────────┘
```

---

## 7. User Workflow

### 7.1 Daily User Journey

```
  07:00 ┌──────────────────────────────────┐
        │  ☀ MORNING BRIEFING (auto)       │
        │  • Unread emails (3 accounts)    │
        │  • Today's calendar              │
        │  • Weather in Bratislava         │
        │  • AI news (last 24h)            │
        │  • Food/exercise gaps            │
        │  • Habit streaks                 │
        └──────────────┬───────────────────┘
                       │
  08:00 ┌──────────────▼───────────────────┐
        │  🔧 SYSTEM HEALTH (auto)         │
        │  • Service status checks         │
        │  • Disk usage                    │
        │  • Memory file validation        │
        └──────────────┬───────────────────┘
                       │
  08:00– ┌─────────────▼───────────────────┐
  12:00  │  💬 AD-HOC INTERACTIONS          │
         │  User: "Ake su Apple akcie?"    │
         │  Esdeath: [market-tool quote]   │
         │                                 │
         │  User: "Mal som vajicka k ranam"│
         │  Esdeath: [logs to FOOD.md]     │
         │                                 │
         │  User: "Co je noveho v AI?"     │
         │  Esdeath: [web research]        │
         └─────────────┬───────────────────┘
                       │
  13:00 ┌──────────────▼───────────────────┐
        │  🍽 MIDDAY CHECK-IN (auto)        │
        │  • Food log reminder             │
        │  • Important emails since AM     │
        │  • Motivation (Esdeath style)    │
        └──────────────┬───────────────────┘
                       │
  Every  ┌─────────────▼───────────────────┐
  60min  │  💓 HEARTBEAT (auto, rotating)   │
         │  • AI news scan                 │
         │  • Email/calendar (alternate)   │
         │  • GitHub notifications         │
         │  • Memory maintenance           │
         │  • System health                │
         │  • Security quick-check         │
         └─────────────┬───────────────────┘
                       │
  21:00 ┌──────────────▼───────────────────┐
        │  🌙 EVENING RECAP (auto)          │
        │  • Unanswered emails             │
        │  • Tomorrow's calendar           │
        │  • Day summary                   │
        │  • Food/exercise gaps            │
        └──────────────────────────────────┘

  WEEKLY (Sunday):
  ├─ 18:00 Self-assessment (memory review, success rate, learnings)
  └─ 19:00 Weekly review (food/exercise/habits summary, goals)

  WEEKLY (Monday):
  └─ 09:00 Security audit (filesystem, ports, env, allowlist)
```

### 7.2 Interaction Flow

```
  ┌──────────┐    message     ┌───────────┐   API call   ┌──────────┐
  │ Adrian's │───────────────►│ Telegram  │─────────────►│ OpenClaw │
  │ Phone    │                │ Bot API   │              │ Gateway  │
  └──────────┘                └───────────┘              └────┬─────┘
       ▲                                                      │
       │                                                      ▼
       │                                              ┌───────────────┐
       │                                              │  GPT-5.2      │
       │                                              │  + SOUL.md    │
       │                                              │  + SKILL.md   │
       │                                              │  (system      │
       │                                              │   prompt)     │
       │                                              └───────┬───────┘
       │                                                      │
       │            response text                      decides action
       │            + TTS audio                               │
       │                                              ┌───────▼───────┐
       │                                              │ exec tool     │
       │◄─────────────────────────────────────────────│ curl → tool   │
       │                                              │ container     │
       │                                              └───────────────┘
```

### 7.3 Persona & Communication Style

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESDEATH PERSONA                               │
├─────────────┬───────────────────────────────────────────────────┤
│ Language    │ Slovak (always, even if user writes English)       │
│ Tone       │ Commanding but warm, dark humor, brief             │
│ Style      │ No filler words, no apologies, no "Great question!"│
│ Coaching   │ Direct, honest, challenges without nagging          │
│ Voice      │ "coral" (OpenAI) or cloned from esdeath.wav (local)│
│ Identity   │ Military general, ice wielder, loyal guardian       │
└─────────────┴───────────────────────────────────────────────────┘
```

---

## 8. Models & AI Stack

### 8.1 Model Inventory

```
┌──────────────────────────────────────────────────────────────────┐
│                    AI MODEL STACK                                 │
├────────────────┬──────────┬──────────┬────────────────────────────┤
│ Model          │ Provider │ Purpose  │ Notes                      │
├────────────────┼──────────┼──────────┼────────────────────────────┤
│ GPT-5.2        │ OpenAI   │ Primary  │ Main reasoning, all tasks  │
│                │ (cloud)  │ brain    │ ~$10/M in, ~$30/M out      │
├────────────────┼──────────┼──────────┼────────────────────────────┤
│ Whisper        │ OpenAI   │ Speech   │ Voice message transcription│
│                │ (cloud)  │ to text  │ ~$0.006/min                │
├────────────────┼──────────┼──────────┼────────────────────────────┤
│ TTS-1          │ OpenAI   │ Text to  │ Cloud fallback, "coral"    │
│                │ (cloud)  │ speech   │ ~$0.015/1K chars           │
├────────────────┼──────────┼──────────┼────────────────────────────┤
│ Chatterbox     │ Local    │ Voice    │ Default TTS, GPU, $0       │
│                │ (GPU)    │ cloning  │ Voice: esdeath.wav         │
├────────────────┼──────────┼──────────┼────────────────────────────┤
│ XTTS v2        │ Local    │ Multi-   │ Profile: xtts, GPU, $0     │
│                │ (GPU)    │ lingual  │ Czech/Slovak support       │
├────────────────┼──────────┼──────────┼────────────────────────────┤
│ Kokoro         │ Local    │ Fast TTS │ Profile: kokoro, GPU, $0   │
│                │ (GPU)    │          │ Preset voices only         │
├────────────────┼──────────┼──────────┼────────────────────────────┤
│ Qwen3/EuroLLM  │ Local    │ Fallback │ Ollama, GPU, $0            │
│ GLM4           │ (GPU)    │ LLM      │ Slovak-capable models      │
└────────────────┴──────────┴──────────┴────────────────────────────┘
```

### 8.2 Model Selection Strategy

```
                  ┌─────────────────────┐
                  │  Incoming request    │
                  └──────────┬──────────┘
                             │
                  ┌──────────▼──────────┐
                  │  Budget check       │
                  │  (audit-db /costs)  │
                  └──────────┬──────────┘
                             │
               ┌─────────────┴─────────────┐
               │                           │
        Budget OK                   Near limit
               │                           │
        ┌──────▼──────┐            ┌───────▼───────┐
        │  GPT-5.2    │            │  Ollama       │
        │  (cloud)    │            │  (local)      │
        │  Best quality│            │  Free, slower │
        └─────────────┘            └───────────────┘
```

---

## 9. Technical Implementation

### 9.1 Request Processing Pipeline

```
  Telegram Message
        │
        ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ OpenClaw Gateway                                             │
  │                                                              │
  │  1. Channel validation (allowlist: tg:5914523498)            │
  │  2. Load workspace files (SOUL.md, AGENTS.md, skills/)       │
  │  3. Construct system prompt (persona + skills + memory)      │
  │  4. Call GPT-5.2 via openai-router                           │
  │  5. LLM decides: direct reply OR tool invocation             │
  │  6. If tool: exec curl → tool container → parse response     │
  │  7. Generate text response                                   │
  │  8. If TTS tagged: route through openai-router → TTS backend │
  │  9. Send text + audio to Telegram                            │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

### 9.2 OpenAI Router (nginx) Architecture

```
  ┌─────────────────────────────────────────────────┐
  │ openai-router (nginx:1.27-alpine on :8080)      │
  │                                                 │
  │  /health          → 200 "ok"                    │
  │  /health/detailed → proxy to TTS /docs          │
  │  /v1/audio/speech → proxy to $TTS_UPSTREAM      │
  │                     (strips Authorization hdr)  │
  │  /v1/*            → proxy to api.openai.com     │
  │                     (SSL, passthrough auth)     │
  │                                                 │
  │  TTS_UPSTREAM is resolved via 30-tts-routing.sh │
  │  at container startup (envsubst template)       │
  └─────────────────────────────────────────────────┘
```

### 9.3 Tool Container Architecture

```
  All v2 tool containers share the same pattern:

  ┌─────────────────────────────────────────────────┐
  │ Tool Container                                  │
  │                                                 │
  │  POST /execute                                  │
  │  ├─ Validate Bearer token ($INTERNAL_SECRET)    │
  │  ├─ Parse { request_id, action, params }        │
  │  ├─ Check action tier (safe/notice/dangerous)   │
  │  ├─ Validate params (allowlisted commands/paths)│
  │  ├─ Execute action                              │
  │  └─ Return { request_id, status, result, meta } │
  │                                                 │
  │  GET /health                                    │
  │  └─ Return { status: "ok" }                     │
  │                                                 │
  │  Stack: Node.js, read-only FS, non-root         │
  │  Data: SQLite or filesystem (named volumes)     │
  └─────────────────────────────────────────────────┘
```

### 9.4 Workspace File System

```
  openclaw-data/config/workspace/    (mounted into gateway)
  │
  ├── SOUL.md              ← Persona definition
  ├── IDENTITY.md          ← Name, creature, emoji
  ├── USER.md              ← Adrian's preferences
  ├── AGENTS.md            ← Operational guidelines
  ├── TOOLS.md             ← Infrastructure docs
  ├── MEMORY.md            ← Long-term memory (curated)
  ├── HEARTBEAT.md         ← Heartbeat task checklist
  ├── FOOD.md              ← Food tracking log
  ├── EXERCISE.md          ← Exercise tracking log
  ├── HABITS.md            ← Habit streaks
  │
  ├── memory/              ← Daily notes (YYYY-MM-DD.md)
  │   ├── 2026-02-14.md
  │   ├── 2026-02-15.md
  │   └── heartbeat-state.json
  │
  └── skills/              ← Deployed skill definitions
      ├── shell-exec/SKILL.md
      ├── email-assistant/SKILL.md
      ├── calendar-assistant/SKILL.md
      ├── web-researcher/SKILL.md
      ├── market-data/SKILL.md
      ├── fitness-coach/SKILL.md
      ├── approval-gate/SKILL.md
      └── audit-logger/SKILL.md
```

### 9.5 Cron & Heartbeat System

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCHEDULED AUTOMATION                          │
├─────────────┬──────────┬────────────────────────────────────────┤
│ Job Name    │ Schedule │ Delivery                               │
├─────────────┼──────────┼────────────────────────────────────────┤
│ morning     │ 07:00    │ Telegram → Adrian                      │
│ system      │ 08:00    │ Telegram → Adrian                      │
│ midday      │ 13:00    │ Telegram → Adrian                      │
│ evening     │ 21:00    │ Telegram → Adrian                      │
│ assessment  │ Sun 18:00│ Telegram → Adrian                      │
│ review      │ Sun 19:00│ Telegram → Adrian                      │
│ security    │ Mon 09:00│ Telegram → Adrian                      │
├─────────────┼──────────┼────────────────────────────────────────┤
│ heartbeat   │ Every 60m│ Main session (not isolated)            │
│             │          │ Checks: AI news, email, calendar,      │
│             │          │ GitHub, memory, health, security       │
└─────────────┴──────────┴────────────────────────────────────────┘

  All cron jobs:
  • sessionTarget: "isolated" (no shared context)
  • wakeMode: "now"
  • delivery: bestEffort: true (don't crash if Telegram fails)
  • timezone: Europe/Bratislava
```

---

## 10. Data Flow Analysis

### 10.1 Data at Rest

```
┌──────────────────────────────────────────────────────────────────┐
│                    PERSISTENT DATA                                │
├─────────────────────┬──────────────┬─────────────────────────────┤
│ Volume              │ Mount Point  │ Contains                     │
├─────────────────────┼──────────────┼─────────────────────────────┤
│ clawdbot_home       │ /home/node   │ Agent workspace, sessions,  │
│ (external)          │              │ memory, skills, config       │
├─────────────────────┼──────────────┼─────────────────────────────┤
│ chatterbox_models   │ /app/model   │ TTS model weights (~2GB)    │
│ chatterbox_hf_cache │ /app/hf_cache│ HuggingFace cache           │
├─────────────────────┼──────────────┼─────────────────────────────┤
│ ollama_models       │ /root/.ollama│ LLM model weights (~10GB+)  │
├─────────────────────┼──────────────┼─────────────────────────────┤
│ audit_data          │ /data        │ Audit SQLite database        │
├─────────────────────┼──────────────┼─────────────────────────────┤
│ market_data         │ /data        │ Watchlist, alerts (SQLite)   │
├─────────────────────┼──────────────┼─────────────────────────────┤
│ email_oauth         │ /data/oauth  │ Gmail OAuth tokens (RO)      │
├─────────────────────┼──────────────┼─────────────────────────────┤
│ xtts_model          │ /root/.local │ XTTS model weights           │
│ kokoro_models       │ /models      │ Kokoro model weights         │
│ fish_speech_chkpts  │ /app/chkpts  │ Fish Speech weights          │
└─────────────────────┴──────────────┴─────────────────────────────┘
```

### 10.2 Data in Transit

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    ENCRYPTION STATUS                          │
  ├────────────────────────┬─────────────┬───────────────────────┤
  │ Connection             │ Encrypted   │ Notes                 │
  ├────────────────────────┼─────────────┼───────────────────────┤
  │ User ↔ Telegram        │ ✓ TLS       │ Telegram E2E optional │
  │ Gateway ↔ Telegram API │ ✓ HTTPS     │ Bot API over TLS      │
  │ Router ↔ OpenAI API    │ ✓ HTTPS     │ proxy_ssl_server_name │
  │ Gateway ↔ Router       │ ✗ HTTP      │ Internal network only │
  │ Gateway ↔ Tool Ctrs    │ ✗ HTTP      │ Internal network only │
  │ Email ↔ Google API     │ ✓ HTTPS     │ OAuth2 + TLS          │
  │ Web ↔ Target URLs      │ ✓/✗ varies  │ HTTPS preferred       │
  │ Market ↔ Alpha Vantage │ ✓ HTTPS     │ API key in URL param  │
  └────────────────────────┴─────────────┴───────────────────────┘

  Internal traffic is unencrypted but isolated to Docker bridge
  networks with no external access. Acceptable for local stack.
```

### 10.3 Sensitive Data Map

```
  ┌───────────────────────────────────────────────────────────────┐
  │                    SENSITIVE DATA LOCATIONS                    │
  ├────────────────────┬──────────────────────────────────────────┤
  │ .env               │ API keys, tokens, secrets                │
  │ email_oauth volume │ Gmail OAuth refresh tokens                │
  │ MEMORY.md          │ Personal context (protected by AGENTS.md)│
  │ USER.md            │ Personal preferences                     │
  │ FOOD.md            │ Dietary information                      │
  │ audit_data         │ Complete action history                   │
  │ clawdbot_home      │ Full conversation history                │
  └────────────────────┴──────────────────────────────────────────┘
```

---

## 11. Reliability & Observability

### 11.1 Health Checking

```
┌──────────────┬───────────────────────┬──────────┬──────────┐
│ Container    │ Health Check          │ Interval │ Start    │
├──────────────┼───────────────────────┼──────────┼──────────┤
│ gateway      │ HTTP GET /health      │ 30s      │ 15s      │
│ chatterbox   │ HTTP GET /docs        │ 30s      │ 180s     │
│ xtts         │ HTTP GET /health      │ 30s      │ 300s     │
│ ollama       │ CMD: ollama list      │ 30s      │ 60s      │
│ audit-db     │ HTTP GET /health      │ 60s      │ -        │
│ shell        │ HTTP GET /health      │ 60s      │ -        │
│ email        │ (none configured)     │ -        │ -        │
│ web-browser  │ (none configured)     │ -        │ -        │
│ market       │ (none configured)     │ -        │ -        │
│ router       │ (none configured)     │ -        │ -        │
└──────────────┴───────────────────────┴──────────┴──────────┘
```

**Findings:**
- **4 containers have NO health check** (email, web, market, router)
- Recommendation: Add health checks for all v2 containers

### 11.2 Logging

```
  All containers use json-file driver with rotation:
  • max-size: 10m
  • max-file: 3
  • Total per container: ~30MB max

  Audit trail: audit-db SQLite stores all tool actions
  Memory trail: workspace memory/ directory stores daily notes

  NO centralized log aggregation (no ELK, Loki, etc.)
  Acceptable for single-user self-hosted setup.
```

### 11.3 Restart Policy

```
  All containers: restart: unless-stopped
  • Survives Docker daemon restart
  • Survives container crashes
  • Does NOT survive: host reboot, docker compose down
```

---

## 12. Scalability & Portability

### 12.1 Resource Footprint

```
┌──────────────────────────────────────────────────────────────────┐
│                    RESOURCE USAGE (ESTIMATED)                     │
├──────────────┬─────────┬──────────┬──────────────────────────────┤
│ Container    │ RAM     │ CPU      │ GPU VRAM                     │
├──────────────┼─────────┼──────────┼──────────────────────────────┤
│ gateway      │ ~200MB  │ Low      │ -                            │
│ router       │ ~10MB   │ Minimal  │ -                            │
│ chatterbox   │ ~2GB    │ Medium   │ ~4GB (model loaded)          │
│ ollama       │ ~1-8GB  │ Variable │ ~4-16GB (model dependent)    │
│ audit-db     │ ~50MB   │ Minimal  │ -                            │
│ shell        │ ~50MB   │ Minimal  │ -                            │
│ email        │ ~50MB   │ Minimal  │ -                            │
│ web-browser  │ ≤1GB    │ ≤1 core  │ -                  (capped)  │
│ market       │ ~50MB   │ Minimal  │ -                            │
├──────────────┼─────────┼──────────┼──────────────────────────────┤
│ TOTAL        │ ~4-12GB │ 2-3 cores│ ~8-20GB VRAM                 │
│ (v2 profile) │         │          │ (RTX 5090: 32GB available)   │
└──────────────┴─────────┴──────────┴──────────────────────────────┘
```

### 12.2 Portability Assessment

```
┌────────────────────────────────────────────────────────────────┐
│                    PORTABILITY MATRIX                           │
├──────────────────┬─────────┬───────────────────────────────────┤
│ Target           │ Ready?  │ Blockers                          │
├──────────────────┼─────────┼───────────────────────────────────┤
│ Another Windows  │ ✓ Yes   │ Need NVIDIA GPU + Docker Desktop  │
│ Linux desktop    │ ✓ Yes   │ Need nvidia-docker, simpler setup │
│ Linux server     │ ✓ Yes   │ Need GPU, adjust bind mounts      │
│ Cloud VM (GPU)   │ ~ Partly│ Expensive, need GPU instance      │
│ Cloud VM (no GPU)│ ~ Partly│ No local TTS/LLM, cloud-only     │
│ Raspberry Pi     │ ✗ No    │ No NVIDIA GPU, too little RAM     │
│ NAS (Synology)   │ ✗ No    │ No NVIDIA GPU                    │
└──────────────────┴─────────┴───────────────────────────────────┘
```

**Migration path:** The stack is fully containerized. Moving to another machine requires:
1. Copy `.env`, `openclaw-data/`, `voices/`, `skills/`
2. Export Docker volumes (or accept model re-download)
3. `docker compose --profile v2 up -d --build`

---

## 13. Risk Assessment

### 13.1 Risk Matrix

```
┌──────────────────────────────────────────────────────────────────┐
│               IMPACT                                             │
│         High │ ██ PC Sleep    │ ██ API Key     │                 │
│              │    kills all   │    Leak        │                 │
│              │                │                │                 │
│       Medium │ ██ No backup   │ ██ Prompt      │ ██ Curl         │
│              │    strategy    │    Injection   │    exfil        │
│              │                │                │                 │
│          Low │ ██ Ollama      │ ██ Health      │ ██ Log          │
│              │    no hardening│    checks miss │    rotation     │
│              ├────────────────┼────────────────┼─────────────────│
│              │    Likely      │   Possible     │   Unlikely      │
│              │          LIKELIHOOD                               │
└──────────────────────────────────────────────────────────────────┘
```

### 13.2 Top 5 Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | PC sleep/reboot kills all services | HIGH | Set Windows power to "Never sleep" |
| 2 | OpenAI API key compromise | HIGH | .env not in git, localhost-only ports |
| 3 | No workspace backup | MEDIUM | Add periodic backup to external storage |
| 4 | Prompt injection via tool responses | MEDIUM | Tool containers sanitize output |
| 5 | curl exfiltration via exec tool | MEDIUM | Restrict curl destinations |

---

## 14. Recommendations

### 14.1 Immediate (Do Now)

1. **Add health checks** to email-tool, web-browser, market-tool, and openai-router
2. **Harden Ollama** — add `security_opt: [no-new-privileges:true]` and `cap_drop: [ALL]`
3. **Set Windows power** to "Never sleep" for continuous operation
4. **Complete OAuth** for email-tool (Gmail/Calendar integration)
5. **Complete gh auth** for GitHub notifications

### 14.2 Short-Term (This Month)

1. **Backup strategy** — automated daily backup of workspace files + Docker volumes
2. **Curl restriction** — create a curl wrapper script that validates destination hosts
3. **Telegram log channel** — configure `TELEGRAM_LOG_CHANNEL_ID` for audit visibility
4. **Secret rotation** — document a procedure for rotating API keys and tokens

### 14.3 Long-Term (This Quarter)

1. **Move to dedicated server** — eliminate single-point-of-failure (desktop PC)
2. **Add Prometheus/Grafana** — monitoring and alerting for all containers
3. **Implement Docker Secrets** — move from .env to proper secret management
4. **Add rate limiting** — to the exec tool to prevent abuse
5. **Evaluate Claude API** as primary LLM (Anthropic's safety features)

---

*Generated by Claude Code (Opus 4.6) — 2026-02-15*
