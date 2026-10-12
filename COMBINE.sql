-- =============================================================================
-- BSB FitForge - COMBINE.sql
-- Pending production migrations 20261002000024 through 20261008000029
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

