import { formatRial } from './currency';

export type Currency = 'IRR';

export type SetupCategory = {
  id: string;
  name: string;
  percentageBps: number;
  amount: number;
  allocationMode: 'percentage' | 'amount';
  color: string;
  icon: string;
};

export type ExpenseReminder = {
  enabled: boolean;
  time: string;
  timezone: string;
};

export type FinancialSetup = {
  version: 4;
  monthlyIncome: number;
  savingsPercentBps: number;
  savingsTargetAmount?: number;
  currency: Currency;
  categories: SetupCategory[];
  onboardingCompleted: boolean;
  reminder: ExpenseReminder;
  updatedAt: string;
};

export function shouldShowNewUserIntro(setup: FinancialSetup | null, introShownThisSession: boolean) {
  return !setup?.onboardingCompleted && !introShownThisSession;
}

export const colorPalette = ['#DF7899', '#F2A9C0', '#BE5275', '#FBE4EC', '#707070', '#171717', '#E8E8E8', '#F6F6F6'];

const defaults = [
  ['مسکن', 3000, 'home'], ['خوراک', 2000, 'food'], ['حمل‌ونقل', 1000, 'car'],
  ['قبوض', 800, 'receipt'], ['سلامت', 700, 'health'], ['تفریح', 500, 'fun'],
  ['آموزش', 400, 'education'],
  ['خرید شخصی', 300, 'shop'], ['سایر', 300, 'other'],
] as const;

export function createDefaultCategories(): SetupCategory[] {
  return defaults.map(([name, percentageBps, icon], index) => ({
    id: `default-${index + 1}`,
    name,
    percentageBps,
    amount: 0,
    allocationMode: 'percentage',
    color: colorPalette[index % colorPalette.length],
    icon,
  }));
}

export function parsePositiveInteger(value: string) {
  const normalized = value
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٬,\s]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function parseNonNegativeInteger(value: string) {
  const normalized = value
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٬,\s]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export { formatCompactRial } from './currency';

export function percentageToBps(value: string) {
  const normalized = value.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace('٫', '.').trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(normalized)) return null;
  const bps = Math.round(Number(normalized) * 100);
  return bps >= 0 && bps <= 10000 ? bps : null;
}

export function calculateCategoryAmounts(spendableAmount: number, categories: SetupCategory[]) {
  const next = categories.map(category => ({
    ...category,
    amount: category.allocationMode === 'amount' ? category.amount : Math.round((spendableAmount * category.percentageBps) / 10000),
    percentageBps: category.allocationMode === 'amount' && spendableAmount > 0 ? Math.round(category.amount / spendableAmount * 10000) : category.percentageBps,
  }));
  const totalBps = next.reduce((sum, category) => sum + category.percentageBps, 0);
  if (totalBps === 10000 && next.length && next.every(category => category.allocationMode === 'percentage')) {
    const difference = spendableAmount - next.reduce((sum, category) => sum + category.amount, 0);
    next[next.length - 1] = { ...next[next.length - 1], amount: next[next.length - 1].amount + difference };
  }
  return next;
}

export function totalPercentageBps(categories: SetupCategory[]) {
  return categories.reduce((sum, category) => sum + category.percentageBps, 0);
}

export function addCategory(categories: SetupCategory[], name: string): SetupCategory[] {
  const cleanName = name.trim();
  if (!cleanName || categories.some(category => category.name === cleanName)) return categories;
  return [...categories, {
    id: `custom-${Date.now()}-${categories.length}`,
    name: cleanName,
    percentageBps: 0,
    amount: 0,
    allocationMode: 'percentage',
    color: colorPalette[categories.length % colorPalette.length],
    icon: 'other',
  }];
}

export function removeCategory(categories: SetupCategory[], id: string) {
  return categories.filter(category => category.id !== id);
}

export function calculateSavingsAmount(monthlyIncome: number, savingsPercentBps: number, savingsTargetAmount?: number) {
  if (Number.isSafeInteger(savingsTargetAmount) && savingsTargetAmount! >= 0 && savingsTargetAmount! <= monthlyIncome) return savingsTargetAmount!;
  return Math.round(monthlyIncome * savingsPercentBps / 10000);
}

export function calculateSpendableAmount(monthlyIncome: number, savingsPercentBps: number, savingsTargetAmount?: number) {
  return monthlyIncome - calculateSavingsAmount(monthlyIncome, savingsPercentBps, savingsTargetAmount);
}

export function validateBudgetAllocationLimit(spendableAmount: number, budgets: Record<string, number>) {
  const allocatedAmount = Object.values(budgets).reduce((sum, amount) => sum + Math.max(0, amount || 0), 0);
  if (allocatedAmount <= spendableAmount) return null;
  return `${formatRial(allocatedAmount - spendableAmount)} بیشتر از مبلغ قابل‌خرج بودجه تعیین شده است.`;
}

