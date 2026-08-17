-- =============================================================================
-- BSB FitForge - Phase 3 Part 2: Dynamic RBAC, role management & audit logging
-- =============================================================================
-- Extends the Phase 2 RBAC schema (roles, role_permissions, organization_members,
-- member_branches) with:
--   * granular permissions (members.create/update/delete/export, billing.refund,
--     reports.export, roles.view/manage, ...) replacing the coarse *.manage rows
--   * configurable default roles (owner/admin/manager/staff + receptionist /
--     trainer / accountant seeded as editable, non-system records)
--   * role lifecycle RPCs (create/update/deactivate/assign permissions) with a
--     privilege-escalation guard: nobody may grant a permission they do not hold
--   * role assignment hardening (only the owner can assign owner/admin; roles
--     that are deactivated cannot be assigned or invited)
--   * an audit_logs table + SECURITY DEFINER helper + database triggers that
--     record org/invitation/member/role/permission/branch events. Passwords,
--     tokens and invitation secrets are NEVER written to the audit log.
--
-- Security model (unchanged principle): RLS is the final enforcement layer and
-- role/role_permission writes now go exclusively through SECURITY DEFINER RPCs
-- (the direct admin write policies are dropped below so the escalation guard
-- cannot be bypassed through the REST API).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Roles: add an active flag so roles can be deactivated (not deleted).
-- ---------------------------------------------------------------------------

alter table public.roles add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Audit logging
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_idx on public.audit_logs(organization_id, created_at desc);

alter table public.audit_logs enable row level security;

-- Org members may read their own organization's audit trail. Writes happen
-- exclusively through record_audit_event() (SECURITY DEFINER), so there are no
-- insert/update/delete policies - direct writes by anon/authenticated are
-- rejected by RLS.
create policy "org members can view audit logs"
  on public.audit_logs for select
  using (public.is_org_member(organization_id));

