import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetTracker } from '../budget.js';

describe('BudgetTracker', () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    tracker = new BudgetTracker(1.0); // $1.00 daily limit
  });

  it('should allow spending within budget', () => {
    expect(tracker.canSpend()).toBe(true);
    tracker.record(0.50);
    expect(tracker.canSpend()).toBe(true);
  });

  it('should block spending over budget', () => {
    tracker.record(0.80);
    tracker.record(0.25);
    expect(tracker.canSpend()).toBe(false);
  });

  it('should report remaining budget', () => {
    tracker.record(0.30);
    expect(tracker.remaining()).toBeCloseTo(0.70);
  });

  it('should report warning threshold', () => {
    tracker.record(0.40);
    expect(tracker.isWarning(0.50)).toBe(false);
    tracker.record(0.20);
    expect(tracker.isWarning(0.50)).toBe(true);
  });

  it('should reset on new day', () => {
    tracker.record(1.50);
    expect(tracker.canSpend()).toBe(false);
    tracker.resetDaily();
    expect(tracker.canSpend()).toBe(true);
    expect(tracker.remaining()).toBeCloseTo(1.0);
  });

  it('should track today spent', () => {
    tracker.record(0.25);
    tracker.record(0.35);
    expect(tracker.todaySpent()).toBeCloseTo(0.60);
  });
});
