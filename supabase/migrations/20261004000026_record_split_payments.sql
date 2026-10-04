-- =============================================================================
-- BSB FitForge - Persist every split-payment row in one transaction
-- =============================================================================
-- Additive. Reuses public.payments, record_payment, apply_payment_to_installments
-- and refresh_invoice_status. Does not invent tables, columns, or statuses.
-- Sequential record_payment calls from New Invoice could commit the first row
-- and leave later rows unsaved. record_payments inserts ALL rows, then refreshes
-- invoice paid/balance/status from SUM(payments.amount).
-- =============================================================================

create or replace function public.record_payments(
  p_org_id uuid,
  p_invoice_id uuid,
  p_payments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_item jsonb;
  v_idx integer := 0;
  v_amount numeric;
  v_method text;
  v_reference text;
  v_notes text;
  v_paid_at timestamptz;
  v_id uuid;
  v_row_total numeric := 0;
  v_balance numeric;
begin
  perform public.require_org_permission(p_org_id, 'payments.create');

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null or v_invoice.organization_id <> p_org_id then
    raise exception 'invoice not found';
  end if;
  perform public.require_branch_in_org(p_org_id, v_invoice.branch_id);

  if v_invoice.status in ('draft', 'void') then
    raise exception 'payments can only be recorded against issued invoices';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'at least one payment is required';
  end if;

  for v_item in select * from jsonb_array_elements(p_payments)
  loop
    v_idx := v_idx + 1;
    v_amount := public.round_money(coalesce((v_item ->> 'amount')::numeric, 0));
    if v_amount <= 0 then
      raise exception 'payment amount must be greater than zero';
    end if;
    v_method := coalesce(nullif(trim(v_item ->> 'method'), ''), 'cash');
    if v_method not in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other') then
      raise exception 'payment method is invalid';
    end if;
    v_row_total := public.round_money(v_row_total + v_amount);
  end loop;

  perform public.refresh_invoice_status(p_invoice_id);
  select * into v_invoice from public.invoices where id = p_invoice_id;
  v_balance := public.round_money(
    v_invoice.total - v_invoice.amount_paid - coalesce(v_invoice.amount_credited, 0)
  );
  if v_row_total > v_balance then
    raise exception 'payment exceeds the outstanding balance';
  end if;

  v_idx := 0;
  for v_item in select * from jsonb_array_elements(p_payments)
  loop
    v_idx := v_idx + 1;
    v_amount := public.round_money(coalesce((v_item ->> 'amount')::numeric, 0));
    v_method := coalesce(nullif(trim(v_item ->> 'method'), ''), 'cash');
    v_reference := nullif(trim(v_item ->> 'reference'), '');
    v_notes := nullif(trim(v_item ->> 'notes'), '');
    v_paid_at := coalesce(nullif(trim(v_item ->> 'paid_at'), '')::timestamptz, timezone('utc', now()));

    insert into public.payments (
      organization_id, branch_id, invoice_id, member_id, amount, method, reference, paid_at, notes, created_by
    )
    values (
      p_org_id, v_invoice.branch_id, p_invoice_id, v_invoice.member_id,
      v_amount, v_method, v_reference, v_paid_at, v_notes, auth.uid()
    )
    returning id into v_id;

    perform public.apply_payment_to_installments(p_invoice_id, v_id, v_amount);
  end loop;

  perform public.refresh_invoice_status(p_invoice_id);
end;
$$;

grant execute on function public.record_payments(uuid, uuid, jsonb) to authenticated;
