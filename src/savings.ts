import { jalaliToDate, shiftJalaliMonth, todayJalali } from './dateUtils';

export type SavingsGoalProgress = {
  monthKey: string;
  amount: number;
};

export type SavingsGoal = {
  id: string;
  name: string;
  allocatedAmount: number;
  monthlyContribution?: number;
  targetAmount: number | null;
  targetDate: string | null;
  completed: boolean;
  progressHistory: SavingsGoalProgress[];
};

export type SavingsGoalProjection = {
  remainingAmount: number;
  monthsUntilTarget: number | null;
  requiredMonthlyAmount: number | null;
  projectedMonths: number | null;
  projectedMonthKey: string | null;
  pacePercent: number | null;
  status: 'incomplete' | 'completed' | 'no-contribution' | 'on-track' | 'behind' | 'overdue' | 'estimating';
};

export type SavingsPortfolio = {
  totalAmount: number;
  monthKey: string;
  monthlyTargetAmount: number;
  goals: SavingsGoal[];
  updatedAt: string;
};

export function allocatedSavings(portfolio: SavingsPortfolio | null) {
  return portfolio?.goals.reduce((sum, goal) => sum + goal.allocatedAmount, 0) ?? 0;
}

export function unallocatedSavings(portfolio: SavingsPortfolio | null) {
  return Math.max(0, (portfolio?.totalAmount ?? 0) - allocatedSavings(portfolio));
}

export function validateSavingsPortfolio(portfolio: SavingsPortfolio) {
  if (!Number.isSafeInteger(portfolio.totalAmount) || portfolio.totalAmount < 0) return 'کل پس‌انداز معتبر نیست.';
  if (!Number.isSafeInteger(portfolio.monthlyTargetAmount) || portfolio.monthlyTargetAmount < 0) return 'هدف ماهانه معتبر نیست.';
  if (!/^\d{4}\/\d{2}$/.test(portfolio.monthKey)) return 'ماه هدف معتبر نیست.';
  if (portfolio.goals.some(goal => !goal.name.trim())) return 'نام همه هدف‌ها باید مشخص باشد.';
  if (new Set(portfolio.goals.map(goal => goal.name.trim().toLocaleLowerCase('fa'))).size !== portfolio.goals.length) return 'نام هدف‌ها نباید تکراری باشد.';
  if (portfolio.goals.some(goal => !Number.isSafeInteger(goal.allocatedAmount) || goal.allocatedAmount < 0)) return 'مبلغ تخصیص هدف معتبر نیست.';
  if (portfolio.goals.some(goal => !Number.isSafeInteger(goal.monthlyContribution ?? 0) || (goal.monthlyContribution ?? 0) < 0)) return 'مبلغ ماهانه هدف معتبر نیست.';
  if (portfolio.goals.some(goal => goal.targetAmount !== null && (!Number.isSafeInteger(goal.targetAmount) || goal.targetAmount <= 0))) return 'مبلغ نهایی هدف باید بیشتر از صفر باشد.';
  if (portfolio.goals.some(goal => !Array.isArray(goal.progressHistory))) return 'تاریخچه پیشرفت هدف معتبر نیست.';
  for (const goal of portfolio.goals) {
    const months = new Set<string>();
    for (const progress of goal.progressHistory) {
      if (!/^\d{4}\/(?:0[1-9]|1[0-2])$/.test(progress.monthKey) || !Number.isSafeInteger(progress.amount) || progress.amount < 0) return 'تاریخچه پیشرفت هدف معتبر نیست.';
      if (months.has(progress.monthKey)) return 'تاریخچه پیشرفت هدف نباید ماه تکراری داشته باشد.';
      months.add(progress.monthKey);
    }
  }
  if (allocatedSavings(portfolio) > portfolio.totalAmount) return 'مجموع مبالغ هدف‌ها نمی‌تواند از کل پس‌انداز بیشتر باشد.';
  return null;
}

