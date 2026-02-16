#!/usr/bin/env bash
# PreToolUse hook for Bash: Validate git operations
set -euo pipefail

# Read JSON from stdin, parse with node (guaranteed available)
INPUT=$(cat)

COMMAND=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log((j.tool_input&&j.tool_input.command)||'')}catch{console.log('')}})" 2>/dev/null || echo "")

# Only check git commands
if ! echo "$COMMAND" | grep -q "^git "; then
  exit 0
fi

# Block force push
if echo "$COMMAND" | grep -qE "git push.*--force[^-]|git push.*--force$"; then
  echo "BLOCKED: Force push is not allowed. Use --force-with-lease if absolutely necessary." >&2
  exit 2
fi

# Block direct push to main
if echo "$COMMAND" | grep -qE "git push.*\b(origin|upstream)\s+main\b"; then
  echo "BLOCKED: Direct push to main is not allowed. Use a feature branch and PR." >&2
  exit 2
fi

# Block destructive resets
if echo "$COMMAND" | grep -qE "git reset --hard"; then
  echo "BLOCKED: git reset --hard is not allowed. Use git stash or git reset --soft instead." >&2
  exit 2
fi

# Validate branch name on checkout -b / switch -c
if echo "$COMMAND" | grep -qE "git checkout -b|git switch -c"; then
  BRANCH=$(echo "$COMMAND" | sed -n 's/.*\(checkout -b\|switch -c\) \+\([^ ]*\).*/\2/p')
  if [ -n "$BRANCH" ]; then
    if ! echo "$BRANCH" | grep -qE "^(feature|bugfix|hotfix|refactor|test|docs)/[a-z0-9-]+$"; then
      echo "WARNING: Branch name '$BRANCH' should follow pattern: <prefix>/<lowercase-with-hyphens>" >&2
      echo "Allowed prefixes: feature/, bugfix/, hotfix/, refactor/, test/, docs/" >&2
    fi
  fi
fi

exit 0
