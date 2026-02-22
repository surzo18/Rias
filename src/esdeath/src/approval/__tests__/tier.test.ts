import { describe, it, expect } from 'vitest';
import { classifyTier, loadTierConfig } from '../tier.js';

const config = loadTierConfig({
  tiers: {
    safe: { actions: ['chat', 'weather', 'memory_read', 'summarize', 'fitness_read'] },
    notice: { actions: ['email_read', 'calendar_read', 'web_search', 'market_read', 'github_read'] },
    dangerous: { actions: ['shell_exec', 'email_send', 'file_write', 'file_delete', 'calendar_create'] },
    forbidden: { actions: ['env_access', 'config_write', 'docker_exec', 'credential_access', 'network_change'] },
  },
  defaults: { unknown_action: 'dangerous' },
});

describe('classifyTier', () => {
  it('should classify safe actions', () => {
    expect(classifyTier('chat', config)).toBe('safe');
    expect(classifyTier('weather', config)).toBe('safe');
    expect(classifyTier('memory_read', config)).toBe('safe');
  });

  it('should classify notice actions', () => {
    expect(classifyTier('email_read', config)).toBe('notice');
    expect(classifyTier('web_search', config)).toBe('notice');
  });

  it('should classify dangerous actions', () => {
    expect(classifyTier('shell_exec', config)).toBe('dangerous');
    expect(classifyTier('email_send', config)).toBe('dangerous');
  });

  it('should classify forbidden actions', () => {
    expect(classifyTier('env_access', config)).toBe('forbidden');
    expect(classifyTier('docker_exec', config)).toBe('forbidden');
  });

  it('should classify unknown actions as dangerous (default)', () => {
    expect(classifyTier('something_new', config)).toBe('dangerous');
  });

  it('should be case-insensitive', () => {
    expect(classifyTier('CHAT', config)).toBe('safe');
    expect(classifyTier('Shell_Exec', config)).toBe('dangerous');
  });
});