export function savingsGoalProjection(goal: SavingsGoal, now = new Date()): SavingsGoalProjection {
  const targetAmount = goal.targetAmount;
  const monthlyContribution = goal.monthlyContribution ?? 0;
  if (!targetAmount) {
    return { remainingAmount: 0, monthsUntilTarget: null, requiredMonthlyAmount: null, projectedMonths: null, projectedMonthKey: null, pacePercent: null, status: 'incomplete' };
  }

  const remainingAmount = Math.max(0, targetAmount - goal.allocatedAmount);
  if (remainingAmount === 0 || goal.completed) {
    return { remainingAmount, monthsUntilTarget: 0, requiredMonthlyAmount: 0, projectedMonths: 0, projectedMonthKey: null, pacePercent: 100, status: 'completed' };
  }

  const target = goal.targetDate ? jalaliToDate(goal.targetDate) : null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const millisecondsPerAverageMonth = 30.4375 * 24 * 60 * 60 * 1000;
  const monthsUntilTarget = target
    ? target.getTime() <= startOfToday.getTime() ? 0 : Math.max(1, Math.ceil((target.getTime() - startOfToday.getTime()) / millisecondsPerAverageMonth))
    : null;
  const requiredMonthlyAmount = monthsUntilTarget === null ? null : monthsUntilTarget > 0 ? Math.ceil(remainingAmount / monthsUntilTarget) : remainingAmount;
  const projectedMonths = monthlyContribution > 0 ? Math.ceil(remainingAmount / monthlyContribution) : null;
  const today = todayJalali(now);
  const projectedMonthKey = projectedMonths === null ? null : shiftJalaliMonth(today.year, today.month, projectedMonths).key;
  const pacePercent = requiredMonthlyAmount && requiredMonthlyAmount > 0 ? Math.round(monthlyContribution / requiredMonthlyAmount * 100) : null;
  const status = monthlyContribution <= 0
    ? 'no-contribution'
    : monthsUntilTarget === null
      ? 'estimating'
      : monthsUntilTarget === 0
        ? 'overdue'
        : monthlyContribution >= (requiredMonthlyAmount ?? Infinity) ? 'on-track' : 'behind';

  return { remainingAmount, monthsUntilTarget, requiredMonthlyAmount, projectedMonths, projectedMonthKey, pacePercent, status };
}

export function formatSavingsDuration(months: number | null) {
  if (months === null) return 'نامشخص';
  if (months <= 0) return 'همین حالا';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const parts = [];
  if (years) parts.push(`${new Intl.NumberFormat('fa-IR').format(years)} سال`);
  if (remainingMonths) parts.push(`${new Intl.NumberFormat('fa-IR').format(remainingMonths)} ماه`);
  return parts.join(' و ');
}

export function withGoalProgressSnapshot(portfolio: SavingsPortfolio, monthKey: string): SavingsPortfolio {
  return {
    ...portfolio,
    goals: portfolio.goals.map(goal => {
      const history = (goal.progressHistory || []).filter(item => item.monthKey !== monthKey);
      return {
        ...goal,
        progressHistory: [...history, { monthKey, amount: goal.allocatedAmount }]
          .sort((left, right) => left.monthKey.localeCompare(right.monthKey, 'en')),
      };
    }),
  };
}

export function recentGoalProgress(goal: SavingsGoal, currentMonthKey: string, limit = 6) {
  const history = goal.progressHistory || [];
  const withCurrent = history.some(item => item.monthKey === currentMonthKey)
    ? history
    : [...history, { monthKey: currentMonthKey, amount: goal.allocatedAmount }];
  return [...withCurrent]
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey, 'en'))
    .slice(-limit);
}

export function createSavingsPortfolio(totalAmount: number, monthKey: string): SavingsPortfolio {
  return { totalAmount, monthKey, monthlyTargetAmount: totalAmount, goals: [], updatedAt: new Date().toISOString() };
}

export function onboardingSavingsBalance(existingTotal: number, enteredAmount: number) {
  return Math.max(0, existingTotal, enteredAmount);
}
