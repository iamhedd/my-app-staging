import { z } from 'zod';

// The current web client still converts values to Number for display. Keeping
// persisted money within Number.MAX_SAFE_INTEGER prevents silent rounding.
const MAX_MONEY = 9_007_199_254_740_991n;

export const moneySchema = z
  .union([
    z.string().trim().regex(/^\d+$/, 'مبلغ باید یک عدد صحیح و مثبت باشد.'),
    z.number().int().nonnegative().safe(),
  ])
  .transform(value => BigInt(String(value)).toString())
  .refine(value => BigInt(value) <= MAX_MONEY, 'مبلغ از محدوده مجاز بزرگ‌تر است.');

export const positiveMoneySchema = moneySchema.refine(value => BigInt(value) > 0n, 'مبلغ باید بیشتر از صفر باشد.');

const clientIdSchema = z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N}_.:-]+$/u, 'شناسه معتبر نیست.');
const colorSchema = z.string().trim().regex(/^#[0-9a-f]{6}$/i, 'رنگ معتبر نیست.');
const avatarSchema = z.string().trim().max(2_048).refine(value => {
  if (value.startsWith('/')) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'آدرس تصویر معتبر نیست.');

export const profileInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  avatarUrl: avatarSchema.nullable(),
}).strict();

export const financialPlanInputSchema = z.object({
  monthlyIncome: positiveMoneySchema,
  savingsPercentBps: z.number().int().min(0).max(10_000),
  savingsTargetAmount: moneySchema.optional(),
  currency: z.literal('TOMAN').default('TOMAN'),
  onboardingCompleted: z.boolean(),
  reminder: z.object({
    enabled: z.boolean(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().trim().min(1).max(100),
  }).strict(),
}).strict().superRefine((plan, context) => {
  if (plan.savingsTargetAmount !== undefined && BigInt(plan.savingsTargetAmount) > BigInt(plan.monthlyIncome)) {
    context.addIssue({ code: 'custom', path: ['savingsTargetAmount'], message: 'مبلغ پس‌انداز نمی‌تواند از درآمد بیشتر باشد.' });
  }
});

export const categoryInputSchema = z.object({
  id: clientIdSchema,
  name: z.string().trim().min(1).max(80),
  percentageBps: z.number().int().min(0).max(10_000),
  amount: moneySchema,
  allocationMode: z.enum(['percentage', 'amount']),
  color: colorSchema,
  icon: z.string().trim().min(1).max(80),
}).strict();

export const categoriesInputSchema = z.object({
  categories: z.array(categoryInputSchema).max(100).superRefine((categories, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    categories.forEach((category, index) => {
      const normalizedName = category.name.toLocaleLowerCase('fa');
      if (ids.has(category.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'شناسه دسته تکراری است.' });
      if (names.has(normalizedName)) context.addIssue({ code: 'custom', path: [index, 'name'], message: 'نام دسته تکراری است.' });
      ids.add(category.id);
      names.add(normalizedName);
    });
  }),
}).strict();

export const transactionInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  amount: positiveMoneySchema,
  type: z.enum(['expense', 'income', 'savings']),
  date: z.iso.date(),
  recurrence: z.enum(['none', 'monthly']).default('none'),
  generatedFrom: clientIdSchema.nullable().default(null),
}).strict();

const savingsGoalProgressInputSchema = z.object({
  monthKey: z.string().regex(/^\d{4}\/(?:0[1-9]|1[0-2])$/),
  amount: moneySchema,
}).strict();

export const savingsGoalInputSchema = z.object({
  id: clientIdSchema,
  name: z.string().trim().min(1).max(120),
  allocatedAmount: moneySchema,
  targetAmount: positiveMoneySchema.nullable(),
  targetDate: z.iso.date().nullable(),
  completed: z.boolean(),
  progressHistory: z.array(savingsGoalProgressInputSchema).max(120).superRefine((history, context) => {
    const months = new Set<string>();
    history.forEach((item, index) => {
      if (months.has(item.monthKey)) context.addIssue({ code: 'custom', path: [index, 'monthKey'], message: 'ماه پیشرفت تکراری است.' });
      months.add(item.monthKey);
    });
  }).optional(),
}).strict();

