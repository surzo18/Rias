# TDD Rules (Node.js) - Overrides Root PHP Rules

## Cycle

1. **RED** - Write a failing test first
2. **GREEN** - Write the minimum code to make it pass
3. **REFACTOR** - Clean up, tests must stay green

## Test Runner

- Use Node.js built-in `node:test` module (zero dependencies)
- Import: `import { describe, it } from 'node:test';`
- Assertions: `import assert from 'node:assert/strict';`

## Test Conventions

- File naming: `*.test.js` or `*.test.mjs`
- Test location: `test/` directory (mirrors `src/` when source exists)
- Method naming: `it('should describe expected behavior', ...)`
- Follow Arrange-Act-Assert pattern
- Each test must be independent - no shared mutable state between tests

## Running Tests

```bash
npm test              # All tests (node --test)
npm run test:watch    # Watch mode (node --test --watch)
```

Run `npm test` before every commit.

## What to Test

- Hook scripts: verify output format, edge cases (empty input, malformed JSON)
- Project skills: validate YAML frontmatter, required fields
- Utility functions: pure logic, transformations, parsers
- Integration: script exit codes, file I/O behavior

