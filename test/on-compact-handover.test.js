import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runBashHook, HOOK_SUBPROCESS_AVAILABLE } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '..', '.claude', 'hooks', 'on-compact-handover.sh');

const describeHook = HOOK_SUBPROCESS_AVAILABLE ? describe : describe.skip;

describeHook('on-compact-handover.sh', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'rias-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const run = (data = {}) => runBashHook(HOOK, data, { CLAUDE_PROJECT_DIR: tempDir });

  it('should create handover file in handovers directory', () => {
    run({ session_id: 'test-123', trigger: 'context_limit' });

    const handoversDir = resolve(tempDir, '.claude', 'local', 'handovers');
    const files = readdirSync(handoversDir).filter(f => f.startsWith('handover-'));
    assert.equal(files.length, 1);
  });

  it('should include session ID and trigger', () => {
    run({ session_id: 'sess-abc', trigger: 'manual' });

    const handoversDir = resolve(tempDir, '.claude', 'local', 'handovers');
    const files = readdirSync(handoversDir);
    const content = readFileSync(resolve(handoversDir, files[0]), 'utf8');
    assert.match(content, /sess-abc/);
    assert.match(content, /manual/);
  });

  it('should include git branch info', () => {
    run({ session_id: 'test', trigger: 'test' });

    const handoversDir = resolve(tempDir, '.claude', 'local', 'handovers');
    const files = readdirSync(handoversDir);
    const content = readFileSync(resolve(handoversDir, files[0]), 'utf8');
    assert.match(content, /\*\*Branch:\*\*/);
  });

  it('should include recent commits section', () => {
    run({ session_id: 'test', trigger: 'test' });

    const handoversDir = resolve(tempDir, '.claude', 'local', 'handovers');
    const files = readdirSync(handoversDir);
    const content = readFileSync(resolve(handoversDir, files[0]), 'utf8');
    assert.match(content, /Recent commits/);
  });

  it('should handle empty JSON gracefully', () => {
    const r = run({});
    assert.equal(r.exitCode, 0);
  });

  it('should output status to stderr', () => {
    const r = run({ session_id: 'test', trigger: 'test' });
    assert.match(r.stderr, /Handover saved/);
  });
});

