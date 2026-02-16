import { spawnSync } from 'node:child_process';

/**
 * Run a bash hook script with JSON stdin.
 * Returns { exitCode, stdout, stderr } regardless of exit code.
 */
export function runBashHook(hookPath, stdinData, env = {}) {
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
