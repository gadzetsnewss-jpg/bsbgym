-- =============================================================================
-- BSB FitForge - Phase 3.2: Commerce, finance, CRM and notifications schema
-- =============================================================================
-- Additive tables for the remaining menu modules:
--
--   * Billing:      invoices + items, payments, installments, credit_notes,
--                   refunds
--   * POS:          pos_sales + items
--   * Inventory:    stock_movements, purchases + items
--   * Finance:      expenses, income_entries
--   * CRM:          leads, trial_memberships, follow_ups, referrals
--   * Notifications: notifications
--
-- Security model (unchanged): organization_id on every row, RLS enabled,
-- branch-scoped reads via the existing helpers, notifications are strictly
-- recipient-scoped, and there are no direct write policies - each module UI
-- adds SECURITY DEFINER RPCs. No hard deletes.
--
-- This migration uses a dedicated audit trigger function for commerce tables
-- instead of growing the shared audit_event_trigger further.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Billing: invoices + items
-- ---------------------------------------------------------------------------

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  member_id uuid references public.gym_members(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void')),
  issue_date date not null default (timezone('utc', now()))::date,
  due_date date,
  sub_total numeric(12, 2) not null default 0 check (sub_total >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  tax_total numeric(12, 2) not null default 0 check (tax_total >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);

alter table public.invoices drop constraint if exists invoices_branch_org_fkey;
alter table public.invoices add constraint invoices_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists invoices_org_idx on public.invoices(organization_id, issue_date desc);
create index if not exists invoices_org_status_idx on public.invoices(organization_id, status);
create index if not exists invoices_member_idx on public.invoices(member_id);

alter table public.invoices enable row level security;

drop policy if exists "org members can view invoices" on public.invoices;
create policy "org members can view invoices"
  on public.invoices for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),
  line_total numeric(12, 2) not null default 0 check (line_total >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_org_idx on public.invoice_items(organization_id);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id, sort_order);

alter table public.invoice_items enable row level security;

drop policy if exists "org members can view invoice items" on public.invoice_items;
create policy "org members can view invoice items"
  on public.invoice_items for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 2. Billing: payments, installments, credit notes, refunds
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  member_id uuid references public.gym_members(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'cash'
    check (method in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other')),
  reference text,
  paid_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.payments drop constraint if exists payments_branch_org_fkey;
alter table public.payments add constraint payments_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists payments_org_idx on public.payments(organization_id, paid_at desc);
create index if not exists payments_invoice_idx on public.payments(invoice_id);
create index if not exists payments_member_idx on public.payments(member_id);

alter table public.payments enable row level security;

drop policy if exists "org members can view payments" on public.payments;
create policy "org members can view payments"
  on public.payments for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  due_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  paid_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists installments_org_idx on public.installments(organization_id);
create index if not exists installments_invoice_idx on public.installments(invoice_id, sort_order);
create index if not exists installments_due_idx on public.installments(organization_id, due_date, status);

alter table public.installments enable row level security;

drop policy if exists "org members can view installments" on public.installments;
create policy "org members can view installments"
  on public.installments for select
  using (public.is_org_member(organization_id));

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  member_id uuid references public.gym_members(id) on delete set null,
  credit_number text not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'applied', 'void')),
  issue_date date not null default (timezone('utc', now()))::date,
  amount numeric(12, 2) not null check (amount > 0),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, credit_number)
);

alter table public.credit_notes drop constraint if exists credit_notes_branch_org_fkey;
alter table public.credit_notes add constraint credit_notes_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists credit_notes_org_idx on public.credit_notes(organization_id, issue_date desc);

alter table public.credit_notes enable row level security;

drop policy if exists "org members can view credit notes" on public.credit_notes;
create policy "org members can view credit notes"
  on public.credit_notes for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  payment_id uuid references public.payments(id) on delete set null,
  member_id uuid references public.gym_members(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'processed', 'rejected')),
  reason text,
  processed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.refunds drop constraint if exists refunds_branch_org_fkey;
