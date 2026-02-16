#!/usr/bin/env bash
# PreCompact hook: Save session context to handover file
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
HANDOVERS_DIR="$PROJECT_DIR/.claude/handovers"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
HANDOVER_FILE="$HANDOVERS_DIR/handover-$TIMESTAMP.md"

mkdir -p "$HANDOVERS_DIR"

# Read JSON from stdin
INPUT=$(cat)

# Parse JSON with node (guaranteed available - Rias is a Node.js project)
SESSION_ID=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.session_id||'unknown')}catch{console.log('unknown')}})" 2>/dev/null || echo "unknown")
TRIGGER=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.trigger||'unknown')}catch{console.log('unknown')}})" 2>/dev/null || echo "unknown")

# Capture actual git context
GIT_BRANCH=$(cd "$PROJECT_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_STATUS=$(cd "$PROJECT_DIR" && git status --short 2>/dev/null | head -20 || echo "unable to determine")
GIT_LOG=$(cd "$PROJECT_DIR" && git log --oneline -5 2>/dev/null || echo "unable to determine")
UNCOMMITTED_COUNT=$(cd "$PROJECT_DIR" && git status --short 2>/dev/null | wc -l | tr -d ' ' || echo "0")

cat > "$HANDOVER_FILE" << EOF
# Session Handover - $TIMESTAMP

**Session:** $SESSION_ID
**Trigger:** $TRIGGER
**Project:** Rias (OpenClaw integration)

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
- Check \`.claude/learnings/\` for any new entries from this session
EOF

# Log hook execution
HOOK_LOG="$PROJECT_DIR/.claude/learnings/hook-log.md"
if [ -f "$HOOK_LOG" ]; then
  printf '| %s | compact-handover | ok | saved to %s |\n' "$(date +'%Y-%m-%d %H:%M')" "$(basename "$HANDOVER_FILE")" >> "$HOOK_LOG"
fi

echo "Handover saved to $HANDOVER_FILE" >&2
exit 0
