import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runBashHook } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '..', '.claude', 'hooks', 'on-failure-learn.sh');

describe('on-failure-learn.sh', () => {
  let tempDir, learningsDir, mistakesFile;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'rias-test-'));
    learningsDir = resolve(tempDir, '.claude', 'learnings');
    mistakesFile = resolve(learningsDir, 'mistakes.md');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const run = (toolName, error) =>
    runBashHook(HOOK, { tool_name: toolName, error }, { CLAUDE_PROJECT_DIR: tempDir });

  it('should create learnings directory if missing', () => {
    run('Bash', 'command not found');
    assert.match(readFileSync(mistakesFile, 'utf8'), /Bash error/);
  });

  it('should record tool name and error', () => {
    mkdirSync(learningsDir, { recursive: true });
    writeFileSync(mistakesFile, '# Mistakes\n');

    run('Bash', 'npm: command not found');

    const content = readFileSync(mistakesFile, 'utf8');
    assert.match(content, /### \d{4}-\d{2}-\d{2}: Bash error/);
    assert.match(content, /npm: command not found/);
  });

  it('should append multiple entries', () => {
    mkdirSync(learningsDir, { recursive: true });
    writeFileSync(mistakesFile, '# Mistakes\n');

    run('Bash', 'error 1');
    run('Bash', 'error 2');

    const entries = readFileSync(mistakesFile, 'utf8').match(/^### /gm);
    assert.equal(entries.length, 2);
  });

  it('should handle unknown tool gracefully', () => {
    const r = runBashHook(HOOK, {}, { CLAUDE_PROJECT_DIR: tempDir });
    assert.equal(r.exitCode, 0);
    assert.match(readFileSync(mistakesFile, 'utf8'), /unknown error/);
  });
});