alter table public.refunds add constraint refunds_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists refunds_org_idx on public.refunds(organization_id, created_at desc);

alter table public.refunds enable row level security;

drop policy if exists "org members can view refunds" on public.refunds;
create policy "org members can view refunds"
  on public.refunds for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

-- ---------------------------------------------------------------------------
-- 3. POS: sales + items
-- ---------------------------------------------------------------------------

create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  member_id uuid references public.gym_members(id) on delete set null,
  sale_number text not null,
  status text not null default 'completed' check (status in ('completed', 'void')),
  sub_total numeric(12, 2) not null default 0 check (sub_total >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  tax_total numeric(12, 2) not null default 0 check (tax_total >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'other')),
  sold_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, sale_number)
);

alter table public.pos_sales drop constraint if exists pos_sales_branch_org_fkey;
alter table public.pos_sales add constraint pos_sales_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists pos_sales_org_idx on public.pos_sales(organization_id, sold_at desc);
create index if not exists pos_sales_member_idx on public.pos_sales(member_id);

alter table public.pos_sales enable row level security;

drop policy if exists "org members can view pos sales" on public.pos_sales;
create policy "org members can view pos sales"
  on public.pos_sales for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14, 3) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),
  line_total numeric(12, 2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists pos_sale_items_org_idx on public.pos_sale_items(organization_id);
create index if not exists pos_sale_items_sale_idx on public.pos_sale_items(sale_id);

alter table public.pos_sale_items enable row level security;

drop policy if exists "org members can view pos sale items" on public.pos_sale_items;
create policy "org members can view pos sale items"
  on public.pos_sale_items for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 4. Inventory: stock movements, purchases + items
-- ---------------------------------------------------------------------------

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null
    check (movement_type in ('purchase', 'sale', 'adjustment', 'return', 'consumption', 'transfer')),
  quantity numeric(14, 3) not null,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.stock_movements drop constraint if exists stock_movements_branch_org_fkey;
alter table public.stock_movements add constraint stock_movements_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists stock_movements_org_idx on public.stock_movements(organization_id, created_at desc);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id);

alter table public.stock_movements enable row level security;

drop policy if exists "org members can view stock movements" on public.stock_movements;
create policy "org members can view stock movements"
  on public.stock_movements for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_number text not null,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'received', 'cancelled')),
  order_date date not null default (timezone('utc', now()))::date,
  received_date date,
  sub_total numeric(12, 2) not null default 0 check (sub_total >= 0),
  tax_total numeric(12, 2) not null default 0 check (tax_total >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, purchase_number)
);

alter table public.purchases drop constraint if exists purchases_branch_org_fkey;
alter table public.purchases add constraint purchases_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists purchases_org_idx on public.purchases(organization_id, order_date desc);
create index if not exists purchases_supplier_idx on public.purchases(supplier_id);

alter table public.purchases enable row level security;

