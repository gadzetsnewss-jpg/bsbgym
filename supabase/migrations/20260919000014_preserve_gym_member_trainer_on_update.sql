-- =============================================================================
-- BSB FitForge - Preserve gym_members.assigned_trainer_id on profile update
-- =============================================================================
-- Additive. Phase 3.1's update_gym_member always set assigned_trainer_id = null
-- because trainers did not exist yet. After Phase 3.2 attached the trainers
-- FK, editing a member from the Members form would wipe an existing assignment.
--
-- This replaces update_gym_member so profile edits leave assigned_trainer_id
-- unchanged. Passing a non-null p_assigned_trainer_id is still rejected; the
-- trainers module RPCs own assignment.
-- =============================================================================

create or replace function public.update_gym_member(
  p_member_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_gender text default null,
  p_date_of_birth date default null,
  p_photo_url text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_notes text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_country text default null,
  p_joined_at date default null,
  p_assigned_trainer_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_old_branch uuid;
  v_phone text;
  v_email text;
  v_gender text;
  v_first text;
  v_last text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_member_id is null then
    raise exception 'member is required';
  end if;

  select organization_id, branch_id
  into v_org_id, v_old_branch
  from public.gym_members
  where id = p_member_id;

  if v_org_id is null then
    raise exception 'member not found';
  end if;
  if not public.is_org_member(v_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if not public.user_has_permission(v_org_id, 'members.update') then
    raise exception 'insufficient privileges';
  end if;
  if not public.user_has_branch_access(v_org_id, v_old_branch) then
    raise exception 'insufficient privileges';
  end if;
  if p_branch_id is null then
    raise exception 'branch is required';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id
      and b.organization_id = v_org_id
  ) then
    raise exception 'branch not found';
  end if;
  if not public.user_has_branch_access(v_org_id, p_branch_id) then
    raise exception 'insufficient privileges';
  end if;

  v_first := trim(p_first_name);
  v_last := trim(p_last_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  if v_last is null or v_last = '' then
    raise exception 'last name is required';
  end if;

  v_phone := regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g');
  if v_phone is null or v_phone = '' then
    raise exception 'phone is required';
  end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'phone must contain at least 8 digits';
  end if;

  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_gender := nullif(lower(trim(p_gender)), '');
  if v_gender is not null and v_gender not in ('male', 'female', 'other', 'unspecified') then
    raise exception 'gender is invalid';
  end if;

  if p_assigned_trainer_id is not null then
    raise exception 'trainer assignment is not available yet';
  end if;

  update public.gym_members
  set
    branch_id = p_branch_id,
    first_name = v_first,
    last_name = v_last,
    email = v_email,
    phone = v_phone,
    gender = v_gender,
    date_of_birth = p_date_of_birth,
    photo_url = nullif(trim(p_photo_url), ''),
    emergency_contact_name = nullif(trim(p_emergency_contact_name), ''),
    emergency_contact_phone = nullif(trim(p_emergency_contact_phone), ''),
    notes = nullif(trim(p_notes), ''),
    address_line1 = nullif(trim(p_address_line1), ''),
    address_line2 = nullif(trim(p_address_line2), ''),
    city = nullif(trim(p_city), ''),
    state = nullif(trim(p_state), ''),
    postal_code = nullif(trim(p_postal_code), ''),
    country = nullif(trim(p_country), ''),
    joined_at = coalesce(p_joined_at, joined_at)
  where id = p_member_id
    and organization_id = v_org_id;

  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

grant execute on function public.update_gym_member(
  uuid, uuid, text, text, text, text, text, date, text, text, text, text,
  text, text, text, text, text, text, date, uuid
) to authenticated;
