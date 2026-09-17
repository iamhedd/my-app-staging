import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCloudUserData, resolveProfileName, saveCloudProfile, saveCloudTransaction } from './database';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('API persistence contracts', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('persists transactions by stable legacy id and serializes money as a decimal string', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ transaction: {} }));
    await saveCloudTransaction('user-a', {
      id: 'local-123', title: 'خوراک', category: 'خوراک', amount: 125_000,
      type: 'expense', date: '1405/06/24', recurrence: 'none',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/transactions/local-123');
    expect(request).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      amount: '125000',
      date: '2026-09-15',
    });
  });

  it('does not send a client-supplied owner when saving a profile', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ profile: {} }));
    await saveCloudProfile('user-b', { name: 'کاربر ب', email: 'b@example.com', avatarUrl: '/b.png' });

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/profile');
    expect(JSON.parse(String(request?.body))).toEqual({ name: 'کاربر ب', avatarUrl: '/b.png' });
  });

  it('hydrates API bigint strings and ISO dates into the existing frontend model', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      profile: { name: 'هدیه', email: 'hediyeh@example.com', avatarUrl: null },
      role: 'admin',
      financialPlan: {
        monthlyIncome: '10000000', savingsPercentBps: 1000, currency: 'TOMAN', onboardingCompleted: true,
        reminder: { enabled: true, time: '21:00', timezone: 'Asia/Tehran' }, updatedAt: '2026-09-16T00:00:00.000Z',
      },
      categories: [{ id: 'food', name: 'خوراک', percentageBps: 2500, amount: '2250000', allocationMode: 'amount', color: '#df7899', icon: 'food' }],
      transactions: [{ id: 'tx-1', title: 'خرید', category: 'خوراک', amount: '125000', type: 'expense', date: '2026-09-15', recurrence: 'none', generatedFrom: null }],
      budgets: [{ category: 'خوراک', periodType: 'monthly', periodKey: 'default', limitAmount: '2250000', isOverride: false }],
      settings: null,
    }));

    const data = await loadCloudUserData({ id: 'user-a', name: 'نام حساب', email: 'hediyeh@example.com', emailVerified: true, image: '/google.png' });
    expect(data.role).toBe('admin');
    expect(data.transactions[0]).toMatchObject({ amount: 125_000, date: '1405/06/24' });
    expect(data.financialSetup?.monthlyIncome).toBe(10_000_000);
    expect(data.financialSetup?.categories[0].amount).toBe(2_250_000);
    expect(data.budgets).toEqual({ خوراک: 2_250_000 });
    expect(data.profile.avatarUrl).toBe('/google.png');
    expect(data.profileNeedsSync).toBe(false);
  });

  it('rejects unsafe bigint values instead of silently rounding them', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      profile: null, transactions: [{ id: 'tx', title: 'x', category: 'سایر', amount: '9007199254740992', type: 'expense', date: '2026-09-15' }],
    }));
    await expect(loadCloudUserData({ id: 'u', name: 'U', email: 'u@example.com', emailVerified: true, image: null }))
      .rejects.toThrow('مبلغ تراکنش دریافتی از سرور معتبر نیست');
  });

  it('resolves the displayed name using profile, account name, then the full email', () => {
    expect(resolveProfileName('  نام ذخیره‌شده  ', { email: 'google@example.com', name: 'نام گوگل' })).toBe('نام ذخیره‌شده');
    expect(resolveProfileName('', { email: 'google@example.com', name: '  نام گوگل  ' })).toBe('نام گوگل');
    expect(resolveProfileName('', { email: 'person@example.com', name: '' })).toBe('person@example.com');
    expect(resolveProfileName('کاربر گاو', { email: 'person@example.com', name: 'هدیه' })).toBe('هدیه');
    expect(resolveProfileName('person', { email: 'person@example.com', name: 'هدیه' })).toBe('هدیه');
  });
});
