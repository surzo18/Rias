import { describe, it, expect } from 'vitest';
import { ALLOWLIST, isAllowed, getTier } from '../allowlist.js';

describe('Shell Allowlist', () => {
  it('should allow whitelisted read-only commands', () => {
    expect(isAllowed('hostname')).toBe(true);
    expect(isAllowed('systeminfo')).toBe(true);
    expect(isAllowed('tasklist')).toBe(true);
  });

  it('should allow case-insensitive', () => {
    expect(isAllowed('HOSTNAME')).toBe(true);
    expect(isAllowed('SystemInfo')).toBe(true);
  });

  it('should reject unknown commands', () => {
    expect(isAllowed('powershell')).toBe(false);
    expect(isAllowed('cmd')).toBe(false);
    expect(isAllowed('rm')).toBe(false);
    expect(isAllowed('format')).toBe(false);
    expect(isAllowed('net')).toBe(false);
    expect(isAllowed('reg')).toBe(false);
  });

  it('should return correct tier', () => {
    expect(getTier('hostname')).toBe('safe');
    expect(getTier('systeminfo')).toBe('notice');
    expect(getTier('dir')).toBe('notice');
    expect(getTier('del')).toBe('dangerous');
    expect(getTier('start')).toBe('dangerous');
    expect(getTier('unknown')).toBeNull();
  });

  it('should have all lowercase keys', () => {
    for (const key of Object.keys(ALLOWLIST)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});
