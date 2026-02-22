import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createTierGate } from '../tier-gate.js';
import type { Tier } from '../types.js';

const SECRET = 'test-secret';

function mockReq(body: Record<string, unknown> = {}): Request {
  return { body } as unknown as Request;
}

function mockRes(): Response & { _json: unknown; _status: number } {
  const res = {
    _json: null as unknown,
    _status: 200,
    json: vi.fn(function (this: { _json: unknown }, data: unknown) {
      this._json = data;
      return this;
    }),
    status: vi.fn(function (this: { _status: number }, code: number) {
      this._status = code;
      return this;
    }),
  } as unknown as Response & { _json: unknown; _status: number };
  return res;
}

describe('createTierGate', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeGate(tierFn: (action: string) => Tier) {
    return createTierGate({
      tool: 'test-tool',
      secret: SECRET,
      auditDbUrl: 'http://audit-db:9000',
      getRequestTier: (action) => tierFn(action),
    });
  }

  it('should pass through safe actions', async () => {
    const gate = makeGate(() => 'safe');
    const next: NextFunction = vi.fn();
    const req = mockReq({ action: 'read', params: {} });
    const res = mockRes();

    await gate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should pass through notice actions', async () => {
    const gate = makeGate(() => 'notice');
    const next: NextFunction = vi.fn();
    const req = mockReq({ action: 'list', params: {} });
    const res = mockRes();

    await gate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should block forbidden actions with 403', async () => {
    const gate = makeGate(() => 'forbidden');
    const next: NextFunction = vi.fn();
    const req = mockReq({ request_id: 'r1', action: 'hack', params: {} });
    const res = mockRes();

    await gate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res._json).toMatchObject({
      request_id: 'r1',
      status: 'blocked',
      metadata: { tier: 'forbidden' },
    });
  });

  it('should create approval for dangerous action without approval_id', async () => {
    const gate = makeGate(() => 'dangerous');
    const next: NextFunction = vi.fn();
    const req = mockReq({ request_id: 'r2', action: 'send_email', params: { to: 'x@y.com' } });
    const res = mockRes();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'approval-123', state: 'pending' }),
    });

    await gate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://audit-db:9000/approvals');
    expect(opts.method).toBe('POST');

    expect(res._json).toMatchObject({
      request_id: 'r2',
      status: 'approval_required',
      result: { approval_id: 'approval-123' },
    });
  });

  it('should proceed when dangerous action has approved approval_id', async () => {
    const gate = makeGate(() => 'dangerous');
    const next: NextFunction = vi.fn();
    const req = mockReq({
      request_id: 'r3',
      action: 'send_email',
      params: {},
      approval_id: 'approval-456',
    });
    const res = mockRes();

    // GET /approvals/:id
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'approval-456', state: 'approved' }),
    });
    // POST /approvals/:id/resolve (transition to executing)
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await gate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Verify resolve call
    const [resolveUrl, resolveOpts] = fetchSpy.mock.calls[1];
    expect(resolveUrl).toBe('http://audit-db:9000/approvals/approval-456/resolve');
    expect(JSON.parse(resolveOpts.body)).toMatchObject({ state: 'executing' });
  });

  it('should block when approval is pending', async () => {
    const gate = makeGate(() => 'dangerous');
    const next: NextFunction = vi.fn();
    const req = mockReq({
      request_id: 'r4',
      action: 'del',
      params: {},
      approval_id: 'approval-789',
    });
    const res = mockRes();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'approval-789', state: 'pending' }),
    });

    await gate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._json).toMatchObject({
      status: 'blocked',
      result: { state: 'pending', approval_id: 'approval-789' },
    });
  });

  it('should block when approval is rejected', async () => {
    const gate = makeGate(() => 'dangerous');
    const next: NextFunction = vi.fn();
    const req = mockReq({
      request_id: 'r5',
      action: 'del',
      params: {},
      approval_id: 'approval-rej',
    });
    const res = mockRes();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'approval-rej', state: 'rejected' }),
    });

    await gate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._json).toMatchObject({
      status: 'blocked',
      result: { state: 'rejected' },
    });
  });

  it('should block when approval is timed_out', async () => {
    const gate = makeGate(() => 'dangerous');
    const next: NextFunction = vi.fn();
    const req = mockReq({
      request_id: 'r6',
      action: 'start',
      params: {},
      approval_id: 'approval-to',
    });
    const res = mockRes();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'approval-to', state: 'timed_out' }),
    });

    await gate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._json).toMatchObject({
      status: 'blocked',
      result: { state: 'timed_out' },
    });
  });

  it('should return 500 when audit-db is unreachable for approval creation', async () => {
    const gate = makeGate(() => 'dangerous');
    const next: NextFunction = vi.fn();
    const req = mockReq({ request_id: 'r7', action: 'send_email', params: {} });
    const res = mockRes();

    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await gate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res._json).toMatchObject({
      status: 'error',
      result: { error: expect.stringContaining('ECONNREFUSED') },
    });
  });

  it('should use custom auditDbUrl and timeoutMinutes', async () => {
    const gate = createTierGate({
      tool: 'custom-tool',
      secret: SECRET,
      auditDbUrl: 'http://custom-audit:1234',
      getRequestTier: () => 'dangerous',
      timeoutMinutes: 10,
    });

    const next: NextFunction = vi.fn();
    const req = mockReq({ request_id: 'r8', action: 'test', params: {} });
    const res = mockRes();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'a-custom', state: 'pending' }),
    });

    await gate(req, res, next);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://custom-audit:1234/approvals');
    expect(JSON.parse(opts.body)).toMatchObject({ timeout_minutes: 10 });
  });
});
