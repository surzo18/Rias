#!/usr/bin/env bash
# SessionStart hook: Load handover, summarize learnings, track sessions, trigger audit
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
HANDOVERS_DIR="$PROJECT_DIR/.claude/handovers"
LEARNINGS_DIR="$PROJECT_DIR/.claude/learnings"
AGENT_MEMORY="$PROJECT_DIR/.claude/agent-memory"
COUNTER_FILE="$AGENT_MEMORY/session-counter.json"
HOOK_LOG="$LEARNINGS_DIR/hook-log.md"

# Ensure directories exist
mkdir -p "$AGENT_MEMORY" "$LEARNINGS_DIR"

# --- Session Counter ---
SESSION_COUNT=0
LAST_AUDIT_AT=0
AUDIT_INTERVAL=100
if [ -f "$COUNTER_FILE" ]; then
  SESSION_COUNT=$(node -e "try{const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.sessionCount||0)}catch{console.log(0)}" "$COUNTER_FILE" 2>/dev/null || echo "0")
  LAST_AUDIT_AT=$(node -e "try{const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.lastAuditAt||0)}catch{console.log(0)}" "$COUNTER_FILE" 2>/dev/null || echo "0")
  AUDIT_INTERVAL=$(node -e "try{const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.auditInterval||100)}catch{console.log(100)}" "$COUNTER_FILE" 2>/dev/null || echo "100")
fi

SESSION_COUNT=$((SESSION_COUNT + 1))

# Write updated counter
node -e "
  const fs = require('fs');
  const f = process.argv[1];
  let j = {};
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  j.sessionCount = parseInt(process.argv[2]) || 0;
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
" "$COUNTER_FILE" "$SESSION_COUNT" 2>/dev/null || :

# Log this hook execution
if [ ! -f "$HOOK_LOG" ]; then
  printf '# Hook Execution Log\n\n| Date | Hook | Status | Details |\n|------|------|--------|---------|\n' > "$HOOK_LOG"
fi
printf '| %s | session-start | ok | session #%s |\n' "$(date +'%Y-%m-%d %H:%M')" "$SESSION_COUNT" >> "$HOOK_LOG"

# --- Clean handovers older than 7 days ---
if [ -d "$HANDOVERS_DIR" ]; then
  find "$HANDOVERS_DIR" -name "*.md" -mtime +7 -delete 2>/dev/null || :
fi

# --- Find latest handover ---
LATEST=""
if [ -d "$HANDOVERS_DIR" ]; then
  LATEST=$(ls -t "$HANDOVERS_DIR"/*.md 2>/dev/null | head -1) || LATEST=""
fi

OUTPUT=""

if [ -n "$LATEST" ] && [ -f "$LATEST" ]; then
  OUTPUT="Previous session handover found: $(basename "$LATEST")\n"
  OUTPUT+="$(cat "$LATEST")\n\n"
fi

# --- Summarize learnings ---
for file in mistakes patterns decisions; do
  filepath="$LEARNINGS_DIR/$file.md"
  if [ -f "$filepath" ]; then
    count=$(grep -c "^### " "$filepath" 2>/dev/null) || count=0
    if [ "$count" -gt 0 ]; then
      OUTPUT+="Learnings/$file: $count entries\n"
    fi
  fi
done

# --- Session info ---
OUTPUT+="Session #$SESSION_COUNT"
SINCE_AUDIT=$((SESSION_COUNT - LAST_AUDIT_AT))
OUTPUT+=" ($SINCE_AUDIT since last audit)\n"

# --- Audit trigger ---
if [ "$SINCE_AUDIT" -ge "$AUDIT_INTERVAL" ] 2>/dev/null; then
  OUTPUT+="\n⚠ AUDIT DUE: $SINCE_AUDIT sessions since last audit (threshold: $AUDIT_INTERVAL). Run /audit-infra to perform full infrastructure audit.\n"
fi

if [ -n "$OUTPUT" ]; then
  echo -e "$OUTPUT"
fi

exit 0
