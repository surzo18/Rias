const SENSITIVE_FIELDS = new Set([
  'password', 'token', 'secret', 'api_key', 'apikey',
  'authorization', 'cookie', 'session_id', 'sessionid',
  'credit_card', 'creditcard', 'ssn', 'oauth_token',
  'private_key', 'privatekey',
]);

const SENSITIVE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9_-]{20,}/g,      // OpenAI keys
  /ghp_[a-zA-Z0-9]{36}/g,         // GitHub tokens
  /gho_[a-zA-Z0-9]{36}/g,         // GitHub OAuth tokens
  /\b\d{16}\b/g,                   // 16-digit numbers (cards)
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, // JWTs
];

const REDACTED = '[REDACTED]';

function redactString(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (SENSITIVE_FIELDS.has(key.toLowerCase())) return REDACTED;

  if (typeof value === 'string') return redactString(value);

  if (Array.isArray(value)) {
    return value.map((item, i) => sanitizeValue(String(i), item));
  }

  if (typeof value === 'object') {
    return sanitize(value as Record<string, unknown>);
  }

  return value;
}

export function sanitize(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] = sanitizeValue(key, value);
  }
  return result;
}
