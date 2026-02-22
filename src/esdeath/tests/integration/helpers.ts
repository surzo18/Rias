import jwt from 'jsonwebtoken';

const INTERNAL_SECRET = process.env.TOOL_INTERNAL_SECRET ?? 'test-integration-secret';

export function makeToken(): string {
  return jwt.sign(
    { iss: 'esdeath-gateway', iat: Math.floor(Date.now() / 1000) },
    INTERNAL_SECRET,
    { expiresIn: '1h' },
  );
}

export function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${makeToken()}`,
    'Content-Type': 'application/json',
  };
}

export const AUDIT_DB_URL = process.env.AUDIT_DB_URL ?? 'http://localhost:9000';
export const SHELL_SANDBOX_URL = process.env.SHELL_SANDBOX_URL ?? 'http://localhost:9001';
