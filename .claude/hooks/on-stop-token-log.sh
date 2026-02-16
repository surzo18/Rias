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

# Parse JSONL: sum input_tokens + output_tokens from assistant messages, count turns
STATS=$(node -e "
  const fs = require('fs');
  const lines = fs.readFileSync('$TRANSCRIPT','utf8').trim().split('\n');
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
  console.log(JSON.stringify({ inputTokens, outputTokens, total: inputTokens + outputTokens, turns }));
" 2>/dev/null || echo "")

if [ -z "$STATS" ]; then
  exit 0
fi

INPUT_TOKENS=$(echo "$STATS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).inputTokens))")
OUTPUT_TOKENS=$(echo "$STATS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).outputTokens))")
TOTAL=$(echo "$STATS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).total))")
TURNS=$(echo "$STATS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).turns))")

# Skip if no usage data found
if [ "$TOTAL" = "0" ]; then
  exit 0
fi

# Format numbers with commas
format_number() {
  echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(Number(d.trim()).toLocaleString()))"
}

INPUT_FMT=$(format_number "$INPUT_TOKENS")
OUTPUT_FMT=$(format_number "$OUTPUT_TOKENS")
TOTAL_FMT=$(format_number "$TOTAL")

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
