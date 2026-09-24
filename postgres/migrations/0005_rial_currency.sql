-- Money was formerly persisted in toman. Convert every persisted monetary field
-- exactly once before the IRR-only application writes new values.
do $$
begin
  if exists (select 1 from public.financial_plans where currency <> 'TOMAN') then
    raise exception 'Unexpected currency before rial migration';
  end if;
  if exists (
    select 1 from public.financial_plans where monthly_income > 900719925474099
       or savings_target_amount > 900719925474099
    union all select 1 from public.categories where amount > 900719925474099
    union all select 1 from public.transactions where amount > 900719925474099
    union all select 1 from public.budgets where limit_amount > 900719925474099
    union all select 1 from public.savings_accounts where total_amount > 900719925474099 or monthly_target_amount > 900719925474099
    union all select 1 from public.savings_goals where allocated_amount > 900719925474099 or monthly_contribution > 900719925474099 or target_amount > 900719925474099
    union all select 1 from public.savings_goals, jsonb_array_elements(progress_history) as progress
      where (progress->>'amount')::numeric > 900719925474099
  ) then
    raise exception 'Money exceeds safe rial conversion range';
  end if;
end $$;

update public.categories set amount = amount * 10;
update public.transactions set amount = amount * 10;
update public.budgets set limit_amount = limit_amount * 10;
update public.savings_accounts set total_amount = total_amount * 10, monthly_target_amount = monthly_target_amount * 10;
update public.savings_goals set
  allocated_amount = allocated_amount * 10,
  monthly_contribution = monthly_contribution * 10,
  target_amount = target_amount * 10,
  progress_history = (
    select coalesce(jsonb_agg(jsonb_set(item, '{amount}', to_jsonb((item->>'amount')::bigint * 10)) order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(progress_history) with ordinality as history(item, ordinal)
  );
alter table public.financial_plans drop constraint financial_plans_currency_supported;
update public.financial_plans set
  monthly_income = monthly_income * 10,
  savings_target_amount = savings_target_amount * 10,
  currency = 'IRR';
alter table public.financial_plans alter column currency set default 'IRR';
alter table public.financial_plans add constraint financial_plans_currency_supported check (currency = 'IRR');
