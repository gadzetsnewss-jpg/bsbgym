-- =============================================================================
-- BSB FitForge - Persist onboarding Business step onto a draft organization
-- =============================================================================
-- Additive. The wizard previously held Business fields in client state and
-- only called create_organization on Complete, so Continue never wrote.
--
-- This migration:
--   * Adds save_onboarding_business: insert a draft org (created_by = auth.uid(),
--     no membership) or UPDATE that same row. Never trusts a client org id.
--   * Adds get_onboarding_organization: returns the caller's draft org for
--     prefill. SECURITY DEFINER because draft rows are not visible under RLS
--     until membership exists (onboarding layout requires no membership).
--   * Replaces create_organization so Complete UPDATEs the draft instead of
--     inserting a second organization, then seeds roles, owner membership and
--     the first branch as before.
--
-- Signature of create_organization is unchanged.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. save_onboarding_business (authenticated, identity from auth.uid())
-- ---------------------------------------------------------------------------

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
      tax_id = nullif(trim(p_tax_id), '')
    where id = v_org_id;

    return v_org_id;
  end if;

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
-- 2. get_onboarding_organization (draft only; no membership yet)
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

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
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
    'tax_id', v_row.tax_id
  );
end;
$$;

revoke all on function public.get_onboarding_organization() from public, anon;

grant execute on function public.get_onboarding_organization() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. create_organization: UPDATE draft if present, never insert a second org
--    Signature unchanged from 20260831000005.
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
      (v_org_id, 'Accountant', 'accountant', 'Handles billing, refunds and financial reports', false, true);

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
