# Self-Improvement Rules

## Runtime storage policy

- Local runtime state must go to `.claude/local/**` (not for commit).
- Versioned defaults/templates stay in `.claude/**` (excluding `.claude/local/**`).

## Automatic learning hooks

- `PostToolUseFailure` -> `.claude/local/learnings/mistakes.md`
- `Stop` (`on-stop-learn.sh`) -> `.claude/local/learnings/patterns.md`, `.claude/local/learnings/decisions.md`
- `Stop` (`on-stop-token-log.sh`) -> `.claude/local/learnings/token-usage.md`
- `PreCompact` -> `.claude/local/handovers/*.md`
- `SessionStart` -> local context summary + audit follow-up check

## Audit model

- Latest local audit: `.claude/local/audits/latest.json`
- Local reports: `.claude/local/audits/audit-*.md`
- Versioned baseline audit config may stay in `.claude/audits/`

Follow-up rule:
- If unresolved audit actions exist, require explicit user confirmation before implementation.

## Bloat protection

- Learnings files: soft limit 100 lines per file
- Hook log: trim during audits if needed
- Old handovers: auto-cleaned after retention period
