-- =============================================================================
-- BSB FitForge - Persist remaining onboarding steps onto the draft organization
-- =============================================================================
-- Additive. Business already writes via save_onboarding_business (00016).
-- Account, Branch and Preferences were still client-only until Complete.
--
-- This migration:
--   * Adds save_onboarding_account: UPDATE profiles for auth.uid() only.
--   * Adds save_onboarding_branch: store the first-branch draft on the existing
--     draft org (organization_settings.onboarding_branch). No real branch row
--     until create_organization. Never trusts a client org/branch id.
--   * Adds save_onboarding_preferences: UPDATE currency/timezone/date_format on
--     the same draft org.
--   * Replaces get_onboarding_organization so return visits prefill every step
--     and resume at the first incomplete one.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared: the caller's draft organization (created_by, no membership).
-- ---------------------------------------------------------------------------

create or replace function public.onboarding_draft_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    return null;
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

  return v_org_id;
end;
$$;

revoke all on function public.onboarding_draft_org_id() from public, anon, authenticated;

create or replace function public.set_onboarding_step(p_org_id uuid, p_step integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
begin
  if p_org_id is null then
    return;
  end if;

  select coalesce((setting_value ->> 'step')::integer, 0)
    into v_current
  from public.organization_settings
  where organization_id = p_org_id
    and setting_key = 'onboarding_progress';

  insert into public.organization_settings (organization_id, setting_key, setting_value)
  values (
    p_org_id,
    'onboarding_progress',
    jsonb_build_object('step', greatest(coalesce(v_current, 0), p_step))
  )
  on conflict (organization_id, setting_key)
  do update set setting_value = jsonb_build_object(
    'step', greatest(
      coalesce((public.organization_settings.setting_value ->> 'step')::integer, 0),
      p_step
    )
  );
end;
$$;

revoke all on function public.set_onboarding_step(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. save_onboarding_account
-- ---------------------------------------------------------------------------

create or replace function public.save_onboarding_account(
  p_first_name text,
  p_last_name text
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
  if exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'you already belong to an organization';
  end if;
  if nullif(trim(p_first_name), '') is null then
    raise exception 'first name is required';
  end if;
  if nullif(trim(p_last_name), '') is null then
    raise exception 'last name is required';
  end if;

  update public.profiles
  set
    first_name = trim(p_first_name),
    last_name = trim(p_last_name)
  where id = auth.uid();

  if not found then
    raise exception 'profile not found';
  end if;

  v_org_id := public.onboarding_draft_org_id();
  perform public.set_onboarding_step(v_org_id, 1);
end;
$$;

revoke all on function public.save_onboarding_account(text, text) from public, anon;
grant execute on function public.save_onboarding_account(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. save_onboarding_branch (draft only; no branches row)
-- ---------------------------------------------------------------------------

create or replace function public.save_onboarding_branch(
  p_name text,
  p_code text,
  p_phone text default null,
  p_email text default null,
  p_timezone text default 'Asia/Kolkata',
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_country text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'you already belong to an organization';
  end if;

  v_org_id := public.onboarding_draft_org_id();
  if v_org_id is null then
    raise exception 'organization name is required';
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
  if nullif(trim(p_timezone), '') is null then
    raise exception 'timezone is required';
  end if;

  v_code := upper(trim(p_code));

  insert into public.organization_settings (organization_id, setting_key, setting_value)
  values (
    v_org_id,
    'onboarding_branch',
    jsonb_build_object(
      'name', trim(p_name),
      'code', v_code,
      'phone', nullif(trim(p_phone), ''),
      'email', nullif(trim(p_email), ''),
      'timezone', trim(p_timezone),
      'address_line1', nullif(trim(p_address_line1), ''),
      'address_line2', nullif(trim(p_address_line2), ''),
      'city', nullif(trim(p_city), ''),
      'state', nullif(trim(p_state), ''),
      'postal_code', nullif(trim(p_postal_code), ''),
      'country', nullif(trim(p_country), '')
    )
  )
  on conflict (organization_id, setting_key)
  do update set setting_value = excluded.setting_value;

  perform public.set_onboarding_step(v_org_id, 3);
  return v_org_id;
end;
$$;

revoke all on function public.save_onboarding_branch(
  text, text, text, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.save_onboarding_branch(
  text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. save_onboarding_preferences
-- ---------------------------------------------------------------------------

create or replace function public.save_onboarding_preferences(
  p_currency text,
  p_timezone text,
  p_date_format text
)
returns uuid
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
  if exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'you already belong to an organization';
  end if;

  v_org_id := public.onboarding_draft_org_id();
  if v_org_id is null then
    raise exception 'organization name is required';
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
  where id = v_org_id;

  perform public.set_onboarding_step(v_org_id, 4);
  return v_org_id;
end;
$$;

revoke all on function public.save_onboarding_preferences(text, text, text) from public, anon;
grant execute on function public.save_onboarding_preferences(text, text, text) to authenticated;

-- Mark Business writes as step 2 (replace save_onboarding_business from 00016).

create or replace function public.save_onboarding_business(
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
  p_tax_id text default null
)
returns uuid
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

  v_org_id := public.onboarding_draft_org_id();

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
      tax_id = nullif(trim(p_tax_id), '')
    where id = v_org_id;
  else
    insert into public.organizations (
      name, legal_name, business_type, email, phone, website,
      address_line1, address_line2, city, state, postal_code, country, tax_id,
      status, created_by
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
      'active',
      auth.uid()
    )
    returning id into v_org_id;
  end if;

  perform public.set_onboarding_step(v_org_id, 2);
  return v_org_id;
end;
$$;

revoke all on function public.save_onboarding_business(
  text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.save_onboarding_business(
  text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_onboarding_organization: prefill every step + resume index
-- ---------------------------------------------------------------------------

create or replace function public.get_onboarding_organization()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.organizations%rowtype;
  v_first text;
  v_last text;
  v_branch jsonb;
  v_step integer;
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
    return null;
  end if;

  select p.first_name, p.last_name
    into v_first, v_last
  from public.profiles p
  where p.id = auth.uid();

  select o.*
    into v_row
  from public.organizations o
  where o.created_by = auth.uid()
    and not exists (
      select 1
      from public.organization_members m
      where m.organization_id = o.id
    )
  order by o.updated_at desc
  limit 1;

  if v_row.id is not null then
    select s.setting_value
      into v_branch
    from public.organization_settings s
    where s.organization_id = v_row.id
      and s.setting_key = 'onboarding_branch';

    select coalesce((s.setting_value ->> 'step')::integer, 0)
      into v_step
    from public.organization_settings s
    where s.organization_id = v_row.id
      and s.setting_key = 'onboarding_progress';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'step', coalesce(v_step, 0),
    'first_name', coalesce(v_first, ''),
    'last_name', coalesce(v_last, ''),
    'name', v_row.name,
    'legal_name', v_row.legal_name,
    'business_type', v_row.business_type,
    'email', v_row.email,
    'phone', v_row.phone,
    'website', v_row.website,
    'address_line1', v_row.address_line1,
    'address_line2', v_row.address_line2,
    'city', v_row.city,
    'state', v_row.state,
    'postal_code', v_row.postal_code,
    'country', v_row.country,
    'tax_id', v_row.tax_id,
    'currency', v_row.currency,
    'timezone', v_row.timezone,
    'date_format', v_row.date_format,
    'branch', v_branch
  );
end;
$$;

revoke all on function public.get_onboarding_organization() from public, anon;
grant execute on function public.get_onboarding_organization() to authenticated;
