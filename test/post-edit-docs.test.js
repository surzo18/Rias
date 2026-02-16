import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBashHook } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '..', '.claude', 'hooks', 'post-edit-docs.sh');

const run = (filePath) => runBashHook(HOOK, { tool_input: { file_path: filePath } });

describe('post-edit-docs.sh', () => {

  it('should remind about docs when package.json changes', () => {
    assert.match(run('/d/REPOS/tools/Rias/package.json').stdout, /DOC_REMINDER.*package\.json/);
  });

  it('should remind about docs when SKILL.md changes', () => {
    assert.match(run('/d/REPOS/tools/Rias/.claude/skills/git-management/SKILL.md').stdout, /DOC_REMINDER.*[Ss]kill/);
  });

  it('should remind about docs when settings.json changes', () => {
    assert.match(run('/d/REPOS/tools/Rias/.claude/settings.json').stdout, /DOC_REMINDER.*settings/);
  });

  it('should remind about docs when a rule changes', () => {
    assert.match(run('/d/REPOS/tools/Rias/.claude/rules/tdd.md').stdout, /DOC_REMINDER.*[Rr]ule/);
  });

  it('should remind about docs when a hook changes', () => {
    assert.match(run('/d/REPOS/tools/Rias/.claude/hooks/validate-git-ops.sh').stdout, /DOC_REMINDER.*[Hh]ook/);
  });

  it('should not remind for unrelated files', () => {
    assert.equal(run('/d/REPOS/tools/Rias/test/setup.test.js').stdout.trim(), '');
  });

  it('should handle empty file path gracefully', () => {
    const r = runBashHook(HOOK, { tool_input: {} });
    assert.equal(r.exitCode, 0);
  });

  it('should parse tool_input.file_path (not top-level)', () => {
    // Wrong format — file_path at top level, no tool_input wrapper
    const r = runBashHook(HOOK, { file_path: '/d/REPOS/tools/Rias/package.json' });
    assert.equal(r.stdout.trim(), '');
  });
});
