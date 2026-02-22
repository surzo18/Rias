import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runBashHook } from '../helpers.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HOOK = resolve('.claude/hooks/enforce-tdd.sh');

function makeInput(filePath) {
  return JSON.stringify({ tool_input: { file_path: filePath } });
}

describe('enforce-tdd.sh', () => {
  it('should allow writes to non-src paths', () => {
    const r = runBashHook(HOOK, makeInput('README.md'));
    assert.equal(r.exitCode, 0);
  });

  it('should allow writes to test/ paths', () => {
    const r = runBashHook(HOOK, makeInput('test/foo/bar.test.js'));
    assert.equal(r.exitCode, 0);
  });

  it('should allow writes to .claude/ paths', () => {
    const r = runBashHook(HOOK, makeInput('.claude/hooks/some-hook.sh'));
    assert.equal(r.exitCode, 0);
  });

  it('should exempt src/*.json files', () => {
    const r = runBashHook(HOOK, makeInput('src/data/config.json'));
    assert.equal(r.exitCode, 0);
  });

  it('should exempt src/*.md files', () => {
    const r = runBashHook(HOOK, makeInput('src/docs/readme.md'));
    assert.equal(r.exitCode, 0);
  });

  it('should exempt src/skills/** files', () => {
    const r = runBashHook(HOOK, makeInput('src/skills/telegram-dev.md'));
    assert.equal(r.exitCode, 0);
  });

  it('should exempt src/esdeath/** files', () => {
    const r = runBashHook(HOOK, makeInput('src/esdeath/scripts/tts-adapter/server.js'));
    assert.equal(r.exitCode, 0);
  });

  it('should block src/*.js without a corresponding test file', () => {
    const r = runBashHook(HOOK, makeInput('src/telegram/bot.js'));
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /TDD violation/);
    assert.match(r.stderr, /test\/telegram\/bot\.test\.js/);
  });

  it('should block nested src/**/*.js without test', () => {
    const r = runBashHook(HOOK, makeInput('src/deep/nested/module.js'));
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /test\/deep\/nested\/module\.test\.js/);
  });

  it('should allow src/*.js when corresponding test file exists', () => {
    const testDir = resolve('test/__tdd_tmp__');
    const testFile = resolve('test/__tdd_tmp__/widget.test.js');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, '// placeholder test');
    try {
      const r = runBashHook(HOOK, makeInput('src/__tdd_tmp__/widget.js'));
      assert.equal(r.exitCode, 0);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should handle empty input gracefully', () => {
    const r = runBashHook(HOOK, '{}');
    assert.equal(r.exitCode, 0);
  });

  it('should handle malformed JSON gracefully', () => {
    const r = runBashHook(HOOK, 'not-json');
    assert.equal(r.exitCode, 0);
  });
});
