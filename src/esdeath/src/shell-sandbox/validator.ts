import path from 'node:path';

const BLOCKED_PATTERNS: RegExp[] = [
  /\|/,               // pipe
  /[;&]/,             // command separator
  /&&/,               // logical AND
  /\|\|/,             // logical OR
  /`/,                // backtick execution
  /\$\(/,             // subshell
  />/,                // redirect
  /\.\.[/\\]/,        // path traversal
  /powershell/i,      // PS escape
  /cmd\s+\/c/i,       // CMD escape
  /\bnet\s+/i,        // net commands
  /\breg\s+/i,        // registry
  /\bformat\b/i,      // disk format
  /\bwmic\b/i,        // WMI
];

export function validateArgs(args: string[]): void {
  const joined = args.join(' ');
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(joined)) {
      throw new Error(`Argument contains blocked pattern: ${pattern.source}`);
    }
  }
}

export function validatePath(targetPath: string, allowedPaths: string[]): boolean {
  const resolved = path.resolve(targetPath);
  return allowedPaths.some((allowed) => {
    const resolvedAllowed = path.resolve(allowed);
    return resolved.startsWith(resolvedAllowed + path.sep) || resolved === resolvedAllowed;
  });
}