drop policy if exists "org members can view purchases" on public.purchases;
create policy "org members can view purchases"
  on public.purchases for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14, 3) not null default 1 check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  line_total numeric(12, 2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists purchase_items_org_idx on public.purchase_items(organization_id);
create index if not exists purchase_items_purchase_idx on public.purchase_items(purchase_id);

alter table public.purchase_items enable row level security;

drop policy if exists "org members can view purchase items" on public.purchase_items;
create policy "org members can view purchase items"
  on public.purchase_items for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 5. Finance: expenses + income
-- ---------------------------------------------------------------------------

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  category text not null,
  description text,
  amount numeric(12, 2) not null check (amount >= 0),
  expense_date date not null default (timezone('utc', now()))::date,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other')),
  status text not null default 'paid' check (status in ('pending', 'paid')),
  reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses drop constraint if exists expenses_branch_org_fkey;
alter table public.expenses add constraint expenses_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists expenses_org_idx on public.expenses(organization_id, expense_date desc);
create index if not exists expenses_category_idx on public.expenses(organization_id, category);

alter table public.expenses enable row level security;

drop policy if exists "org members can view expenses" on public.expenses;
create policy "org members can view expenses"
  on public.expenses for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.income_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  category text not null,
  description text,
  amount numeric(12, 2) not null check (amount >= 0),
  income_date date not null default (timezone('utc', now()))::date,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other')),
  reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.income_entries drop constraint if exists income_entries_branch_org_fkey;
alter table public.income_entries add constraint income_entries_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists income_entries_org_idx on public.income_entries(organization_id, income_date desc);

alter table public.income_entries enable row level security;

drop policy if exists "org members can view income entries" on public.income_entries;
create policy "org members can view income entries"
  on public.income_entries for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

-- ---------------------------------------------------------------------------
-- 6. CRM: leads, trials, follow-ups, referrals
-- ---------------------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid,
  first_name text not null,
  last_name text,
  full_name text generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored,
  email text,
  phone text,
  source text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'trial', 'converted', 'lost')),
  interest text,
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  converted_member_id uuid references public.gym_members(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads drop constraint if exists leads_branch_org_fkey;
alter table public.leads add constraint leads_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists leads_org_idx on public.leads(organization_id);
create index if not exists leads_org_status_idx on public.leads(organization_id, status);
create index if not exists leads_phone_idx on public.leads(organization_id, phone);

alter table public.leads enable row level security;

drop policy if exists "org members can view leads" on public.leads;
create policy "org members can view leads"
  on public.leads for select
  using (
    public.is_org_member(organization_id)
    and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  );

create table if not exists public.trial_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  lead_id uuid references public.leads(id) on delete set null,
  member_id uuid references public.gym_members(id) on delete set null,
  starts_on date not null default (timezone('utc', now()))::date,
  ends_on date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

alter table public.trial_memberships drop constraint if exists trial_memberships_branch_org_fkey;
alter table public.trial_memberships add constraint trial_memberships_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists trial_memberships_org_idx on public.trial_memberships(organization_id, starts_on desc);

alter table public.trial_memberships enable row level security;

drop policy if exists "org members can view trial memberships" on public.trial_memberships;
create policy "org members can view trial memberships"
  on public.trial_memberships for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid,
  lead_id uuid references public.leads(id) on delete cascade,
  member_id uuid references public.gym_members(id) on delete set null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.follow_ups drop constraint if exists follow_ups_branch_org_fkey;
alter table public.follow_ups add constraint follow_ups_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists follow_ups_org_idx on public.follow_ups(organization_id, due_at);
create index if not exists follow_ups_status_idx on public.follow_ups(organization_id, status);

alter table public.follow_ups enable row level security;

drop policy if exists "org members can view follow ups" on public.follow_ups;
create policy "org members can view follow ups"
  on public.follow_ups for select
  using (
    public.is_org_member(organization_id)
    and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  );

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  referrer_member_id uuid not null references public.gym_members(id) on delete cascade,
  referred_name text not null,
  referred_phone text,
  referred_email text,
  status text not null default 'pending' check (status in ('pending', 'converted', 'expired')),
  reward text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referrals_org_idx on public.referrals(organization_id, created_at desc);
create index if not exists referrals_referrer_idx on public.referrals(referrer_member_id);

alter table public.referrals enable row level security;

drop policy if exists "org members can view referrals" on public.referrals;
create policy "org members can view referrals"
  on public.referrals for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 7. Notifications (strictly recipient-scoped)
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'info',
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, is_read, created_at desc);
create index if not exists notifications_org_idx on public.notifications(organization_id);

alter table public.notifications enable row level security;

