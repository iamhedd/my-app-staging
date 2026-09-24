import { ApiError, apiRequest, jsonBody } from './api';
import type { User } from './auth';
import { isoDateToJalali, jalaliToIsoDate } from './dateUtils';
import { normalizeDevSettings, type DevSettings } from './devSettings';
import type { FinancialSetup, SetupCategory } from './financialSetup';
import type { Transaction, TxType } from './transactions';
import type { SavingsPortfolio } from './savings';

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
  profileNeedsSync: boolean;
  role: 'user' | 'admin';
  transactions: Transaction[];
  budgets: BudgetMap;
  weeklyBudgets: WeeklyBudgetStore;
  financialSetup: FinancialSetup | null;
  appSettings: DevSettings | null;
  savingsPortfolio: SavingsPortfolio | null;
};

type ApiProfile = { name?: string | null; email?: string | null; avatarUrl?: string | null };
type ApiCategory = Omit<SetupCategory, 'amount'> & { amount: string | number };
type ApiTransaction = Omit<Transaction, 'amount' | 'date' | 'type'> & {
  amount: string | number;
  date: string;
  type: TxType;
  generatedFrom?: string | null;
};
type ApiBudget = {
  category: string;
  periodType: 'monthly' | 'weekly';
  periodKey: string;
  limitAmount: string | number;
  isOverride: boolean;
};
type ApiFinancialPlan = {
  monthlyIncome: string | number;
  savingsPercentBps: number;
  savingsTargetAmount?: string | number;
  currency: 'IRR';
  onboardingCompleted: boolean;
  reminder: FinancialSetup['reminder'];
  updatedAt?: string;
};
type ApiSavingsPortfolio = {
  totalAmount: string | number;
  monthKey: string;
  monthlyTargetAmount: string | number;
  goals: Array<{
    id: string;
    name: string;
    allocatedAmount: string | number;
    monthlyContribution?: string | number;
    targetAmount: string | number | null;
    targetDate: string | null;
    completed: boolean;
    progressHistory?: Array<{ monthKey: string; amount: string | number }>;
  }>;
  updatedAt?: string;
};
type BootstrapResponse = {
  profile?: ApiProfile | null;
  role?: 'user' | 'admin';
  transactions?: ApiTransaction[];
  categories?: ApiCategory[];
  financialPlan?: ApiFinancialPlan | null;
  budgets?: ApiBudget[];
  settings?: { settings?: unknown } | null;
  savingsPortfolio?: ApiSavingsPortfolio | null;
};

function moneyNumber(value: string | number, field: string) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`${field} دریافتی از سرور معتبر نیست.`);
  return amount;
}

function moneyString(value: number, field: string, positive = false) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) throw new Error(`${field} معتبر نیست.`);
  return String(value);
}

export function resolveProfileName(storedName: string | null | undefined, user: Pick<User, 'email' | 'name'>) {
  const stored = storedName?.trim() || '';
  const email = user.email.trim();
  const emailLocalPart = email.split('@')[0] || '';
  const isGeneratedFallback = !stored
    || stored === 'کاربر گاو'
    || stored.toLocaleLowerCase('en') === email.toLocaleLowerCase('en')
    || stored.toLocaleLowerCase('en') === emailLocalPart.toLocaleLowerCase('en');
  return (!isGeneratedFallback ? stored : '') || user.name?.trim() || email || 'کاربر گاو';
}

