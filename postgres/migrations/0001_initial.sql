-- Gav application schema for PostgreSQL 17.
--
-- This migration deliberately has no dependency on Supabase's auth schema,
-- auth.uid(), JWT claims, or Supabase database roles.  Run it through
-- ../migrate.sh so applying the file and recording its checksum is atomic.

do $$
begin
  create type public.app_role as enum ('user', 'admin');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.transaction_type as enum ('expense', 'income', 'savings');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.budget_period as enum ('monthly', 'weekly');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.allocation_mode as enum ('percentage', 'amount');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.recurrence_type as enum ('none', 'monthly');
exception
  when duplicate_object then null;
end
$$;

-- Better Auth core models. The server maps Better Auth's camelCase field names
-- to these snake_case columns and uses the plural model names below.
create table if not exists public.users (
  id text primary key default gen_random_uuid()::text,
  name text not null default '',
  email text not null,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_id_not_blank check (btrim(id) <> ''),
  constraint users_name_length check (char_length(name) <= 160),
  constraint users_email_valid_length check (
    email = btrim(email)
    and char_length(email) between 3 and 320
  ),
  constraint users_email_unique unique (email)
);

create unique index if not exists users_email_lower_uidx
  on public.users (lower(email));

create table if not exists public.sessions (
  id text primary key default gen_random_uuid()::text,
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references public.users(id) on delete cascade,
  constraint sessions_id_not_blank check (btrim(id) <> ''),
  constraint sessions_token_not_blank check (btrim(token) <> ''),
  constraint sessions_ip_address_length check (ip_address is null or char_length(ip_address) <= 64),
  constraint sessions_user_agent_length check (user_agent is null or char_length(user_agent) <= 2048)
);

create table if not exists public.accounts (
  id text primary key default gen_random_uuid()::text,
  account_id text not null,
  provider_id text not null,
  user_id text not null references public.users(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_id_not_blank check (btrim(id) <> ''),
  constraint accounts_account_id_not_blank check (btrim(account_id) <> ''),
  constraint accounts_provider_id_not_blank check (btrim(provider_id) <> ''),
  constraint accounts_provider_account_unique unique (provider_id, account_id)
);

create table if not exists public.verifications (
  id text primary key default gen_random_uuid()::text,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verifications_id_not_blank check (btrim(id) <> ''),
  constraint verifications_identifier_not_blank check (btrim(identifier) <> ''),
  constraint verifications_value_not_blank check (btrim(value) <> '')
);

-- Application-owned user data.
create table if not exists public.profiles (
  user_id text primary key references public.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 160),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048)
);

-- The authoritative application role lives in this table. It is not derived
-- from request metadata and must never be writable by an end-user endpoint.
create table if not exists public.user_roles (
  user_id text primary key references public.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  percentage_bps integer not null default 0,
  amount bigint not null default 0,
  allocation_mode public.allocation_mode not null default 'percentage',
  color text not null default '#707070',
  icon text not null default 'other',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_client_id_length check (char_length(btrim(client_id)) between 1 and 160),
  constraint categories_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint categories_percentage_bps_range check (percentage_bps between 0 and 10000),
  constraint categories_amount_range check (amount between 0 and 9007199254740991),
  constraint categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint categories_icon_length check (char_length(btrim(icon)) between 1 and 80),
  constraint categories_sort_order_range check (sort_order between 0 and 10000),
  constraint categories_user_client_unique unique (user_id, client_id),
  constraint categories_user_name_unique unique (user_id, name)
);

