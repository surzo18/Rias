import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { classifyIntent } from '../policy-engine.js';

describe('policy-engine', () => {
  describe('classifyIntent', () => {
    it('should classify query.* intents as Tier A', () => {
      const result = classifyIntent('query.list_files');
      assert.equal(result.risk_tier, 'A');
      assert.equal(result.requires_human_approval, false);
    });

    it('should classify read.* intents as Tier A', () => {
      const result = classifyIntent('read.file_contents');
      assert.equal(result.risk_tier, 'A');
    });

    it('should classify write.* intents as Tier B', () => {
      const result = classifyIntent('write.update_config');
      assert.equal(result.risk_tier, 'B');
      assert.equal(result.requires_human_approval, false);
    });

    it('should classify infra.* intents as Tier C with human approval', () => {
      const result = classifyIntent('infra.create_db');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should classify schema.* intents as Tier C', () => {
      const result = classifyIntent('schema.alter_table');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should classify delete.* intents as Tier C', () => {
      const result = classifyIntent('delete.drop_table');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should classify deploy.* intents as Tier C', () => {
      const result = classifyIntent('deploy.production');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should classify security.* intents as Tier C', () => {
      const result = classifyIntent('security.rotate_key');
      assert.equal(result.risk_tier, 'C');
      assert.equal(result.requires_human_approval, true);
    });

    it('should default unknown intents to Tier B', () => {
      const result = classifyIntent('unknown.action');
      assert.equal(result.risk_tier, 'B');
    });

    it('should include a reason in every decision', () => {
      const result = classifyIntent('query.list_files');
      assert.ok(result.reason.length > 0);
    });
  });
});
