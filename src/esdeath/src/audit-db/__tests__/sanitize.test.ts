import { describe, it, expect } from 'vitest';
import { sanitize } from '../sanitize.js';

describe('sanitize', () => {
  it('should pass through safe values', () => {
    const result = sanitize({ name: 'test', count: 42 });
    expect(result).toEqual({ name: 'test', count: 42 });
  });

  it('should redact fields named password/token/secret/api_key', () => {
    const result = sanitize({
      password: 'hunter2',
      token: 'abc123',
      api_key: 'sk-xyz',
      secret: 'mysecret',
      name: 'safe',
    });
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.api_key).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.name).toBe('safe');
  });

  it('should redact nested sensitive fields', () => {
    const result = sanitize({
      config: { password: 'hunter2', host: 'localhost' },
    });
    expect((result.config as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((result.config as Record<string, unknown>).host).toBe('localhost');
  });

  it('should redact OpenAI key patterns in string values', () => {
    const result = sanitize({
      note: 'Key is sk-proj-abc123def456ghi789jkl012',
    });
    expect(result.note).toContain('[REDACTED]');
    expect(result.note).not.toContain('sk-proj');
  });

  it('should redact GitHub token patterns', () => {
    const result = sanitize({ token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' });
    expect(result.token).toBe('[REDACTED]');
  });

  it('should redact 16-digit card-like numbers', () => {
    const result = sanitize({ note: 'Card 4111111111111111 end' });
    expect(result.note).not.toContain('4111111111111111');
    expect(result.note).toContain('[REDACTED]');
  });

  it('should handle arrays', () => {
    const result = sanitize({ items: ['safe', 'sk-proj-secret123456789012'] });
    const items = result.items as string[];
    expect(items[0]).toBe('safe');
    expect(items[1]).toContain('[REDACTED]');
  });

  it('should handle null and undefined', () => {
    const result = sanitize({ a: null, b: undefined });
    expect(result.a).toBeNull();
    expect(result.b).toBeUndefined();
  });
});
