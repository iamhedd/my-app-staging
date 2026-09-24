import {
  markMigration, migrationCompleted, saveCloudBudgets, saveCloudFinancialSetup, saveCloudProfile,
  saveCloudTransaction, saveNotificationDevice, type BudgetMap, type CloudProfile, type WeeklyBudgetStore,
} from './database';
import { normalizeFinancialSetup, setupStorageKey, type FinancialSetup } from './financialSetup';
import { normalizeTransactions, type Transaction } from './transactions';

type StorageReader = Pick<Storage, 'getItem'>;

export type LegacyPayload = {
  sourceKey: string;
  profile: CloudProfile | null;
  transactions: Transaction[];
  budgets: BudgetMap;
  weeklyBudgets: WeeklyBudgetStore;
  financialSetup: FinancialSetup | null;
  fcmToken: string | null;
};

function readJson<T>(storage: StorageReader, key: string, fallback: T): T {
  try { return JSON.parse(storage.getItem(key) || '') as T; } catch { return fallback; }
}

export function legacySourceKeys(userId: string, email: string, activeUserKey = '') {
  const emailKey = email ? `email:${email.trim().toLowerCase()}` : '';
  const safeActiveKey = activeUserKey === userId || activeUserKey === emailKey || activeUserKey === 'local-user' ? activeUserKey : '';
  return [...new Set(['local-user', emailKey, safeActiveKey, userId].filter(Boolean))];
}

export function readLegacyPayload(storage: StorageReader, sourceKey: string, authenticatedEmail: string): LegacyPayload {
  const storedProfile = readJson<CloudProfile | null>(storage, `gav-profile-v1:${sourceKey}`, null);
  const profileMatches = !storedProfile?.email || storedProfile.email.trim().toLowerCase() === authenticatedEmail.trim().toLowerCase();
  const rawSetup = readJson<FinancialSetup | null>(storage, setupStorageKey(sourceKey), null);
  const oldTomanValues = rawSetup?.currency !== 'IRR' && storage.getItem(`gav-money-unit-v1:${sourceKey}`) !== 'IRR';
  const toRial = (amount: number) => {
    const converted = oldTomanValues ? amount * 10 : amount;
    if (!Number.isSafeInteger(converted)) throw new Error('مبلغ قدیمی از محدوده مجاز ریال بزرگ‌تر است.');
    return converted;
  };
  const budgets = readJson<BudgetMap>(storage, `gav-budgets-v3:${sourceKey}`, {});
  const weeklyBudgets = readJson<WeeklyBudgetStore>(storage, `gav-weekly-budgets-v1:${sourceKey}`, {});
  return {
    sourceKey,
    profile: storedProfile && profileMatches ? storedProfile : null,
    transactions: normalizeTransactions(readJson<unknown[]>(storage, `gav-transactions-v2:${sourceKey}`, [])).map(transaction => ({ ...transaction, amount: toRial(transaction.amount) })),
    budgets: Object.fromEntries(Object.entries(budgets).map(([category, amount]) => [category, toRial(amount)])),
    weeklyBudgets: Object.fromEntries(Object.entries(weeklyBudgets).map(([period, values]) => [period, Object.fromEntries(Object.entries(values).map(([category, amount]) => [category, toRial(amount)]))])),
    financialSetup: normalizeFinancialSetup(rawSetup),
    fcmToken: sourceKey === 'local-user' ? storage.getItem('gav-fcm-token') : null,
  };
}

export function canClaimLocalSource(storage: StorageReader, userId: string, authenticatedEmail: string) {
  const claimedBy = storage.getItem('gav-local-source-owner:local-user');
  if (claimedBy && claimedBy !== userId) return false;
  const profile = readJson<CloudProfile | null>(storage, 'gav-profile-v1:local-user', null);
  return !profile?.email || profile.email.trim().toLowerCase() === authenticatedEmail.trim().toLowerCase();
}

export function hasLegacyData(payload: LegacyPayload) {
  return Boolean(payload.profile || payload.transactions.length || payload.financialSetup || Object.keys(payload.budgets).length || Object.keys(payload.weeklyBudgets).length || payload.fcmToken);
}

export function mergeLegacyTransactions(payloads: LegacyPayload[]) {
  const byId = new Map<string, Transaction>();
  payloads.flatMap(payload => payload.transactions).forEach(transaction => byId.set(transaction.id, transaction));
  return [...byId.values()];
}

export async function migrateLocalStorageToApi(storage: StorageReader & Pick<Storage, 'setItem'>, userId: string, email: string) {
  const activeUserKey = readJson<string>(storage, 'gav-active-user', '');
  const sourceKeys = legacySourceKeys(userId, email, activeUserKey).filter(sourceKey => sourceKey !== 'local-user' || canClaimLocalSource(storage, userId, email));
  const payloads = sourceKeys.map(sourceKey => readLegacyPayload(storage, sourceKey, email)).filter(hasLegacyData);
  const pendingPayloads: LegacyPayload[] = [];
  for (const payload of payloads) {
    if (!await migrationCompleted(userId, `localstorage-v1:${payload.sourceKey}`)) pendingPayloads.push(payload);
  }
  const counts = { profiles: 0, transactions: 0, financialPlans: 0, budgets: 0, notificationDevices: 0 };
  const mergedBudgets = Object.assign({}, ...payloads.map(payload => payload.budgets));
  const mergedWeeklyBudgets = payloads.reduce<WeeklyBudgetStore>((result, payload) => {
    Object.entries(payload.weeklyBudgets).forEach(([periodKey, values]) => { result[periodKey] = { ...(result[periodKey] || {}), ...values }; });
    return result;
  }, {});
  if (pendingPayloads.length && (Object.keys(mergedBudgets).length || Object.keys(mergedWeeklyBudgets).length)) {
    await saveCloudBudgets(userId, mergedBudgets, mergedWeeklyBudgets);
    counts.budgets = Object.keys(mergedBudgets).length + Object.values(mergedWeeklyBudgets).reduce((sum, values) => sum + Object.keys(values).length, 0);
  }
  for (const payload of pendingPayloads) {
    const migrationKey = `localstorage-v1:${payload.sourceKey}`;
    await markMigration(userId, migrationKey, 'started');
    try {
      if (payload.profile) { await saveCloudProfile(userId, payload.profile); counts.profiles += 1; }
      if (payload.financialSetup) { await saveCloudFinancialSetup(userId, payload.financialSetup); counts.financialPlans += 1; }
      for (const transaction of payload.transactions) await saveCloudTransaction(userId, transaction);
      counts.transactions += payload.transactions.length;
      if (payload.fcmToken) { await saveNotificationDevice(userId, payload.fcmToken); counts.notificationDevices += 1; }
      await markMigration(userId, migrationKey, 'completed', counts);
    } catch (error) {
      try { await markMigration(userId, migrationKey, 'failed', counts, error instanceof Error ? error.message : 'migration failed'); } catch { /* preserve original error */ }
      throw error;
    }
  }
  storage.setItem(`gav-cloud-migration-v1:${userId}`, JSON.stringify({ completedAt: new Date().toISOString(), counts }));
  if (payloads.some(payload => payload.sourceKey === 'local-user')) storage.setItem('gav-local-source-owner:local-user', userId);
  return counts;
}
