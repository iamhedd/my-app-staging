import { clampDay, jalaliDateKey, parseJalaliDate, shiftJalaliMonth, todayJalali } from './dateUtils';

export type TxType = 'expense' | 'income' | 'savings';
export type Recurrence = 'none' | 'monthly';

export type Transaction = {
  id: string;
  title: string;
  category: string;
  amount: number;
  type: TxType;
  date: string;
  recurrence?: Recurrence;
  generatedFrom?: string;
};

export function normalizeTransactions(values: unknown): Transaction[] {
  if (!Array.isArray(values)) return [];
  return values.filter(value => value && typeof value === 'object').map(value => {
    const item = value as { id?: string | number; title?: unknown; category?: unknown; amount?: unknown; type?: string; date?: unknown; recurrence?: Recurrence; generatedFrom?: string };
    return {
      id: String(item.id ?? `${Date.now()}-${Math.random()}`),
      title: String(item.title ?? ''),
      category: item.type === 'investment' ? 'پس‌انداز' : String(item.category ?? 'سایر'),
      amount: Number(item.amount) || 0,
      type: item.type === 'investment' ? 'savings' : item.type as TxType,
      date: String(item.date ?? ''),
      recurrence: item.recurrence ?? 'none',
      generatedFrom: item.generatedFrom,
    };
  }).filter(item => item.title && item.amount > 0 && ['expense', 'income', 'savings'].includes(item.type));
}

export function materializeRecurringTransactions(items: Transaction[], now = new Date()) {
  const existingIds = new Set(items.map(item => item.id));
  const today = todayJalali(now);
  const generated: Transaction[] = [];
  for (const root of items.filter(item => item.recurrence === 'monthly' && !item.generatedFrom)) {
    const origin = parseJalaliDate(root.date);
    if (!origin) continue;
    for (let offset = 1; offset < 240; offset += 1) {
      const month = shiftJalaliMonth(origin.year, origin.month, offset);
      const day = clampDay(month.year, month.month, origin.day);
      if (month.year > today.year || (month.year === today.year && month.month > today.month) || (month.year === today.year && month.month === today.month && day > today.day)) break;
      const id = `${root.id}:${month.year}-${String(month.month).padStart(2, '0')}`;
      if (!existingIds.has(id)) generated.push({ ...root, id, date: jalaliDateKey(month.year, month.month, day), recurrence: 'none', generatedFrom: root.id });
    }
  }
  return generated.length ? [...generated, ...items] : items;
}
