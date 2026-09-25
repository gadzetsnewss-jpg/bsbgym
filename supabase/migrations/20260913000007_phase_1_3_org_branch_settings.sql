-- =============================================================================
-- BSB FitForge - Phase 1.3: Organization, branch and settings management
-- =============================================================================
-- Additive work on top of Phase 1.2. It does NOT rebuild anything. It:
--
--   1. Extends audit logging to organization updates and branch
--      create/update/status changes.
--   2. Adds SECURITY DEFINER RPCs for the remaining Phase 1.1 surfaces that
--      already have tables but no app-level write path:
--        * update_organization
--        * create_branch / update_branch / set_branch_status
--        * upsert_organization_setting
--   3. Every mutation derives identity from auth.uid() and re-checks
--      membership / owner / admin. organization_id is never trusted from
--      the frontend as the only gate.
--
-- Direct table writes remain possible under existing RLS (owner/admin
-- policies). The RPCs are the application write path so validation, unique
-- branch codes and "last active branch" protection cannot be skipped.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Audit: organization updates + branch lifecycle
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
      v_meta := jsonb_build_object(
        'name', coalesce(new.name, old.name),
        'code', coalesce(new.code, old.code)
      );
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

    else
      return coalesce(new, old);
  end case;

  if v_org_id is not null then
    perform public.record_audit_event(v_org_id, v_action, v_target_type, v_target_id, v_meta);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_organizations on public.organizations;
create trigger audit_organizations
  after insert or update on public.organizations
  for each row execute function public.audit_event_trigger();

drop trigger if exists audit_branches on public.branches;
create trigger audit_branches
  after insert or update on public.branches
  for each row execute function public.audit_event_trigger();

-- ---------------------------------------------------------------------------
-- 2. update_organization (owner only)
-- ---------------------------------------------------------------------------

