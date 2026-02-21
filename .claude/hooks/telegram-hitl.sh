#!/usr/bin/env bash
# PreToolUse/Bash hook: HITL approval for risky commands via Telegram
set -euo pipefail

# Load local env (gitignored, never committed)
_ENV_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/local/.env"
# shellcheck disable=SC1090
[ -f "$_ENV_FILE" ] && source "$_ENV_FILE"

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | node -e "
  let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(d);
      console.log((j.tool_input && j.tool_input.command) || '');
    } catch {
      console.log('');
    }
  });
" 2>/dev/null || echo "")

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Detect risky patterns
is_risky=0

if echo "$COMMAND" | grep -qE 'rm[[:space:]]+-[rRfF]*r[rRfF]*[[:space:]]|rm[[:space:]]+-rf|rm[[:space:]]+-fr'; then
  is_risky=1
elif echo "$COMMAND" | grep -qE 'curl.*\|[[:space:]]*(ba)?sh'; then
  is_risky=1
elif echo "$COMMAND" | grep -qE 'npm[[:space:]]+publish'; then
  is_risky=1
elif echo "$COMMAND" | grep -qE 'docker[[:space:]]+push'; then
  is_risky=1
elif echo "$COMMAND" | grep -iqE 'DROP[[:space:]]+TABLE'; then
  is_risky=1
elif echo "$COMMAND" | grep -qE 'git[[:space:]]+push[[:space:]]+.*--force'; then
  is_risky=1
fi

if [ "$is_risky" -eq 0 ]; then
  exit 0
fi

# Not configured: warn and pass through
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "HITL WARNING: Risky command detected but Telegram not configured. Allowing: $COMMAND" >&2
  exit 0
fi

# Dry run mode for testing / CI
if [ "${TELEGRAM_HITL_DRY_RUN:-}" = "1" ]; then
  echo "HITL: risky command intercepted (dry run): $COMMAND" >&2
  exit 0
fi

API_BASE="${TELEGRAM_API_BASE:-https://api.telegram.org}"

# Escape command for JSON
ESCAPED_CMD=$(echo "$COMMAND" | node -e "
  let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    process.stdout.write(JSON.stringify(d.trim()));
  });
" 2>/dev/null || echo "\"$COMMAND\"")

# Send approval request with inline keyboard
MSG=$(curl -sf --max-time 15 -X POST "${API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{
    \"chat_id\": \"${TELEGRAM_CHAT_ID}\",
    \"text\": \"⚠️ HITL Approval Required\\n\\nCommand:\\n\`\`\`\\n${COMMAND}\\n\`\`\`\\n\\nApprove this action?\",
    \"parse_mode\": \"Markdown\",
    \"reply_markup\": {
      \"inline_keyboard\": [[
        {\"text\": \"✅ Approve\", \"callback_data\": \"hitl:approve\"},
        {\"text\": \"❌ Reject\",  \"callback_data\": \"hitl:reject\"},
        {\"text\": \"⏸ Defer\",   \"callback_data\": \"hitl:defer\"}
      ]]
    }
  }" 2>/dev/null || echo "{}")

MESSAGE_ID=$(echo "$MSG" | node -e "
  let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(d);
      console.log((j.result && j.result.message_id) || '');
    } catch {
      console.log('');
    }
  });
" 2>/dev/null || echo "")

if [ -z "$MESSAGE_ID" ]; then
  echo "HITL: Failed to send approval request. Blocking for safety." >&2
  exit 1
fi

echo "HITL: Waiting for Telegram approval (message ${MESSAGE_ID}, timeout 120s)..." >&2

TIMEOUT=120
OFFSET=0
START=$(date +%s)

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "HITL: Timeout after ${TIMEOUT}s. Blocking command." >&2
    exit 1
  fi

  UPDATES=$(curl -sf --max-time 10 -X POST "${API_BASE}/bot${TELEGRAM_BOT_TOKEN}/getUpdates" \
    -H "Content-Type: application/json" \
    -d "{\"offset\": ${OFFSET}, \"timeout\": 5, \"allowed_updates\": [\"callback_query\"]}" \
    2>/dev/null || echo "{}")

  PARSED=$(echo "$UPDATES" | node -e "
    let d='';
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => {
      try {
        const j = JSON.parse(d);
        const updates = j.result || [];
        for (const u of updates) {
          const cq = u.callback_query;
          if (cq && cq.message && String(cq.message.message_id) === '${MESSAGE_ID}') {
            const verdict = cq.data.replace('hitl:', '');
            process.stdout.write('verdict=' + verdict + '\ncb_id=' + cq.id + '\n');
            return;
          }
        }
        const last = updates[updates.length - 1];
        if (last) process.stdout.write('offset=' + (last.update_id + 1) + '\n');
        else process.stdout.write('none\n');
      } catch {
        process.stdout.write('none\n');
      }
    });
  " 2>/dev/null || echo "none")

  VERDICT=$(echo "$PARSED" | grep '^verdict=' | cut -d= -f2 || echo "")
  CB_ID=$(echo "$PARSED"   | grep '^cb_id='   | cut -d= -f2 || echo "")
  NEW_OFFSET=$(echo "$PARSED" | grep '^offset=' | cut -d= -f2 || echo "")

  if [ -n "$VERDICT" ] && [ -n "$CB_ID" ]; then
    # Acknowledge callback
    curl -sf --max-time 5 -X POST "${API_BASE}/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery" \
      -H "Content-Type: application/json" \
      -d "{\"callback_query_id\": \"${CB_ID}\", \"text\": \"Response received\"}" \
      >/dev/null 2>&1 || true

    case "$VERDICT" in
      approve)
        echo "HITL: Approved." >&2
        exit 0
        ;;
      reject)
        echo "HITL: Rejected by user." >&2
        exit 1
        ;;
      defer)
        echo "HITL: Deferred by user. Blocking for now." >&2
        exit 1
        ;;
    esac
  elif [ -n "$NEW_OFFSET" ]; then
    OFFSET="$NEW_OFFSET"
  fi

  sleep 1
done
