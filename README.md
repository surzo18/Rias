# Rias

OpenClaw integration project. Builds skills, tools, and integrations for the [OpenClaw](https://docs.openclaw.ai) self-hosted AI gateway platform.

## Quick Start

```bash
# Install dependencies (zero-dependency by default, uses npx)
npm install

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
│   ├── hooks/               # Hook scripts
│   │   ├── on-session-start.sh     # Load handover + learnings
│   │   ├── on-failure-learn.sh     # Record tool errors
│   │   ├── on-compact-handover.sh  # Save session context
│   │   ├── validate-git-ops.sh     # Git operation validation
│   │   └── post-edit-docs.sh       # Doc update reminders
│   ├── rules/               # Auto-loaded project rules
│   │   ├── openclaw-skills.md      # OpenClaw skill format rules
│   │   ├── self-improvement.md     # Learning system rules
│   │   └── documentation.md        # Doc format standards
│   ├── skills/              # Claude Code skills
│   │   ├── git-management/SKILL.md # Git workflow enforcement
│   │   ├── reflect/SKILL.md        # Deep reflection trigger
│   │   └── update-docs/SKILL.md    # Doc regeneration/validation
│   ├── agents/              # Custom subagent definitions
│   │   └── reflector.md            # Learnings analysis agent
│   ├── learnings/           # Auto-populated by hooks
│   └── handovers/           # Session context (auto-managed)
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
| [git-management](docs/skills/index.md#git-management) | `/git-management` | Git workflow enforcement |
| [reflect](docs/skills/index.md#reflect) | `/reflect` | Deep reflection on learnings |
| [update-docs](docs/skills/index.md#update-docs) | `/update-docs` | Regenerate and validate docs |

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

Rias is built on four pillars:

1. **Claude Integration** - `.claude/` infrastructure (hooks, rules, skills, agents)
2. **Reflection** - Self-improvement system (learnings, handovers, `/reflect`)
3. **Versioning** - Git workflow enforcement (`/git-management`, pre-tool hooks)
4. **Documentation** - Auto-updating docs (CHANGELOG, README, skill inventory)

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
