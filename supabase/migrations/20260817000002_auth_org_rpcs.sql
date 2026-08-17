-- =============================================================================
-- BSB FitForge - Phase 3: RPCs (secure multi-write operations)
-- =============================================================================
-- All multi-write operations run through SECURITY DEFINER functions so an
-- organization can never be created partially, and so organization_id is
-- always derived from the caller's auth context - never from the frontend.
-- Every function re-validates the caller's role before mutating data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Membership helpers (used by RLS policies and RPCs). SECURITY DEFINER so the
-- RLS policies on organization_members themselves do not recurse.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.roles r on r.id = m.role_id
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.slug in ('owner', 'admin')
  );
$$;

create or replace function public.is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.roles r on r.id = m.role_id
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.slug = 'owner'
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_organization
-- ---------------------------------------------------------------------------
-- Atomically creates: organization + system roles + owner membership +
-- owner branch access + first branch + default settings.
-- Returns the new organization id.
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

  insert into public.roles (organization_id, name, slug, description, is_system)
  values
    (v_org_id, 'Owner', 'owner', 'Full ownership access to the organization', true),
    (v_org_id, 'Admin', 'admin', 'Manages the organization and its settings', true),
    (v_org_id, 'Manager', 'manager', 'Runs day-to-day operations at assigned branches', true),
    (v_org_id, 'Staff', 'staff', 'Front desk and operations staff', true);

  -- Owner and Admin receive every permission.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view', 'members.manage',
    'memberships.view', 'memberships.manage',
    'billing.view', 'billing.manage',
    'attendance.view', 'attendance.manage',
    'trainers.view', 'trainers.manage',
    'classes.view', 'classes.manage',
    'inventory.view', 'inventory.manage',
    'crm.view', 'crm.manage',
    'finance.view', 'finance.manage',
    'reports.view',
    'settings.view', 'settings.manage',
    'users.manage',
    'branches.manage',
    'invites.send'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug in ('owner', 'admin');

  -- Manager: operational read/write, no organization administration.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view', 'members.manage',
    'memberships.view', 'memberships.manage',
    'billing.view',
    'attendance.view', 'attendance.manage',
    'trainers.view', 'trainers.manage',
    'classes.view', 'classes.manage',
    'inventory.view',
    'crm.view',
    'reports.view'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug = 'manager';

  -- Staff: operational read-only.
  insert into public.role_permissions (organization_id, role_id, permission)
  select v_org_id, r.id, p.permission
  from public.roles r
  cross join unnest(array[
    'dashboard.view',
    'members.view',
    'memberships.view',
    'attendance.view', 'attendance.manage',
    'classes.view'
  ]) as p(permission)
  where r.organization_id = v_org_id and r.slug = 'staff';

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
-- create_invitation
-- ---------------------------------------------------------------------------
-- Generates a cryptographically random token, stores only its SHA-256 hash,
-- and returns the raw token exactly once so the inviter can build the accept
-- link. Expired/pending duplicates are rejected.
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
  if not exists (
    select 1 from public.roles r
    where r.id = p_role_id and r.organization_id = p_org_id
  ) then
    raise exception 'role does not belong to this organization';
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
-- accept_invitation
-- ---------------------------------------------------------------------------
-- Validates the raw token (hash match), expiry, and that the signed-in
-- user's email matches the invitation. Creates the membership and branch
-- access atomically. Used invitations cannot be reused.
-- ---------------------------------------------------------------------------

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_member_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if nullif(trim(p_token), '') is null then
    raise exception 'invitation token is required';
  end if;

  select * into v_inv
  from public.invitations i
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
  limit 1;

  if v_inv.id is null then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation has already been used or revoked';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired';
  end if;
  if lower(v_inv.email) <> lower((select email from auth.users where id = auth.uid())) then
    raise exception 'invitation is not for this account';
  end if;
  if exists (
    select 1 from public.organization_members m
    where m.organization_id = v_inv.organization_id and m.user_id = auth.uid()
  ) then
    raise exception 'you are already a member of this organization';
  end if;

  insert into public.organization_members (
    organization_id, user_id, role_id, status, access_all_branches,
    accepted_at, created_by
  )
  values (
    v_inv.organization_id, auth.uid(), v_inv.role_id, 'active',
    v_inv.access_all_branches, now(), v_inv.created_by
  )
  returning id into v_member_id;

  if not v_inv.access_all_branches then
    insert into public.member_branches (organization_id, member_id, branch_id)
    select v_inv.organization_id, v_member_id, ib.branch_id
    from public.invitation_branches ib
    where ib.invitation_id = v_inv.id;
  end if;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  select jsonb_build_object(
    'organization_id', v_inv.organization_id,
    'member_id', v_member_id,
    'role', r.slug,
    'name', o.name
  )
  into v_result
  from public.roles r
  join public.organizations o on o.id = r.organization_id
  where r.id = v_inv.role_id;

  return v_result;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- revoke_invitation
-- ---------------------------------------------------------------------------

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id
  from public.invitations
  where id = p_invitation_id;

  if v_org_id is null then
    raise exception 'invitation not found';
  end if;
  if not public.is_org_admin(v_org_id) then
    raise exception 'insufficient privileges';
  end if;

  update public.invitations
  set status = 'revoked'
  where id = p_invitation_id and status = 'pending';
end;
$$;

grant execute on function public.revoke_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- update_member_role
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
  if not exists (
    select 1 from public.roles r
    where r.id = p_role_id and r.organization_id = v_org_id
  ) then
    raise exception 'role does not belong to this organization';
  end if;

  select r.slug into v_target_role_slug
  from public.roles r
  where r.id = p_role_id;

  if v_target_is_owner and not public.is_org_owner(v_org_id) then
    raise exception 'only the owner can change the owner role';
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

-- ---------------------------------------------------------------------------
-- set_member_status
-- ---------------------------------------------------------------------------

create or replace function public.set_member_status(p_member_id uuid, p_status public.user_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
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

  if v_target_is_owner and p_status <> 'active' then
    raise exception 'the owner account cannot be deactivated';
  end if;

  update public.organization_members
  set status = p_status
  where id = p_member_id;
end;
$$;

grant execute on function public.set_member_status(uuid, public.user_status) to authenticated;

-- ---------------------------------------------------------------------------
-- update_member_branch_access
-- ---------------------------------------------------------------------------

create or replace function public.update_member_branch_access(
  p_member_id uuid,
  p_branch_ids uuid[] default null,
  p_all_branches boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
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
  if v_target_is_owner then
    raise exception 'the owner always has access to all branches';
  end if;

  if not p_all_branches and p_branch_ids is not null then
    if exists (
      select 1
      from unnest(p_branch_ids) as b(bid)
      left join public.branches br on br.id = b.bid and br.organization_id = v_org_id
      where br.id is null
    ) then
      raise exception 'one or more branches are invalid';
    end if;
  end if;

  delete from public.member_branches where member_id = p_member_id;

  if p_all_branches then
    update public.organization_members
    set access_all_branches = true
    where id = p_member_id;
  else
    update public.organization_members
    set access_all_branches = false
    where id = p_member_id;
    if p_branch_ids is not null then
      insert into public.member_branches (organization_id, member_id, branch_id)
      select v_org_id, p_member_id, b.bid
      from unnest(p_branch_ids) as b(bid);
    end if;
  end if;
end;
$$;

grant execute on function public.update_member_branch_access(uuid, uuid[], boolean) to authenticated;
