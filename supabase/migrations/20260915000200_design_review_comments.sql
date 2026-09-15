create table if not exists public.design_review_comments (
  id uuid primary key default gen_random_uuid(),
  page_key text not null check (char_length(page_key) between 1 and 80),
  component_key text,
  comment_text text not null check (char_length(comment_text) between 1 and 4000),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_updated_at on public.design_review_comments;
create trigger touch_updated_at
before update on public.design_review_comments
for each row execute procedure public.touch_updated_at();

alter table public.design_review_comments enable row level security;
alter table public.design_review_comments force row level security;

drop policy if exists "design_reviews_admin_select" on public.design_review_comments;
drop policy if exists "design_reviews_admin_insert" on public.design_review_comments;
drop policy if exists "design_reviews_admin_update" on public.design_review_comments;
drop policy if exists "design_reviews_admin_delete" on public.design_review_comments;

create policy "design_reviews_admin_select"
on public.design_review_comments for select to authenticated
using (public.is_admin());

create policy "design_reviews_admin_insert"
on public.design_review_comments for insert to authenticated
with check (public.is_admin() and created_by = auth.uid());

create policy "design_reviews_admin_update"
on public.design_review_comments for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "design_reviews_admin_delete"
on public.design_review_comments for delete to authenticated
using (public.is_admin());

revoke all on public.design_review_comments from anon;
grant select, insert, update, delete on public.design_review_comments to authenticated;

create index if not exists design_review_comments_page_key_idx
on public.design_review_comments(page_key, created_at);
