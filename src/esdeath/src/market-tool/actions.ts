import type Database from 'better-sqlite3';
import type { Tier } from '../shared/types.js';

export type MarketAction = 'quote' | 'history' | 'watchlist' | 'news' | 'alert_set' | 'alert_list';

interface ActionDef {
  tier: Tier;
  requiredParams: string[];
  hasApiCall: boolean;
}

export const ACTIONS: Record<MarketAction, ActionDef> = {
  quote:      { tier: 'notice', requiredParams: ['symbol'], hasApiCall: true },
  history:    { tier: 'notice', requiredParams: ['symbol'], hasApiCall: true },
  news:       { tier: 'notice', requiredParams: ['tickers'], hasApiCall: true },
  watchlist:  { tier: 'notice', requiredParams: [], hasApiCall: false },
  alert_set:  { tier: 'notice', requiredParams: ['symbol', 'condition', 'price'], hasApiCall: false },
  alert_list: { tier: 'notice', requiredParams: [], hasApiCall: false },
};

const AV_BASE = 'https://www.alphavantage.co/query';

export function getActionTier(action: string): Tier {
  const def = ACTIONS[action as MarketAction];
  return def ? def.tier : 'forbidden';
}

export function buildApiUrl(
  action: string,
  params: Record<string, unknown>,
  apiKey: string,
): string {
  const def = ACTIONS[action as MarketAction];
  if (!def) throw new Error(`Unknown action: ${action}`);
  if (!def.hasApiCall) throw new Error(`No API call for action: ${action}`);

  for (const req of def.requiredParams) {
    if (params[req] === undefined || params[req] === null || params[req] === '') {
      throw new Error(`Missing required parameter: ${req}`);
    }
  }

  const url = new URL(AV_BASE);
  url.searchParams.set('apikey', apiKey);

  switch (action) {
    case 'quote':
      url.searchParams.set('function', 'GLOBAL_QUOTE');
      url.searchParams.set('symbol', String(params.symbol));
      break;

    case 'history':
      url.searchParams.set('function', 'TIME_SERIES_DAILY');
      url.searchParams.set('symbol', String(params.symbol));
      url.searchParams.set('outputsize', String(params.outputsize ?? 'compact'));
      break;

    case 'news':
      url.searchParams.set('function', 'NEWS_SENTIMENT');
      url.searchParams.set('tickers', String(params.tickers));
      break;
  }

  return url.toString();
}

// --- Watchlist (SQLite) ---

export function initWatchlistSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      condition TEXT NOT NULL CHECK(condition IN ('above', 'below')),
      price REAL NOT NULL,
      triggered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function addToWatchlist(db: Database.Database, symbol: string): void {
  db.prepare('INSERT OR IGNORE INTO watchlist (symbol) VALUES (?)').run(symbol.toUpperCase());
}

export function removeFromWatchlist(db: Database.Database, symbol: string): void {
  db.prepare('DELETE FROM watchlist WHERE symbol = ?').run(symbol.toUpperCase());
}

export function getWatchlist(db: Database.Database): string[] {
  const rows = db.prepare('SELECT symbol FROM watchlist ORDER BY added_at').all() as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

export interface AlertInput {
  symbol: string;
  condition: 'above' | 'below';
  price: number;
}

export interface AlertRow {
  id: number;
  symbol: string;
  condition: string;
  price: number;
  triggered: number;
  created_at: string;
}

export function addAlert(db: Database.Database, alert: AlertInput): number {
  const result = db.prepare(
    'INSERT INTO alerts (symbol, condition, price) VALUES (?, ?, ?)',
  ).run(alert.symbol.toUpperCase(), alert.condition, alert.price);
  return result.lastInsertRowid as number;
}

export function getAlerts(db: Database.Database, symbol?: string): AlertRow[] {
  if (symbol) {
    return db.prepare('SELECT * FROM alerts WHERE symbol = ? AND triggered = 0 ORDER BY created_at')
      .all(symbol.toUpperCase()) as AlertRow[];
  }
  return db.prepare('SELECT * FROM alerts WHERE triggered = 0 ORDER BY created_at').all() as AlertRow[];
}

export function removeAlert(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
}
