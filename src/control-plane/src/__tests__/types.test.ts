import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { JobRecord, PolicyDecision, RoleBinding } from '../types.js';

describe('types', () => {
  it('should allow constructing a valid JobRecord', () => {
    const job: JobRecord = {
      job_id: 'abc-123',
      idempotency_key: 'idem-1',
      request_id: 'req-1',
      trace_id: 'trace-1',
      actor_id: 'user-1',
      project_id: 'proj-1',
      intent: 'query.list_files',
      risk_tier: 'A',
      requires_human_approval: false,
      constraints: { data_classification: 'internal' },
      payload: {},
      status: 'queued',
      created_at: new Date().toISOString(),
    };
    assert.equal(job.risk_tier, 'A');
  });

  it('should allow constructing a PolicyDecision', () => {
    const decision: PolicyDecision = {
      risk_tier: 'C',
      requires_human_approval: true,
      reason: 'infra change requires approval',
    };
    assert.equal(decision.requires_human_approval, true);
  });

  it('should allow constructing a RoleBinding', () => {
    const binding: RoleBinding = {
      actor_id: 'user-1',
      role: 'project-maintainer',
      project_ids: ['proj-1'],
    };
    assert.equal(binding.role, 'project-maintainer');
  });
});
