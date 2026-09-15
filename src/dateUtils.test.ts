import { describe, expect, it } from 'vitest';
import { displayJalaliDate, elapsedDaysInMonth, isInJalaliMonth, monthFromOffset, parseJalaliDate, shiftJalaliMonth, todayJalali } from './dateUtils';
import { materializeRecurringTransactions, normalizeTransactions, type Transaction } from './transactions';

describe('jalali date utilities', () => {
  const now = new Date(2026, 8, 14);

  it('returns the real Jalali date and validates Persian input', () => {
    expect(todayJalali(now).key).toBe('1405/06/23');
    expect(parseJalaliDate('۱۴۰۵/۰۶/۳۱')).toEqual({ year: 1405, month: 6, day: 31 });
    expect(parseJalaliDate('۱۴۰۵/۰۷/۳۱')).toBeNull();
    expect(displayJalaliDate('1405/06/23')).toBe('۱۴۰۵/۰۶/۲۳');
  });

  it('moves across Jalali years and detects selected months', () => {
    expect(shiftJalaliMonth(1405, 12, 1).key).toBe('1406/01');
    expect(monthFromOffset(0, now).label).toBe('شهریور ۱۴۰۵');
    expect(isInJalaliMonth('۱۴۰۵/۰۶/۲۳', monthFromOffset(0, now))).toBe(true);
    expect(elapsedDaysInMonth(monthFromOffset(0, now), now)).toBe(23);
  });
});

describe('recurring transactions', () => {
  it('migrates old ids and investment transactions', () => {
    const migrated = normalizeTransactions([{ id: 1, title: 'قدیمی', category: 'سرمایه‌گذاری', amount: 100, type: 'investment', date: '۱۴۰۵/۰۶/۲۰' }]);
    expect(migrated[0]).toMatchObject({ id: '1', type: 'savings', category: 'پس‌انداز' });
  });

  it('creates due monthly occurrences without duplicates', () => {
    const root: Transaction = { id: 'rent', title: 'اجاره', category: 'مسکن', amount: 10_000_000, type: 'expense', date: '1405/04/31', recurrence: 'monthly' };
    const result = materializeRecurringTransactions([root], new Date(2026, 8, 14));
    expect(result.map(item => item.date)).toEqual(['1405/05/31', '1405/04/31']);
    expect(materializeRecurringTransactions(result, new Date(2026, 8, 14))).toHaveLength(2);
  });
});
