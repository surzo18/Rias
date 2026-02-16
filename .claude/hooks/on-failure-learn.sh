#!/usr/bin/env bash
# PostToolUseFailure hook: Record tool errors to learnings/mistakes.md
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
MISTAKES_FILE="$PROJECT_DIR/.claude/learnings/mistakes.md"

# Read JSON from stdin
INPUT=$(cat)

# Parse JSON with node (guaranteed available - Rias is a Node.js project)
TOOL_NAME=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.tool_name||'unknown')}catch{console.log('unknown')}})" 2>/dev/null || echo "unknown")
ERROR_MSG=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log((j.error||'unknown').slice(0,200))}catch{console.log('unknown')}})" 2>/dev/null || echo "unknown")
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
