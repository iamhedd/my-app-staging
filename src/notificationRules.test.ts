import { describe, expect, it } from 'vitest';
import {
  budgetAlertLevel,
  budgetAlertText,
  collectBudgetAlerts,
  shouldSendNightlyReminder,
} from './notificationRules';

describe('budget notification rules', () => {
  it('uses the 80 and 100 percent thresholds', () => {
    expect(budgetAlertLevel(79_999, 100_000)).toBe(0);
    expect(budgetAlertLevel(80_000, 100_000)).toBe(80);
    expect(budgetAlertLevel(100_000, 100_000)).toBe(100);
    expect(budgetAlertLevel(10, 0)).toBe(0);
  });

  it('creates one alert per category and month and respects the ledger', () => {
    const transactions = [
      { type: 'expense', category: 'خوراک', amount: 80_000, date: '1405-06-10' },
      { type: 'expense', category: 'خوراک', amount: 100_000, date: '1405-05-10' },
      { type: 'income', category: 'خوراک', amount: 1_000_000, date: '1405-06-10' },
    ];
    const budgets = { 'خوراک': 100_000 };
    const alerts = collectBudgetAlerts(transactions, budgets, ['1405-06'], {});
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ category: 'خوراک', level: 80, periodKey: '1405-06' });
    expect(collectBudgetAlerts(transactions, budgets, ['1405-06'], { '1405-06:خوراک': 80 })).toEqual([]);
  });

  it('uses the temporary default Persian copy', () => {
    expect(budgetAlertText({ category: 'مسکن', level: 100 })).toContain('مسکن');
    expect(budgetAlertText({ category: 'مسکن', level: 80 })).toContain('۸۰٪');
  });
});

describe('nightly reminder rule', () => {
  it('does not send twice on the same local date', () => {
    expect(shouldSendNightlyReminder(null, '2026-09-17')).toBe(true);
    expect(shouldSendNightlyReminder('2026-09-17', '2026-09-17')).toBe(false);
    expect(shouldSendNightlyReminder('2026-09-17', '2026-09-18')).toBe(true);
  });
});