export function validateFinancialSetup(monthlyIncome: number, savingsPercentBps: number, categories: SetupCategory[], savingsTargetAmount?: number) {
  if (!Number.isSafeInteger(monthlyIncome) || monthlyIncome <= 0) return 'درآمد ماهانه باید یک عدد مثبت باشد.';
  if (!Number.isSafeInteger(savingsPercentBps) || savingsPercentBps < 0 || savingsPercentBps > 10000) return 'درصد پس‌انداز باید بین صفر تا صد باشد.';
  if (!categories.length) return 'حداقل یک دسته‌ی بودجه لازم است.';
  if (categories.some(category => !category.name.trim())) return 'نام همه‌ی دسته‌ها باید مشخص باشد.';
  if (new Set(categories.map(category => category.name.trim())).size !== categories.length) return 'نام دسته‌ها نباید تکراری باشد.';
  if (savingsTargetAmount !== undefined && (!Number.isSafeInteger(savingsTargetAmount) || savingsTargetAmount < 0 || savingsTargetAmount > monthlyIncome)) return 'مبلغ پس‌انداز باید بین صفر و درآمد ماهانه باشد.';
  const spendableAmount = calculateSpendableAmount(monthlyIncome, savingsPercentBps, savingsTargetAmount);
  const calculated = calculateCategoryAmounts(spendableAmount, categories);
  const allocatedAmount = calculated.reduce((sum, category) => sum + category.amount, 0);
  if (allocatedAmount > spendableAmount) return `${formatRial(allocatedAmount - spendableAmount)} بیشتر از مبلغ قابل‌خرج تخصیص داده شده است.`;
  return null;
}

export function createCompletedSetup(monthlyIncome: number, savingsPercentBps: number, categories: SetupCategory[], reminder: ExpenseReminder, savingsTargetAmount?: number): FinancialSetup {
  const spendableAmount = calculateSpendableAmount(monthlyIncome, savingsPercentBps, savingsTargetAmount);
  return {
    version: 4,
    monthlyIncome,
    savingsPercentBps,
    savingsTargetAmount: calculateSavingsAmount(monthlyIncome, savingsPercentBps, savingsTargetAmount),
    currency: 'IRR',
    categories: calculateCategoryAmounts(spendableAmount, categories),
    onboardingCompleted: true,
    reminder,
    updatedAt: new Date().toISOString(),
  };
}

export function budgetsFromFinancialSetup(setup: FinancialSetup) {
  return Object.fromEntries(setup.categories.map(category => [category.name, category.amount]));
}

export function setupStorageKey(userKey: string) {
  return `gav-financial-setup-v1:${userKey}`;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function saveFinancialSetup(storage: StorageLike, userKey: string, setup: FinancialSetup) {
  storage.setItem(setupStorageKey(userKey), JSON.stringify(setup));
}

export function loadFinancialSetup(storage: StorageLike, userKey: string): FinancialSetup | null {
  const raw = storage.getItem(setupStorageKey(userKey));
  if (!raw) return null;
  try {
    return normalizeFinancialSetup(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalizeFinancialSetup(value: unknown): FinancialSetup | null {
  if (!value || typeof value !== 'object') return null;
  const setup = value as Partial<FinancialSetup>;
  const version = Number((value as { version?: unknown }).version);
  if (!Number.isSafeInteger(setup.monthlyIncome) || (setup.monthlyIncome ?? 0) <= 0 || !Array.isArray(setup.categories) || !setup.reminder) return null;
  if (setup.currency !== 'IRR' && ((setup.monthlyIncome ?? 0) > Number.MAX_SAFE_INTEGER / 10 || (setup.savingsTargetAmount ?? 0) > Number.MAX_SAFE_INTEGER / 10 || setup.categories.some(category => category.amount > Number.MAX_SAFE_INTEGER / 10))) return null;
  if (version === 4 && Number.isSafeInteger(setup.savingsPercentBps)) return {
    ...(setup as FinancialSetup),
    monthlyIncome: setup.currency === 'IRR' ? setup.monthlyIncome! : setup.monthlyIncome! * 10,
    savingsTargetAmount: setup.currency === 'IRR'
      ? calculateSavingsAmount(setup.monthlyIncome!, setup.savingsPercentBps!, setup.savingsTargetAmount)
      : calculateSavingsAmount(setup.monthlyIncome!, setup.savingsPercentBps!, setup.savingsTargetAmount) * 10,
    currency: 'IRR',
    categories: setup.categories!.map(category => ({ ...category, amount: setup.currency === 'IRR' ? category.amount : category.amount * 10, allocationMode: category.allocationMode || 'percentage' })),
  };
  if (version === 3) {
    const legacy = value as { investmentPercentBps?: number };
    return normalizeFinancialSetup({
      ...setup,
      version: 4,
      savingsPercentBps: legacy.investmentPercentBps || 0,
      categories: setup.categories!.filter(category => category.name !== 'پس‌انداز').map(category => ({ ...category, allocationMode: category.allocationMode || 'percentage' })),
    });
  }
  if (version === 2) {
    const legacy = value as { monthlyIncome: number; investmentTarget?: number };
    return normalizeFinancialSetup({
      ...setup,
      version: 4,
      savingsPercentBps: Math.max(0, Math.min(10000, Math.round(((legacy.investmentTarget || 0) / legacy.monthlyIncome) * 10000))),
      categories: setup.categories!.filter(category => category.name !== 'پس‌انداز').map(category => ({ ...category, allocationMode: 'percentage' })),
    });
  }
  if (version === 1) {
    return normalizeFinancialSetup({
      ...setup,
      version: 4,
      savingsPercentBps: 0,
      categories: setup.categories!.filter(category => category.name !== 'پس‌انداز').map(category => ({ ...category, allocationMode: 'percentage' })),
    });
  }
  return null;
}

export function millisecondsUntilReminder(time: string, now = new Date()) {
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}
