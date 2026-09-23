alter table public.savings_goals
  add column if not exists monthly_contribution bigint not null default 0;

alter table public.savings_goals
  drop constraint if exists savings_goals_monthly_contribution_range;
alter table public.savings_goals
  add constraint savings_goals_monthly_contribution_range
  check (monthly_contribution between 0 and 9007199254740991);
