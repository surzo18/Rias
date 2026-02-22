import type Database from 'better-sqlite3';

export interface FoodRow {
  id: number;
  date: string;
  entry: string;
  calories_est: number | null;
}

export function queryFood(
  db: Database.Database,
  opts: { date?: string; limit?: number },
): FoodRow[] {
  let sql = 'SELECT * FROM food_log';
  const params: unknown[] = [];

  if (opts.date) {
    sql += ' WHERE date = ?';
    params.push(opts.date);
  }

  sql += ' ORDER BY id DESC';

  if (opts.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  return db.prepare(sql).all(...params) as FoodRow[];
}

export interface ExerciseRow {
  id: number;
  date: string;
  entry: string;
  duration_min: number | null;
}

export function queryExercise(
  db: Database.Database,
  opts: { date?: string; activity?: string; limit?: number },
): ExerciseRow[] {
  let sql = 'SELECT * FROM exercise_log';
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.date) {
    conditions.push('date = ?');
    params.push(opts.date);
  }
  if (opts.activity) {
    conditions.push('entry LIKE ?');
    params.push(`%${opts.activity}%`);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY id DESC';

  if (opts.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  return db.prepare(sql).all(...params) as ExerciseRow[];
}

export interface EpisodeInput {
  timestamp: string;
  source: string;
  content: string;
}

export interface EpisodeRow {
  id: number;
  timestamp: string;
  source: string;
  content: string;
}

export function insertEpisode(db: Database.Database, episode: EpisodeInput): number {
  const result = db.prepare(
    'INSERT INTO episodes (timestamp, source, content) VALUES (?, ?, ?)',
  ).run(episode.timestamp, episode.source, episode.content);

  const id = result.lastInsertRowid as number;
  db.prepare('INSERT INTO episodes_fts (rowid, content) VALUES (?, ?)').run(id, episode.content);

  return id;
}

export function searchEpisodes(db: Database.Database, query: string, limit: number = 20): EpisodeRow[] {
  return db.prepare(`
    SELECT e.* FROM episodes e
    JOIN episodes_fts fts ON e.id = fts.rowid
    WHERE episodes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as EpisodeRow[];
}

export interface SummaryInput {
  date: string;
  type: string;
  content: string;
}

export interface SummaryRow {
  id: number;
  date: string;
  type: string;
  content: string;
}

export function insertSummary(db: Database.Database, summary: SummaryInput): number {
  const result = db.prepare(
    'INSERT INTO summaries (date, type, content) VALUES (?, ?, ?)',
  ).run(summary.date, summary.type, summary.content);

  const id = result.lastInsertRowid as number;
  db.prepare('INSERT INTO summaries_fts (rowid, content) VALUES (?, ?)').run(id, summary.content);

  return id;
}

export function searchSummaries(db: Database.Database, query: string, limit: number = 20): SummaryRow[] {
  return db.prepare(`
    SELECT s.* FROM summaries s
    JOIN summaries_fts fts ON s.id = fts.rowid
    WHERE summaries_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as SummaryRow[];
}

export interface Fact {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

export interface FactRow extends Fact {
  id: number;
  created_at: string;
  updated_at: string;
}

const FACT_PATTERNS: Array<{
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => Fact;
}> = [
  {
    pattern: /(?:my name is|i'?m called)\s+(\w+)/i,
    extract: (m) => ({ category: 'identity', key: 'name', value: m[1], confidence: 0.95 }),
  },
  {
    pattern: /i live in\s+([A-Z][\w\s]+)/i,
    extract: (m) => ({ category: 'identity', key: 'location', value: m[1].trim(), confidence: 0.9 }),
  },
  {
    pattern: /(?:i prefer|i like|i always use|prefers?|likes?)\s+(.+?)(?:\s+(?:in|for|when|$))/i,
    extract: (m) => ({ category: 'preference', key: 'preference', value: m[1].trim(), confidence: 0.7 }),
  },
];

export function extractFacts(text: string): Fact[] {
  const facts: Fact[] = [];

  for (const { pattern, extract } of FACT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      facts.push(extract(match));
    }
  }

  return facts;
}

export function insertFact(db: Database.Database, fact: Fact): void {
  db.prepare(`
    INSERT INTO facts (category, key, value, confidence)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(category, key)
    DO UPDATE SET value = excluded.value, confidence = excluded.confidence, updated_at = datetime('now')
  `).run(fact.category, fact.key, fact.value, fact.confidence);
}

export function queryFacts(
  db: Database.Database,
  opts: { category?: string; key?: string },
): FactRow[] {
  let sql = 'SELECT * FROM facts';
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }
  if (opts.key) {
    conditions.push('key = ?');
    params.push(opts.key);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  return db.prepare(sql).all(...params) as FactRow[];
}
