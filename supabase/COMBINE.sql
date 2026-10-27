-- =============================================================================
-- BSB FitForge - COMBINE.sql
-- Pending production migrations 20261002000024 through 20261027000035
-- Run once in the Supabase SQL editor. Additive only. Safe to re-run
-- create or replace / add column if not exists statements.
-- =============================================================================


-- #############################################################################
-- FILE: supabase/migrations/20261002000024_sync_invoice_write_path.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Sync invoice write path
-- =============================================================================
-- Additive. Production currently has create_invoice (plan_id/hsn_sac era) but
-- is missing require_org_permission / require_branch_in_org / round_money and
-- the invoices/invoice_items columns added in 20260924000019. create_invoice
-- therefore raises "function ... does not exist" / "column ... does not exist",
-- which the client mapped to "That item could not be found."
--
-- This migration does not drop tables, invent columns, or change RPC
-- signatures. It only installs missing helpers/columns and reinstalls the
-- existing create_invoice / record_payment / membership write RPCs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permission / branch helpers used by create_invoice
-- ---------------------------------------------------------------------------

create or replace function public.require_org_permission(p_org_id uuid, p_permission text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_org_id is null then
    raise exception 'organization is required';
  end if;
  if not public.is_org_member(p_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if not public.user_has_permission(p_org_id, p_permission) then
    raise exception 'insufficient privileges';
  end if;
end;
$$;

revoke all on function public.require_org_permission(uuid, text) from public, anon, authenticated;

create or replace function public.require_branch_in_org(p_org_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_branch_id is null then
    raise exception 'branch is required';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id and b.organization_id = p_org_id
  ) then
    raise exception 'branch not found';
  end if;
  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient privileges';
  end if;
end;
$$;

revoke all on function public.require_branch_in_org(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invoice / item columns required by create_invoice
-- ---------------------------------------------------------------------------

alter table public.invoices add column if not exists membership_id uuid references public.memberships(id) on delete set null;
alter table public.invoices add column if not exists place_of_supply text;
alter table public.invoices add column if not exists tax_mode text not null default 'exclusive';
alter table public.invoices add column if not exists cgst numeric(12, 2) not null default 0;
alter table public.invoices add column if not exists sgst numeric(12, 2) not null default 0;
alter table public.invoices add column if not exists igst numeric(12, 2) not null default 0;
alter table public.invoices add column if not exists round_off numeric(12, 2) not null default 0;
alter table public.invoices add column if not exists amount_credited numeric(12, 2) not null default 0;

alter table public.invoices drop constraint if exists invoices_tax_mode_check;
alter table public.invoices add constraint invoices_tax_mode_check
  check (tax_mode in ('exclusive', 'inclusive'));

alter table public.invoice_items add column if not exists item_type text not null default 'other';
alter table public.invoice_items add column if not exists discount numeric(12, 2) not null default 0;
alter table public.invoice_items add column if not exists taxable_amount numeric(12, 2) not null default 0;
alter table public.invoice_items add column if not exists gst_amount numeric(12, 2) not null default 0;
alter table public.invoice_items add column if not exists cgst numeric(12, 2) not null default 0;
alter table public.invoice_items add column if not exists sgst numeric(12, 2) not null default 0;
alter table public.invoice_items add column if not exists igst numeric(12, 2) not null default 0;
alter table public.invoice_items add column if not exists hsn_sac text;
alter table public.invoice_items add column if not exists plan_id uuid references public.membership_plans(id) on delete set null;

alter table public.invoice_items drop constraint if exists invoice_items_item_type_check;
alter table public.invoice_items add constraint invoice_items_item_type_check
  check (item_type in ('membership', 'renewal', 'upgrade', 'personal_training', 'class', 'product', 'other'));

create index if not exists invoice_items_plan_idx on public.invoice_items(plan_id);

alter table public.installments add column if not exists paid_amount numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Money / numbering helpers
-- ---------------------------------------------------------------------------

create or replace function public.round_money(p_value numeric)
returns numeric
language sql
immutable
as $$
  select round(coalesce(p_value, 0)::numeric, 2);
$$;

create or replace function public.next_document_number(p_org_id uuid, p_key text, p_default_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_prefix text;
  v_next integer;
  v_padding integer;
  v_number text;
begin
  select setting_value into v_settings
  from public.organization_settings
  where organization_id = p_org_id and setting_key = p_key;

  v_prefix := coalesce(nullif(v_settings ->> 'prefix', ''), p_default_prefix);
  v_next := greatest(coalesce((v_settings ->> 'nextNumber')::integer, 1), 1);
  v_padding := least(greatest(coalesce((v_settings ->> 'padding')::integer, 4), 3), 8);
  v_number := v_prefix || '-' || lpad(v_next::text, v_padding, '0');

  insert into public.organization_settings (organization_id, setting_key, setting_value)
  values (
    p_org_id,
    p_key,
    jsonb_build_object('prefix', v_prefix, 'nextNumber', v_next + 1, 'padding', v_padding)
      || coalesce(v_settings, '{}'::jsonb)
      || jsonb_build_object('nextNumber', v_next + 1)
  )
  on conflict (organization_id, setting_key) do update
    set setting_value = public.organization_settings.setting_value
      || jsonb_build_object('nextNumber', v_next + 1);

  return v_number;
end;
$$;

revoke all on function public.next_document_number(uuid, text, text) from public, anon, authenticated;

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
end;
$$;

revoke all on function public.refresh_invoice_status(uuid) from public, anon, authenticated;

create or replace function public.apply_payment_to_installments(p_invoice_id uuid, p_payment_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric := public.round_money(p_amount);
  v_row public.installments%rowtype;
  v_apply numeric;
begin
  for v_row in
    select * from public.installments
    where invoice_id = p_invoice_id and status is distinct from 'paid'
    order by sort_order, due_date
  loop
    exit when v_remaining <= 0;
    v_apply := least(public.round_money(v_row.amount - coalesce(v_row.paid_amount, 0)), v_remaining);
    if v_apply <= 0 then
      continue;
    end if;
    update public.installments set
      paid_amount = public.round_money(coalesce(paid_amount, 0) + v_apply),
      payment_id = coalesce(payment_id, p_payment_id),
      status = case
        when public.round_money(coalesce(paid_amount, 0) + v_apply) >= amount then 'paid'
        when due_date < (timezone('utc', now()))::date then 'overdue'
        else 'pending'
      end,
      paid_at = case
        when public.round_money(coalesce(paid_amount, 0) + v_apply) >= amount then timezone('utc', now())
        else paid_at
      end
    where id = v_row.id;
    v_remaining := public.round_money(v_remaining - v_apply);
  end loop;
end;
$$;

revoke all on function public.apply_payment_to_installments(uuid, uuid, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_invoice (same signature; snapshots unit_price; requires plan_id for
-- membership lines; validates membership_plans.organization_id)
-- ---------------------------------------------------------------------------

create or replace function public.create_invoice(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_membership_id uuid,
  p_issue_date date,
  p_due_date date,
  p_notes text,
  p_place_of_supply text,
  p_tax_mode text,
  p_round_off numeric,
  p_items jsonb,
  p_issue boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_item jsonb;
  v_idx integer := 0;
  v_qty numeric;
  v_price numeric;
  v_discount numeric;
  v_rate numeric;
  v_gross numeric;
  v_after numeric;
  v_taxable numeric;
  v_gst numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_line numeric;
  v_sub numeric := 0;
  v_disc numeric := 0;
  v_taxable_sum numeric := 0;
  v_cgst_sum numeric := 0;
  v_sgst_sum numeric := 0;
  v_igst_sum numeric := 0;
  v_tax_sum numeric := 0;
  v_total numeric := 0;
  v_round numeric;
  v_mode text;
  v_supply text;
  v_inter boolean;
  v_org_state text;
  v_type text;
  v_hsn text;
  v_plan_id uuid;
begin
  perform public.require_org_permission(p_org_id, 'billing.create'::text);
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if p_member_id is null or not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  if p_membership_id is not null and not exists (
    select 1 from public.memberships ms
    where ms.id = p_membership_id and ms.organization_id = p_org_id and ms.member_id = p_member_id
  ) then
    raise exception 'membership not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one invoice item is required';
  end if;

  v_mode := coalesce(nullif(p_tax_mode, ''), 'exclusive');
  if v_mode not in ('exclusive', 'inclusive') then
    raise exception 'tax mode is invalid';
  end if;

  select state into v_org_state from public.organizations where id = p_org_id;
  v_supply := coalesce(nullif(trim(p_place_of_supply), ''), v_org_state, '');
  v_inter := v_org_state is not null and v_supply <> '' and lower(v_org_state) is distinct from lower(v_supply);
  v_round := public.round_money(coalesce(p_round_off, 0));

  v_number := public.next_document_number(p_org_id, 'invoice', 'INV');

  insert into public.invoices (
    organization_id, branch_id, member_id, membership_id, invoice_number, status,
    issue_date, due_date, notes, place_of_supply, tax_mode, round_off, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id, p_membership_id, v_number,
    case when coalesce(p_issue, false) then 'issued' else 'draft' end,
    coalesce(p_issue_date, (timezone('utc', now()))::date),
    p_due_date,
    nullif(trim(p_notes), ''),
    nullif(trim(v_supply), ''),
    v_mode,
    v_round,
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 1);
    v_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    v_discount := coalesce((v_item ->> 'discount')::numeric, 0);
    v_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_type := coalesce(nullif(v_item ->> 'item_type', ''), 'other');
    v_hsn := nullif(trim(v_item ->> 'hsn_sac'), '');
    v_plan_id := nullif(trim(v_item ->> 'plan_id'), '')::uuid;
    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero';
    end if;
    if v_price < 0 or v_discount < 0 or v_rate < 0 then
      raise exception 'amounts cannot be negative';
    end if;
    if v_type not in ('membership', 'renewal', 'upgrade', 'personal_training', 'class', 'product', 'other') then
      raise exception 'item type is invalid';
    end if;
    if coalesce(nullif(trim(v_item ->> 'description'), ''), '') = '' then
      raise exception 'item description is required';
    end if;
    if v_type = 'membership' and v_plan_id is null then
      raise exception 'membership plan is required';
    end if;
    if v_plan_id is not null and not exists (
      select 1 from public.membership_plans p
      where p.id = v_plan_id and p.organization_id = p_org_id
    ) then
      raise exception 'membership plan not found';
    end if;

    v_gross := public.round_money(v_qty * v_price);
    v_after := greatest(public.round_money(v_gross - v_discount), 0);
    if v_mode = 'inclusive' and v_rate > 0 then
      v_taxable := public.round_money(v_after / (1 + v_rate / 100));
      v_gst := public.round_money(v_after - v_taxable);
    else
      v_taxable := v_after;
      v_gst := public.round_money(v_taxable * (v_rate / 100));
    end if;

    if v_inter then
      v_igst := v_gst;
      v_cgst := 0;
      v_sgst := 0;
    else
      v_cgst := public.round_money(v_gst / 2);
      v_sgst := public.round_money(v_gst - v_cgst);
      v_igst := 0;
    end if;

    v_line := case when v_mode = 'inclusive' then v_after else public.round_money(v_taxable + v_gst) end;

    insert into public.invoice_items (
      organization_id, invoice_id, description, item_type, quantity, unit_price, discount,
      tax_rate, taxable_amount, gst_amount, cgst, sgst, igst, line_total, sort_order, hsn_sac, plan_id
    )
    values (
      p_org_id, v_id, trim(v_item ->> 'description'), v_type, v_qty, v_price, v_discount,
      v_rate, v_taxable, v_gst, v_cgst, v_sgst, v_igst, v_line, v_idx, v_hsn, v_plan_id
    );

    v_sub := v_sub + v_gross;
    v_disc := v_disc + v_discount;
    v_taxable_sum := v_taxable_sum + v_taxable;
    v_cgst_sum := v_cgst_sum + v_cgst;
    v_sgst_sum := v_sgst_sum + v_sgst;
    v_igst_sum := v_igst_sum + v_igst;
    v_tax_sum := v_tax_sum + v_gst;
    v_total := v_total + v_line;
    v_idx := v_idx + 1;
  end loop;

  v_total := greatest(public.round_money(v_total + v_round), 0);

  update public.invoices set
    sub_total = public.round_money(v_sub),
    discount = public.round_money(v_disc),
    tax_total = public.round_money(v_tax_sum),
    cgst = public.round_money(v_cgst_sum),
    sgst = public.round_money(v_sgst_sum),
    igst = public.round_money(v_igst_sum),
    total = v_total
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.create_invoice(
  uuid, uuid, uuid, uuid, date, date, text, text, text, numeric, jsonb, boolean
) to authenticated;

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
end;
$$;

grant execute on function public.issue_invoice(uuid) to authenticated;

create or replace function public.record_payment(
  p_org_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_paid_at timestamptz,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_id uuid;
  v_method text;
  v_balance numeric;
begin
  perform public.require_org_permission(p_org_id, 'payments.create'::text);

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null or v_invoice.organization_id <> p_org_id then
    raise exception 'invoice not found';
  end if;
  perform public.require_branch_in_org(p_org_id, v_invoice.branch_id);

  if v_invoice.status in ('draft', 'void') then
    raise exception 'payments can only be recorded against issued invoices';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be greater than zero';
  end if;

  v_method := coalesce(nullif(p_method, ''), 'cash');
  if v_method not in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other') then
    raise exception 'payment method is invalid';
  end if;

  perform public.refresh_invoice_status(p_invoice_id);
  select * into v_invoice from public.invoices where id = p_invoice_id;
  v_balance := public.round_money(v_invoice.total - v_invoice.amount_paid - coalesce(v_invoice.amount_credited, 0));
  if public.round_money(p_amount) > v_balance then
    raise exception 'payment exceeds the outstanding balance';
  end if;

  insert into public.payments (
    organization_id, branch_id, invoice_id, member_id, amount, method, reference, paid_at, notes, created_by
  )
  values (
    p_org_id, v_invoice.branch_id, p_invoice_id, v_invoice.member_id,
    public.round_money(p_amount), v_method, nullif(trim(p_reference), ''),
    coalesce(p_paid_at, timezone('utc', now())), nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  perform public.apply_payment_to_installments(p_invoice_id, v_id, public.round_money(p_amount));
  perform public.refresh_invoice_status(p_invoice_id);

  return v_id;
end;
$$;

grant execute on function public.record_payment(
  uuid, uuid, numeric, text, text, timestamptz, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Membership write path used after a successful invoice (checkbox)
-- ---------------------------------------------------------------------------

create or replace function public.create_membership(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_plan_id uuid,
  p_start_date date,
  p_end_date date,
  p_price numeric,
  p_discount numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_plan public.membership_plans%rowtype;
  v_start date;
  v_end date;
  v_price numeric;
  v_discount numeric;
  v_final numeric;
begin
  perform public.require_org_permission(p_org_id, 'memberships.create'::text);
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  select * into v_plan from public.membership_plans
  where id = p_plan_id and organization_id = p_org_id;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;
  if v_plan.is_active is not true then
    raise exception 'plan is not active';
  end if;

  v_start := coalesce(p_start_date, (timezone('utc', now()))::date);
  v_end := coalesce(p_end_date, v_start + (v_plan.duration_days || ' days')::interval);
  if v_end < v_start then
    raise exception 'end date cannot be before start date';
  end if;

  if exists (
    select 1 from public.memberships m
    where m.organization_id = p_org_id
      and m.member_id = p_member_id
      and m.status = 'active'
      and m.start_date <= v_end
      and m.end_date >= v_start
  ) then
    raise exception 'member already has an overlapping active membership';
  end if;

  v_price := coalesce(p_price, v_plan.price);
  v_discount := coalesce(p_discount, 0);
  if v_price < 0 or v_discount < 0 then
    raise exception 'amounts cannot be negative';
  end if;
  v_final := greatest(v_price - v_discount, 0);

  insert into public.memberships (
    organization_id, branch_id, member_id, plan_id, status,
    start_date, end_date, price, discount, final_amount, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id, p_plan_id, 'active',
    v_start, v_end, v_price, v_discount, v_final, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_membership(
  uuid, uuid, uuid, uuid, date, date, numeric, numeric, text
) to authenticated;

create or replace function public.extend_membership(
  p_membership_id uuid,
  p_days integer,
  p_notes text
)
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
  from public.memberships
  where id = p_membership_id;
  if v_org_id is null then
    raise exception 'membership not found';
  end if;
  perform public.require_org_permission(v_org_id, 'memberships.extend'::text);
  if v_status is distinct from 'active' then
    raise exception 'only active memberships can be extended';
  end if;
  if p_days is null or p_days <= 0 then
    raise exception 'extension days must be greater than zero';
  end if;

  update public.memberships set
    end_date = end_date + (p_days || ' days')::interval,
    notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_membership_id;
end;
$$;

grant execute on function public.extend_membership(uuid, integer, text) to authenticated;


-- #############################################################################
-- FILE: supabase/migrations/20261004000025_installment_remaining_balance.sql
-- #############################################################################

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


-- #############################################################################
-- FILE: supabase/migrations/20261004000026_record_split_payments.sql
-- #############################################################################

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


-- #############################################################################
-- FILE: supabase/migrations/20261005000027_fitness_plan_item_rpcs.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Workout/diet plan item write path
-- =============================================================================
-- Additive. Reuses public.workout_plan_items / diet_plan_items. organization_id
-- is derived from the parent plan. Writes go through SECURITY DEFINER RPCs.
-- Select-only RLS stays the read boundary. No hard deletes.
-- =============================================================================

create or replace function public.create_workout_plan_item(
  p_org_id uuid,
  p_plan_id uuid,
  p_exercise_id uuid,
  p_day_label text,
  p_sets integer,
  p_reps text,
  p_weight text,
  p_rest_seconds integer,
  p_sort_order integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org_id uuid;
  v_sort integer;
begin
  perform public.require_org_permission(p_org_id, 'fitness.manage');

  select organization_id into v_org_id
  from public.workout_plans
  where id = p_plan_id;
  if v_org_id is null or v_org_id <> p_org_id then
    raise exception 'plan not found';
  end if;

  if p_exercise_id is not null and not exists (
    select 1 from public.exercises e
    where e.id = p_exercise_id and e.organization_id = p_org_id
  ) then
    raise exception 'exercise not found';
  end if;

  v_sort := coalesce(p_sort_order, (
    select coalesce(max(i.sort_order), -1) + 1
    from public.workout_plan_items i
    where i.plan_id = p_plan_id
  ));

  insert into public.workout_plan_items (
    organization_id, plan_id, exercise_id, day_label, sets, reps, weight,
    rest_seconds, sort_order, notes
  )
  values (
    p_org_id, p_plan_id, p_exercise_id, nullif(trim(p_day_label), ''),
    p_sets, nullif(trim(p_reps), ''), nullif(trim(p_weight), ''),
    p_rest_seconds, v_sort, nullif(trim(p_notes), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_workout_plan_item(
  uuid, uuid, uuid, text, integer, text, text, integer, integer, text
) to authenticated;

create or replace function public.update_workout_plan_item(
  p_item_id uuid,
  p_exercise_id uuid,
  p_day_label text,
  p_sets integer,
  p_reps text,
  p_weight text,
  p_rest_seconds integer,
  p_sort_order integer,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.workout_plan_items where id = p_item_id;
  if v_org_id is null then
    raise exception 'item not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');

  if p_exercise_id is not null and not exists (
    select 1 from public.exercises e
    where e.id = p_exercise_id and e.organization_id = v_org_id
  ) then
    raise exception 'exercise not found';
  end if;

  update public.workout_plan_items set
    exercise_id = p_exercise_id,
    day_label = nullif(trim(p_day_label), ''),
    sets = p_sets,
    reps = nullif(trim(p_reps), ''),
    weight = nullif(trim(p_weight), ''),
    rest_seconds = p_rest_seconds,
    sort_order = coalesce(p_sort_order, sort_order),
    notes = nullif(trim(p_notes), '')
  where id = p_item_id;
end;
$$;

grant execute on function public.update_workout_plan_item(
  uuid, uuid, text, integer, text, text, integer, integer, text
) to authenticated;

create or replace function public.create_diet_plan_item(
  p_org_id uuid,
  p_diet_plan_id uuid,
  p_meal text,
  p_description text,
  p_calories integer,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org_id uuid;
  v_meal text;
  v_sort integer;
begin
  perform public.require_org_permission(p_org_id, 'fitness.manage');

  select organization_id into v_org_id
  from public.diet_plans
  where id = p_diet_plan_id;
  if v_org_id is null or v_org_id <> p_org_id then
    raise exception 'plan not found';
  end if;

  v_meal := trim(p_meal);
  if v_meal is null or v_meal = '' then
    raise exception 'meal is required';
  end if;

  v_sort := coalesce(p_sort_order, (
    select coalesce(max(i.sort_order), -1) + 1
    from public.diet_plan_items i
    where i.diet_plan_id = p_diet_plan_id
  ));

  insert into public.diet_plan_items (
    organization_id, diet_plan_id, meal, description, calories, sort_order
  )
  values (
    p_org_id, p_diet_plan_id, v_meal, nullif(trim(p_description), ''),
    p_calories, v_sort
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_diet_plan_item(
  uuid, uuid, text, text, integer, integer
) to authenticated;

create or replace function public.update_diet_plan_item(
  p_item_id uuid,
  p_meal text,
  p_description text,
  p_calories integer,
  p_sort_order integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_meal text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.diet_plan_items where id = p_item_id;
  if v_org_id is null then
    raise exception 'item not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');

  v_meal := trim(p_meal);
  if v_meal is null or v_meal = '' then
    raise exception 'meal is required';
  end if;

  update public.diet_plan_items set
    meal = v_meal,
    description = nullif(trim(p_description), ''),
    calories = p_calories,
    sort_order = coalesce(p_sort_order, sort_order)
  where id = p_item_id;
end;
$$;

grant execute on function public.update_diet_plan_item(
  uuid, text, text, integer, integer
) to authenticated;


-- #############################################################################
-- FILE: supabase/migrations/20261007000028_crm_write_rpcs.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Phase 6: CRM write path
-- =============================================================================
-- Additive SECURITY DEFINER RPCs for existing CRM tables:
--   leads, follow_ups, trial_memberships, referrals
-- plus convert_lead_to_member, which reuses gym_members (create_gym_member
-- rules) and sets leads.converted_member_id / status = converted.
--
-- Tables stay select-only RLS. organization_id is derived server-side.
-- Soft status only. No hard deletes. No new CRM tables or statuses.
-- =============================================================================

-- Composite branch FKs already exist. Add simple branch_id FKs so PostgREST
-- can embed branches on CRM reads, matching gym_members.
alter table public.leads drop constraint if exists leads_branch_id_fkey;
alter table public.leads add constraint leads_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

alter table public.follow_ups drop constraint if exists follow_ups_branch_id_fkey;
alter table public.follow_ups add constraint follow_ups_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

alter table public.trial_memberships drop constraint if exists trial_memberships_branch_id_fkey;
alter table public.trial_memberships add constraint trial_memberships_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create or replace function public.create_lead(
  p_org_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_source text,
  p_status text,
  p_interest text,
  p_notes text,
  p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_first text;
  v_last text;
  v_email text;
  v_status text;
begin
  perform public.require_org_permission(p_org_id, 'crm.manage');
  if p_branch_id is not null then
    perform public.require_branch_in_org(p_org_id, p_branch_id);
  end if;

  v_first := trim(p_first_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  v_last := nullif(trim(p_last_name), '');
  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'new');
  if v_status not in ('new', 'contacted', 'qualified', 'trial', 'lost') then
    raise exception 'status is invalid';
  end if;

  insert into public.leads (
    organization_id, branch_id, first_name, last_name, email, phone,
    source, status, interest, notes, assigned_to, created_by
  )
  values (
    p_org_id,
    p_branch_id,
    v_first,
    v_last,
    v_email,
    nullif(trim(p_phone), ''),
    nullif(trim(p_source), ''),
    v_status,
    nullif(trim(p_interest), ''),
    nullif(trim(p_notes), ''),
    p_assigned_to,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_lead(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to authenticated;

create or replace function public.update_lead(
  p_lead_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_source text,
  p_status text,
  p_interest text,
  p_notes text,
  p_assigned_to uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_current_status text;
  v_first text;
  v_last text;
  v_email text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id, status into v_org_id, v_current_status
  from public.leads where id = p_lead_id;
  if v_org_id is null then
    raise exception 'lead not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');
  if p_branch_id is not null then
    perform public.require_branch_in_org(v_org_id, p_branch_id);
  end if;

  v_first := trim(p_first_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  v_last := nullif(trim(p_last_name), '');
  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), v_current_status);
  if v_current_status = 'converted' then
    v_status := 'converted';
  elsif v_status = 'converted' then
    raise exception 'convert the lead to create a member';
  elsif v_status not in ('new', 'contacted', 'qualified', 'trial', 'lost') then
    raise exception 'status is invalid';
  end if;

  update public.leads set
    branch_id = p_branch_id,
    first_name = v_first,
    last_name = v_last,
    email = v_email,
    phone = nullif(trim(p_phone), ''),
    source = nullif(trim(p_source), ''),
    status = v_status,
    interest = nullif(trim(p_interest), ''),
    notes = nullif(trim(p_notes), ''),
    assigned_to = p_assigned_to
  where id = p_lead_id;
end;
$$;

grant execute on function public.update_lead(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to authenticated;

create or replace function public.set_lead_status(
  p_lead_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_current text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id, status into v_org_id, v_current
  from public.leads where id = p_lead_id;
  if v_org_id is null then
    raise exception 'lead not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');

  v_status := trim(p_status);
  if v_current = 'converted' then
    raise exception 'converted leads cannot change status';
  end if;
  if v_status = 'converted' then
    raise exception 'convert the lead to create a member';
  end if;
  if v_status not in ('new', 'contacted', 'qualified', 'trial', 'lost') then
    raise exception 'status is invalid';
  end if;

  update public.leads set status = v_status where id = p_lead_id;
end;
$$;

grant execute on function public.set_lead_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Follow-ups
-- ---------------------------------------------------------------------------

create or replace function public.create_follow_up(
  p_org_id uuid,
  p_branch_id uuid,
  p_lead_id uuid,
  p_member_id uuid,
  p_due_at timestamptz,
  p_notes text,
  p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_branch uuid;
  v_lead_org uuid;
  v_member_org uuid;
begin
  perform public.require_org_permission(p_org_id, 'crm.manage');
  if p_lead_id is null and p_member_id is null then
    raise exception 'a lead or member is required';
  end if;
  if p_due_at is null then
    raise exception 'due date is required';
  end if;

  v_branch := p_branch_id;

  if p_lead_id is not null then
    select organization_id, coalesce(v_branch, branch_id) into v_lead_org, v_branch
    from public.leads where id = p_lead_id;
    if v_lead_org is null or v_lead_org <> p_org_id then
      raise exception 'lead not found';
    end if;
  end if;

  if p_member_id is not null then
    select organization_id, coalesce(v_branch, branch_id) into v_member_org, v_branch
    from public.gym_members where id = p_member_id;
    if v_member_org is null or v_member_org <> p_org_id then
      raise exception 'member not found';
    end if;
  end if;

  if v_branch is not null then
    perform public.require_branch_in_org(p_org_id, v_branch);
  end if;

  insert into public.follow_ups (
    organization_id, branch_id, lead_id, member_id, due_at, status, notes,
    assigned_to, created_by
  )
  values (
    p_org_id,
    v_branch,
    p_lead_id,
    p_member_id,
    p_due_at,
    'pending',
    nullif(trim(p_notes), ''),
    p_assigned_to,
    auth.uid()
  )
  returning id into v_id;

  if p_lead_id is not null then
    update public.leads
    set status = 'contacted'
    where id = p_lead_id and status = 'new';
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_follow_up(
  uuid, uuid, uuid, uuid, timestamptz, text, uuid
) to authenticated;

create or replace function public.update_follow_up(
  p_follow_up_id uuid,
  p_due_at timestamptz,
  p_status text,
  p_notes text,
  p_assigned_to uuid
)
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

  select organization_id into v_org_id
  from public.follow_ups where id = p_follow_up_id;
  if v_org_id is null then
    raise exception 'follow-up not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');

  if p_due_at is null then
    raise exception 'due date is required';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'pending');
  if v_status not in ('pending', 'done', 'cancelled') then
    raise exception 'status is invalid';
  end if;

  update public.follow_ups set
    due_at = p_due_at,
    status = v_status,
    notes = nullif(trim(p_notes), ''),
    assigned_to = p_assigned_to
  where id = p_follow_up_id;
end;
$$;

grant execute on function public.update_follow_up(
  uuid, timestamptz, text, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Trial memberships
-- ---------------------------------------------------------------------------

create or replace function public.create_trial_membership(
  p_org_id uuid,
  p_branch_id uuid,
  p_lead_id uuid,
  p_member_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_starts date;
  v_ends date;
  v_lead_org uuid;
  v_member_org uuid;
begin
  perform public.require_org_permission(p_org_id, 'crm.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);
  if p_lead_id is null and p_member_id is null then
    raise exception 'a lead or member is required';
  end if;

  v_starts := coalesce(p_starts_on, (timezone('utc', now()))::date);
  v_ends := coalesce(p_ends_on, v_starts + 7);
  if v_ends < v_starts then
    raise exception 'end date cannot be before start date';
  end if;

  if p_lead_id is not null then
    select organization_id into v_lead_org from public.leads where id = p_lead_id;
    if v_lead_org is null or v_lead_org <> p_org_id then
      raise exception 'lead not found';
    end if;
  end if;

  if p_member_id is not null then
    select organization_id into v_member_org from public.gym_members where id = p_member_id;
    if v_member_org is null or v_member_org <> p_org_id then
      raise exception 'member not found';
    end if;
  end if;

  insert into public.trial_memberships (
    organization_id, branch_id, lead_id, member_id, starts_on, ends_on,
    status, notes, created_by
  )
  values (
    p_org_id,
    p_branch_id,
    p_lead_id,
    p_member_id,
    v_starts,
    v_ends,
    'scheduled',
    nullif(trim(p_notes), ''),
    auth.uid()
  )
  returning id into v_id;

  if p_lead_id is not null then
    update public.leads
    set status = 'trial'
    where id = p_lead_id and status in ('new', 'contacted', 'qualified');
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_trial_membership(
  uuid, uuid, uuid, uuid, date, date, text
) to authenticated;

create or replace function public.update_trial_membership(
  p_trial_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_status text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_starts date;
  v_ends date;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id, starts_on, ends_on into v_org_id, v_starts, v_ends
  from public.trial_memberships where id = p_trial_id;
  if v_org_id is null then
    raise exception 'trial not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');

  v_starts := coalesce(p_starts_on, v_starts);
  v_ends := coalesce(p_ends_on, v_ends);
  if v_ends < v_starts then
    raise exception 'end date cannot be before start date';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'scheduled');
  if v_status not in ('scheduled', 'active', 'completed', 'cancelled') then
    raise exception 'status is invalid';
  end if;

  update public.trial_memberships set
    starts_on = v_starts,
    ends_on = v_ends,
    status = v_status,
    notes = nullif(trim(p_notes), '')
  where id = p_trial_id;
end;
$$;

grant execute on function public.update_trial_membership(
  uuid, date, date, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------------------------

create or replace function public.create_referral(
  p_org_id uuid,
  p_referrer_member_id uuid,
  p_referred_name text,
  p_referred_phone text,
  p_referred_email text,
  p_reward text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_member_org uuid;
  v_name text;
  v_email text;
begin
  perform public.require_org_permission(p_org_id, 'crm.manage');

  if p_referrer_member_id is null then
    raise exception 'referrer is required';
  end if;
  select organization_id into v_member_org
  from public.gym_members where id = p_referrer_member_id;
  if v_member_org is null or v_member_org <> p_org_id then
    raise exception 'member not found';
  end if;

  v_name := trim(p_referred_name);
  if v_name is null or v_name = '' then
    raise exception 'referred name is required';
  end if;
  v_email := nullif(lower(trim(p_referred_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  insert into public.referrals (
    organization_id, referrer_member_id, referred_name, referred_phone,
    referred_email, status, reward, notes, created_by
  )
  values (
    p_org_id,
    p_referrer_member_id,
    v_name,
    nullif(trim(p_referred_phone), ''),
    v_email,
    'pending',
    nullif(trim(p_reward), ''),
    nullif(trim(p_notes), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_referral(
  uuid, uuid, text, text, text, text, text
) to authenticated;

create or replace function public.update_referral(
  p_referral_id uuid,
  p_referred_name text,
  p_referred_phone text,
  p_referred_email text,
  p_status text,
  p_reward text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
  v_email text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id into v_org_id
  from public.referrals where id = p_referral_id;
  if v_org_id is null then
    raise exception 'referral not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');

  v_name := trim(p_referred_name);
  if v_name is null or v_name = '' then
    raise exception 'referred name is required';
  end if;
  v_email := nullif(lower(trim(p_referred_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'pending');
  if v_status not in ('pending', 'converted', 'expired') then
    raise exception 'status is invalid';
  end if;

  update public.referrals set
    referred_name = v_name,
    referred_phone = nullif(trim(p_referred_phone), ''),
    referred_email = v_email,
    status = v_status,
    reward = nullif(trim(p_reward), ''),
    notes = nullif(trim(p_notes), '')
  where id = p_referral_id;
end;
$$;

grant execute on function public.update_referral(
  uuid, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Convert lead -> gym member (reuses gym_members + generate_gym_member_code)
-- ---------------------------------------------------------------------------

create or replace function public.convert_lead_to_member(
  p_lead_id uuid,
  p_branch_id uuid,
  p_last_name text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_member_id uuid;
  v_branch uuid;
  v_first text;
  v_last text;
  v_phone text;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_lead from public.leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'lead not found';
  end if;
  perform public.require_org_permission(v_lead.organization_id, 'crm.manage');
  perform public.require_org_permission(v_lead.organization_id, 'members.create');

  if v_lead.converted_member_id is not null then
    update public.leads
    set status = 'converted'
    where id = p_lead_id and status is distinct from 'converted';
    return v_lead.converted_member_id;
  end if;

  v_branch := coalesce(p_branch_id, v_lead.branch_id);
  perform public.require_branch_in_org(v_lead.organization_id, v_branch);

  v_first := trim(v_lead.first_name);
  v_last := coalesce(nullif(trim(p_last_name), ''), nullif(trim(v_lead.last_name), ''));
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  if v_last is null or v_last = '' then
    raise exception 'last name is required';
  end if;

  v_phone := coalesce(nullif(trim(p_phone), ''), nullif(trim(v_lead.phone), ''));
  v_phone := regexp_replace(trim(coalesce(v_phone, '')), '\s+', ' ', 'g');
  if v_phone is null or v_phone = '' then
    raise exception 'phone is required';
  end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'phone must contain at least 8 digits';
  end if;

  v_code := public.generate_gym_member_code(v_lead.organization_id);

  insert into public.gym_members (
    organization_id, branch_id, code,
    first_name, last_name, email, phone, notes, status, joined_at, created_by
  )
  values (
    v_lead.organization_id,
    v_branch,
    v_code,
    v_first,
    v_last,
    v_lead.email,
    v_phone,
    v_lead.notes,
    'active',
    (timezone('utc', now()))::date,
    auth.uid()
  )
  returning id into v_member_id;

  update public.leads
  set
    converted_member_id = v_member_id,
    status = 'converted',
    last_name = coalesce(v_lead.last_name, v_last),
    phone = coalesce(v_lead.phone, v_phone),
    branch_id = coalesce(v_lead.branch_id, v_branch)
  where id = p_lead_id;

  update public.follow_ups
  set member_id = coalesce(member_id, v_member_id)
  where lead_id = p_lead_id and organization_id = v_lead.organization_id;

  update public.trial_memberships
  set member_id = coalesce(member_id, v_member_id)
  where lead_id = p_lead_id and organization_id = v_lead.organization_id;

  return v_member_id;
end;
$$;

grant execute on function public.convert_lead_to_member(
  uuid, uuid, text, text
) to authenticated;


-- #############################################################################
-- FILE: supabase/migrations/20261008000029_upsert_branch_setting.sql
-- #############################################################################

-- Additive. Branch override writes for the existing branch_settings JSONB store.
-- Reuses is_org_admin and require_branch_in_org. No new tables. No deletes.

create or replace function public.upsert_branch_setting(
  p_org_id uuid,
  p_branch_id uuid,
  p_setting_key text,
  p_setting_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_org_id is null then
    raise exception 'organization is required';
  end if;
  if not public.is_org_admin(p_org_id) then
    raise exception 'insufficient privileges';
  end if;
  perform public.require_branch_in_org(p_org_id, p_branch_id);
  if nullif(trim(p_setting_key), '') is null then
    raise exception 'setting key is required';
  end if;
  if p_setting_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'setting key is invalid';
  end if;

  insert into public.branch_settings (
    organization_id, branch_id, setting_key, setting_value
  )
  values (
    p_org_id,
    p_branch_id,
    trim(p_setting_key),
    coalesce(p_setting_value, '{}'::jsonb)
  )
  on conflict (branch_id, setting_key)
  do update set setting_value = excluded.setting_value;
end;
$$;

grant execute on function public.upsert_branch_setting(uuid, uuid, text, jsonb) to authenticated;



-- #############################################################################
-- FILE: supabase/migrations/20261013000030_pos_inventory_purchases.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Phase 7: POS, inventory and purchases write path
-- =============================================================================
-- Additive SECURITY DEFINER RPCs for existing commerce tables:
--   products, pos_sales, pos_sale_items, purchases, purchase_items,
--   stock_movements, suppliers
--
-- Tables stay select-only RLS. organization_id is derived server-side.
-- Soft status only. No hard deletes of sales, purchases or movements.
-- Stock changes only through stock_movements (except product opening qty).
-- =============================================================================

-- Composite branch FKs already exist. Add simple branch_id FKs so PostgREST
-- can embed branches on POS, purchase and stock-movement reads.
alter table public.pos_sales drop constraint if exists pos_sales_branch_id_fkey;
alter table public.pos_sales add constraint pos_sales_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

alter table public.purchases drop constraint if exists purchases_branch_id_fkey;
alter table public.purchases add constraint purchases_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

alter table public.stock_movements drop constraint if exists stock_movements_branch_id_fkey;
alter table public.stock_movements add constraint stock_movements_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

-- ---------------------------------------------------------------------------
-- Product update no longer overwrites on-hand stock. Opening qty stays on
-- create_product. Later qty changes go through purchases / POS / void.
-- Signature is unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.update_product(
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_description text,
  p_category text,
  p_unit text,
  p_cost_price numeric,
  p_sale_price numeric,
  p_tax_rate numeric,
  p_track_stock boolean,
  p_stock_quantity numeric,
  p_reorder_level numeric,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
  v_sku text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.products where id = p_product_id;
  if v_org_id is null then
    raise exception 'product not found';
  end if;
  if not public.user_has_permission(v_org_id, 'inventory.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'product name is required';
  end if;
  v_sku := nullif(upper(trim(p_sku)), '');
  if v_sku is not null and exists (
    select 1 from public.products p
    where p.organization_id = v_org_id and p.sku = v_sku and p.id <> p_product_id
  ) then
    raise exception 'product sku already exists';
  end if;
  if coalesce(p_cost_price, 0) < 0 or coalesce(p_sale_price, 0) < 0
     or coalesce(p_tax_rate, 0) < 0 then
    raise exception 'amounts cannot be negative';
  end if;
  if coalesce(p_reorder_level, 0) < 0 then
    raise exception 'stock values cannot be negative';
  end if;

  update public.products set
    name = v_name,
    sku = v_sku,
    description = nullif(trim(p_description), ''),
    category = nullif(trim(p_category), ''),
    unit = coalesce(nullif(trim(p_unit), ''), 'pcs'),
    cost_price = coalesce(p_cost_price, 0),
    sale_price = coalesce(p_sale_price, 0),
    tax_rate = coalesce(p_tax_rate, 0),
    track_stock = coalesce(p_track_stock, true),
    reorder_level = coalesce(p_reorder_level, 0),
    is_active = coalesce(p_is_active, true)
  where id = p_product_id;
end;
$$;

grant execute on function public.update_product(
  uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, numeric, numeric, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal stock helper. Not granted to clients.
-- p_quantity is signed: positive increases on-hand, negative decreases.
-- ---------------------------------------------------------------------------

create or replace function public.apply_stock_movement(
  p_org_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_movement_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_next numeric;
begin
  if p_movement_type not in ('purchase', 'sale', 'adjustment', 'return', 'consumption', 'transfer') then
    raise exception 'movement type is invalid';
  end if;
  if p_quantity = 0 then
    raise exception 'quantity must not be zero';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if v_product.id is null or v_product.organization_id is distinct from p_org_id then
    raise exception 'product not found';
  end if;
  if not v_product.track_stock then
    return;
  end if;

  v_next := public.round_money(coalesce(v_product.stock_quantity, 0) + p_quantity);
  if v_next < 0 then
    raise exception 'insufficient stock';
  end if;

  update public.products
  set stock_quantity = v_next
  where id = p_product_id;

  insert into public.stock_movements (
    organization_id, branch_id, product_id, movement_type, quantity,
    reference_type, reference_id, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_product_id, p_movement_type, p_quantity,
    nullif(trim(p_reference_type), ''), p_reference_id, nullif(trim(p_notes), ''),
    auth.uid()
  );
end;
$$;

revoke all on function public.apply_stock_movement(
  uuid, uuid, uuid, numeric, text, text, uuid, text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------

create or replace function public.create_purchase(
  p_org_id uuid,
  p_branch_id uuid,
  p_supplier_id uuid,
  p_order_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_line numeric;
  v_rate numeric;
  v_tax numeric;
  v_sub numeric := 0;
  v_tax_sum numeric := 0;
  v_desc text;
begin
  perform public.require_org_permission(p_org_id, 'inventory.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if p_supplier_id is null or not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id and s.organization_id = p_org_id
  ) then
    raise exception 'supplier not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one purchase item is required';
  end if;

  v_number := public.next_document_number(p_org_id, 'purchase', 'PO');

  insert into public.purchases (
    organization_id, branch_id, supplier_id, purchase_number, status,
    order_date, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_supplier_id, v_number, 'draft',
    coalesce(p_order_date, (timezone('utc', now()))::date),
    nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);
    v_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);
    if v_product_id is null then
      raise exception 'product is required';
    end if;
    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero';
    end if;
    if v_cost < 0 then
      raise exception 'amounts cannot be negative';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and organization_id = p_org_id;
    if v_product.id is null then
      raise exception 'product not found';
    end if;

    v_desc := coalesce(nullif(trim(v_item ->> 'description'), ''), v_product.name);
    v_line := public.round_money(v_qty * v_cost);
    v_rate := coalesce(v_product.tax_rate, 0);
    v_tax := public.round_money(v_line * (v_rate / 100));

    insert into public.purchase_items (
      organization_id, purchase_id, product_id, description, quantity, unit_cost, line_total
    )
    values (
      p_org_id, v_id, v_product_id, v_desc, v_qty, v_cost, v_line
    );

    v_sub := v_sub + v_line;
    v_tax_sum := v_tax_sum + v_tax;
  end loop;

  update public.purchases set
    sub_total = public.round_money(v_sub),
    tax_total = public.round_money(v_tax_sum),
    total = public.round_money(v_sub + v_tax_sum)
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.create_purchase(
  uuid, uuid, uuid, date, text, jsonb
) to authenticated;

create or replace function public.update_purchase(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_order_date date,
  p_notes text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_line numeric;
  v_rate numeric;
  v_tax numeric;
  v_sub numeric := 0;
  v_tax_sum numeric := 0;
  v_desc text;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;
  perform public.require_org_permission(v_purchase.organization_id, 'inventory.manage');
  perform public.require_branch_in_org(v_purchase.organization_id, v_purchase.branch_id);

  if v_purchase.status is distinct from 'draft' then
    raise exception 'only draft purchases can be updated';
  end if;

  if p_supplier_id is null or not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id and s.organization_id = v_purchase.organization_id
  ) then
    raise exception 'supplier not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one purchase item is required';
  end if;

  delete from public.purchase_items where purchase_id = p_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);
    v_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);
    if v_product_id is null then
      raise exception 'product is required';
    end if;
    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero';
    end if;
    if v_cost < 0 then
      raise exception 'amounts cannot be negative';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and organization_id = v_purchase.organization_id;
    if v_product.id is null then
      raise exception 'product not found';
    end if;

    v_desc := coalesce(nullif(trim(v_item ->> 'description'), ''), v_product.name);
    v_line := public.round_money(v_qty * v_cost);
    v_rate := coalesce(v_product.tax_rate, 0);
    v_tax := public.round_money(v_line * (v_rate / 100));

    insert into public.purchase_items (
      organization_id, purchase_id, product_id, description, quantity, unit_cost, line_total
    )
    values (
      v_purchase.organization_id, p_purchase_id, v_product_id, v_desc, v_qty, v_cost, v_line
    );

    v_sub := v_sub + v_line;
    v_tax_sum := v_tax_sum + v_tax;
  end loop;

  update public.purchases set
    supplier_id = p_supplier_id,
    order_date = coalesce(p_order_date, v_purchase.order_date),
    notes = nullif(trim(p_notes), ''),
    sub_total = public.round_money(v_sub),
    tax_total = public.round_money(v_tax_sum),
    total = public.round_money(v_sub + v_tax_sum)
  where id = p_purchase_id;
end;
$$;

grant execute on function public.update_purchase(
  uuid, uuid, date, text, jsonb
) to authenticated;

create or replace function public.receive_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_item public.purchase_items%rowtype;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;
  perform public.require_org_permission(v_purchase.organization_id, 'inventory.manage');
  perform public.require_branch_in_org(v_purchase.organization_id, v_purchase.branch_id);

  if v_purchase.status = 'received' then
    raise exception 'purchase is already received';
  end if;
  if v_purchase.status = 'cancelled' then
    raise exception 'cancelled purchases cannot be received';
  end if;
  if v_purchase.status not in ('draft', 'ordered') then
    raise exception 'status is invalid';
  end if;
  if exists (
    select 1 from public.stock_movements m
    where m.organization_id = v_purchase.organization_id
      and m.reference_type = 'purchase'
      and m.reference_id = p_purchase_id
  ) then
    raise exception 'purchase is already received';
  end if;

  for v_item in
    select * from public.purchase_items where purchase_id = p_purchase_id
  loop
    if v_item.product_id is null then
      continue;
    end if;
    perform public.apply_stock_movement(
      v_purchase.organization_id,
      v_purchase.branch_id,
      v_item.product_id,
      v_item.quantity,
      'purchase',
      'purchase',
      p_purchase_id,
      v_purchase.purchase_number
    );
  end loop;

  update public.purchases set
    status = 'received',
    received_date = (timezone('utc', now()))::date
  where id = p_purchase_id;
end;
$$;

grant execute on function public.receive_purchase(uuid) to authenticated;

create or replace function public.cancel_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;
  perform public.require_org_permission(v_purchase.organization_id, 'inventory.manage');
  perform public.require_branch_in_org(v_purchase.organization_id, v_purchase.branch_id);

  if v_purchase.status = 'received' then
    raise exception 'received purchases cannot be cancelled';
  end if;
  if v_purchase.status = 'cancelled' then
    raise exception 'purchase is already cancelled';
  end if;

  update public.purchases
  set status = 'cancelled'
  where id = p_purchase_id;
end;
$$;

grant execute on function public.cancel_purchase(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- POS sales
-- ---------------------------------------------------------------------------

create or replace function public.create_pos_sale(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_payment_method text,
  p_discount numeric,
  p_tax_mode text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_rate numeric;
  v_gross numeric;
  v_taxable numeric;
  v_gst numeric;
  v_line numeric;
  v_sub numeric := 0;
  v_tax_sum numeric := 0;
  v_total numeric := 0;
  v_discount numeric;
  v_mode text;
  v_method text;
  v_desc text;
begin
  perform public.require_org_permission(p_org_id, 'pos.create');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if p_member_id is not null and not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one sale item is required';
  end if;

  v_method := coalesce(nullif(trim(p_payment_method), ''), 'cash');
  if v_method not in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'other') then
    raise exception 'payment method is invalid';
  end if;

  v_mode := coalesce(nullif(p_tax_mode, ''), 'exclusive');
  if v_mode not in ('exclusive', 'inclusive') then
    raise exception 'tax mode is invalid';
  end if;

  v_discount := public.round_money(coalesce(p_discount, 0));
  if v_discount < 0 then
    raise exception 'amounts cannot be negative';
  end if;

  v_number := public.next_document_number(p_org_id, 'pos_sale', 'POS');

  insert into public.pos_sales (
    organization_id, branch_id, member_id, sale_number, status,
    payment_method, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id, v_number, 'completed',
    v_method, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);
    if v_product_id is null then
      raise exception 'product is required';
    end if;
    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and organization_id = p_org_id
    for update;
    if v_product.id is null then
      raise exception 'product not found';
    end if;
    if not v_product.is_active then
      raise exception 'product is not active';
    end if;

    v_price := coalesce(v_product.sale_price, 0);
    v_rate := coalesce(v_product.tax_rate, 0);
    v_desc := v_product.name;
    if v_price < 0 or v_rate < 0 then
      raise exception 'amounts cannot be negative';
    end if;

    v_gross := public.round_money(v_qty * v_price);
    if v_mode = 'inclusive' and v_rate > 0 then
      v_taxable := public.round_money(v_gross / (1 + v_rate / 100));
      v_gst := public.round_money(v_gross - v_taxable);
      v_line := v_gross;
    else
      v_taxable := v_gross;
      v_gst := public.round_money(v_taxable * (v_rate / 100));
      v_line := public.round_money(v_taxable + v_gst);
    end if;

    insert into public.pos_sale_items (
      organization_id, sale_id, product_id, description, quantity, unit_price, tax_rate, line_total
    )
    values (
      p_org_id, v_id, v_product_id, v_desc, v_qty, v_price, v_rate, v_line
    );

    perform public.apply_stock_movement(
      p_org_id,
      p_branch_id,
      v_product_id,
      -v_qty,
      'sale',
      'pos_sale',
      v_id,
      v_number
    );

    v_sub := v_sub + v_gross;
    v_tax_sum := v_tax_sum + v_gst;
    v_total := v_total + v_line;
  end loop;

  if v_discount > v_total then
    raise exception 'discount exceeds the sale total';
  end if;
  v_total := greatest(public.round_money(v_total - v_discount), 0);

  update public.pos_sales set
    sub_total = public.round_money(v_sub),
    discount = v_discount,
    tax_total = public.round_money(v_tax_sum),
    total = v_total
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.create_pos_sale(
  uuid, uuid, uuid, text, numeric, text, text, jsonb
) to authenticated;

create or replace function public.void_pos_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.pos_sales%rowtype;
  v_item public.pos_sale_items%rowtype;
begin
  select * into v_sale
  from public.pos_sales
  where id = p_sale_id
  for update;
  if v_sale.id is null then
    raise exception 'sale not found';
  end if;
  perform public.require_org_permission(v_sale.organization_id, 'pos.create');
  perform public.require_branch_in_org(v_sale.organization_id, v_sale.branch_id);

  if v_sale.status = 'void' then
    raise exception 'sale is already void';
  end if;
  if v_sale.status is distinct from 'completed' then
    raise exception 'status is invalid';
  end if;
  if exists (
    select 1 from public.stock_movements m
    where m.organization_id = v_sale.organization_id
      and m.reference_type = 'pos_sale_void'
      and m.reference_id = p_sale_id
  ) then
    raise exception 'sale is already void';
  end if;

  for v_item in
    select * from public.pos_sale_items where sale_id = p_sale_id
  loop
    if v_item.product_id is null then
      continue;
    end if;
    perform public.apply_stock_movement(
      v_sale.organization_id,
      v_sale.branch_id,
      v_item.product_id,
      v_item.quantity,
      'return',
      'pos_sale_void',
      p_sale_id,
      v_sale.sale_number
    );
  end loop;

  update public.pos_sales
  set status = 'void'
  where id = p_sale_id;
end;
$$;

grant execute on function public.void_pos_sale(uuid) to authenticated;


-- #############################################################################
-- FILE: supabase/migrations/20261014000031_finance_expenses_income_rpcs.sql
-- #############################################################################

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


-- #############################################################################
-- FILE: supabase/migrations/20261020000032_notification_read_rpcs.sql
-- #############################################################################

-- Phase 9: In-app notification read-state writes.
--
-- Additive only. The existing `notifications` table (created in
-- 20260914000011_phase_3_2_commerce_crm.sql) stays SELECT-only at RLS;
-- these SECURITY DEFINER RPCs are the only write path. They set `is_read`
-- on the caller's own rows and never touch finance, memberships, billing,
-- or any other table. No new columns, types, or scheduled jobs.

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_notification_id is null then
    raise exception 'notification not found';
  end if;

  update public.notifications
     set is_read = true
   where id = p_notification_id
     and recipient_id = auth.uid();
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_org_id is null or not public.is_org_member(p_org_id) then
    raise exception 'not an organization member';
  end if;

  update public.notifications
     set is_read = true
   where organization_id = p_org_id
     and recipient_id = auth.uid()
     and is_read = false;
end;
$$;

grant execute on function public.mark_all_notifications_read(uuid) to authenticated;


-- #############################################################################
-- FILE: supabase/migrations/20261023000033_phase_10_hardening.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Phase 10: production hardening (additive)
-- =============================================================================
-- Confirmed gaps from the in-repo audit. No new tables, columns, statuses,
-- accounting rules, or product features. Existing RPCs remain the write path.
--
-- 1. Drop leftover direct write policies on organizations, branches, settings,
--    and subscriptions so REST cannot bypass SECURITY DEFINER RPCs.
-- 2. Protect privileged profile columns (status, org_id, branch_id, email,
--    username) from client UPDATE even though RLS allows own-row updates.
-- 3. Tighten child-table SELECT policies so line items inherit parent branch
--    access instead of org-wide visibility.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Settings / org / branch / subscription writes: RPC-only
-- ---------------------------------------------------------------------------
-- Phase 1.1 added admin/owner write policies. Phase 1.3 later introduced
-- SECURITY DEFINER RPCs as the application write path but left the policies
-- in place, so PostgREST could still skip validation (GSTIN, last-active
-- branch, immutable codes, setting-key format).

drop policy if exists "org owner can update their organization" on public.organizations;

drop policy if exists "org admins can create branches" on public.branches;
drop policy if exists "org admins can update branches" on public.branches;

drop policy if exists "org admins can manage organization settings" on public.organization_settings;
drop policy if exists "org admins can update organization settings" on public.organization_settings;
drop policy if exists "org admins can delete organization settings" on public.organization_settings;

drop policy if exists "org admins can manage branch settings" on public.branch_settings;
drop policy if exists "org admins can update branch settings" on public.branch_settings;
drop policy if exists "org admins can delete branch settings" on public.branch_settings;

drop policy if exists "org admins can manage subscriptions" on public.organization_subscriptions;
drop policy if exists "org admins can update subscriptions" on public.organization_subscriptions;
drop policy if exists "org admins can delete subscriptions" on public.organization_subscriptions;

-- ---------------------------------------------------------------------------
-- 2. Profile privileged-column protection
-- ---------------------------------------------------------------------------
-- Own-row UPDATE is still allowed (first_name, last_name, phone, avatar_url,
-- preferences, contact_number). status / org_id / branch_id / email / username
-- are membership or auth fields and must not be writable by the client.

create or replace function public.protect_profile_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.username is not null and new.username is distinct from old.username then
      raise exception 'username cannot be changed';
    end if;
    if new.status is distinct from old.status then
      raise exception 'profile status cannot be changed';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'profile organization cannot be changed';
    end if;
    if new.branch_id is distinct from old.branch_id then
      raise exception 'profile branch cannot be changed';
    end if;
    if new.email is distinct from old.email then
      raise exception 'profile email cannot be changed';
    end if;
  end if;
  if new.username is not null then
    new.username := public.normalize_username(new.username);
  end if;
  if new.contact_number is not null then
    new.contact_number := public.normalize_contact_number(new.contact_number);
  end if;
  return new;
end;
$$;

revoke all on function public.protect_profile_username() from public, anon, authenticated;

drop trigger if exists protect_profile_username on public.profiles;
create trigger protect_profile_username
  before insert or update on public.profiles
  for each row execute function public.protect_profile_username();

-- ---------------------------------------------------------------------------
-- 3. Child-table SELECT: inherit parent branch access
-- ---------------------------------------------------------------------------
-- Parent rows (invoices, pos_sales, purchases, credit_notes, memberships,
-- class_sessions) already require user_has_branch_access. Child rows only
-- checked is_org_member, so a branch-restricted staff member could read
-- another branch's line items by id.
--
-- DROP POLICY ... ON <table> still requires the table. Skip children that
-- were never created on this database (live is missing credit_note_items).

do $$
begin
  if to_regclass('public.invoice_items') is null then
    return;
  end if;
  execute $p$
    drop policy if exists "org members can view invoice items" on public.invoice_items;
    create policy "org members can view invoice items"
      on public.invoice_items for select
      using (
        exists (
          select 1
          from public.invoices parent
          where parent.id = invoice_id
            and parent.organization_id = invoice_items.organization_id
            and public.is_org_member(parent.organization_id)
            and public.user_has_branch_access(parent.organization_id, parent.branch_id)
        )
      );
  $p$;
end $$;

do $$
begin
  if to_regclass('public.installments') is null then
    return;
  end if;
  execute $p$
    drop policy if exists "org members can view installments" on public.installments;
    create policy "org members can view installments"
      on public.installments for select
      using (
        exists (
          select 1
          from public.invoices parent
          where parent.id = invoice_id
            and parent.organization_id = installments.organization_id
            and public.is_org_member(parent.organization_id)
            and public.user_has_branch_access(parent.organization_id, parent.branch_id)
        )
      );
  $p$;
end $$;

do $$
begin
  if to_regclass('public.pos_sale_items') is null then
    return;
  end if;
  execute $p$
    drop policy if exists "org members can view pos sale items" on public.pos_sale_items;
    create policy "org members can view pos sale items"
      on public.pos_sale_items for select
      using (
        exists (
          select 1
          from public.pos_sales parent
          where parent.id = sale_id
            and parent.organization_id = pos_sale_items.organization_id
            and public.is_org_member(parent.organization_id)
            and public.user_has_branch_access(parent.organization_id, parent.branch_id)
        )
      );
  $p$;
end $$;

do $$
begin
  if to_regclass('public.purchase_items') is null then
    return;
  end if;
  execute $p$
    drop policy if exists "org members can view purchase items" on public.purchase_items;
    create policy "org members can view purchase items"
      on public.purchase_items for select
      using (
        exists (
          select 1
          from public.purchases parent
          where parent.id = purchase_id
            and parent.organization_id = purchase_items.organization_id
            and public.is_org_member(parent.organization_id)
            and public.user_has_branch_access(parent.organization_id, parent.branch_id)
        )
      );
  $p$;
end $$;

do $$
begin
  if to_regclass('public.credit_note_items') is null then
    return;
  end if;
  execute $p$
    drop policy if exists "org members can view credit note items" on public.credit_note_items;
    create policy "org members can view credit note items"
      on public.credit_note_items for select
      using (
        exists (
          select 1
          from public.credit_notes parent
          where parent.id = credit_note_id
            and parent.organization_id = credit_note_items.organization_id
            and public.is_org_member(parent.organization_id)
            and public.user_has_branch_access(parent.organization_id, parent.branch_id)
        )
      );
  $p$;
end $$;

do $$
begin
  if to_regclass('public.membership_freezes') is null then
    return;
  end if;
  execute $p$
    drop policy if exists "org members can view membership freezes" on public.membership_freezes;
    create policy "org members can view membership freezes"
      on public.membership_freezes for select
      using (
        exists (
          select 1
          from public.memberships parent
          where parent.id = membership_id
            and parent.organization_id = membership_freezes.organization_id
            and public.is_org_member(parent.organization_id)
            and public.user_has_branch_access(parent.organization_id, parent.branch_id)
        )
      );
  $p$;
end $$;

do $$
begin
  if to_regclass('public.class_bookings') is null then
    return;
  end if;
  execute $p$
    drop policy if exists "org members can view class bookings" on public.class_bookings;
    create policy "org members can view class bookings"
      on public.class_bookings for select
      using (
        exists (
          select 1
          from public.class_sessions parent
          where parent.id = class_session_id
            and parent.organization_id = class_bookings.organization_id
            and public.is_org_member(parent.organization_id)
            and public.user_has_branch_access(parent.organization_id, parent.branch_id)
        )
      );
  $p$;
end $$;

-- #############################################################################
-- FILE: supabase/migrations/20261024000034_trainer_member_user_links.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Trainer / member login links (additive)
-- =============================================================================
-- Connects invited logins to catalog rows without matching email/name/phone.
--
-- 1. user_id on trainers and gym_members (nullable, unique per org).
-- 2. Seed a non-system `member` role so gym customers can sign in.
-- 3. SECURITY DEFINER link/unlink RPCs (RPC-only writes).
-- 4. Scoped SELECT so trainer/member roles only see their own rows.
-- 5. Linked trainers may set PT status on their own sessions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.trainers
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.gym_members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists trainers_org_user_unique
  on public.trainers(organization_id, user_id)
  where user_id is not null;

create unique index if not exists gym_members_org_user_unique
  on public.gym_members(organization_id, user_id)
  where user_id is not null;

create index if not exists trainers_user_idx on public.trainers(user_id);
create index if not exists gym_members_user_idx on public.gym_members(user_id);

-- ---------------------------------------------------------------------------
-- 2. Helpers (SECURITY DEFINER so RLS policies do not recurse)
-- ---------------------------------------------------------------------------

create or replace function public.current_org_role_slug(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.slug
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = p_org_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1
$$;

create or replace function public.linked_trainer_id(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.trainers t
  where t.organization_id = p_org_id
    and t.user_id = auth.uid()
  limit 1
$$;

create or replace function public.linked_gym_member_id(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.id
  from public.gym_members g
  where g.organization_id = p_org_id
    and g.user_id = auth.uid()
  limit 1
$$;

create or replace function public.can_view_member_data(p_org_id uuid, p_member_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_trainer uuid;
begin
  if auth.uid() is null or p_org_id is null or p_member_id is null then
    return false;
  end if;
  if not public.is_org_member(p_org_id) then
    return false;
  end if;

  v_slug := public.current_org_role_slug(p_org_id);
  if v_slug is null then
    return false;
  end if;

  if v_slug = 'member' then
    return exists (
      select 1
      from public.gym_members g
      where g.id = p_member_id
        and g.organization_id = p_org_id
        and g.user_id = auth.uid()
    );
  end if;

  if v_slug = 'trainer' then
    v_trainer := public.linked_trainer_id(p_org_id);
    if v_trainer is null then
      return false;
    end if;
    return exists (
      select 1
      from public.trainer_assignments a
      where a.organization_id = p_org_id
        and a.member_id = p_member_id
        and a.trainer_id = v_trainer
        and a.status = 'active'
    );
  end if;

  return true;
end;
$$;

revoke all on function public.current_org_role_slug(uuid) from public, anon;
revoke all on function public.linked_trainer_id(uuid) from public, anon;
revoke all on function public.linked_gym_member_id(uuid) from public, anon;
revoke all on function public.can_view_member_data(uuid, uuid) from public, anon;

grant execute on function public.current_org_role_slug(uuid) to authenticated;
grant execute on function public.linked_trainer_id(uuid) to authenticated;
grant execute on function public.linked_gym_member_id(uuid) to authenticated;
grant execute on function public.can_view_member_data(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Scoped SELECT policies
-- ---------------------------------------------------------------------------

drop policy if exists "org members can view gym members in authorized branches" on public.gym_members;
create policy "org members can view gym members in authorized branches"
  on public.gym_members for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, id)
    and (
      user_id = auth.uid()
      or public.user_has_branch_access(organization_id, branch_id)
    )
  );

drop policy if exists "org members can view trainers" on public.trainers;
create policy "org members can view trainers"
  on public.trainers for select
  using (
    public.is_org_member(organization_id)
    and (
      user_id = auth.uid()
      or (
        public.current_org_role_slug(organization_id) = 'member'
        and id = (
          select g.assigned_trainer_id
          from public.gym_members g
          where g.organization_id = trainers.organization_id
            and g.user_id = auth.uid()
          limit 1
        )
      )
      or (
        public.current_org_role_slug(organization_id) not in ('trainer', 'member')
        and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
      )
    )
  );

drop policy if exists "org members can view trainer assignments" on public.trainer_assignments;
create policy "org members can view trainer assignments"
  on public.trainer_assignments for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
  );

drop policy if exists "org members can view pt sessions" on public.pt_sessions;
create policy "org members can view pt sessions"
  on public.pt_sessions for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
    and (
      public.current_org_role_slug(organization_id) = 'member'
      or public.user_has_branch_access(organization_id, branch_id)
    )
  );

drop policy if exists "org members can view attendance" on public.attendance_records;
create policy "org members can view attendance"
  on public.attendance_records for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
    and (
      public.current_org_role_slug(organization_id) = 'member'
      or public.user_has_branch_access(organization_id, branch_id)
    )
  );

drop policy if exists "org members can view memberships" on public.memberships;
create policy "org members can view memberships"
  on public.memberships for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
    and (
      public.current_org_role_slug(organization_id) = 'member'
      or public.user_has_branch_access(organization_id, branch_id)
    )
  );

drop policy if exists "org members can view workout plans" on public.workout_plans;
create policy "org members can view workout plans"
  on public.workout_plans for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
  );

drop policy if exists "org members can view workout plan items" on public.workout_plan_items;
create policy "org members can view workout plan items"
  on public.workout_plan_items for select
  using (
    exists (
      select 1
      from public.workout_plans parent
      where parent.id = plan_id
        and parent.organization_id = workout_plan_items.organization_id
        and public.is_org_member(parent.organization_id)
        and public.can_view_member_data(parent.organization_id, parent.member_id)
    )
  );

drop policy if exists "org members can view diet plans" on public.diet_plans;
create policy "org members can view diet plans"
  on public.diet_plans for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
  );

drop policy if exists "org members can view diet plan items" on public.diet_plan_items;
create policy "org members can view diet plan items"
  on public.diet_plan_items for select
  using (
    exists (
      select 1
      from public.diet_plans parent
      where parent.id = diet_plan_id
        and parent.organization_id = diet_plan_items.organization_id
        and public.is_org_member(parent.organization_id)
        and public.can_view_member_data(parent.organization_id, parent.member_id)
    )
  );

drop policy if exists "org members can view body measurements" on public.body_measurements;
create policy "org members can view body measurements"
  on public.body_measurements for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
  );

drop policy if exists "org members can view progress entries" on public.progress_entries;
create policy "org members can view progress entries"
  on public.progress_entries for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Member role + permission seed
-- ---------------------------------------------------------------------------

create or replace function public.seed_default_role_permissions(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_all text[] := array[
    'dashboard.view',

    'members.view', 'members.create', 'members.update', 'members.delete', 'members.export',

    'memberships.view', 'memberships.create', 'memberships.update',
    'memberships.freeze', 'memberships.extend', 'memberships.transfer',

    'billing.view', 'billing.create', 'billing.edit', 'billing.refund',
    'billing.void', 'billing.export',

    'gst.view', 'gst.manage',

    'payments.view', 'payments.create', 'payments.refund',

    'attendance.view', 'attendance.create', 'attendance.manage',

    'trainers.view', 'trainers.create', 'trainers.edit', 'trainers.assign', 'trainers.reassign',

    'fitness.view', 'fitness.manage',

    'classes.view', 'classes.manage', 'bookings.manage',

    'pos.view', 'pos.create',

    'inventory.view', 'inventory.manage',

    'crm.view', 'crm.manage',

    'finance.view', 'finance.manage',

    'reports.view', 'reports.export',

    'staff.view', 'staff.manage',

    'settings.view', 'settings.manage',

    'users.view', 'users.manage',

    'roles.view', 'roles.manage',

    'branches.view', 'branches.manage',

    'organization.manage',

    'invites.send'
  ];
begin
  if p_org_id is null then
    raise exception 'organization is required';
  end if;

  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(v_all) as p(permission)
  where r.organization_id = p_org_id and r.slug in ('owner', 'admin')
    and not (r.slug = 'admin' and p.permission = 'organization.manage')
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view', 'members.create', 'members.update',
    'memberships.view', 'memberships.create', 'memberships.update',
    'memberships.freeze', 'memberships.extend',
    'billing.view', 'billing.create',
    'payments.view', 'payments.create',
    'attendance.view', 'attendance.create', 'attendance.manage',
    'trainers.view',
    'fitness.view', 'fitness.manage',
    'classes.view',
    'pos.view', 'pos.create',
    'inventory.view', 'inventory.manage',
    'crm.view', 'crm.manage',
    'reports.view',
    'settings.view',
    'branches.view'
  ]) as p(permission)
  where r.organization_id = p_org_id and r.slug = 'manager'
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view', 'members.create', 'members.update',
    'memberships.view', 'memberships.create',
    'payments.view', 'payments.create',
    'attendance.view', 'attendance.create',
    'fitness.view',
    'crm.view',
    'pos.view', 'pos.create'
  ]) as p(permission)
  where r.organization_id = p_org_id and r.slug = 'staff'
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view', 'members.create', 'members.update',
    'memberships.view', 'memberships.create',
    'billing.view',
    'payments.view', 'payments.create',
    'attendance.view', 'attendance.create',
    'fitness.view',
    'classes.view',
    'crm.view',
    'pos.view', 'pos.create'
  ]) as p(permission)
  where r.organization_id = p_org_id and r.slug = 'receptionist'
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view',
    'memberships.view',
    'attendance.view', 'attendance.create',
    'trainers.view',
    'fitness.view', 'fitness.manage',
    'classes.view'
  ]) as p(permission)
  where r.organization_id = p_org_id and r.slug = 'trainer'
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view',
    'billing.view', 'billing.create', 'billing.edit', 'billing.refund',
    'billing.void', 'billing.export',
    'gst.view', 'gst.manage',
    'payments.view', 'payments.create', 'payments.refund',
    'finance.view', 'finance.manage',
    'reports.view', 'reports.export',
    'settings.view'
  ]) as p(permission)
  where r.organization_id = p_org_id and r.slug = 'accountant'
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view',
    'memberships.view',
    'trainers.view'
  ]) as p(permission)
  where r.organization_id = p_org_id and r.slug = 'member'
  on conflict (role_id, permission) do nothing;
end;
$$;

revoke all on function public.seed_default_role_permissions(uuid) from public, anon, authenticated;

insert into public.roles (organization_id, name, slug, description, is_system, is_active)
select o.id, 'Member', 'member', 'Gym customer with access to their own training', false, true
from public.organizations o
where not exists (
  select 1 from public.roles r
  where r.organization_id = o.id and r.slug = 'member'
);

do $$
declare
  v_org uuid;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_default_role_permissions(v_org);
  end loop;
end $$;

create or replace function public.create_organization(
  p_name text,
  p_legal_name text default null,
  p_business_type text default null,
  p_email text default null,
  p_phone text default null,
  p_website text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_country text default null,
  p_tax_id text default null,
  p_currency text default 'INR',
  p_timezone text default 'Asia/Kolkata',
  p_date_format text default 'DD/MM/YYYY',
  p_logo_url text default null,
  p_branch_name text default null,
  p_branch_code text default null,
  p_branch_phone text default null,
  p_branch_email text default null,
  p_branch_address_line1 text default null,
  p_branch_address_line2 text default null,
  p_branch_city text default null,
  p_branch_state text default null,
  p_branch_postal_code text default null,
  p_branch_country text default null,
  p_branch_timezone text default 'Asia/Kolkata'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_owner_role_id uuid;
  v_member_id uuid;
  v_branch_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if exists (
    select 1
    from public.organization_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    raise exception 'you already belong to an organization';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'organization name is required';
  end if;
  if nullif(trim(p_branch_name), '') is null then
    raise exception 'branch name is required';
  end if;
  if nullif(trim(p_branch_code), '') is null then
    raise exception 'branch code is required';
  end if;
  if p_branch_code !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'branch code may only contain letters, numbers, dashes or underscores';
  end if;

  select o.id
    into v_org_id
  from public.organizations o
  where o.created_by = auth.uid()
    and not exists (
      select 1
      from public.organization_members m
      where m.organization_id = o.id
    )
  order by o.updated_at desc
  limit 1;

  if v_org_id is not null then
    update public.organizations
    set
      name = trim(p_name),
      legal_name = nullif(trim(p_legal_name), ''),
      business_type = nullif(trim(p_business_type), ''),
      email = nullif(trim(p_email), ''),
      phone = nullif(trim(p_phone), ''),
      website = nullif(trim(p_website), ''),
      address_line1 = nullif(trim(p_address_line1), ''),
      address_line2 = nullif(trim(p_address_line2), ''),
      city = nullif(trim(p_city), ''),
      state = nullif(trim(p_state), ''),
      postal_code = nullif(trim(p_postal_code), ''),
      country = nullif(trim(p_country), ''),
      tax_id = nullif(trim(p_tax_id), ''),
      currency = coalesce(nullif(trim(p_currency), ''), currency),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      date_format = coalesce(nullif(trim(p_date_format), ''), date_format),
      logo_url = nullif(trim(p_logo_url), '')
    where id = v_org_id;
  else
    insert into public.organizations (
      name, legal_name, business_type, email, phone, website,
      address_line1, address_line2, city, state, postal_code, country, tax_id,
      currency, timezone, date_format, logo_url, status, created_by
    )
    values (
      trim(p_name),
      nullif(trim(p_legal_name), ''),
      nullif(trim(p_business_type), ''),
      nullif(trim(p_email), ''),
      nullif(trim(p_phone), ''),
      nullif(trim(p_website), ''),
      nullif(trim(p_address_line1), ''),
      nullif(trim(p_address_line2), ''),
      nullif(trim(p_city), ''),
      nullif(trim(p_state), ''),
      nullif(trim(p_postal_code), ''),
      nullif(trim(p_country), ''),
      nullif(trim(p_tax_id), ''),
      coalesce(nullif(trim(p_currency), ''), 'INR'),
      coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata'),
      coalesce(nullif(trim(p_date_format), ''), 'DD/MM/YYYY'),
      p_logo_url,
      'active',
      auth.uid()
    )
    returning id into v_org_id;
  end if;

  if not exists (
    select 1 from public.roles where organization_id = v_org_id
  ) then
    insert into public.roles (organization_id, name, slug, description, is_system, is_active)
    values
      (v_org_id, 'Owner', 'owner', 'Full ownership access to the organization', true, true),
      (v_org_id, 'Admin', 'admin', 'Manages the organization and its settings', true, true),
      (v_org_id, 'Manager', 'manager', 'Runs day-to-day operations at assigned branches', true, true),
      (v_org_id, 'Staff', 'staff', 'Front desk and operations staff', true, true),
      (v_org_id, 'Receptionist', 'receptionist', 'Handles front desk check-ins and member intake', false, true),
      (v_org_id, 'Trainer', 'trainer', 'Delivers training sessions and tracks attendance', false, true),
      (v_org_id, 'Accountant', 'accountant', 'Handles billing, refunds and financial reports', false, true),
      (v_org_id, 'Member', 'member', 'Gym customer with access to their own training', false, true);

    perform public.seed_default_role_permissions(v_org_id);
  end if;

  select id into v_owner_role_id
  from public.roles
  where organization_id = v_org_id and slug = 'owner';

  insert into public.organization_members (
    organization_id, user_id, role_id, status, access_all_branches,
    accepted_at, created_by
  )
  values (v_org_id, auth.uid(), v_owner_role_id, 'active', true, now(), auth.uid())
  returning id into v_member_id;

  insert into public.branches (
    organization_id, name, code, phone, email,
    address_line1, address_line2, city, state, postal_code, country,
    timezone, status
  )
  values (
    v_org_id,
    trim(p_branch_name),
    upper(trim(p_branch_code)),
    nullif(trim(p_branch_phone), ''),
    nullif(trim(p_branch_email), ''),
    nullif(trim(p_branch_address_line1), ''),
    nullif(trim(p_branch_address_line2), ''),
    nullif(trim(p_branch_city), ''),
    nullif(trim(p_branch_state), ''),
    nullif(trim(p_branch_postal_code), ''),
    nullif(trim(p_branch_country), ''),
    coalesce(nullif(trim(p_branch_timezone), ''), 'Asia/Kolkata'),
    'active'
  )
  returning id into v_branch_id;

  insert into public.member_branches (organization_id, member_id, branch_id)
  values (v_org_id, v_member_id, v_branch_id);

  return v_org_id;
end;
$$;

grant execute on function public.create_organization(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Link / unlink RPCs
-- ---------------------------------------------------------------------------

create or replace function public.link_trainer_user(p_trainer_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_user_id is null then
    raise exception 'a user is required';
  end if;

  select organization_id into v_org_id
  from public.trainers where id = p_trainer_id;
  if v_org_id is null then
    raise exception 'trainer not found';
  end if;
  perform public.require_org_permission(v_org_id, 'users.manage');

  select r.slug into v_slug
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = v_org_id
    and m.user_id = p_user_id
    and m.status = 'active';
  if v_slug is null then
    raise exception 'user is not a member of this organization';
  end if;
  if v_slug <> 'trainer' then
    raise exception 'user must have the trainer role';
  end if;
  if exists (
    select 1 from public.gym_members g
    where g.organization_id = v_org_id and g.user_id = p_user_id
  ) then
    raise exception 'login is already linked to a member';
  end if;
  if exists (
    select 1 from public.trainers t
    where t.organization_id = v_org_id and t.user_id = p_user_id and t.id <> p_trainer_id
  ) then
    raise exception 'login is already linked to another trainer';
  end if;

  update public.trainers
  set user_id = p_user_id
  where id = p_trainer_id and organization_id = v_org_id;
end;
$$;

grant execute on function public.link_trainer_user(uuid, uuid) to authenticated;

create or replace function public.unlink_trainer_user(p_trainer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.trainers where id = p_trainer_id;
  if v_org_id is null then
    raise exception 'trainer not found';
  end if;
  perform public.require_org_permission(v_org_id, 'users.manage');

  update public.trainers
  set user_id = null
  where id = p_trainer_id and organization_id = v_org_id;
end;
$$;

grant execute on function public.unlink_trainer_user(uuid) to authenticated;

create or replace function public.link_gym_member_user(p_member_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_user_id is null then
    raise exception 'a user is required';
  end if;

  select organization_id into v_org_id
  from public.gym_members where id = p_member_id;
  if v_org_id is null then
    raise exception 'member not found';
  end if;
  perform public.require_org_permission(v_org_id, 'users.manage');

  select r.slug into v_slug
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = v_org_id
    and m.user_id = p_user_id
    and m.status = 'active';
  if v_slug is null then
    raise exception 'user is not a member of this organization';
  end if;
  if v_slug <> 'member' then
    raise exception 'user must have the member role';
  end if;
  if exists (
    select 1 from public.trainers t
    where t.organization_id = v_org_id and t.user_id = p_user_id
  ) then
    raise exception 'login is already linked to a trainer';
  end if;
  if exists (
    select 1 from public.gym_members g
    where g.organization_id = v_org_id and g.user_id = p_user_id and g.id <> p_member_id
  ) then
    raise exception 'login is already linked to another member';
  end if;

  update public.gym_members
  set user_id = p_user_id
  where id = p_member_id and organization_id = v_org_id;
end;
$$;

grant execute on function public.link_gym_member_user(uuid, uuid) to authenticated;

create or replace function public.unlink_gym_member_user(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.gym_members where id = p_member_id;
  if v_org_id is null then
    raise exception 'member not found';
  end if;
  perform public.require_org_permission(v_org_id, 'users.manage');

  update public.gym_members
  set user_id = null
  where id = p_member_id and organization_id = v_org_id;
end;
$$;

grant execute on function public.unlink_gym_member_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Linked trainers may update status on their own PT sessions
-- ---------------------------------------------------------------------------

create or replace function public.set_pt_session_status(
  p_session_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_trainer uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id, trainer_id into v_org_id, v_trainer
  from public.pt_sessions where id = p_session_id;
  if v_org_id is null then
    raise exception 'session not found';
  end if;
  if not (
    public.user_has_permission(v_org_id, 'trainers.edit')
    or public.linked_trainer_id(v_org_id) is not distinct from v_trainer
  ) then
    raise exception 'insufficient privileges';
  end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'cancelled', 'no_show') then
    raise exception 'status is invalid';
  end if;
  update public.pt_sessions set status = p_status where id = p_session_id;
end;
$$;

grant execute on function public.set_pt_session_status(uuid, text) to authenticated;

-- #############################################################################
-- FILE: supabase/migrations/20261027000035_grant_rls_helper_execute.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Grant EXECUTE on RLS policy helpers
-- =============================================================================
-- 20261024000034 revoked current_org_role_slug / linked_* / can_view_member_data
-- from authenticated. Postgres still requires EXECUTE for the invoking role
-- when those SECURITY DEFINER helpers are used inside RLS policies, so Owner
-- SELECTs on trainers, trainer_assignments, gym_members and pt_sessions
-- raised "permission denied for function" (mapped to the generic forbidden
-- message). Anon stays revoked. Additive; safe to re-run.
-- =============================================================================

revoke all on function public.current_org_role_slug(uuid) from public, anon;
revoke all on function public.linked_trainer_id(uuid) from public, anon;
revoke all on function public.linked_gym_member_id(uuid) from public, anon;
revoke all on function public.can_view_member_data(uuid, uuid) from public, anon;

grant execute on function public.current_org_role_slug(uuid) to authenticated;
grant execute on function public.linked_trainer_id(uuid) to authenticated;
grant execute on function public.linked_gym_member_id(uuid) to authenticated;
grant execute on function public.can_view_member_data(uuid, uuid) to authenticated;
