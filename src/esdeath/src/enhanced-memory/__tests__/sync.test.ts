import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initMemorySchema } from '../memory-schema.js';
import { syncFood, syncExercise, syncHabits } from '../sync.js';

describe('sync', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initMemorySchema(db);
  });

  describe('syncFood', () => {
    const foodMd = `# Food Log

## Format
Meals logged under date headers.

### 2026-02-14
- Breakfast: Oatmeal with banana (~350 kcal)
- Lunch: Chicken salad wrap (~500 kcal)
- Dinner: Pasta with tomato sauce (~700 kcal)

### 2026-02-15
- Breakfast: Eggs and toast (~400 kcal)
- Snack: Apple (~80 kcal)
`;

    it('should parse food entries from markdown', () => {
      const count = syncFood(db, foodMd);
      expect(count).toBe(5);
    });

    it('should store entries with correct dates', () => {
      syncFood(db, foodMd);
      const rows = db.prepare('SELECT * FROM food_log WHERE date = ?').all('2026-02-14') as any[];
      expect(rows.length).toBe(3);
      expect(rows[0].entry).toContain('Oatmeal');
    });

    it('should extract calorie estimates', () => {
      syncFood(db, foodMd);
      const rows = db.prepare('SELECT * FROM food_log WHERE date = ?').all('2026-02-14') as any[];
      expect(rows[0].calories_est).toBe(350);
      expect(rows[1].calories_est).toBe(500);
    });

    it('should deduplicate on re-sync', () => {
      syncFood(db, foodMd);
      syncFood(db, foodMd);
      const total = (db.prepare('SELECT COUNT(*) as cnt FROM food_log').get() as any).cnt;
      expect(total).toBe(5);
    });

    it('should handle entries without calorie estimate', () => {
      const md = `### 2026-02-15\n- Lunch: Mystery soup\n`;
      syncFood(db, md);
      const rows = db.prepare('SELECT * FROM food_log').all() as any[];
      expect(rows.length).toBe(1);
      expect(rows[0].calories_est).toBeNull();
    });
  });

  describe('syncExercise', () => {
    const exerciseMd = `# Exercise Log

### 2026-02-14
- Running: 30 min, 5km
- Push-ups: 3 sets x 15 reps

### 2026-02-15
- Swimming: 45 min
`;

    it('should parse exercise entries from markdown', () => {
      const count = syncExercise(db, exerciseMd);
      expect(count).toBe(3);
    });

    it('should store entries with correct dates', () => {
      syncExercise(db, exerciseMd);
      const rows = db.prepare('SELECT * FROM exercise_log WHERE date = ?').all('2026-02-14') as any[];
      expect(rows.length).toBe(2);
      expect(rows[0].entry).toContain('Running');
    });

    it('should extract duration when present', () => {
      syncExercise(db, exerciseMd);
      const rows = db.prepare('SELECT * FROM exercise_log WHERE date = ?').all('2026-02-14') as any[];
      expect(rows[0].duration_min).toBe(30);
    });

    it('should deduplicate on re-sync', () => {
      syncExercise(db, exerciseMd);
      syncExercise(db, exerciseMd);
      const total = (db.prepare('SELECT COUNT(*) as cnt FROM exercise_log').get() as any).cnt;
      expect(total).toBe(3);
    });
  });

  describe('syncHabits', () => {
    const habitsMd = `# Habit Tracker

## Active Habits

| Habit | Target | Streak |
|-------|--------|--------|
| Meditation | Daily | 5 |
| Reading | Daily | 12 |
| Exercise | 3x/week | 2 |

## 2026-02-14
- [x] Meditation
- [x] Reading
- [ ] Exercise

## 2026-02-15
- [x] Meditation
- [ ] Reading
- [x] Exercise
`;

    it('should parse habit definitions', () => {
      syncHabits(db, habitsMd);
      const habits = db.prepare('SELECT * FROM habits WHERE type = ?').all('definition') as any[];
      expect(habits.length).toBe(3);
    });

    it('should parse daily check entries', () => {
      syncHabits(db, habitsMd);
      const checks = db.prepare('SELECT * FROM habits WHERE type = ?').all('check') as any[];
      expect(checks.length).toBe(6);
    });

    it('should track completion status', () => {
      syncHabits(db, habitsMd);
      const checks = db.prepare(
        "SELECT * FROM habits WHERE type = 'check' AND date = ? ORDER BY name",
      ).all('2026-02-14') as any[];
      expect(checks.length).toBe(3);
      const exercise = checks.find((c: any) => c.name === 'Exercise');
      expect(exercise.completed).toBe(0);
      const meditation = checks.find((c: any) => c.name === 'Meditation');
      expect(meditation.completed).toBe(1);
    });

    it('should deduplicate on re-sync', () => {
      syncHabits(db, habitsMd);
      syncHabits(db, habitsMd);
      const total = (db.prepare('SELECT COUNT(*) as cnt FROM habits').get() as any).cnt;
      expect(total).toBe(9); // 3 definitions + 6 checks
    });
  });
});
