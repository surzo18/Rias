#!/usr/bin/env bash
# PreCompact hook: Save session context to handover file
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
HANDOVERS_DIR="$PROJECT_DIR/.claude/handovers"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
HANDOVER_FILE="$HANDOVERS_DIR/handover-$TIMESTAMP.md"

mkdir -p "$HANDOVERS_DIR"

# Read JSON from stdin for context
INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id','unknown'))" 2>/dev/null || echo "unknown")

cat > "$HANDOVER_FILE" << EOF
# Session Handover - $TIMESTAMP

**Session:** $SESSION_ID
**Project:** Rias (OpenClaw integration)

## Context
Session was compacted. Key context from this session should be noted here.

## Working On
Check git status and recent commits for current work state.

## Notes
- Check \`.claude/learnings/\` for any new entries from this session
EOF

echo "Handover saved to $HANDOVER_FILE"
exit 0
