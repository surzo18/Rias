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

# Parse JSONL: sum tokens from assistant messages, format output in one Node.js call
RESULT=$(node -e "
  const fs = require('fs');
  const path = process.argv[1];
  const lines = fs.readFileSync(path,'utf8').trim().split('\n');
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
  if (total === 0) { process.exit(1); }
  const fmt = n => n.toLocaleString();
  console.log([fmt(inputTokens), fmt(outputTokens), fmt(total), turns].join('|'));
" "$TRANSCRIPT" 2>/dev/null) || exit 0

IFS='|' read -r INPUT_FMT OUTPUT_FMT TOTAL_FMT TURNS <<< "$RESULT"

TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
LOG_FILE="$CLAUDE_PROJECT_DIR/.claude/learnings/token-usage.md"

# Create file with header if it doesn't exist
if [ ! -f "$LOG_FILE" ]; then
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "# Token Usage Log" > "$LOG_FILE"
  echo "" >> "$LOG_FILE"
fi

# Append entry
cat >> "$LOG_FILE" << EOF

### $TIMESTAMP
- Input: $INPUT_FMT | Output: $OUTPUT_FMT | Total: $TOTAL_FMT
- Turns: $TURNS
EOF

exit 0
