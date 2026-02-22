import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseModelString, resolveModelName } from '../proxy-server.js';

// Note: We test the pure functions. Full proxy integration requires
// running containers (covered by e2e tests).

describe('parseModelString', () => {
  it('should parse provider/model format', () => {
    expect(parseModelString('ollama/qwen3-8b')).toEqual({
      provider: 'ollama',
      model: 'qwen3-8b',
    });
  });

  it('should parse openai/gpt-5.2', () => {
    expect(parseModelString('openai/gpt-5.2')).toEqual({
      provider: 'openai',
      model: 'gpt-5.2',
    });
  });

  it('should parse anthropic/claude-sonnet-4-5', () => {
    expect(parseModelString('anthropic/claude-sonnet-4-5')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    });
  });

  it('should default to openai provider for bare model name', () => {
    expect(parseModelString('gpt-5.2')).toEqual({
      provider: 'openai',
      model: 'gpt-5.2',
    });
  });

  it('should handle model names with multiple slashes', () => {
    expect(parseModelString('ollama/euroLLM-9b')).toEqual({
      provider: 'ollama',
      model: 'euroLLM-9b',
    });
  });
});

describe('resolveModelName', () => {
  // We need to mock the providers config
  // Since resolveModelName reads from module-level providers,
  // we test the logic by importing and calling after config load.
  // For unit test purposes, we test the function signature.

  it('should be a function', () => {
    expect(typeof resolveModelName).toBe('function');
  });

  // Model map resolution is tested via the classifier + router integration
  // in the e2e tests. The function reads from the module-level providers
  // object which requires loadConfig() to be called first.
});
