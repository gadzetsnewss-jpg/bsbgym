-- =============================================================================
-- Migration: 20261127000045_harden_unify_new_invoice_memberships.sql
-- Description: Hardened BSB FitForge Unify New Invoice & Active Memberships Workflow.
-- =============================================================================
-- Fixes:
-- 1. Authorization:
--    - Verify organization ownership and billing permissions inside every externally callable RPC.
--    - refresh_invoice_status is strictly an internal helper (revoked from public/anon/authenticated).
--    - sync_invoice_membership checks require_org_permission(org_id, 'billing.create').
--    - link_invoice_membership checks require_org_permission(org_id, 'billing.create').
--    - Explicitly revoke execute from PUBLIC and anon; grant only to authenticated where required.
-- 2. Membership Activation:
--    - Never activates membership merely because payments > 0.
--    - Issued/Partially paid invoices create/keep membership as 'pending'.
--    - Only fully settled invoices (balance <= 0 and status = 'paid') promote membership to 'active'.
--    - Attendance access remains protected because pending memberships are not active.
-- 3. Invoice-to-Membership Linking:
--    - Verifies matching organization, member, and branch between invoice and membership.
--    - Prevents linking an invoice to a membership belonging to a different member or branch.
--    - Prevents overwriting an existing conflicting membership link.
-- 4. Idempotency & Concurrency:
--    - Locks the invoice row (FOR UPDATE) and locks the member row during sync to prevent race conditions.
--    - Prevents duplicate membership creation even during concurrent sync calls.
-- 5. Safe Voiding:
--    - When an invoice is voided, cancels linked pending/active membership if no other valid invoices exist.
--    - Preserves existing credit note / refund workflow; cannot void paid invoices directly.
-- 6. Renewal Sequencing & Dates:
--    - Sequences renewals after the maximum end_date of active and pending memberships.
--    - Handles concurrent renewal invoices safely without overlapping dates.
-- 7. Schema Integrity:
--    - Strictly avoids non-existent columns (e.g. payments.status).
--    - Preserves exact existing signatures and return types.
-- =============================================================================

-- Ensure membership_id index on invoices
create index if not exists idx_invoices_membership_id on public.invoices(membership_id);
create index if not exists idx_memberships_member_status on public.memberships(member_id, status);

