#!/usr/bin/env bash
# SessionStart hook: Load latest handover and summarize learnings
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
HANDOVERS_DIR="$PROJECT_DIR/.claude/handovers"
LEARNINGS_DIR="$PROJECT_DIR/.claude/learnings"

# Clean handovers older than 7 days
if [ -d "$HANDOVERS_DIR" ]; then
  find "$HANDOVERS_DIR" -name "*.md" -mtime +7 -delete 2>/dev/null || :
fi

# Find latest handover
LATEST=""
if [ -d "$HANDOVERS_DIR" ]; then
  LATEST=$(ls -t "$HANDOVERS_DIR"/*.md 2>/dev/null | head -1) || LATEST=""
fi

OUTPUT=""

if [ -n "$LATEST" ] && [ -f "$LATEST" ]; then
  OUTPUT="Previous session handover found: $(basename "$LATEST")\n"
  OUTPUT+="$(cat "$LATEST")\n\n"
fi

# Summarize learnings (count entries)
for file in mistakes patterns decisions; do
  filepath="$LEARNINGS_DIR/$file.md"
  if [ -f "$filepath" ]; then
    count=$(grep -c "^### " "$filepath" 2>/dev/null) || count=0
    if [ "$count" -gt 0 ]; then
      OUTPUT+="Learnings/$file: $count entries\n"
    fi
  fi
done

if [ -n "$OUTPUT" ]; then
  echo -e "$OUTPUT"
fi

exit 0
