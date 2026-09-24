import { describe, expect, it } from 'vitest';
import {
  addCategory, budgetsFromFinancialSetup, calculateCategoryAmounts, calculateSavingsAmount, calculateSpendableAmount, createCompletedSetup, createDefaultCategories,
  formatCompactRial, loadFinancialSetup, millisecondsUntilReminder, normalizeFinancialSetup, parseNonNegativeInteger, parsePositiveInteger, percentageToBps,
  removeCategory, saveFinancialSetup, shouldShowNewUserIntro, totalPercentageBps, validateBudgetAllocationLimit, validateFinancialSetup,
} from './financialSetup';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('financial setup calculations', () => {
  it('parses Persian and English money input as integer rials', () => {
    expect(parsePositiveInteger('۱۲٬۵۰۰٬۰۰۰')).toBe(12_500_000);
    expect(parsePositiveInteger('12500000')).toBe(12_500_000);
    expect(parsePositiveInteger('-12')).toBeNull();
    expect(parsePositiveInteger('12.5')).toBeNull();
    expect(parseNonNegativeInteger('۰')).toBe(0);
  });

  it('formats money with an automatic readable rial unit', () => {
    expect(formatCompactRial(68_000_000)).toBe('۶۸ میلیون ریال');
    expect(formatCompactRial(1_250_000_000)).toBe('۱٫۲۵ میلیارد ریال');
    expect(formatCompactRial(750_000)).toBe('۷۵۰ هزار ریال');
    expect(formatCompactRial(900)).toBe('۹۰۰ ریال');
  });

  it('stores percentage as basis points', () => {
    expect(percentageToBps('۱۲٫۵')).toBe(1250);
    expect(percentageToBps('12.50')).toBe(1250);
    expect(percentageToBps('101')).toBeNull();
  });

  it('leaves part of the spendable amount unallocated by default', () => {
    expect(totalPercentageBps(createDefaultCategories())).toBe(9_000);
  });

  it('calculates percentage and amount allocation modes in both directions', () => {
    const spendable = 24_000_000;
    const categories = createDefaultCategories().slice(0, 2);
    categories[0] = { ...categories[0], allocationMode: 'amount', amount: 10_000_000 };
    categories[1] = { ...categories[1], allocationMode: 'percentage', percentageBps: 2500 };
    const calculated = calculateCategoryAmounts(spendable, categories);
    expect(calculated[0].percentageBps).toBe(4167);
    expect(calculated[1].amount).toBe(6_000_000);
  });

  it('accepts partial allocation and blocks allocation above spendable amount', () => {
    const partial = createDefaultCategories();
    expect(validateFinancialSetup(10_000_000, 2000, partial)).toBeNull();
    expect(validateFinancialSetup(10_000_000, 2000, partial.map((item, index) => index === 0 ? { ...item, percentageBps: 4100 } : item))).toContain('بیشتر');
    expect(validateFinancialSetup(10_000_000, 10001, partial)).toContain('بین صفر تا صد');
    expect(calculateSavingsAmount(20_000_000, 2500)).toBe(5_000_000);
    expect(calculateSpendableAmount(20_000_000, 2500)).toBe(15_000_000);
    expect(calculateSavingsAmount(45_000_000, 4444, 20_000_000)).toBe(20_000_000);
    expect(calculateSpendableAmount(45_000_000, 4444, 20_000_000)).toBe(25_000_000);
  });

  it('prevents category budget edits from exceeding the spendable amount', () => {
    expect(validateBudgetAllocationLimit(10_000_000, { مسکن: 6_000_000, خوراک: 4_000_000 })).toBeNull();
    expect(validateBudgetAllocationLimit(10_000_000, { مسکن: 7_000_000, خوراک: 4_000_000 })).toContain('۱٬۰۰۰٬۰۰۰ ریال');
  });
});

describe('category management', () => {
  it('adds a custom category and ignores duplicate names', () => {
    const categories = createDefaultCategories();
    const added = addCategory(categories, 'سفر');
    expect(added).toHaveLength(categories.length + 1);
    expect(added.at(-1)?.name).toBe('سفر');
    expect(addCategory(added, 'سفر')).toBe(added);
  });

  it('removes a category by id', () => {
    const categories = createDefaultCategories();
    expect(removeCategory(categories, categories[0].id)).toHaveLength(categories.length - 1);
  });
});