export async function loadCloudUserData(user: User): Promise<CloudUserData> {
  const data = await apiRequest<BootstrapResponse>('/api/v1/bootstrap');
  const transactions: Transaction[] = (data.transactions || []).map(row => ({
    id: String(row.id),
    title: row.title,
    category: row.category,
    amount: moneyNumber(row.amount, 'مبلغ تراکنش'),
    type: row.type,
    date: isoDateToJalali(row.date) || row.date,
    recurrence: row.recurrence || 'none',
    generatedFrom: row.generatedFrom || undefined,
  }));
  const categories: SetupCategory[] = (data.categories || []).map(row => ({
    id: row.id,
    name: row.name,
    percentageBps: row.percentageBps,
    amount: moneyNumber(row.amount, 'مبلغ دسته'),
    allocationMode: row.allocationMode,
    color: row.color,
    icon: row.icon,
  }));
  const plan = data.financialPlan;
  const financialSetup: FinancialSetup | null = plan ? {
    version: 4,
    monthlyIncome: moneyNumber(plan.monthlyIncome, 'درآمد ماهانه'),
    savingsPercentBps: plan.savingsPercentBps,
    savingsTargetAmount: plan.savingsTargetAmount === undefined
      ? undefined
      : moneyNumber(plan.savingsTargetAmount, 'هدف پس‌انداز'),
    currency: plan.currency,
    categories,
    onboardingCompleted: plan.onboardingCompleted,
    reminder: plan.reminder,
    updatedAt: plan.updatedAt || new Date().toISOString(),
  } : null;
  const budgets: BudgetMap = {};
  const weeklyBudgets: WeeklyBudgetStore = {};
  for (const row of data.budgets || []) {
    const limit = moneyNumber(row.limitAmount, 'مبلغ بودجه');
    if (row.periodType === 'monthly' && row.periodKey === 'default') budgets[row.category] = limit;
    if (row.periodType === 'weekly') {
      weeklyBudgets[row.periodKey] ||= {};
      weeklyBudgets[row.periodKey][row.category] = limit;
    }
  }
  const apiProfile = data.profile;
  const apiSavings = data.savingsPortfolio;
  const savingsPortfolio: SavingsPortfolio | null = apiSavings ? {
    totalAmount: moneyNumber(apiSavings.totalAmount, 'کل پس‌انداز'),
    monthKey: apiSavings.monthKey,
    monthlyTargetAmount: moneyNumber(apiSavings.monthlyTargetAmount, 'هدف پس‌انداز ماهانه'),
    goals: apiSavings.goals.map(goal => ({
      id: goal.id,
      name: goal.name,
      allocatedAmount: moneyNumber(goal.allocatedAmount, `تخصیص ${goal.name}`),
      monthlyContribution: goal.monthlyContribution == null ? 0 : moneyNumber(goal.monthlyContribution, `مبلغ ماهانه ${goal.name}`),
      targetAmount: goal.targetAmount === null ? null : moneyNumber(goal.targetAmount, `هدف ${goal.name}`),
      targetDate: goal.targetDate ? (isoDateToJalali(goal.targetDate) || null) : null,
      completed: goal.completed,
      progressHistory: (goal.progressHistory || []).map(item => ({
        monthKey: item.monthKey,
        amount: moneyNumber(item.amount, `پیشرفت ${goal.name}`),
      })),
    })),
    updatedAt: apiSavings.updatedAt || new Date().toISOString(),
  } : null;
  const resolvedProfileName = resolveProfileName(apiProfile?.name, user);
  return {
    profile: {
      name: resolvedProfileName,
      email: apiProfile?.email?.trim() || user.email,
      avatarUrl: apiProfile?.avatarUrl || user.image || '/avatars/cow-01.png',
    },
    profileNeedsSync: Boolean(apiProfile?.name?.trim()) && apiProfile?.name?.trim() !== resolvedProfileName,
    role: data.role === 'admin' ? 'admin' : 'user',
    transactions,
    budgets,
    weeklyBudgets,
    financialSetup,
    appSettings: data.settings?.settings && typeof data.settings.settings === 'object'
      ? normalizeDevSettings(data.settings.settings as Partial<DevSettings>)
      : null,
    savingsPortfolio,
  };
}

export async function saveCloudProfile(_userId: string, profile: CloudProfile) {
  await apiRequest('/api/v1/profile', {
    method: 'PUT',
    body: jsonBody({ name: profile.name.trim(), avatarUrl: profile.avatarUrl || null }),
  });
}

export async function saveCloudTransaction(_userId: string, transaction: Transaction) {
  const transactionDate = jalaliToIsoDate(transaction.date);
  if (!transactionDate) throw new Error('تاریخ تراکنش معتبر نیست.');
  await apiRequest(`/api/v1/transactions/${encodeURIComponent(transaction.id)}`, {
    method: 'PUT',
    body: jsonBody({
      title: transaction.title,
      category: transaction.category,
      amount: moneyString(transaction.amount, 'مبلغ تراکنش', true),
      type: transaction.type,
      date: transactionDate,
      recurrence: transaction.recurrence || 'none',
      generatedFrom: transaction.generatedFrom || null,
    }),
  });
}

export async function deleteCloudTransaction(_userId: string, legacyId: string) {
  await apiRequest(`/api/v1/transactions/${encodeURIComponent(legacyId)}`, { method: 'DELETE' });
}

export async function saveCloudFinancialSetup(_userId: string, setup: FinancialSetup) {
  await apiRequest('/api/v1/financial-plan', {
    method: 'PUT',
    body: jsonBody({
      monthlyIncome: moneyString(setup.monthlyIncome, 'درآمد ماهانه', true),
      savingsPercentBps: setup.savingsPercentBps,
      savingsTargetAmount: moneyString(calculateSetupSavingsTarget(setup), 'هدف پس‌انداز'),
      currency: setup.currency,
      onboardingCompleted: setup.onboardingCompleted,
      reminder: setup.reminder,
    }),
  });
  await apiRequest('/api/v1/categories', {
    method: 'PUT',
    body: jsonBody({ categories: setup.categories.map(category => ({
      ...category,
      amount: moneyString(category.amount, `بودجه ${category.name}`),
    })) }),
  });
}

function calculateSetupSavingsTarget(setup: FinancialSetup) {
  if (Number.isSafeInteger(setup.savingsTargetAmount) && setup.savingsTargetAmount! >= 0 && setup.savingsTargetAmount! <= setup.monthlyIncome) return setup.savingsTargetAmount!;
  return Math.round(setup.monthlyIncome * setup.savingsPercentBps / 10000);
}

