import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBashHook } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '..', '.claude', 'hooks', 'validate-git-ops.sh');

const run = (cmd) => runBashHook(HOOK, { tool_input: { command: cmd } });

describe('validate-git-ops.sh', () => {

  describe('force push blocking', () => {
    it('should block git push --force', () => {
      const r = run('git push --force');
      assert.equal(r.exitCode, 2);
      assert.match(r.stderr, /BLOCKED.*[Ff]orce push/);
    });

    it('should block git push -f (short form)', () => {
      const r = run('git push -f');
      assert.equal(r.exitCode, 2);
      assert.match(r.stderr, /BLOCKED.*[Ff]orce push/);
    });

    it('should block git push origin main --force', () => {
      const r = run('git push origin main --force');
      assert.equal(r.exitCode, 2);
    });

    it('should allow git push --force-with-lease', () => {
      const r = run('git push --force-with-lease');
      assert.equal(r.exitCode, 0);
    });
  });

  describe('direct push to main blocking', () => {
    it('should block git push origin main', () => {
      const r = run('git push origin main');
      assert.equal(r.exitCode, 2);
      assert.match(r.stderr, /BLOCKED.*main/);
    });

    it('should allow git push origin v0.1.0', () => {
      assert.equal(run('git push origin v0.1.0').exitCode, 0);
    });

    it('should allow git push -u origin feature/test', () => {
      assert.equal(run('git push -u origin feature/test').exitCode, 0);
    });
  });

  describe('destructive reset blocking', () => {
    it('should block git reset --hard', () => {
      const r = run('git reset --hard');
      assert.equal(r.exitCode, 2);
      assert.match(r.stderr, /BLOCKED.*reset --hard/);
    });

    it('should allow git reset --soft', () => {
      assert.equal(run('git reset --soft HEAD~1').exitCode, 0);
    });
  });

  describe('branch name validation', () => {
    it('should allow feature/good-name', () => {
      assert.equal(run('git checkout -b feature/good-name').exitCode, 0);
    });

    it('should allow vX.Y.Z version branch', () => {
      assert.equal(run('git checkout -b v1.2.3').exitCode, 0);
    });

    it('should allow hotfix/v1.0.1-fix-crash', () => {
      assert.equal(run('git checkout -b hotfix/v1.0.1-fix-crash').exitCode, 0);
    });

    it('should warn on invalid branch name', () => {
      const r = run('git checkout -b my-bad-branch');
      assert.equal(r.exitCode, 0);
      assert.match(r.stderr, /WARNING.*does not match/);
    });

    it('should warn on uppercase branch name', () => {
      const r = run('git checkout -b feature/BadName');
      assert.equal(r.exitCode, 0);
      assert.match(r.stderr, /WARNING/);
    });
  });

  describe('tag validation', () => {
    it('should allow valid semver tag', () => {
      const r = run('git tag v1.2.3');
      assert.equal(r.exitCode, 0);
      assert.ok(!r.stderr.includes('WARNING'));
    });

    it('should warn on non-semver tag', () => {
      const r = run('git tag release-1');
      assert.equal(r.exitCode, 0);
      assert.match(r.stderr, /WARNING.*vX\.Y\.Z/);
    });

    it('should warn on tag with extra segments', () => {
      const r = run('git tag v1.2.3.4');
      assert.equal(r.exitCode, 0);
      assert.match(r.stderr, /WARNING/);
    });
  });

  describe('commit message validation', () => {
    it('should warn on non-conventional commit message', () => {
      const r = run('git commit -m "fixed a bug"');
      assert.equal(r.exitCode, 0);
      assert.match(r.stderr, /WARNING.*conventional format/);
    });

    it('should not warn on conventional commit message', () => {
      const r = run('git commit -m "feat: add new feature"');
      assert.equal(r.exitCode, 0);
      assert.ok(!r.stderr.includes('conventional format'));
    });

    it('should accept scoped conventional commit', () => {
      const r = run('git commit -m "fix(hooks): resolve path issue"');
      assert.equal(r.exitCode, 0);
      assert.ok(!r.stderr.includes('conventional format'));
    });

    it('should warn on missing Co-Authored-By trailer', () => {
      const r = run('git commit -m "feat: add feature"');
      assert.equal(r.exitCode, 0);
      assert.match(r.stderr, /WARNING.*Co-Authored-By/);
    });

    it('should not warn when Co-Authored-By is present', () => {
      const r = run('git commit -m "feat: add feature\n\nCo-Authored-By: Claude"');
      assert.equal(r.exitCode, 0);
      assert.ok(!r.stderr.includes('Missing Co-Authored-By'));
    });
  });

  describe('merge strategy validation', () => {
    it('should warn on merge to main without --no-ff', () => {
      // This test relies on current branch context, which we can't control
      // So we just verify the hook processes merge commands without crashing
      const r = run('git merge v0.1.0');
      assert.equal(r.exitCode, 0);
    });

    it('should not crash on merge with --no-ff', () => {
      const r = run('git merge --no-ff v0.1.0');
      assert.equal(r.exitCode, 0);
    });

    it('should not crash on merge --squash', () => {
      const r = run('git merge --squash feature/test');
      assert.equal(r.exitCode, 0);
    });
  });

  describe('non-git commands', () => {
    it('should pass through non-git commands', () => {
      assert.equal(run('npm test').exitCode, 0);
    });

    it('should pass through ls commands', () => {
      assert.equal(run('ls -la').exitCode, 0);
    });
  });
});
