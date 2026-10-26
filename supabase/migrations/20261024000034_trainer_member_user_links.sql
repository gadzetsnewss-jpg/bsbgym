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

revoke all on function public.current_org_role_slug(uuid) from public, anon, authenticated;
revoke all on function public.linked_trainer_id(uuid) from public, anon, authenticated;
revoke all on function public.linked_gym_member_id(uuid) from public, anon, authenticated;
revoke all on function public.can_view_member_data(uuid, uuid) from public, anon, authenticated;

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
