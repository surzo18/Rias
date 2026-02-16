import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runBashHook } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '..', '.claude', 'hooks', 'on-stop-token-log.sh');

describe('on-stop-token-log.sh', () => {
  let tempDir, transcriptPath, learningsDir;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'rias-test-'));
    learningsDir = resolve(tempDir, '.claude', 'learnings');
    mkdirSync(learningsDir, { recursive: true });
    transcriptPath = resolve(tempDir, 'transcript.jsonl');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTranscript(lines) {
    writeFileSync(transcriptPath, lines.map(l => JSON.stringify(l)).join('\n'));
  }

  const run = () => runBashHook(HOOK, { transcript_path: transcriptPath }, { CLAUDE_PROJECT_DIR: tempDir });

  it('should log token usage from transcript', () => {
    writeTranscript([
      { type: 'assistant', message: { usage: { input_tokens: 1000, output_tokens: 500 } } },
      { type: 'assistant', message: { usage: { input_tokens: 2000, output_tokens: 300 } } },
    ]);

    const r = run();
    assert.equal(r.exitCode, 0);

    const content = readFileSync(resolve(learningsDir, 'token-usage.md'), 'utf8');
    assert.match(content, /# Token Usage Log/);
    assert.match(content, /Input: 3,000/);
    assert.match(content, /Output: 800/);
    assert.match(content, /Total: 3,800/);
    assert.match(content, /Turns: 2/);
  });

  it('should skip when no usage data in transcript', () => {
    writeTranscript([{ type: 'human', message: { content: 'hello' } }]);
    assert.equal(run().exitCode, 0);
  });

  it('should exit cleanly when transcript does not exist', () => {
    const r = runBashHook(HOOK, { transcript_path: '/nonexistent/file.jsonl' }, { CLAUDE_PROJECT_DIR: tempDir });
    assert.equal(r.exitCode, 0);
  });

  it('should warn when session exceeds 100k tokens', () => {
    writeTranscript([
      { type: 'assistant', message: { usage: { input_tokens: 80000, output_tokens: 30000 } } },
    ]);

    const r = run();
    assert.equal(r.exitCode, 0);
    assert.match(r.stderr, /TOKEN_WARNING/);
  });

  it('should not warn when session is under 100k tokens', () => {
    writeTranscript([
      { type: 'assistant', message: { usage: { input_tokens: 5000, output_tokens: 2000 } } },
    ]);

    const r = run();
    assert.equal(r.exitCode, 0);
    assert.ok(!r.stderr.includes('TOKEN_WARNING'));
  });

  it('should create log file with header if missing', () => {
    rmSync(learningsDir, { recursive: true, force: true });
    writeTranscript([
      { type: 'assistant', message: { usage: { input_tokens: 100, output_tokens: 50 } } },
    ]);

    assert.equal(run().exitCode, 0);
    const content = readFileSync(resolve(learningsDir, 'token-usage.md'), 'utf8');
    assert.match(content, /^# Token Usage Log/);
  });
});
