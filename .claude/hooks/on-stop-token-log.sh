#!/usr/bin/env bash
# Stop hook (command): Parse transcript JSONL for token usage and log totals
set -euo pipefail

INPUT=$(cat)

TRANSCRIPT=$(echo "$INPUT" | node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).transcript_path||''); }
    catch { console.log(''); }
  });
" 2>/dev/null || echo "")

if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  exit 0
fi

RESULT=$(node -e "
  const fs = require('fs');
  const path = process.argv[1];
  const lines = fs.readFileSync(path,'utf8').trim().split('\\n');
  let inputTokens = 0, outputTokens = 0, turns = 0;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'assistant' && obj.message && obj.message.usage) {
        inputTokens += obj.message.usage.input_tokens || 0;
        outputTokens += obj.message.usage.output_tokens || 0;
        turns++;
      }
    } catch {}
  }
  const total = inputTokens + outputTokens;
  if (total === 0) process.exit(1);
  const fmt = n => n.toLocaleString();
  console.log([fmt(inputTokens), fmt(outputTokens), fmt(total), turns, total].join('|'));
" "$TRANSCRIPT" 2>/dev/null) || exit 0

IFS='|' read -r INPUT_FMT OUTPUT_FMT TOTAL_FMT TURNS TOTAL_RAW <<< "$RESULT"

THRESHOLD=100000
if [ "$TOTAL_RAW" -gt "$THRESHOLD" ] 2>/dev/null; then
  echo "TOKEN_WARNING: Session used $TOTAL_FMT tokens (threshold: $(node -e "console.log(($THRESHOLD).toLocaleString())"))." >&2
fi

TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LEARNINGS_DIR="$PROJECT_DIR/.claude/local/learnings"
LOG_FILE="$LEARNINGS_DIR/token-usage.md"
HOOK_LOG="$LEARNINGS_DIR/hook-log.md"

mkdir -p "$LEARNINGS_DIR"

if [ ! -f "$LOG_FILE" ]; then
  echo "# Token Usage Log" > "$LOG_FILE"
  echo "" >> "$LOG_FILE"
fi

if [ ! -f "$HOOK_LOG" ]; then
  printf '# Hook Execution Log\n\n| Date | Hook | Status | Details |\n|------|------|--------|---------|\n' > "$HOOK_LOG"
fi
printf '| %s | stop-token-log | ok | %s tokens, %s turns |\n' "$TIMESTAMP" "$TOTAL_FMT" "$TURNS" >> "$HOOK_LOG"

cat >> "$LOG_FILE" << EOF

### $TIMESTAMP
- Input: $INPUT_FMT | Output: $OUTPUT_FMT | Total: $TOTAL_FMT
- Turns: $TURNS
EOF

exit 0
