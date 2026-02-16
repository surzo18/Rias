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

# Block force push (--force and -f short form)
if echo "$COMMAND" | grep -qE "git push.*(--force[^-]|--force$| -f\b| -f$)"; then
  echo "BLOCKED: Force push is not allowed. Use --force-with-lease if absolutely necessary." >&2
  exit 2
fi

# Block direct push to main
if echo "$COMMAND" | grep -qE "git push.*\b(origin|upstream)\s+main\b"; then
  echo "BLOCKED: Direct push to main is not allowed. Merge version branches with --no-ff." >&2
  exit 2
fi

# Block destructive resets
if echo "$COMMAND" | grep -qE "git reset --hard"; then
  echo "BLOCKED: git reset --hard is not allowed. Use git stash or git reset --soft instead." >&2
  exit 2
fi

# Block committing files with secret-like names (NEVER reads file content)
if echo "$COMMAND" | grep -qE "^git commit"; then
  DANGEROUS_FILES=$(git diff --cached --name-only 2>/dev/null | grep -iE '\.env($|\.)|\.key$|\.pem$|\.p12$|\.pfx$|credentials|secret|\.secret|api.?key|token\.json|\.keystore$' || true)
  if [ -n "$DANGEROUS_FILES" ]; then
    echo "BLOCKED: Staged files may contain secrets (checked filenames only, never content):" >&2
    echo "$DANGEROUS_FILES" | while read -r f; do echo "  - $f" >&2; done
    echo "Remove them with: git reset HEAD <file>" >&2
    exit 2
  fi
fi

# Block adding files with secret-like names directly
if echo "$COMMAND" | grep -qE "^git add"; then
  # Extract file arguments (skip flags)
  ADDED_FILES=$(echo "$COMMAND" | sed 's/^git add //' | tr ' ' '\n' | grep -v '^-' || true)
  DANGEROUS_ADDS=$(echo "$ADDED_FILES" | grep -iE '\.env($|\.)|\.key$|\.pem$|\.p12$|\.pfx$|credentials|secret|\.secret|api.?key|token\.json|\.keystore$' || true)
  if [ -n "$DANGEROUS_ADDS" ]; then
    echo "WARNING: Adding files that may contain secrets (checked filenames only, never content):" >&2
    echo "$DANGEROUS_ADDS" | while read -r f; do echo "  - $f" >&2; done
  fi
fi

# Validate branch name on checkout -b / switch -c
if echo "$COMMAND" | grep -qE "git checkout -b|git switch -c"; then
  BRANCH=$(echo "$COMMAND" | sed -n 's/.*\(checkout -b\|switch -c\) \+\([^ ]*\).*/\2/p')
  if [ -n "$BRANCH" ]; then
    # Valid patterns: vX.Y.Z, feature/*, bugfix/*, refactor/*, test/*, docs/*, hotfix/vX.Y.Z-*
    if ! echo "$BRANCH" | grep -qE "^(v[0-9]+\.[0-9]+\.[0-9]+|(feature|bugfix|refactor|test|docs)/[a-z0-9-]+|hotfix/v[0-9]+\.[0-9]+\.[0-9]+-[a-z0-9-]+)$"; then
      echo "WARNING: Branch name '$BRANCH' does not match allowed patterns:" >&2
      echo "  vX.Y.Z                          (version branch from main)" >&2
      echo "  feature/<name>                  (from vX.Y.Z)" >&2
      echo "  bugfix/<name>                   (from vX.Y.Z)" >&2
      echo "  refactor/<name>                 (from vX.Y.Z)" >&2
      echo "  test/<name>                     (from vX.Y.Z)" >&2
      echo "  docs/<name>                     (from vX.Y.Z)" >&2
      echo "  hotfix/vX.Y.Z-<desc>            (from main at tag)" >&2
    fi

    # Warn if creating a work branch from main (should be from vX.Y.Z)
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
      if echo "$BRANCH" | grep -qE "^(feature|bugfix|refactor|test|docs)/"; then
        echo "WARNING: Creating work branch '$BRANCH' from $CURRENT_BRANCH. Should branch from a vX.Y.Z version branch instead." >&2
      fi
    fi

    # Warn if creating hotfix from non-main
    if echo "$BRANCH" | grep -qE "^hotfix/"; then
      if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
        echo "WARNING: Creating hotfix branch '$BRANCH' from $CURRENT_BRANCH. Hotfixes should branch from main at a tag." >&2
      fi
    fi
  fi
fi

exit 0
