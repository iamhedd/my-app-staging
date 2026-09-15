import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { isoDateToJalali, jalaliToIsoDate } from './dateUtils';
import type { DevSettings } from './devSettings';
import type { FinancialSetup } from './financialSetup';
import type { Transaction } from './transactions';

export type CloudProfile = { name: string; email: string; avatarUrl: string };
export type BudgetMap = Record<string, number>;
export type WeeklyBudgetStore = Record<string, BudgetMap>;
export type ReviewPriority = 'low' | 'medium' | 'high' | 'critical';
export type ReviewStatus = 'open' | 'in_progress' | 'resolved';
export type DesignReviewComment = {
  id: string;
  pageKey: string;
  componentKey: string;
  commentText: string;
  priority: ReviewPriority;
  status: ReviewStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CloudUserData = {
  profile: CloudProfile;
  role: 'user' | 'admin';
  transactions: Transaction[];
  budgets: BudgetMap;
  weeklyBudgets: WeeklyBudgetStore;
  financialSetup: FinancialSetup | null;
  appSettings: DevSettings | null;
};

function client() {
  if (!supabase) throw new Error('اتصال Supabase تنظیم نشده است.');
  return supabase;
}

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function resolveProfileName(storedName: string | null | undefined, user: Pick<User, 'email' | 'user_metadata'>) {
  const stored = storedName?.trim();
  if (stored) return stored;
  const metadata = user.user_metadata || {};
  const directMetadataName = [metadata.full_name, metadata.name, metadata.display_name]
    .find(value => typeof value === 'string' && value.trim()) as string | undefined;
  if (directMetadataName) return directMetadataName.trim();
  const joinedMetadataName = [metadata.given_name, metadata.family_name]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => String(value).trim())
    .join(' ');
  return joinedMetadataName || user.email?.trim() || 'کاربر گاو';
}

export async function loadCloudUserData(user: User): Promise<CloudUserData> {
  const db = client();
  const [profileResult, roleResult, transactionResult, categoryResult, planResult, budgetResult, appSettingsResult] = await Promise.all([
    db.from('profiles').select('full_name,avatar_url').eq('user_id', user.id).maybeSingle(),
    db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    db.from('transactions').select('legacy_id,title,category_name,amount,type,transaction_date,recurrence,generated_from_legacy_id').order('transaction_date', { ascending: false }),
    db.from('categories').select('client_id,name,percentage_bps,amount,allocation_mode,color,icon,sort_order').order('sort_order'),
    db.from('financial_plans').select('*').eq('user_id', user.id).maybeSingle(),
    db.from('budgets').select('category_name,period_type,period_key,limit_amount,is_override'),
    db.from('app_settings').select('value').eq('key', 'ui').maybeSingle(),
  ]);
  [profileResult, roleResult, transactionResult, categoryResult, planResult, budgetResult, appSettingsResult].forEach(result => assertNoError(result.error));

  const transactions: Transaction[] = (transactionResult.data || []).map(row => ({
    id: row.legacy_id,
    title: row.title,
    category: row.category_name,
    amount: Number(row.amount),
    type: row.type,
    date: isoDateToJalali(row.transaction_date) || row.transaction_date,
    recurrence: row.recurrence,
    generatedFrom: row.generated_from_legacy_id || undefined,
  }));
  const categories = (categoryResult.data || []).map(row => ({
    id: row.client_id,
    name: row.name,
    percentageBps: row.percentage_bps,
    amount: Number(row.amount),
    allocationMode: row.allocation_mode,
    color: row.color,
    icon: row.icon,
  }));
  const plan = planResult.data;
  const financialSetup: FinancialSetup | null = plan ? {
    version: 4,
    monthlyIncome: Number(plan.monthly_income),
    savingsPercentBps: plan.savings_percent_bps,
    currency: plan.currency,
    categories,
    onboardingCompleted: plan.onboarding_completed,
    reminder: { enabled: plan.reminder_enabled, time: String(plan.reminder_time).slice(0, 5), timezone: plan.timezone },
    updatedAt: plan.updated_at,
  } : null;
  const budgets: BudgetMap = {};
  const weeklyBudgets: WeeklyBudgetStore = {};
  for (const row of budgetResult.data || []) {
    if (row.period_type === 'monthly' && row.period_key === 'default') budgets[row.category_name] = Number(row.limit_amount);
    if (row.period_type === 'weekly') {
      weeklyBudgets[row.period_key] ||= {};
      weeklyBudgets[row.period_key][row.category_name] = Number(row.limit_amount);
    }
  }
  return {
    profile: {
      name: resolveProfileName(profileResult.data?.full_name, user),
      email: user.email || '',
      avatarUrl: profileResult.data?.avatar_url || user.user_metadata?.avatar_url || '/avatars/cow-01.png',
    },
    role: roleResult.data?.role === 'admin' ? 'admin' : 'user',
    transactions,
    budgets,
    weeklyBudgets,
    financialSetup,
    appSettings: (appSettingsResult.data?.value as DevSettings | undefined) || null,
  };
}

