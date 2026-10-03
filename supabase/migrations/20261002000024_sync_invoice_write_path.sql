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
