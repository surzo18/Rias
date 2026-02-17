#!/usr/bin/env bash
# PreCompact hook: Save session context to local handover file
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOCAL_DIR="$PROJECT_DIR/.claude/local"
HANDOVERS_DIR="$LOCAL_DIR/handovers"
LEARNINGS_DIR="$LOCAL_DIR/learnings"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
HANDOVER_FILE="$HANDOVERS_DIR/handover-$TIMESTAMP.md"

mkdir -p "$HANDOVERS_DIR" "$LEARNINGS_DIR"

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.session_id||'unknown')}catch{console.log('unknown')}})" 2>/dev/null || echo "unknown")
TRIGGER=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.trigger||'unknown')}catch{console.log('unknown')}})" 2>/dev/null || echo "unknown")

GIT_BRANCH=$(cd "$PROJECT_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_STATUS=$(cd "$PROJECT_DIR" && git status --short 2>/dev/null | head -20 || echo "unable to determine")
GIT_LOG=$(cd "$PROJECT_DIR" && git log --oneline -5 2>/dev/null || echo "unable to determine")
UNCOMMITTED_COUNT=$(cd "$PROJECT_DIR" && git status --short 2>/dev/null | wc -l | tr -d ' ' || echo "0")

cat > "$HANDOVER_FILE" << EOF
# Session Handover - $TIMESTAMP

**Session:** $SESSION_ID
**Trigger:** $TRIGGER
**Project:** Rias (generic infra layer)

## Current State

**Branch:** $GIT_BRANCH
**Uncommitted changes:** $UNCOMMITTED_COUNT files

### Modified files
\`\`\`
$GIT_STATUS
\`\`\`

### Recent commits
\`\`\`
$GIT_LOG
\`\`\`

## Notes
- Local runtime context is stored under .claude/local/
EOF

HOOK_LOG="$LEARNINGS_DIR/hook-log.md"
if [ ! -f "$HOOK_LOG" ]; then
  printf '# Hook Execution Log\n\n| Date | Hook | Status | Details |\n|------|------|--------|---------|\n' > "$HOOK_LOG"
fi
printf '| %s | compact-handover | ok | saved to %s |\n' "$(date +'%Y-%m-%d %H:%M')" "$(basename "$HANDOVER_FILE")" >> "$HOOK_LOG"

echo "Handover saved to $HANDOVER_FILE" >&2
exit 0

