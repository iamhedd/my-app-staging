begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.transaction_type as enum ('expense', 'income', 'savings');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.budget_period as enum ('monthly', 'weekly');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.allocation_mode as enum ('percentage', 'amount');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.recurrence_type as enum ('none', 'monthly');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null check (length(trim(name)) between 1 and 80),
  percentage_bps integer not null default 0 check (percentage_bps between 0 and 10000),
  amount bigint not null default 0 check (amount >= 0),
  allocation_mode public.allocation_mode not null default 'percentage',
  color text not null default '#9098a1',
  icon text not null default 'other',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  unique (user_id, name)
);

create table if not exists public.financial_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_income bigint not null check (monthly_income > 0),
  savings_percent_bps integer not null default 0 check (savings_percent_bps between 0 and 10000),
  currency text not null default 'TOMAN' check (currency = 'TOMAN'),
  onboarding_completed boolean not null default false,
  reminder_enabled boolean not null default false,
  reminder_time time not null default '21:00',
  timezone text not null default 'Asia/Tehran',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legacy_id text not null,
  title text not null check (length(trim(title)) between 1 and 160),
  category_name text not null,
  amount bigint not null check (amount > 0),
  type public.transaction_type not null,
  transaction_date date not null,
  recurrence public.recurrence_type not null default 'none',
  generated_from_legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_name text not null,
  period_type public.budget_period not null,
  period_key text not null,
  limit_amount bigint not null default 0 check (limit_amount >= 0),
  is_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_name, period_type, period_key)
);

create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  enabled boolean not null default true,
  platform text not null default 'web',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, fcm_token)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'fa-IR',
  theme text not null default 'light',
  timezone text not null default 'Asia/Tehran',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  migration_key text not null,
  source_hash text,
  status text not null check (status in ('started', 'completed', 'failed')),
  migrated_counts jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, migration_key)
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user')
  on conflict (user_id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (user_id, full_name, avatar_url)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), raw_user_meta_data ->> 'avatar_url' from auth.users
on conflict (user_id) do nothing;
insert into public.user_roles (user_id, role)
select id, 'user'::public.app_role from auth.users
on conflict (user_id) do nothing;
insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','user_roles','categories','financial_plans','transactions','budgets','user_settings','app_settings','migration_runs'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', table_name);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute procedure public.touch_updated_at()', table_name);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.financial_plans enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.notification_devices enable row level security;
alter table public.user_settings enable row level security;
alter table public.app_settings enable row level security;
alter table public.migration_runs enable row level security;

create policy "profiles_select_owner_or_admin" on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "profiles_insert_owner" on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy "profiles_update_owner_or_admin" on public.profiles for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "roles_select_self_or_admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "roles_admin_insert" on public.user_roles for insert to authenticated with check (public.is_admin());
create policy "roles_admin_update" on public.user_roles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "roles_admin_delete" on public.user_roles for delete to authenticated using (public.is_admin());

do $$
declare table_name text;
begin
  foreach table_name in array array['categories','financial_plans','transactions','budgets','notification_devices','user_settings','migration_runs'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid() or public.is_admin())', table_name || '_select_owner_or_admin', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid() or public.is_admin())', table_name || '_insert_owner_or_admin', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin())', table_name || '_update_owner_or_admin', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid() or public.is_admin())', table_name || '_delete_owner_or_admin', table_name);
  end loop;
end $$;

create policy "app_settings_read_authenticated" on public.app_settings for select to authenticated using (true);
create policy "app_settings_admin_insert" on public.app_settings for insert to authenticated with check (public.is_admin() and updated_by = auth.uid());
create policy "app_settings_admin_update" on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin() and updated_by = auth.uid());
create policy "app_settings_admin_delete" on public.app_settings for delete to authenticated using (public.is_admin());

create index if not exists transactions_user_date_idx on public.transactions(user_id, transaction_date desc);
create index if not exists budgets_user_period_idx on public.budgets(user_id, period_type, period_key);
create index if not exists categories_user_sort_idx on public.categories(user_id, sort_order);
create index if not exists notification_devices_user_idx on public.notification_devices(user_id) where enabled;

commit;
