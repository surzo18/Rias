import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatAuditEntry, sendToChannel, createTelegramSender } from '../telegram.js';
import type { AuditLogRow } from '../schema.js';

function makeEntry(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 'test-1',
    timestamp: '2026-02-15T10:00:00Z',
    source: 'user',
    action: 'shell:hostname',
    tool: 'shell-sandbox',
    tier: 'safe',
    params: '{}',
    state: 'success',
    result_summary: 'DESKTOP-ABC123',
    error: null,
    duration_ms: 42,
    llm_provider: null,
    tokens_used: 0,
    estimated_cost_usd: 0,
    approval_id: null,
    telegram_sent_at: null,
    telegram_message_id: null,
    ...overrides,
  };
}

describe('formatAuditEntry', () => {
  /** @test */
  it('should format a safe tier entry', () => {
    const result = formatAuditEntry(makeEntry());
    expect(result).toContain('SAFE');
    expect(result).toContain('shell:hostname');
    expect(result).toContain('shell-sandbox');
    expect(result).toContain('DESKTOP-ABC123');
    expect(result).toContain('42ms');
    expect(result).toContain('user');
  });

  /** @test */
  it('should use correct emoji for each tier', () => {
    expect(formatAuditEntry(makeEntry({ tier: 'safe' }))).toMatch(/🟢/u);
    expect(formatAuditEntry(makeEntry({ tier: 'notice' }))).toMatch(/🟡/u);
    expect(formatAuditEntry(makeEntry({ tier: 'dangerous' }))).toMatch(/🔴/u);
    expect(formatAuditEntry(makeEntry({ tier: 'forbidden' }))).toMatch(/⛔/u);
  });

  /** @test */
  it('should use fallback emoji for unknown tier', () => {
    expect(formatAuditEntry(makeEntry({ tier: 'custom' }))).toMatch(/❓/u);
  });

  /** @test */
  it('should show state indicator for non-success states', () => {
    expect(formatAuditEntry(makeEntry({ state: 'failed' }))).toMatch(/❌/u);
    expect(formatAuditEntry(makeEntry({ state: 'blocked' }))).toMatch(/🚫/u);
    expect(formatAuditEntry(makeEntry({ state: 'timeout' }))).toMatch(/⏰/u);
  });

  /** @test */
  it('should not show state indicator for success without approval', () => {
    const result = formatAuditEntry(makeEntry({ state: 'success', approval_id: null }));
    expect(result).not.toMatch(/✅/u);
  });

  /** @test */
  it('should show approval info when approval_id present', () => {
    const result = formatAuditEntry(makeEntry({ state: 'success', approval_id: 'ap-123' }));
    expect(result).toContain('approved (ap-123)');
    expect(result).toMatch(/✅/u);
  });

  /** @test */
  it('should show LLM provider and tokens when present', () => {
    const result = formatAuditEntry(makeEntry({
      llm_provider: 'openai/gpt-5.2',
      tokens_used: 1500,
      estimated_cost_usd: 0.0075,
    }));
    expect(result).toContain('openai/gpt-5.2');
    expect(result).toContain('1500 tokens');
    expect(result).toContain('~$0.0075');
  });

  /** @test */
  it('should not show cost when zero', () => {
    const result = formatAuditEntry(makeEntry({
      llm_provider: 'ollama/qwen3-8b',
      tokens_used: 500,
      estimated_cost_usd: 0,
    }));
    expect(result).toContain('500 tokens');
    expect(result).not.toContain('~$');
  });

  /** @test */
  it('should truncate long result_summary at 120 chars', () => {
    const longSummary = 'A'.repeat(200);
    const result = formatAuditEntry(makeEntry({ result_summary: longSummary }));
    expect(result).toContain('A'.repeat(117) + '...');
    expect(result).not.toContain('A'.repeat(118));
  });

  /** @test */
  it('should use system when tool is null', () => {
    const result = formatAuditEntry(makeEntry({ tool: null }));
    expect(result).toContain('system');
  });

  /** @test */
  it('should omit result line when result_summary is null', () => {
    const result = formatAuditEntry(makeEntry({ result_summary: null }));
    expect(result).not.toContain('Result:');
  });
});

describe('sendToChannel', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** @test */
  it('should call Telegram API and return message_id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { message_id: 42 } }),
    }) as unknown as typeof fetch;

    const config = { botToken: 'test-token', channelId: '-1001234', enabled: true };
    const result = await sendToChannel(config, 'test message');

    expect(result).toBe(42);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test message'),
      }),
    );
  });

  /** @test */
  it('should throw on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    }) as unknown as typeof fetch;

    const config = { botToken: 'bad-token', channelId: '-100', enabled: true };
    await expect(sendToChannel(config, 'test')).rejects.toThrow('Telegram API 403');
  });

  /** @test */
  it('should not send parse_mode HTML', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { message_id: 1 } }),
    }) as unknown as typeof fetch;

    const config = { botToken: 'token', channelId: '-100', enabled: true };
    await sendToChannel(config, '<b>test</b>');

    const callBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(callBody.parse_mode).toBeUndefined();
    expect(callBody.disable_notification).toBe(true);
  });
});

describe('createTelegramSender', () => {
  /** @test */
  it('should return disabled sender when config is incomplete', () => {
    const sender = createTelegramSender({ botToken: '', channelId: '', enabled: false });
    expect(sender.enabled).toBe(false);
  });

  /** @test */
  it('should return disabled sender when botToken is missing', () => {
    const sender = createTelegramSender({ botToken: '', channelId: '-100', enabled: true });
    expect(sender.enabled).toBe(false);
  });

  /** @test */
  it('should return disabled sender when channelId is missing', () => {
    const sender = createTelegramSender({ botToken: 'token', channelId: '', enabled: true });
    expect(sender.enabled).toBe(false);
  });

  /** @test */
  it('should return enabled sender with valid config', () => {
    const sender = createTelegramSender({ botToken: 'token', channelId: '-100', enabled: true });
    expect(sender.enabled).toBe(true);
  });

  /** @test */
  it('disabled sender should return null', async () => {
    const sender = createTelegramSender({ botToken: '', channelId: '', enabled: false });
    const result = await sender.send(makeEntry());
    expect(result).toBeNull();
  });
});
