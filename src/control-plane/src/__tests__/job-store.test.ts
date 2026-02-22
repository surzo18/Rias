import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { JobStore } from '../job-store.js';
import type { JobRecord } from '../types.js';

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    job_id: 'job-1',
    idempotency_key: 'idem-1',
    request_id: 'req-1',
    trace_id: 'trace-1',
    actor_id: 'user-1',
    project_id: 'proj-1',
    intent: 'query.list_files',
    risk_tier: 'A',
    requires_human_approval: false,
    constraints: { data_classification: 'internal' },
    payload: { path: '/home' },
    status: 'queued',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('JobStore', () => {
  let store: JobStore;

  beforeEach(() => {
    store = new JobStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('should insert and retrieve a job', () => {
    const job = makeJob();
    store.insert(job);
    const found = store.findById(job.job_id);
    assert.equal(found?.job_id, job.job_id);
    assert.equal(found?.intent, 'query.list_files');
    assert.deepEqual(found?.constraints, { data_classification: 'internal' });
    assert.deepEqual(found?.payload, { path: '/home' });
  });

  it('should enforce idempotency_key uniqueness', () => {
    store.insert(makeJob({ job_id: 'job-1', idempotency_key: 'idem-1' }));
    assert.throws(() => {
      store.insert(makeJob({ job_id: 'job-2', idempotency_key: 'idem-1' }));
    });
  });

  it('should update job status', () => {
    store.insert(makeJob());
    store.updateStatus('job-1', 'running');
    const found = store.findById('job-1');
    assert.equal(found?.status, 'running');
  });

  it('should return null for unknown job_id', () => {
    assert.equal(store.findById('nonexistent'), null);
  });

  it('should find existing job by idempotency_key', () => {
    store.insert(makeJob({ idempotency_key: 'idem-xyz' }));
    const found = store.findByIdempotencyKey('idem-xyz');
    assert.ok(found !== null);
    assert.equal(found.idempotency_key, 'idem-xyz');
  });
});
