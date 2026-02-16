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
| Token usage | `learnings/token-usage.md` | Stop hook logs per-session totals (automatic) |

## Token Tracking

The Stop hook logs token consumption from each session:

- **Hook:** `on-stop-token-log.sh` (command type, runs alongside prompt hook)
- **Log file:** `learnings/token-usage.md`
- **Data:** input tokens, output tokens, total, turn count per session
- **Source:** Parsed from transcript JSONL (`usage` objects in assistant messages)

The `/reflect` command analyzes token usage for patterns:
- High-usage sessions (>100k tokens) flagged for review
- Trends over time (increasing/decreasing per-session usage)
- Correlation between turn count and token consumption

## Manual Reflection

Use `/reflect` to trigger deep analysis:
- Identifies repeated patterns (3+ → propose new rule)
- Promotes key insights to CLAUDE.md
- Analyzes token usage trends
- Cleans up stale/duplicate entries

## Bloat Protection

- Learnings files: soft 100-line limit per file
- Handovers: auto-deleted after 7 days
- Only record genuinely notable learnings, not trivial observations