drop policy if exists "users can view their own notifications" on public.notifications;
create policy "users can view their own notifications"
  on public.notifications for select
  using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'public.invoices',
    'public.credit_notes',
    'public.refunds',
    'public.purchases',
    'public.expenses',
    'public.leads',
    'public.trial_memberships',
    'public.follow_ups',
    'public.referrals'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'set_updated_at' and tgrelid = t::regclass
    ) then
      execute format(
        'create trigger set_updated_at before update on %I.%I for each row execute function public.set_updated_at()',
        split_part(t, '.', 1),
        split_part(t, '.', 2)
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Audit for commerce/CRM events (dedicated function; shared trigger stays)
-- ---------------------------------------------------------------------------

create or replace function public.audit_commerce_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_action text;
  v_target_type text;
  v_target_id uuid;
  v_meta jsonb;
begin
  v_org_id := coalesce(new.organization_id, old.organization_id);
  v_target_id := coalesce(new.id, old.id);
  v_target_type := tg_table_name;
  v_meta := '{}'::jsonb;

  case tg_table_name
    when 'invoices' then
      v_meta := jsonb_build_object('invoice_number', coalesce(new.invoice_number, old.invoice_number));
      if tg_op = 'INSERT' then
        v_action := 'invoice.created';
      elsif new.status is distinct from old.status then
        v_action := 'invoice.status_changed';
      else
        v_action := 'invoice.updated';
      end if;
    when 'payments' then
      v_meta := jsonb_build_object('amount', coalesce(new.amount, old.amount));
      v_action := 'payment.recorded';
    when 'credit_notes' then
      v_meta := jsonb_build_object('credit_number', coalesce(new.credit_number, old.credit_number));
      v_action := case tg_op when 'INSERT' then 'credit_note.created' else 'credit_note.updated' end;
    when 'refunds' then
      v_meta := jsonb_build_object('amount', coalesce(new.amount, old.amount));
      if tg_op = 'INSERT' then
        v_action := 'refund.requested';
      elsif new.status is distinct from old.status then
        v_action := 'refund.status_changed';
      else
        v_action := 'refund.updated';
      end if;
    when 'pos_sales' then
      v_meta := jsonb_build_object('sale_number', coalesce(new.sale_number, old.sale_number));
      v_action := case tg_op when 'INSERT' then 'pos_sale.created' else 'pos_sale.updated' end;
    when 'purchases' then
      v_meta := jsonb_build_object('purchase_number', coalesce(new.purchase_number, old.purchase_number));
      v_action := case tg_op when 'INSERT' then 'purchase.created' else 'purchase.updated' end;
    when 'expenses' then
      v_meta := jsonb_build_object('amount', coalesce(new.amount, old.amount));
      v_action := case tg_op when 'INSERT' then 'expense.created' else 'expense.updated' end;
    when 'income_entries' then
      v_meta := jsonb_build_object('amount', coalesce(new.amount, old.amount));
      v_action := 'income.created';
    when 'leads' then
      v_meta := jsonb_build_object('name', coalesce(new.full_name, old.full_name));
      if tg_op = 'INSERT' then
        v_action := 'lead.created';
      elsif new.status is distinct from old.status then
        v_action := 'lead.status_changed';
      else
        v_action := 'lead.updated';
      end if;
    when 'trial_memberships' then
      v_action := case tg_op when 'INSERT' then 'trial.created' else 'trial.updated' end;
    when 'follow_ups' then
      v_action := case tg_op when 'INSERT' then 'follow_up.created' else 'follow_up.updated' end;
    when 'referrals' then
      v_action := case tg_op when 'INSERT' then 'referral.created' else 'referral.updated' end;
    else
      return coalesce(new, old);
  end case;

  if v_org_id is not null then
    perform public.record_audit_event(v_org_id, v_action, v_target_type, v_target_id, v_meta);
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'public.invoices',
    'public.payments',
    'public.credit_notes',
    'public.refunds',
    'public.pos_sales',
    'public.purchases',
    'public.expenses',
    'public.income_entries',
    'public.leads',
    'public.trial_memberships',
    'public.follow_ups',
    'public.referrals'
  ] loop
    execute format('drop trigger if exists audit_commerce on %I.%I', split_part(t, '.', 1), split_part(t, '.', 2));
    execute format(
      'create trigger audit_commerce after insert or update on %I.%I for each row execute function public.audit_commerce_trigger()',
      split_part(t, '.', 1),
      split_part(t, '.', 2)
    );
  end loop;
end $$;
