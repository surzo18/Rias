import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { initSchema, insertAuditLog, queryAuditLogs } from '../../src/audit-db/schema.js';
import { sanitize } from '../../src/audit-db/sanitize.js';
import { loadTierConfig, classifyTier, type TierConfig } from '../../src/approval/tier.js';
import { createApproval, getApproval, resolveApproval } from '../../src/approval/state-machine.js';
import { isAllowed, getDef } from '../../src/shell-sandbox/allowlist.js';
import { validateArgs } from '../../src/shell-sandbox/validator.js';

/**
 * E2E tests for the full request lifecycle:
 *   Incoming request → Tier classification → Approval (if needed) → Execution → Audit log
 *
 * These tests wire all core modules together in-process using an in-memory SQLite DB,
 * simulating what happens when a request flows through the platform.
 */

const RAW_TIER_CONFIG = {
  tiers: {
    safe: { actions: ['shell:hostname', 'shell:whoami'] },
    notice: { actions: ['shell:systeminfo', 'shell:dir', 'shell:ping'] },
    dangerous: { actions: ['shell:del', 'shell:mkdir', 'shell:copy', 'shell:move', 'email:send_email', 'calendar:calendar_create'] },
    forbidden: { actions: ['shell:powershell', 'shell:rm', 'shell:format'] },
  },
  defaults: { unknown_action: 'dangerous' },
};

