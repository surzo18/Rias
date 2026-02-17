import { spawnSync } from 'node:child_process';

function canSpawnSubprocess() {
  const probe = spawnSync(process.execPath, ['-v'], { encoding: 'utf8' });
  return !probe.error;
}

export const HOOK_SUBPROCESS_AVAILABLE = canSpawnSubprocess();

/**
 * Run a bash hook script with JSON stdin.
 * Returns { exitCode, stdout, stderr } regardless of exit code.
 */
export function runBashHook(hookPath, stdinData, env = {}) {
  if (!HOOK_SUBPROCESS_AVAILABLE) {
    return {
      exitCode: 0,
      stdout: '',
      stderr: 'SKIPPED: subprocess spawn unavailable in current runtime',
    };
  }

  const result = spawnSync('bash', [hookPath], {
    input: typeof stdinData === 'string' ? stdinData : JSON.stringify(stdinData),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 15000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}
