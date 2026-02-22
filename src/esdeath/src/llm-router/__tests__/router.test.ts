import { describe, it, expect } from 'vitest';
import { route, loadRoutingConfig } from '../router.js';

const config = loadRoutingConfig({
  rules: [
    { match: { requires_tools: true }, model: 'ollama/glm4-7b', fallback: 'openai/gpt-5.2' },
    { match: { language: 'sk', complexity: 'standard' }, model: 'ollama/euroLLM-9b', fallback: 'openai/gpt-5.2' },
    { match: { task: 'summarize' }, model: 'ollama/euroLLM-9b', fallback: 'openai/gpt-5.2' },
    { match: { complexity: 'complex' }, model: 'openai/gpt-5.2', fallback: 'anthropic/claude-sonnet' },
  ],
  default_model: 'ollama/qwen3-8b',
});

describe('LLM Router', () => {
  it('should route tool calling to GLM', () => {
    const decision = route({ requires_tools: true }, config);
    expect(decision.model).toBe('ollama/glm4-7b');
  });

  it('should route Slovak chat to EuroLLM', () => {
    const decision = route({ language: 'sk', complexity: 'standard' }, config);
    expect(decision.model).toBe('ollama/euroLLM-9b');
  });

  it('should route summarization to EuroLLM', () => {
    const decision = route({ task: 'summarize' }, config);
    expect(decision.model).toBe('ollama/euroLLM-9b');
  });

  it('should route complex tasks to cloud', () => {
    const decision = route({ complexity: 'complex' }, config);
    expect(decision.model).toBe('openai/gpt-5.2');
  });

  it('should use default model for unmatched requests', () => {
    const decision = route({}, config);
    expect(decision.model).toBe('ollama/qwen3-8b');
  });

  it('should include fallback in decision', () => {
    const decision = route({ complexity: 'complex' }, config);
    expect(decision.fallback).toBe('anthropic/claude-sonnet');
  });

  it('should match first rule when multiple could match', () => {
    const decision = route({ requires_tools: true, task: 'summarize' }, config);
    expect(decision.model).toBe('ollama/glm4-7b');
  });

  it('should require all match keys to be present', () => {
    const decision = route({ language: 'sk' }, config);
    expect(decision.model).toBe('ollama/qwen3-8b'); // falls to default
  });
});