describe('E2E: Full request flow', () => {
  let db: Database.Database;
  let tierConfig: TierConfig;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    tierConfig = loadTierConfig(RAW_TIER_CONFIG);
  });

  describe('Path 1: Safe request → auto-execute → audit logged', () => {
    it('should execute safe command without approval and log to audit', () => {
      const requestId = uuidv4();
      const action = 'shell:hostname';
      const params = { command: 'hostname', args: [] };

      // 1. Classify tier
      const tier = classifyTier(action, tierConfig);
      expect(tier).toBe('safe');

      // 2. No approval needed for safe tier
      // (skip approval creation entirely)

      // 3. Validate command is in allowlist
      expect(isAllowed('hostname')).toBe(true);
      const def = getDef('hostname')!;
      expect(def.tier).toBe('safe');

      // 4. Simulate execution (in real flow, execSync runs)
      const executionResult = 'CLAWDBOT-PC';
      const durationMs = 12;

      // 5. Log to audit
      const sanitizedParams = sanitize(params as Record<string, unknown>);
      insertAuditLog(db, {
        id: requestId,
        timestamp: new Date().toISOString(),
        source: 'user',
        action,
        tool: 'shell-sandbox',
        tier,
        params: JSON.stringify(sanitizedParams),
        state: 'success',
        result_summary: executionResult,
        error: null,
        duration_ms: durationMs,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: null,
      });

      // 6. Verify audit log entry
      const logs = queryAuditLogs(db, { action });
      expect(logs.length).toBe(1);
      expect(logs[0].tier).toBe('safe');
      expect(logs[0].state).toBe('success');
      expect(logs[0].approval_id).toBeNull();
      expect(logs[0].result_summary).toBe('CLAWDBOT-PC');
    });
  });

  describe('Path 2: Dangerous request → approval → execute → audit logged', () => {
    it('should create approval, wait for resolution, execute, and log result', () => {
      const requestId = uuidv4();
      const action = 'shell:del';
      const params = { command: 'del', args: ['/mnt/downloads/temp.txt'] };

      // 1. Classify tier
      const tier = classifyTier(action, tierConfig);
      expect(tier).toBe('dangerous');

      // 2. Create approval request
      const approvalId = createApproval(db, {
        action,
        tier,
        params: JSON.stringify(params),
        reason: 'User requested file deletion',
      });
      expect(approvalId).toBeTruthy();

      // 3. Verify approval is pending
      const pending = getApproval(db, approvalId)!;
      expect(pending.state).toBe('pending');

      // 4. Simulate user approval via Telegram
      resolveApproval(db, approvalId, 'approved', 'telegram:adrian');
      const approved = getApproval(db, approvalId)!;
      expect(approved.state).toBe('approved');

      // 5. Transition to executing
      resolveApproval(db, approvalId, 'executing', 'system');

      // 6. Validate command
      expect(isAllowed('del')).toBe(true);
      const def = getDef('del')!;
      expect(def.tier).toBe('dangerous');

      // 7. Simulate successful execution
      resolveApproval(db, approvalId, 'success', 'system');
      const final = getApproval(db, approvalId)!;
      expect(final.state).toBe('success');

      // 8. Log to audit with approval reference
      const sanitizedParams = sanitize(params as Record<string, unknown>);
      insertAuditLog(db, {
        id: requestId,
        timestamp: new Date().toISOString(),
        source: 'user',
        action,
        tool: 'shell-sandbox',
        tier,
        params: JSON.stringify(sanitizedParams),
        state: 'success',
        result_summary: 'File deleted',
        error: null,
        duration_ms: 85,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: approvalId,
      });

      // 9. Verify audit log links to approval
      const logs = queryAuditLogs(db, { action });
      expect(logs.length).toBe(1);
      expect(logs[0].tier).toBe('dangerous');
      expect(logs[0].state).toBe('success');
      expect(logs[0].approval_id).toBe(approvalId);
    });

    it('should handle rejected approval', () => {
      const requestId = uuidv4();
      const action = 'shell:del';

      // 1. Create approval
      const approvalId = createApproval(db, {
        action,
        tier: 'dangerous',
        params: '{"command":"del","args":["/mnt/downloads/important.doc"]}',
        reason: 'Delete request',
      });

      // 2. User rejects
      resolveApproval(db, approvalId, 'rejected', 'telegram:adrian');
      const rejected = getApproval(db, approvalId)!;
      expect(rejected.state).toBe('rejected');

      // 3. Log blocked action
      insertAuditLog(db, {
        id: requestId,
        timestamp: new Date().toISOString(),
        source: 'user',
        action,
        tool: 'shell-sandbox',
        tier: 'dangerous',
        params: '{}',
        state: 'blocked',
        result_summary: 'Rejected by user',
        error: null,
        duration_ms: 0,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: approvalId,
      });

      // 4. Verify
      const logs = queryAuditLogs(db, { action });
      expect(logs[0].state).toBe('blocked');
    });
  });

  describe('Path 3: Forbidden request → blocked → security alert logged', () => {
    it('should block forbidden command and log security alert', () => {
      const requestId = uuidv4();
      const action = 'shell:powershell';
      const params = { command: 'powershell', args: ['-c', 'Get-Process'] };

      // 1. Classify tier
      const tier = classifyTier(action, tierConfig);
      expect(tier).toBe('forbidden');

      // 2. No approval, no execution — immediately blocked
      // Optionally validate that command is also not in allowlist
      expect(isAllowed('powershell')).toBe(false);

      // 3. Log security alert to audit
      insertAuditLog(db, {
        id: requestId,
        timestamp: new Date().toISOString(),
        source: 'user',
        action,
        tool: 'shell-sandbox',
        tier,
        params: JSON.stringify(sanitize(params as Record<string, unknown>)),
        state: 'blocked',
        result_summary: 'Forbidden action — automatically blocked',
        error: null,
        duration_ms: 0,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: null,
      });

      // 4. Verify in audit log
      const logs = queryAuditLogs(db, { tier: 'forbidden' });
      expect(logs.length).toBe(1);
      expect(logs[0].state).toBe('blocked');
      expect(logs[0].tier).toBe('forbidden');

      // 5. Verify in security_events view
      const securityEvents = db.prepare('SELECT * FROM security_events').all() as any[];
      expect(securityEvents.length).toBe(1);
      expect(securityEvents[0].action).toBe('shell:powershell');
    });

    it('should block injection attempts even for allowed commands', () => {
      const requestId = uuidv4();
      const action = 'shell:dir';

      // 1. Tier is notice (dir is allowed)
      const tier = classifyTier(action, tierConfig);
      expect(tier).toBe('notice');
      expect(isAllowed('dir')).toBe(true);

      // 2. But args contain injection
      const maliciousArgs = ['/mnt/documents', '|', 'cat', '/etc/shadow'];
      expect(() => validateArgs(maliciousArgs)).toThrow('blocked pattern');

      // 3. Log the blocked attempt
      insertAuditLog(db, {
        id: requestId,
        timestamp: new Date().toISOString(),
        source: 'user',
        action,
        tool: 'shell-sandbox',
        tier,
        params: JSON.stringify({ command: 'dir', args: ['[REDACTED:injection]'] }),
        state: 'blocked',
        result_summary: 'Injection attempt detected',
        error: 'Argument contains blocked pattern',
        duration_ms: 1,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: null,
      });

      // 4. Verify
      const logs = queryAuditLogs(db, { action });
      expect(logs[0].state).toBe('blocked');
      expect(logs[0].error).toContain('blocked pattern');
    });
  });

  describe('Cross-cutting: Param sanitization in audit', () => {
    it('should redact sensitive fields before audit storage', () => {
      const requestId = uuidv4();
      const sensitiveParams = {
        command: 'dir',
        token: 'ghp_ABC123456789012345678901234567890123',
        password: 'super-secret',
        path: '/mnt/documents',
      };

      const sanitized = sanitize(sensitiveParams);
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.command).toBe('dir');
      expect(sanitized.path).toBe('/mnt/documents');

      insertAuditLog(db, {
        id: requestId,
        timestamp: new Date().toISOString(),
        source: 'system',
        action: 'shell:dir',
        tool: 'shell-sandbox',
        tier: 'notice',
        params: JSON.stringify(sanitized),
        state: 'success',
        result_summary: 'dir listing',
        error: null,
        duration_ms: 50,
        llm_provider: null,
        tokens_used: 0,
        estimated_cost_usd: 0,
        approval_id: null,
      });

      const logs = queryAuditLogs(db, { action: 'shell:dir' });
      const storedParams = JSON.parse(logs[0].params);
      expect(storedParams.token).toBe('[REDACTED]');
      expect(storedParams.password).toBe('[REDACTED]');
      expect(storedParams.path).toBe('/mnt/documents');
    });
  });
});
