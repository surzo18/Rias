import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initMemorySchema } from '../memory-schema.js';
import { syncFood, syncExercise } from '../sync.js';
import {
  queryFood,
  queryExercise,
  insertEpisode,
  searchEpisodes,
  insertSummary,
  searchSummaries,
  extractFacts,
  insertFact,
  queryFacts,
} from '../query.js';

describe('query', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initMemorySchema(db);
  });

  describe('queryFood', () => {
    beforeEach(() => {
      syncFood(db, `### 2026-02-14\n- Breakfast: Oatmeal (~350 kcal)\n- Lunch: Salad (~400 kcal)\n### 2026-02-15\n- Dinner: Pizza (~800 kcal)\n`);
    });

    it('should return entries for a specific date', () => {
      const rows = queryFood(db, { date: '2026-02-14' });
      expect(rows.length).toBe(2);
    });

    it('should return all entries when no filter', () => {
      const rows = queryFood(db, {});
      expect(rows.length).toBe(3);
    });

    it('should respect limit', () => {
      const rows = queryFood(db, { limit: 1 });
      expect(rows.length).toBe(1);
    });
  });

  describe('queryExercise', () => {
    beforeEach(() => {
      syncExercise(db, `### 2026-02-14\n- Running: 30 min\n- Push-ups: 3 sets\n### 2026-02-15\n- Running: 45 min\n`);
    });

    it('should filter by activity keyword', () => {
      const rows = queryExercise(db, { activity: 'Running' });
      expect(rows.length).toBe(2);
    });

    it('should filter by date', () => {
      const rows = queryExercise(db, { date: '2026-02-14' });
      expect(rows.length).toBe(2);
    });
  });

  describe('episodes and FTS', () => {
    it('should insert and search episodes', () => {
      insertEpisode(db, {
        timestamp: '2026-02-14T10:00:00Z',
        source: 'telegram',
        content: 'Adrian asked about the weather in Bratislava',
      });
      insertEpisode(db, {
        timestamp: '2026-02-14T11:00:00Z',
        source: 'telegram',
        content: 'Adrian requested a stock price check for AAPL',
      });

      const results = searchEpisodes(db, 'weather Bratislava');
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('weather');
    });

    it('should return empty for no matches', () => {
      insertEpisode(db, {
        timestamp: '2026-02-14T10:00:00Z',
        source: 'telegram',
        content: 'Hello world',
      });
      const results = searchEpisodes(db, 'nonexistent query term xyz');
      expect(results.length).toBe(0);
    });
  });

  describe('summaries and FTS', () => {
    it('should insert and search summaries', () => {
      insertSummary(db, {
        date: '2026-02-14',
        type: 'daily',
        content: 'Adrian had a productive day, completed 3 tasks and went for a run.',
      });

      const results = searchSummaries(db, 'productive run');
      expect(results.length).toBe(1);
    });
  });

  describe('extractFacts', () => {
    it('should extract preference facts', () => {
      const facts = extractFacts('Adrian prefers dark mode in all apps');
      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0].category).toBe('preference');
    });

    it('should extract name/identity facts', () => {
      const facts = extractFacts('My name is Adrian and I live in Bratislava');
      expect(facts.length).toBeGreaterThan(0);
      const nameFact = facts.find((f) => f.key === 'name');
      expect(nameFact).toBeTruthy();
    });

    it('should extract location facts', () => {
      const facts = extractFacts('I live in Bratislava');
      const locationFact = facts.find((f) => f.key === 'location');
      expect(locationFact).toBeTruthy();
      expect(locationFact!.value).toContain('Bratislava');
    });

    it('should return empty for irrelevant text', () => {
      const facts = extractFacts('The quick brown fox jumps over the lazy dog');
      expect(facts.length).toBe(0);
    });
  });

  describe('facts CRUD', () => {
    it('should insert and query facts', () => {
      insertFact(db, { category: 'preference', key: 'theme', value: 'dark', confidence: 0.9 });
      insertFact(db, { category: 'preference', key: 'language', value: 'Slovak', confidence: 0.95 });

      const results = queryFacts(db, { category: 'preference' });
      expect(results.length).toBe(2);
    });

    it('should update existing fact on re-insert with same key', () => {
      insertFact(db, { category: 'preference', key: 'theme', value: 'light', confidence: 0.7 });
      insertFact(db, { category: 'preference', key: 'theme', value: 'dark', confidence: 0.9 });

      const results = queryFacts(db, { key: 'theme' });
      expect(results.length).toBe(1);
      expect(results[0].value).toBe('dark');
      expect(results[0].confidence).toBe(0.9);
    });

    it('should query by key', () => {
      insertFact(db, { category: 'identity', key: 'name', value: 'Adrian', confidence: 1.0 });
      const results = queryFacts(db, { key: 'name' });
      expect(results.length).toBe(1);
      expect(results[0].value).toBe('Adrian');
    });
  });
});
