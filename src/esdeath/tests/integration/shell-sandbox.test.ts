import { describe, it, expect } from 'vitest';
import { authHeaders, SHELL_SANDBOX_URL } from './helpers.js';

describe('Shell Sandbox Integration', () => {
  it('should respond to health check', async () => {
    const res = await fetch(`${SHELL_SANDBOX_URL}/health`, {
      headers: authHeaders(),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('should execute allowed safe command (hostname)', async () => {
    const res = await fetch(`${SHELL_SANDBOX_URL}/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        request_id: 'int-test-hostname',
        action: 'run_command',
        params: { command: 'hostname', args: [] },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.result.stdout).toBeTruthy();
    expect(data.metadata.tier).toBe('safe');
  });

  it('should execute allowed safe command (whoami)', async () => {
    const res = await fetch(`${SHELL_SANDBOX_URL}/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        request_id: 'int-test-whoami',
        action: 'run_command',
        params: { command: 'whoami', args: [] },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.result.stdout).toBeTruthy();
  });

  it('should reject command not in allowlist', async () => {
    const res = await fetch(`${SHELL_SANDBOX_URL}/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        request_id: 'int-test-disallowed',
        action: 'run_command',
        params: { command: 'curl', args: ['http://evil.com'] },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.result.error).toContain('not in allowlist');
  });

  it('should reject injection via pipe in args', async () => {
    const res = await fetch(`${SHELL_SANDBOX_URL}/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        request_id: 'int-test-pipe-inject',
        action: 'run_command',
        params: { command: 'dir', args: ['/mnt/documents', '|', 'cat', '/etc/passwd'] },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.result.error).toContain('blocked pattern');
  });

  it('should reject injection via path traversal', async () => {
    const res = await fetch(`${SHELL_SANDBOX_URL}/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        request_id: 'int-test-traversal',
        action: 'run_command',
        params: { command: 'dir', args: ['../../etc/passwd'] },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.result.error).toContain('blocked pattern');
  });

  it('should reject unknown action', async () => {
    const res = await fetch(`${SHELL_SANDBOX_URL}/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        request_id: 'int-test-unknown',
        action: 'delete_files',
        params: {},
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.result.error).toContain('Unknown action');
  });

  it('should reject requests without auth', async () => {
    const res = await fetch(`${SHELL_SANDBOX_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'run_command', params: { command: 'hostname' } }),
    });
    expect(res.status).toBe(401);
  });
});
