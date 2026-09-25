-- =============================================================================
-- BSB FitForge - Phase 3.2a: Catalog module write path
-- =============================================================================
-- Additive migration on top of 20260914000009 (catalog tables). The catalog
-- tables currently have select-only RLS, so this migration adds the
-- SECURITY DEFINER write path used by the shared CRUD screens:
--
--   * trainers            (Trainers)
--   * membership_plans    (Memberships > Plans)
--   * gst_rates           (Billing > GST Master)
--   * exercises           (Fitness > Exercises)
--   * class_templates     (Classes > Schedule)
--   * products            (Inventory > Products, POS)
--   * suppliers           (Inventory > Suppliers)
--
-- Conventions (unchanged from Phase 3.1):
--   * every mutation re-checks auth.uid(), org membership, an explicit
--     permission and (where branch-scoped) branch access;
--   * `organization_id` is derived server-side for updates - never trusted
--     from the client;
--   * deactivation is soft (boolean / status); no hard deletes;
--   * friendly validation messages so the UI can map them safely.
--
-- It also introduces the `fitness` permission group (Fitness module) and
-- backfills it for existing organizations, additively - the RBAC model itself
-- is not replaced.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fitness permission group (additive to the Phase 1.2 seed)
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

  -- Owner and Admin: every permission. Owner additionally owns
  -- `organization.manage` (organization settings are owner-managed).
  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(v_all) as p(permission)
  where r.organization_id = p_org_id and r.slug in ('owner', 'admin')
    and not (r.slug = 'admin' and p.permission = 'organization.manage')
  on conflict (role_id, permission) do nothing;

  -- Manager: operational management - members, memberships, billing,
  -- payments, attendance, trainers, fitness, classes, POS, inventory and CRM.
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

  -- Staff: member registration, membership sales, payments, attendance,
  -- leads and basic POS.
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

  -- Receptionist: front desk and member intake.
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

  -- Trainer: assigned members, workout/diet/measurements/progress, PT
  -- sessions and classes. Deliberately no billing, GST, finance, reports,
  -- staff or organization permissions.
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

  -- Accountant: billing, GST, payments, finance and reports.
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
end;
$$;

revoke all on function public.seed_default_role_permissions(uuid) from public, anon, authenticated;

-- Backfill existing organizations (insert-only, custom edits preserved).
do $$
declare
  v_org uuid;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_default_role_permissions(v_org);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Trainers
-- ---------------------------------------------------------------------------

