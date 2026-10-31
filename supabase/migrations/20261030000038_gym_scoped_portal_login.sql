-- =============================================================================
-- BSB FitForge - Gym-scoped trainer/member login lookup
-- =============================================================================
-- Additive. Replaces global code lookup with Gym Code (organizations.slug)
-- plus Trainer ID / Member Code resolved only inside that organization.
-- Does not disable RLS, drop tables, or store plaintext passwords.
-- =============================================================================

create or replace function public.auth_email_for_member_code(p_gym_code text, p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gym text;
  v_code text;
  v_org_id uuid;
  v_email text;
begin
  v_gym := nullif(lower(trim(coalesce(p_gym_code, ''))), '');
  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');
  if v_gym is null or v_code is null then
    return null;
  end if;

  select o.id
    into v_org_id
  from public.organizations o
  where lower(o.slug) = v_gym
    and o.status in ('active', 'trial');
  if v_org_id is null then
    return null;
  end if;

  select u.email
    into v_email
  from public.gym_members g
  join auth.users u on u.id = g.user_id
  where g.organization_id = v_org_id
    and upper(g.code) = v_code
    and g.user_id is not null;

  return v_email;
end;
$$;

create or replace function public.auth_email_for_trainer_code(p_gym_code text, p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gym text;
  v_code text;
  v_org_id uuid;
  v_email text;
begin
  v_gym := nullif(lower(trim(coalesce(p_gym_code, ''))), '');
  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');
  if v_gym is null or v_code is null then
    return null;
  end if;

  select o.id
    into v_org_id
  from public.organizations o
  where lower(o.slug) = v_gym
    and o.status in ('active', 'trial');
  if v_org_id is null then
    return null;
  end if;

  select u.email
    into v_email
  from public.trainers t
  join auth.users u on u.id = t.user_id
  where t.organization_id = v_org_id
    and t.code is not null
    and upper(t.code) = v_code
    and t.user_id is not null;

  return v_email;
end;
$$;

drop function if exists public.auth_email_for_member_code(text);
drop function if exists public.auth_email_for_trainer_code(text);

revoke all on function public.auth_email_for_member_code(text, text) from public, anon, authenticated;
grant execute on function public.auth_email_for_member_code(text, text) to service_role;

revoke all on function public.auth_email_for_trainer_code(text, text) from public, anon, authenticated;
grant execute on function public.auth_email_for_trainer_code(text, text) to service_role;
