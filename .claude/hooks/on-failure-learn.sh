#!/usr/bin/env bash
# PostToolUseFailure hook: Record tool errors to learnings/mistakes.md
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
MISTAKES_FILE="$PROJECT_DIR/.claude/learnings/mistakes.md"

# Read JSON from stdin
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name','unknown'))" 2>/dev/null || echo "unknown")
ERROR_MSG=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_error', d.get('error','unknown'))[:200])" 2>/dev/null || echo "unknown")
DATE=$(date +%Y-%m-%d)

# Append to mistakes file
cat >> "$MISTAKES_FILE" << EOF

### $DATE: $TOOL_NAME error
<!-- Tool: $TOOL_NAME -->
<!-- Error: $ERROR_MSG -->
<!-- Root cause: TBD -->
<!-- Fix: TBD -->
EOF

exit 0
