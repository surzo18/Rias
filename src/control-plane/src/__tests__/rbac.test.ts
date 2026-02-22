import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { RBACEngine } from '../rbac.js';
import type { RoleBinding } from '../types.js';

function makeEngine(bindings: RoleBinding[]): RBACEngine {
  return new RBACEngine(bindings);
}

describe('RBACEngine', () => {
  describe('canSubmitJob', () => {
    it('owner can submit a job to any project', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'owner' }]);
      assert.equal(engine.canSubmitJob('u1', 'proj-x'), true);
    });

    it('project-maintainer can submit to assigned project', () => {
      const engine = makeEngine([
        { actor_id: 'u1', role: 'project-maintainer', project_ids: ['proj-1'] },
      ]);
      assert.equal(engine.canSubmitJob('u1', 'proj-1'), true);
    });

    it('project-maintainer cannot submit to unassigned project', () => {
      const engine = makeEngine([
        { actor_id: 'u1', role: 'project-maintainer', project_ids: ['proj-1'] },
      ]);
      assert.equal(engine.canSubmitJob('u1', 'proj-2'), false);
    });

    it('viewer cannot submit a job', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'viewer' }]);
      assert.equal(engine.canSubmitJob('u1', 'proj-1'), false);
    });

    it('unknown actor cannot submit a job', () => {
      const engine = makeEngine([]);
      assert.equal(engine.canSubmitJob('unknown', 'proj-1'), false);
    });
  });

  describe('canApproveTierC', () => {
    it('owner can approve Tier C jobs', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'owner' }]);
      assert.equal(engine.canApproveTierC('u1', 'proj-1'), true);
    });

    it('infra-approver can approve Tier C infra jobs', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'infra-approver' }]);
      assert.equal(engine.canApproveTierC('u1', 'proj-1'), true);
    });

    it('project-maintainer cannot directly approve Tier C', () => {
      const engine = makeEngine([
        { actor_id: 'u1', role: 'project-maintainer', project_ids: ['proj-1'] },
      ]);
      assert.equal(engine.canApproveTierC('u1', 'proj-1'), false);
    });

    it('viewer cannot approve Tier C', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'viewer' }]);
      assert.equal(engine.canApproveTierC('u1', 'proj-1'), false);
    });
  });

  describe('getRoleFor', () => {
    it('returns the role for a known actor', () => {
      const engine = makeEngine([{ actor_id: 'u1', role: 'admin' }]);
      assert.equal(engine.getRoleFor('u1'), 'admin');
    });

    it('returns null for unknown actor', () => {
      const engine = makeEngine([]);
      assert.equal(engine.getRoleFor('unknown'), null);
    });
  });
});
