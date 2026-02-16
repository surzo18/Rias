# CLAUDE.md - Rias

## Overview

OpenClaw integration project. Builds skills, tools, and integrations for the OpenClaw self-hosted AI gateway platform.

## Source of Truth

**All OpenClaw documentation:** https://docs.openclaw.ai

Always consult the official docs before making assumptions about OpenClaw APIs, skill format, or gateway behavior.

### Key Documentation

| Topic | URL |
|-------|-----|
| Skills system | https://docs.openclaw.ai/tools/skills |
| Skills config | https://docs.openclaw.ai/tools/skills-config |
| Skills CLI | https://docs.openclaw.ai/cli/skills |
| Nodes | https://docs.openclaw.ai/nodes |
| Gateway | https://docs.openclaw.ai/gateway |
| Sub-agents | https://docs.openclaw.ai/tools/subagents |
| Automation | https://docs.openclaw.ai/automation/hooks |
| Quickstart | https://docs.openclaw.ai/quickstart |
| Full index | https://docs.openclaw.ai/llms.txt |

## OpenClaw Skills Format

Skills use AgentSkills-compatible folders with a `SKILL.md` file containing YAML frontmatter:

```yaml
---
name: skill-name
description: What this skill does
user-invocable: true
---

Skill instructions in markdown...
```

### Optional frontmatter keys

- `user-invocable` (bool, default `true`) - expose as slash command
- `disable-model-invocation` (bool, default `false`) - exclude from model prompt
- `command-dispatch: tool` - dispatch slash command directly to tool
- `command-tool` - which tool to invoke
- `command-arg-mode: raw` - forward unprocessed arguments
- `homepage` - URL for macOS Skills UI

### Skill loading order (highest to lowest priority)

1. Workspace skills: `<workspace>/skills`
2. Managed/local skills: `~/.openclaw/skills`
3. Bundled skills (shipped with installation)

Additional dirs via `skills.load.extraDirs` in `~/.openclaw/openclaw.json`.

## Stack

- **Runtime:** Node.js 22+
- **Test runner:** `node:test` (built-in, zero dependencies)
- **Platform:** OpenClaw Gateway (WebSocket + HTTP, default port 18789)
- **Related project:** `tools/esdeath/` runs the OpenClaw assistant instance (Telegram + TTS)

## Build & Test Commands

```bash
npm install                  # Install dependencies
npm test                     # Run all tests (node --test)
npm run test:watch           # Watch mode (node --test --watch)
npm run changelog            # Regenerate CHANGELOG.md (append new)
npm run changelog:init       # Regenerate CHANGELOG.md (full rebuild)
```

## Project Structure

```
tools/Rias/
├── .claude/
│   ├── settings.json        # Hooks, permissions (team-shared)
│   ├── settings.local.json  # Personal overrides (gitignored)
│   ├── hooks/               # Hook scripts
│   │   ├── on-session-start.sh     # Load handover + learnings
│   │   ├── on-failure-learn.sh     # Record tool errors
│   │   ├── on-compact-handover.sh  # Save session context
│   │   ├── on-stop-learn.sh         # Persist learnings from transcript
│   │   ├── on-stop-token-log.sh    # Log token consumption + threshold
│   │   ├── validate-git-ops.sh     # Git validation + secret scanning
│   │   └── post-edit-docs.sh       # Doc update reminders
│   ├── rules/               # Auto-loaded project rules
│   │   ├── openclaw-skills.md      # OpenClaw skill format rules
│   │   ├── self-improvement.md     # Learning system rules
│   │   ├── tdd.md                  # Node.js TDD rules (overrides root)
│   │   └── documentation.md        # Doc format standards
│   ├── skills/              # Claude Code skills
│   │   ├── git-management/SKILL.md # Version-based workflow enforcement
│   │   ├── reflect/SKILL.md        # Deep reflection trigger
│   │   └── update-docs/SKILL.md    # Doc regeneration/validation
│   ├── agents/              # Custom subagent definitions
│   │   └── reflector.md            # Learnings analysis agent
│   ├── learnings/           # Auto-populated by hooks
│   │   ├── mistakes.md             # Tool errors
│   │   ├── patterns.md             # Discovered patterns
│   │   ├── decisions.md            # Architecture decisions
│   │   └── token-usage.md          # Session token consumption
│   ├── handovers/           # Session context (auto-managed)
│   └── agent-memory/        # Persistent subagent memory
├── test/
│   └── setup.test.js        # Smoke test (node:test runner)
├── docs/
│   └── skills/
│       └── index.md         # Skill inventory
├── skills/                  # OpenClaw skills (TBD)
├── package.json             # Changelog scripts + devDependencies
├── CHANGELOG.md             # Auto-generated from conventional commits
├── README.md                # User-facing project docs
├── CLAUDE.md
└── .gitignore
```

## Self-Improvement System

Automatic learning via Claude Code hooks:

| Hook Event | Script | Purpose |
|------------|--------|---------|
| SessionStart | `on-session-start.sh` | Load latest handover, clean old ones, summarize learnings |
| PostToolUseFailure | `on-failure-learn.sh` | Record tool errors to `learnings/mistakes.md` |
| PostToolUse (Write\|Edit) | `post-edit-docs.sh` | Remind to update docs when relevant files change |
| Stop (command) | `on-stop-learn.sh` | Parse transcript for corrections, patterns, decisions → persist to learnings/ |
| Stop (command) | `on-stop-token-log.sh` | Log token consumption, alert if >100k tokens |
| PreCompact | `on-compact-handover.sh` | Save session context before compaction |
| PreToolUse (Bash) | `validate-git-ops.sh` | Block force push, secret scanning, validate branch names |

Manual: `/reflect` triggers the reflector agent for deep analysis (including token usage patterns).

## Git Workflow

Rias uses version-based branching: `main → vX.Y.Z → feature/*`

- **main:** Stable, tagged releases only. Never push directly.
- **vX.Y.Z:** Version branches created from main. All development happens here.
- **feature/\*, bugfix/\*, etc.:** Work branches created from vX.Y.Z, squash merged back.
- **hotfix/vX.Y.Z-\*:** Emergency fixes from main at a tag.

Merge strategies:
- Work branches → vX.Y.Z: **squash merge**
- vX.Y.Z → main: **merge commit** (`--no-ff`) + tag

See `/git-management` skill for full details.

## Conventions

- Follows root `D:\REPOS\.claude\rules\` (git-workflow, code-style)
- Overrides root TDD rules with Node.js-specific `.claude/rules/tdd.md`
- Code and commits in English
- User-facing docs in Slovak
- OpenClaw skills follow `SKILL.md` format (see `.claude/rules/openclaw-skills.md`)
