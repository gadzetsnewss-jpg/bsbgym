-- =============================================================================
-- BSB FitForge - Phase 6: CRM write path
-- =============================================================================
-- Additive SECURITY DEFINER RPCs for existing CRM tables:
--   leads, follow_ups, trial_memberships, referrals
-- plus convert_lead_to_member, which reuses gym_members (create_gym_member
-- rules) and sets leads.converted_member_id / status = converted.
--
-- Tables stay select-only RLS. organization_id is derived server-side.
-- Soft status only. No hard deletes. No new CRM tables or statuses.
-- =============================================================================

-- Composite branch FKs already exist. Add simple branch_id FKs so PostgREST
-- can embed branches on CRM reads, matching gym_members.
alter table public.leads drop constraint if exists leads_branch_id_fkey;
alter table public.leads add constraint leads_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

alter table public.follow_ups drop constraint if exists follow_ups_branch_id_fkey;
alter table public.follow_ups add constraint follow_ups_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

alter table public.trial_memberships drop constraint if exists trial_memberships_branch_id_fkey;
alter table public.trial_memberships add constraint trial_memberships_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create or replace function public.create_lead(
  p_org_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_source text,
  p_status text,
  p_interest text,
  p_notes text,
  p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_first text;
  v_last text;
  v_email text;
  v_status text;
begin
  perform public.require_org_permission(p_org_id, 'crm.manage');
  if p_branch_id is not null then
    perform public.require_branch_in_org(p_org_id, p_branch_id);
  end if;

  v_first := trim(p_first_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  v_last := nullif(trim(p_last_name), '');
  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'new');
  if v_status not in ('new', 'contacted', 'qualified', 'trial', 'lost') then
    raise exception 'status is invalid';
  end if;

  insert into public.leads (
    organization_id, branch_id, first_name, last_name, email, phone,
    source, status, interest, notes, assigned_to, created_by
  )
  values (
    p_org_id,
    p_branch_id,
    v_first,
    v_last,
    v_email,
    nullif(trim(p_phone), ''),
    nullif(trim(p_source), ''),
    v_status,
    nullif(trim(p_interest), ''),
    nullif(trim(p_notes), ''),
    p_assigned_to,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_lead(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to authenticated;

create or replace function public.update_lead(
  p_lead_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_source text,
  p_status text,
  p_interest text,
  p_notes text,
  p_assigned_to uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_current_status text;
  v_first text;
  v_last text;
  v_email text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id, status into v_org_id, v_current_status
  from public.leads where id = p_lead_id;
  if v_org_id is null then
    raise exception 'lead not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');
  if p_branch_id is not null then
    perform public.require_branch_in_org(v_org_id, p_branch_id);
  end if;

  v_first := trim(p_first_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  v_last := nullif(trim(p_last_name), '');
  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), v_current_status);
  if v_current_status = 'converted' then
    v_status := 'converted';
  elsif v_status = 'converted' then
    raise exception 'convert the lead to create a member';
  elsif v_status not in ('new', 'contacted', 'qualified', 'trial', 'lost') then
    raise exception 'status is invalid';
  end if;

  update public.leads set
    branch_id = p_branch_id,
    first_name = v_first,
    last_name = v_last,
    email = v_email,
    phone = nullif(trim(p_phone), ''),
    source = nullif(trim(p_source), ''),
    status = v_status,
    interest = nullif(trim(p_interest), ''),
    notes = nullif(trim(p_notes), ''),
    assigned_to = p_assigned_to
  where id = p_lead_id;
end;
$$;

grant execute on function public.update_lead(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to authenticated;

create or replace function public.set_lead_status(
  p_lead_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_current text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id, status into v_org_id, v_current
  from public.leads where id = p_lead_id;
  if v_org_id is null then
    raise exception 'lead not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');

  v_status := trim(p_status);
  if v_current = 'converted' then
    raise exception 'converted leads cannot change status';
  end if;
  if v_status = 'converted' then
    raise exception 'convert the lead to create a member';
  end if;
  if v_status not in ('new', 'contacted', 'qualified', 'trial', 'lost') then
    raise exception 'status is invalid';
  end if;

  update public.leads set status = v_status where id = p_lead_id;
end;
$$;

grant execute on function public.set_lead_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Follow-ups
-- ---------------------------------------------------------------------------

create or replace function public.create_follow_up(
  p_org_id uuid,
  p_branch_id uuid,
  p_lead_id uuid,
  p_member_id uuid,
  p_due_at timestamptz,
  p_notes text,
  p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_branch uuid;
  v_lead_org uuid;
  v_member_org uuid;
begin
  perform public.require_org_permission(p_org_id, 'crm.manage');
  if p_lead_id is null and p_member_id is null then
    raise exception 'a lead or member is required';
  end if;
  if p_due_at is null then
    raise exception 'due date is required';
  end if;

  v_branch := p_branch_id;

  if p_lead_id is not null then
    select organization_id, coalesce(v_branch, branch_id) into v_lead_org, v_branch
    from public.leads where id = p_lead_id;
    if v_lead_org is null or v_lead_org <> p_org_id then
      raise exception 'lead not found';
    end if;
  end if;

  if p_member_id is not null then
    select organization_id, coalesce(v_branch, branch_id) into v_member_org, v_branch
    from public.gym_members where id = p_member_id;
    if v_member_org is null or v_member_org <> p_org_id then
      raise exception 'member not found';
    end if;
  end if;

  if v_branch is not null then
    perform public.require_branch_in_org(p_org_id, v_branch);
  end if;

  insert into public.follow_ups (
    organization_id, branch_id, lead_id, member_id, due_at, status, notes,
    assigned_to, created_by
  )
  values (
    p_org_id,
    v_branch,
    p_lead_id,
    p_member_id,
    p_due_at,
    'pending',
    nullif(trim(p_notes), ''),
    p_assigned_to,
    auth.uid()
  )
  returning id into v_id;

  if p_lead_id is not null then
    update public.leads
    set status = 'contacted'
    where id = p_lead_id and status = 'new';
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_follow_up(
  uuid, uuid, uuid, uuid, timestamptz, text, uuid
) to authenticated;

create or replace function public.update_follow_up(
  p_follow_up_id uuid,
  p_due_at timestamptz,
  p_status text,
  p_notes text,
  p_assigned_to uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id into v_org_id
  from public.follow_ups where id = p_follow_up_id;
  if v_org_id is null then
    raise exception 'follow-up not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');

  if p_due_at is null then
    raise exception 'due date is required';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'pending');
  if v_status not in ('pending', 'done', 'cancelled') then
    raise exception 'status is invalid';
  end if;

  update public.follow_ups set
    due_at = p_due_at,
    status = v_status,
    notes = nullif(trim(p_notes), ''),
    assigned_to = p_assigned_to
  where id = p_follow_up_id;
end;
$$;

grant execute on function public.update_follow_up(
  uuid, timestamptz, text, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Trial memberships
-- ---------------------------------------------------------------------------

create or replace function public.create_trial_membership(
  p_org_id uuid,
  p_branch_id uuid,
  p_lead_id uuid,
  p_member_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_starts date;
  v_ends date;
  v_lead_org uuid;
  v_member_org uuid;
begin
  perform public.require_org_permission(p_org_id, 'crm.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);
  if p_lead_id is null and p_member_id is null then
    raise exception 'a lead or member is required';
  end if;

  v_starts := coalesce(p_starts_on, (timezone('utc', now()))::date);
  v_ends := coalesce(p_ends_on, v_starts + 7);
  if v_ends < v_starts then
    raise exception 'end date cannot be before start date';
  end if;

  if p_lead_id is not null then
    select organization_id into v_lead_org from public.leads where id = p_lead_id;
    if v_lead_org is null or v_lead_org <> p_org_id then
      raise exception 'lead not found';
    end if;
  end if;

  if p_member_id is not null then
    select organization_id into v_member_org from public.gym_members where id = p_member_id;
    if v_member_org is null or v_member_org <> p_org_id then
      raise exception 'member not found';
    end if;
  end if;

  insert into public.trial_memberships (
    organization_id, branch_id, lead_id, member_id, starts_on, ends_on,
    status, notes, created_by
  )
  values (
    p_org_id,
    p_branch_id,
    p_lead_id,
    p_member_id,
    v_starts,
    v_ends,
    'scheduled',
    nullif(trim(p_notes), ''),
    auth.uid()
  )
  returning id into v_id;

  if p_lead_id is not null then
    update public.leads
    set status = 'trial'
    where id = p_lead_id and status in ('new', 'contacted', 'qualified');
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_trial_membership(
  uuid, uuid, uuid, uuid, date, date, text
) to authenticated;

create or replace function public.update_trial_membership(
  p_trial_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_status text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_starts date;
  v_ends date;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id, starts_on, ends_on into v_org_id, v_starts, v_ends
  from public.trial_memberships where id = p_trial_id;
  if v_org_id is null then
    raise exception 'trial not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');

  v_starts := coalesce(p_starts_on, v_starts);
  v_ends := coalesce(p_ends_on, v_ends);
  if v_ends < v_starts then
    raise exception 'end date cannot be before start date';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'scheduled');
  if v_status not in ('scheduled', 'active', 'completed', 'cancelled') then
    raise exception 'status is invalid';
  end if;

  update public.trial_memberships set
    starts_on = v_starts,
    ends_on = v_ends,
    status = v_status,
    notes = nullif(trim(p_notes), '')
  where id = p_trial_id;
end;
$$;

grant execute on function public.update_trial_membership(
  uuid, date, date, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------------------------

create or replace function public.create_referral(
  p_org_id uuid,
  p_referrer_member_id uuid,
  p_referred_name text,
  p_referred_phone text,
  p_referred_email text,
  p_reward text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_member_org uuid;
  v_name text;
  v_email text;
begin
  perform public.require_org_permission(p_org_id, 'crm.manage');

  if p_referrer_member_id is null then
    raise exception 'referrer is required';
  end if;
  select organization_id into v_member_org
  from public.gym_members where id = p_referrer_member_id;
  if v_member_org is null or v_member_org <> p_org_id then
    raise exception 'member not found';
  end if;

  v_name := trim(p_referred_name);
  if v_name is null or v_name = '' then
    raise exception 'referred name is required';
  end if;
  v_email := nullif(lower(trim(p_referred_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  insert into public.referrals (
    organization_id, referrer_member_id, referred_name, referred_phone,
    referred_email, status, reward, notes, created_by
  )
  values (
    p_org_id,
    p_referrer_member_id,
    v_name,
    nullif(trim(p_referred_phone), ''),
    v_email,
    'pending',
    nullif(trim(p_reward), ''),
    nullif(trim(p_notes), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_referral(
  uuid, uuid, text, text, text, text, text
) to authenticated;

create or replace function public.update_referral(
  p_referral_id uuid,
  p_referred_name text,
  p_referred_phone text,
  p_referred_email text,
  p_status text,
  p_reward text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
  v_email text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id into v_org_id
  from public.referrals where id = p_referral_id;
  if v_org_id is null then
    raise exception 'referral not found';
  end if;
  perform public.require_org_permission(v_org_id, 'crm.manage');

  v_name := trim(p_referred_name);
  if v_name is null or v_name = '' then
    raise exception 'referred name is required';
  end if;
  v_email := nullif(lower(trim(p_referred_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'pending');
  if v_status not in ('pending', 'converted', 'expired') then
    raise exception 'status is invalid';
  end if;

  update public.referrals set
    referred_name = v_name,
    referred_phone = nullif(trim(p_referred_phone), ''),
    referred_email = v_email,
    status = v_status,
    reward = nullif(trim(p_reward), ''),
    notes = nullif(trim(p_notes), '')
  where id = p_referral_id;
end;
$$;

grant execute on function public.update_referral(
  uuid, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Convert lead -> gym member (reuses gym_members + generate_gym_member_code)
-- ---------------------------------------------------------------------------

create or replace function public.convert_lead_to_member(
  p_lead_id uuid,
  p_branch_id uuid,
  p_last_name text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_member_id uuid;
  v_branch uuid;
  v_first text;
  v_last text;
  v_phone text;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_lead from public.leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'lead not found';
  end if;
  perform public.require_org_permission(v_lead.organization_id, 'crm.manage');
  perform public.require_org_permission(v_lead.organization_id, 'members.create');

  if v_lead.converted_member_id is not null then
    update public.leads
    set status = 'converted'
    where id = p_lead_id and status is distinct from 'converted';
    return v_lead.converted_member_id;
  end if;

  v_branch := coalesce(p_branch_id, v_lead.branch_id);
  perform public.require_branch_in_org(v_lead.organization_id, v_branch);

  v_first := trim(v_lead.first_name);
  v_last := coalesce(nullif(trim(p_last_name), ''), nullif(trim(v_lead.last_name), ''));
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  if v_last is null or v_last = '' then
    raise exception 'last name is required';
  end if;

  v_phone := coalesce(nullif(trim(p_phone), ''), nullif(trim(v_lead.phone), ''));
  v_phone := regexp_replace(trim(coalesce(v_phone, '')), '\s+', ' ', 'g');
  if v_phone is null or v_phone = '' then
    raise exception 'phone is required';
  end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'phone must contain at least 8 digits';
  end if;

  v_code := public.generate_gym_member_code(v_lead.organization_id);

  insert into public.gym_members (
    organization_id, branch_id, code,
    first_name, last_name, email, phone, notes, status, joined_at, created_by
  )
  values (
    v_lead.organization_id,
    v_branch,
    v_code,
    v_first,
    v_last,
    v_lead.email,
    v_phone,
    v_lead.notes,
    'active',
    (timezone('utc', now()))::date,
    auth.uid()
  )
  returning id into v_member_id;

  update public.leads
  set
    converted_member_id = v_member_id,
    status = 'converted',
    last_name = coalesce(v_lead.last_name, v_last),
    phone = coalesce(v_lead.phone, v_phone),
    branch_id = coalesce(v_lead.branch_id, v_branch)
  where id = p_lead_id;

  update public.follow_ups
  set member_id = coalesce(member_id, v_member_id)
  where lead_id = p_lead_id and organization_id = v_lead.organization_id;

  update public.trial_memberships
  set member_id = coalesce(member_id, v_member_id)
  where lead_id = p_lead_id and organization_id = v_lead.organization_id;

  return v_member_id;
end;
$$;

grant execute on function public.convert_lead_to_member(
  uuid, uuid, text, text
) to authenticated;
