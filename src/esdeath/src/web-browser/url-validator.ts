const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '[::1]',
]);

export function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;

  // 0.0.0.0
  if (a === 0 && parts.every((p) => p === 0)) return true;

  // 127.x.x.x (loopback)
  if (a === 127) return true;

  // 10.x.x.x
  if (a === 10) return true;

  // 172.16-31.x.x
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.x.x
  if (a === 192 && b === 168) return true;

  // 169.254.x.x (link-local, includes AWS metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  return false;
}

export function validateUrl(input: string): URL {
  if (!input || input.trim() === '') {
    throw new Error('URL is required');
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  // Protocol check
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Blocked protocol: ${url.protocol} — only http: and https: allowed`);
  }

  // Credentials check
  if (url.username || url.password) {
    throw new Error('URL with credentials is not allowed');
  }

  // Hostname check
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Hostname blocked: ${hostname}`);
  }

  // IP-based checks
  if (isPrivateIp(hostname)) {
    throw new Error(`IP address blocked: ${hostname} is a private/reserved address`);
  }

  return url;
}
