#!/usr/bin/env bash
# SessionStart hook: Load handover, summarize learnings, track sessions, trigger audit
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOCAL_DIR="$PROJECT_DIR/.claude/local"
HANDOVERS_DIR="$LOCAL_DIR/handovers"
LEARNINGS_DIR="$LOCAL_DIR/learnings"
AGENT_MEMORY="$LOCAL_DIR/agent-memory"
AUDITS_DIR="$LOCAL_DIR/audits"
COUNTER_FILE="$AGENT_MEMORY/session-counter.json"
DEFAULT_COUNTER_FILE="$PROJECT_DIR/.claude/agent-memory/session-counter.json"
LATEST_AUDIT_JSON="$AUDITS_DIR/latest.json"
FALLBACK_AUDIT_JSON="$PROJECT_DIR/.claude/audits/latest.json"
HOOK_LOG="$LEARNINGS_DIR/hook-log.md"

mkdir -p "$HANDOVERS_DIR" "$LEARNINGS_DIR" "$AGENT_MEMORY" "$AUDITS_DIR"

if [ ! -f "$COUNTER_FILE" ] && [ -f "$DEFAULT_COUNTER_FILE" ]; then
  cp "$DEFAULT_COUNTER_FILE" "$COUNTER_FILE" 2>/dev/null || :
fi

SESSION_COUNT=0
LAST_AUDIT_AT=0
AUDIT_INTERVAL=100
if [ -f "$COUNTER_FILE" ]; then
  SESSION_COUNT=$(node -e "try{const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.sessionCount||0)}catch{console.log(0)}" "$COUNTER_FILE" 2>/dev/null || echo "0")
  LAST_AUDIT_AT=$(node -e "try{const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.lastAuditAt||0)}catch{console.log(0)}" "$COUNTER_FILE" 2>/dev/null || echo "0")
  AUDIT_INTERVAL=$(node -e "try{const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.auditInterval||100)}catch{console.log(100)}" "$COUNTER_FILE" 2>/dev/null || echo "100")
fi

SESSION_COUNT=$((SESSION_COUNT + 1))

node -e "
  const fs = require('fs');
  const f = process.argv[1];
  let j = {};
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  j.sessionCount = parseInt(process.argv[2]) || 0;
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
" "$COUNTER_FILE" "$SESSION_COUNT" 2>/dev/null || :

if [ ! -f "$HOOK_LOG" ]; then
  printf '# Hook Execution Log\n\n| Date | Hook | Status | Details |\n|------|------|--------|---------|\n' > "$HOOK_LOG"
fi
printf '| %s | session-start | ok | session #%s |\n' "$(date +'%Y-%m-%d %H:%M')" "$SESSION_COUNT" >> "$HOOK_LOG"

find "$HANDOVERS_DIR" -name "*.md" -mtime +7 -delete 2>/dev/null || :

LATEST=""
LATEST=$(ls -t "$HANDOVERS_DIR"/*.md 2>/dev/null | head -1) || LATEST=""

OUTPUT=""

if [ -n "$LATEST" ] && [ -f "$LATEST" ]; then
  OUTPUT="Previous session handover found: $(basename "$LATEST")\n"
  OUTPUT+="$(cat "$LATEST")\n\n"
fi

for file in mistakes patterns decisions; do
  filepath="$LEARNINGS_DIR/$file.md"
  if [ -f "$filepath" ]; then
    count=$(grep -c "^### " "$filepath" 2>/dev/null) || count=0
    if [ "$count" -gt 0 ]; then
      OUTPUT+="Learnings/$file: $count entries\n"
    fi
  fi
done

OUTPUT+="Session #$SESSION_COUNT"
SINCE_AUDIT=$((SESSION_COUNT - LAST_AUDIT_AT))
OUTPUT+=" ($SINCE_AUDIT since last audit)\n"

if [ "$SINCE_AUDIT" -ge "$AUDIT_INTERVAL" ] 2>/dev/null; then
  OUTPUT+="\nAUDIT_DUE: $SINCE_AUDIT sessions since last audit (threshold: $AUDIT_INTERVAL). Run /audit-infra to perform full infrastructure audit.\n"
fi

ACTIVE_AUDIT_JSON=""
if [ -f "$LATEST_AUDIT_JSON" ]; then
  ACTIVE_AUDIT_JSON="$LATEST_AUDIT_JSON"
elif [ -f "$FALLBACK_AUDIT_JSON" ]; then
  ACTIVE_AUDIT_JSON="$FALLBACK_AUDIT_JSON"
fi

if [ -n "$ACTIVE_AUDIT_JSON" ]; then
  AUDIT_META=$(node -e "
    const fs = require('fs');
    try {
      const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      const actions = Array.isArray(j.actions) ? j.actions : [];
      const pending = actions.filter(a => {
        const s = String((a && a.status) || 'pending').toLowerCase();
        return s !== 'done' && s !== 'wontfix';
      }).length;
      const id = j.id || 'unknown';
      const date = j.date || 'unknown';
      process.stdout.write([pending, id, date].join('|'));
    } catch {
      process.stdout.write('0|unknown|unknown');
    }
  " "$ACTIVE_AUDIT_JSON" 2>/dev/null || echo "0|unknown|unknown")

  IFS='|' read -r AUDIT_PENDING AUDIT_ID AUDIT_DATE <<< "$AUDIT_META"
  if [ "${AUDIT_PENDING:-0}" -gt 0 ] 2>/dev/null; then
    OUTPUT+="\nAUDIT_FOLLOWUP: Last audit ($AUDIT_ID, $AUDIT_DATE) has $AUDIT_PENDING unresolved action item(s).\n"
    OUTPUT+="Before implementing the plan, ask the user for explicit confirmation.\n"
    OUTPUT+="After fixes, run /audit-infra again to refresh statuses.\n"
  fi
fi

if [ -n "$OUTPUT" ]; then
  echo -e "$OUTPUT"
fi

exit 0
