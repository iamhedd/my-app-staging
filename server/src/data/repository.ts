import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { withUserContext } from '../db.js';
import { HttpError } from '../errors.js';
import type {
  BudgetInput,
  CategoryInput,
  FinancialPlanInput,
  MigrationRunInput,
  NotificationDeviceInput,
  ProfileInput,
  ReviewCommentInput,
  ReviewCommentUpdateInput,
  SavingsPortfolioInput,
  SettingsInput,
  TransactionInput,
} from './schemas.js';

type DatabaseRow = Record<string, unknown>;

function text(value: unknown) {
  return value == null ? null : String(value);
}

function mapProfile(row: DatabaseRow | undefined) {
  if (!row) return null;
  return {
    name: String(row.full_name),
    avatarUrl: text(row.avatar_url),
  };
}

function mapPlan(row: DatabaseRow | undefined) {
  if (!row) return null;
  return {
    monthlyIncome: String(row.monthly_income),
    savingsPercentBps: Number(row.savings_percent_bps),
    savingsTargetAmount: String(row.savings_target_amount),
    currency: String(row.currency),
    onboardingCompleted: Boolean(row.onboarding_completed),
    reminder: {
      enabled: Boolean(row.reminder_enabled),
      time: String(row.reminder_time).slice(0, 5),
      timezone: String(row.timezone),
    },
    updatedAt: row.updated_at,
  };
}

function mapCategory(row: DatabaseRow) {
  return {
    id: String(row.client_id),
    name: String(row.name),
    percentageBps: Number(row.percentage_bps),
    amount: String(row.amount),
    allocationMode: String(row.allocation_mode),
    color: String(row.color),
    icon: String(row.icon),
  };
}