create table if not exists public.financial_plans (
  user_id text primary key references public.users(id) on delete cascade,
  monthly_income bigint not null,
  savings_percent_bps integer not null default 0,
  currency text not null default 'TOMAN',
  onboarding_completed boolean not null default false,
  reminder_enabled boolean not null default false,
  reminder_time time without time zone not null default '21:00',
  timezone text not null default 'Asia/Tehran',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_plans_monthly_income_range check (monthly_income between 1 and 9007199254740991),
  constraint financial_plans_savings_bps_range check (savings_percent_bps between 0 and 10000),
  constraint financial_plans_currency_supported check (currency = 'TOMAN'),
  constraint financial_plans_timezone_length check (char_length(btrim(timezone)) between 1 and 100)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  legacy_id text not null,
  title text not null,
  category_name text not null,
  amount bigint not null,
  type public.transaction_type not null,
  transaction_date date not null,
  recurrence public.recurrence_type not null default 'none',
  generated_from_legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_legacy_id_length check (char_length(btrim(legacy_id)) between 1 and 220),
  constraint transactions_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint transactions_category_name_length check (char_length(btrim(category_name)) between 1 and 80),
  constraint transactions_amount_range check (amount between 1 and 9007199254740991),
  constraint transactions_generated_id_length check (
    generated_from_legacy_id is null
    or char_length(btrim(generated_from_legacy_id)) between 1 and 220
  ),
  constraint transactions_user_legacy_unique unique (user_id, legacy_id)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  category_name text not null,
  period_type public.budget_period not null,
  period_key text not null,
  limit_amount bigint not null default 0,
  is_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_category_name_length check (char_length(btrim(category_name)) between 1 and 80),
  constraint budgets_period_key_length check (char_length(btrim(period_key)) between 1 and 80),
  constraint budgets_limit_amount_range check (limit_amount between 0 and 9007199254740991),
  constraint budgets_user_category_period_unique unique (user_id, category_name, period_type, period_key)
);

create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  fcm_token text not null,
  enabled boolean not null default true,
  platform text not null default 'web',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_devices_token_length check (char_length(btrim(fcm_token)) between 1 and 4096),
  constraint notification_devices_platform_length check (char_length(btrim(platform)) between 1 and 32),
  constraint notification_devices_user_token_unique unique (user_id, fcm_token)
);

create table if not exists public.user_settings (
  user_id text primary key references public.users(id) on delete cascade,
  locale text not null default 'fa-IR',
  theme text not null default 'light',
  timezone text not null default 'Asia/Tehran',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_locale_length check (char_length(btrim(locale)) between 2 and 35),
  constraint user_settings_theme_length check (char_length(btrim(theme)) between 1 and 40),
  constraint user_settings_timezone_length check (char_length(btrim(timezone)) between 1 and 100),
  constraint user_settings_json_object check (jsonb_typeof(settings) = 'object')
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by text references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_settings_key_length check (char_length(btrim(key)) between 1 and 100)
);

-- Idempotency ledger for importing each user's local/Supabase data. This is
-- intentionally distinct from schema_migrations, which tracks SQL files.
create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  migration_key text not null,
  source_hash text,
  status text not null,
  migrated_counts jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint migration_runs_key_length check (char_length(btrim(migration_key)) between 1 and 220),
  constraint migration_runs_source_hash_length check (source_hash is null or char_length(source_hash) <= 128),
  constraint migration_runs_status_valid check (status in ('started', 'completed', 'failed')),
  constraint migration_runs_counts_object check (jsonb_typeof(migrated_counts) = 'object'),
  constraint migration_runs_error_length check (error_message is null or char_length(error_message) <= 4000),
  constraint migration_runs_user_key_unique unique (user_id, migration_key)
);

