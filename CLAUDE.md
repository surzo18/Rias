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
- **Platform:** OpenClaw Gateway (WebSocket + HTTP, default port 18789)
- **Related project:** `tools/esdeath/` runs the OpenClaw assistant instance (Telegram + TTS)

## Build & Test Commands

```bash
# TBD - stack not yet decided
npm install                  # Install dependencies
npm test                     # Run tests
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
│   │   └── pre-commit.sh           # Git operation validation
│   ├── rules/               # Auto-loaded project rules
│   │   ├── openclaw-skills.md      # OpenClaw skill format rules
│   │   └── self-improvement.md     # Learning system rules
│   ├── skills/              # Claude Code skills
│   │   ├── git-management/SKILL.md # Git workflow enforcement
│   │   └── reflect/SKILL.md        # Deep reflection trigger
│   ├── agents/              # Custom subagent definitions
│   │   └── reflector.md            # Learnings analysis agent
│   ├── learnings/           # Auto-populated by hooks
│   │   ├── mistakes.md             # Tool errors
│   │   ├── patterns.md             # Discovered patterns
│   │   └── decisions.md            # Architecture decisions
│   ├── handovers/           # Session context (auto-managed)
│   └── agent-memory/        # Persistent subagent memory
├── skills/                  # OpenClaw skills (TBD)
├── CLAUDE.md
└── .gitignore
```

## Self-Improvement System

Automatic learning via Claude Code hooks:

| Hook Event | Script | Purpose |
|------------|--------|---------|
| SessionStart | `on-session-start.sh` | Load latest handover, clean old ones, summarize learnings |
| PostToolUseFailure | `on-failure-learn.sh` | Record tool errors to `learnings/mistakes.md` |
| Stop | prompt hook (haiku) | Evaluate if anything notable happened, record to learnings |
| PreCompact | `on-compact-handover.sh` | Save session context before compaction |
| PreToolUse (Bash) | `pre-commit.sh` | Block force push, validate branch names, check commit format |

Manual: `/reflect` triggers the reflector agent for deep analysis.

## Conventions

- Follows root `D:\REPOS\.claude\rules\` (git-workflow, code-style, tdd)
- Code and commits in English
- User-facing docs in Slovak
- OpenClaw skills follow `SKILL.md` format (see `.claude/rules/openclaw-skills.md`)
