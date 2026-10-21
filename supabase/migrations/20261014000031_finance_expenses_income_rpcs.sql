-- Phase 8: Expenses + other income write path.
--
-- Additive only. The existing `expenses` and `income_entries` tables (created
-- in 20260914000011_phase_3_2_commerce_crm.sql) keep their SELECT-only RLS
-- policies; every write goes through these SECURITY DEFINER RPCs so the
-- organization and branch scope is derived from the row / re-checked server
-- side. No new tables, columns, statuses or accounting rules.
--
-- Permission model: reading is guarded by the existing RLS SELECT policies
-- (`finance.view` route gate + org/branch membership), writing requires
-- `finance.manage` (owner, admin, accountant by default).
--
-- Both tables are append/update-only here: no RPC deletes financial records.

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create or replace function public.create_expense(
  p_org_id uuid,
  p_branch_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_payment_method text,
  p_status text,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_category text;
  v_method text;
  v_status text;
begin
  perform public.require_org_permission(p_org_id, 'finance.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  v_category := nullif(trim(p_category), '');
  if v_category is null then
    raise exception 'expense category is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'expense amount must be greater than zero';
  end if;

  v_method := coalesce(nullif(trim(p_payment_method), ''), 'cash');
  if v_method not in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other') then
    raise exception 'payment method is invalid';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'paid');
  if v_status not in ('pending', 'paid') then
    raise exception 'expense status is invalid';
  end if;

  insert into public.expenses (
    organization_id, branch_id, category, description, amount, expense_date,
    payment_method, status, reference, created_by
  )
  values (
    p_org_id, p_branch_id, v_category, nullif(trim(p_description), ''),
    public.round_money(p_amount),
    coalesce(p_expense_date, (timezone('utc', now()))::date),
    v_method, v_status, nullif(trim(p_reference), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_expense(
  uuid, uuid, text, text, numeric, date, text, text, text
) to authenticated;

create or replace function public.update_expense(
  p_expense_id uuid,
  p_branch_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_payment_method text,
  p_status text,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_category text;
  v_method text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id;
  if v_expense.id is null then
    raise exception 'expense not found';
  end if;

  perform public.require_org_permission(v_expense.organization_id, 'finance.manage');
  perform public.require_branch_in_org(v_expense.organization_id, coalesce(p_branch_id, v_expense.branch_id));

  v_category := nullif(trim(p_category), '');
  if v_category is null then
    raise exception 'expense category is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'expense amount must be greater than zero';
  end if;

  v_method := coalesce(nullif(trim(p_payment_method), ''), v_expense.payment_method);
  if v_method not in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other') then
    raise exception 'payment method is invalid';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), v_expense.status);
  if v_status not in ('pending', 'paid') then
    raise exception 'expense status is invalid';
  end if;

  update public.expenses set
    branch_id = coalesce(p_branch_id, branch_id),
    category = v_category,
    description = nullif(trim(p_description), ''),
    amount = public.round_money(p_amount),
    expense_date = coalesce(p_expense_date, expense_date),
    payment_method = v_method,
    status = v_status,
    reference = nullif(trim(p_reference), '')
  where id = p_expense_id;
end;
$$;

grant execute on function public.update_expense(
  uuid, uuid, text, text, numeric, date, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Other income (manual receipts only - never a payment duplicate)
-- ---------------------------------------------------------------------------

create or replace function public.create_income_entry(
  p_org_id uuid,
  p_branch_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_income_date date,
  p_payment_method text,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_category text;
  v_method text;
begin
  perform public.require_org_permission(p_org_id, 'finance.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  v_category := nullif(trim(p_category), '');
  if v_category is null then
    raise exception 'income category is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'income amount must be greater than zero';
  end if;

  v_method := coalesce(nullif(trim(p_payment_method), ''), 'cash');
  if v_method not in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other') then
    raise exception 'payment method is invalid';
  end if;

  insert into public.income_entries (
    organization_id, branch_id, category, description, amount, income_date,
    payment_method, reference, created_by
  )
  values (
    p_org_id, p_branch_id, v_category, nullif(trim(p_description), ''),
    public.round_money(p_amount),
    coalesce(p_income_date, (timezone('utc', now()))::date),
    v_method, nullif(trim(p_reference), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_income_entry(
  uuid, uuid, text, text, numeric, date, text, text
) to authenticated;

create or replace function public.update_income_entry(
  p_income_entry_id uuid,
  p_branch_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_income_date date,
  p_payment_method text,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.income_entries%rowtype;
  v_category text;
  v_method text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_entry from public.income_entries where id = p_income_entry_id;
  if v_entry.id is null then
    raise exception 'income entry not found';
  end if;

  perform public.require_org_permission(v_entry.organization_id, 'finance.manage');
  perform public.require_branch_in_org(v_entry.organization_id, coalesce(p_branch_id, v_entry.branch_id));

  v_category := nullif(trim(p_category), '');
  if v_category is null then
    raise exception 'income category is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'income amount must be greater than zero';
  end if;

  v_method := coalesce(nullif(trim(p_payment_method), ''), v_entry.payment_method);
  if v_method not in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other') then
    raise exception 'payment method is invalid';
  end if;

  update public.income_entries set
    branch_id = coalesce(p_branch_id, branch_id),
    category = v_category,
    description = nullif(trim(p_description), ''),
    amount = public.round_money(p_amount),
    income_date = coalesce(p_income_date, income_date),
    payment_method = v_method,
    reference = nullif(trim(p_reference), '')
  where id = p_income_entry_id;
end;
$$;

grant execute on function public.update_income_entry(
  uuid, uuid, text, text, numeric, date, text, text
) to authenticated;
