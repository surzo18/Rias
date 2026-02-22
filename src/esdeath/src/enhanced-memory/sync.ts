import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

function hashEntry(date: string, entry: string): string {
  return crypto.createHash('sha256').update(`${date}:${entry}`).digest('hex').slice(0, 16);
}

function extractCalories(text: string): number | null {
  const match = text.match(/~(\d+)\s*kcal/i);
  return match ? parseInt(match[1], 10) : null;
}

function extractDuration(text: string): number | null {
  const match = text.match(/(\d+)\s*min/i);
  return match ? parseInt(match[1], 10) : null;
}

interface DateEntries {
  date: string;
  entries: string[];
}

function parseDateSections(markdown: string): DateEntries[] {
  const results: DateEntries[] = [];
  let currentDate: string | null = null;
  let currentEntries: string[] = [];

  for (const line of markdown.split('\n')) {
    const dateMatch = line.match(/^###\s+(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      if (currentDate && currentEntries.length > 0) {
        results.push({ date: currentDate, entries: currentEntries });
      }
      currentDate = dateMatch[1];
      currentEntries = [];
      continue;
    }

    const entryMatch = line.match(/^-\s+(.+)/);
    if (entryMatch && currentDate) {
      currentEntries.push(entryMatch[1].trim());
    }
  }

  if (currentDate && currentEntries.length > 0) {
    results.push({ date: currentDate, entries: currentEntries });
  }

  return results;
}

export function syncFood(db: Database.Database, markdown: string): number {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO food_log (date, entry, calories_est, hash) VALUES (?, ?, ?, ?)',
  );

  let count = 0;
  const sections = parseDateSections(markdown);

  const tx = db.transaction(() => {
    for (const { date, entries } of sections) {
      for (const entry of entries) {
        const hash = hashEntry(date, entry);
        const calories = extractCalories(entry);
        const result = insert.run(date, entry, calories, hash);
        if (result.changes > 0) count++;
      }
    }
  });
  tx();

  return count;
}

export function syncExercise(db: Database.Database, markdown: string): number {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO exercise_log (date, entry, duration_min, hash) VALUES (?, ?, ?, ?)',
  );

  let count = 0;
  const sections = parseDateSections(markdown);

  const tx = db.transaction(() => {
    for (const { date, entries } of sections) {
      for (const entry of entries) {
        const hash = hashEntry(date, entry);
        const duration = extractDuration(entry);
        const result = insert.run(date, entry, duration, hash);
        if (result.changes > 0) count++;
      }
    }
  });
  tx();

  return count;
}

interface HabitDefinition {
  name: string;
  target: string;
  streak: number;
}

function parseHabitTable(markdown: string): HabitDefinition[] {
  const results: HabitDefinition[] = [];
  const lines = markdown.split('\n');

  let inTable = false;
  for (const line of lines) {
    if (line.includes('| Habit') && line.includes('| Target')) {
      inTable = true;
      continue;
    }
    if (inTable && line.match(/^\|[-\s|]+\|$/)) continue; // separator row
    if (inTable && line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        results.push({
          name: cells[0],
          target: cells[1],
          streak: parseInt(cells[2], 10) || 0,
        });
      }
    } else if (inTable) {
      inTable = false;
    }
  }

  return results;
}

interface HabitCheck {
  date: string;
  name: string;
  completed: boolean;
}

function parseHabitChecks(markdown: string): HabitCheck[] {
  const results: HabitCheck[] = [];
  let currentDate: string | null = null;

  for (const line of markdown.split('\n')) {
    const dateMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    if (currentDate) {
      const checkMatch = line.match(/^-\s+\[(x| )\]\s+(.+)/i);
      if (checkMatch) {
        results.push({
          date: currentDate,
          name: checkMatch[2].trim(),
          completed: checkMatch[1].toLowerCase() === 'x',
        });
      }
    }
  }

  return results;
}

export function syncHabits(db: Database.Database, markdown: string): void {
  const insertDef = db.prepare(
    'INSERT OR IGNORE INTO habits (type, name, date, target, streak, completed, hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertCheck = db.prepare(
    'INSERT OR IGNORE INTO habits (type, name, date, target, streak, completed, hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  const tx = db.transaction(() => {
    const definitions = parseHabitTable(markdown);
    for (const def of definitions) {
      const hash = hashEntry('def', `${def.name}:${def.target}:${def.streak}`);
      insertDef.run('definition', def.name, null, def.target, def.streak, null, hash);
    }

    const checks = parseHabitChecks(markdown);
    for (const check of checks) {
      const hash = hashEntry(check.date, `check:${check.name}`);
      insertCheck.run('check', check.name, check.date, null, null, check.completed ? 1 : 0, hash);
    }
  });
  tx();
}
