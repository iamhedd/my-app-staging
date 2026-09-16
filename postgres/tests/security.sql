-- Destructive transactional smoke test for a disposable database.
-- Run only after 0001_initial.sql. Everything below is rolled back.
\set ON_ERROR_STOP on

begin;

insert into public.users (id, name, email, email_verified)
values
  ('test-user-a', 'User A', 'test-user-a@example.invalid', true),
  ('test-user-b', 'User B', 'test-user-b@example.invalid', true),
  ('test-admin', 'Admin', 'test-admin@example.invalid', true);

update public.user_roles
set role = 'admin'
where user_id = 'test-admin';

set local role gavapp_app;
set local "app.current_user_id" = 'test-user-a';

do $$
begin
  if current_user <> 'gavapp_app' then
    raise exception 'application query did not assume gavapp_app';
  end if;
end;
$$;

insert into public.transactions (
  user_id, legacy_id, title, category_name, amount, type, transaction_date
)
values (
  'test-user-a', 'owner-transaction', 'Owner transaction', 'Other', 1000,
  'expense', current_date
);

do $$
begin
  if (select count(*) from public.transactions) <> 1 then
    raise exception 'owner cannot read their transaction';
  end if;
end;
$$;

do $$
begin
  begin
    perform count(*) from public.users;
    raise exception 'restricted role can read Better Auth users';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

set local "app.current_user_id" = 'test-user-b';
do $$
begin
  if (select count(*) from public.transactions) <> 0 then
    raise exception 'cross-user transaction leaked through RLS';
  end if;
  if (select count(*) from public.user_roles) <> 1 then
    raise exception 'cross-user role rows leaked through RLS';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.transactions (
      user_id, legacy_id, title, category_name, amount, type, transaction_date
    )
    values (
      'test-user-a', 'forbidden-transaction', 'Forbidden', 'Other', 1,
      'expense', current_date
    );
    raise exception 'cross-user insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

do $$
begin
  begin
    update public.user_roles
    set role = 'admin'
    where user_id = 'test-user-b';
    raise exception 'regular API role can update user_roles';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

set local "app.current_user_id" = 'test-admin';
do $$
begin
  if not public.is_app_admin() then
    raise exception 'database did not recognize admin';
  end if;
  if (select count(*) from public.transactions) <> 1 then
    raise exception 'admin cannot inspect user transaction';
  end if;
end;
$$;

insert into public.design_review_comments (
  page_key, component_key, comment_text, priority, status, created_by
)
values (
  'dashboard', 'header', 'Smoke test', 'high', 'open', 'test-admin'
);

rollback;
