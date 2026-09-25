-- =============================================================================
-- BSB FitForge - Billing write path (invoices, payments, installments,
-- credit notes, refunds)
-- =============================================================================
-- Additive. Reuses public.invoices / invoice_items / payments / installments /
-- credit_notes / refunds. organization_id is derived server-side. Soft status
-- only (void / rejected). No invoices from memberships. No USING(true).
-- =============================================================================

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

alter table public.invoice_items drop constraint if exists invoice_items_item_type_check;
alter table public.invoice_items add constraint invoice_items_item_type_check
  check (item_type in ('membership', 'renewal', 'upgrade', 'personal_training', 'class', 'product', 'other'));

alter table public.installments add column if not exists paid_amount numeric(12, 2) not null default 0;

alter table public.credit_notes add column if not exists notes text;
alter table public.credit_notes add column if not exists tax_total numeric(12, 2) not null default 0;

create table if not exists public.credit_note_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  description text not null,
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),
  taxable_amount numeric(12, 2) not null default 0 check (taxable_amount >= 0),
  gst_amount numeric(12, 2) not null default 0 check (gst_amount >= 0),
  line_total numeric(12, 2) not null default 0 check (line_total >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists credit_note_items_note_idx on public.credit_note_items(credit_note_id, sort_order);

alter table public.credit_note_items enable row level security;

drop policy if exists "org members can view credit note items" on public.credit_note_items;
create policy "org members can view credit note items"
  on public.credit_note_items for select
  using (public.is_org_member(organization_id));

alter table public.refunds add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
alter table public.refunds add column if not exists method text not null default 'original';
alter table public.refunds add column if not exists notes text;

alter table public.refunds drop constraint if exists refunds_method_check;
alter table public.refunds add constraint refunds_method_check
  check (method in ('cash', 'card', 'upi', 'bank_transfer', 'original', 'other'));

-- ---------------------------------------------------------------------------
-- Money helpers
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
-- Invoices
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
begin
  perform public.require_org_permission(p_org_id, 'billing.create');
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
      tax_rate, taxable_amount, gst_amount, cgst, sgst, igst, line_total, sort_order
    )
    values (
      p_org_id, v_id, trim(v_item ->> 'description'), v_type, v_qty, v_price, v_discount,
      v_rate, v_taxable, v_gst, v_cgst, v_sgst, v_igst, v_line, v_idx
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

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
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
end;
$$;

grant execute on function public.void_invoice(uuid, text) to authenticated;

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
  perform public.require_org_permission(v_org_id, 'billing.create');
  if v_status is distinct from 'draft' then
    raise exception 'only draft invoices can be issued';
  end if;
  update public.invoices set status = 'issued' where id = p_invoice_id;
  perform public.refresh_invoice_status(p_invoice_id);
end;
$$;

grant execute on function public.issue_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

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
  perform public.require_org_permission(p_org_id, 'payments.create');

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
-- Installments
-- ---------------------------------------------------------------------------

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

  v_count := coalesce(p_count, 1);
  if v_count < 1 or v_count > 24 then
    raise exception 'installment count must be between 1 and 24';
  end if;
  v_start := coalesce(p_start_date, v_invoice.issue_date, (timezone('utc', now()))::date);
  v_base := public.round_money(floor((v_invoice.total / v_count) * 100) / 100);

  for i in 0 .. v_count - 1 loop
    if i = v_count - 1 then
      v_amount := public.round_money(v_invoice.total - v_allocated);
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

-- ---------------------------------------------------------------------------
-- Credit notes
-- ---------------------------------------------------------------------------

create or replace function public.create_credit_note(
  p_org_id uuid,
  p_invoice_id uuid,
  p_reason text,
  p_notes text,
  p_items jsonb,
  p_apply boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
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
  v_line numeric;
  v_total numeric := 0;
  v_tax numeric := 0;
  v_reason text;
begin
  perform public.require_org_permission(p_org_id, 'billing.create');
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null or v_invoice.organization_id <> p_org_id then
    raise exception 'invoice not found';
  end if;
  perform public.require_branch_in_org(p_org_id, v_invoice.branch_id);
  if v_invoice.status in ('draft', 'void') then
    raise exception 'credit notes require an issued invoice';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one credit note item is required';
  end if;

  v_reason := coalesce(nullif(trim(p_reason), ''), 'other');
  if v_reason not in ('cancellation', 'overcharge', 'discount_adjustment', 'service_issue', 'other') then
    v_reason := 'other';
  end if;

  v_number := public.next_document_number(p_org_id, 'credit_note', 'CN');

  insert into public.credit_notes (
    organization_id, branch_id, invoice_id, member_id, credit_number, status,
    issue_date, amount, reason, notes, created_by
  )
  values (
    p_org_id, v_invoice.branch_id, p_invoice_id, v_invoice.member_id, v_number,
    case when coalesce(p_apply, false) then 'applied' else 'issued' end,
    (timezone('utc', now()))::date, 0.01, v_reason, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 1);
    v_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    v_discount := coalesce((v_item ->> 'discount')::numeric, 0);
    v_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    if v_qty <= 0 or v_price < 0 or v_discount < 0 then
      raise exception 'amounts cannot be negative';
    end if;
    if coalesce(nullif(trim(v_item ->> 'description'), ''), '') = '' then
      raise exception 'item description is required';
    end if;
    v_gross := public.round_money(v_qty * v_price);
    v_after := greatest(public.round_money(v_gross - v_discount), 0);
    v_taxable := v_after;
    v_gst := public.round_money(v_taxable * (v_rate / 100));
    v_line := public.round_money(v_taxable + v_gst);

    insert into public.credit_note_items (
      organization_id, credit_note_id, description, quantity, unit_price, discount,
      tax_rate, taxable_amount, gst_amount, line_total, sort_order
    )
    values (
      p_org_id, v_id, trim(v_item ->> 'description'), v_qty, v_price, v_discount,
      v_rate, v_taxable, v_gst, v_line, v_idx
    );
    v_total := v_total + v_line;
    v_tax := v_tax + v_gst;
    v_idx := v_idx + 1;
  end loop;

  if v_total <= 0 then
    raise exception 'credit note amount must be greater than zero';
  end if;
  if v_total > public.round_money(v_invoice.total - coalesce(v_invoice.amount_credited, 0)) then
    raise exception 'credit note exceeds the remaining invoice amount';
  end if;

  update public.credit_notes set
    amount = public.round_money(v_total),
    tax_total = public.round_money(v_tax)
  where id = v_id;

  if coalesce(p_apply, false) then
    perform public.refresh_invoice_status(p_invoice_id);
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_credit_note(
  uuid, uuid, text, text, jsonb, boolean
) to authenticated;

create or replace function public.apply_credit_note(p_credit_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.credit_notes%rowtype;
begin
  select * into v_note from public.credit_notes where id = p_credit_note_id;
  if v_note.id is null then
    raise exception 'credit note not found';
  end if;
  perform public.require_org_permission(v_note.organization_id, 'billing.create');
  if v_note.status = 'applied' then
    return;
  end if;
  if v_note.status = 'void' then
    raise exception 'cancelled credit notes cannot be applied';
  end if;
  update public.credit_notes set status = 'applied' where id = p_credit_note_id;
  if v_note.invoice_id is not null then
    perform public.refresh_invoice_status(v_note.invoice_id);
  end if;
end;
$$;

grant execute on function public.apply_credit_note(uuid) to authenticated;

create or replace function public.void_credit_note(p_credit_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.credit_notes%rowtype;
begin
  select * into v_note from public.credit_notes where id = p_credit_note_id;
  if v_note.id is null then
    raise exception 'credit note not found';
  end if;
  perform public.require_org_permission(v_note.organization_id, 'billing.void');
  if v_note.status = 'applied' then
    raise exception 'applied credit notes cannot be cancelled';
  end if;
  update public.credit_notes set status = 'void' where id = p_credit_note_id;
end;
$$;

grant execute on function public.void_credit_note(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------------

create or replace function public.request_refund(
  p_org_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_method text,
  p_reason text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_refunded numeric;
  v_id uuid;
  v_method text;
begin
  perform public.require_org_permission(p_org_id, 'billing.refund');
  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null or v_payment.organization_id <> p_org_id then
    raise exception 'payment not found';
  end if;
  perform public.require_branch_in_org(p_org_id, v_payment.branch_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'refund amount must be greater than zero';
  end if;

  select coalesce(sum(amount), 0) into v_refunded
  from public.refunds
  where payment_id = p_payment_id and status in ('requested', 'approved', 'processed');

  if public.round_money(v_refunded + p_amount) > v_payment.amount then
    raise exception 'refund exceeds the refundable amount';
  end if;

  if exists (
    select 1 from public.refunds
    where payment_id = p_payment_id
      and status in ('requested', 'approved', 'processed')
      and public.round_money(amount) = public.round_money(p_amount)
      and created_at > timezone('utc', now()) - interval '2 minutes'
  ) then
    raise exception 'a matching refund was just recorded for this payment';
  end if;

  v_method := coalesce(nullif(p_method, ''), 'original');
  if v_method not in ('cash', 'card', 'upi', 'bank_transfer', 'original', 'other') then
    raise exception 'refund method is invalid';
  end if;

  insert into public.refunds (
    organization_id, branch_id, payment_id, invoice_id, member_id, amount, status, method, reason, notes, created_by
  )
  values (
    p_org_id, v_payment.branch_id, p_payment_id, v_payment.invoice_id, v_payment.member_id,
    public.round_money(p_amount), 'requested', v_method,
    nullif(trim(p_reason), ''), nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.request_refund(
  uuid, uuid, numeric, text, text, text
) to authenticated;

create or replace function public.set_refund_status(p_refund_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds%rowtype;
  v_status text;
begin
  select * into v_refund from public.refunds where id = p_refund_id;
  if v_refund.id is null then
    raise exception 'refund not found';
  end if;
  perform public.require_org_permission(v_refund.organization_id, 'billing.refund');

  v_status := p_status;
  if v_status not in ('requested', 'approved', 'processed', 'rejected') then
    raise exception 'refund status is invalid';
  end if;
  if v_refund.status = 'processed' and v_status is distinct from 'processed' then
    raise exception 'completed refunds cannot be changed';
  end if;

  update public.refunds set
    status = v_status,
    processed_at = case when v_status = 'processed' then timezone('utc', now()) else processed_at end
  where id = p_refund_id;

  if v_status = 'processed' and v_refund.invoice_id is not null then
    update public.invoices set
      amount_paid = greatest(public.round_money(amount_paid - v_refund.amount), 0)
    where id = v_refund.invoice_id;
    perform public.refresh_invoice_status(v_refund.invoice_id);
  end if;
end;
$$;

grant execute on function public.set_refund_status(uuid, text) to authenticated;
