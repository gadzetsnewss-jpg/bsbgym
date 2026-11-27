-- =============================================================================
-- BSB FitForge - Unify New Invoice & Active Memberships Workflow
-- =============================================================================
-- Additive. Ensures New Invoice is the single primary workflow for selling/assigning
-- a paid membership:
-- 1. sync_invoice_membership(p_invoice_id uuid):
--    Idempotently creates or links a membership record when an invoice containing
--    a membership plan item is finalized/issued. Sets status = 'active' if paid/partial,
--    or 'pending' if zero payment received.
-- 2. link_invoice_membership(p_invoice_id uuid, p_membership_id uuid):
--    Associates an invoice with an existing membership record.
-- 3. update refresh_invoice_status(p_invoice_id uuid):
--    Activates any linked 'pending' membership to 'active' when payment is received.
-- 4. update issue_invoice(p_invoice_id uuid):
--    Triggers sync_invoice_membership when draft invoice is issued.
-- 5. update void_invoice(p_invoice_id uuid, p_reason text):
--    Marks linked pending membership as 'cancelled' if invoice is cancelled.
-- =============================================================================

-- 1. Idempotent sync of invoice membership
create or replace function public.sync_invoice_membership(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_item record;
  v_plan public.membership_plans%rowtype;
  v_start date;
  v_end date;
  v_status text;
  v_membership_id uuid;
  v_paid numeric;
  v_existing_end date;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null then
    return null;
  end if;

  -- Draft or void invoices do not activate or create active memberships
  if v_invoice.status in ('draft', 'void') then
    return v_invoice.membership_id;
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id;

  -- If invoice already has a linked membership:
  if v_invoice.membership_id is not null then
    -- If payments exist and status was pending, promote to active
    if v_paid > 0 then
      update public.memberships
      set status = 'active'
      where id = v_invoice.membership_id
        and status = 'pending';
    end if;
    return v_invoice.membership_id;
  end if;

  -- Find the first membership plan item on this invoice
  select * into v_item
  from public.invoice_items
  where invoice_id = p_invoice_id
    and plan_id is not null
    and item_type in ('membership', 'renewal', 'upgrade')
  order by sort_order asc
  limit 1;

  if v_item.id is null then
    return null;
  end if;

  select * into v_plan
  from public.membership_plans
  where id = v_item.plan_id and organization_id = v_invoice.organization_id;
  if v_plan.id is null then
    return null;
  end if;

  -- Initial membership status:
  -- If payment received (> 0), active. If zero payment, pending payment.
  if v_paid > 0 then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;

  v_start := coalesce(v_invoice.issue_date, (timezone('utc', now()))::date);

  -- Check if member already has an active membership
  select max(end_date) into v_existing_end
  from public.memberships
  where organization_id = v_invoice.organization_id
    and member_id = v_invoice.member_id
    and status = 'active'
    and end_date >= v_start;

  if v_existing_end is not null then
    -- Sequence renewal to start the day after current active membership ends
    v_start := v_existing_end + 1;
  end if;

  v_end := v_start + (v_plan.duration_days || ' days')::interval;

  -- Idempotently insert membership
  insert into public.memberships (
    organization_id, branch_id, member_id, plan_id, status,
    start_date, end_date, price, discount, final_amount,
    notes, created_by
  )
  values (
    v_invoice.organization_id,
    v_invoice.branch_id,
    v_invoice.member_id,
    v_item.plan_id,
    v_status,
    v_start,
    v_end,
    v_item.unit_price,
    coalesce(v_item.discount, 0),
    greatest(v_item.unit_price - coalesce(v_item.discount, 0), 0),
    'Created from invoice ' || v_invoice.invoice_number,
    v_invoice.created_by
  )
  returning id into v_membership_id;

  -- Link invoice to newly created membership
  update public.invoices
  set membership_id = v_membership_id
  where id = p_invoice_id;

  return v_membership_id;
end;
$$;

grant execute on function public.sync_invoice_membership(uuid) to authenticated;

-- 2. Link invoice to membership RPC
create or replace function public.link_invoice_membership(
  p_invoice_id uuid,
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.invoices where id = p_invoice_id;
  if v_org_id is null then
    raise exception 'invoice not found';
  end if;
  perform public.require_org_permission(v_org_id, 'billing.create');

  if not exists (
    select 1 from public.memberships
    where id = p_membership_id and organization_id = v_org_id
  ) then
    raise exception 'membership not found';
  end if;

  update public.invoices
  set membership_id = p_membership_id
  where id = p_invoice_id;
end;
$$;

grant execute on function public.link_invoice_membership(uuid, uuid) to authenticated;

-- 3. Enhance refresh_invoice_status to keep membership in sync
create or replace function public.refresh_invoice_status(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_paid numeric;
  v_credited numeric;
  v_balance numeric;
  v_status text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null or v_invoice.status in ('draft', 'void') then
    return;
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id;

  select coalesce(sum(amount), 0) into v_credited
  from public.credit_notes
  where invoice_id = p_invoice_id and status = 'applied';

  v_paid := public.round_money(v_paid);
  v_credited := public.round_money(v_credited);
  v_balance := public.round_money(v_invoice.total - v_paid - v_credited);

  if v_balance <= 0 then
    v_status := 'paid';
  elsif v_paid > 0 then
    v_status := 'partially_paid';
  elsif v_invoice.due_date is not null and v_invoice.due_date < (timezone('utc', now()))::date then
    v_status := 'overdue';
  else
    v_status := 'issued';
  end if;

  update public.invoices set
    amount_paid = v_paid,
    amount_credited = v_credited,
    status = v_status
  where id = p_invoice_id;

  -- Ensure membership sync & promote pending membership to active if paid
  perform public.sync_invoice_membership(p_invoice_id);
end;
$$;

grant execute on function public.refresh_invoice_status(uuid) to authenticated;

-- 4. Enhance issue_invoice to trigger membership sync
create or replace function public.issue_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_status text;
begin
  select organization_id, status into v_org_id, v_status
  from public.invoices where id = p_invoice_id;
  if v_org_id is null then
    raise exception 'invoice not found';
  end if;
  perform public.require_org_permission(v_org_id, 'billing.create'::text);
  if v_status is distinct from 'draft' then
    raise exception 'only draft invoices can be issued';
  end if;
  update public.invoices set status = 'issued' where id = p_invoice_id;
  perform public.refresh_invoice_status(p_invoice_id);
  perform public.sync_invoice_membership(p_invoice_id);
end;
$$;

grant execute on function public.issue_invoice(uuid) to authenticated;

-- 5. Enhance void_invoice to cancel pending memberships
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_status text;
  v_membership_id uuid;
begin
  select organization_id, status, membership_id into v_org_id, v_status, v_membership_id
  from public.invoices where id = p_invoice_id;
  if v_org_id is null then
    raise exception 'invoice not found';
  end if;
  perform public.require_org_permission(v_org_id, 'billing.void');
  if v_status = 'void' then
    raise exception 'invoice is already cancelled';
  end if;
  if v_status = 'paid' then
    raise exception 'paid invoices cannot be cancelled; issue a credit note or refund';
  end if;

  update public.invoices set
    status = 'void',
    notes = case
      when nullif(trim(p_reason), '') is null then notes
      else coalesce(notes || E'\n', '') || 'Cancelled: ' || trim(p_reason)
    end
  where id = p_invoice_id;

  -- If membership is still pending payment, cancel it
  if v_membership_id is not null then
    update public.memberships
    set status = 'cancelled'
    where id = v_membership_id
      and status = 'pending';
  end if;
end;
$$;

grant execute on function public.void_invoice(uuid, text) to authenticated;