export const savingsPortfolioInputSchema = z.object({
  totalAmount: moneySchema,
  monthKey: z.string().regex(/^\d{4}\/\d{2}$/),
  monthlyTargetAmount: moneySchema,
  goals: z.array(savingsGoalInputSchema).max(100),
}).strict().superRefine((portfolio, context) => {
  const ids = new Set<string>();
  const names = new Set<string>();
  let allocated = 0n;
  portfolio.goals.forEach((goal, index) => {
    const normalizedName = goal.name.toLocaleLowerCase('fa');
    if (ids.has(goal.id)) context.addIssue({ code: 'custom', path: ['goals', index, 'id'], message: 'شناسه هدف تکراری است.' });
    if (names.has(normalizedName)) context.addIssue({ code: 'custom', path: ['goals', index, 'name'], message: 'نام هدف تکراری است.' });
    ids.add(goal.id);
    names.add(normalizedName);
    allocated += BigInt(goal.allocatedAmount);
  });
  if (allocated > BigInt(portfolio.totalAmount)) {
    context.addIssue({ code: 'custom', path: ['goals'], message: 'مجموع تخصیص هدف‌ها از کل پس‌انداز بیشتر است.' });
  }
});

export const budgetInputSchema = z.object({
  category: z.string().trim().min(1).max(80),
  periodType: z.enum(['monthly', 'weekly']),
  periodKey: z.string().trim().min(1).max(40),
  limitAmount: moneySchema,
  isOverride: z.boolean().default(false),
}).strict();

export const budgetsInputSchema = z.object({
  budgets: z.array(budgetInputSchema).max(1_000).superRefine((budgets, context) => {
    const keys = new Set<string>();
    budgets.forEach((budget, index) => {
      const key = `${budget.category}\u0000${budget.periodType}\u0000${budget.periodKey}`;
      if (keys.has(key)) context.addIssue({ code: 'custom', path: [index], message: 'بودجه تکراری است.' });
      keys.add(key);
    });
  }),
}).strict();

export const settingsInputSchema = z.object({
  locale: z.string().trim().min(2).max(20).default('fa-IR'),
  theme: z.enum(['light']).default('light'),
  timezone: z.string().trim().min(1).max(100),
  settings: z.record(z.string(), z.unknown()),
}).strict();

export const notificationDeviceInputSchema = z.object({
  token: z.string().trim().min(20).max(4_096),
  enabled: z.boolean().default(true),
  platform: z.enum(['web']).default('web'),
}).strict();

export const legacyIdParamSchema = z.object({
  legacyId: clientIdSchema,
});

export const reviewCommentInputSchema = z.object({
  pageKey: z.string().trim().min(1).max(80),
  componentKey: z.string().trim().max(160).nullable().default(null),
  commentText: z.string().trim().min(1).max(4_000),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['open', 'in_progress', 'resolved']),
}).strict();

export const reviewCommentUpdateSchema = reviewCommentInputSchema.omit({ pageKey: true });

export const reviewCommentIdParamSchema = z.object({
  id: z.uuid(),
});

export const migrationKeyParamSchema = z.object({
  key: z.string().trim().min(1).max(220),
});

export const migrationRunInputSchema = z.object({
  status: z.enum(['started', 'completed', 'failed']),
  sourceHash: z.string().trim().max(128).nullable().default(null),
  migratedCounts: z.record(z.string().trim().min(1).max(100), z.number().int().nonnegative().safe()).default({}),
  errorMessage: z.string().trim().max(4_000).nullable().default(null),
}).strict().superRefine((input, context) => {
  if (input.status !== 'failed' && input.errorMessage) {
    context.addIssue({ code: 'custom', path: ['errorMessage'], message: 'پیام خطا فقط برای وضعیت ناموفق مجاز است.' });
  }
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type FinancialPlanInput = z.infer<typeof financialPlanInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type SavingsPortfolioInput = z.infer<typeof savingsPortfolioInputSchema>;
export type BudgetInput = z.infer<typeof budgetInputSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;
export type NotificationDeviceInput = z.infer<typeof notificationDeviceInputSchema>;
export type ReviewCommentInput = z.infer<typeof reviewCommentInputSchema>;
export type ReviewCommentUpdateInput = z.infer<typeof reviewCommentUpdateSchema>;
export type MigrationRunInput = z.infer<typeof migrationRunInputSchema>;