export async function saveCloudProfile(userId: string, profile: CloudProfile) {
  const { error } = await client().from('profiles').upsert({ user_id: userId, full_name: profile.name, avatar_url: profile.avatarUrl }, { onConflict: 'user_id' });
  assertNoError(error);
}

export async function saveCloudTransaction(userId: string, transaction: Transaction) {
  const transactionDate = jalaliToIsoDate(transaction.date);
  if (!transactionDate) throw new Error('تاریخ تراکنش معتبر نیست.');
  const { error } = await client().from('transactions').upsert({
    user_id: userId,
    legacy_id: transaction.id,
    title: transaction.title,
    category_name: transaction.category,
    amount: transaction.amount,
    type: transaction.type,
    transaction_date: transactionDate,
    recurrence: transaction.recurrence || 'none',
    generated_from_legacy_id: transaction.generatedFrom || null,
  }, { onConflict: 'user_id,legacy_id' });
  assertNoError(error);
}

export async function deleteCloudTransaction(userId: string, legacyId: string) {
  const { error } = await client().from('transactions').delete().eq('user_id', userId).eq('legacy_id', legacyId);
  assertNoError(error);
}

export async function saveCloudFinancialSetup(userId: string, setup: FinancialSetup) {
  const db = client();
  const { error: planError } = await db.from('financial_plans').upsert({
    user_id: userId,
    monthly_income: setup.monthlyIncome,
    savings_percent_bps: setup.savingsPercentBps,
    currency: setup.currency,
    onboarding_completed: setup.onboardingCompleted,
    reminder_enabled: setup.reminder.enabled,
    reminder_time: setup.reminder.time,
    timezone: setup.reminder.timezone,
  }, { onConflict: 'user_id' });
  assertNoError(planError);
  const rows = setup.categories.map((category, index) => ({
    user_id: userId,
    client_id: category.id,
    name: category.name,
    percentage_bps: category.percentageBps,
    amount: category.amount,
    allocation_mode: category.allocationMode,
    color: category.color,
    icon: category.icon,
    sort_order: index,
  }));
  if (rows.length) {
    const { error } = await db.from('categories').upsert(rows, { onConflict: 'user_id,client_id' });
    assertNoError(error);
  }
  const { data: existing, error: listError } = await db.from('categories').select('client_id').eq('user_id', userId);
  assertNoError(listError);
  const activeIds = new Set(setup.categories.map(category => category.id));
  const removed = (existing || []).filter(row => !activeIds.has(row.client_id)).map(row => row.client_id);
  if (removed.length) {
    const { error } = await db.from('categories').delete().eq('user_id', userId).in('client_id', removed);
    assertNoError(error);
  }
}

