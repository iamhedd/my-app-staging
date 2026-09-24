import { describe, expect, it } from 'vitest';
import { canClaimLocalSource, hasLegacyData, legacySourceKeys, mergeLegacyTransactions, readLegacyPayload, type LegacyPayload } from './localMigration';

function storage(values: Record<string, unknown>) {
  return { getItem: (key: string) => key in values ? typeof values[key] === 'string' ? values[key] as string : JSON.stringify(values[key]) : null };
}

describe('localStorage migration planning', () => {
  it('discovers sources once and keeps user-specific keys', () => {
    expect(legacySourceKeys('uuid-a', 'A@Example.com', 'email:a@example.com')).toEqual(['local-user', 'email:a@example.com', 'uuid-a']);
    expect(legacySourceKeys('uuid-a', 'a@example.com', 'uuid-from-another-user')).toEqual(['local-user', 'email:a@example.com', 'uuid-a']);
  });

  it('reads legacy records without deleting or mutating storage', () => {
    const source = storage({
      'gav-profile-v1:email:a@example.com': { name: 'A', email: 'a@example.com', avatarUrl: '/a.png' },
      'gav-transactions-v2:email:a@example.com': [{ id: 1, title: 'خوراک', category: 'خوراک', amount: 1000, type: 'expense', date: '۱۴۰۵/۰۶/۲۴' }],
    });
    const payload = readLegacyPayload(source, 'email:a@example.com', 'a@example.com');
    expect(payload.profile?.name).toBe('A');
    expect(payload.transactions[0].id).toBe('1');
    expect(payload.transactions[0].amount).toBe(10_000);
    expect(hasLegacyData(payload)).toBe(true);
  });

  it('does not multiply cached rial amounts again', () => {
    const plan = { version: 4, monthlyIncome: 100_000, savingsPercentBps: 0, currency: 'IRR', categories: [], onboardingCompleted: true, reminder: { enabled: false, time: '21:00', timezone: 'Asia/Tehran' } };
    const source = storage({
      'gav-financial-setup-v1:user-a': plan,
      'gav-transactions-v2:user-a': [{ id: 'one', title: 'خرید', category: 'خوراک', amount: 12340, type: 'expense', date: '1405/06/24' }],
      'gav-budgets-v3:user-a': { خوراک: 50_000 },
    });
    const payload = readLegacyPayload(source, 'user-a', 'a@example.com');
    expect(payload.transactions[0].amount).toBe(12340);
    expect(payload.budgets.خوراک).toBe(50_000);
  });

  it('recognizes rial cloud caches even without a financial plan', () => {
    const source = storage({
      'gav-money-unit-v1:user-a': 'IRR',
      'gav-transactions-v2:user-a': [{ id: 'one', title: 'خرید', category: 'خوراک', amount: 12340, type: 'expense', date: '1405/06/24' }],
    });
    expect(readLegacyPayload(source, 'user-a', 'a@example.com').transactions[0].amount).toBe(12340);
  });

  it('does not let a second account claim another user local source', () => {
    expect(canClaimLocalSource(storage({ 'gav-local-source-owner:local-user': 'user-a' }), 'user-b', 'b@example.com')).toBe(false);
    expect(canClaimLocalSource(storage({ 'gav-profile-v1:local-user': { name: 'A', email: 'a@example.com', avatarUrl: '' } }), 'user-b', 'b@example.com')).toBe(false);
    expect(canClaimLocalSource(storage({}), 'user-a', 'a@example.com')).toBe(true);
  });

  it('deduplicates transactions by stable legacy id', () => {
    const transaction = { id: 'same', title: 'تکراری', category: 'سایر', amount: 10, type: 'expense' as const, date: '1405/06/24' };
    const base = { profile: null, budgets: {}, weeklyBudgets: {}, financialSetup: null, fcmToken: null };
    const payloads: LegacyPayload[] = [{ ...base, sourceKey: 'one', transactions: [transaction] }, { ...base, sourceKey: 'two', transactions: [{ ...transaction, amount: 20 }] }];
    expect(mergeLegacyTransactions(payloads)).toEqual([{ ...transaction, amount: 20 }]);
  });
});