create or replace function public.create_trainer(
  p_org_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_code text,
  p_email text,
  p_phone text,
  p_specialization text,
  p_bio text,
  p_hourly_rate numeric,
  p_joined_at date
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
  v_code text;
  v_email text;
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
  if not public.user_has_permission(p_org_id, 'trainers.create') then
    raise exception 'insufficient privileges';
  end if;
  if p_branch_id is not null then
    if not exists (
      select 1 from public.branches b
      where b.id = p_branch_id and b.organization_id = p_org_id
    ) then
      raise exception 'branch not found';
    end if;
    if not public.user_has_branch_access(p_org_id, p_branch_id) then
      raise exception 'insufficient privileges';
    end if;
  end if;

  v_first := trim(p_first_name);
  v_last := trim(p_last_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  if v_last is null or v_last = '' then
    raise exception 'last name is required';
  end if;

  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  if p_hourly_rate is not null and p_hourly_rate < 0 then
    raise exception 'hourly rate cannot be negative';
  end if;

  v_code := nullif(upper(trim(p_code)), '');
  if v_code is not null and exists (
    select 1 from public.trainers t
    where t.organization_id = p_org_id and t.code = v_code
  ) then
    raise exception 'trainer code already exists';
  end if;

  insert into public.trainers (
    organization_id, branch_id, code, first_name, last_name, email, phone,
    specialization, bio, hourly_rate, status, joined_at, created_by
  )
  values (
    p_org_id, p_branch_id, v_code, v_first, v_last, v_email,
    nullif(trim(p_phone), ''), nullif(trim(p_specialization), ''),
    nullif(trim(p_bio), ''), p_hourly_rate, 'active',
    coalesce(p_joined_at, (timezone('utc', now()))::date), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_trainer(
  uuid, uuid, text, text, text, text, text, text, text, numeric, date
) to authenticated;

create or replace function public.update_trainer(
  p_trainer_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_code text,
  p_email text,
  p_phone text,
  p_specialization text,
  p_bio text,
  p_hourly_rate numeric,
  p_joined_at date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_first text;
  v_last text;
  v_code text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id into v_org_id
  from public.trainers where id = p_trainer_id;
  if v_org_id is null then
    raise exception 'trainer not found';
  end if;
  if not public.user_has_permission(v_org_id, 'trainers.edit') then
    raise exception 'insufficient privileges';
  end if;
  if p_branch_id is not null then
    if not exists (
      select 1 from public.branches b
      where b.id = p_branch_id and b.organization_id = v_org_id
    ) then
      raise exception 'branch not found';
    end if;
    if not public.user_has_branch_access(v_org_id, p_branch_id) then
      raise exception 'insufficient privileges';
    end if;
  end if;

  v_first := trim(p_first_name);
  v_last := trim(p_last_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  if v_last is null or v_last = '' then
    raise exception 'last name is required';
  end if;

  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  if p_hourly_rate is not null and p_hourly_rate < 0 then
    raise exception 'hourly rate cannot be negative';
  end if;

  v_code := nullif(upper(trim(p_code)), '');
  if v_code is not null and exists (
    select 1 from public.trainers t
    where t.organization_id = v_org_id and t.code = v_code and t.id <> p_trainer_id
  ) then
    raise exception 'trainer code already exists';
  end if;

  update public.trainers set
    branch_id = p_branch_id,
    code = v_code,
    first_name = v_first,
    last_name = v_last,
    email = v_email,
    phone = nullif(trim(p_phone), ''),
    specialization = nullif(trim(p_specialization), ''),
    bio = nullif(trim(p_bio), ''),
    hourly_rate = p_hourly_rate,
    joined_at = coalesce(p_joined_at, joined_at)
  where id = p_trainer_id;
end;
$$;

grant execute on function public.update_trainer(
  uuid, uuid, text, text, text, text, text, text, text, numeric, date
) to authenticated;

create or replace function public.set_trainer_status(
  p_trainer_id uuid,
  p_active boolean
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
  select organization_id into v_org_id
  from public.trainers where id = p_trainer_id;
  if v_org_id is null then
    raise exception 'trainer not found';
  end if;
  if not public.user_has_permission(v_org_id, 'trainers.edit') then
    raise exception 'insufficient privileges';
  end if;

  update public.trainers
  set status = case when p_active then 'active' else 'inactive' end
  where id = p_trainer_id;
end;
$$;

grant execute on function public.set_trainer_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Membership plans
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_plan(
  p_org_id uuid,
  p_name text,
  p_code text,
  p_description text,
  p_duration_days integer,
  p_price numeric,
  p_signup_fee numeric,
  p_tax_rate numeric,
  p_max_freeze_days integer,
  p_sort_order integer,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_code text;
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
  if not public.user_has_permission(p_org_id, 'memberships.create') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;
  v_code := nullif(upper(trim(p_code)), '');
  if v_code is null then
    raise exception 'plan code is required';
  end if;
  if exists (
    select 1 from public.membership_plans p
    where p.organization_id = p_org_id and p.code = v_code
  ) then
    raise exception 'plan code already exists';
  end if;
  if p_duration_days is null or p_duration_days <= 0 then
    raise exception 'duration must be greater than zero';
  end if;
  if coalesce(p_price, 0) < 0 or coalesce(p_signup_fee, 0) < 0
     or coalesce(p_tax_rate, 0) < 0 or coalesce(p_max_freeze_days, 0) < 0 then
    raise exception 'amounts cannot be negative';
  end if;

  insert into public.membership_plans (
    organization_id, name, code, description, duration_days, price,
    signup_fee, tax_rate, max_freeze_days, is_active, sort_order, created_by
  )
  values (
    p_org_id, v_name, v_code, nullif(trim(p_description), ''),
    p_duration_days, coalesce(p_price, 0), coalesce(p_signup_fee, 0),
    coalesce(p_tax_rate, 0), coalesce(p_max_freeze_days, 0),
    coalesce(p_is_active, true), coalesce(p_sort_order, 0), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_membership_plan(
  uuid, text, text, text, integer, numeric, numeric, numeric, integer, integer, boolean
) to authenticated;

create or replace function public.update_membership_plan(
  p_plan_id uuid,
  p_name text,
  p_code text,
  p_description text,
  p_duration_days integer,
  p_price numeric,
  p_signup_fee numeric,
  p_tax_rate numeric,
  p_max_freeze_days integer,
  p_sort_order integer,
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
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.membership_plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan not found';
  end if;
  if not public.user_has_permission(v_org_id, 'memberships.update') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;
  v_code := nullif(upper(trim(p_code)), '');
  if v_code is null then
    raise exception 'plan code is required';
  end if;
  if exists (
    select 1 from public.membership_plans p
    where p.organization_id = v_org_id and p.code = v_code and p.id <> p_plan_id
  ) then
    raise exception 'plan code already exists';
  end if;
  if p_duration_days is null or p_duration_days <= 0 then
    raise exception 'duration must be greater than zero';
  end if;
  if coalesce(p_price, 0) < 0 or coalesce(p_signup_fee, 0) < 0
     or coalesce(p_tax_rate, 0) < 0 or coalesce(p_max_freeze_days, 0) < 0 then
    raise exception 'amounts cannot be negative';
  end if;

  update public.membership_plans set
    name = v_name,
    code = v_code,
    description = nullif(trim(p_description), ''),
    duration_days = p_duration_days,
    price = coalesce(p_price, 0),
    signup_fee = coalesce(p_signup_fee, 0),
    tax_rate = coalesce(p_tax_rate, 0),
    max_freeze_days = coalesce(p_max_freeze_days, 0),
    is_active = coalesce(p_is_active, true),
    sort_order = coalesce(p_sort_order, 0)
  where id = p_plan_id;
end;
$$;

grant execute on function public.update_membership_plan(
  uuid, text, text, text, integer, numeric, numeric, numeric, integer, integer, boolean
) to authenticated;

create or replace function public.set_membership_plan_status(
  p_plan_id uuid,
  p_active boolean
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
  select organization_id into v_org_id
  from public.membership_plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan not found';
  end if;
  if not public.user_has_permission(v_org_id, 'memberships.update') then
    raise exception 'insufficient privileges';
  end if;

  update public.membership_plans
  set is_active = coalesce(p_active, false)
  where id = p_plan_id;
end;
$$;

grant execute on function public.set_membership_plan_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. GST rates
-- ---------------------------------------------------------------------------

create or replace function public.create_gst_rate(
  p_org_id uuid,
  p_name text,
  p_rate numeric,
  p_hsn_sac text,
  p_is_default boolean,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
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
  if not public.user_has_permission(p_org_id, 'gst.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'gst rate name is required';
  end if;
  if exists (
    select 1 from public.gst_rates g
    where g.organization_id = p_org_id and lower(g.name) = lower(v_name)
  ) then
    raise exception 'gst rate name already exists';
  end if;
  if p_rate is null or p_rate < 0 then
    raise exception 'gst rate cannot be negative';
  end if;

  if coalesce(p_is_default, false) then
    update public.gst_rates set is_default = false
    where organization_id = p_org_id and is_default;
  end if;

  insert into public.gst_rates (
    organization_id, name, rate, hsn_sac, is_default, is_active, created_by
  )
  values (
    p_org_id, v_name, p_rate, nullif(trim(p_hsn_sac), ''),
    coalesce(p_is_default, false), coalesce(p_is_active, true), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_gst_rate(uuid, text, numeric, text, boolean, boolean) to authenticated;

create or replace function public.update_gst_rate(
  p_rate_id uuid,
  p_name text,
  p_rate numeric,
  p_hsn_sac text,
  p_is_default boolean,
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.gst_rates where id = p_rate_id;
  if v_org_id is null then
    raise exception 'gst rate not found';
  end if;
  if not public.user_has_permission(v_org_id, 'gst.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'gst rate name is required';
  end if;
  if exists (
    select 1 from public.gst_rates g
    where g.organization_id = v_org_id
      and lower(g.name) = lower(v_name)
      and g.id <> p_rate_id
  ) then
    raise exception 'gst rate name already exists';
  end if;
  if p_rate is null or p_rate < 0 then
    raise exception 'gst rate cannot be negative';
  end if;

  if coalesce(p_is_default, false) then
    update public.gst_rates set is_default = false
    where organization_id = v_org_id and is_default and id <> p_rate_id;
  end if;

  update public.gst_rates set
    name = v_name,
    rate = p_rate,
    hsn_sac = nullif(trim(p_hsn_sac), ''),
    is_default = coalesce(p_is_default, false),
    is_active = coalesce(p_is_active, true)
  where id = p_rate_id;
end;
$$;

grant execute on function public.update_gst_rate(uuid, text, numeric, text, boolean, boolean) to authenticated;

create or replace function public.set_gst_rate_status(
  p_rate_id uuid,
  p_active boolean
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
  select organization_id into v_org_id
  from public.gst_rates where id = p_rate_id;
  if v_org_id is null then
    raise exception 'gst rate not found';
  end if;
  if not public.user_has_permission(v_org_id, 'gst.manage') then
    raise exception 'insufficient privileges';
  end if;

  update public.gst_rates
  set is_active = coalesce(p_active, false)
  where id = p_rate_id;
end;
$$;

grant execute on function public.set_gst_rate_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Exercises
-- ---------------------------------------------------------------------------

create or replace function public.create_exercise(
  p_org_id uuid,
  p_name text,
  p_category text,
  p_muscle_group text,
  p_equipment text,
  p_difficulty text,
  p_instructions text,
  p_video_url text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_difficulty text;
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
  if not public.user_has_permission(p_org_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'exercise name is required';
  end if;
  if exists (
    select 1 from public.exercises e
    where e.organization_id = p_org_id and lower(e.name) = lower(v_name)
  ) then
    raise exception 'exercise name already exists';
  end if;

  v_difficulty := nullif(lower(trim(p_difficulty)), '');
  if v_difficulty is not null and v_difficulty not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'difficulty is invalid';
  end if;

  insert into public.exercises (
    organization_id, name, category, muscle_group, equipment, difficulty,
    instructions, video_url, is_active, created_by
  )
  values (
    p_org_id, v_name, nullif(trim(p_category), ''), nullif(trim(p_muscle_group), ''),
    nullif(trim(p_equipment), ''), v_difficulty, nullif(trim(p_instructions), ''),
    nullif(trim(p_video_url), ''), coalesce(p_is_active, true), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_exercise(uuid, text, text, text, text, text, text, text, boolean) to authenticated;

create or replace function public.update_exercise(
  p_exercise_id uuid,
  p_name text,
  p_category text,
  p_muscle_group text,
  p_equipment text,
  p_difficulty text,
  p_instructions text,
  p_video_url text,
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
  v_difficulty text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.exercises where id = p_exercise_id;
  if v_org_id is null then
    raise exception 'exercise not found';
  end if;
  if not public.user_has_permission(v_org_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'exercise name is required';
  end if;
  if exists (
    select 1 from public.exercises e
    where e.organization_id = v_org_id
      and lower(e.name) = lower(v_name)
      and e.id <> p_exercise_id
  ) then
    raise exception 'exercise name already exists';
  end if;

  v_difficulty := nullif(lower(trim(p_difficulty)), '');
  if v_difficulty is not null and v_difficulty not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'difficulty is invalid';
  end if;

  update public.exercises set
    name = v_name,
    category = nullif(trim(p_category), ''),
    muscle_group = nullif(trim(p_muscle_group), ''),
    equipment = nullif(trim(p_equipment), ''),
    difficulty = v_difficulty,
    instructions = nullif(trim(p_instructions), ''),
    video_url = nullif(trim(p_video_url), ''),
    is_active = coalesce(p_is_active, true)
  where id = p_exercise_id;
end;
$$;

grant execute on function public.update_exercise(uuid, text, text, text, text, text, text, text, boolean) to authenticated;

create or replace function public.set_exercise_status(
  p_exercise_id uuid,
  p_active boolean
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
  select organization_id into v_org_id
  from public.exercises where id = p_exercise_id;
  if v_org_id is null then
    raise exception 'exercise not found';
  end if;
  if not public.user_has_permission(v_org_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  end if;

  update public.exercises
  set is_active = coalesce(p_active, false)
  where id = p_exercise_id;
end;
$$;

grant execute on function public.set_exercise_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Class templates (branch-scoped)
-- ---------------------------------------------------------------------------

create or replace function public.create_class_template(
  p_org_id uuid,
  p_branch_id uuid,
  p_name text,
  p_description text,
  p_duration_minutes integer,
  p_capacity integer,
  p_trainer_id uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
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
  if not public.user_has_permission(p_org_id, 'classes.manage') then
    raise exception 'insufficient privileges';
  end if;
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

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'class name is required';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'duration must be greater than zero';
  end if;
  if coalesce(p_capacity, 0) < 0 then
    raise exception 'capacity cannot be negative';
  end if;
  if p_trainer_id is not null and not exists (
    select 1 from public.trainers t
    where t.id = p_trainer_id and t.organization_id = p_org_id
  ) then
    raise exception 'trainer not found';
  end if;

  insert into public.class_templates (
    organization_id, branch_id, name, description, duration_minutes,
    capacity, trainer_id, is_active, created_by
  )
  values (
    p_org_id, p_branch_id, v_name, nullif(trim(p_description), ''),
    p_duration_minutes, coalesce(p_capacity, 0), p_trainer_id,
    coalesce(p_is_active, true), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_class_template(
  uuid, uuid, text, text, integer, integer, uuid, boolean
) to authenticated;

create or replace function public.update_class_template(
  p_template_id uuid,
  p_branch_id uuid,
  p_name text,
  p_description text,
  p_duration_minutes integer,
  p_capacity integer,
  p_trainer_id uuid,
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.class_templates where id = p_template_id;
  if v_org_id is null then
    raise exception 'class not found';
  end if;
  if not public.user_has_permission(v_org_id, 'classes.manage') then
    raise exception 'insufficient privileges';
  end if;
  if p_branch_id is null then
    raise exception 'branch is required';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id and b.organization_id = v_org_id
  ) then
    raise exception 'branch not found';
  end if;
  if not public.user_has_branch_access(v_org_id, p_branch_id) then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'class name is required';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'duration must be greater than zero';
  end if;
  if coalesce(p_capacity, 0) < 0 then
    raise exception 'capacity cannot be negative';
  end if;
  if p_trainer_id is not null and not exists (
    select 1 from public.trainers t
    where t.id = p_trainer_id and t.organization_id = v_org_id
  ) then
    raise exception 'trainer not found';
  end if;

  update public.class_templates set
    branch_id = p_branch_id,
    name = v_name,
    description = nullif(trim(p_description), ''),
    duration_minutes = p_duration_minutes,
    capacity = coalesce(p_capacity, 0),
    trainer_id = p_trainer_id,
    is_active = coalesce(p_is_active, true)
  where id = p_template_id;
end;
$$;

grant execute on function public.update_class_template(
  uuid, uuid, text, text, integer, integer, uuid, boolean
) to authenticated;

create or replace function public.set_class_template_status(
  p_template_id uuid,
  p_active boolean
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
  select organization_id into v_org_id
  from public.class_templates where id = p_template_id;
  if v_org_id is null then
    raise exception 'class not found';
  end if;
  if not public.user_has_permission(v_org_id, 'classes.manage') then
    raise exception 'insufficient privileges';
  end if;

  update public.class_templates
  set is_active = coalesce(p_active, false)
  where id = p_template_id;
end;
$$;

grant execute on function public.set_class_template_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Products
-- ---------------------------------------------------------------------------

create or replace function public.create_product(
  p_org_id uuid,
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
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_sku text;
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
  if not public.user_has_permission(p_org_id, 'inventory.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'product name is required';
  end if;
  v_sku := nullif(upper(trim(p_sku)), '');
  if v_sku is not null and exists (
    select 1 from public.products p
    where p.organization_id = p_org_id and p.sku = v_sku
  ) then
    raise exception 'product sku already exists';
  end if;
  if coalesce(p_cost_price, 0) < 0 or coalesce(p_sale_price, 0) < 0
     or coalesce(p_tax_rate, 0) < 0 then
    raise exception 'amounts cannot be negative';
  end if;
  if coalesce(p_stock_quantity, 0) < 0 or coalesce(p_reorder_level, 0) < 0 then
    raise exception 'stock values cannot be negative';
  end if;

  insert into public.products (
    organization_id, name, sku, description, category, unit, cost_price,
    sale_price, tax_rate, track_stock, stock_quantity, reorder_level,
    is_active, created_by
  )
  values (
    p_org_id, v_name, v_sku, nullif(trim(p_description), ''),
    nullif(trim(p_category), ''), coalesce(nullif(trim(p_unit), ''), 'pcs'),
    coalesce(p_cost_price, 0), coalesce(p_sale_price, 0), coalesce(p_tax_rate, 0),
    coalesce(p_track_stock, true), coalesce(p_stock_quantity, 0),
    coalesce(p_reorder_level, 0), coalesce(p_is_active, true), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_product(
  uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, numeric, numeric, boolean
) to authenticated;

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
  if coalesce(p_stock_quantity, 0) < 0 or coalesce(p_reorder_level, 0) < 0 then
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
    stock_quantity = coalesce(p_stock_quantity, 0),
    reorder_level = coalesce(p_reorder_level, 0),
    is_active = coalesce(p_is_active, true)
  where id = p_product_id;
end;
$$;

grant execute on function public.update_product(
  uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, numeric, numeric, boolean
) to authenticated;

create or replace function public.set_product_status(
  p_product_id uuid,
  p_active boolean
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
  select organization_id into v_org_id
  from public.products where id = p_product_id;
  if v_org_id is null then
    raise exception 'product not found';
  end if;
  if not public.user_has_permission(v_org_id, 'inventory.manage') then
    raise exception 'insufficient privileges';
  end if;

  update public.products
  set is_active = coalesce(p_active, false)
  where id = p_product_id;
end;
$$;

grant execute on function public.set_product_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Suppliers
-- ---------------------------------------------------------------------------

create or replace function public.create_supplier(
  p_org_id uuid,
  p_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_gstin text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_notes text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_email text;
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
  if not public.user_has_permission(p_org_id, 'inventory.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'supplier name is required';
  end if;
  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  insert into public.suppliers (
    organization_id, name, contact_name, email, phone, gstin,
    address_line1, address_line2, city, state, postal_code, country,
    notes, is_active, created_by
  )
  values (
    p_org_id, v_name, nullif(trim(p_contact_name), ''), v_email,
    nullif(trim(p_phone), ''), nullif(upper(trim(p_gstin)), ''),
    nullif(trim(p_address_line1), ''), nullif(trim(p_address_line2), ''),
    nullif(trim(p_city), ''), nullif(trim(p_state), ''),
    nullif(trim(p_postal_code), ''), nullif(trim(p_country), ''),
    nullif(trim(p_notes), ''), coalesce(p_is_active, true), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_supplier(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, boolean
) to authenticated;

create or replace function public.update_supplier(
  p_supplier_id uuid,
  p_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_gstin text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_notes text,
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
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.suppliers where id = p_supplier_id;
  if v_org_id is null then
    raise exception 'supplier not found';
  end if;
  if not public.user_has_permission(v_org_id, 'inventory.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'supplier name is required';
  end if;
  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  update public.suppliers set
    name = v_name,
    contact_name = nullif(trim(p_contact_name), ''),
    email = v_email,
    phone = nullif(trim(p_phone), ''),
    gstin = nullif(upper(trim(p_gstin)), ''),
    address_line1 = nullif(trim(p_address_line1), ''),
    address_line2 = nullif(trim(p_address_line2), ''),
    city = nullif(trim(p_city), ''),
    state = nullif(trim(p_state), ''),
    postal_code = nullif(trim(p_postal_code), ''),
    country = nullif(trim(p_country), ''),
    notes = nullif(trim(p_notes), ''),
    is_active = coalesce(p_is_active, true)
  where id = p_supplier_id;
end;
$$;

grant execute on function public.update_supplier(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, boolean
) to authenticated;

create or replace function public.set_supplier_status(
  p_supplier_id uuid,
  p_active boolean
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
  select organization_id into v_org_id
  from public.suppliers where id = p_supplier_id;
  if v_org_id is null then
    raise exception 'supplier not found';
  end if;
  if not public.user_has_permission(v_org_id, 'inventory.manage') then
    raise exception 'insufficient privileges';
  end if;

  update public.suppliers
  set is_active = coalesce(p_active, false)
  where id = p_supplier_id;
end;
$$;

grant execute on function public.set_supplier_status(uuid, boolean) to authenticated;
