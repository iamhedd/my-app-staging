export type SavingsGoal = {
  id: string;
  name: string;
  allocatedAmount: number;
  targetAmount: number | null;
  targetDate: string | null;
  completed: boolean;
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
  if (portfolio.goals.some(goal => goal.targetAmount !== null && (!Number.isSafeInteger(goal.targetAmount) || goal.targetAmount <= 0))) return 'مبلغ نهایی هدف باید بیشتر از صفر باشد.';
  if (allocatedSavings(portfolio) > portfolio.totalAmount) return 'مجموع مبالغ هدف‌ها نمی‌تواند از کل پس‌انداز بیشتر باشد.';
  return null;
}

export function createSavingsPortfolio(totalAmount: number, monthKey: string): SavingsPortfolio {
  return { totalAmount, monthKey, monthlyTargetAmount: totalAmount, goals: [], updatedAt: new Date().toISOString() };
}

export function onboardingSavingsBalance(existingTotal: number, enteredAmount: number) {
  return Math.max(0, existingTotal, enteredAmount);
}