export async function saveCloudBudgets(_userId: string, budgets: BudgetMap, weeklyBudgets: WeeklyBudgetStore) {
  const rows = [
    ...Object.entries(budgets).map(([category, limit]) => ({
      category,
      periodType: 'monthly' as const,
      periodKey: 'default',
      limitAmount: moneyString(limit, `بودجه ${category}`),
      isOverride: false,
    })),
    ...Object.entries(weeklyBudgets).flatMap(([periodKey, values]) => Object.entries(values).map(([category, limit]) => ({
      category,
      periodType: 'weekly' as const,
      periodKey,
      limitAmount: moneyString(limit, `بودجه ${category}`),
      isOverride: true,
    }))),
  ];
  await apiRequest('/api/v1/budgets', { method: 'PUT', body: jsonBody({ budgets: rows }) });
}

export async function saveCloudSavingsPortfolio(_userId: string, portfolio: SavingsPortfolio) {
  await apiRequest('/api/v1/savings', {
    method: 'PUT',
    body: jsonBody({
      totalAmount: moneyString(portfolio.totalAmount, 'کل پس‌انداز'),
      monthKey: portfolio.monthKey,
      monthlyTargetAmount: moneyString(portfolio.monthlyTargetAmount, 'هدف پس‌انداز ماهانه'),
      goals: portfolio.goals.map(goal => ({
        id: goal.id,
        name: goal.name.trim(),
        allocatedAmount: moneyString(goal.allocatedAmount, `تخصیص ${goal.name}`),
        monthlyContribution: moneyString(goal.monthlyContribution ?? 0, `مبلغ ماهانه ${goal.name}`),
        targetAmount: goal.targetAmount === null ? null : moneyString(goal.targetAmount, `هدف ${goal.name}`, true),
        targetDate: goal.targetDate ? jalaliToIsoDate(goal.targetDate) : null,
        completed: goal.completed,
        progressHistory: goal.progressHistory.map(item => ({
          monthKey: item.monthKey,
          amount: moneyString(item.amount, `پیشرفت ${goal.name}`),
        })),
      })),
    }),
  });
}

export async function saveCloudAppSettings(_userId: string, settings: DevSettings) {
  await apiRequest('/api/v1/settings', {
    method: 'PUT',
    body: jsonBody({
      locale: 'fa-IR',
      theme: 'light',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tehran',
      settings,
    }),
  });
}

export async function saveNotificationDevice(_userId: string, token: string) {
  await apiRequest('/api/v1/notification-device', {
    method: 'PUT',
    body: jsonBody({ token, enabled: true, platform: 'web' }),
  });
}

function mapReviewComment(row: Record<string, unknown>): DesignReviewComment {
  return {
    id: String(row.id),
    pageKey: String(row.pageKey ?? row.page_key),
    componentKey: String(row.componentKey ?? row.component_key ?? ''),
    commentText: String(row.commentText ?? row.comment_text),
    priority: row.priority as ReviewPriority,
    status: row.status as ReviewStatus,
    createdBy: String(row.createdBy ?? row.created_by ?? ''),
    createdAt: String(row.createdAt ?? row.created_at),
    updatedAt: String(row.updatedAt ?? row.updated_at),
  };
}

export async function loadDesignReviewComments() {
  const data = await apiRequest<{ comments: Record<string, unknown>[] }>('/api/v1/review-comments');
  return (data.comments || []).map(mapReviewComment);
}

export async function createDesignReviewComment(_userId: string, input: Omit<DesignReviewComment, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) {
  const data = await apiRequest<{ comment: Record<string, unknown> }>('/api/v1/review-comments', {
    method: 'POST',
    body: jsonBody(input),
  });
  return mapReviewComment(data.comment);
}

export async function updateDesignReviewComment(id: string, input: Pick<DesignReviewComment, 'componentKey' | 'commentText' | 'priority' | 'status'>) {
  const data = await apiRequest<{ comment: Record<string, unknown> }>(`/api/v1/review-comments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: jsonBody(input),
  });
  return mapReviewComment(data.comment);
}

export async function deleteDesignReviewComment(id: string) {
  await apiRequest(`/api/v1/review-comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function migrationCompleted(_userId: string, migrationKey: string) {
  try {
    const data = await apiRequest<{ completed?: boolean; migration?: { status?: string } | null }>(`/api/v1/migrations/${encodeURIComponent(migrationKey)}`);
    return data.completed === true || data.migration?.status === 'completed';
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
}

export async function markMigration(
  _userId: string,
  migrationKey: string,
  status: 'started' | 'completed' | 'failed',
  counts: Record<string, number> = {},
  errorMessage?: string,
) {
  await apiRequest(`/api/v1/migrations/${encodeURIComponent(migrationKey)}`, {
    method: 'PUT',
    body: jsonBody({ status, migratedCounts: counts, errorMessage: errorMessage || null }),
  });
}