export async function saveCloudBudgets(userId: string, budgets: BudgetMap, weeklyBudgets: WeeklyBudgetStore) {
  const db = client();
  const rows = [
    ...Object.entries(budgets).map(([categoryName, limit]) => ({ user_id: userId, category_name: categoryName, period_type: 'monthly', period_key: 'default', limit_amount: limit, is_override: false })),
    ...Object.entries(weeklyBudgets).flatMap(([periodKey, values]) => Object.entries(values).map(([categoryName, limit]) => ({ user_id: userId, category_name: categoryName, period_type: 'weekly', period_key: periodKey, limit_amount: limit, is_override: true }))),
  ];
  if (rows.length) {
    const { error } = await db.from('budgets').upsert(rows, { onConflict: 'user_id,category_name,period_type,period_key' });
    assertNoError(error);
  }
  const { data: existing, error: listError } = await db.from('budgets').select('id,category_name,period_type,period_key').eq('user_id', userId);
  assertNoError(listError);
  const desired = new Set(rows.map(row => `${row.category_name}|${row.period_type}|${row.period_key}`));
  const removedIds = (existing || []).filter(row => !desired.has(`${row.category_name}|${row.period_type}|${row.period_key}`)).map(row => row.id);
  if (removedIds.length) {
    const { error } = await db.from('budgets').delete().eq('user_id', userId).in('id', removedIds);
    assertNoError(error);
  }
}

export async function saveCloudAppSettings(userId: string, settings: DevSettings) {
  const { error } = await client().from('app_settings').upsert({ key: 'ui', value: settings, updated_by: userId }, { onConflict: 'key' });
  assertNoError(error);
}

export async function saveNotificationDevice(userId: string, token: string) {
  const { error } = await client().from('notification_devices').upsert({ user_id: userId, fcm_token: token, enabled: true, platform: 'web', last_seen_at: new Date().toISOString() }, { onConflict: 'user_id,fcm_token' });
  assertNoError(error);
}

function mapReviewComment(row: Record<string, unknown>): DesignReviewComment {
  return {
    id: String(row.id),
    pageKey: String(row.page_key),
    componentKey: String(row.component_key || ''),
    commentText: String(row.comment_text),
    priority: row.priority as ReviewPriority,
    status: row.status as ReviewStatus,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function loadDesignReviewComments() {
  const { data, error } = await client().from('design_review_comments').select('*').order('created_at', { ascending: true });
  assertNoError(error);
  return (data || []).map(row => mapReviewComment(row));
}

export async function createDesignReviewComment(userId: string, input: Omit<DesignReviewComment, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) {
  const { data, error } = await client().from('design_review_comments').insert({
    page_key: input.pageKey,
    component_key: input.componentKey || null,
    comment_text: input.commentText,
    priority: input.priority,
    status: input.status,
    created_by: userId,
  }).select('*').single();
  assertNoError(error);
  return mapReviewComment(data);
}

export async function updateDesignReviewComment(id: string, input: Pick<DesignReviewComment, 'componentKey' | 'commentText' | 'priority' | 'status'>) {
  const { data, error } = await client().from('design_review_comments').update({
    component_key: input.componentKey || null,
    comment_text: input.commentText,
    priority: input.priority,
    status: input.status,
  }).eq('id', id).select('*').single();
  assertNoError(error);
  return mapReviewComment(data);
}

export async function deleteDesignReviewComment(id: string) {
  const { error } = await client().from('design_review_comments').delete().eq('id', id);
  assertNoError(error);
}

export async function migrationCompleted(userId: string, migrationKey: string) {
  const { data, error } = await client().from('migration_runs').select('status').eq('user_id', userId).eq('migration_key', migrationKey).maybeSingle();
  assertNoError(error);
  return data?.status === 'completed';
}

export async function markMigration(userId: string, migrationKey: string, status: 'started' | 'completed' | 'failed', counts: Record<string, number> = {}, errorMessage?: string) {
  const { error } = await client().from('migration_runs').upsert({ user_id: userId, migration_key: migrationKey, status, migrated_counts: counts, error_message: errorMessage || null }, { onConflict: 'user_id,migration_key' });
  assertNoError(error);
}
