export type BudgetAlertLevel = 80 | 100;

export type BudgetAlertLedger = Record<string, BudgetAlertLevel>;

type AlertTransaction = {
  amount: number;
  category: string;
  date: string;
  type: string;
};

export type BudgetAlert = {
  category: string;
  key: string;
  level: BudgetAlertLevel;
  periodKey: string;
  spent: number;
  limit: number;
};

export const DEFAULT_NIGHTLY_REMINDER_TEXT = 'یادت نره مخارج امروزت رو ثبت کنی.';

export function budgetAlertLevel(spent: number, limit: number): BudgetAlertLevel | 0 {
  if (!Number.isFinite(spent) || !Number.isFinite(limit) || spent < 0 || limit <= 0) return 0;
  if (spent >= limit) return 100;
  return spent * 100 >= limit * 80 ? 80 : 0;
}

export function budgetAlertKey(periodKey: string, category: string) {
  return `${periodKey}:${category}`;
}

export function collectBudgetAlerts(
  transactions: AlertTransaction[],
  budgets: Record<string, number>,
  periodKeys: Iterable<string>,
  ledger: BudgetAlertLedger,
) {
  const alerts: BudgetAlert[] = [];
  for (const periodKey of new Set(periodKeys)) {
    for (const [category, limit] of Object.entries(budgets)) {
      if (limit <= 0) continue;
      const spent = transactions
        .filter(transaction => transaction.type === 'expense' && transaction.category === category && transaction.date.startsWith(`${periodKey}-`))
        .reduce((total, transaction) => total + transaction.amount, 0);
      const level = budgetAlertLevel(spent, limit);
      const key = budgetAlertKey(periodKey, category);
      if (level !== 0 && level > (ledger[key] || 0)) alerts.push({ category, key, level, periodKey, spent, limit });
    }
  }
  return alerts;
}

export function budgetAlertText(alert: Pick<BudgetAlert, 'category' | 'level'>) {
  return alert.level === 100
    ? `بودجه دسته «${alert.category}» به سقف تعیین‌شده رسید.`
    : `مصرف بودجه دسته «${alert.category}» به ۸۰٪ رسید.`;
}

export function shouldSendNightlyReminder(lastSentDate: string | null, today: string) {
  return Boolean(today) && lastSentDate !== today;
}
