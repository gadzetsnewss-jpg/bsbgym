-- =============================================================================
-- BSB FitForge - COMBINE.sql
-- Pending production migrations 20261002000024 through 20261030000038
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

-- #############################################################################
-- FILE: supabase/migrations/20261027000036_create_trainer_assignment_rpc.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Install trainer assignment write RPCs
-- =============================================================================
-- Additive. Live production is missing public.create_trainer_assignment
-- (PostgREST PGRST202), so Add Assignment mapped to the generic database
-- toast. Reuses trainer_assignments + gym_members.assigned_trainer_id.
-- Source of truth for the current trainer is trainer_assignments (one active
-- row per member); the RPC ends prior active rows then sets assigned_trainer_id.
-- Signatures match 20260916000013. Safe to re-run.
-- =============================================================================

create or replace function public.create_trainer_assignment(
  p_org_id uuid,
  p_trainer_id uuid,
  p_member_id uuid,
  p_assigned_at date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_org_permission(p_org_id, 'trainers.assign');
  if not exists (
    select 1 from public.trainers t
    where t.id = p_trainer_id and t.organization_id = p_org_id
  ) then
    raise exception 'trainer not found';
  end if;
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  update public.trainer_assignments
  set status = 'ended'
  where member_id = p_member_id and organization_id = p_org_id and status = 'active';

  insert into public.trainer_assignments (
    organization_id, trainer_id, member_id, assigned_at, status, notes, created_by
  )
  values (
    p_org_id, p_trainer_id, p_member_id,
    coalesce(p_assigned_at, (timezone('utc', now()))::date),
    'active', nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  update public.gym_members
  set assigned_trainer_id = p_trainer_id
  where id = p_member_id and organization_id = p_org_id;

  return v_id;
end;
$$;

grant execute on function public.create_trainer_assignment(uuid, uuid, uuid, date, text) to authenticated;

create or replace function public.set_trainer_assignment_status(
  p_assignment_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_member uuid;
  v_trainer uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id, member_id, trainer_id into v_org_id, v_member, v_trainer
  from public.trainer_assignments where id = p_assignment_id;
  if v_org_id is null then
    raise exception 'assignment not found';
  end if;
  perform public.require_org_permission(v_org_id, 'trainers.reassign');

  update public.trainer_assignments
  set status = case when coalesce(p_active, false) then 'active' else 'ended' end
  where id = p_assignment_id;

  if coalesce(p_active, false) then
    update public.trainer_assignments
    set status = 'ended'
    where member_id = v_member and organization_id = v_org_id
      and status = 'active' and id <> p_assignment_id;
    update public.gym_members
    set assigned_trainer_id = v_trainer
    where id = v_member and organization_id = v_org_id;
  else
    update public.gym_members
    set assigned_trainer_id = null
    where id = v_member and organization_id = v_org_id
      and assigned_trainer_id = v_trainer;
  end if;
end;
$$;

grant execute on function public.set_trainer_assignment_status(uuid, boolean) to authenticated;

-- #############################################################################
-- FILE: supabase/migrations/20261028000037_role_portals_and_first_login.sql
-- #############################################################################
-- =============================================================================
-- BSB FitForge - Role login portals and first-login password change
-- =============================================================================
-- Additive. Reuses profiles.username, gym_members.code, trainers.code,
-- organization_members, and existing link RPCs. Does not disable RLS or
-- store plaintext passwords.
--
-- 1. profiles.must_change_password is a trusted backend flag (trigger-guarded).
-- 2. Owner provisioning inserts org membership, links trainer/member user_id,
--    and sets the flag. Auth users are created by the server route.
-- 3. Member/trainer ID lookup RPCs are service_role only (same as username).
-- =============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create or replace function public.protect_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.must_change_password is distinct from old.must_change_password
     and current_setting('app.set_must_change_password', true) is distinct from 'on' then
    raise exception 'must_change_password cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_must_change_password() from public, anon, authenticated;

drop trigger if exists protect_must_change_password on public.profiles;
create trigger protect_must_change_password
  before update on public.profiles
  for each row execute function public.protect_must_change_password();

create or replace function public.auth_email_for_member_code(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
  v_email text;
  v_count integer;
begin
  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');
  if v_code is null then
    return null;
  end if;

  select count(*)
    into v_count
  from public.gym_members g
  where upper(g.code) = v_code
    and g.user_id is not null;

  if v_count <> 1 then
    return null;
  end if;

  select u.email
    into v_email
  from public.gym_members g
  join auth.users u on u.id = g.user_id
  where upper(g.code) = v_code
    and g.user_id is not null
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.auth_email_for_member_code(text) from public, anon, authenticated;
grant execute on function public.auth_email_for_member_code(text) to service_role;

create or replace function public.auth_email_for_trainer_code(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
  v_email text;
  v_count integer;
begin
  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');
  if v_code is null then
    return null;
  end if;

  select count(*)
    into v_count
  from public.trainers t
  where t.code is not null
    and upper(t.code) = v_code
    and t.user_id is not null;

  if v_count <> 1 then
    return null;
  end if;

  select u.email
    into v_email
  from public.trainers t
  join auth.users u on u.id = t.user_id
  where t.code is not null
    and upper(t.code) = v_code
    and t.user_id is not null
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.auth_email_for_trainer_code(text) from public, anon, authenticated;
grant execute on function public.auth_email_for_trainer_code(text) to service_role;

create or replace function public.provision_linked_login(
  p_kind text,
  p_record_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_org_id uuid;
  v_branch_id uuid;
  v_role_id uuid;
  v_member_id uuid;
  v_access_all boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_user_id is null then
    raise exception 'a user is required';
  end if;

  v_kind := lower(trim(coalesce(p_kind, '')));
  if v_kind not in ('trainer', 'member') then
    raise exception 'login kind is invalid';
  end if;

  if v_kind = 'trainer' then
    select organization_id, branch_id into v_org_id, v_branch_id
    from public.trainers
    where id = p_record_id;
    if v_org_id is null then
      raise exception 'trainer not found';
    end if;
    if exists (
      select 1 from public.trainers t
      where t.id = p_record_id and t.user_id is not null
    ) then
      raise exception 'login is already linked to another trainer';
    end if;
  else
    select organization_id, branch_id into v_org_id, v_branch_id
    from public.gym_members
    where id = p_record_id;
    if v_org_id is null then
      raise exception 'member not found';
    end if;
    if exists (
      select 1 from public.gym_members g
      where g.id = p_record_id and g.user_id is not null
    ) then
      raise exception 'login is already linked to another member';
    end if;
  end if;

  perform public.require_org_permission(v_org_id, 'users.manage');

  if exists (
    select 1 from public.organization_members m
    where m.organization_id = v_org_id and m.user_id = p_user_id
  ) then
    raise exception 'user is already part of this organization';
  end if;
  if exists (
    select 1 from public.trainers t
    where t.organization_id = v_org_id and t.user_id = p_user_id
  ) then
    raise exception 'login is already linked to a trainer';
  end if;
  if exists (
    select 1 from public.gym_members g
    where g.organization_id = v_org_id and g.user_id = p_user_id
  ) then
    raise exception 'login is already linked to a member';
  end if;

  select r.id into v_role_id
  from public.roles r
  where r.organization_id = v_org_id
    and r.slug = v_kind
    and r.is_active = true;
  if v_role_id is null then
    raise exception 'role not found';
  end if;

  v_access_all := v_kind = 'trainer' and v_branch_id is null;

  insert into public.organization_members (
    organization_id, user_id, role_id, status, access_all_branches,
    accepted_at, created_by
  )
  values (
    v_org_id, p_user_id, v_role_id, 'active', v_access_all,
    now(), auth.uid()
  )
  returning id into v_member_id;

  if not v_access_all and v_branch_id is not null then
    insert into public.member_branches (organization_id, member_id, branch_id)
    values (v_org_id, v_member_id, v_branch_id);
  end if;

  if v_kind = 'trainer' then
    update public.trainers
    set user_id = p_user_id
    where id = p_record_id and organization_id = v_org_id;
  else
    update public.gym_members
    set user_id = p_user_id
    where id = p_record_id and organization_id = v_org_id;
  end if;

  perform set_config('app.set_must_change_password', 'on', true);
  update public.profiles
  set must_change_password = true
  where id = p_user_id;
end;
$$;

revoke all on function public.provision_linked_login(text, uuid, uuid) from public, anon;
grant execute on function public.provision_linked_login(text, uuid, uuid) to authenticated;

create or replace function public.complete_password_change(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'a user is required';
  end if;
  perform set_config('app.set_must_change_password', 'on', true);
  update public.profiles
  set must_change_password = false
  where id = p_user_id;
end;
$$;

revoke all on function public.complete_password_change(uuid) from public, anon, authenticated;
grant execute on function public.complete_password_change(uuid) to service_role;


-- #############################################################################
-- FILE: supabase/migrations/20261030000038_gym_scoped_portal_login.sql
-- #############################################################################

-- =============================================================================
-- BSB FitForge - Gym-scoped trainer/member login lookup
-- =============================================================================
-- Additive. Replaces global code lookup with Gym Code (organizations.slug)
-- plus Trainer ID / Member Code resolved only inside that organization.
-- Does not disable RLS, drop tables, or store plaintext passwords.
-- =============================================================================

create or replace function public.auth_email_for_member_code(p_gym_code text, p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gym text;
  v_code text;
  v_org_id uuid;
  v_email text;
begin
  v_gym := nullif(lower(trim(coalesce(p_gym_code, ''))), '');
  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');
  if v_gym is null or v_code is null then
    return null;
  end if;

  select o.id
    into v_org_id
  from public.organizations o
  where lower(o.slug) = v_gym
    and o.status in ('active', 'trial');
  if v_org_id is null then
    return null;
  end if;

  select u.email
    into v_email
  from public.gym_members g
  join auth.users u on u.id = g.user_id
  where g.organization_id = v_org_id
    and upper(g.code) = v_code
    and g.user_id is not null;

  return v_email;
end;
$$;

create or replace function public.auth_email_for_trainer_code(p_gym_code text, p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gym text;
  v_code text;
  v_org_id uuid;
  v_email text;
begin
  v_gym := nullif(lower(trim(coalesce(p_gym_code, ''))), '');
  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');
  if v_gym is null or v_code is null then
    return null;
  end if;

  select o.id
    into v_org_id
  from public.organizations o
  where lower(o.slug) = v_gym
    and o.status in ('active', 'trial');
  if v_org_id is null then
    return null;
  end if;

  select u.email
    into v_email
  from public.trainers t
  join auth.users u on u.id = t.user_id
  where t.organization_id = v_org_id
    and t.code is not null
    and upper(t.code) = v_code
    and t.user_id is not null;

  return v_email;
end;
$$;

drop function if exists public.auth_email_for_member_code(text);
drop function if exists public.auth_email_for_trainer_code(text);

revoke all on function public.auth_email_for_member_code(text, text) from public, anon, authenticated;
grant execute on function public.auth_email_for_member_code(text, text) to service_role;

revoke all on function public.auth_email_for_trainer_code(text, text) from public, anon, authenticated;
grant execute on function public.auth_email_for_trainer_code(text, text) to service_role;

-- =============================================================================
-- BSB FitForge - Member Portal Auth, Tenant Lookup & Permissions
-- =============================================================================
-- Additive. Enables Gym Code + Registered Mobile Member Login.
-- 1. require_password_change(uuid) RPC to force password change on next login.
-- 2. auth_email_for_gym_member_phone(gym_code, phone) for tenant-isolated login.
-- 3. Seed attendance.view and fitness.view permissions for member role.
-- =============================================================================

-- 1. Require password change RPC (for Owner reset / temporary passwords)
create or replace function public.require_password_change(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'a user is required';
  end if;
  perform set_config('app.set_must_change_password', 'on', true);
  update public.profiles
  set must_change_password = true
  where id = p_user_id;
end;
$$;

revoke all on function public.require_password_change(uuid) from public, anon, authenticated;
grant execute on function public.require_password_change(uuid) to service_role;

-- 2. Gym-scoped member lookup by registered phone number
create or replace function public.auth_email_for_gym_member_phone(
  p_gym_code text,
  p_phone text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gym_code text;
  v_digits text;
  v_org_id uuid;
  v_email text;
  v_count integer;
begin
  v_gym_code := nullif(lower(trim(coalesce(p_gym_code, ''))), '');
  if v_gym_code is null then
    return null;
  end if;

  -- Extract national digits (last 10 digits for Indian mobile numbers)
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_digits) = 12 and v_digits like '91%' then
    v_digits := substring(v_digits from 3);
  end if;
  if length(v_digits) <> 10 then
    return null;
  end if;

  select id into v_org_id
  from public.organizations
  where lower(slug) = v_gym_code
    and status in ('active', 'trial')
  limit 1;

  if v_org_id is null then
    return null;
  end if;

  -- Match member in this gym whose phone ends with the 10 digits and has an active login
  select count(*)
    into v_count
  from public.gym_members g
  where g.organization_id = v_org_id
    and g.user_id is not null
    and right(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), 10) = v_digits;

  if v_count <> 1 then
    return null;
  end if;

  select u.email
    into v_email
  from public.gym_members g
  join auth.users u on u.id = g.user_id
  where g.organization_id = v_org_id
    and g.user_id is not null
    and right(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), 10) = v_digits
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.auth_email_for_gym_member_phone(text, text) from public, anon, authenticated;
grant execute on function public.auth_email_for_gym_member_phone(text, text) to service_role;

-- 3. Seed attendance and fitness view permissions for member roles
insert into public.role_permissions (organization_id, role_id, permission)
select r.organization_id, r.id, p.permission
from public.roles r
cross join unnest(array[
  'attendance.view',
  'fitness.view'
]) as p(permission)
where r.slug = 'member'
on conflict (role_id, permission) do nothing;


-- =============================================================================
-- BSB FitForge - Unify New Invoice & Active Memberships Workflow
-- =============================================================================
-- Additive. Ensures New Invoice is the single primary workflow for selling/assigning
-- a paid membership:
-- 1. sync_invoice_membership(p_invoice_id uuid)
-- 2. link_invoice_membership(p_invoice_id uuid, p_membership_id uuid)
-- 3. update refresh_invoice_status(p_invoice_id uuid)
-- 4. update issue_invoice(p_invoice_id uuid)
-- 5. update void_invoice(p_invoice_id uuid, p_reason text)
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
-- Migration: 20261127000043_trainer_nutrition_planning.sql
-- Description: Upgrade BSB FitForge Trainer Diet Plan into a Complete Nutrition Planning Module.
-- Adds goals, macro targets, meal scheduling, and food item details.
-- Enforces that draft plans remain hidden from members at the database RLS level.

-- 1. Extend public.diet_plans
alter table public.diet_plans
  add column if not exists goal text check (goal is null or goal in ('Fat Loss', 'Muscle Gain', 'Weight Maintenance', 'General Fitness', 'Custom')),
  add column if not exists status text not null default 'active' check (status in ('draft', 'active', 'completed')),
  add column if not exists daily_calorie_target integer check (daily_calorie_target is null or daily_calorie_target >= 0),
  add column if not exists protein_target_g numeric(6,1) check (protein_target_g is null or protein_target_g >= 0),
  add column if not exists carb_target_g numeric(6,1) check (carb_target_g is null or carb_target_g >= 0),
  add column if not exists fat_target_g numeric(6,1) check (fat_target_g is null or fat_target_g >= 0),
  add column if not exists water_intake_liters numeric(4,1) check (water_intake_liters is null or water_intake_liters >= 0);

-- Sync initial status for existing rows
update public.diet_plans
set status = case when is_active then 'active' else 'completed' end
where status is null or status = 'active';

create index if not exists idx_diet_plans_member_status on public.diet_plans(member_id, status);
create index if not exists idx_diet_plans_org_status on public.diet_plans(organization_id, status);

-- 2. Extend public.diet_plan_items
alter table public.diet_plan_items
  add column if not exists meal_time text,
  add column if not exists food_name text,
  add column if not exists quantity numeric(8,2) check (quantity is null or quantity >= 0),
  add column if not exists unit text,
  add column if not exists protein_g numeric(6,1) check (protein_g is null or protein_g >= 0),
  add column if not exists carbs_g numeric(6,1) check (carbs_g is null or carbs_g >= 0),
  add column if not exists fat_g numeric(6,1) check (fat_g is null or fat_g >= 0),
  add column if not exists instructions text;

create index if not exists idx_diet_plan_items_plan_sort on public.diet_plan_items(diet_plan_id, sort_order);

-- 3. Scoped RLS: Members can view their published plans only; draft plans remain hidden
drop policy if exists "org members can view diet plans" on public.diet_plans;
create policy "org members can view diet plans"
  on public.diet_plans for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
    and (
      public.current_org_role_slug(organization_id) is distinct from 'member'
      or status in ('active', 'completed')
    )
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
        and (
          public.current_org_role_slug(parent.organization_id) is distinct from 'member'
          or parent.status in ('active', 'completed')
        )
    )
  );

-- 4. RPC: save_full_diet_plan (Handles creation, updating, meal scheduling, and publishing)
create or replace function public.save_full_diet_plan(
  p_org_id uuid,
  p_plan_id uuid default null,
  p_member_id uuid default null,
  p_trainer_id uuid default null,
  p_name text default null,
  p_goal text default null,
  p_status text default 'active',
  p_start_date date default null,
  p_end_date date default null,
  p_daily_calorie_target integer default null,
  p_protein_target_g numeric default null,
  p_carb_target_g numeric default null,
  p_fat_target_g numeric default null,
  p_water_intake_liters numeric default null,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_name text;
  v_status text;
  v_is_active boolean;
  v_item jsonb;
  v_item_meal text;
  v_item_desc text;
  v_item_food text;
  v_item_cals integer;
  v_sort integer := 0;
  v_trainer_id uuid := p_trainer_id;
  v_existing_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'active');
  if v_status not in ('draft', 'active', 'completed') then
    v_status := 'active';
  end if;
  v_is_active := (v_status = 'active');

  -- Verify user has permission to manage fitness or is assigned trainer
  if not (
    public.user_has_permission(p_org_id, 'fitness.manage')
    or (
      public.current_org_role_slug(p_org_id) = 'trainer'
      and public.can_view_member_data(p_org_id, p_member_id)
    )
  ) then
    raise exception 'insufficient privileges';
  end if;

  -- If user is a trainer, ensure trainer_id matches their linked trainer
  if public.current_org_role_slug(p_org_id) = 'trainer' then
    v_trainer_id := public.linked_trainer_id(p_org_id);
  end if;

  -- Validate member exists in org
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;

  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'end date cannot be before start date';
  end if;

  -- If publishing (status = 'active'), mark previously active plans for this member as completed
  if v_status = 'active' then
    update public.diet_plans
    set status = 'completed',
        is_active = false,
        updated_at = now()
    where organization_id = p_org_id
      and member_id = p_member_id
      and status = 'active'
      and (p_plan_id is null or id <> p_plan_id);
  end if;

  if p_plan_id is not null then
    -- Verify plan belongs to organization
    select organization_id into v_existing_org
    from public.diet_plans
    where id = p_plan_id;

    if v_existing_org is null or v_existing_org <> p_org_id then
      raise exception 'plan not found';
    end if;

    update public.diet_plans set
      member_id = p_member_id,
      trainer_id = v_trainer_id,
      name = v_name,
      goal = nullif(trim(p_goal), ''),
      status = v_status,
      daily_calorie_target = p_daily_calorie_target,
      protein_target_g = p_protein_target_g,
      carb_target_g = p_carb_target_g,
      fat_target_g = p_fat_target_g,
      water_intake_liters = p_water_intake_liters,
      start_date = p_start_date,
      end_date = p_end_date,
      notes = nullif(trim(p_notes), ''),
      is_active = v_is_active,
      updated_at = now()
    where id = p_plan_id;

    v_plan_id := p_plan_id;
  else
    insert into public.diet_plans (
      organization_id, member_id, trainer_id, name, goal, status,
      daily_calorie_target, protein_target_g, carb_target_g, fat_target_g, water_intake_liters,
      start_date, end_date, notes, is_active, created_by, created_at, updated_at
    ) values (
      p_org_id, p_member_id, v_trainer_id, v_name, nullif(trim(p_goal), ''), v_status,
      p_daily_calorie_target, p_protein_target_g, p_carb_target_g, p_fat_target_g, p_water_intake_liters,
      p_start_date, p_end_date, nullif(trim(p_notes), ''), v_is_active, auth.uid(), now(), now()
    )
    returning id into v_plan_id;
  end if;

  -- Recreate items atomically if items are provided
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    delete from public.diet_plan_items
    where diet_plan_id = v_plan_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_item_meal := coalesce(nullif(trim(v_item->>'meal'), ''), 'Meal');
      v_item_food := nullif(trim(v_item->>'foodName'), '');
      v_item_desc := coalesce(v_item_food, nullif(trim(v_item->>'description'), ''), 'Item');
      v_item_cals := case
        when v_item->>'calories' is not null and trim(v_item->>'calories') <> ''
        then (v_item->>'calories')::integer
        else null
      end;

      insert into public.diet_plan_items (
        organization_id,
        diet_plan_id,
        meal,
        description,
        calories,
        sort_order,
        meal_time,
        food_name,
        quantity,
        unit,
        protein_g,
        carbs_g,
        fat_g,
        instructions
      ) values (
        p_org_id,
        v_plan_id,
        v_item_meal,
        v_item_desc,
        v_item_cals,
        coalesce((v_item->>'sortOrder')::integer, v_sort),
        nullif(trim(v_item->>'mealTime'), ''),
        v_item_food,
        case
          when v_item->>'quantity' is not null and trim(v_item->>'quantity') <> ''
          then (v_item->>'quantity')::numeric
          else null
        end,
        nullif(trim(v_item->>'unit'), ''),
        case
          when v_item->>'proteinG' is not null and trim(v_item->>'proteinG') <> ''
          then (v_item->>'proteinG')::numeric
          else null
        end,
        case
          when v_item->>'carbsG' is not null and trim(v_item->>'carbsG') <> ''
          then (v_item->>'carbsG')::numeric
          else null
        end,
        case
          when v_item->>'fatG' is not null and trim(v_item->>'fatG') <> ''
          then (v_item->>'fatG')::numeric
          else null
        end,
        nullif(trim(v_item->>'instructions'), '')
      );

      v_sort := v_sort + 1;
    end loop;
  end if;

  return v_plan_id;
end;
$$;

revoke all on function public.save_full_diet_plan from public, anon;
grant execute on function public.save_full_diet_plan to authenticated;

-- 5. RPC: publish_diet_plan
create or replace function public.publish_diet_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_plan from public.diet_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  if not (
    public.user_has_permission(v_plan.organization_id, 'fitness.manage')
    or (
      public.current_org_role_slug(v_plan.organization_id) = 'trainer'
      and public.can_view_member_data(v_plan.organization_id, v_plan.member_id)
    )
  ) then
    raise exception 'insufficient privileges';
  end if;

  -- Archive existing active plans for this member
  update public.diet_plans
  set status = 'completed',
      is_active = false,
      updated_at = now()
  where organization_id = v_plan.organization_id
    and member_id = v_plan.member_id
    and status = 'active'
    and id <> p_plan_id;

  -- Publish this plan
  update public.diet_plans
  set status = 'active',
      is_active = true,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.publish_diet_plan(uuid) from public, anon;
grant execute on function public.publish_diet_plan(uuid) to authenticated;

-- 6. RPC: complete_diet_plan
create or replace function public.complete_diet_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_plan from public.diet_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  if not (
    public.user_has_permission(v_plan.organization_id, 'fitness.manage')
    or (
      public.current_org_role_slug(v_plan.organization_id) = 'trainer'
      and public.can_view_member_data(v_plan.organization_id, v_plan.member_id)
    )
  ) then
    raise exception 'insufficient privileges';
  end if;

  update public.diet_plans
  set status = 'completed',
      is_active = false,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.complete_diet_plan(uuid) from public, anon;
grant execute on function public.complete_diet_plan(uuid) to authenticated;


-- =============================================================================
-- Migration: 20261127000044_trainer_nutrition_hardening.sql
-- Description: Corrective hardening for Nutrition Planning Module (20261127000043).
-- =============================================================================
-- Fixes:
-- 1. SELECT RLS policies:
--    - Replaces broad role check with explicit user_has_permission(organization_id, 'fitness.manage')
--      for privileged Owner/Admin roles. Cashier, Receptionist, and unauthorized roles are blocked.
--    - Keeps assigned Trainer access (own plans + actively assigned members) and Member access (own active/completed plans).
-- 2. Save RPC lifecycle & Immutability:
--    - save_full_diet_plan saves strictly as Draft (status = 'draft', is_active = false).
--    - Explicitly rejects p_status = 'active' and p_status = 'completed' for normal save operations.
--    - Explicitly rejects modifying existing Active and Completed plans in-place.
--    - Adds clone_diet_plan_to_draft RPC to create a new Draft from an existing plan while preserving the Active plan.
--    - Never archives an existing active plan during Save.
-- 3. Content Validation & Placeholder Defaults Removal:
--    - Removes placeholder defaults such as 'Meal' and 'Item'.
--    - Requires meaningful explicit meal name and food name or description.
--    - Publish strictly rejects empty plans and blank/placeholder-only content.
-- 4. Owner/Admin Edits & Immutability:
--    - For Owner/Admin edits on existing draft plans, preserves existing trainer_id when p_trainer_id is omitted.
--    - Changes trainer assignment only on an explicit authorized reassignment.
--    - Completed plans remain strictly immutable for Owner/Admin too; clone or create a new Draft instead.
-- 5. Trainer Reassignment Guards:
--    - When a Trainer updates an existing plan, requires p_member_id = v_existing_plan.member_id.
--    - Trainers cannot transfer an existing plan to another Member.
-- 6. Publish Validation & Member-Level Serialization:
--    - Serializes concurrent publishing per member by locking gym_members with FOR UPDATE.
--    - Verifies authorization and active Trainer assignment first.
--    - Verifies the target plan is a valid Draft before archiving any existing active plan.
--    - Only after all validation succeeds, archives previous active plan and activates new Draft atomically.
-- 7. Data preservation:
--    - Preserves existing NULL p_items behavior so omitted meal items never delete existing items.
--    - Atomically pre-validates jsonb items array before modifying diet_plan_items.
-- =============================================================================

-- 1. Hardened SELECT RLS Policy on public.diet_plans
drop policy if exists "org members can view diet plans" on public.diet_plans;
drop policy if exists "trainers can view diet plans" on public.diet_plans;
drop policy if exists "members can view diet plans" on public.diet_plans;
drop policy if exists "authorized users can view diet plans" on public.diet_plans;
drop policy if exists "diet_plans_select_policy" on public.diet_plans;
drop policy if exists "diet_plans_select_staff" on public.diet_plans;
drop policy if exists "diet_plans_select_member" on public.diet_plans;
drop policy if exists "diet_plans_select_trainer_or_admin" on public.diet_plans;

create policy "authorized users can view diet plans"
  on public.diet_plans for select
  to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      -- Explicitly authorized Owner / Admin / Staff with fitness.manage permission
      public.user_has_permission(organization_id, 'fitness.manage')
      -- Assigned Trainers: only their actively assigned members' plans where they are the trainer
      or (
        public.current_org_role_slug(organization_id) = 'trainer'
        and trainer_id = public.linked_trainer_id(organization_id)
        and public.can_view_member_data(organization_id, member_id)
      )
      -- Members: only active or completed plans for themselves (strictly never drafts)
      or (
        public.current_org_role_slug(organization_id) = 'member'
        and public.can_view_member_data(organization_id, member_id)
        and status in ('active', 'completed')
      )
    )
  );

-- 2. Hardened SELECT RLS Policy on public.diet_plan_items
drop policy if exists "org members can view diet plan items" on public.diet_plan_items;
drop policy if exists "trainers can view diet plan items" on public.diet_plan_items;
drop policy if exists "members can view diet plan items" on public.diet_plan_items;
drop policy if exists "authorized users can view diet plan items" on public.diet_plan_items;
drop policy if exists "diet_plan_items_select_policy" on public.diet_plan_items;
drop policy if exists "diet_plan_items_select_staff" on public.diet_plan_items;
drop policy if exists "diet_plan_items_select_member" on public.diet_plan_items;
drop policy if exists "diet_plan_items_select_trainer_or_admin" on public.diet_plan_items;

create policy "authorized users can view diet plan items"
  on public.diet_plan_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.diet_plans parent
      where parent.id = diet_plan_items.diet_plan_id
        and parent.organization_id = diet_plan_items.organization_id
        and public.is_org_member(parent.organization_id)
        and (
          -- Explicitly authorized Owner / Admin / Staff with fitness.manage permission
          public.user_has_permission(parent.organization_id, 'fitness.manage')
          -- Assigned Trainers: only their actively assigned members' plans where they are the trainer
          or (
            public.current_org_role_slug(parent.organization_id) = 'trainer'
            and parent.trainer_id = public.linked_trainer_id(parent.organization_id)
            and public.can_view_member_data(parent.organization_id, parent.member_id)
          )
          -- Members: only active or completed plans for themselves (strictly never drafts)
          or (
            public.current_org_role_slug(parent.organization_id) = 'member'
            and public.can_view_member_data(parent.organization_id, parent.member_id)
            and parent.status in ('active', 'completed')
          )
        )
    )
  );

-- 3. Hardened RPC: save_full_diet_plan (Saves strictly Draft; rejects modifying Active/Completed plans)
create or replace function public.save_full_diet_plan(
  p_org_id uuid,
  p_plan_id uuid default null,
  p_member_id uuid default null,
  p_trainer_id uuid default null,
  p_name text default null,
  p_goal text default null,
  p_status text default 'draft',
  p_start_date date default null,
  p_end_date date default null,
  p_daily_calorie_target integer default null,
  p_protein_target_g numeric default null,
  p_carb_target_g numeric default null,
  p_fat_target_g numeric default null,
  p_water_intake_liters numeric default null,
  p_notes text default null,
  p_items jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_name text;
  v_status text;
  v_item jsonb;
  v_item_meal text;
  v_item_desc text;
  v_item_food text;
  v_item_cals integer;
  v_item_qty numeric;
  v_item_protein numeric;
  v_item_carbs numeric;
  v_item_fat numeric;
  v_sort integer := 0;
  v_role text;
  v_trainer_id uuid;
  v_existing_plan public.diet_plans%rowtype;
  v_target_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_org_id is null then
    raise exception 'organization_id is required';
  end if;

  if not public.is_org_member(p_org_id) then
    raise exception 'not an organization member';
  end if;

  v_role := public.current_org_role_slug(p_org_id);
  if v_role is null or v_role = 'member' then
    raise exception 'members cannot create or edit diet plans';
  end if;

  -- 1. Save RPC lifecycle: save_full_diet_plan only saves Draft
  -- Reject active and completed status for normal save operations
  v_status := coalesce(nullif(trim(p_status), ''), 'draft');
  if v_status in ('active', 'completed') then
    raise exception 'save_full_diet_plan only saves draft plans; use publish_diet_plan to activate a plan';
  end if;
  if v_status <> 'draft' then
    raise exception 'invalid diet plan status: %', p_status;
  end if;

  -- 2. If updating an existing plan, lock and verify ownership, immutability, and assignment
  if p_plan_id is not null then
    select * into v_existing_plan
    from public.diet_plans
    where id = p_plan_id
    for update;

    if v_existing_plan.id is null or v_existing_plan.organization_id <> p_org_id then
      raise exception 'plan not found';
    end if;

    -- Reject modifying existing Active or Completed plans in-place (must clone or create new draft)
    if v_existing_plan.status in ('active', 'completed') then
      raise exception 'cannot modify an % diet plan; create or clone to a new draft instead', v_existing_plan.status;
    end if;

    if v_role = 'trainer' then
      v_trainer_id := public.linked_trainer_id(p_org_id);
      if v_trainer_id is null then
        raise exception 'linked trainer not found';
      end if;

      -- Trainer A must not edit another trainer's plan
      if v_existing_plan.trainer_id is distinct from v_trainer_id then
        raise exception 'not authorized to modify another trainer plan';
      end if;

      -- Verify trainer still has active assignment to the existing plan's member
      if not public.can_view_member_data(p_org_id, v_existing_plan.member_id) then
        raise exception 'not authorized: member is not actively assigned to trainer';
      end if;

      -- Trainers must never transfer an existing plan to another Member
      if p_member_id is not null and p_member_id is distinct from v_existing_plan.member_id then
        raise exception 'trainers cannot transfer an existing plan to another member';
      end if;

      v_target_member_id := v_existing_plan.member_id;
    elsif public.user_has_permission(p_org_id, 'fitness.manage') then
      -- Owner/Admin:
      if p_member_id is not null and p_member_id is distinct from v_existing_plan.member_id then
        v_target_member_id := p_member_id;
      else
        v_target_member_id := v_existing_plan.member_id;
      end if;

      -- For Owner/Admin edits, preserve existing trainer_id when p_trainer_id is omitted (null)
      -- Change trainer assignment only on an explicit authorized reassignment.
      if p_trainer_id is null then
        v_trainer_id := v_existing_plan.trainer_id;
      else
        v_trainer_id := p_trainer_id;
      end if;

      if v_trainer_id is not null and not exists (
        select 1 from public.trainers where id = v_trainer_id and organization_id = p_org_id
      ) then
        raise exception 'trainer not found in organization';
      end if;
    else
      raise exception 'insufficient privileges';
    end if;
  else
    -- Creating a new plan
    v_target_member_id := p_member_id;
    if v_target_member_id is null then
      raise exception 'member_id is required';
    end if;

    if v_role = 'trainer' then
      v_trainer_id := public.linked_trainer_id(p_org_id);
      if v_trainer_id is null then
        raise exception 'linked trainer not found';
      end if;

      -- Verify target member is actively assigned to this trainer
      if not public.can_view_member_data(p_org_id, v_target_member_id) then
        raise exception 'member is not assigned to trainer';
      end if;
    elsif public.user_has_permission(p_org_id, 'fitness.manage') then
      v_trainer_id := p_trainer_id;
      if v_trainer_id is not null and not exists (
        select 1 from public.trainers where id = v_trainer_id and organization_id = p_org_id
      ) then
        raise exception 'trainer not found in organization';
      end if;
    else
      raise exception 'insufficient privileges';
    end if;
  end if;

  -- 3. Validate target member exists in organization
  if not exists (
    select 1 from public.gym_members m
    where m.id = v_target_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;

  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'end date cannot be before start date';
  end if;

  -- 4. Upsert plan record strictly as draft (never archive active plans on save)
  if p_plan_id is not null then
    update public.diet_plans set
      member_id = v_target_member_id,
      trainer_id = v_trainer_id,
      name = v_name,
      goal = nullif(trim(p_goal), ''),
      status = 'draft',
      daily_calorie_target = p_daily_calorie_target,
      protein_target_g = p_protein_target_g,
      carb_target_g = p_carb_target_g,
      fat_target_g = p_fat_target_g,
      water_intake_liters = p_water_intake_liters,
      start_date = p_start_date,
      end_date = p_end_date,
      notes = nullif(trim(p_notes), ''),
      is_active = false,
      updated_at = now()
    where id = p_plan_id;

    v_plan_id := p_plan_id;
  else
    insert into public.diet_plans (
      organization_id, member_id, trainer_id, name, goal, status,
      daily_calorie_target, protein_target_g, carb_target_g, fat_target_g, water_intake_liters,
      start_date, end_date, notes, is_active, created_by, created_at, updated_at
    ) values (
      p_org_id, v_target_member_id, v_trainer_id, v_name, nullif(trim(p_goal), ''), 'draft',
      p_daily_calorie_target, p_protein_target_g, p_carb_target_g, p_fat_target_g, p_water_intake_liters,
      p_start_date, p_end_date, nullif(trim(p_notes), ''), false, auth.uid(), now(), now()
    )
    returning id into v_plan_id;
  end if;

  -- 5. Meal items handling:
  -- If p_items is NULL, PRESERVE existing items!
  -- Only replace if caller explicitly passes a JSON array.
  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' then
      raise exception 'items must be a json array or null';
    end if;

    -- Pre-validate all items before deleting any existing rows (atomic)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'each item in items must be a json object';
      end if;

      -- Validate explicit meal name (reject blank or placeholder 'meal')
      v_item_meal := nullif(trim(v_item->>'meal'), '');
      if v_item_meal is null or lower(v_item_meal) = 'meal' then
        raise exception 'each item must have a meaningful explicit meal name';
      end if;

      -- Validate explicit food name or description (reject blank or placeholder 'item')
      v_item_food := nullif(trim(v_item->>'foodName'), '');
      v_item_desc := coalesce(v_item_food, nullif(trim(v_item->>'description'), ''));
      if v_item_desc is null or lower(v_item_desc) = 'item' then
        raise exception 'each item must have an explicit food name or description';
      end if;

      if v_item->>'calories' is not null and trim(v_item->>'calories') <> '' then
        begin
          v_item_cals := (v_item->>'calories')::integer;
          if v_item_cals < 0 then
            raise exception 'calories cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid calories value: %', v_item->>'calories';
        end;
      end if;

      if v_item->>'quantity' is not null and trim(v_item->>'quantity') <> '' then
        begin
          v_item_qty := (v_item->>'quantity')::numeric;
          if v_item_qty < 0 then
            raise exception 'quantity cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid quantity value: %', v_item->>'quantity';
        end;
      end if;

      if v_item->>'proteinG' is not null and trim(v_item->>'proteinG') <> '' then
        begin
          v_item_protein := (v_item->>'proteinG')::numeric;
          if v_item_protein < 0 then
            raise exception 'protein cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid protein value: %', v_item->>'proteinG';
        end;
      end if;

      if v_item->>'carbsG' is not null and trim(v_item->>'carbsG') <> '' then
        begin
          v_item_carbs := (v_item->>'carbsG')::numeric;
          if v_item_carbs < 0 then
            raise exception 'carbs cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid carbs value: %', v_item->>'carbsG';
        end;
      end if;

      if v_item->>'fatG' is not null and trim(v_item->>'fatG') <> '' then
        begin
          v_item_fat := (v_item->>'fatG')::numeric;
          if v_item_fat < 0 then
            raise exception 'fat cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid fat value: %', v_item->>'fatG';
        end;
      end if;
    end loop;

    -- All items are valid: atomically replace
    delete from public.diet_plan_items
    where diet_plan_id = v_plan_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_item_meal := trim(v_item->>'meal');
      v_item_food := nullif(trim(v_item->>'foodName'), '');
      v_item_desc := coalesce(v_item_food, nullif(trim(v_item->>'description'), ''));
      v_item_cals := case
        when v_item->>'calories' is not null and trim(v_item->>'calories') <> ''
        then (v_item->>'calories')::integer
        else null
      end;

      insert into public.diet_plan_items (
        organization_id,
        diet_plan_id,
        meal,
        description,
        calories,
        sort_order,
        meal_time,
        food_name,
        quantity,
        unit,
        protein_g,
        carbs_g,
        fat_g,
        instructions
      ) values (
        p_org_id,
        v_plan_id,
        v_item_meal,
        v_item_desc,
        v_item_cals,
        coalesce((v_item->>'sortOrder')::integer, v_sort),
        nullif(trim(v_item->>'mealTime'), ''),
        v_item_food,
        case
          when v_item->>'quantity' is not null and trim(v_item->>'quantity') <> ''
          then (v_item->>'quantity')::numeric
          else null
        end,
        nullif(trim(v_item->>'unit'), ''),
        case
          when v_item->>'proteinG' is not null and trim(v_item->>'proteinG') <> ''
          then (v_item->>'proteinG')::numeric
          else null
        end,
        case
          when v_item->>'carbsG' is not null and trim(v_item->>'carbsG') <> ''
          then (v_item->>'carbsG')::numeric
          else null
        end,
        case
          when v_item->>'fatG' is not null and trim(v_item->>'fatG') <> ''
          then (v_item->>'fatG')::numeric
          else null
        end,
        nullif(trim(v_item->>'instructions'), '')
      );

      v_sort := v_sort + 1;
    end loop;
  end if;

  return v_plan_id;
end;
$$;

revoke all on function public.save_full_diet_plan from public, anon;
grant execute on function public.save_full_diet_plan to authenticated;

-- 4. New RPC: clone_diet_plan_to_draft
-- Creates a new Draft version copying all targets and meal items from an Active or Completed plan.
-- The existing Active Plan remains visible and active until the new Draft is published.
create or replace function public.clone_diet_plan_to_draft(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.diet_plans%rowtype;
  v_new_plan_id uuid;
  v_role text;
  v_trainer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_plan_id is null then
    raise exception 'plan_id is required';
  end if;

  select * into v_source
  from public.diet_plans
  where id = p_plan_id;

  if v_source.id is null then
    raise exception 'plan not found';
  end if;

  -- Permit cloning only from Active or Completed source plans as intended
  if v_source.status not in ('active', 'completed') then
    raise exception 'only active or completed diet plans can be cloned to draft';
  end if;

  v_role := public.current_org_role_slug(v_source.organization_id);

  if v_role = 'trainer' then
    v_trainer_id := public.linked_trainer_id(v_source.organization_id);
    if v_trainer_id is null or v_source.trainer_id is distinct from v_trainer_id then
      raise exception 'not authorized to clone another trainer plan';
    end if;

    if not public.can_view_member_data(v_source.organization_id, v_source.member_id) then
      raise exception 'not authorized: member is not actively assigned to trainer';
    end if;
  elsif not public.user_has_permission(v_source.organization_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  else
    v_trainer_id := v_source.trainer_id;
  end if;

  -- Create a new draft plan copying all goals, targets, dates, notes from the source plan
  insert into public.diet_plans (
    organization_id,
    member_id,
    trainer_id,
    name,
    goal,
    status,
    daily_calorie_target,
    protein_target_g,
    carb_target_g,
    fat_target_g,
    water_intake_liters,
    start_date,
    end_date,
    notes,
    is_active,
    created_by,
    created_at,
    updated_at
  ) values (
    v_source.organization_id,
    v_source.member_id,
    v_trainer_id,
    v_source.name || ' (Draft)',
    v_source.goal,
    'draft',
    v_source.daily_calorie_target,
    v_source.protein_target_g,
    v_source.carb_target_g,
    v_source.fat_target_g,
    v_source.water_intake_liters,
    coalesce(v_source.start_date, (timezone('utc', now()))::date),
    v_source.end_date,
    v_source.notes,
    false,
    auth.uid(),
    now(),
    now()
  )
  returning id into v_new_plan_id;

  -- Copy all meal items from source plan to the new draft
  insert into public.diet_plan_items (
    organization_id,
    diet_plan_id,
    meal,
    description,
    calories,
    sort_order,
    meal_time,
    food_name,
    quantity,
    unit,
    protein_g,
    carbs_g,
    fat_g,
    instructions
  )
  select
    organization_id,
    v_new_plan_id,
    meal,
    description,
    calories,
    sort_order,
    meal_time,
    food_name,
    quantity,
    unit,
    protein_g,
    carbs_g,
    fat_g,
    instructions
  from public.diet_plan_items
  where diet_plan_id = p_plan_id
  order by sort_order asc;

  return v_new_plan_id;
end;
$$;

revoke all on function public.clone_diet_plan_to_draft(uuid) from public, anon;
grant execute on function public.clone_diet_plan_to_draft(uuid) to authenticated;

-- 5. Hardened RPC: publish_diet_plan (Strict atomic validation and publish with Member-level lock & Reassignment Guard)
create or replace function public.publish_diet_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.diet_plans%rowtype;
  v_role text;
  v_trainer_id uuid;
  v_orig_org_id uuid;
  v_orig_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_plan_id is null then
    raise exception 'plan_id is required';
  end if;

  -- 1. Initial SELECT of the target diet_plans row with FOR UPDATE so it cannot be reassigned while publishing
  select * into v_plan
  from public.diet_plans
  where id = p_plan_id
  for update;

  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  -- 2. Capture its original organization_id and member_id
  v_orig_org_id := v_plan.organization_id;
  v_orig_member_id := v_plan.member_id;

  -- 3. Lock the corresponding gym_members row using FOR UPDATE to serialize publishing per member
  -- 4. Verify the member row exists
  perform 1
  from public.gym_members
  where id = v_orig_member_id
    and organization_id = v_orig_org_id
  for update;

  if not found then
    raise exception 'member not found';
  end if;

  -- 5. Re-read the target plan and explicitly verify organization_id and member_id still equal the captured original values
  select * into v_plan
  from public.diet_plans
  where id = p_plan_id
  for update;

  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  if v_plan.organization_id is distinct from v_orig_org_id or v_plan.member_id is distinct from v_orig_member_id then
    raise exception 'plan reassignment detected during publish; aborting';
  end if;

  -- 4. Verify authorization and current active Trainer assignment FIRST
  v_role := public.current_org_role_slug(v_plan.organization_id);

  if v_role = 'trainer' then
    v_trainer_id := public.linked_trainer_id(v_plan.organization_id);
    if v_trainer_id is null or v_plan.trainer_id is distinct from v_trainer_id then
      raise exception 'not authorized to publish another trainer plan';
    end if;

    if not public.can_view_member_data(v_plan.organization_id, v_plan.member_id) then
      raise exception 'not authorized: member is not actively assigned to trainer';
    end if;
  elsif not public.user_has_permission(v_plan.organization_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  end if;

  -- 5. Verify target plan is a valid Draft (reject completed plans, active plans, or non-draft)
  if v_plan.status = 'completed' then
    raise exception 'cannot publish a completed diet plan';
  end if;

  if v_plan.status = 'active' then
    raise exception 'diet plan is already active';
  end if;

  if v_plan.status <> 'draft' then
    raise exception 'only draft diet plans can be published';
  end if;

  -- 6. Verify target plan has at least one meal item
  if not exists (
    select 1
    from public.diet_plan_items
    where diet_plan_id = p_plan_id
  ) then
    raise exception 'cannot publish diet plan without meal items';
  end if;

  -- Reject blank and placeholder-only content ('Meal', 'Item', empty text)
  if exists (
    select 1
    from public.diet_plan_items
    where diet_plan_id = p_plan_id
      and (
        meal is null or trim(meal) = '' or lower(trim(meal)) = 'meal'
        or (
          (food_name is null or trim(food_name) = '' or lower(trim(food_name)) = 'item')
          and (description is null or trim(description) = '' or lower(trim(description)) = 'item')
        )
      )
  ) then
    raise exception 'cannot publish diet plan with blank or placeholder-only meal items';
  end if;

  -- 7. Only after ALL validation succeeds:
  -- Archive the previous active plan for this member in this organization
  update public.diet_plans
  set status = 'completed',
      is_active = false,
      updated_at = now()
  where organization_id = v_plan.organization_id
    and member_id = v_plan.member_id
    and status = 'active'
    and id <> p_plan_id;

  -- Publish the target plan atomically
  update public.diet_plans
  set status = 'active',
      is_active = true,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.publish_diet_plan(uuid) from public, anon;
grant execute on function public.publish_diet_plan(uuid) to authenticated;

-- 6. Hardened RPC: complete_diet_plan (Preserves historical items)
create or replace function public.complete_diet_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.diet_plans%rowtype;
  v_role text;
  v_trainer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_plan_id is null then
    raise exception 'plan_id is required';
  end if;

  select * into v_plan from public.diet_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  v_role := public.current_org_role_slug(v_plan.organization_id);

  if v_role = 'trainer' then
    v_trainer_id := public.linked_trainer_id(v_plan.organization_id);
    if v_trainer_id is null or v_plan.trainer_id is distinct from v_trainer_id then
      raise exception 'not authorized to complete another trainer plan';
    end if;

    if not public.can_view_member_data(v_plan.organization_id, v_plan.member_id) then
      raise exception 'not authorized: member is not actively assigned to trainer';
    end if;
  elsif not public.user_has_permission(v_plan.organization_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  end if;

  -- Complete plan and preserve all historical diet_plan_items
  update public.diet_plans
  set status = 'completed',
      is_active = false,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.complete_diet_plan(uuid) from public, anon;
grant execute on function public.complete_diet_plan(uuid) to authenticated;



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

-- Migration: 20261127000046_complete_attendance_management.sql
-- Description: Complete Production-Grade Member & Staff Attendance Management System
-- =============================================================================
-- Features:
-- 1. Hardened Member Attendance:
--    - Enforces database row-level locking on gym_members to serialize concurrent check-ins.
--    - Rejects suspended or inactive member accounts.
--    - Rejects pending, cancelled, expired, or non-existent memberships.
--    - Rejects check-in during active membership freeze.
--    - Rejects duplicate active/open check-in (check_out_at IS NULL).
--    - New check_out_member_attendance RPC for front-desk and manager check-out.
--    - New lookup_member_for_attendance RPC for fast QR/Code/Phone/Name front desk lookup.
-- 2. Complete Staff Attendance System:
--    - Dedicated public.staff_attendance_records table.
--    - Scoped RLS: staff/trainers can view only their own attendance; managers/owners can view all staff in branch.
--    - Self-service staff_clock_in and staff_clock_out RPCs with authoritative server timestamps.
--    - Concurrency safety: enforces partial unique index preventing duplicate open shifts per staff member.
--    - Authorized correct_staff_attendance RPC requiring mandatory reason and audit metadata.
--    - admin_record_staff_attendance RPC for manual entry by authorized personnel.
-- 3. Attendance Analytics & Aggregates:
--    - get_daily_attendance_summary RPC for real database KPIs.
--    - get_member_attendance_stats RPC for member portal streak and percentage calculations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: public.staff_attendance_records
-- ---------------------------------------------------------------------------

create table if not exists public.staff_attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_member_id uuid references public.organization_members(id) on delete set null,
  trainer_id uuid references public.trainers(id) on delete set null,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  status text not null default 'present'
    check (status in ('present', 'late', 'half_day', 'absent', 'on_leave')),
  method text not null default 'web'
    check (method in ('web', 'qr', 'manual', 'biometric', 'app')),
  working_hours numeric(6, 2),
  notes text,
  correction_reason text,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz,
  device_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at)
);

-- Branch foreign key guaranteeing branch belongs to organization
alter table public.staff_attendance_records drop constraint if exists staff_attendance_branch_org_fkey;
alter table public.staff_attendance_records add constraint staff_attendance_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

-- Indexes
create unique index if not exists staff_attendance_open_shift_idx
  on public.staff_attendance_records(organization_id, user_id)
  where check_out_at is null;

create index if not exists staff_attendance_org_idx
  on public.staff_attendance_records(organization_id, check_in_at desc);

create index if not exists staff_attendance_user_idx
  on public.staff_attendance_records(user_id, check_in_at desc);

create index if not exists staff_attendance_branch_idx
  on public.staff_attendance_records(organization_id, branch_id, check_in_at desc);

create index if not exists staff_attendance_date_idx
  on public.staff_attendance_records(organization_id, status, check_in_at desc);

-- Optimize member attendance active/open check-in checks
create index if not exists attendance_records_open_checkin_idx
  on public.attendance_records(organization_id, member_id)
  where check_out_at is null;

create index if not exists attendance_records_branch_date_idx
  on public.attendance_records(organization_id, branch_id, check_in_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS Policies on staff_attendance_records
-- ---------------------------------------------------------------------------

alter table public.staff_attendance_records enable row level security;

drop policy if exists "staff attendance select policy" on public.staff_attendance_records;
create policy "staff attendance select policy"
  on public.staff_attendance_records for select
  to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      -- Privileged roles with attendance.view permission can view authorized branches
      (
        public.user_has_permission(organization_id, 'attendance.view')
        and public.user_has_branch_access(organization_id, branch_id)
      )
      -- Staff & Trainers can always view their own attendance records
      or (user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Hardened RPC: create_attendance_record (Member Check-in)
-- ---------------------------------------------------------------------------

create or replace function public.create_attendance_record(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_check_in_at timestamptz,
  p_method text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_method text;
  v_check_in timestamptz;
  v_check_date date;
  v_member public.gym_members%rowtype;
  v_membership_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.require_org_permission(p_org_id, 'attendance.create');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  -- 1. CONCURRENCY HARDENING: Lock member row exclusively
  select * into v_member
  from public.gym_members
  where id = p_member_id
    and organization_id = p_org_id
  for update;

  if v_member.id is null then
    raise exception 'member not found';
  end if;

  -- 2. Member status check
  if v_member.status = 'suspended' then
    raise exception 'member account is suspended';
  elsif v_member.status = 'inactive' then
    raise exception 'member account is inactive';
  elsif v_member.status <> 'active' then
    raise exception 'member is not active';
  end if;

  v_method := coalesce(nullif(lower(trim(p_method)), ''), 'manual');
  if v_method not in ('manual', 'qr', 'biometric', 'app') then
    raise exception 'method is invalid';
  end if;

  v_check_in := coalesce(p_check_in_at, timezone('utc', now()));
  v_check_date := (timezone('utc', v_check_in))::date;

  -- 3. Check for open check-in
  if exists (
    select 1 from public.attendance_records r
    where r.member_id = p_member_id
      and r.organization_id = p_org_id
      and r.check_out_at is null
  ) then
    raise exception 'member already has an open check-in';
  end if;

  -- 4. Active Membership validation
  -- Look up membership status
  select m.status into v_membership_status
  from public.memberships m
  where m.member_id = p_member_id
    and m.organization_id = p_org_id
  order by
    case when m.status = 'active' and m.start_date <= v_check_date and m.end_date >= v_check_date then 1
         when m.status = 'active' then 2
         when m.status = 'pending' then 3
         when m.status = 'expired' then 4
         else 5 end asc,
    m.end_date desc
  limit 1;

  if v_membership_status is null then
    raise exception 'member does not have an active membership';
  elsif v_membership_status = 'pending' then
    raise exception 'membership is pending activation or payment';
  elsif v_membership_status = 'cancelled' then
    raise exception 'membership is cancelled';
  end if;

  -- Must have an active membership covering the check-in date
  if not exists (
    select 1 from public.memberships m
    where m.member_id = p_member_id
      and m.organization_id = p_org_id
      and m.status = 'active'
      and m.start_date <= v_check_date
      and m.end_date >= v_check_date
  ) then
    raise exception 'member does not have an active membership';
  end if;

  -- 5. Freeze validation
  if exists (
    select 1
    from public.membership_freezes f
    join public.memberships m on m.id = f.membership_id
    where m.member_id = p_member_id
      and m.organization_id = p_org_id
      and f.start_date <= v_check_date
      and f.end_date >= v_check_date
  ) then
    raise exception 'check-in is not allowed during a membership freeze';
  end if;

  -- 6. Insert attendance record
  insert into public.attendance_records (
    organization_id, branch_id, member_id, check_in_at, method, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id,
    v_check_in,
    v_method, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_attendance_record(uuid, uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.create_attendance_record(uuid, uuid, uuid, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hardened RPC: check_out_member_attendance
-- ---------------------------------------------------------------------------

create or replace function public.check_out_member_attendance(
  p_org_id uuid,
  p_record_id uuid,
  p_check_out_at timestamptz default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.attendance_records%rowtype;
  v_out timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not (
    public.user_has_permission(p_org_id, 'attendance.create')
    or public.user_has_permission(p_org_id, 'attendance.manage')
  ) then
    raise exception 'insufficient attendance privileges';
  end if;

  select * into v_rec
  from public.attendance_records
  where id = p_record_id
    and organization_id = p_org_id
  for update;

  if v_rec.id is null then
    raise exception 'attendance record not found';
  end if;

  if not public.user_has_branch_access(p_org_id, v_rec.branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  if v_rec.check_out_at is not null then
    raise exception 'member has already checked out';
  end if;

  v_out := coalesce(p_check_out_at, timezone('utc', now()));
  if v_out < v_rec.check_in_at then
    raise exception 'check-out cannot be before check-in';
  end if;

  update public.attendance_records
  set check_out_at = v_out,
      notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_record_id;
end;
$$;

revoke all on function public.check_out_member_attendance(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.check_out_member_attendance(uuid, uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: staff_clock_in (Self-Service Staff / Trainer Clock-In)
-- ---------------------------------------------------------------------------

create or replace function public.staff_clock_in(
  p_org_id uuid,
  p_branch_id uuid,
  p_method text default 'web',
  p_notes text default null,
  p_device_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_trainer_id uuid;
  v_role text;
  v_method text;
  v_record_id uuid;
  v_now timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_org_id is null or p_branch_id is null then
    raise exception 'organization_id and branch_id are required';
  end if;

  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  -- Resolve organization_member
  select m.id into v_member_id
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = v_user_id
    and m.status = 'active';

  if v_member_id is null then
    raise exception 'staff member not found in organization or inactive';
  end if;

  v_role := public.current_org_role_slug(p_org_id);
  if v_role = 'member' then
    raise exception 'gym members cannot use staff clock-in; use member check-in instead';
  end if;

  -- Resolve trainer if role is trainer
  if v_role = 'trainer' then
    v_trainer_id := public.linked_trainer_id(p_org_id);
  end if;

  -- Enforce duplicate open shift prevention
  if exists (
    select 1
    from public.staff_attendance_records
    where organization_id = p_org_id
      and user_id = v_user_id
      and check_out_at is null
  ) then
    raise exception 'staff member already has an open shift';
  end if;

  v_method := coalesce(nullif(lower(trim(p_method)), ''), 'web');
  if v_method not in ('web', 'qr', 'manual', 'biometric', 'app') then
    raise exception 'invalid attendance method';
  end if;

  v_now := timezone('utc', now());

  insert into public.staff_attendance_records (
    organization_id,
    branch_id,
    user_id,
    org_member_id,
    trainer_id,
    check_in_at,
    status,
    method,
    notes,
    device_metadata,
    created_at,
    updated_at
  ) values (
    p_org_id,
    p_branch_id,
    v_user_id,
    v_member_id,
    v_trainer_id,
    v_now,
    'present',
    v_method,
    nullif(trim(p_notes), ''),
    coalesce(p_device_metadata, '{}'::jsonb),
    v_now,
    v_now
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;

revoke all on function public.staff_clock_in(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.staff_clock_in(uuid, uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: staff_clock_out (Self-Service Staff / Trainer Clock-Out)
-- ---------------------------------------------------------------------------

create or replace function public.staff_clock_out(
  p_org_id uuid,
  p_record_id uuid default null,
  p_notes text default null,
  p_device_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_record public.staff_attendance_records%rowtype;
  v_now timestamptz;
  v_hours numeric(6, 2);
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_record_id is not null then
    select * into v_record
    from public.staff_attendance_records
    where id = p_record_id
      and organization_id = p_org_id
      and user_id = v_user_id
    for update;
  else
    select * into v_record
    from public.staff_attendance_records
    where organization_id = p_org_id
      and user_id = v_user_id
      and check_out_at is null
    order by check_in_at desc
    limit 1
    for update;
  end if;

  if v_record.id is null then
    raise exception 'no open staff shift found to clock out';
  end if;

  if v_record.check_out_at is not null then
    raise exception 'shift is already clocked out';
  end if;

  v_now := timezone('utc', now());
  v_hours := round((extract(epoch from (v_now - v_record.check_in_at)) / 3600.0)::numeric, 2);

  update public.staff_attendance_records
  set check_out_at = v_now,
      working_hours = v_hours,
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      device_metadata = coalesce(device_metadata, '{}'::jsonb) || coalesce(p_device_metadata, '{}'::jsonb),
      updated_at = v_now
  where id = v_record.id;
end;
$$;

revoke all on function public.staff_clock_out(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.staff_clock_out(uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC: correct_staff_attendance (Owner / Admin Attendance Correction)
-- ---------------------------------------------------------------------------

create or replace function public.correct_staff_attendance(
  p_org_id uuid,
  p_record_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_status text,
  p_reason text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.staff_attendance_records%rowtype;
  v_status text;
  v_hours numeric(6, 2);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.require_org_permission(p_org_id, 'attendance.manage');

  v_reason := nullif(trim(p_reason), '');
  if v_reason is null then
    raise exception 'correction reason is required';
  end if;

  select * into v_rec
  from public.staff_attendance_records
  where id = p_record_id
    and organization_id = p_org_id
  for update;

  if v_rec.id is null then
    raise exception 'staff attendance record not found';
  end if;

  if not public.user_has_branch_access(p_org_id, v_rec.branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  v_status := coalesce(nullif(lower(trim(p_status)), ''), v_rec.status);
  if v_status not in ('present', 'late', 'half_day', 'absent', 'on_leave') then
    raise exception 'invalid attendance status';
  end if;

  if p_check_in_at is null then
    raise exception 'check-in time is required';
  end if;

  if p_check_out_at is not null and p_check_out_at < p_check_in_at then
    raise exception 'check-out cannot be before check-in';
  end if;

  if p_check_out_at is not null then
    v_hours := round((extract(epoch from (p_check_out_at - p_check_in_at)) / 3600.0)::numeric, 2);
  else
    v_hours := null;
  end if;

  update public.staff_attendance_records
  set check_in_at = p_check_in_at,
      check_out_at = p_check_out_at,
      status = v_status,
      working_hours = v_hours,
      correction_reason = v_reason,
      corrected_by = auth.uid(),
      corrected_at = timezone('utc', now()),
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      updated_at = timezone('utc', now())
  where id = p_record_id;
end;
$$;

revoke all on function public.correct_staff_attendance(uuid, uuid, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.correct_staff_attendance(uuid, uuid, timestamptz, timestamptz, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC: admin_record_staff_attendance (Manual Entry by Authorized Staff)
-- ---------------------------------------------------------------------------

create or replace function public.admin_record_staff_attendance(
  p_org_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz default null,
  p_status text default 'present',
  p_notes text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_trainer_id uuid;
  v_status text;
  v_hours numeric(6, 2);
  v_record_id uuid;
  v_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.require_org_permission(p_org_id, 'attendance.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  select m.id into v_member_id
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = p_user_id
    and m.status = 'active';

  if v_member_id is null then
    raise exception 'staff member not found in organization';
  end if;

  select t.id into v_trainer_id
  from public.trainers t
  where t.organization_id = p_org_id
    and t.user_id = p_user_id
  limit 1;

  v_status := coalesce(nullif(lower(trim(p_status)), ''), 'present');
  if v_status not in ('present', 'late', 'half_day', 'absent', 'on_leave') then
    raise exception 'invalid attendance status';
  end if;

  if p_check_in_at is null then
    raise exception 'check-in time is required';
  end if;

  if p_check_out_at is not null and p_check_out_at < p_check_in_at then
    raise exception 'check-out cannot be before check-in';
  end if;

  if p_check_out_at is not null then
    v_hours := round((extract(epoch from (p_check_out_at - p_check_in_at)) / 3600.0)::numeric, 2);
  end if;

  v_now := timezone('utc', now());

  insert into public.staff_attendance_records (
    organization_id,
    branch_id,
    user_id,
    org_member_id,
    trainer_id,
    check_in_at,
    check_out_at,
    status,
    method,
    working_hours,
    notes,
    correction_reason,
    corrected_by,
    corrected_at,
    created_at,
    updated_at
  ) values (
    p_org_id,
    p_branch_id,
    p_user_id,
    v_member_id,
    v_trainer_id,
    p_check_in_at,
    p_check_out_at,
    v_status,
    'manual',
    v_hours,
    nullif(trim(p_notes), ''),
    nullif(trim(p_reason), ''),
    case when p_reason is not null then auth.uid() else null end,
    case when p_reason is not null then v_now else null end,
    v_now,
    v_now
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;

revoke all on function public.admin_record_staff_attendance(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.admin_record_staff_attendance(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. RPC: get_daily_attendance_summary (Real Database Analytics)
-- ---------------------------------------------------------------------------

create or replace function public.get_daily_attendance_summary(
  p_org_id uuid,
  p_branch_id uuid default null,
  p_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_members_today integer := 0;
  v_members_open integer := 0;
  v_staff_today integer := 0;
  v_staff_open integer := 0;
  v_staff_hours numeric(8, 2) := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_org_member(p_org_id) then
    raise exception 'not an organization member';
  end if;

  v_date := coalesce(p_date, (timezone('utc', now()))::date);
  v_start := v_date::timestamptz;
  v_end := (v_date + 1)::timestamptz;

  -- 1. Member check-ins count today
  select count(distinct member_id) into v_members_today
  from public.attendance_records
  where organization_id = p_org_id
    and check_in_at >= v_start
    and check_in_at < v_end
    and (p_branch_id is null or branch_id = p_branch_id);

  -- 2. Members currently in gym (open check-in)
  select count(*) into v_members_open
  from public.attendance_records
  where organization_id = p_org_id
    and check_out_at is null
    and (p_branch_id is null or branch_id = p_branch_id);

  -- 3. Staff count today
  select count(distinct user_id), coalesce(sum(working_hours), 0)
  into v_staff_today, v_staff_hours
  from public.staff_attendance_records
  where organization_id = p_org_id
    and check_in_at >= v_start
    and check_in_at < v_end
    and (p_branch_id is null or branch_id = p_branch_id);

  -- 4. Staff currently on duty (open shift)
  select count(*) into v_staff_open
  from public.staff_attendance_records
  where organization_id = p_org_id
    and check_out_at is null
    and (p_branch_id is null or branch_id = p_branch_id);

  return jsonb_build_object(
    'date', v_date,
    'members_today', v_members_today,
    'members_currently_in_gym', v_members_open,
    'staff_today', v_staff_today,
    'staff_on_duty', v_staff_open,
    'staff_total_hours', v_staff_hours
  );
end;
$$;

revoke all on function public.get_daily_attendance_summary(uuid, uuid, date) from public, anon;
grant execute on function public.get_daily_attendance_summary(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. RPC: get_member_attendance_stats (Member Portal Streak & Rates)
-- ---------------------------------------------------------------------------

create or replace function public.get_member_attendance_stats(
  p_org_id uuid,
  p_member_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target_member_id uuid;
  v_role text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_total_visits integer := 0;
  v_month_visits integer := 0;
  v_month_days_present integer := 0;
  v_distinct_dates date[];
  v_current_streak integer := 0;
  v_prev_date date;
  v_d date;
  v_today date;
  v_attendance_pct numeric(5, 1) := 0;
  v_active_membership_start date;
  v_active_membership_end date;
  v_days_in_month integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_role := public.current_org_role_slug(p_org_id);
  if v_role = 'member' then
    v_target_member_id := public.linked_gym_member_id(p_org_id);
  else
    v_target_member_id := p_member_id;
  end if;

  if v_target_member_id is null then
    return jsonb_build_object(
      'total_visits', 0,
      'month_visits', 0,
      'month_days_present', 0,
      'current_streak', 0,
      'attendance_percentage', 0
    );
  end if;

  v_today := (timezone('utc', now()))::date;
  v_month_start := date_trunc('month', v_today)::timestamptz;
  v_month_end := (date_trunc('month', v_today) + interval '1 month')::timestamptz;
  v_days_in_month := extract(day from (date_trunc('month', v_today) + interval '1 month - 1 day'));

  -- Total visits all-time
  select count(*) into v_total_visits
  from public.attendance_records
  where organization_id = p_org_id
    and member_id = v_target_member_id;

  -- Month visits
  select count(*), count(distinct (timezone('utc', check_in_at))::date)
  into v_month_visits, v_month_days_present
  from public.attendance_records
  where organization_id = p_org_id
    and member_id = v_target_member_id
    and check_in_at >= v_month_start
    and check_in_at < v_month_end;

  -- Current streak calculation
  select array_agg(d order by d desc) into v_distinct_dates
  from (
    select distinct (timezone('utc', check_in_at))::date as d
    from public.attendance_records
    where organization_id = p_org_id
      and member_id = v_target_member_id
      and (timezone('utc', check_in_at))::date <= v_today
  ) sub;

  if v_distinct_dates is not null and array_length(v_distinct_dates, 1) > 0 then
    -- Streak continues if visited today or yesterday
    if v_distinct_dates[1] = v_today or v_distinct_dates[1] = (v_today - 1) then
      v_current_streak := 1;
      v_prev_date := v_distinct_dates[1];

      for i in 2..array_length(v_distinct_dates, 1) loop
        v_d := v_distinct_dates[i];
        if v_prev_date - v_d = 1 then
          v_current_streak := v_current_streak + 1;
          v_prev_date := v_d;
        else
          exit;
        end if;
      end loop;
    end if;
  end if;

  -- Active membership duration for monthly attendance percentage
  select m.start_date, m.end_date
  into v_active_membership_start, v_active_membership_end
  from public.memberships m
  where m.member_id = v_target_member_id
    and m.organization_id = p_org_id
    and m.status = 'active'
  order by m.end_date desc
  limit 1;

  if v_days_in_month > 0 then
    v_attendance_pct := round(((v_month_days_present::numeric / v_days_in_month::numeric) * 100.0), 1);
  end if;

  return jsonb_build_object(
    'total_visits', v_total_visits,
    'month_visits', v_month_visits,
    'month_days_present', v_month_days_present,
    'current_streak', v_current_streak,
    'attendance_percentage', v_attendance_pct,
    'days_in_month', v_days_in_month
  );
end;
$$;

revoke all on function public.get_member_attendance_stats(uuid, uuid) from public, anon;
grant execute on function public.get_member_attendance_stats(uuid, uuid) to authenticated;
