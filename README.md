# Rias

## Overview

OpenClaw integration project. Builds skills, tools, and integrations for the [OpenClaw](https://docs.openclaw.ai) self-hosted AI gateway platform. Rias provides Claude Code infrastructure (hooks, rules, skills), a self-improvement system, version-based git workflow, and automated documentation.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Watch mode
npm run test:watch

# Generate changelog from git history
npm run changelog:init

# Regenerate changelog (appends new entries)
npm run changelog
```

## Project Structure

```
tools/Rias/
├── .claude/
│   ├── settings.json        # Hooks, permissions (team-shared)
│   ├── settings.local.json  # Personal overrides (gitignored)
│   ├── hooks/               # Hook scripts
│   │   ├── on-session-start.sh     # Session counter, audit trigger, handover
│   │   ├── on-failure-learn.sh     # Record tool errors
│   │   ├── on-compact-handover.sh  # Save session context (git state)
│   │   ├── on-stop-learn.sh        # Persist learnings from transcript
│   │   ├── on-stop-token-log.sh    # Log token consumption + threshold
│   │   ├── validate-git-ops.sh     # Git validation + secret scanning
│   │   └── post-edit-docs.sh       # Doc update reminders
│   ├── rules/               # Auto-loaded project rules
│   │   ├── openclaw-skills.md      # OpenClaw skill format rules
│   │   ├── self-improvement.md     # Learning system rules
│   │   ├── tdd.md                  # Node.js TDD rules
│   │   └── documentation.md        # Doc format standards
│   ├── skills/              # Claude Code skills
│   │   ├── git-management/SKILL.md # Version-based workflow enforcement
│   │   ├── reflect/SKILL.md        # Deep reflection trigger
│   │   ├── update-docs/SKILL.md    # Doc regeneration/validation
│   │   └── audit-infra/SKILL.md   # Periodic infrastructure audit
│   ├── agents/              # Custom subagent definitions
│   │   └── reflector.md            # Learnings analysis agent
│   ├── learnings/           # Auto-populated by hooks
│   │   ├── mistakes.md             # Tool errors
│   │   ├── patterns.md             # Discovered patterns
│   │   ├── decisions.md            # Architecture decisions
│   │   ├── token-usage.md          # Session token consumption
│   │   └── hook-log.md             # Hook execution log
│   ├── handovers/           # Session context (auto-managed)
│   └── agent-memory/        # Persistent subagent memory
│       └── session-counter.json   # Session count + audit tracking
├── test/                    # Hook tests (node:test runner)
│   ├── helpers.js                  # Shared test helper (spawnSync)
│   ├── setup.test.js               # Smoke test
│   ├── validate-git-ops.test.js    # Git validation tests
│   ├── on-failure-learn.test.js    # Failure learning tests
│   ├── on-stop-token-log.test.js   # Token logging tests
│   └── post-edit-docs.test.js      # Doc reminder tests
├── docs/
│   └── skills/
│       └── index.md         # Skill inventory
├── skills/                  # OpenClaw skills (TBD)
├── package.json
├── CHANGELOG.md
├── CLAUDE.md
├── README.md
└── .gitignore
```

## Skills

### Claude Code Skills

Skills that enhance the Claude Code development workflow:

| Skill | Command | Purpose |
|-------|---------|---------|
| [git-management](docs/skills/index.md#git-management) | `/git-management` | Version-based git workflow enforcement |
| [reflect](docs/skills/index.md#reflect) | `/reflect` | Deep reflection on learnings |
| [update-docs](docs/skills/index.md#update-docs) | `/update-docs` | Regenerate and validate docs |
| [audit-infra](docs/skills/index.md#audit-infra) | `/audit-infra` | Periodic infrastructure audit (8 areas) |

### OpenClaw Skills

OpenClaw gateway skills are under development in the `skills/` directory.

## Documentation System

Rias uses an automated documentation system:

- **README.md** - Project overview (this file)
- **CHANGELOG.md** - Auto-generated from conventional commits via `npm run changelog`
- **docs/skills/index.md** - Inventory of all skills with descriptions
- **CLAUDE.md** - Claude Code integration context (not user docs)

### Keeping Docs Updated

Run `/update-docs` in Claude Code to regenerate and validate all documentation, or use:

```bash
npm run changelog    # Regenerate CHANGELOG.md
```

The `post-edit-docs.sh` hook automatically reminds you to update docs when relevant files change.

## Architecture Pillars

Rias is built on six pillars:

1. **Claude Integration** - `.claude/` infrastructure (hooks, rules, skills, agents)
2. **Reflection** - Self-improvement system (learnings, handovers, token tracking, `/reflect`)
3. **Versioning** - Version-based git workflow (`main → vX.Y.Z → feature/*`, `/git-management`)
4. **Documentation** - Auto-updating docs (CHANGELOG, README, skill inventory)
5. **Testing** - TDD with `node:test` built-in runner, mandatory RED-GREEN-REFACTOR cycle
6. **Audit** - Periodic infrastructure audit every 100 sessions (`/audit-infra`), hook execution logging

## Git Workflow

Rias uses version-based branching:

```
main (stable, tagged releases only)
  └── vX.Y.Z (version branch, all development here)
        ├── feature/*   (squash merge → vX.Y.Z)
        ├── bugfix/*    (squash merge → vX.Y.Z)
        └── merge --no-ff → main + tag vX.Y.Z
```

- Work branches are created from version branches, not main
- Version branches are merged to main with `--no-ff` and tagged
- Hotfixes branch from main at a tag: `hotfix/vX.Y.Z-description`

## OpenClaw Reference

| Topic | URL |
|-------|-----|
| Skills system | https://docs.openclaw.ai/tools/skills |
| Skills config | https://docs.openclaw.ai/tools/skills-config |
| Gateway | https://docs.openclaw.ai/gateway |
| Nodes | https://docs.openclaw.ai/nodes |
| Full index | https://docs.openclaw.ai/llms.txt |

## License

TBD
