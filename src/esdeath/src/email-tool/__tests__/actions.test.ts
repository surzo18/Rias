import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ACTIONS,
  getActionTier,
  resolveAccount,
  buildGogArgs,
  parseGogOutput,
  type EmailAction,
} from '../actions.js';

describe('email-tool actions', () => {
  describe('action registry', () => {
    it('should define all expected actions', () => {
      const names = Object.keys(ACTIONS);
      expect(names).toContain('list_unread');
      expect(names).toContain('search');
      expect(names).toContain('read_email');
      expect(names).toContain('send_email');
      expect(names).toContain('calendar_today');
      expect(names).toContain('calendar_week');
      expect(names).toContain('calendar_create');
    });

    it('should have valid tier for each action', () => {
      for (const action of Object.values(ACTIONS)) {
        expect(['safe', 'notice', 'dangerous', 'forbidden']).toContain(action.tier);
      }
    });
  });

  describe('getActionTier', () => {
    it('should return notice for read actions', () => {
      expect(getActionTier('list_unread')).toBe('notice');
      expect(getActionTier('search')).toBe('notice');
      expect(getActionTier('read_email')).toBe('notice');
      expect(getActionTier('calendar_today')).toBe('notice');
      expect(getActionTier('calendar_week')).toBe('notice');
    });

    it('should return dangerous for write actions', () => {
      expect(getActionTier('send_email')).toBe('dangerous');
      expect(getActionTier('calendar_create')).toBe('dangerous');
    });

    it('should return forbidden for unknown actions', () => {
      expect(getActionTier('delete_all_emails')).toBe('forbidden');
      expect(getActionTier('forward_to_stranger')).toBe('forbidden');
    });
  });

  describe('resolveAccount', () => {
    it('should return primary as default', () => {
      expect(resolveAccount(undefined)).toBe('primary');
      expect(resolveAccount('')).toBe('primary');
    });

    it('should accept valid account names', () => {
      expect(resolveAccount('primary')).toBe('primary');
      expect(resolveAccount('work')).toBe('work');
      expect(resolveAccount('spam')).toBe('spam');
    });

    it('should reject invalid account names', () => {
      expect(() => resolveAccount('hacker@evil.com')).toThrow('Unknown account');
      expect(() => resolveAccount('nonexistent')).toThrow('Unknown account');
    });
  });

  describe('buildGogArgs', () => {
    it('should build args for list_unread', () => {
      const args = buildGogArgs('list_unread', { account: 'primary', max_results: 10 });
      expect(args).toEqual(['mail', 'list', '--account', 'primary', '--unread', '--max', '10']);
    });

    it('should build args for search', () => {
      const args = buildGogArgs('search', { account: 'work', query: 'invoice' });
      expect(args).toEqual(['mail', 'search', '--account', 'work', '--query', 'invoice']);
    });

    it('should build args for read_email', () => {
      const args = buildGogArgs('read_email', { account: 'primary', message_id: 'abc123' });
      expect(args).toEqual(['mail', 'read', '--account', 'primary', '--id', 'abc123']);
    });

    it('should build args for send_email', () => {
      const args = buildGogArgs('send_email', {
        account: 'primary',
        to: 'test@example.com',
        subject: 'Hello',
        body: 'World',
      });
      expect(args).toEqual([
        'mail', 'send', '--account', 'primary',
        '--to', 'test@example.com',
        '--subject', 'Hello',
        '--body', 'World',
      ]);
    });

    it('should build args for calendar_today', () => {
      const args = buildGogArgs('calendar_today', { account: 'primary' });
      expect(args).toEqual(['calendar', 'today', '--account', 'primary']);
    });

    it('should build args for calendar_week', () => {
      const args = buildGogArgs('calendar_week', { account: 'work' });
      expect(args).toEqual(['calendar', 'week', '--account', 'work']);
    });

    it('should build args for calendar_create', () => {
      const args = buildGogArgs('calendar_create', {
        account: 'primary',
        title: 'Meeting',
        start: '2026-02-16T10:00:00',
        end: '2026-02-16T11:00:00',
        description: 'Team standup',
      });
      expect(args).toEqual([
        'calendar', 'create', '--account', 'primary',
        '--title', 'Meeting',
        '--start', '2026-02-16T10:00:00',
        '--end', '2026-02-16T11:00:00',
        '--description', 'Team standup',
      ]);
    });

    it('should throw for unknown action', () => {
      expect(() => buildGogArgs('unknown_action', {})).toThrow('Unknown action');
    });
  });

  describe('parseGogOutput', () => {
    it('should parse JSON output', () => {
      const result = parseGogOutput('{"messages": [{"id": "1", "subject": "Hello"}]}');
      expect(result).toEqual({ messages: [{ id: '1', subject: 'Hello' }] });
    });

    it('should wrap plain text in output field', () => {
      const result = parseGogOutput('Email sent successfully');
      expect(result).toEqual({ output: 'Email sent successfully' });
    });

    it('should handle empty output', () => {
      const result = parseGogOutput('');
      expect(result).toEqual({ output: '' });
    });
  });
});
