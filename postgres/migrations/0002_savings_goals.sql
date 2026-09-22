alter table public.financial_plans
  add column if not exists savings_target_amount bigint not null default 0;

update public.financial_plans
set savings_target_amount = round(monthly_income::numeric * savings_percent_bps / 10000)::bigint
where savings_target_amount = 0 and savings_percent_bps > 0;

alter table public.financial_plans
  drop constraint if exists financial_plans_savings_target_range;
alter table public.financial_plans
  add constraint financial_plans_savings_target_range
  check (savings_target_amount between 0 and monthly_income);

create table if not exists public.savings_accounts (
  user_id text primary key references public.users(id) on delete cascade,
  total_amount bigint not null default 0,
  target_month_key text not null,
  monthly_target_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_accounts_total_range check (total_amount between 0 and 9007199254740991),
  constraint savings_accounts_monthly_target_range check (monthly_target_amount between 0 and 9007199254740991),
  constraint savings_accounts_month_key_format check (target_month_key ~ '^[0-9]{4}/[0-9]{2}$')
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  allocated_amount bigint not null default 0,
  target_amount bigint,
  target_date date,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_client_id_length check (char_length(btrim(client_id)) between 1 and 160),
  constraint savings_goals_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint savings_goals_allocated_range check (allocated_amount between 0 and 9007199254740991),
  constraint savings_goals_target_range check (target_amount is null or target_amount between 1 and 9007199254740991),
  constraint savings_goals_sort_order_range check (sort_order between 0 and 10000),
  constraint savings_goals_user_client_unique unique (user_id, client_id),
  constraint savings_goals_user_name_unique unique (user_id, name)
);

drop trigger if exists touch_updated_at on public.savings_accounts;
create trigger touch_updated_at before update on public.savings_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists touch_updated_at on public.savings_goals;
create trigger touch_updated_at before update on public.savings_goals
for each row execute function public.touch_updated_at();

create index if not exists savings_goals_user_sort_idx
  on public.savings_goals(user_id, sort_order, created_at);

alter table public.savings_accounts enable row level security;
alter table public.savings_accounts force row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_goals force row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['savings_accounts', 'savings_goals']
  loop
    execute format('drop policy if exists owner_or_admin_select on public.%I', table_name);
    execute format('drop policy if exists owner_or_admin_insert on public.%I', table_name);
    execute format('drop policy if exists owner_or_admin_update on public.%I', table_name);
    execute format('drop policy if exists owner_or_admin_delete on public.%I', table_name);
    execute format(
      'create policy owner_or_admin_select on public.%I for select using (user_id = public.current_app_user_id() or public.is_app_admin())',
      table_name
    );
    execute format(
      'create policy owner_or_admin_insert on public.%I for insert with check (user_id = public.current_app_user_id() or public.is_app_admin())',
      table_name
    );
    execute format(
      'create policy owner_or_admin_update on public.%I for update using (user_id = public.current_app_user_id() or public.is_app_admin()) with check (user_id = public.current_app_user_id() or public.is_app_admin())',
      table_name
    );
    execute format(
      'create policy owner_or_admin_delete on public.%I for delete using (user_id = public.current_app_user_id() or public.is_app_admin())',
      table_name
    );
  end loop;
end
$$;

grant select, insert, update, delete on table
  public.savings_accounts,
  public.savings_goals
to gavapp_app;
