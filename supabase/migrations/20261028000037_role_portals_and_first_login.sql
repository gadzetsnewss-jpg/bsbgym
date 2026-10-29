-- =============================================================================
-- BSB FitForge - Role login portals and first-login password change
-- =============================================================================
-- Additive. Reuses profiles.username, gym_members.code, trainers.code,
-- organization_members, and existing link RPCs. Does not disable RLS or
-- store plaintext passwords.
--
-- 1. profiles.must_change_password is a trusted backend flag (trigger-guarded).
-- 2. Owner provisioning inserts org membership, links trainer/member user_id,
--    and sets the flag. Auth users are created by the server route.
-- 3. Member/trainer ID lookup RPCs are service_role only (same as username).
-- =============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create or replace function public.protect_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.must_change_password is distinct from old.must_change_password
     and current_setting('app.set_must_change_password', true) is distinct from 'on' then
    raise exception 'must_change_password cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_must_change_password() from public, anon, authenticated;

drop trigger if exists protect_must_change_password on public.profiles;
create trigger protect_must_change_password
  before update on public.profiles
  for each row execute function public.protect_must_change_password();

create or replace function public.auth_email_for_member_code(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
  v_email text;
  v_count integer;
begin
  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');
  if v_code is null then
    return null;
  end if;

  select count(*)
    into v_count
  from public.gym_members g
  where upper(g.code) = v_code
    and g.user_id is not null;

  if v_count <> 1 then
    return null;
  end if;

  select u.email
    into v_email
  from public.gym_members g
  join auth.users u on u.id = g.user_id
  where upper(g.code) = v_code
    and g.user_id is not null
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.auth_email_for_member_code(text) from public, anon, authenticated;
grant execute on function public.auth_email_for_member_code(text) to service_role;

create or replace function public.auth_email_for_trainer_code(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
  v_email text;
  v_count integer;
begin
  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');
  if v_code is null then
    return null;
  end if;

  select count(*)
    into v_count
  from public.trainers t
  where t.code is not null
    and upper(t.code) = v_code
    and t.user_id is not null;

  if v_count <> 1 then
    return null;
  end if;

  select u.email
    into v_email
  from public.trainers t
  join auth.users u on u.id = t.user_id
  where t.code is not null
    and upper(t.code) = v_code
    and t.user_id is not null
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.auth_email_for_trainer_code(text) from public, anon, authenticated;
grant execute on function public.auth_email_for_trainer_code(text) to service_role;

create or replace function public.provision_linked_login(
  p_kind text,
  p_record_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_org_id uuid;
  v_branch_id uuid;
  v_role_id uuid;
  v_member_id uuid;
  v_access_all boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_user_id is null then
    raise exception 'a user is required';
  end if;

  v_kind := lower(trim(coalesce(p_kind, '')));
  if v_kind not in ('trainer', 'member') then
    raise exception 'login kind is invalid';
  end if;

  if v_kind = 'trainer' then
    select organization_id, branch_id into v_org_id, v_branch_id
    from public.trainers
    where id = p_record_id;
    if v_org_id is null then
      raise exception 'trainer not found';
    end if;
    if exists (
      select 1 from public.trainers t
      where t.id = p_record_id and t.user_id is not null
    ) then
      raise exception 'login is already linked to another trainer';
    end if;
  else
    select organization_id, branch_id into v_org_id, v_branch_id
    from public.gym_members
    where id = p_record_id;
    if v_org_id is null then
      raise exception 'member not found';
    end if;
    if exists (
      select 1 from public.gym_members g
      where g.id = p_record_id and g.user_id is not null
    ) then
      raise exception 'login is already linked to another member';
    end if;
  end if;

  perform public.require_org_permission(v_org_id, 'users.manage');

  if exists (
    select 1 from public.organization_members m
    where m.organization_id = v_org_id and m.user_id = p_user_id
  ) then
    raise exception 'user is already part of this organization';
  end if;
  if exists (
    select 1 from public.trainers t
    where t.organization_id = v_org_id and t.user_id = p_user_id
  ) then
    raise exception 'login is already linked to a trainer';
  end if;
  if exists (
    select 1 from public.gym_members g
    where g.organization_id = v_org_id and g.user_id = p_user_id
  ) then
    raise exception 'login is already linked to a member';
  end if;

  select r.id into v_role_id
  from public.roles r
  where r.organization_id = v_org_id
    and r.slug = v_kind
    and r.is_active = true;
  if v_role_id is null then
    raise exception 'role not found';
  end if;

  v_access_all := v_kind = 'trainer' and v_branch_id is null;

  insert into public.organization_members (
    organization_id, user_id, role_id, status, access_all_branches,
    accepted_at, created_by
  )
  values (
    v_org_id, p_user_id, v_role_id, 'active', v_access_all,
    now(), auth.uid()
  )
  returning id into v_member_id;

  if not v_access_all and v_branch_id is not null then
    insert into public.member_branches (organization_id, member_id, branch_id)
    values (v_org_id, v_member_id, v_branch_id);
  end if;

  if v_kind = 'trainer' then
    update public.trainers
    set user_id = p_user_id
    where id = p_record_id and organization_id = v_org_id;
  else
    update public.gym_members
    set user_id = p_user_id
    where id = p_record_id and organization_id = v_org_id;
  end if;

  perform set_config('app.set_must_change_password', 'on', true);
  update public.profiles
  set must_change_password = true
  where id = p_user_id;
end;
$$;

revoke all on function public.provision_linked_login(text, uuid, uuid) from public, anon;
grant execute on function public.provision_linked_login(text, uuid, uuid) to authenticated;

create or replace function public.complete_password_change(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'a user is required';
  end if;
  perform set_config('app.set_must_change_password', 'on', true);
  update public.profiles
  set must_change_password = false
  where id = p_user_id;
end;
$$;

revoke all on function public.complete_password_change(uuid) from public, anon, authenticated;
grant execute on function public.complete_password_change(uuid) to service_role;