create table if not exists public.design_review_comments (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  component_key text,
  comment_text text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  created_by text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_review_page_key_length check (char_length(btrim(page_key)) between 1 and 80),
  constraint design_review_component_key_length check (component_key is null or char_length(component_key) <= 160),
  constraint design_review_comment_length check (char_length(btrim(comment_text)) between 1 and 4000),
  constraint design_review_priority_valid check (priority in ('low', 'medium', 'high', 'critical')),
  constraint design_review_status_valid check (status in ('open', 'in_progress', 'resolved'))
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_user_id text := current_setting('app.current_user_id', true);
begin
  -- profiles and user_settings have FORCE RLS. Better Auth user creation is a
  -- trusted server operation, so scope the companion inserts to the new user.
  perform set_config('app.current_user_id', new.id, true);

  insert into public.profiles (user_id, full_name, avatar_url)
  values (new.id, coalesce(new.name, ''), new.image)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  perform set_config('app.current_user_id', coalesce(previous_user_id, ''), true);
  return new;
exception
  when others then
    perform set_config('app.current_user_id', coalesce(previous_user_id, ''), true);
    raise;
end;
$$;

drop trigger if exists on_user_created on public.users;
create trigger on_user_created
after insert on public.users
for each row execute function public.handle_new_user();

-- Backfill companion rows when the migration is applied to a database that
-- already contains Better Auth users.
insert into public.profiles (user_id, full_name, avatar_url)
select id, coalesce(name, ''), image
from public.users
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role)
select id, 'user'::public.app_role
from public.users
on conflict (user_id) do nothing;

insert into public.user_settings (user_id)
select id
from public.users
on conflict (user_id) do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users', 'sessions', 'accounts', 'verifications', 'profiles',
    'user_roles', 'categories', 'financial_plans', 'transactions',
    'budgets', 'notification_devices', 'user_settings', 'app_settings',
    'migration_runs', 'design_review_comments'
  ]
  loop
    execute format('drop trigger if exists touch_updated_at on public.%I', table_name);
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name
    );
  end loop;
end
$$;

create index if not exists sessions_user_id_idx
  on public.sessions(user_id);
create index if not exists sessions_expires_at_idx
  on public.sessions(expires_at);
create index if not exists accounts_user_id_idx
  on public.accounts(user_id);
create index if not exists verifications_identifier_idx
  on public.verifications(identifier);
create index if not exists verifications_expires_at_idx
  on public.verifications(expires_at);
create index if not exists transactions_user_date_idx
  on public.transactions(user_id, transaction_date desc);
create index if not exists transactions_user_type_date_idx
  on public.transactions(user_id, type, transaction_date desc);
create index if not exists transactions_user_generated_idx
  on public.transactions(user_id, generated_from_legacy_id)
  where generated_from_legacy_id is not null;
create index if not exists budgets_user_period_idx
  on public.budgets(user_id, period_type, period_key);
create index if not exists categories_user_sort_idx
  on public.categories(user_id, sort_order);
create index if not exists notification_devices_user_enabled_idx
  on public.notification_devices(user_id)
  where enabled;
create index if not exists migration_runs_user_status_idx
  on public.migration_runs(user_id, status);
create index if not exists design_review_comments_page_created_idx
  on public.design_review_comments(page_key, created_at);

-- Request identity for independent PostgreSQL RLS. The API must set
-- app.current_user_id with set_config(..., true) inside every transaction.
create or replace function public.current_app_user_id()
returns text
language sql
stable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.current_user_id', true), '');
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = public.current_app_user_id()
      and role = 'admin'
  );
$$;

-- user_roles is intentionally not FORCEd: is_app_admin() is SECURITY DEFINER
-- and its table-owning function role must be able to read the authoritative
-- role row without recursively invoking this policy. The restricted API role
-- still sees only its own row (or all rows after it is already an admin).
alter table public.user_roles enable row level security;
drop policy if exists self_or_admin_select on public.user_roles;
create policy self_or_admin_select on public.user_roles
  for select using (
    user_id = public.current_app_user_id()
    or public.is_app_admin()
  );

-- Better Auth and user_roles are server-only tables. User-owned application
-- tables are protected again at the database layer. FORCE ensures policies
-- also apply when the API connects as the table owner (except superusers and
-- roles explicitly granted BYPASSRLS, which must not be used by the API).
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'categories', 'financial_plans', 'transactions', 'budgets',
    'notification_devices', 'user_settings', 'migration_runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);

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

alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;
drop policy if exists authenticated_read on public.app_settings;
drop policy if exists admin_insert on public.app_settings;
drop policy if exists admin_update on public.app_settings;
drop policy if exists admin_delete on public.app_settings;
create policy authenticated_read on public.app_settings
  for select using (public.current_app_user_id() is not null);
create policy admin_insert on public.app_settings
  for insert with check (
    public.is_app_admin()
    and updated_by = public.current_app_user_id()
  );
create policy admin_update on public.app_settings
  for update using (public.is_app_admin())
  with check (
    public.is_app_admin()
    and updated_by = public.current_app_user_id()
  );
create policy admin_delete on public.app_settings
  for delete using (public.is_app_admin());

alter table public.design_review_comments enable row level security;
alter table public.design_review_comments force row level security;
drop policy if exists admin_select on public.design_review_comments;
drop policy if exists admin_insert on public.design_review_comments;
drop policy if exists admin_update on public.design_review_comments;
drop policy if exists admin_delete on public.design_review_comments;
create policy admin_select on public.design_review_comments
  for select using (public.is_app_admin());
create policy admin_insert on public.design_review_comments
  for insert with check (
    public.is_app_admin()
    and created_by = public.current_app_user_id()
  );
create policy admin_update on public.design_review_comments
  for update using (public.is_app_admin())
  with check (public.is_app_admin());
create policy admin_delete on public.design_review_comments
  for delete using (public.is_app_admin());

-- Auth tables, role assignment, and schema history are private to the API and
-- migration owner. Explicit revokes document that they are never client APIs.
revoke all on table public.users from public;
revoke all on table public.sessions from public;
revoke all on table public.accounts from public;
revoke all on table public.verifications from public;
revoke all on table public.user_roles from public;
revoke all on function public.handle_new_user() from public;

-- A deliberately restricted NOLOGIN role for application-data queries. The
-- database login keeps ownership privileges for Better Auth and migrations,
-- then assumes this role only inside withUserContext transactions. SET ROLE
-- also drops a session owner's/superuser's bypass privileges for those queries.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'gavapp_app') then
    create role gavapp_app
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  else
    alter role gavapp_app
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end
$$;

do $$
begin
  execute format(
    'grant connect on database %I to gavapp_app',
    current_database()
  );
end
$$;

grant usage on schema public to gavapp_app;
grant usage on type
  public.app_role,
  public.transaction_type,
  public.budget_period,
  public.allocation_mode,
  public.recurrence_type
to gavapp_app;

grant select, insert, update, delete on table
  public.profiles,
  public.categories,
  public.financial_plans,
  public.transactions,
  public.budgets,
  public.notification_devices,
  public.user_settings,
  public.app_settings,
  public.migration_runs,
  public.design_review_comments
to gavapp_app;

-- Role lookup is read-only. End-user requests can never assign or mutate an
-- admin role, even if a repository accidentally targets user_roles directly.
revoke all on table public.user_roles from gavapp_app;
grant select on table public.user_roles to gavapp_app;

-- No current table uses an identity/serial sequence, but this keeps future
-- app-owned sequence defaults usable without granting access to Auth tables.
grant usage, select on all sequences in schema public to gavapp_app;
grant execute on function public.current_app_user_id() to gavapp_app;
grant execute on function public.is_app_admin() to gavapp_app;

-- Better Auth credentials and the migration ledger remain owner-only.
revoke all on table public.users from gavapp_app;
revoke all on table public.sessions from gavapp_app;
revoke all on table public.accounts from gavapp_app;
revoke all on table public.verifications from gavapp_app;
revoke execute on function public.handle_new_user() from gavapp_app;

-- migrate.sh/server migration normally run with the same login as the API.
-- Granting membership to CURRENT_USER is portable and permits SET LOCAL ROLE
-- without embedding a provider-specific database username in source control.
grant gavapp_app to current_user;
