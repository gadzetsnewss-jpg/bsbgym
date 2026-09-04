-- =============================================================================
-- BSB FitForge - Phase 1.2: Authentication + RBAC + Multi-tenant security
-- =============================================================================
-- Additive hardening on top of the Phase 3 + Phase 1.1 schema. It does NOT
-- rebuild anything. It:
--
--   1. Tightens the `branches` select policy so org members can only view
--      branches they are actually authorized for (belong to the organization
--      AND have branch access). Previously any org member could read every
--      branch row in the organization.
--   2. Adds composite FKs on `member_branches` and `invitation_branches`
--      guaranteeing a branch row always belongs to its `organization_id`
--      (a member/invitation can never be granted a branch of another org).
--   3. Defines the full Phase 1.2 permission catalogue and a SECURITY DEFINER
--      `seed_default_role_permissions(p_org_id)` function that seeds the five
--      default roles (owner/admin/manager/staff) plus the configurable
--      receptionist/trainer/accountant defaults from the spec.
--   4. Re-uses the seed function inside `create_organization` so NEW
--      organizations get the full catalogue, and backfills EXISTING
--      organizations (insert-only, so no custom role edits are lost).
--
-- Branch access model (spec's `user_branch_access`): the existing
-- `member_branches` (+ `organization_members.access_all_branches`) already
-- implements user <-> org <-> branch access validated against the
-- organization, so a separate `user_branch_access` table is intentionally NOT
-- created to avoid two sources of truth. `user_has_branch_access()` (Phase
-- 1.1) is the RLS boundary.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS hardening: branches are only visible to authorized members
-- ---------------------------------------------------------------------------

drop policy if exists "org members can view branches" on public.branches;

-- Overload of `user_has_branch_access` that derives nothing from the branch
-- row itself: it is driven entirely by the row's `organization_id` and `id`
-- column values (passed in from the policy expression). Unlike the single-arg
-- variant it does NOT self-join `branches`, so it stays correct when the RLS
-- SELECT policy is re-checked against the returned row of an
-- `INSERT ... RETURNING` (the newly inserted row is not yet visible to a
-- self-referencing subquery, which previously caused spurious RLS rejections).
create or replace function public.user_has_branch_access(p_org_id uuid, p_branch_id uuid)
  returns boolean
  language sql
  stable security definer
  set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        m.access_all_branches
        or exists (
          select 1
          from public.member_branches mb
          where mb.member_id = m.id
            and mb.branch_id = p_branch_id
        )
      )
  );
$function$;

grant execute on function public.user_has_branch_access(uuid, uuid) to authenticated;

create policy "org members can view authorized branches"
  on public.branches for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, id)
  );

-- ---------------------------------------------------------------------------
-- 2. Composite FKs: branch rows must belong to the same organization
-- ---------------------------------------------------------------------------

alter table public.member_branches
  drop constraint if exists member_branches_branch_id_fkey;
alter table public.member_branches
  add constraint member_branches_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

alter table public.invitation_branches
  drop constraint if exists invitation_branches_branch_id_fkey;
alter table public.invitation_branches
  add constraint invitation_branches_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

-- ---------------------------------------------------------------------------
-- 3. Phase 1.2 permission catalogue + default role seed
--    The permission catalogue is the full set the application references
--    (src/lib/auth/permissions.ts mirrors it). Roles are seeded per
--    organization and remain database-driven.
-- ---------------------------------------------------------------------------

-- Internal helper: seeds the default roles' permissions for an organization.
-- SECURITY DEFINER so RLS cannot block it when called from create_organization
-- or the backfill; NOT granted to anon/authenticated (it is never callable
-- through PostgREST). Insert-only (on conflict do nothing) so admin-customised
-- roles and extra permissions are preserved on backfill.
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
  -- payments, attendance, trainers, classes, POS, inventory and CRM.
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

-- Internal helper: not callable by the application.
revoke all on function public.seed_default_role_permissions(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_organization: seed the full catalogue for new organizations
--    (signature unchanged - the existing grant stays valid).
-- ---------------------------------------------------------------------------

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

  insert into public.organizations (
    name, legal_name, business_type, email, phone, website,
    address_line1, address_line2, city, state, postal_code, country, tax_id,
    currency, timezone, date_format, logo_url, status, created_by
  )
  values (
    trim(p_name),
    nullif(trim(p_legal_name), ''),
    p_business_type,
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
    p_currency,
    p_timezone,
    p_date_format,
    p_logo_url,
    'active',
    auth.uid()
  )
  returning id into v_org_id;

  -- Configurable default roles. owner/admin/manager/staff are protected system
  -- roles; receptionist/trainer/accountant are editable, non-system defaults.
  insert into public.roles (organization_id, name, slug, description, is_system, is_active)
  values
    (v_org_id, 'Owner', 'owner', 'Full ownership access to the organization', true, true),
    (v_org_id, 'Admin', 'admin', 'Manages the organization and its settings', true, true),
    (v_org_id, 'Manager', 'manager', 'Runs day-to-day operations at assigned branches', true, true),
    (v_org_id, 'Staff', 'staff', 'Front desk and operations staff', true, true),
    (v_org_id, 'Receptionist', 'receptionist', 'Handles front desk check-ins and member intake', false, true),
    (v_org_id, 'Trainer', 'trainer', 'Delivers training sessions and tracks attendance', false, true),
    (v_org_id, 'Accountant', 'accountant', 'Handles billing, refunds and financial reports', false, true);

  -- Seed the full Phase 1.2 permission catalogue for the default roles.
  perform public.seed_default_role_permissions(v_org_id);

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
    p_branch_timezone,
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
-- 5. Backfill existing organizations with the Phase 1.2 permission catalogue
--    (insert-only: existing custom role permissions are preserved).
-- ---------------------------------------------------------------------------

do $$
declare
  v_org uuid;
begin
  for v_org in
    select id from public.organizations
  loop
    perform public.seed_default_role_permissions(v_org);
  end loop;
end $$;
