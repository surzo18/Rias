import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initMemorySchema } from '../memory-schema.js';

describe('memory-schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initMemorySchema(db);
  });

  it('should create facts table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facts'").get();
    expect(info).toBeTruthy();
  });

  it('should create episodes table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='episodes'").get();
    expect(info).toBeTruthy();
  });

  it('should create food_log table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='food_log'").get();
    expect(info).toBeTruthy();
  });

  it('should create exercise_log table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='exercise_log'").get();
    expect(info).toBeTruthy();
  });

  it('should create habits table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='habits'").get();
    expect(info).toBeTruthy();
  });

  it('should create summaries table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='summaries'").get();
    expect(info).toBeTruthy();
  });

  it('should create FTS index for episodes', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='episodes_fts'").get();
    expect(info).toBeTruthy();
  });

  it('should create FTS index for summaries', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='summaries_fts'").get();
    expect(info).toBeTruthy();
  });

  it('should be idempotent (safe to call twice)', () => {
    expect(() => initMemorySchema(db)).not.toThrow();
  });
});
