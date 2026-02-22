import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createAuditMiddleware } from '../audit-middleware.js';

function mockReq(body: Record<string, unknown> = {}): Request {
  return { body } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const SECRET = 'test-secret-key';
const AUDIT_URL = 'http://audit-db:9000/log';

describe('createAuditMiddleware', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call next() immediately', () => {
    const middleware = createAuditMiddleware({ tool: 'shell-sandbox', secret: SECRET });
    const next: NextFunction = vi.fn();

    middleware(mockReq(), mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('should intercept res.json and send audit log when metadata is present', async () => {
    const middleware = createAuditMiddleware({ tool: 'shell-sandbox', secret: SECRET });
    const req = mockReq({ params: { command: 'hostname' } });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    // Simulate calling res.json with a ToolResponse
    res.json({
      request_id: 'req-1',
      status: 'success',
      result: { stdout: 'my-host' },
      metadata: { duration_ms: 42, action: 'shell:hostname', tier: 'safe' },
    });

    // Wait for fire-and-forget fetch
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(AUDIT_URL);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers.Authorization).toMatch(/^Bearer /);

    const body = JSON.parse(options.body);
    expect(body.tool).toBe('shell-sandbox');
    expect(body.action).toBe('shell:hostname');
    expect(body.tier).toBe('safe');
    expect(body.state).toBe('success');
    expect(body.duration_ms).toBe(42);
    expect(body.params).toBe('{"command":"hostname"}');
    expect(body.result_summary).toBe('{"stdout":"my-host"}');
    expect(body.error).toBeNull();
    expect(body.source).toBe('user');
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('should set state to failed and capture error for error responses', async () => {
    const middleware = createAuditMiddleware({ tool: 'email-tool', secret: SECRET });
    const req = mockReq({ params: { to: 'test@example.com' } });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    res.json({
      request_id: 'req-2',
      status: 'error',
      result: { error: 'SMTP connection refused' },
      metadata: { duration_ms: 100, action: 'email:send', tier: 'dangerous' },
    });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.state).toBe('failed');
    expect(body.error).toBe('SMTP connection refused');
    expect(body.tool).toBe('email-tool');
    expect(body.tier).toBe('dangerous');
  });

  it('should truncate result_summary to 200 characters', async () => {
    const middleware = createAuditMiddleware({ tool: 'web-browser', secret: SECRET });
    const req = mockReq({});
    const res = mockRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    const longText = 'x'.repeat(300);
    res.json({
      request_id: 'req-3',
      status: 'success',
      result: { text: longText },
      metadata: { duration_ms: 500, action: 'web:fetch_url', tier: 'notice' },
    });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.result_summary.length).toBe(200);
    expect(body.result_summary).toMatch(/\.\.\.$/);
  });

  it('should not send audit log when response has no metadata', () => {
    const middleware = createAuditMiddleware({ tool: 'shell-sandbox', secret: SECRET });
    const req = mockReq({});
    const res = mockRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    // Health endpoint response — no metadata
    res.json({ status: 'ok', uptime_s: 123 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should not crash the response if audit fetch fails', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const middleware = createAuditMiddleware({ tool: 'market-tool', secret: SECRET });
    const req = mockReq({ params: { symbol: 'AAPL' } });
    const res = mockRes();
    const originalJson = res.json;
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    res.json({
      request_id: 'req-4',
      status: 'success',
      result: { price: 150 },
      metadata: { duration_ms: 200, action: 'market:quote', tier: 'safe' },
    });

    // The original json should still have been called (response not blocked)
    expect(originalJson).toHaveBeenCalled();

    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledOnce());
    expect(consoleSpy).toHaveBeenCalledWith('Audit log failed:', 'Network error');

    consoleSpy.mockRestore();
  });

  it('should use custom auditUrl when provided', async () => {
    const customUrl = 'http://custom-audit:8080/log';
    const middleware = createAuditMiddleware({
      tool: 'shell-sandbox',
      secret: SECRET,
      auditUrl: customUrl,
    });
    const req = mockReq({ params: {} });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    res.json({
      request_id: 'req-5',
      status: 'success',
      result: {},
      metadata: { duration_ms: 10, action: 'test', tier: 'safe' },
    });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(fetchSpy.mock.calls[0][0]).toBe(customUrl);
  });
});
