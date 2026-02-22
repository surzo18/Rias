# CLAUDE.md

## Overview

Rias je starter template pre Claude Code infrastrukturu.
Hooks, rules, skills a audit workflow — vsetko pripravene na pouzitie.
Business logika a projektove skills patria do `src/`.

## Features

- **Self-improvement** — automaticke ucenie z chyb, extrakcia patterns, token tracking
- **Git safety** — blokacia force push, secret scanning, conventional commits
- **Audit workflow** — 8-oblastny audit s follow-up tracking
- **Documentation workflow** — automaticke doc reminders, changelog generovanie
- **Session management** — handover snapshots, session counter, learnings restore
- **Project skills framework** — YAML frontmatter format, skill inventory
- **Zero dependencies** — node:test, bash hooks, 100+ testov

## Runtime model

- Verzovany default stav: `.claude/*` (okrem `.claude/local`)
- Lokalny runtime stav: `.claude/local/*` (gitignored)

Local runtime obsahuje:
- handovers
- hook logs
- token usage logs
- runtime learnings
- local session counter
- local audit outputs

## Build and test

```bash
npm install
npm test
npm run test:watch
npm run setup          # First-time project setup
npm run changelog      # Regenerate CHANGELOG.md
npm run changelog:init # Full CHANGELOG.md rebuild
```

## Structure

```text
.claude/
|- hooks/              # 9 production-ready hookov (slúžia aj pre esdeath)
|- rules/              # 5 project rules
|- skills/             # 4 workflow skills
|- agents/             # agent configs
|- audits/             # verzovany audit baseline
|- learnings/          # verzovane default sablony
`- local/              # lokalny runtime stav (gitignored)
src/
|- esdeath/            # Produkčná aplikácia (personal assistant)
|  |- scripts/         # Docker build contexts (11 services)
|  |- skills/          # OpenClaw skills (11)
|  |- src/             # TypeScript service modules
|  |- docker-compose.yml
|  `- CLAUDE.md        # esdeath-specific instructions
`- skills/             # Projektové Rias skills (placeholder)
scripts/setup.js       # interactive setup
test/                  # hook testy (80+)
docs/skills/index.md   # skill inventory
```

> `.claude/` infraštruktúra (hooks, rules, skills) slúži aj pre esdeath kód v `src/esdeath/`.

## Hooks

- `on-session-start.sh` → runtime session summary, audit follow-up check
- `validate-git-ops.sh` → git safety + secret checks
- `on-failure-learn.sh` → runtime mistakes log
- `on-stop-learn.sh` → runtime patterns/decisions extraction
- `on-stop-token-log.sh` → runtime token logging
- `on-compact-handover.sh` → runtime handover snapshot
- `post-edit-docs.sh` → docs reminder
- `enforce-tdd.sh` → TDD enforcement, blokuje src/**/*.js bez testu
- `telegram-hitl.sh` → HITL approval pre rizikove prikazy cez Telegram

## Skills

- `/audit-infra` — infrastructure audit s action tracking
- `/git-management` — version-based git workflow enforcement
- `/reflect` — deep analysis nauceneho, pattern → rule promotion
- `/update-docs` — dokumentacia regeneracia a validacia

## Git workflow

`main → vX.Y.Z → feature/*`

- work branches from `vX.Y.Z`
- squash merge back to version branch
- release via merge commit (`--no-ff`) to `main` + matching tag

## Conventions

- Code and commits: English
- User-facing docs: Slovak
- Keep runtime records local, keep templates/defaults versioned
