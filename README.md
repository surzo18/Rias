# Rias

<p align="center">
  <img src="https://static.wikia.nocookie.net/p__/images/5/58/Rias_Gremory.png/revision/latest?cb=20190303015057&path-prefix=protagonist" alt="Rias Gremory" width="300" />
</p>

Starter template for Claude Code infrastructure. Clone it, run setup, get a production-ready `.claude/` infra for your project.

## Features

### Self-improvement system
- Automatic learning from errors (`PostToolUseFailure` → `mistakes.md`)
- Pattern and decision extraction from every session
- Token usage tracking with threshold alerts
- Handover snapshots before context compaction
- `/reflect` skill — deep analysis of learnings (3+ repetitions → new rule)

### Git safety
- Blocks force push, push to main, hard reset
- Secret scanning (AWS keys, GitHub tokens, `.env`, credentials)
- Conventional commits enforcement with Co-Authored-By
- Branch naming validation (version-based workflow)
- Merge strategy validation (squash for features, `--no-ff` for releases)

### Audit workflow
- `/audit-infra` — 8-area audit (security, tokens, errors, logs, docs, infra, git, cleanup)
- Persistent audit state with follow-up tracking
- Automatic audit reminder after N sessions

### Documentation workflow
- Automatic doc reminders when relevant files change
- `/update-docs` — regenerate CHANGELOG, validate README, skill inventory
- Rules for README, CHANGELOG (auto-generated), ADRs, skill docs

### Session management
- Session counter with persistent state
- Handover capture before compaction (git branch, status, uncommitted changes)
- Handover restore on session start
- Learnings summary on every start

### Project skills framework
- `src/skills/` for business-specific skills
- `.claude/skills/` for workflow skills
- YAML frontmatter format with validation
- Skill inventory in `docs/skills/index.md`

### Zero dependencies
- Node.js built-in test runner (`node:test`)
- Bash hooks (cross-platform via Git Bash on Windows)
- 100+ tests covering all hooks and setup

## Quick Start

```bash
git clone <repo-url> my-project
cd my-project
npm install
npm run setup
```

The setup script asks for a project name, cleans template markers, resets state, and initializes a fresh git repo.

## Usage

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run changelog     # Regenerate CHANGELOG.md
```

## Structure

```text
.claude/
├── hooks/              # 9 production-ready hooks
│   ├── on-session-start.sh
│   ├── validate-git-ops.sh
│   ├── on-failure-learn.sh
│   ├── on-stop-learn.sh
│   ├── on-stop-token-log.sh
│   ├── on-compact-handover.sh
│   ├── post-edit-docs.sh
│   ├── enforce-tdd.sh
│   └── telegram-hitl.sh
├── rules/              # 4 project rules
│   ├── documentation.md
│   ├── project-skills.md
│   ├── self-improvement.md
│   └── tdd.md
├── skills/             # 4 workflow skills
│   ├── audit-infra/
│   ├── git-management/
│   ├── reflect/
│   └── update-docs/
├── agents/reflector.md
├── audits/             # Versioned audit baseline
├── learnings/          # Versioned default templates
├── settings.json       # Hook config + permissions
└── local/              # Local runtime state (gitignored)
src/
├── esdeath/            # Production app (OpenClaw personal assistant)
│   ├── scripts/        # Docker build contexts (11 services)
│   ├── skills/         # OpenClaw skills (11)
│   ├── src/            # TypeScript service modules
│   ├── docker-compose.yml
│   └── CLAUDE.md       # esdeath-specific instructions
└── skills/             # Your project skills
scripts/setup.js        # Interactive setup
test/                   # Hook tests
docs/skills/index.md    # Skill inventory
```

## Local vs versioned state

**Local** (do not commit):
- `.claude/local/**` — hook log, token usage, handovers, runtime learnings, session counter, local audits

**Versioned** (commit):
- `.claude/hooks/**`, `.claude/rules/**`, `.claude/skills/**`
- `.claude/audits/latest.json` (baseline)
- `.claude/learnings/*.md` (default templates)
- `src/skills/**` (project skills)

## Skills

| Skill | Command | Description |
|-------|---------|-------------|
| audit-infra | `/audit-infra` | 8-area infrastructure audit with action tracking |
| git-management | `/git-management` | Version-based git workflow enforcement |
| reflect | `/reflect` | Deep analysis of learnings, pattern → rule promotion |
| update-docs | `/update-docs` | Documentation regeneration and validation |

## Why "Rias"

Named after **Rias Gremory** from *High School DxD* — a strong, clearly-managed "core" for agents.

## License

MIT — see `LICENSE`.

Image is an external link to the character; rights belong to the original authors/IP holders.
