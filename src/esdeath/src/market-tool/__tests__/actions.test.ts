import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  ACTIONS,
  getActionTier,
  initWatchlistSchema,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  addAlert,
  getAlerts,
  removeAlert,
  buildApiUrl,
  type MarketAction,
} from '../actions.js';

describe('market-tool actions', () => {
  describe('action registry', () => {
    it('should define all expected actions', () => {
      const names = Object.keys(ACTIONS);
      expect(names).toContain('quote');
      expect(names).toContain('history');
      expect(names).toContain('watchlist');
      expect(names).toContain('news');
      expect(names).toContain('alert_set');
      expect(names).toContain('alert_list');
    });
  });

  describe('getActionTier', () => {
    it('should return notice for read actions', () => {
      expect(getActionTier('quote')).toBe('notice');
      expect(getActionTier('history')).toBe('notice');
      expect(getActionTier('watchlist')).toBe('notice');
      expect(getActionTier('news')).toBe('notice');
      expect(getActionTier('alert_list')).toBe('notice');
    });

    it('should return notice for alert_set (local-only side effect)', () => {
      expect(getActionTier('alert_set')).toBe('notice');
    });

    it('should return forbidden for unknown actions', () => {
      expect(getActionTier('trade')).toBe('forbidden');
      expect(getActionTier('buy')).toBe('forbidden');
    });
  });

  describe('buildApiUrl', () => {
    const apiKey = 'TEST_KEY';

    it('should build quote URL', () => {
      const url = buildApiUrl('quote', { symbol: 'AAPL' }, apiKey);
      expect(url).toContain('function=GLOBAL_QUOTE');
      expect(url).toContain('symbol=AAPL');
      expect(url).toContain('apikey=TEST_KEY');
    });

    it('should build history URL with default outputsize', () => {
      const url = buildApiUrl('history', { symbol: 'TSLA' }, apiKey);
      expect(url).toContain('function=TIME_SERIES_DAILY');
      expect(url).toContain('symbol=TSLA');
      expect(url).toContain('outputsize=compact');
    });

    it('should build news URL', () => {
      const url = buildApiUrl('news', { tickers: 'AAPL,MSFT' }, apiKey);
      expect(url).toContain('function=NEWS_SENTIMENT');
      expect(url).toContain('tickers=AAPL%2CMSFT');
    });

    it('should throw for missing symbol', () => {
      expect(() => buildApiUrl('quote', {}, apiKey)).toThrow('Missing required');
    });

    it('should throw for actions without API call', () => {
      expect(() => buildApiUrl('watchlist', {}, apiKey)).toThrow('No API call');
      expect(() => buildApiUrl('alert_set', {}, apiKey)).toThrow('No API call');
      expect(() => buildApiUrl('alert_list', {}, apiKey)).toThrow('No API call');
    });
  });

  describe('watchlist (SQLite)', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = new Database(':memory:');
      initWatchlistSchema(db);
    });

    it('should add symbols to watchlist', () => {
      addToWatchlist(db, 'AAPL');
      addToWatchlist(db, 'TSLA');
      const list = getWatchlist(db);
      expect(list).toEqual(['AAPL', 'TSLA']);
    });

    it('should not duplicate symbols', () => {
      addToWatchlist(db, 'AAPL');
      addToWatchlist(db, 'AAPL');
      const list = getWatchlist(db);
      expect(list).toEqual(['AAPL']);
    });

    it('should remove symbols', () => {
      addToWatchlist(db, 'AAPL');
      addToWatchlist(db, 'TSLA');
      removeFromWatchlist(db, 'AAPL');
      const list = getWatchlist(db);
      expect(list).toEqual(['TSLA']);
    });
  });

  describe('alerts (SQLite)', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = new Database(':memory:');
      initWatchlistSchema(db);
    });

    it('should create price alerts', () => {
      addAlert(db, { symbol: 'AAPL', condition: 'above', price: 200 });
      const alerts = getAlerts(db);
      expect(alerts.length).toBe(1);
      expect(alerts[0].symbol).toBe('AAPL');
      expect(alerts[0].condition).toBe('above');
      expect(alerts[0].price).toBe(200);
    });

    it('should support multiple alerts per symbol', () => {
      addAlert(db, { symbol: 'AAPL', condition: 'above', price: 200 });
      addAlert(db, { symbol: 'AAPL', condition: 'below', price: 150 });
      const alerts = getAlerts(db);
      expect(alerts.length).toBe(2);
    });

    it('should filter alerts by symbol', () => {
      addAlert(db, { symbol: 'AAPL', condition: 'above', price: 200 });
      addAlert(db, { symbol: 'TSLA', condition: 'below', price: 100 });
      const alerts = getAlerts(db, 'AAPL');
      expect(alerts.length).toBe(1);
    });

    it('should remove alert by id', () => {
      addAlert(db, { symbol: 'AAPL', condition: 'above', price: 200 });
      const alerts = getAlerts(db);
      removeAlert(db, alerts[0].id);
      expect(getAlerts(db).length).toBe(0);
    });
  });
});
