-- =============================================================================
-- BSB FitForge - Member Portal Auth, Tenant Lookup & Permissions
-- =============================================================================
-- Additive. Enables Gym Code + Registered Mobile Member Login.
-- 1. require_password_change(uuid) RPC to force password change on next login.
-- 2. auth_email_for_gym_member_phone(gym_code, phone) for tenant-isolated login.
-- 3. Seed attendance.view and fitness.view permissions for member role.
-- =============================================================================

-- 1. Require password change RPC (for Owner reset / temporary passwords)
create or replace function public.require_password_change(p_user_id uuid)
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
  set must_change_password = true
  where id = p_user_id;
end;
$$;

revoke all on function public.require_password_change(uuid) from public, anon, authenticated;
grant execute on function public.require_password_change(uuid) to service_role;

-- 2. Gym-scoped member lookup by registered phone number
create or replace function public.auth_email_for_gym_member_phone(
  p_gym_code text,
  p_phone text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gym_code text;
  v_digits text;
  v_org_id uuid;
  v_email text;
  v_count integer;
begin
  v_gym_code := nullif(lower(trim(coalesce(p_gym_code, ''))), '');
  if v_gym_code is null then
    return null;
  end if;

  -- Extract national digits (last 10 digits for Indian mobile numbers)
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_digits) = 12 and v_digits like '91%' then
    v_digits := substring(v_digits from 3);
  end if;
  if length(v_digits) <> 10 then
    return null;
  end if;

  select id into v_org_id
  from public.organizations
  where lower(slug) = v_gym_code
    and status in ('active', 'trial')
  limit 1;

  if v_org_id is null then
    return null;
  end if;

  -- Match member in this gym whose phone ends with the 10 digits and has an active login
  select count(*)
    into v_count
  from public.gym_members g
  where g.organization_id = v_org_id
    and g.user_id is not null
    and right(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), 10) = v_digits;

  if v_count <> 1 then
    return null;
  end if;

  select u.email
    into v_email
  from public.gym_members g
  join auth.users u on u.id = g.user_id
  where g.organization_id = v_org_id
    and g.user_id is not null
    and right(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), 10) = v_digits
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.auth_email_for_gym_member_phone(text, text) from public, anon, authenticated;
grant execute on function public.auth_email_for_gym_member_phone(text, text) to service_role;

-- 3. Seed attendance and fitness view permissions for member roles
insert into public.role_permissions (organization_id, role_id, permission)
select r.organization_id, r.id, p.permission
from public.roles r
cross join unnest(array[
  'attendance.view',
  'fitness.view'
]) as p(permission)
where r.slug = 'member'
on conflict (role_id, permission) do nothing;
