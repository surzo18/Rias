---
name: audit-infra
description: Run a comprehensive infrastructure audit covering security, tokens, errors, logs, docs, infrastructure, git, and cleanup
user-invocable: true
argument-hint: "[--review-last]"
---

# Infrastructure Audit

Run a full audit of Rias infrastructure.

## Runtime data model

- Local runtime state: `.claude/local/**` (not committed)
- Versioned baseline/templates: `.claude/**` excluding `.claude/local/**`

Audit state files:
- latest: `.claude/local/audits/latest.json`
- reports: `.claude/local/audits/audit-YYYYMMDD-HHMM-passN.md`

## Mandatory pre-check

Before new audit run, load `.claude/local/audits/latest.json`.
If unresolved actions (`pending`, `in_progress`) exist:
- show unresolved items first
- ask user: `Implement now` / `Re-audit first` / `Defer`
- do not auto-implement without explicit user confirmation

## Checklist (8 areas)

1. Security
- hook safety flags
- git guard behavior
- secret scanning coverage
- permissions scope

2. Token usage
- check `.claude/local/learnings/token-usage.md`
- detect high sessions and trend quality

3. Errors and bugs
- check `.claude/local/learnings/mistakes.md`
- hook syntax and test outcomes
- platform risks

4. Logs
- check `.claude/local/learnings/hook-log.md`
- ensure hooks write consistently

5. Documentation
- README/CLAUDE/docs consistency
- structure and commands up to date

6. Infrastructure
- settings hook references
- local/runtime vs versioned split is respected
- scripts executable in expected environments

7. Git workflow
- branch/tag consistency
- commit format and release hygiene

8. Cleanup
- stale local handovers/logs
- bloated runtime files
- root/project hygiene

## After audit

1. Write report markdown to `.claude/local/audits/`.
2. Update `.claude/local/audits/latest.json` with summary and action statuses.
3. Append audit entry to `.claude/local/learnings/hook-log.md`.
4. For follow-up implementation, require explicit user confirmation.

## Output format

```markdown
## Audit Report - YYYY-MM-DD HH:mm (pass N)

| Area | Status | Issues |
|------|--------|--------|
| Security | PASS/WARN/FAIL | ... |
| Token Usage | PASS/WARN/FAIL | ... |
| Errors and Bugs | PASS/WARN/FAIL | ... |
| Logs | PASS/WARN/FAIL | ... |
| Documentation | PASS/WARN/FAIL | ... |
| Infrastructure | PASS/WARN/FAIL | ... |
| Git Workflow | PASS/WARN/FAIL | ... |
| Cleanup | PASS/WARN/FAIL | ... |

### Action Plan
| ID | Severity | Status | Action |
|----|----------|--------|--------|
| A1 | high | pending | ... |
```
