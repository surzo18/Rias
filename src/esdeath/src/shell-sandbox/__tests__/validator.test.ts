import { describe, it, expect } from 'vitest';
import { validateArgs, validatePath } from '../validator.js';

describe('validateArgs', () => {
  it('should pass clean args', () => {
    expect(() => validateArgs(['C:\\Users'])).not.toThrow();
    expect(() => validateArgs(['test.txt'])).not.toThrow();
    expect(() => validateArgs(['-l'])).not.toThrow();
  });

  it('should block pipe injection', () => {
    expect(() => validateArgs(['| rm -rf /'])).toThrow('blocked pattern');
    expect(() => validateArgs(['file.txt | cat'])).toThrow('blocked pattern');
  });

  it('should block command separators', () => {
    expect(() => validateArgs(['file.txt; rm -rf /'])).toThrow('blocked pattern');
    expect(() => validateArgs(['file.txt & calc'])).toThrow('blocked pattern');
    expect(() => validateArgs(['file.txt && whoami'])).toThrow('blocked pattern');
  });

  it('should block backtick execution', () => {
    expect(() => validateArgs(['`whoami`'])).toThrow('blocked pattern');
  });

  it('should block subshell', () => {
    expect(() => validateArgs(['$(whoami)'])).toThrow('blocked pattern');
  });

  it('should block redirect', () => {
    expect(() => validateArgs(['> /etc/passwd'])).toThrow('blocked pattern');
    expect(() => validateArgs(['>> evil.txt'])).toThrow('blocked pattern');
  });

  it('should block path traversal', () => {
    expect(() => validateArgs(['../../etc/passwd'])).toThrow('blocked pattern');
    expect(() => validateArgs(['..\\..\\windows'])).toThrow('blocked pattern');
  });

  it('should block powershell/cmd escape', () => {
    expect(() => validateArgs(['powershell -c Get-Process'])).toThrow('blocked pattern');
    expect(() => validateArgs(['cmd /c dir'])).toThrow('blocked pattern');
  });
});

describe('validatePath', () => {
  it('should allow paths within allowed directories', () => {
    expect(validatePath('/mnt/documents/file.txt', ['/mnt/documents'])).toBe(true);
    expect(validatePath('/mnt/downloads/sub/file.txt', ['/mnt/downloads'])).toBe(true);
  });

  it('should reject paths outside allowed directories', () => {
    expect(validatePath('/etc/passwd', ['/mnt/documents'])).toBe(false);
    expect(validatePath('/mnt/secrets/key', ['/mnt/documents', '/mnt/downloads'])).toBe(false);
  });

  it('should reject path traversal attempts', () => {
    expect(validatePath('/mnt/documents/../../../etc/passwd', ['/mnt/documents'])).toBe(false);
  });
});
