#!/usr/bin/env bash
# PostToolUseFailure hook: Record tool errors to local learnings/mistakes.md
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOCAL_DIR="$PROJECT_DIR/.claude/local"
LEARNINGS_DIR="$LOCAL_DIR/learnings"
MISTAKES_FILE="$LEARNINGS_DIR/mistakes.md"
HOOK_LOG="$LEARNINGS_DIR/hook-log.md"

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.tool_name||'unknown')}catch{console.log('unknown')}})" 2>/dev/null || echo "unknown")
ERROR_MSG=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log((j.error||'unknown').slice(0,200))}catch{console.log('unknown')}})" 2>/dev/null || echo "unknown")
DATE=$(date +%Y-%m-%d)

mkdir -p "$LEARNINGS_DIR"

if [ ! -f "$HOOK_LOG" ]; then
  printf '# Hook Execution Log\n\n| Date | Hook | Status | Details |\n|------|------|--------|---------|\n' > "$HOOK_LOG"
fi
printf '| %s | failure-learn | ok | %s: %s |\n' "$(date +'%Y-%m-%d %H:%M')" "$TOOL_NAME" "$(echo "$ERROR_MSG" | head -c 50)" >> "$HOOK_LOG"

if [ ! -f "$MISTAKES_FILE" ]; then
  cat > "$MISTAKES_FILE" << EOF
# Mistakes

Local runtime mistakes captured by hooks (not intended for direct commit).
EOF
fi

LINE_COUNT=$(wc -l < "$MISTAKES_FILE" 2>/dev/null || echo "0")
if [ "$LINE_COUNT" -gt 100 ] 2>/dev/null; then
  echo "BLOAT_WARNING: mistakes.md has $LINE_COUNT lines (soft limit: 100). Run /reflect to consolidate." >&2
fi

cat >> "$MISTAKES_FILE" << EOF

### $DATE: $TOOL_NAME error
<!-- Tool: $TOOL_NAME -->
<!-- Error: $ERROR_MSG -->
<!-- Root cause: TBD -->
<!-- Fix: TBD -->
EOF

exit 0
