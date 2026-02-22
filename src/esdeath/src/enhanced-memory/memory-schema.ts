import type Database from 'better-sqlite3';

export function initMemorySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, key)
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS food_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      entry TEXT NOT NULL,
      calories_est INTEGER,
      hash TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS exercise_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      entry TEXT NOT NULL,
      duration_min INTEGER,
      hash TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      date TEXT,
      target TEXT,
      streak INTEGER,
      completed INTEGER,
      hash TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(content, content_rowid='id');
    CREATE VIRTUAL TABLE IF NOT EXISTS summaries_fts USING fts5(content, content_rowid='id');

    CREATE INDEX IF NOT EXISTS idx_food_log_date ON food_log(date);
    CREATE INDEX IF NOT EXISTS idx_exercise_log_date ON exercise_log(date);
    CREATE INDEX IF NOT EXISTS idx_habits_date ON habits(date);
    CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
    CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
  `);
}
