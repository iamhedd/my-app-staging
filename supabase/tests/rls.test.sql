begin;
create extension if not exists pgtap;
select plan(14);

insert into auth.users (id, email, aud, role, encrypted_password)
values
  ('10000000-0000-0000-0000-000000000001', 'user-a@example.com', 'authenticated', 'authenticated', ''),
  ('10000000-0000-0000-0000-000000000002', 'user-b@example.com', 'authenticated', 'authenticated', ''),
  ('10000000-0000-0000-0000-000000000003', 'admin@example.com', 'authenticated', 'authenticated', '')
on conflict (id) do nothing;

update public.user_roles set role = 'admin' where user_id = '10000000-0000-0000-0000-000000000003';
insert into public.transactions (user_id, legacy_id, title, category_name, amount, type, transaction_date)
values ('10000000-0000-0000-0000-000000000001', 'a-1', 'هزینه کاربر الف', 'خوراک', 1000, 'expense', '2026-09-15');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select results_eq('select count(*)::bigint from public.transactions', array[1::bigint], 'owner sees own transaction');
select lives_ok($$insert into public.categories(user_id, client_id, name) values ('10000000-0000-0000-0000-000000000001','food','خوراک')$$, 'owner can insert category');
select throws_ok($$insert into public.categories(user_id, client_id, name) values ('10000000-0000-0000-0000-000000000002','food','خوراک')$$, '42501', null, 'owner cannot insert for another user');
select results_eq($$select role::text from public.user_roles where user_id = auth.uid()$$, array['user'], 'user sees own role');
select results_eq('select count(*)::bigint from public.design_review_comments', array[0::bigint], 'regular user cannot read design reviews');
select throws_ok(
  $$insert into public.design_review_comments(page_key, comment_text, created_by) values ('dashboard', 'forbidden', auth.uid())$$,
  '42501', null, 'regular user cannot create design reviews'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select results_eq('select count(*)::bigint from public.transactions', array[0::bigint], 'second user cannot see first user data');
update public.user_roles set role = 'admin' where user_id = auth.uid();
select results_eq($$select role::text from public.user_roles where user_id = auth.uid()$$, array['user'], 'user cannot promote self');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select ok(public.is_admin(), 'database recognizes admin role');
select results_eq('select count(*)::bigint from public.transactions', array[1::bigint], 'admin can inspect user data');
select lives_ok(
  $$insert into public.design_review_comments(page_key, component_key, comment_text, priority, status, created_by) values ('dashboard', 'header', 'admin review', 'high', 'open', auth.uid())$$,
  'admin can create design review'
);
select results_eq(
  $$select count(*)::bigint from public.design_review_comments where page_key = 'dashboard'$$,
  array[1::bigint], 'admin can read design reviews'
);
select lives_ok(
  $$update public.design_review_comments set status = 'resolved' where page_key = 'dashboard'$$,
  'admin can update design review'
);
select lives_ok(
  $$delete from public.design_review_comments where page_key = 'dashboard'$$,
  'admin can delete design review'
);

select * from finish();
rollback;
