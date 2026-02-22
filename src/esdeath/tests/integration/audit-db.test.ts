import { describe, it, expect } from 'vitest';
import { authHeaders, AUDIT_DB_URL } from './helpers.js';

describe('Audit DB Integration', () => {
  it('should respond to health check', async () => {
    const res = await fetch(`${AUDIT_DB_URL}/health`, {
      headers: authHeaders(),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.uptime_s).toBeTypeOf('number');
  });

  it('should accept and query audit logs', async () => {
    const testId = `int-test-${Date.now()}`;

    const logRes = await fetch(`${AUDIT_DB_URL}/log`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        id: testId,
        timestamp: new Date().toISOString(),
        source: 'system',
        action: 'integration_test',
        tool: null,
        tier: 'safe',
        params: '{}',
        state: 'success',
        result_summary: 'test entry',
        error: null,
        duration_ms: 1,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: null,
      }),
    });
    expect(logRes.ok).toBe(true);

    const queryRes = await fetch(
      `${AUDIT_DB_URL}/query?action=integration_test&limit=1`,
      { headers: authHeaders() },
    );
    expect(queryRes.ok).toBe(true);
    const logs = await queryRes.json();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe('integration_test');
  });

  it('should return daily costs', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${AUDIT_DB_URL}/costs/${today}`, {
      headers: authHeaders(),
    });
    expect(res.ok).toBe(true);
    const costs = await res.json();
    expect(Array.isArray(costs)).toBe(true);
  });

  it('should sanitize sensitive params before storing', async () => {
    const testId = `int-sanitize-${Date.now()}`;

    await fetch(`${AUDIT_DB_URL}/log`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        id: testId,
        timestamp: new Date().toISOString(),
        source: 'system',
        action: 'sanitize_test',
        tool: null,
        tier: 'safe',
        params: JSON.stringify({ password: 'super-secret-123', username: 'test' }),
        state: 'success',
        result_summary: 'sanitize check',
        error: null,
        duration_ms: 1,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: null,
      }),
    });

    const queryRes = await fetch(
      `${AUDIT_DB_URL}/query?action=sanitize_test&limit=1`,
      { headers: authHeaders() },
    );
    const logs = await queryRes.json();
    expect(logs.length).toBeGreaterThan(0);
    const params = JSON.parse(logs[0].params);
    expect(params.password).toBe('[REDACTED]');
    expect(params.username).toBe('test');
  });

  it('should reject requests without auth token', async () => {
    const res = await fetch(`${AUDIT_DB_URL}/query`);
    expect(res.status).toBe(401);
  });

  it('should reject requests with invalid token', async () => {
    const res = await fetch(`${AUDIT_DB_URL}/query`, {
      headers: { Authorization: 'Bearer not-a-valid-jwt-token' },
    });
    expect(res.status).toBe(401);
  });
});
