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
│   └── skills/              # Claude Code skills (local)
├── skills/                  # OpenClaw skills (TBD)
├── CLAUDE.md
└── .gitignore
```

## Conventions

- Follows root `D:\REPOS\.claude\rules\` (git-workflow, code-style, tdd)
- Code and commits in English
- User-facing docs in Slovak
