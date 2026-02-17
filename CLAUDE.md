# CLAUDE.md - Rias

## Overview

Rias je infrastruktura/starter pre agent workflows.
Business logika a projektove skills patria do `src/`.

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

## Scope

Rias je vendor-agnosticka infra vrstva pre AI projekt workflow.

## Build and test

```bash
npm install
npm test
npm run test:watch
npm run changelog
npm run changelog:init
```

## Structure

```text
tools/Rias/
|- .claude/
|  |- hooks/
|  |- rules/
|  |- skills/
|  |- audits/
|  |- learnings/
|  `- local/ (gitignored runtime)
|- src/skills/
|- docs/skills/index.md
|- test/
|- README.md
|- CLAUDE.md
`- package.json
```

## Hooks

- `on-session-start.sh` -> runtime session summary, audit follow-up check
- `validate-git-ops.sh` -> git safety + secret checks
- `on-failure-learn.sh` -> runtime mistakes log
- `on-stop-learn.sh` -> runtime patterns/decisions extraction
- `on-stop-token-log.sh` -> runtime token logging
- `on-compact-handover.sh` -> runtime handover snapshot
- `post-edit-docs.sh` -> docs reminder

## Git workflow

`main -> vX.Y.Z -> feature/*`

- work branches from `vX.Y.Z`
- squash merge back to version branch
- release via merge commit (`--no-ff`) to `main` + matching tag

## Conventions

- Code and commits: English
- User-facing docs: Slovak
- Keep runtime records local, keep templates/defaults versioned
