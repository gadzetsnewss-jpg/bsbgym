-- =============================================================================
-- BSB FitForge - Split installment schedules on remaining invoice balance
-- =============================================================================
-- Additive. Reuses public.installments and create_installment_schedule(uuid,
-- integer, date). Does not invent tables, columns, statuses, or payment rows.
-- Creating a schedule still only inserts installment rows; amount_paid is
-- unchanged. Duplicate schedules remain blocked.
-- =============================================================================

create or replace function public.create_installment_schedule(
  p_invoice_id uuid,
  p_count integer,
  p_start_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_count integer;
  v_outstanding numeric;
  v_base numeric;
  v_allocated numeric := 0;
  v_amount numeric;
  v_start date;
  i integer;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null then
    raise exception 'invoice not found';
  end if;
  perform public.require_org_permission(v_invoice.organization_id, 'billing.create');
  if v_invoice.status in ('draft', 'void') then
    raise exception 'installments require an issued invoice';
  end if;
  if exists (select 1 from public.installments where invoice_id = p_invoice_id) then
    raise exception 'this invoice already has an installment schedule';
  end if;

  v_outstanding := public.round_money(
    greatest(
      coalesce(v_invoice.total, 0)
        - coalesce(v_invoice.amount_paid, 0)
        - coalesce(v_invoice.amount_credited, 0),
      0
    )
  );
  if v_outstanding <= 0 then
    raise exception 'installments require an outstanding balance';
  end if;

  v_count := coalesce(p_count, 1);
  if v_count < 1 or v_count > 24 then
    raise exception 'installment count must be between 1 and 24';
  end if;
  v_start := coalesce(p_start_date, v_invoice.issue_date, (timezone('utc', now()))::date);
  v_base := public.round_money(floor((v_outstanding / v_count) * 100) / 100);

  for i in 0 .. v_count - 1 loop
    if i = v_count - 1 then
      v_amount := public.round_money(v_outstanding - v_allocated);
    else
      v_amount := v_base;
    end if;
    v_allocated := public.round_money(v_allocated + v_amount);
    insert into public.installments (
      organization_id, invoice_id, due_date, amount, status, sort_order
    )
    values (
      v_invoice.organization_id, p_invoice_id, (v_start + (i || ' months')::interval)::date,
      greatest(v_amount, 0.01), 'pending', i
    );
  end loop;
end;
$$;

grant execute on function public.create_installment_schedule(uuid, integer, date) to authenticated;
