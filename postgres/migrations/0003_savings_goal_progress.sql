alter table public.savings_goals
  add column if not exists progress_history jsonb not null default '[]'::jsonb;

alter table public.savings_goals
  drop constraint if exists savings_goals_progress_history_array;
alter table public.savings_goals
  add constraint savings_goals_progress_history_array
  check (jsonb_typeof(progress_history) = 'array');
