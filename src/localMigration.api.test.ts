import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  migrationCompleted: vi.fn(),
  markMigration: vi.fn(),
  saveCloudBudgets: vi.fn(),
  saveCloudFinancialSetup: vi.fn(),
  saveCloudProfile: vi.fn(),
  saveCloudTransaction: vi.fn(),
  saveNotificationDevice: vi.fn(),
}));

vi.mock('./database', () => mocks);

import { migrateLocalStorageToApi } from './localMigration';

function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

describe('localStorage to API migration', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    mocks.migrationCompleted.mockResolvedValue(false);
    mocks.markMigration.mockResolvedValue(undefined);
    mocks.saveCloudTransaction.mockResolvedValue(undefined);
  });

  it('keeps the stable transaction id, records completion and does not delete local data', async () => {
    const transactionKey = 'gav-transactions-v2:local-user';
    const original = JSON.stringify([{ id: 'legacy-1', title: 'خرید', category: 'خوراک', amount: 1234, type: 'expense', date: '1405/06/24' }]);
    const storage = memoryStorage({ [transactionKey]: original });

    const counts = await migrateLocalStorageToApi(storage, 'user-1', 'h@example.com');

    expect(mocks.saveCloudTransaction).toHaveBeenCalledWith('user-1', expect.objectContaining({ id: 'legacy-1', amount: 12340 }));
    expect(mocks.markMigration).toHaveBeenNthCalledWith(1, 'user-1', 'localstorage-v1:local-user', 'started');
    expect(mocks.markMigration).toHaveBeenLastCalledWith('user-1', 'localstorage-v1:local-user', 'completed', expect.objectContaining({ transactions: 1 }));
    expect(storage.getItem(transactionKey)).toBe(original);
    expect(storage.getItem('gav-local-source-owner:local-user')).toBe('user-1');
    expect(counts.transactions).toBe(1);
  });

  it('skips sources already marked as migrated', async () => {
    mocks.migrationCompleted.mockResolvedValue(true);
    const storage = memoryStorage({
      'gav-transactions-v2:local-user': JSON.stringify([{ id: 'legacy-1', title: 'خرید', category: 'خوراک', amount: 1234, type: 'expense', date: '1405/06/24' }]),
    });
    await migrateLocalStorageToApi(storage, 'user-1', 'h@example.com');
    expect(mocks.saveCloudTransaction).not.toHaveBeenCalled();
    expect(mocks.markMigration).not.toHaveBeenCalled();
  });
});