function mapTransaction(row: DatabaseRow) {
  return {
    id: String(row.legacy_id),
    title: String(row.title),
    category: String(row.category_name),
    amount: String(row.amount),
    type: String(row.type),
    date: String(row.transaction_date),
    recurrence: String(row.recurrence),
    generatedFrom: text(row.generated_from_legacy_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBudget(row: DatabaseRow) {
  return {
    category: String(row.category_name),
    periodType: String(row.period_type),
    periodKey: String(row.period_key),
    limitAmount: String(row.limit_amount),
    isOverride: Boolean(row.is_override),
  };
}

function mapSavingsPortfolio(account: DatabaseRow | undefined, goals: DatabaseRow[]) {
  if (!account) return null;
  return {
    totalAmount: String(account.total_amount),
    monthKey: String(account.target_month_key),
    monthlyTargetAmount: String(account.monthly_target_amount),
    goals: goals.map(row => ({
      id: String(row.client_id),
      name: String(row.name),
      allocatedAmount: String(row.allocated_amount),
      monthlyContribution: String(row.monthly_contribution ?? 0),
      targetAmount: row.target_amount == null ? null : String(row.target_amount),
      targetDate: row.target_date == null ? null : String(row.target_date),
      completed: Boolean(row.completed),
      progressHistory: Array.isArray(row.progress_history)
        ? row.progress_history.map(item => {
          const progress = item as Record<string, unknown>;
          return { monthKey: String(progress.monthKey), amount: String(progress.amount) };
        })
        : [],
    })),
    updatedAt: account.updated_at,
  };
}

function mapReviewComment(row: DatabaseRow) {
  return {
    id: String(row.id),
    pageKey: String(row.page_key),
    componentKey: text(row.component_key) ?? '',
    commentText: String(row.comment_text),
    priority: String(row.priority),
    status: String(row.status),
    createdBy: String(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMigrationRun(row: DatabaseRow | undefined) {
  if (!row) return null;
  return {
    key: String(row.migration_key),
    sourceHash: text(row.source_hash),
    status: String(row.status),
    migratedCounts: row.migrated_counts as Record<string, number>,
    errorMessage: text(row.error_message),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function roleFor(client: PoolClient, userId: string) {
  const result = await client.query('select role from user_roles where user_id = $1', [userId]);
  return result.rows[0]?.role === 'admin' ? 'admin' : 'user';
}

async function assertAdmin(client: PoolClient) {
  const result = await client.query<{ is_admin: boolean }>('select public.is_app_admin() as is_admin');
  if (!result.rows[0]?.is_admin) throw new HttpError(403, 'ADMIN_REQUIRED', 'این بخش فقط برای مدیر در دسترس است.');
}

export async function isAdminUser(userId: string) {
  return withUserContext(userId, async client => {
    const result = await client.query<{ is_admin: boolean }>('select public.is_app_admin() as is_admin');
    return result.rows[0]?.is_admin === true;
  });
}

export async function getBootstrap(userId: string) {
  return withUserContext(userId, async client => {
    const profile = await client.query('select full_name, avatar_url from profiles where user_id = $1', [userId]);
    const plan = await client.query('select * from financial_plans where user_id = $1', [userId]);
    const categories = await client.query('select * from categories where user_id = $1 order by sort_order, created_at', [userId]);
    const transactions = await client.query('select * from transactions where user_id = $1 order by transaction_date desc, created_at desc', [userId]);
    const budgets = await client.query('select * from budgets where user_id = $1 order by period_type, period_key, category_name', [userId]);
    const settings = await client.query('select locale, theme, timezone, settings from user_settings where user_id = $1', [userId]);
    const savingsAccount = await client.query('select * from savings_accounts where user_id = $1', [userId]);
    const savingsGoals = await client.query('select * from savings_goals where user_id = $1 order by sort_order, created_at', [userId]);

    return {
      profile: mapProfile(profile.rows[0]),
      role: await roleFor(client, userId),
      financialPlan: mapPlan(plan.rows[0]),
      categories: categories.rows.map(mapCategory),
      transactions: transactions.rows.map(mapTransaction),
      budgets: budgets.rows.map(mapBudget),
      settings: settings.rows[0] ?? null,
      savingsPortfolio: mapSavingsPortfolio(savingsAccount.rows[0], savingsGoals.rows),
    };
  });
}

export async function saveProfile(userId: string, input: ProfileInput) {
  return withUserContext(userId, async client => {
    const result = await client.query(
      `insert into profiles (user_id, full_name, avatar_url)
       values ($1, $2, $3)
       on conflict (user_id) do update set full_name = excluded.full_name, avatar_url = excluded.avatar_url
       returning full_name, avatar_url`,
      [userId, input.name, input.avatarUrl],
    );
    return mapProfile(result.rows[0]);
  });
}

export async function saveFinancialPlan(userId: string, input: FinancialPlanInput) {
  return withUserContext(userId, async client => {
    const result = await client.query(
      `insert into financial_plans
       (user_id, monthly_income, savings_percent_bps, savings_target_amount, currency, onboarding_completed, reminder_enabled, reminder_time, timezone)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (user_id) do update set
         monthly_income = excluded.monthly_income,
         savings_percent_bps = excluded.savings_percent_bps,
         savings_target_amount = excluded.savings_target_amount,
         currency = excluded.currency,
         onboarding_completed = excluded.onboarding_completed,
         reminder_enabled = excluded.reminder_enabled,
         reminder_time = excluded.reminder_time,
         timezone = excluded.timezone
       returning *`,
      [
        userId,
        input.monthlyIncome,
        input.savingsPercentBps,
        input.savingsTargetAmount ?? (BigInt(input.monthlyIncome) * BigInt(input.savingsPercentBps) / 10_000n).toString(),
        input.currency,
        input.onboardingCompleted,
        input.reminder.enabled,
        input.reminder.time,
        input.reminder.timezone,
      ],
    );
    return mapPlan(result.rows[0]);
  });
}

export async function replaceCategories(userId: string, categories: CategoryInput[]) {
  return withUserContext(userId, async client => {
    const plan = await client.query(
      'select monthly_income, savings_percent_bps, savings_target_amount from financial_plans where user_id = $1 for update',
      [userId],
    );
    if (!plan.rows[0]) throw new HttpError(409, 'FINANCIAL_PLAN_REQUIRED', 'ابتدا برنامه مالی را ثبت کنید.');

    const income = BigInt(plan.rows[0].monthly_income);
    const savingsTarget = BigInt(plan.rows[0].savings_target_amount);
    const spendable = income - savingsTarget;
    const totalAmount = categories.reduce((sum, category) => sum + BigInt(category.amount), 0n);
    const totalPercentageBps = categories.reduce((sum, category) => sum + category.percentageBps, 0);
    if (totalAmount > spendable || totalPercentageBps > 10_000) {
      throw new HttpError(422, 'BUDGET_EXCEEDS_SPENDABLE', 'مجموع بودجه دسته‌ها از مبلغ قابل‌خرج بیشتر است.');
    }

    await client.query('delete from categories where user_id = $1', [userId]);
    for (const [index, category] of categories.entries()) {
      await client.query(
        `insert into categories
         (user_id, client_id, name, percentage_bps, amount, allocation_mode, color, icon, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          category.id,
          category.name,
          category.percentageBps,
          category.amount,
          category.allocationMode,
          category.color,
          category.icon,
          index,
        ],
      );
    }
    return categories;
  });
}

export async function createTransaction(userId: string, input: TransactionInput) {
  const legacyId = randomUUID();
  return withUserContext(userId, async client => {
    const result = await client.query(
      `insert into transactions
       (user_id, legacy_id, title, category_name, amount, type, transaction_date, recurrence, generated_from_legacy_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning *`,
      [userId, legacyId, input.title, input.category, input.amount, input.type, input.date, input.recurrence, input.generatedFrom],
    );
    return mapTransaction(result.rows[0]);
  });
}

export async function saveTransaction(userId: string, legacyId: string, input: TransactionInput) {
  return withUserContext(userId, async client => {
    const result = await client.query(
      `insert into transactions
       (user_id, legacy_id, title, category_name, amount, type, transaction_date, recurrence, generated_from_legacy_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (user_id, legacy_id) do update set
         title = excluded.title,
         category_name = excluded.category_name,
         amount = excluded.amount,
         type = excluded.type,
         transaction_date = excluded.transaction_date,
         recurrence = excluded.recurrence,
         generated_from_legacy_id = excluded.generated_from_legacy_id
       returning *`,
      [userId, legacyId, input.title, input.category, input.amount, input.type, input.date, input.recurrence, input.generatedFrom],
    );
    return mapTransaction(result.rows[0]);
  });
}

export async function deleteTransaction(userId: string, legacyId: string) {
  return withUserContext(userId, async client => {
    const result = await client.query(
      'delete from transactions where user_id = $1 and legacy_id = $2 returning legacy_id',
      [userId, legacyId],
    );
    if (!result.rowCount) throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'تراکنش پیدا نشد.');
  });
}

export async function replaceBudgets(userId: string, budgets: BudgetInput[]) {
  return withUserContext(userId, async client => {
    await client.query('delete from budgets where user_id = $1', [userId]);
    for (const budget of budgets) {
      await client.query(
        `insert into budgets (user_id, category_name, period_type, period_key, limit_amount, is_override)
         values ($1, $2, $3, $4, $5, $6)`,
        [userId, budget.category, budget.periodType, budget.periodKey, budget.limitAmount, budget.isOverride],
      );
    }
    return budgets;
  });
}

export async function saveSavingsPortfolio(userId: string, input: SavingsPortfolioInput) {
  return withUserContext(userId, async client => {
    const existingGoals = await client.query('select client_id, progress_history from savings_goals where user_id = $1', [userId]);
    const progressByGoal = new Map(existingGoals.rows.map(row => [String(row.client_id), Array.isArray(row.progress_history) ? row.progress_history : []]));
    const account = await client.query(
      `insert into savings_accounts
       (user_id, total_amount, target_month_key, monthly_target_amount)
       values ($1, $2, $3, $4)
       on conflict (user_id) do update set
         total_amount = excluded.total_amount,
         target_month_key = excluded.target_month_key,
         monthly_target_amount = excluded.monthly_target_amount
       returning *`,
      [userId, input.totalAmount, input.monthKey, input.monthlyTargetAmount],
    );
    await client.query('delete from savings_goals where user_id = $1', [userId]);
    for (const [index, goal] of input.goals.entries()) {
      const progressHistory = goal.progressHistory ?? progressByGoal.get(goal.id) ?? [];
      await client.query(
        `insert into savings_goals
         (user_id, client_id, name, allocated_amount, monthly_contribution, target_amount, target_date, completed, progress_history, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
        [userId, goal.id, goal.name, goal.allocatedAmount, goal.monthlyContribution, goal.targetAmount, goal.targetDate, goal.completed, JSON.stringify(progressHistory), index],
      );
    }
    const goals = await client.query('select * from savings_goals where user_id = $1 order by sort_order, created_at', [userId]);
    return mapSavingsPortfolio(account.rows[0], goals.rows);
  });
}

export async function saveSettings(userId: string, input: SettingsInput) {
  return withUserContext(userId, async client => {
    const result = await client.query(
      `insert into user_settings (user_id, locale, theme, timezone, settings)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set
         locale = excluded.locale,
         theme = excluded.theme,
         timezone = excluded.timezone,
         settings = excluded.settings
       returning locale, theme, timezone, settings`,
      [userId, input.locale, input.theme, input.timezone, input.settings],
    );
    return result.rows[0];
  });
}

export async function saveNotificationDevice(userId: string, input: NotificationDeviceInput) {
  return withUserContext(userId, async client => {
    const result = await client.query(
      `insert into notification_devices (user_id, fcm_token, enabled, platform, last_seen_at)
       values ($1, $2, $3, $4, now())
       on conflict (user_id, fcm_token) do update set
         enabled = excluded.enabled,
         platform = excluded.platform,
         last_seen_at = now()
       returning id, enabled, platform, last_seen_at`,
      [userId, input.token, input.enabled, input.platform],
    );
    return result.rows[0];
  });
}

export async function listReviewComments(userId: string) {
  return withUserContext(userId, async client => {
    await assertAdmin(client);
    const result = await client.query('select * from design_review_comments order by created_at, id');
    return result.rows.map(mapReviewComment);
  });
}

export async function createReviewComment(userId: string, input: ReviewCommentInput) {
  return withUserContext(userId, async client => {
    await assertAdmin(client);
    const result = await client.query(
      `insert into design_review_comments
       (page_key, component_key, comment_text, priority, status, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [input.pageKey, input.componentKey || null, input.commentText, input.priority, input.status, userId],
    );
    return mapReviewComment(result.rows[0]);
  });
}

export async function updateReviewComment(userId: string, id: string, input: ReviewCommentUpdateInput) {
  return withUserContext(userId, async client => {
    await assertAdmin(client);
    const result = await client.query(
      `update design_review_comments set
         component_key = $2,
         comment_text = $3,
         priority = $4,
         status = $5
       where id = $1
       returning *`,
      [id, input.componentKey || null, input.commentText, input.priority, input.status],
    );
    if (!result.rows[0]) throw new HttpError(404, 'REVIEW_COMMENT_NOT_FOUND', 'کامنت بازبینی پیدا نشد.');
    return mapReviewComment(result.rows[0]);
  });
}

export async function deleteReviewComment(userId: string, id: string) {
  return withUserContext(userId, async client => {
    await assertAdmin(client);
    const result = await client.query('delete from design_review_comments where id = $1 returning id', [id]);
    if (!result.rowCount) throw new HttpError(404, 'REVIEW_COMMENT_NOT_FOUND', 'کامنت بازبینی پیدا نشد.');
  });
}

export async function getMigrationRun(userId: string, key: string) {
  return withUserContext(userId, async client => {
    const result = await client.query(
      'select * from migration_runs where user_id = $1 and migration_key = $2',
      [userId, key],
    );
    return mapMigrationRun(result.rows[0]);
  });
}

export async function saveMigrationRun(userId: string, key: string, input: MigrationRunInput) {
  return withUserContext(userId, async client => {
    const result = await client.query(
      `insert into migration_runs
       (user_id, migration_key, source_hash, status, migrated_counts, error_message)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, migration_key) do update set
         source_hash = excluded.source_hash,
         status = excluded.status,
         migrated_counts = excluded.migrated_counts,
         error_message = excluded.error_message
       returning *`,
      [userId, key, input.sourceHash, input.status, input.migratedCounts, input.errorMessage],
    );
    return mapMigrationRun(result.rows[0]);
  });
}
