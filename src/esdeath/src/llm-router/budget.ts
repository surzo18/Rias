export class BudgetTracker {
  private spent = 0;

  constructor(private readonly dailyLimit: number) {}

  record(cost: number): void {
    this.spent += cost;
  }

  canSpend(): boolean {
    return this.spent < this.dailyLimit;
  }

  remaining(): number {
    return Math.max(0, this.dailyLimit - this.spent);
  }

  isWarning(threshold: number): boolean {
    return this.spent >= threshold;
  }

  resetDaily(): void {
    this.spent = 0;
  }

  todaySpent(): number {
    return this.spent;
  }
}