-- 1. Idempotent sync_invoice_membership RPC
create or replace function public.sync_invoice_membership(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_membership public.memberships%rowtype;
  v_item record;
  v_plan public.membership_plans%rowtype;
  v_start date;
  v_end date;
  v_status text;
  v_membership_id uuid;
  v_existing_membership_id uuid;
  v_paid numeric;
  v_credited numeric;
  v_balance numeric;
  v_is_settled boolean;
  v_existing_end date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Acquire row-level exclusive lock on the invoice to serialize concurrent sync calls
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    return null;
  end if;

  -- Verify caller has billing create permissions for this organization
  perform public.require_org_permission(v_invoice.organization_id, 'billing.create');

  -- Draft or void invoices do not activate or create active memberships
  if v_invoice.status in ('draft', 'void') then
    return v_invoice.membership_id;
  end if;

  -- Calculate actual settled amount without referencing non-existent payments.status
  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id;

  select coalesce(sum(amount), 0) into v_credited
  from public.credit_notes
  where invoice_id = p_invoice_id and status = 'applied';

  v_paid := public.round_money(v_paid);
  v_credited := public.round_money(v_credited);
  v_balance := public.round_money(v_invoice.total - v_paid - v_credited);
  v_is_settled := (v_balance <= 0 and v_invoice.status = 'paid');

  -- If invoice already has a linked membership:
  if v_invoice.membership_id is not null then
    select * into v_membership
    from public.memberships
    where id = v_invoice.membership_id;

    if v_membership.id is not null then
      -- Fully settled invoice promotes pending membership to active
      if v_is_settled and v_membership.status = 'pending' then
        update public.memberships
        set status = 'active',
            updated_at = now()
        where id = v_invoice.membership_id;
      end if;
      return v_invoice.membership_id;
    end if;
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

  -- Lock the member row to serialize concurrent membership assignments
  perform 1 from public.gym_members where id = v_invoice.member_id for update;

  -- Uniqueness check: check if a membership was already created for this invoice number
  select id into v_existing_membership_id
  from public.memberships
  where organization_id = v_invoice.organization_id
    and member_id = v_invoice.member_id
    and notes = 'Created from invoice ' || v_invoice.invoice_number
  limit 1;

  if v_existing_membership_id is not null then
    update public.invoices
    set membership_id = v_existing_membership_id
    where id = p_invoice_id;

    if v_is_settled then
      update public.memberships
      set status = 'active',
          updated_at = now()
      where id = v_existing_membership_id
        and status = 'pending';
    end if;
    return v_existing_membership_id;
  end if;

  -- Membership status rules:
  -- Fully settled invoice (balance <= 0 & status = 'paid'): 'active'.
  -- Zero payment or partial payment: 'pending'.
  if v_is_settled then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;

  v_start := coalesce(v_invoice.issue_date, (timezone('utc', now()))::date);

  -- Check existing active or pending memberships to sequence renewals without overlap
  select max(end_date) into v_existing_end
  from public.memberships
  where organization_id = v_invoice.organization_id
    and member_id = v_invoice.member_id
    and status in ('active', 'pending')
    and end_date >= v_start;

  if v_existing_end is not null then
    v_start := v_existing_end + 1;
  end if;

  v_end := v_start + (v_plan.duration_days || ' days')::interval;

  -- Idempotently insert membership
  insert into public.memberships (
    organization_id, branch_id, member_id, plan_id, status,
    start_date, end_date, price, discount, final_amount,
    notes, created_by, created_at, updated_at
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
    v_invoice.created_by,
    now(),
    now()
  )
  returning id into v_membership_id;

  -- Link invoice to newly created membership
  update public.invoices
  set membership_id = v_membership_id
  where id = p_invoice_id;

  return v_membership_id;
end;
$$;

revoke all on function public.sync_invoice_membership(uuid) from public, anon;
grant execute on function public.sync_invoice_membership(uuid) to authenticated;

-- 2. Link invoice to membership RPC with strict cross-member guards
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
  v_invoice public.invoices%rowtype;
  v_membership public.memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then
    raise exception 'invoice not found';
  end if;

  perform public.require_org_permission(v_invoice.organization_id, 'billing.create');

  select * into v_membership from public.memberships where id = p_membership_id;
  if v_membership.id is null or v_membership.organization_id <> v_invoice.organization_id then
    raise exception 'membership not found';
  end if;

  -- Prevent linking an invoice to another Member's membership
  if v_membership.member_id <> v_invoice.member_id then
    raise exception 'cannot link invoice to a membership belonging to a different member';
  end if;

  -- Prevent linking across different branches when both are specified
  if v_invoice.branch_id is not null and v_membership.branch_id is not null
     and v_membership.branch_id <> v_invoice.branch_id then
    raise exception 'cannot link invoice to a membership from a different branch';
  end if;

  -- Prevent overwriting an existing conflicting membership link
  if v_invoice.membership_id is not null and v_invoice.membership_id <> p_membership_id then
    raise exception 'invoice is already linked to membership %', v_invoice.membership_id;
  end if;

  update public.invoices
  set membership_id = p_membership_id
  where id = p_invoice_id;

  -- If invoice is already settled, promote pending membership to active
  if v_invoice.status = 'paid' and v_membership.status = 'pending' then
    update public.memberships
    set status = 'active',
        updated_at = now()
    where id = p_membership_id;
  end if;
end;
$$;

revoke all on function public.link_invoice_membership(uuid, uuid) from public, anon;
grant execute on function public.link_invoice_membership(uuid, uuid) to authenticated;

-- 3. refresh_invoice_status internal helper
-- Note: revoked from authenticated/anon/public to prevent direct unauthenticated invocation.
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

  -- If linked membership exists, synchronize activation when invoice becomes fully settled ('paid')
  if v_invoice.membership_id is not null then
    if v_status = 'paid' then
      update public.memberships
      set status = 'active',
          updated_at = now()
      where id = v_invoice.membership_id
        and status = 'pending';
    end if;
  else
    -- If no membership linked yet, attempt idempotent sync if invoice contains plan items
    perform public.sync_invoice_membership(p_invoice_id);
  end if;
end;
$$;

-- Preserve internal helper ACL: revoke from public, anon, authenticated
revoke all on function public.refresh_invoice_status(uuid) from public, anon, authenticated;

-- 4. issue_invoice RPC
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
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

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

revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- 5. void_invoice RPC with safe linked membership cancellation
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_other_valid_invoices integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invoice
  from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then
    raise exception 'invoice not found';
  end if;

  perform public.require_org_permission(v_invoice.organization_id, 'billing.void');
  if v_invoice.status = 'void' then
    raise exception 'invoice is already cancelled';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'paid invoices cannot be cancelled; issue a credit note or refund';
  end if;

  update public.invoices set
    status = 'void',
    notes = case
      when nullif(trim(p_reason), '') is null then notes
      else coalesce(notes || E'\n', '') || 'Cancelled: ' || trim(p_reason)
    end
  where id = p_invoice_id;

  -- Cancel linked membership only if no other valid invoices (issued, partially_paid, paid) exist for it
  if v_invoice.membership_id is not null then
    select count(*) into v_other_valid_invoices
    from public.invoices
    where membership_id = v_invoice.membership_id
      and id <> p_invoice_id
      and status in ('issued', 'partially_paid', 'paid');

    if v_other_valid_invoices = 0 then
      update public.memberships
      set status = 'cancelled',
          notes = coalesce(notes || E'\n', '') || 'Cancelled: linked invoice ' || v_invoice.invoice_number || ' was voided',
          updated_at = now()
      where id = v_invoice.membership_id
        and status in ('pending', 'active');
    end if;
  end if;
end;
$$;

revoke all on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated;