-- Internal helper. SECURITY DEFINER so the audit triggers can write even though
-- audit_logs has RLS enabled. Deliberately NOT granted to anon/authenticated:
-- only the SECURITY DEFINER RPCs and triggers may record events, which prevents
-- callers from forging audit entries through the REST API. When there is no
-- authenticated request context (e.g. a one-time data migration running outside
-- a JWT session) the event is skipped rather than raising, so migration-time
-- backfills do not fail and cannot be attributed to a user.
create or replace function public.record_audit_event(
  p_org_id uuid,
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_org_id is null or nullif(trim(p_action), '') is null then
    return;
  end if;
  insert into public.audit_logs (
    organization_id, actor_id, action, target_type, target_id, metadata
  )
  values (
    p_org_id, auth.uid(), p_action, p_target_type, p_target_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- Generic audit trigger: maps every audited write to a single event row.
-- Only columns that exist on the fired table are referenced per branch.
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
      else
        return coalesce(new, old);
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

    else
      return coalesce(new, old);
  end case;

  if v_org_id is not null then
    perform public.record_audit_event(v_org_id, v_action, v_target_type, v_target_id, v_meta);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger audit_organizations
  after insert on public.organizations
  for each row execute function public.audit_event_trigger();

create trigger audit_invitations
  after insert or update on public.invitations
  for each row execute function public.audit_event_trigger();

create trigger audit_organization_members
  after insert or update or delete on public.organization_members
  for each row execute function public.audit_event_trigger();

create trigger audit_member_branches
  after insert or update or delete on public.member_branches
  for each row execute function public.audit_event_trigger();

create trigger audit_roles
  after insert or update on public.roles
  for each row execute function public.audit_event_trigger();

create trigger audit_role_permissions
  after insert or delete on public.role_permissions
  for each row execute function public.audit_event_trigger();

-- ---------------------------------------------------------------------------
-- 3. Migrate existing coarse permissions to the granular model.
--    Old *.manage rows are replaced by their granular equivalents so no
--    permission is lost for organizations created before this migration.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (organization_id, role_id, permission)
select rp.organization_id, rp.role_id, g.granular
from public.role_permissions rp
cross join (
  values
    ('members.manage', 'members.view'),
    ('members.manage', 'members.create'),
    ('members.manage', 'members.update'),
    ('members.manage', 'members.delete'),
    ('members.manage', 'members.export'),
    ('memberships.manage', 'memberships.view'),
    ('memberships.manage', 'memberships.create'),
    ('memberships.manage', 'memberships.update'),
    ('billing.manage', 'billing.view'),
    ('billing.manage', 'billing.create'),
    ('billing.manage', 'billing.refund'),
    ('billing.manage', 'billing.export'),
    ('attendance.manage', 'attendance.view'),
    ('attendance.manage', 'attendance.create'),
    ('users.manage', 'users.view'),
    ('branches.manage', 'branches.view')
) as g(coarse, granular)
where rp.permission = g.coarse
on conflict (role_id, permission) do nothing;

delete from public.role_permissions
where permission in ('members.manage', 'memberships.manage', 'billing.manage', 'attendance.manage');

-- ---------------------------------------------------------------------------
-- 4. RLS: role/role_permissions writes now go exclusively through RPCs.
--    Dropping the direct admin write policies means the privilege-escalation
--    guard in the RPCs cannot be bypassed via the REST API.
-- ---------------------------------------------------------------------------

drop policy if exists "org admins can create roles" on public.roles;
drop policy if exists "org admins can update roles" on public.roles;
drop policy if exists "org admins can delete roles" on public.roles;

drop policy if exists "org admins can create role permissions" on public.role_permissions;
drop policy if exists "org admins can update role permissions" on public.role_permissions;
drop policy if exists "org admins can delete role permissions" on public.role_permissions;

-- ---------------------------------------------------------------------------
-- 5. Privilege-escalation guard (shared by role-management RPCs).
--    A non-owner can only grant permissions they personally hold. Owners can
--    grant anything.
-- ---------------------------------------------------------------------------

create or replace function public.assert_caller_can_grant(p_org_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p text;
begin
  if public.is_org_owner(p_org_id) then
    return;
  end if;
  if p_permissions is null or array_length(p_permissions, 1) is null then
    return;
  end if;
  foreach p in array p_permissions loop
    if not exists (
      select 1
      from public.role_permissions rp
      join public.organization_members m on m.role_id = rp.role_id
      where m.organization_id = p_org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and rp.permission = p
    ) then
      raise exception 'you cannot grant permissions you do not hold';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Role management RPCs (all SECURITY DEFINER, all validate the caller).
-- ---------------------------------------------------------------------------

-- create_role: org admins (and above) may create a configurable, non-system
-- role with an explicit permission set. Slugs are immutable and unique per org.
create or replace function public.create_role(
  p_org_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_permissions text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_org_admin(p_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'role name is required';
  end if;
  if nullif(trim(p_slug), '') is null then
    raise exception 'role slug is required';
  end if;
  if p_slug !~ '^[a-z0-9_]+$' then
    raise exception 'role slug may only contain lowercase letters, numbers and underscores';
  end if;
  if exists (
    select 1 from public.roles r
    where r.organization_id = p_org_id and r.slug = p_slug
  ) then
    raise exception 'a role with this slug already exists';
  end if;

  perform public.assert_caller_can_grant(p_org_id, p_permissions);

  insert into public.roles (organization_id, name, slug, description, is_system, is_active)
  values (p_org_id, trim(p_name), p_slug, nullif(trim(p_description), ''), false, true)
  returning id into v_role_id;

  insert into public.role_permissions (organization_id, role_id, permission)
  select p_org_id, v_role_id, p
  from unnest(p_permissions) as p(permission);

  return v_role_id;
end;
$$;

-- update_role: edit the display name / description of a role. Slugs and system
-- flags are immutable; permission changes go through set_role_permissions.
create or replace function public.update_role(
  p_role_id uuid,
  p_name text,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id
  from public.roles
  where id = p_role_id;

  if v_org_id is null then
    raise exception 'role not found';
  end if;
  if not public.is_org_admin(v_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'role name is required';
  end if;

  update public.roles
  set name = trim(p_name),
      description = nullif(trim(p_description), '')
  where id = p_role_id;
end;
$$;

-- set_role_permissions: replace the full permission set of a role. The owner
-- role can only be changed by the owner; other roles by any org admin, subject
-- to the escalation guard (a non-owner may only grant permissions they hold).
create or replace function public.set_role_permissions(
  p_role_id uuid,
  p_permissions text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role_slug text;
begin
  select organization_id, slug into v_org_id, v_role_slug
  from public.roles
  where id = p_role_id;

  if v_org_id is null then
    raise exception 'role not found';
  end if;
  if not public.is_org_admin(v_org_id) then
    raise exception 'insufficient privileges';
  end if;

  if v_role_slug = 'owner' and not public.is_org_owner(v_org_id) then
    raise exception 'only the owner can change the owner role permissions';
  end if;

  perform public.assert_caller_can_grant(v_org_id, p_permissions);

  delete from public.role_permissions where role_id = p_role_id;
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, p_role_id, p
  from unnest(p_permissions) as p(permission);
end;
$$;

-- set_role_status: deactivate / reactivate a role. System roles (owner, admin,
-- manager, staff) cannot be deactivated. A role that is still assigned to
-- active members cannot be deactivated - reassign those users first.
create or replace function public.set_role_status(
  p_role_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_is_system boolean;
begin
  select organization_id, is_system into v_org_id, v_is_system
  from public.roles
  where id = p_role_id;

  if v_org_id is null then
    raise exception 'role not found';
  end if;
  if not public.is_org_admin(v_org_id) then
    raise exception 'insufficient privileges';
  end if;

  if not p_active then
    if v_is_system then
      raise exception 'system roles cannot be deactivated';
    end if;
    if exists (
      select 1 from public.organization_members m
      where m.role_id = p_role_id and m.status = 'active'
    ) then
      raise exception 'reassign members before deactivating this role';
    end if;
  end if;

  update public.roles
  set is_active = p_active
  where id = p_role_id;
end;
$$;

grant execute on function public.create_role(uuid, text, text, text, text[]) to authenticated;
grant execute on function public.update_role(uuid, text, text) to authenticated;
grant execute on function public.set_role_permissions(uuid, text[]) to authenticated;
grant execute on function public.set_role_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Hardened create_organization: granular permission seed + configurable
--    default roles (owner/admin/manager/staff system roles, plus receptionist,
--    trainer, accountant as editable non-system defaults).
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

  -- Owner and Admin receive every permission.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view', 'members.create', 'members.update', 'members.delete', 'members.export',
    'memberships.view', 'memberships.create', 'memberships.update',
    'billing.view', 'billing.create', 'billing.refund', 'billing.export',
    'attendance.view', 'attendance.create',
    'trainers.view',
    'classes.view', 'classes.manage',
    'inventory.view', 'inventory.manage',
    'crm.view', 'crm.manage',
    'finance.view', 'finance.manage',
    'reports.view', 'reports.export',
    'settings.view', 'settings.manage',
    'users.view', 'users.manage',
    'roles.view', 'roles.manage',
    'branches.view', 'branches.manage',
    'invites.send'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug in ('owner', 'admin');

  -- Manager: operational read/write, no organization administration.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view', 'members.create', 'members.update',
    'memberships.view', 'memberships.create', 'memberships.update',
    'billing.view', 'billing.create',
    'attendance.view', 'attendance.create',
    'trainers.view',
    'classes.view',
    'inventory.view',
    'crm.view',
    'reports.view',
    'settings.view',
    'branches.view'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug = 'manager';

  -- Staff: operational read-mostly.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view',
    'memberships.view',
    'attendance.view', 'attendance.create',
    'classes.view'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug = 'staff';

  -- Receptionist: front desk and member intake.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view', 'members.create', 'members.update',
    'memberships.view', 'memberships.create',
    'billing.view',
    'attendance.view', 'attendance.create',
    'classes.view'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug = 'receptionist';

  -- Trainer: sessions and attendance only.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view',
    'memberships.view',
    'attendance.view', 'attendance.create',
    'trainers.view',
    'classes.view'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug = 'trainer';

  -- Accountant: finance-focused.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view',
    'billing.view', 'billing.create', 'billing.refund', 'billing.export',
    'finance.view',
    'reports.view', 'reports.export',
    'settings.view'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug = 'accountant';

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
  text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Hardened create_invitation: deactivated roles and the owner role cannot
--    be invited, and only the owner may invite an admin.
-- ---------------------------------------------------------------------------

create or replace function public.create_invitation(
  p_org_id uuid,
  p_email text,
  p_role_id uuid,
  p_branch_ids uuid[] default null,
  p_all_branches boolean default false,
  p_expires_hours integer default 168
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_invitation_id uuid;
  v_role_slug text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_org_admin(p_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if nullif(trim(p_email), '') is null or position('@' in trim(p_email)) = 0 then
    raise exception 'a valid email is required';
  end if;
  if p_role_id is null then
    raise exception 'a role is required';
  end if;
  select r.slug into v_role_slug
  from public.roles r
  where r.id = p_role_id and r.organization_id = p_org_id and r.is_active;
  if v_role_slug is null then
    raise exception 'role does not belong to this organization or is deactivated';
  end if;
  if v_role_slug = 'owner' then
    raise exception 'the owner role cannot be invited';
  end if;
  if v_role_slug = 'admin' and not public.is_org_owner(p_org_id) then
    raise exception 'only the owner can invite an admin';
  end if;
  if not p_all_branches and p_branch_ids is not null then
    if exists (
      select 1
      from unnest(p_branch_ids) as b(bid)
      left join public.branches br on br.id = b.bid and br.organization_id = p_org_id
      where br.id is null
    ) then
      raise exception 'one or more branches are invalid';
    end if;
  end if;
  if exists (
    select 1 from public.invitations i
    where i.organization_id = p_org_id
      and lower(i.email) = lower(trim(p_email))
      and i.status = 'pending'
      and i.expires_at > now()
  ) then
    raise exception 'an active invitation already exists for this email';
  end if;

  v_token := replace(encode(gen_random_bytes(32), 'base64'), '/', '_');
  v_token := replace(v_token, '+', '-');
  v_token := replace(v_token, '=', '');

  insert into public.invitations (
    organization_id, email, role_id, token_hash, status, access_all_branches,
    expires_at, created_by
  )
  values (
    p_org_id,
    lower(trim(p_email)),
    p_role_id,
    encode(digest(v_token, 'sha256'), 'hex'),
    'pending',
    p_all_branches,
    now() + make_interval(hours => p_expires_hours),
    auth.uid()
  )
  returning id into v_invitation_id;

  if not p_all_branches and p_branch_ids is not null then
    insert into public.invitation_branches (organization_id, invitation_id, branch_id)
    select p_org_id, v_invitation_id, b.bid
    from unnest(p_branch_ids) as b(bid);
  end if;

  return query select v_invitation_id, v_token;
end;
$$;

grant execute on function public.create_invitation(uuid, text, uuid, uuid[], boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Hardened update_member_role: only the owner may assign the owner or admin
--    role; deactivated roles cannot be assigned. Existing owner guards kept.
-- ---------------------------------------------------------------------------

create or replace function public.update_member_role(p_member_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_target_role_slug text;
  v_target_is_owner boolean;
begin
  select m.organization_id, r.slug = 'owner'
  into v_org_id, v_target_is_owner
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.id = p_member_id;

  if v_org_id is null then
    raise exception 'member not found';
  end if;
  if not public.is_org_admin(v_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if p_role_id is null then
    raise exception 'a role is required';
  end if;

  select r.slug into v_target_role_slug
  from public.roles r
  where r.id = p_role_id and r.organization_id = v_org_id and r.is_active;
  if v_target_role_slug is null then
    raise exception 'role does not belong to this organization or is deactivated';
  end if;

  if v_target_is_owner and not public.is_org_owner(v_org_id) then
    raise exception 'only the owner can change the owner role';
  end if;

  if v_target_role_slug in ('owner', 'admin') and not public.is_org_owner(v_org_id) then
    raise exception 'only the owner can assign the owner or admin role';
  end if;

  if v_target_role_slug = 'owner' then
    if exists (
      select 1
      from public.organization_members m
      join public.roles r on r.id = m.role_id
      where m.organization_id = v_org_id and r.slug = 'owner' and m.id <> p_member_id
    ) then
      raise exception 'this organization already has an owner';
    end if;
  end if;

  update public.organization_members
  set role_id = p_role_id
  where id = p_member_id;
end;
$$;

grant execute on function public.update_member_role(uuid, uuid) to authenticated;
