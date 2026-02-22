import { describe, it, expect } from 'vitest';
import { classifyRequest, detectSlovak, estimateTokens } from '../classifier.js';

describe('detectSlovak', () => {
  it('should detect Slovak diacritics', () => {
    expect(detectSlovak('Aký je počasie?')).toBe(true);
    expect(detectSlovak('môžeš mi pomôcť?')).toBe(true);
    expect(detectSlovak('čo robíš?')).toBe(true);
  });

  it('should detect common Slovak words', () => {
    expect(detectSlovak('som tu')).toBe(true);
    expect(detectSlovak('ahoj ako sa mas')).toBe(true);
    expect(detectSlovak('prosim skontroluj emaily')).toBe(true);
    expect(detectSlovak('chcem vediet')).toBe(true);
  });

  it('should not detect English as Slovak', () => {
    expect(detectSlovak('Hello, how are you?')).toBe(false);
    expect(detectSlovak('Please check my email')).toBe(false);
    expect(detectSlovak('What is the weather today?')).toBe(false);
  });
});

describe('estimateTokens', () => {
  it('should estimate ~1 token per 4 chars', () => {
    expect(estimateTokens('hello world')).toBe(3); // 11 / 4 = 2.75 -> ceil 3
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

describe('classifyRequest', () => {
  it('should classify requests with tools as complex', () => {
    const result = classifyRequest({
      messages: [{ role: 'user', content: 'check email' }],
      tools: [{ type: 'function', function: { name: 'email' } }],
    });
    expect(result.complexity).toBe('complex');
    expect(result.requires_tools).toBe(true);
  });

  it('should classify long system prompt as complex', () => {
    const result = classifyRequest({
      messages: [
        { role: 'system', content: 'x'.repeat(15000) },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(result.complexity).toBe('complex');
  });

  it('should detect summarization tasks', () => {
    const result = classifyRequest({
      messages: [{ role: 'user', content: 'Please summarize this article about AI' }],
    });
    expect(result.task).toBe('summarize');
  });

  it('should detect Slovak summarization tasks', () => {
    const result = classifyRequest({
      messages: [{ role: 'user', content: 'Zhrň mi tento článok' }],
    });
    expect(result.task).toBe('summarize');
    expect(result.language).toBe('sk');
  });

  it('should classify short conversations as trivial', () => {
    const result = classifyRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result.complexity).toBe('trivial');
    expect(result.language).toBe('en');
  });

  it('should classify short Slovak conversations as trivial', () => {
    const result = classifyRequest({
      messages: [{ role: 'user', content: 'ahoj' }],
    });
    expect(result.complexity).toBe('trivial');
    expect(result.language).toBe('sk');
  });

  it('should classify longer conversations as standard', () => {
    const result = classifyRequest({
      messages: [
        { role: 'user', content: 'Tell me about the stock market trends for technology companies and what we can expect over the next quarter based on recent earnings reports.' },
      ],
    });
    expect(result.complexity).toBe('standard');
    expect(result.language).toBe('en');
  });

  it('should classify multi-turn conversations as standard even if last message is short', () => {
    const result = classifyRequest({
      messages: [
        { role: 'user', content: 'What is AI?' },
        { role: 'assistant', content: 'AI is...' },
        { role: 'user', content: 'Tell me more about machine learning' },
        { role: 'assistant', content: 'Machine learning is...' },
        { role: 'user', content: 'Thanks' },
      ],
    });
    // >3 messages, but short content -> standard (not trivial because messages.length > 3)
    expect(result.complexity).toBe('standard');
  });

  it('should handle empty tools array as no tools', () => {
    const result = classifyRequest({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });
    expect(result.complexity).toBe('trivial');
    expect(result.requires_tools).toBeUndefined();
  });

  it('should handle messages with non-string content', () => {
    const result = classifyRequest({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'image' }] }],
    });
    // Non-string content returns empty string, short, few messages -> trivial
    expect(result.complexity).toBe('trivial');
  });
});
