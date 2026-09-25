-- =============================================================================
-- BSB FitForge - Phase 3.2: Module catalog schema
-- =============================================================================
-- Additive schema for the menu modules. It does NOT rebuild auth, roles,
-- branches, organization_members or the Phase 3.1 gym_members domain.
--
-- Catalog/reference tables (created here):
--   * trainers                  (Trainers module - referenced by gym_members)
--   * membership_plans          (Memberships > Plans)
--   * gst_rates                 (Billing > GST Master)
--   * exercises                 (Fitness > Exercises)
--   * class_templates           (Classes > Schedule)
--   * products                  (Inventory > Products, POS)
--   * suppliers                 (Inventory > Suppliers)
--
-- Security model (unchanged): every table carries organization_id, RLS is
-- enabled, reads are org-scoped (branch-scoped where a branch_id exists) via
-- the existing SECURITY DEFINER helpers, and there are NO direct write
-- policies - writes will go through SECURITY DEFINER RPCs added with each
-- module UI. organization_id is never trusted from the frontend.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trainers  (this unblocks the reserved gym_members.assigned_trainer_id)
-- ---------------------------------------------------------------------------

create table if not exists public.trainers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid,
  code text,
  first_name text not null,
  last_name text not null,
  full_name text generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored,
  email text,
  phone text,
  specialization text,
  bio text,
  hourly_rate numeric(12, 2),
  status text not null default 'active' check (status in ('active', 'inactive')),
  joined_at date not null default (timezone('utc', now()))::date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trainers drop constraint if exists trainers_branch_org_fkey;
alter table public.trainers add constraint trainers_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create unique index if not exists trainers_org_code_unique
  on public.trainers(organization_id, code)
  where code is not null;
create index if not exists trainers_org_idx on public.trainers(organization_id);
create index if not exists trainers_org_status_idx on public.trainers(organization_id, status);

alter table public.trainers enable row level security;

drop policy if exists "org members can view trainers" on public.trainers;
create policy "org members can view trainers"
  on public.trainers for select
  using (
    public.is_org_member(organization_id)
    and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  );

-- Attach the real trainer relationship reserved by Phase 3.1 (nullable).
alter table public.gym_members drop constraint if exists gym_members_assigned_trainer_fkey;
alter table public.gym_members add constraint gym_members_assigned_trainer_fkey
  foreign key (assigned_trainer_id) references public.trainers(id) on delete set null;

create index if not exists gym_members_trainer_idx on public.gym_members(assigned_trainer_id);

