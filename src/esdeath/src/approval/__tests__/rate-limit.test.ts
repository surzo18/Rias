import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../rate-limit.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T10:00:00Z'));
    limiter = new RateLimiter(5, 60 * 60 * 1000); // 5 per hour
  });

  it('should allow requests within limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryAcquire()).toBe(true);
    }
  });

  it('should reject requests over limit', () => {
    for (let i = 0; i < 5; i++) limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('should reset after window expires', () => {
    for (let i = 0; i < 5; i++) limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1); // 1 hour later
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('should report remaining capacity', () => {
    expect(limiter.remaining()).toBe(5);
    limiter.tryAcquire();
    expect(limiter.remaining()).toBe(4);
  });
});
