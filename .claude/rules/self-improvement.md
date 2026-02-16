# Self-Improvement Rules

## Automatic Learning

The hooks system captures learnings automatically:

- **PostToolUseFailure** → records errors to `learnings/mistakes.md`
- **Stop** → prompt hook evaluates if anything notable happened
- **PreCompact** → saves session context to `handovers/`
- **SessionStart** → loads latest handover + learnings summary

## What Gets Recorded

| Category | File | When |
|----------|------|------|
| Mistakes | `learnings/mistakes.md` | Tool failure (automatic) |
| Patterns | `learnings/patterns.md` | Stop hook detects pattern (automatic) |
| Decisions | `learnings/decisions.md` | Stop hook detects decision (automatic) |

## Manual Reflection

Use `/reflect` to trigger deep analysis:
- Identifies repeated patterns (3+ → propose new rule)
- Promotes key insights to CLAUDE.md
- Cleans up stale/duplicate entries

## Bloat Protection

- Learnings files: soft 100-line limit per file
- Handovers: auto-deleted after 7 days
- Only record genuinely notable learnings, not trivial observations