-- ---------------------------------------------------------------------------
-- 2. Membership plans  (Memberships > Plans)
-- ---------------------------------------------------------------------------

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  duration_days integer not null check (duration_days > 0),
  price numeric(12, 2) not null default 0 check (price >= 0),
  signup_fee numeric(12, 2) not null default 0 check (signup_fee >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),
  max_freeze_days integer not null default 0 check (max_freeze_days >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists membership_plans_org_idx on public.membership_plans(organization_id);

alter table public.membership_plans enable row level security;

drop policy if exists "org members can view membership plans" on public.membership_plans;
create policy "org members can view membership plans"
  on public.membership_plans for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 3. GST rates  (Billing > GST Master)
-- ---------------------------------------------------------------------------

create table if not exists public.gst_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  rate numeric(5, 2) not null check (rate >= 0),
  hsn_sac text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists gst_rates_org_idx on public.gst_rates(organization_id);

alter table public.gst_rates enable row level security;

drop policy if exists "org members can view gst rates" on public.gst_rates;
create policy "org members can view gst rates"
  on public.gst_rates for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 4. Exercises  (Fitness > Exercises)
-- ---------------------------------------------------------------------------

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  muscle_group text,
  equipment text,
  difficulty text check (difficulty is null or difficulty in ('beginner', 'intermediate', 'advanced')),
  instructions text,
  video_url text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists exercises_org_idx on public.exercises(organization_id);

alter table public.exercises enable row level security;

drop policy if exists "org members can view exercises" on public.exercises;
create policy "org members can view exercises"
  on public.exercises for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 5. Class templates  (Classes > Schedule)
-- ---------------------------------------------------------------------------

create table if not exists public.class_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  name text not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  capacity integer not null default 0 check (capacity >= 0),
  trainer_id uuid references public.trainers(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.class_templates drop constraint if exists class_templates_branch_org_fkey;
alter table public.class_templates add constraint class_templates_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists class_templates_org_idx on public.class_templates(organization_id);
create index if not exists class_templates_branch_idx on public.class_templates(organization_id, branch_id);

alter table public.class_templates enable row level security;

drop policy if exists "org members can view class templates" on public.class_templates;
create policy "org members can view class templates"
  on public.class_templates for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

-- ---------------------------------------------------------------------------
-- 6. Products  (Inventory > Products, POS)
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  description text,
  category text,
  unit text not null default 'pcs',
  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  sale_price numeric(12, 2) not null default 0 check (sale_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),
  track_stock boolean not null default true,
  stock_quantity numeric(14, 3) not null default 0,
  reorder_level numeric(14, 3) not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_org_sku_unique
  on public.products(organization_id, sku)
  where sku is not null;
create index if not exists products_org_idx on public.products(organization_id);

alter table public.products enable row level security;

drop policy if exists "org members can view products" on public.products;
create policy "org members can view products"
  on public.products for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 7. Suppliers  (Inventory > Suppliers)
-- ---------------------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  gstin text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_org_idx on public.suppliers(organization_id);

alter table public.suppliers enable row level security;

drop policy if exists "org members can view suppliers" on public.suppliers;
create policy "org members can view suppliers"
  on public.suppliers for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 8. updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'public.trainers',
    'public.membership_plans',
    'public.gst_rates',
    'public.exercises',
    'public.class_templates',
    'public.products',
    'public.suppliers'
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
-- 9. Audit: extend the existing trigger for module catalog writes
-- ---------------------------------------------------------------------------

create or replace function public.audit_event_trigger()
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
  case tg_table_name
    when 'organizations' then
      if tg_op = 'INSERT' then
        v_action := 'organization.created';
        v_org_id := new.id;
        v_target_type := 'organization';
        v_target_id := new.id;
        v_meta := jsonb_build_object('name', new.name);
      elsif tg_op = 'UPDATE' then
        v_action := 'organization.updated';
        v_org_id := new.id;
        v_target_type := 'organization';
        v_target_id := new.id;
        v_meta := jsonb_build_object('name', new.name);
      else
        return coalesce(new, old);
      end if;

    when 'branches' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'branch';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.name, old.name), 'code', coalesce(new.code, old.code));
      if tg_op = 'INSERT' then
        v_action := 'branch.created';
      elsif new.status is distinct from old.status then
        v_action := case when new.status = 'active' then 'branch.reactivated' else 'branch.deactivated' end;
      else
        v_action := 'branch.updated';
      end if;

    when 'invitations' then
      v_org_id := new.organization_id;
      v_target_type := 'invitation';
      v_target_id := new.id;
      v_meta := jsonb_build_object('email', new.email);
      if tg_op = 'INSERT' then
        v_action := 'invitation.created';
      elsif new.status = 'accepted' then
        v_action := 'invitation.accepted';
      elsif new.status = 'revoked' then
        v_action := 'invitation.revoked';
      elsif new.status = 'expired' then
        v_action := 'invitation.expired';
      else
        v_action := 'invitation.updated';
      end if;

    when 'organization_members' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'member';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('user_id', coalesce(new.user_id, old.user_id));
      if tg_op = 'INSERT' then
        v_action := 'member.joined';
      elsif tg_op = 'DELETE' then
        v_action := 'member.removed';
      elsif new.role_id is distinct from old.role_id then
        v_action := 'member.role_changed';
      elsif new.status is distinct from old.status then
        v_action := case when new.status = 'active' then 'member.reactivated' else 'member.status_changed' end;
      elsif new.access_all_branches is distinct from old.access_all_branches then
        v_action := 'member.branch_access_changed';
      else
        v_action := 'member.updated';
      end if;

    when 'member_branches' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'member';
      v_target_id := coalesce(new.member_id, old.member_id);
      v_meta := jsonb_build_object('branch_id', coalesce(new.branch_id, old.branch_id));
      v_action := 'member.branch_access_changed';

    when 'roles' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'role';
      v_target_id := coalesce(new.id, old.id);
      if tg_op = 'INSERT' then
        v_action := 'role.created';
      elsif new.is_active is distinct from old.is_active then
        v_action := case when new.is_active then 'role.reactivated' else 'role.deactivated' end;
      else
        v_action := 'role.updated';
      end if;

    when 'role_permissions' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'role';
      v_target_id := coalesce(new.role_id, old.role_id);
      v_meta := jsonb_build_object('permission', coalesce(new.permission, old.permission));
      v_action := case tg_op when 'INSERT' then 'role.permission_granted' else 'role.permission_revoked' end;

    when 'gym_members' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'gym_member';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('code', coalesce(new.code, old.code), 'name', coalesce(new.full_name, old.full_name));
      if tg_op = 'INSERT' then
        v_action := 'gym_member.created';
      elsif tg_op = 'DELETE' then
        v_action := 'gym_member.removed';
      elsif new.status is distinct from old.status then
        v_action := case
          when new.status = 'active' then 'gym_member.reactivated'
          when new.status = 'inactive' then 'gym_member.deactivated'
          when new.status = 'suspended' then 'gym_member.suspended'
          else 'gym_member.status_changed'
        end;
      else
        v_action := 'gym_member.updated';
      end if;

    when 'trainers' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'trainer';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.full_name, old.full_name));
      if tg_op = 'INSERT' then
        v_action := 'trainer.created';
      elsif new.status is distinct from old.status then
        v_action := case when new.status = 'active' then 'trainer.reactivated' else 'trainer.deactivated' end;
      else
        v_action := 'trainer.updated';
      end if;

    when 'membership_plans' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'membership_plan';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.name, old.name));
      v_action := case tg_op when 'INSERT' then 'membership_plan.created' else 'membership_plan.updated' end;

    when 'products' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'product';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.name, old.name));
      v_action := case tg_op when 'INSERT' then 'product.created' else 'product.updated' end;

    when 'suppliers' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'supplier';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.name, old.name));
      v_action := case tg_op when 'INSERT' then 'supplier.created' else 'supplier.updated' end;

    else
      return coalesce(new, old);
  end case;

  if v_org_id is not null then
    perform public.record_audit_event(v_org_id, v_action, v_target_type, v_target_id, v_meta);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_trainers on public.trainers;
create trigger audit_trainers
  after insert or update on public.trainers
  for each row execute function public.audit_event_trigger();

drop trigger if exists audit_membership_plans on public.membership_plans;
create trigger audit_membership_plans
  after insert or update on public.membership_plans
  for each row execute function public.audit_event_trigger();

drop trigger if exists audit_products on public.products;
create trigger audit_products
  after insert or update on public.products
  for each row execute function public.audit_event_trigger();

drop trigger if exists audit_suppliers on public.suppliers;
create trigger audit_suppliers
  after insert or update on public.suppliers
  for each row execute function public.audit_event_trigger();
