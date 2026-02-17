import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SETUP_SCRIPT = join(import.meta.dirname, '..', 'scripts', 'setup.js');

function createTempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'rias-setup-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'rias',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { test: 'node --test' }
  }, null, 2));
  writeFileSync(join(dir, 'README.md'), '# Rias\n\nStarter template pre Claude Code infrastrukturu.\n');
  mkdirSync(join(dir, '.claude', 'learnings'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'audits'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'agent-memory'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'learnings', 'mistakes.md'), '# Mistakes\n\nSome old content\n');
  writeFileSync(join(dir, '.claude', 'learnings', 'patterns.md'), '# Patterns\n\nSome old content\n');
  writeFileSync(join(dir, '.claude', 'learnings', 'decisions.md'), '# Decisions\n\nSome old content\n');
  writeFileSync(join(dir, '.claude', 'learnings', 'token-usage.md'), '# Token Usage\n\nSome old content\n');
  writeFileSync(join(dir, '.claude', 'audits', 'latest.json'), JSON.stringify({ id: 'old', actions: [{ id: 'A1' }] }));
  writeFileSync(join(dir, '.claude', 'agent-memory', 'session-counter.json'), JSON.stringify({ sessionCount: 42, lastAuditAt: 10, auditInterval: 100 }));
  return dir;
}

function runSetup(cwd, projectName) {
  return spawnSync(process.execPath, [SETUP_SCRIPT], {
    cwd,
    input: projectName + '\n',
    encoding: 'utf8',
    timeout: 10000,
  });
}

describe('setup script', () => {
  let tempDir;

  before(() => {
    tempDir = createTempProject();
    runSetup(tempDir, 'my-awesome-project');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should update package.json name', () => {
    const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-awesome-project');
  });

  it('should replace Rias in README title', () => {
    const readme = readFileSync(join(tempDir, 'README.md'), 'utf8');
    assert.ok(readme.startsWith('# my-awesome-project'));
    assert.ok(!readme.includes('# Rias'));
  });

  it('should reset learnings templates', () => {
    const mistakes = readFileSync(join(tempDir, '.claude', 'learnings', 'mistakes.md'), 'utf8');
    assert.ok(!mistakes.includes('Some old content'));
    assert.ok(mistakes.startsWith('#'));
  });

  it('should reset all four learnings files', () => {
    for (const file of ['mistakes.md', 'patterns.md', 'decisions.md', 'token-usage.md']) {
      const content = readFileSync(join(tempDir, '.claude', 'learnings', file), 'utf8');
      assert.ok(!content.includes('Some old content'), `${file} should be reset`);
    }
  });

  it('should reset session counter to zero', () => {
    const counter = JSON.parse(readFileSync(join(tempDir, '.claude', 'agent-memory', 'session-counter.json'), 'utf8'));
    assert.equal(counter.sessionCount, 0);
    assert.equal(counter.lastAuditAt, 0);
  });

  it('should reset audit state with empty actions', () => {
    const audit = JSON.parse(readFileSync(join(tempDir, '.claude', 'audits', 'latest.json'), 'utf8'));
    assert.deepEqual(audit.actions, []);
    assert.ok(audit.id.includes('my-awesome-project'));
  });

  it('should initialize fresh git repo', () => {
    assert.ok(existsSync(join(tempDir, '.git')));
  });

  it('should print success message with npm test hint', () => {
    const dir2 = createTempProject();
    const result = runSetup(dir2, 'test-proj');
    assert.ok(result.stdout.includes('npm test'));
    rmSync(dir2, { recursive: true, force: true });
  });

  it('should normalize project name (lowercase, hyphens)', () => {
    const dir2 = createTempProject();
    runSetup(dir2, 'My Cool Project');
    const pkg = JSON.parse(readFileSync(join(dir2, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-cool-project');
    rmSync(dir2, { recursive: true, force: true });
  });

  it('should fail gracefully with empty name', () => {
    const dir2 = createTempProject();
    const result = runSetup(dir2, '');
    assert.notEqual(result.status, 0);
    rmSync(dir2, { recursive: true, force: true });
  });
});
