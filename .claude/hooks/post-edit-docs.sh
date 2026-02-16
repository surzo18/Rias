#!/usr/bin/env bash
# PostToolUse hook: Remind to update docs when relevant files change
# Matcher: Write|Edit
set -euo pipefail

# Read the tool input from stdin
INPUT=$(cat)

# Extract the file path from the tool input using node
FILE_PATH=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const ti=j.tool_input||{};console.log(ti.file_path||ti.filePath||'')}catch{console.log('')}})" 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize path separators
FILE_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

REMINDERS=""

# Check what was edited and suggest doc updates
case "$FILE_PATH" in
  */package.json)
    REMINDERS="package.json changed - verify CLAUDE.md build commands and README.md quick start are up to date"
    ;;
  */skills/*/SKILL.md)
    REMINDERS="Skill file changed - verify docs/skills/index.md and README.md skills table are up to date"
    ;;
  */CLAUDE.md)
    REMINDERS="CLAUDE.md changed - verify settings.json and README.md are aligned"
    ;;
  */.claude/settings.json)
    REMINDERS="settings.json changed - verify CLAUDE.md hooks table is up to date"
    ;;
  */.claude/rules/*.md)
    REMINDERS="Rule file changed - verify CLAUDE.md conventions section is up to date"
    ;;
  */.claude/hooks/*.sh)
    REMINDERS="Hook script changed - verify CLAUDE.md hooks table and settings.json are up to date"
    ;;
esac

if [ -n "$REMINDERS" ]; then
  echo "DOC_REMINDER: $REMINDERS"
fi

exit 0
