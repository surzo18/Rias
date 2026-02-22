#!/usr/bin/env bash
# PreToolUse hook for Bash: Validate git operations
set -euo pipefail

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log((j.tool_input&&j.tool_input.command)||'')}catch{console.log('')}})" 2>/dev/null || echo "")

# Extract git command segments robustly (supports prefixes like VAR=1 git ... and command chains)
GIT_COMMANDS=$(node -e "
  const raw = process.argv[1] || '';
  const segs = raw.split(/(?:\\|\\||&&|;|\\n|\\(|\\))/g);
  const out = [];
  for (const seg of segs) {
    let s = seg.trim();
    if (!s) continue;
    // Strip leading env assignments (e.g. FOO=bar BAR=baz git ...)
    while (true) {
      const next = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=(\"[^\"]*\"|'[^']*'|[^\\s]+)\\s+/, '');
      if (next === s) break;
      s = next.trimStart();
    }
    if (/^git\\s+/.test(s)) out.push(s);
  }
  process.stdout.write(out.join('\\n'));
" "$COMMAND" 2>/dev/null || echo "")

if [ -z "$GIT_COMMANDS" ]; then
  exit 0
fi

# Block force push (--force and -f short form, but allow --force-with-lease)
if echo "$GIT_COMMANDS" | grep -qE "^git[[:space:]]+push\\b.*(--force([[:space:]]|$)| -f([[:space:]]|$))"; then
  echo "BLOCKED: Force push is not allowed. Use --force-with-lease if absolutely necessary." >&2
  exit 2
fi

# Block direct push to main
if echo "$GIT_COMMANDS" | grep -qE "^git[[:space:]]+push\\b.*\\b(origin|upstream)\\s+main\\b"; then
  echo "BLOCKED: Direct push to main is not allowed. Merge version branches with --no-ff." >&2
  exit 2
fi

# Block destructive resets
if echo "$GIT_COMMANDS" | grep -qE "^git[[:space:]]+reset\\b.*--hard\\b"; then
  echo "BLOCKED: git reset --hard is not allowed. Use git stash or git reset --soft instead." >&2
  exit 2
fi

if echo "$GIT_COMMANDS" | grep -qE "^git[[:space:]]+commit\\b"; then
  # Block commit of files with secret-like names
  DANGEROUS_FILES=$(git diff --cached --name-only 2>/dev/null | grep -iE '\.env($|\.)|\.key$|\.pem$|\.p12$|\.pfx$|\.htpasswd$|credentials|secret|\.secret|api.?key|token\.json|\.keystore$|oauth.*\.json|jwt.*\.json|passwd' | grep -ivE '\.env\.(example|sample|template|dist)$' || true)
  if [ -n "$DANGEROUS_FILES" ]; then
    echo "BLOCKED: Staged files may contain secrets (filename check):" >&2
    echo "$DANGEROUS_FILES" | while read -r f; do echo "  - $f" >&2; done
    echo "Remove them with: git reset HEAD <file>" >&2
    exit 2
  fi

  # Block staged runtime learnings/handovers to reduce accidental sensitive leaks
  RUNTIME_FILES=$(git diff --cached --name-only 2>/dev/null | grep -E '^\.claude/local/|^\.claude/(handovers/.*\.md|learnings/(hook-log|token-usage)\.md)$' || true)
  if [ -n "$RUNTIME_FILES" ]; then
    echo "BLOCKED: Staged runtime memory files detected (.claude/handovers, hook-log, token-usage)." >&2
    echo "$RUNTIME_FILES" | while read -r f; do echo "  - $f" >&2; done
    echo "Keep runtime files local or redact and move relevant info to curated docs." >&2
    exit 2
  fi

  # Block staged sensitive entries in learnings files
  LEARNING_FILES=$(git diff --cached --name-only 2>/dev/null | grep -E '^\.claude/learnings/(mistakes|patterns|decisions)\.md$' || true)
  if [ -n "$LEARNING_FILES" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      ADDED_LINES=$(git diff --cached -- "$f" 2>/dev/null | grep '^+' | grep -v '^\+\+\+' || true)
      if echo "$ADDED_LINES" | grep -qE '^\+### [0-9]{4}-[0-9]{2}-[0-9]{2}|User correction detected|TOKEN_WARNING|Input: |Output: |Total: '; then
        echo "BLOCKED: Staged learning entry in $f looks runtime-generated and may contain sensitive context." >&2
        echo "Redact before commit or keep it untracked." >&2
        exit 2
      fi
    done <<< "$LEARNING_FILES"
  fi

  # Content-based secret scan on staged text content
  SECRET_PATTERN='AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{35}|(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_\/+=.-]{16,}'
  STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    # Skip test files — sanitizer tests legitimately contain secret-like patterns
    echo "$f" | grep -qE '(__tests__|\.test\.(ts|js|mjs)|\.spec\.(ts|js|mjs)|/tests/)' && continue
    if git show ":$f" 2>/dev/null | grep -I -qE "$SECRET_PATTERN"; then
      echo "BLOCKED: Potential secret detected in staged file content: $f" >&2
      echo "Inspect staged content with: git show :$f" >&2
      exit 2
    fi
  done <<< "$STAGED_FILES"

  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "WARNING: Committing directly on $CURRENT_BRANCH. Work should happen on version or feature branches." >&2
  fi
  if echo "$CURRENT_BRANCH" | grep -qE "^v[0-9]+\.[0-9]+\.[0-9]+$"; then
    LATEST_TAG=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1 || echo "")
    if [ -n "$LATEST_TAG" ] && [ "$LATEST_TAG" != "$CURRENT_BRANCH" ]; then
      echo "WARNING: Current version branch is $CURRENT_BRANCH but latest release tag is $LATEST_TAG." >&2
      echo "Ensure tag $CURRENT_BRANCH is created when releasing this branch to main." >&2
    fi
  fi

  COMMIT_MSG=$(echo "$COMMAND" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const m1 = d.match(/-m\\s+\"([^\"]*)\"/);
      if (m1) { console.log(m1[1]); return; }
      const m2 = d.match(/-m\\s+'([^']*)'/);
      if (m2) { console.log(m2[1]); return; }
      const h = d.match(/<<'?EOF'?[\\s\\S]*?\\n([\\s\\S]*?)\\nEOF/);
      if (h) { console.log(h[1].trim()); return; }
      console.log('');
    });
  " 2>/dev/null || echo "")

  if [ -n "$COMMIT_MSG" ]; then
    FIRST_LINE=$(echo "$COMMIT_MSG" | head -1)
    if ! echo "$FIRST_LINE" | grep -qE "^(feat|fix|refactor|test|docs|style|chore|perf|ci|build|revert|release)(\(.+\))?: .+"; then
      echo "WARNING: Commit message doesn't follow conventional format: <type>(<scope>): <description>" >&2
    fi

    if ! echo "$COMMIT_MSG" | grep -q "Co-Authored-By:"; then
      echo "WARNING: Missing Co-Authored-By trailer in commit message." >&2
    fi
  fi
fi

# Warn on adding files with secret-like names directly
if echo "$GIT_COMMANDS" | grep -qE "^git[[:space:]]+add\\b"; then
  ADDED_FILES=$(echo "$COMMAND" | sed 's/^git add //' | tr ' ' '\n' | grep -v '^-' || true)
  DANGEROUS_ADDS=$(echo "$ADDED_FILES" | grep -iE '\.env($|\.)|\.key$|\.pem$|\.p12$|\.pfx$|\.htpasswd$|credentials|secret|\.secret|api.?key|token\.json|\.keystore$|oauth.*\.json|jwt.*\.json|passwd' | grep -ivE '\.env\.(example|sample|template|dist)$' || true)
  if [ -n "$DANGEROUS_ADDS" ]; then
    echo "WARNING: Adding files that may contain secrets (filename check):" >&2
    echo "$DANGEROUS_ADDS" | while read -r f; do echo "  - $f" >&2; done
  fi
fi

if echo "$GIT_COMMANDS" | grep -qE "^git[[:space:]]+tag\\b"; then
  TAG_NAME=$(echo "$COMMAND" | sed -n 's/^git tag \+\([^ ]*\).*/\1/p')
  if [ -n "$TAG_NAME" ] && ! echo "$TAG_NAME" | grep -qE "^v[0-9]+\.[0-9]+\.[0-9]+$"; then
    echo "WARNING: Tag '$TAG_NAME' doesn't match semantic version format (vX.Y.Z)." >&2
  fi
fi

if echo "$GIT_COMMANDS" | grep -qE "^git[[:space:]]+merge\\b"; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  MERGE_TARGET=$(echo "$COMMAND" | sed -n 's/^git merge.*[[:space:]]\+\([^ -][^ ]*\)\s*$/\1/p')

  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    if ! echo "$COMMAND" | grep -q "\-\-no-ff"; then
      echo "WARNING: Merging to $CURRENT_BRANCH should use --no-ff to preserve version history." >&2
    fi
  fi

  if echo "$CURRENT_BRANCH" | grep -qE "^v[0-9]+\.[0-9]+\.[0-9]+$"; then
    if echo "$MERGE_TARGET" | grep -qE "^(feature|bugfix|refactor|test|docs)/"; then
      if ! echo "$COMMAND" | grep -q "\-\-squash"; then
        echo "WARNING: Merging work branch to $CURRENT_BRANCH should use --squash." >&2
      fi
    fi
  fi
fi

if echo "$GIT_COMMANDS" | grep -qE "^git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)\\b"; then
  BRANCH=$(echo "$COMMAND" | sed -n 's/.*\(checkout -b\|switch -c\) \+\([^ ]*\).*/\2/p')
  if [ -n "$BRANCH" ]; then
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

    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
      if echo "$BRANCH" | grep -qE "^(feature|bugfix|refactor|test|docs)/"; then
        echo "WARNING: Creating work branch '$BRANCH' from $CURRENT_BRANCH. Should branch from a vX.Y.Z version branch instead." >&2
      fi
    fi

    if echo "$BRANCH" | grep -qE "^hotfix/"; then
      if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
        echo "WARNING: Creating hotfix branch '$BRANCH' from $CURRENT_BRANCH. Hotfixes should branch from main at a tag." >&2
      fi
    fi
  fi
fi

exit 0
