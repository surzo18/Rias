#!/usr/bin/env bash
# PreToolUse/Write hook: Enforce TDD - block src/**/*.js without corresponding test
set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | node -e "
  let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(d);
      console.log((j.tool_input && j.tool_input.file_path) || '');
    } catch {
      console.log('');
    }
  });
" 2>/dev/null || echo "")

# Only enforce on src/**/*.js
if ! echo "$FILE_PATH" | grep -qE '^src/.*\.js$'; then
  exit 0
fi

# Exempt src/skills/**
if echo "$FILE_PATH" | grep -qE '^src/skills/'; then
  exit 0
fi

# Exempt src/esdeath/** — uses vitest, not node:test in test/
if echo "$FILE_PATH" | grep -qE '^src/esdeath/'; then
  exit 0
fi

# Derive expected test path: src/foo/bar.js -> test/foo/bar.test.js
TEST_PATH=$(echo "$FILE_PATH" | sed 's|^src/|test/|' | sed 's|\.js$|.test.js|')

if [ ! -f "$TEST_PATH" ]; then
  echo "TDD violation: create $TEST_PATH first before writing $FILE_PATH" >&2
  echo "Write the failing test, then implement the source." >&2
  exit 1
fi

exit 0
