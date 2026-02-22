import { describe, it, expect } from 'vitest';
import { validateUrl, isPrivateIp } from '../url-validator.js';

describe('url-validator', () => {
  describe('isPrivateIp', () => {
    it('should detect loopback addresses', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.0.0.2')).toBe(true);
      expect(isPrivateIp('127.255.255.255')).toBe(true);
    });

    it('should detect 10.x.x.x range', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.255.255.255')).toBe(true);
    });

    it('should detect 172.16-31.x.x range', () => {
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      expect(isPrivateIp('172.15.0.1')).toBe(false);
      expect(isPrivateIp('172.32.0.1')).toBe(false);
    });

    it('should detect 192.168.x.x range', () => {
      expect(isPrivateIp('192.168.0.1')).toBe(true);
      expect(isPrivateIp('192.168.255.255')).toBe(true);
    });

    it('should detect link-local and AWS metadata', () => {
      expect(isPrivateIp('169.254.169.254')).toBe(true);
      expect(isPrivateIp('169.254.0.1')).toBe(true);
    });

    it('should detect 0.0.0.0', () => {
      expect(isPrivateIp('0.0.0.0')).toBe(true);
    });

    it('should allow public IPs', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
      expect(isPrivateIp('93.184.216.34')).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should allow normal HTTPS URLs', () => {
      expect(() => validateUrl('https://example.com')).not.toThrow();
      expect(() => validateUrl('https://www.google.com/search?q=test')).not.toThrow();
    });

    it('should allow HTTP URLs', () => {
      expect(() => validateUrl('http://example.com')).not.toThrow();
    });

    it('should reject file:// protocol', () => {
      expect(() => validateUrl('file:///etc/passwd')).toThrow('protocol');
    });

    it('should reject ftp:// protocol', () => {
      expect(() => validateUrl('ftp://evil.com/payload')).toThrow('protocol');
    });

    it('should reject data: protocol', () => {
      expect(() => validateUrl('data:text/html,<script>alert(1)</script>')).toThrow('protocol');
    });

    it('should reject javascript: protocol', () => {
      expect(() => validateUrl('javascript:alert(1)')).toThrow('protocol');
    });

    it('should reject localhost hostnames', () => {
      expect(() => validateUrl('http://localhost')).toThrow('blocked');
      expect(() => validateUrl('http://localhost:3000')).toThrow('blocked');
    });

    it('should reject loopback IPs', () => {
      expect(() => validateUrl('http://127.0.0.1')).toThrow('blocked');
      expect(() => validateUrl('http://127.0.0.1:8080')).toThrow('blocked');
    });

    it('should reject 0.0.0.0', () => {
      expect(() => validateUrl('http://0.0.0.0')).toThrow('blocked');
    });

    it('should reject private network IPs', () => {
      expect(() => validateUrl('http://10.0.0.1')).toThrow('blocked');
      expect(() => validateUrl('http://172.16.0.1')).toThrow('blocked');
      expect(() => validateUrl('http://192.168.1.1')).toThrow('blocked');
    });

    it('should reject AWS metadata endpoint', () => {
      expect(() => validateUrl('http://169.254.169.254/latest/meta-data')).toThrow('blocked');
    });

    it('should reject invalid URLs', () => {
      expect(() => validateUrl('not-a-url')).toThrow();
      expect(() => validateUrl('')).toThrow();
    });

    it('should reject URLs with credentials', () => {
      expect(() => validateUrl('http://user:pass@example.com')).toThrow('credentials');
    });
  });
});
