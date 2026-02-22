import { describe, it, expect } from 'vitest';
import { ACTIONS, getActionTier, buildActionParams, type BrowserAction } from '../actions.js';

describe('web-browser actions', () => {
  describe('action registry', () => {
    it('should define all expected actions', () => {
      const names = Object.keys(ACTIONS);
      expect(names).toContain('search');
      expect(names).toContain('fetch_url');
      expect(names).toContain('screenshot');
      expect(names).toContain('extract');
    });

    it('should have valid tier for each action', () => {
      for (const action of Object.values(ACTIONS)) {
        expect(['safe', 'notice', 'dangerous', 'forbidden']).toContain(action.tier);
      }
    });
  });

  describe('getActionTier', () => {
    it('should return notice for read actions', () => {
      expect(getActionTier('search')).toBe('notice');
      expect(getActionTier('fetch_url')).toBe('notice');
      expect(getActionTier('screenshot')).toBe('notice');
      expect(getActionTier('extract')).toBe('notice');
    });

    it('should return forbidden for unknown actions', () => {
      expect(getActionTier('execute_js')).toBe('forbidden');
      expect(getActionTier('upload_file')).toBe('forbidden');
    });
  });

  describe('buildActionParams', () => {
    it('should build params for search action', () => {
      const result = buildActionParams('search', { query: 'typescript best practices' });
      expect(result.url).toContain('duckduckgo.com');
      expect(result.url).toContain('typescript');
    });

    it('should build params for fetch_url action', () => {
      const result = buildActionParams('fetch_url', { url: 'https://example.com' });
      expect(result.url).toBe('https://example.com');
    });

    it('should build params for screenshot action', () => {
      const result = buildActionParams('screenshot', { url: 'https://example.com' });
      expect(result.url).toBe('https://example.com');
    });

    it('should build params for extract action', () => {
      const result = buildActionParams('extract', {
        url: 'https://example.com',
        selector: 'h1',
      });
      expect(result.url).toBe('https://example.com');
      expect(result.selector).toBe('h1');
    });

    it('should throw for missing required params', () => {
      expect(() => buildActionParams('search', {})).toThrow('Missing required');
      expect(() => buildActionParams('fetch_url', {})).toThrow('Missing required');
    });

    it('should throw for unknown action', () => {
      expect(() => buildActionParams('hack_server', {})).toThrow('Unknown action');
    });
  });
});