describe('persistence and completion', () => {
  it('converts a cached toman plan to rial exactly once', () => {
    const plan = createCompletedSetup(200_000_000, 1000, createDefaultCategories(), { enabled: false, time: '21:00', timezone: 'Asia/Tehran' });
    const cachedToman = { ...plan, currency: 'TOMAN', monthlyIncome: 20_000_000, savingsTargetAmount: 2_000_000, categories: plan.categories.map(category => ({ ...category, amount: category.amount / 10 })) };
    const migrated = normalizeFinancialSetup(cachedToman);
    expect(migrated?.currency).toBe('IRR');
    expect(migrated?.monthlyIncome).toBe(plan.monthlyIncome);
    expect(migrated?.categories[0].amount).toBe(plan.categories[0].amount);
    expect(normalizeFinancialSetup(migrated)?.monthlyIncome).toBe(plan.monthlyIncome);
  });

  it('shows both the product intro and financial setup for every new user', () => {
    const completed = createCompletedSetup(20_000_000, 1000, createDefaultCategories(), {
      enabled: false,
      time: '21:00',
      timezone: 'Asia/Tehran',
    });
    expect(shouldShowNewUserIntro(null, false)).toBe(true);
    expect(shouldShowNewUserIntro(null, true)).toBe(false);
    expect(shouldShowNewUserIntro(completed, false)).toBe(false);
  });

  it('saves setup separately for each user and loads completion state', () => {
    const storage = memoryStorage();
    const setup = createCompletedSetup(20_000_000, 2500, createDefaultCategories(), {
      enabled: true,
      time: '21:00',
      timezone: 'Asia/Tehran',
    });
    saveFinancialSetup(storage, 'user-a', setup);
    expect(loadFinancialSetup(storage, 'user-a')?.onboardingCompleted).toBe(true);
    expect(loadFinancialSetup(storage, 'user-a')?.monthlyIncome).toBe(20_000_000);
    expect(loadFinancialSetup(storage, 'user-a')?.savingsPercentBps).toBe(2500);
    expect(loadFinancialSetup(storage, 'user-a')?.categories.reduce((sum, category) => sum + category.amount, 0)).toBe(13_500_000);
    expect(loadFinancialSetup(storage, 'user-b')).toBeNull();
  });

  it('rebuilds monthly budgets after income or savings changes', () => {
    const categories = createDefaultCategories();
    const setup = createCompletedSetup(30_000_000, 2000, categories, { enabled: false, time: '21:00', timezone: 'Asia/Tehran' });
    const budgets = budgetsFromFinancialSetup(setup);
    expect(budgets['مسکن']).toBe(7_200_000);
    expect(Object.keys(budgets)).toHaveLength(categories.length);
  });

  it('schedules a passed reminder for the next day', () => {
    const now = new Date(2026, 8, 13, 22, 0, 0);
    expect(millisecondsUntilReminder('21:00', now)).toBe(23 * 60 * 60 * 1000);
  });

  it('migrates the original setup model with zero savings', () => {
    const legacy = {
      version: 1,
      monthlyIncome: 12_000_000,
      currency: 'TOMAN',
      categories: createDefaultCategories(),
      onboardingCompleted: true,
      reminder: { enabled: false, time: '21:00', timezone: 'Asia/Tehran' },
      updatedAt: new Date().toISOString(),
    };
    const migrated = normalizeFinancialSetup(legacy);
    expect(migrated?.version).toBe(4);
    expect(migrated?.savingsPercentBps).toBe(0);
    expect(calculateSpendableAmount(migrated!.monthlyIncome, migrated!.savingsPercentBps)).toBe(120_000_000);
  });

  it('migrates a legacy amount-based target to a savings percentage', () => {
    const legacy = {
      version: 2,
      monthlyIncome: 20_000_000,
      investmentTarget: 5_000_000,
      spendableAmount: 15_000_000,
      currency: 'TOMAN',
      categories: createDefaultCategories(),
      onboardingCompleted: true,
      reminder: { enabled: false, time: '21:00', timezone: 'Asia/Tehran' },
      updatedAt: new Date().toISOString(),
    };
    expect(normalizeFinancialSetup(legacy)?.savingsPercentBps).toBe(2500);
  });

  it('migrates the previous percentage model and removes its savings category', () => {
    const legacy = {
      version: 3,
      monthlyIncome: 20_000_000,
      investmentPercentBps: 2000,
      currency: 'TOMAN',
      categories: [...createDefaultCategories(), { ...createDefaultCategories()[0], id: 'legacy-savings', name: 'پس‌انداز' }],
      onboardingCompleted: true,
      reminder: { enabled: false, time: '21:00', timezone: 'Asia/Tehran' },
      updatedAt: new Date().toISOString(),
    };
    const migrated = normalizeFinancialSetup(legacy);
    expect(migrated?.version).toBe(4);
    expect(migrated?.savingsPercentBps).toBe(2000);
    expect(migrated?.categories.some(category => category.name === 'پس‌انداز')).toBe(false);
  });
});