create or replace function public.update_organization(
  p_org_id uuid,
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
  p_gstin text default null,
  p_currency text default null,
  p_timezone text default null,
  p_date_format text default null,
  p_logo_url text default null
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
  if not public.is_org_owner(p_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'organization name is required';
  end if;

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
    gstin = nullif(upper(trim(p_gstin)), ''),
    currency = coalesce(nullif(trim(p_currency), ''), currency),
    timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
    date_format = coalesce(nullif(trim(p_date_format), ''), date_format),
    logo_url = nullif(trim(p_logo_url), '')
  where id = p_org_id;

  if not found then
    raise exception 'organization not found';
  end if;
end;
$$;

grant execute on function public.update_organization(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to authenticated;

-- Regional defaults only. Admins (not just the owner) may update these so
-- general settings is usable without organization.manage.
create or replace function public.update_organization_preferences(
  p_org_id uuid,
  p_currency text,
  p_timezone text,
  p_date_format text
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
  if nullif(trim(p_currency), '') is null then
    raise exception 'currency is required';
  end if;
  if nullif(trim(p_timezone), '') is null then
    raise exception 'timezone is required';
  end if;
  if nullif(trim(p_date_format), '') is null then
    raise exception 'date format is required';
  end if;

  update public.organizations
  set
    currency = trim(p_currency),
    timezone = trim(p_timezone),
    date_format = trim(p_date_format)
  where id = p_org_id;

  if not found then
    raise exception 'organization not found';
  end if;
end;
$$;

grant execute on function public.update_organization_preferences(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. create_branch / update_branch / set_branch_status (admin)
-- ---------------------------------------------------------------------------

create or replace function public.create_branch(
  p_org_id uuid,
  p_name text,
  p_code text,
  p_phone text default null,
  p_email text default null,
  p_gstin text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_country text default null,
  p_timezone text default 'Asia/Kolkata'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_member_id uuid;
  v_all_branches boolean;
  v_code text;
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
  if nullif(trim(p_name), '') is null then
    raise exception 'branch name is required';
  end if;
  if nullif(trim(p_code), '') is null then
    raise exception 'branch code is required';
  end if;
  if p_code !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'branch code may only contain letters, numbers, dashes or underscores';
  end if;

  v_code := upper(trim(p_code));
  if exists (
    select 1 from public.branches
    where organization_id = p_org_id and code = v_code
  ) then
    raise exception 'branch code already exists';
  end if;

  insert into public.branches (
    organization_id, name, code, phone, email, gstin,
    address_line1, address_line2, city, state, postal_code, country,
    timezone, status
  )
  values (
    p_org_id,
    trim(p_name),
    v_code,
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''),
    nullif(upper(trim(p_gstin)), ''),
    nullif(trim(p_address_line1), ''),
    nullif(trim(p_address_line2), ''),
    nullif(trim(p_city), ''),
    nullif(trim(p_state), ''),
    nullif(trim(p_postal_code), ''),
    nullif(trim(p_country), ''),
    coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata'),
    'active'
  )
  returning id into v_branch_id;

  select m.id, m.access_all_branches
    into v_member_id, v_all_branches
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;

  if v_member_id is not null and not coalesce(v_all_branches, false) then
    insert into public.member_branches (organization_id, member_id, branch_id)
    values (p_org_id, v_member_id, v_branch_id)
    on conflict (member_id, branch_id) do nothing;
  end if;

  return v_branch_id;
end;
$$;

grant execute on function public.create_branch(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.update_branch(
  p_branch_id uuid,
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_gstin text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_country text default null,
  p_timezone text default null
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
  from public.branches
  where id = p_branch_id;

  if v_org_id is null then
    raise exception 'branch not found';
  end if;
  if not public.is_org_admin(v_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'branch name is required';
  end if;

  update public.branches
  set
    name = trim(p_name),
    phone = nullif(trim(p_phone), ''),
    email = nullif(trim(p_email), ''),
    gstin = nullif(upper(trim(p_gstin)), ''),
    address_line1 = nullif(trim(p_address_line1), ''),
    address_line2 = nullif(trim(p_address_line2), ''),
    city = nullif(trim(p_city), ''),
    state = nullif(trim(p_state), ''),
    postal_code = nullif(trim(p_postal_code), ''),
    country = nullif(trim(p_country), ''),
    timezone = coalesce(nullif(trim(p_timezone), ''), timezone)
  where id = p_branch_id;
end;
$$;

grant execute on function public.update_branch(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.set_branch_status(
  p_branch_id uuid,
  p_status public.branch_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_active_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id into v_org_id
  from public.branches
  where id = p_branch_id;

  if v_org_id is null then
    raise exception 'branch not found';
  end if;
  if not public.is_org_admin(v_org_id) then
    raise exception 'insufficient privileges';
  end if;

  if p_status = 'inactive' then
    select count(*) into v_active_count
    from public.branches
    where organization_id = v_org_id and status = 'active' and id <> p_branch_id;
    if v_active_count < 1 then
      raise exception 'cannot deactivate the last active branch';
    end if;
  end if;

  update public.branches
  set status = p_status
  where id = p_branch_id;
end;
$$;

grant execute on function public.set_branch_status(uuid, public.branch_status) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. upsert_organization_setting (admin)
--    JSONB key/value store for invoice / regional extras. Never trusts a
--    frontend-supplied organization_id without an admin check.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_organization_setting(
  p_org_id uuid,
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
  if nullif(trim(p_setting_key), '') is null then
    raise exception 'setting key is required';
  end if;
  if p_setting_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'setting key is invalid';
  end if;

  insert into public.organization_settings (organization_id, setting_key, setting_value)
  values (p_org_id, trim(p_setting_key), coalesce(p_setting_value, '{}'::jsonb))
  on conflict (organization_id, setting_key)
  do update set setting_value = excluded.setting_value;
end;
$$;

grant execute on function public.upsert_organization_setting(uuid, text, jsonb) to authenticated;
