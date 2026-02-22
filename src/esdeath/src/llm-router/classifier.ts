export interface RequestAttributes {
  complexity?: 'trivial' | 'standard' | 'complex';
  language?: 'sk' | 'en';
  task?: string;
  requires_tools?: boolean;
}

interface ChatMessage {
  role: string;
  content?: string | unknown[];
}

interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  tools?: unknown[];
  [key: string]: unknown;
}

const SLOVAK_DIACRITICS = /[\u010D\u0161\u017E\u010F\u013E\u0165\u0148\u00F4\u00E1\u00E9\u00ED\u00FA\u00FD\u0159\u011B\u016F]/;
const SLOVAK_WORDS = /\b(som|nie|ako|pre|pri|kde|ked|aby|alebo|preco|teda|potom|dobre|ahoj|dobry|prosim|dakujem|chcem|potrebujem|mozes|neviem|viem|dnes|zajtra|vcera)\b/i;

export function detectSlovak(text: string): boolean {
  return SLOVAK_DIACRITICS.test(text) || SLOVAK_WORDS.test(text);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getTextContent(msg: ChatMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  return '';
}

export function classifyRequest(body: ChatCompletionRequest): RequestAttributes {
  // Tools present -> complex (small models can't handle OpenClaw tool calling)
  if (body.tools && body.tools.length > 0) {
    return { complexity: 'complex', requires_tools: true };
  }

  // Check system prompt length
  const systemMsg = body.messages.find((m) => m.role === 'system');
  if (systemMsg) {
    const systemTokens = estimateTokens(getTextContent(systemMsg));
    if (systemTokens > 3000) {
      return { complexity: 'complex' };
    }
  }

  // Get last user message
  const lastMsg = [...body.messages].reverse().find((m) => m.role === 'user');
  const content = lastMsg ? getTextContent(lastMsg) : '';
  const language = detectSlovak(content) ? 'sk' : 'en';

  // Summarization task
  if (/summarize|summary|zhr[nň]|zhrnutie/i.test(content)) {
    return { task: 'summarize', language };
  }

  // Short, simple conversation
  if (content.length < 100 && body.messages.length <= 3) {
    return { language, complexity: 'trivial' };
  }

  return { language, complexity: 'standard' };
}
