import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }));

import { resolveProfileName, saveCloudProfile, saveCloudTransaction } from './database';

describe('cloud persistence contracts', () => {
  beforeEach(() => {
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    mocks.from.mockReset().mockReturnValue({ upsert: mocks.upsert });
  });

  it('upserts transactions by user and stable legacy id', async () => {
    await saveCloudTransaction('user-a', {
      id: 'local-123', title: 'خوراک', category: 'خوراک', amount: 125_000,
      type: 'expense', date: '1405/06/24', recurrence: 'none',
    });
    expect(mocks.from).toHaveBeenCalledWith('transactions');
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-a', legacy_id: 'local-123', amount: 125_000,
      transaction_date: '2026-09-15',
    }), { onConflict: 'user_id,legacy_id' });
  });

  it('persists a profile only under its authenticated user id', async () => {
    await saveCloudProfile('user-b', { name: 'کاربر ب', email: 'b@example.com', avatarUrl: '/b.png' });
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.upsert).toHaveBeenCalledWith({ user_id: 'user-b', full_name: 'کاربر ب', avatar_url: '/b.png' }, { onConflict: 'user_id' });
  });

  it('resolves the displayed name using profile, metadata, then the full email', () => {
    const googleUser = { email: 'google@example.com', user_metadata: { full_name: '  نام گوگل  ' } };
    expect(resolveProfileName('  نام ذخیره‌شده  ', googleUser)).toBe('نام ذخیره‌شده');
    expect(resolveProfileName('', googleUser)).toBe('نام گوگل');
    expect(resolveProfileName('', { email: 'person@example.com', user_metadata: {} })).toBe('person@example.com');
  });

  it('uses other Google metadata name fields without deriving a name from email', () => {
    expect(resolveProfileName(null, { email: 'ali@example.com', user_metadata: { given_name: 'علی', family_name: 'رضایی' } })).toBe('علی رضایی');
    expect(resolveProfileName(null, { email: 'nickname@example.com', user_metadata: { name: 'نام گوگل' } })).toBe('نام گوگل');
  });
});
