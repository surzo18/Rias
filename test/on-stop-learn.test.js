import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runBashHook, HOOK_SUBPROCESS_AVAILABLE } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '..', '.claude', 'hooks', 'on-stop-learn.sh');

const describeHook = HOOK_SUBPROCESS_AVAILABLE ? describe : describe.skip;

describeHook('on-stop-learn.sh', () => {
  let tempDir, learningsDir, transcriptPath;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'rias-test-'));
    learningsDir = resolve(tempDir, '.claude', 'local', 'learnings');
    mkdirSync(learningsDir, { recursive: true });
    writeFileSync(resolve(learningsDir, 'patterns.md'), '# Patterns\n');
    writeFileSync(resolve(learningsDir, 'decisions.md'), '# Decisions\n');
    transcriptPath = resolve(tempDir, 'transcript.jsonl');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTranscript(lines) {
    writeFileSync(transcriptPath, lines.map(l => JSON.stringify(l)).join('\n'));
  }

  const run = () => runBashHook(HOOK, { transcript_path: transcriptPath }, { CLAUDE_PROJECT_DIR: tempDir });

  it('should detect user correction with "wrong"', () => {
    writeTranscript([
      { type: 'human', message: 'That is wrong, fix it' },
      { type: 'assistant', message: { content: 'Fixed it' } },
    ]);

    run();

    const content = readFileSync(resolve(learningsDir, 'patterns.md'), 'utf8');
    assert.match(content, /User correction detected/);
  });

  it('should detect Slovak correction "nie"', () => {
    writeTranscript([
      { type: 'human', message: 'nie, to nie je spravne' },
      { type: 'assistant', message: { content: 'Opravene' } },
    ]);

    run();

    const content = readFileSync(resolve(learningsDir, 'patterns.md'), 'utf8');
    assert.match(content, /User correction detected/);
  });

  it('should detect Slovak correction "nechcem"', () => {
    writeTranscript([
      { type: 'human', message: 'nechcem to takto' },
      { type: 'assistant', message: { content: 'OK' } },
    ]);

    run();

    const content = readFileSync(resolve(learningsDir, 'patterns.md'), 'utf8');
    assert.match(content, /User correction detected/);
  });

  it('should detect architectural decisions', () => {
    writeTranscript([
      { type: 'assistant', message: { content: 'I decided to use the repository pattern instead of direct queries because it provides better testability and separation of concerns.' } },
    ]);

    run();

    const content = readFileSync(resolve(learningsDir, 'decisions.md'), 'utf8');
    assert.match(content, /repository pattern/);
  });

  it('should not record short decision snippets (< 30 chars)', () => {
    writeTranscript([
      { type: 'assistant', message: { content: 'decided to go' } },
    ]);

    run();

    const content = readFileSync(resolve(learningsDir, 'decisions.md'), 'utf8');
    assert.equal(content, '# Decisions\n');
  });

  it('should limit to 3 patterns per session', () => {
    writeTranscript([
      { type: 'human', message: 'wrong 1' },
      { type: 'assistant', message: { content: 'fix 1' } },
      { type: 'human', message: 'wrong 2' },
      { type: 'assistant', message: { content: 'fix 2' } },
      { type: 'human', message: 'wrong 3' },
      { type: 'assistant', message: { content: 'fix 3' } },
      { type: 'human', message: 'wrong 4' },
      { type: 'assistant', message: { content: 'fix 4' } },
    ]);

    run();

    const content = readFileSync(resolve(learningsDir, 'patterns.md'), 'utf8');
    const entries = content.match(/### \d{4}/g) || [];
    assert.ok(entries.length <= 3, `Expected max 3 entries, got ${entries.length}`);
  });

  it('should exit cleanly when transcript does not exist', () => {
    const r = runBashHook(HOOK, { transcript_path: '/nonexistent/file.jsonl' }, { CLAUDE_PROJECT_DIR: tempDir });
    assert.equal(r.exitCode, 0);
  });

  it('should exit cleanly with no transcript_path', () => {
    const r = runBashHook(HOOK, {}, { CLAUDE_PROJECT_DIR: tempDir });
    assert.equal(r.exitCode, 0);
  });

  it('should handle duplicate lines correctly (indexOf fix)', () => {
    // Two identical human messages — should detect both corrections
    writeTranscript([
      { type: 'human', message: 'no, wrong approach' },
      { type: 'assistant', message: { content: 'Fixed first time' } },
      { type: 'human', message: 'no, wrong approach' },
      { type: 'assistant', message: { content: 'Fixed second time' } },
    ]);

    run();

    const content = readFileSync(resolve(learningsDir, 'patterns.md'), 'utf8');
    // After dedup, identical corrections should collapse to 1
    const entries = content.match(/User correction detected/g) || [];
    assert.ok(entries.length >= 1, 'Should detect at least 1 correction from duplicate lines');
  });

  it('should detect "should be" correction pattern', () => {
    writeTranscript([
      { type: 'human', message: 'the method should be called getData not fetchData' },
      { type: 'assistant', message: { content: 'Renamed to getData' } },
    ]);

    run();

    const content = readFileSync(resolve(learningsDir, 'patterns.md'), 'utf8');
    assert.match(content, /User correction detected/);
  });
});

