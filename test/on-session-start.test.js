import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runBashHook } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '..', '.claude', 'hooks', 'on-session-start.sh');

describe('on-session-start.sh', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'rias-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const run = () => runBashHook(HOOK, {}, { CLAUDE_PROJECT_DIR: tempDir });

  it('should exit cleanly with no handovers or learnings', () => {
    const r = run();
    assert.equal(r.exitCode, 0);
  });

  it('should load latest handover file', () => {
    const handoversDir = resolve(tempDir, '.claude', 'handovers');
    mkdirSync(handoversDir, { recursive: true });
    writeFileSync(resolve(handoversDir, 'handover-20260216-120000.md'), '# Test Handover\nWorking on feature X');

    const r = run();
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Test Handover/);
  });

  it('should count learnings entries', () => {
    const learningsDir = resolve(tempDir, '.claude', 'learnings');
    mkdirSync(learningsDir, { recursive: true });
    writeFileSync(resolve(learningsDir, 'mistakes.md'), '# Mistakes\n\n### 2026-02-16: Bash error\n\n### 2026-02-16: Another error\n');

    const r = run();
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /mistakes.*2/i);
  });

  it('should always output session counter', () => {
    mkdirSync(resolve(tempDir, '.claude', 'handovers'), { recursive: true });
    mkdirSync(resolve(tempDir, '.claude', 'learnings'), { recursive: true });

    const r = run();
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Session #\d+/);
  });

  it('should handle missing handovers directory', () => {
    const r = run();
    assert.equal(r.exitCode, 0);
  });

  it('should increment session counter', () => {
    const r1 = run();
    assert.match(r1.stdout, /Session #1/);

    const r2 = run();
    assert.match(r2.stdout, /Session #2/);
  });

  it('should create hook-log.md on first run', () => {
    run();

    const hookLog = resolve(tempDir, '.claude', 'learnings', 'hook-log.md');
    const content = readFileSync(hookLog, 'utf8');
    assert.match(content, /# Hook Execution Log/);
    assert.match(content, /session-start/);
  });
});
