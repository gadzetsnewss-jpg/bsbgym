-- =============================================================================
-- BSB FitForge - Phase 3.2b: Operations module write path
-- =============================================================================
-- SECURITY DEFINER RPCs for memberships, attendance, trainer assignments,
-- PT sessions, class bookings, workout/diet plans, measurements and progress.
-- Additive. organization_id is derived server-side. Soft status only.
-- =============================================================================

create or replace function public.require_org_permission(p_org_id uuid, p_permission text)
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
  if not public.is_org_member(p_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if not public.user_has_permission(p_org_id, p_permission) then
    raise exception 'insufficient privileges';
  end if;
end;
$$;

revoke all on function public.require_org_permission(uuid, text) from public, anon, authenticated;

create or replace function public.require_branch_in_org(p_org_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_branch_id is null then
    raise exception 'branch is required';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id and b.organization_id = p_org_id
  ) then
    raise exception 'branch not found';
  end if;
  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient privileges';
  end if;
end;
$$;

revoke all on function public.require_branch_in_org(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------

create or replace function public.create_membership(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_plan_id uuid,
  p_start_date date,
  p_end_date date,
  p_price numeric,
  p_discount numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_plan public.membership_plans%rowtype;
  v_start date;
  v_end date;
  v_price numeric;
  v_discount numeric;
  v_final numeric;
begin
  perform public.require_org_permission(p_org_id, 'memberships.create');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  select * into v_plan from public.membership_plans
  where id = p_plan_id and organization_id = p_org_id;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  v_start := coalesce(p_start_date, (timezone('utc', now()))::date);
  v_end := coalesce(p_end_date, v_start + (v_plan.duration_days || ' days')::interval);
  if v_end < v_start then
    raise exception 'end date cannot be before start date';
  end if;

  v_price := coalesce(p_price, v_plan.price);
  v_discount := coalesce(p_discount, 0);
  if v_price < 0 or v_discount < 0 then
    raise exception 'amounts cannot be negative';
  end if;
  v_final := greatest(v_price - v_discount, 0);

  insert into public.memberships (
    organization_id, branch_id, member_id, plan_id, status,
    start_date, end_date, price, discount, final_amount, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id, p_plan_id, 'active',
    v_start, v_end, v_price, v_discount, v_final, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_membership(
  uuid, uuid, uuid, uuid, date, date, numeric, numeric, text
) to authenticated;

create or replace function public.update_membership(
  p_membership_id uuid,
  p_branch_id uuid,
  p_plan_id uuid,
  p_start_date date,
  p_end_date date,
  p_price numeric,
  p_discount numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_price numeric;
  v_discount numeric;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.memberships where id = p_membership_id;
  if v_org_id is null then
    raise exception 'membership not found';
  end if;
  perform public.require_org_permission(v_org_id, 'memberships.update');
  perform public.require_branch_in_org(v_org_id, p_branch_id);

  if not exists (
    select 1 from public.membership_plans p
    where p.id = p_plan_id and p.organization_id = v_org_id
  ) then
    raise exception 'plan not found';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'start and end dates are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'end date cannot be before start date';
  end if;

  v_price := coalesce(p_price, 0);
  v_discount := coalesce(p_discount, 0);
  if v_price < 0 or v_discount < 0 then
    raise exception 'amounts cannot be negative';
  end if;

  update public.memberships set
    branch_id = p_branch_id,
    plan_id = p_plan_id,
    start_date = p_start_date,
    end_date = p_end_date,
    price = v_price,
    discount = v_discount,
    final_amount = greatest(v_price - v_discount, 0),
    notes = nullif(trim(p_notes), '')
  where id = p_membership_id;
end;
$$;

grant execute on function public.update_membership(
  uuid, uuid, uuid, date, date, numeric, numeric, text
) to authenticated;

create or replace function public.set_membership_status(
  p_membership_id uuid,
  p_status text
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
  select organization_id into v_org_id from public.memberships where id = p_membership_id;
  if v_org_id is null then
    raise exception 'membership not found';
  end if;
  perform public.require_org_permission(v_org_id, 'memberships.update');
  if p_status is null or p_status not in ('pending', 'active', 'expired', 'cancelled') then
    raise exception 'status is invalid';
  end if;

  update public.memberships set status = p_status where id = p_membership_id;
end;
$$;

grant execute on function public.set_membership_status(uuid, text) to authenticated;

create or replace function public.create_membership_freeze(
  p_org_id uuid,
  p_membership_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org uuid;
  v_days integer;
begin
  perform public.require_org_permission(p_org_id, 'memberships.freeze');

  select organization_id into v_org from public.memberships where id = p_membership_id;
  if v_org is null or v_org <> p_org_id then
    raise exception 'membership not found';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'start and end dates are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'end date cannot be before start date';
  end if;

  v_days := (p_end_date - p_start_date) + 1;
  if v_days <= 0 then
    raise exception 'freeze duration must be greater than zero';
  end if;

  insert into public.membership_freezes (
    organization_id, membership_id, start_date, end_date, days, reason, created_by
  )
  values (
    p_org_id, p_membership_id, p_start_date, p_end_date, v_days,
    nullif(trim(p_reason), ''), auth.uid()
  )
  returning id into v_id;

  update public.memberships set
    freeze_days_used = freeze_days_used + v_days,
    end_date = end_date + (v_days || ' days')::interval
  where id = p_membership_id;

  return v_id;
end;
$$;

grant execute on function public.create_membership_freeze(uuid, uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

create or replace function public.create_attendance_record(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_check_in_at timestamptz,
  p_method text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_method text;
begin
  perform public.require_org_permission(p_org_id, 'attendance.create');
  perform public.require_branch_in_org(p_org_id, p_branch_id);
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  v_method := coalesce(nullif(lower(trim(p_method)), ''), 'manual');
  if v_method not in ('manual', 'qr', 'biometric', 'app') then
    raise exception 'method is invalid';
  end if;

  insert into public.attendance_records (
    organization_id, branch_id, member_id, check_in_at, method, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id,
    coalesce(p_check_in_at, timezone('utc', now())),
    v_method, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_attendance_record(
  uuid, uuid, uuid, timestamptz, text, text
) to authenticated;

create or replace function public.update_attendance_record(
  p_record_id uuid,
  p_check_out_at timestamptz,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_in timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id, check_in_at into v_org_id, v_in
  from public.attendance_records where id = p_record_id;
  if v_org_id is null then
    raise exception 'attendance record not found';
  end if;
  perform public.require_org_permission(v_org_id, 'attendance.manage');
  if p_check_out_at is not null and p_check_out_at < v_in then
    raise exception 'check-out cannot be before check-in';
  end if;

  update public.attendance_records set
    check_out_at = p_check_out_at,
    notes = nullif(trim(p_notes), '')
  where id = p_record_id;
end;
$$;

grant execute on function public.update_attendance_record(uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Trainer assignments + PT sessions
-- ---------------------------------------------------------------------------

create or replace function public.create_trainer_assignment(
  p_org_id uuid,
  p_trainer_id uuid,
  p_member_id uuid,
  p_assigned_at date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_org_permission(p_org_id, 'trainers.assign');
  if not exists (
    select 1 from public.trainers t
    where t.id = p_trainer_id and t.organization_id = p_org_id
  ) then
    raise exception 'trainer not found';
  end if;
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  update public.trainer_assignments
  set status = 'ended'
  where member_id = p_member_id and organization_id = p_org_id and status = 'active';

  insert into public.trainer_assignments (
    organization_id, trainer_id, member_id, assigned_at, status, notes, created_by
  )
  values (
    p_org_id, p_trainer_id, p_member_id,
    coalesce(p_assigned_at, (timezone('utc', now()))::date),
    'active', nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  update public.gym_members
  set assigned_trainer_id = p_trainer_id
  where id = p_member_id and organization_id = p_org_id;

  return v_id;
end;
$$;

grant execute on function public.create_trainer_assignment(uuid, uuid, uuid, date, text) to authenticated;

create or replace function public.set_trainer_assignment_status(
  p_assignment_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_member uuid;
  v_trainer uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id, member_id, trainer_id into v_org_id, v_member, v_trainer
  from public.trainer_assignments where id = p_assignment_id;
  if v_org_id is null then
    raise exception 'assignment not found';
  end if;
  perform public.require_org_permission(v_org_id, 'trainers.reassign');

  update public.trainer_assignments
  set status = case when coalesce(p_active, false) then 'active' else 'ended' end
  where id = p_assignment_id;

  if coalesce(p_active, false) then
    update public.trainer_assignments
    set status = 'ended'
    where member_id = v_member and organization_id = v_org_id
      and status = 'active' and id <> p_assignment_id;
    update public.gym_members
    set assigned_trainer_id = v_trainer
    where id = v_member and organization_id = v_org_id;
  else
    update public.gym_members
    set assigned_trainer_id = null
    where id = v_member and organization_id = v_org_id
      and assigned_trainer_id = v_trainer;
  end if;
end;
$$;

grant execute on function public.set_trainer_assignment_status(uuid, boolean) to authenticated;

create or replace function public.create_pt_session(
  p_org_id uuid,
  p_branch_id uuid,
  p_trainer_id uuid,
  p_member_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_org_permission(p_org_id, 'trainers.assign');
  perform public.require_branch_in_org(p_org_id, p_branch_id);
  if not exists (
    select 1 from public.trainers t
    where t.id = p_trainer_id and t.organization_id = p_org_id
  ) then
    raise exception 'trainer not found';
  end if;
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;
  if p_scheduled_at is null then
    raise exception 'scheduled time is required';
  end if;
  if coalesce(p_duration_minutes, 0) <= 0 then
    raise exception 'duration must be greater than zero';
  end if;

  insert into public.pt_sessions (
    organization_id, branch_id, trainer_id, member_id, scheduled_at,
    duration_minutes, status, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_trainer_id, p_member_id, p_scheduled_at,
    p_duration_minutes, 'scheduled', nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_pt_session(
  uuid, uuid, uuid, uuid, timestamptz, integer, text
) to authenticated;

create or replace function public.update_pt_session(
  p_session_id uuid,
  p_branch_id uuid,
  p_trainer_id uuid,
  p_member_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_notes text
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
  select organization_id into v_org_id from public.pt_sessions where id = p_session_id;
  if v_org_id is null then
    raise exception 'session not found';
  end if;
  perform public.require_org_permission(v_org_id, 'trainers.edit');
  perform public.require_branch_in_org(v_org_id, p_branch_id);
  if p_scheduled_at is null then
    raise exception 'scheduled time is required';
  end if;
  if coalesce(p_duration_minutes, 0) <= 0 then
    raise exception 'duration must be greater than zero';
  end if;

  update public.pt_sessions set
    branch_id = p_branch_id,
    trainer_id = p_trainer_id,
    member_id = p_member_id,
    scheduled_at = p_scheduled_at,
    duration_minutes = p_duration_minutes,
    notes = nullif(trim(p_notes), '')
  where id = p_session_id;
end;
$$;

grant execute on function public.update_pt_session(
  uuid, uuid, uuid, uuid, timestamptz, integer, text
) to authenticated;

create or replace function public.set_pt_session_status(
  p_session_id uuid,
  p_status text
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
  select organization_id into v_org_id from public.pt_sessions where id = p_session_id;
  if v_org_id is null then
    raise exception 'session not found';
  end if;
  perform public.require_org_permission(v_org_id, 'trainers.edit');
  if p_status is null or p_status not in ('scheduled', 'completed', 'cancelled', 'no_show') then
    raise exception 'status is invalid';
  end if;
  update public.pt_sessions set status = p_status where id = p_session_id;
end;
$$;

grant execute on function public.set_pt_session_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Class bookings (creates a session when one is not supplied)
-- ---------------------------------------------------------------------------

create or replace function public.create_class_booking(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_class_session_id uuid,
  p_class_template_id uuid,
  p_trainer_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_status text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_session uuid;
  v_status text;
  v_template public.class_templates%rowtype;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  perform public.require_org_permission(p_org_id, 'bookings.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  v_status := coalesce(nullif(lower(trim(p_status)), ''), 'booked');
  if v_status not in ('booked', 'waitlisted', 'attended', 'no_show', 'cancelled') then
    raise exception 'status is invalid';
  end if;

  v_session := p_class_session_id;
  if v_session is null then
    if p_class_template_id is null then
      raise exception 'class is required';
    end if;
    select * into v_template from public.class_templates
    where id = p_class_template_id and organization_id = p_org_id;
    if v_template.id is null then
      raise exception 'class not found';
    end if;
    v_starts := coalesce(p_starts_at, timezone('utc', now()));
    v_ends := coalesce(
      p_ends_at,
      v_starts + (coalesce(v_template.duration_minutes, 60) || ' minutes')::interval
    );
    if v_ends < v_starts then
      raise exception 'end time cannot be before start time';
    end if;

    insert into public.class_sessions (
      organization_id, branch_id, class_template_id, trainer_id,
      starts_at, ends_at, capacity, status, created_by
    )
    values (
      p_org_id, p_branch_id, p_class_template_id,
      coalesce(p_trainer_id, v_template.trainer_id),
      v_starts, v_ends,
      coalesce(p_capacity, v_template.capacity, 0),
      'scheduled', auth.uid()
    )
    returning id into v_session;
  else
    if not exists (
      select 1 from public.class_sessions s
      where s.id = v_session and s.organization_id = p_org_id
    ) then
      raise exception 'class session not found';
    end if;
  end if;

  if exists (
    select 1 from public.class_bookings b
    where b.class_session_id = v_session and b.member_id = p_member_id
  ) then
    raise exception 'member is already booked for this class';
  end if;

  insert into public.class_bookings (
    organization_id, class_session_id, member_id, status, notes, created_by
  )
  values (
    p_org_id, v_session, p_member_id, v_status, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_class_booking(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text
) to authenticated;

create or replace function public.update_class_booking(
  p_booking_id uuid,
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
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.class_bookings where id = p_booking_id;
  if v_org_id is null then
    raise exception 'booking not found';
  end if;
  perform public.require_org_permission(v_org_id, 'bookings.manage');
  v_status := coalesce(nullif(lower(trim(p_status)), ''), 'booked');
  if v_status not in ('booked', 'waitlisted', 'attended', 'no_show', 'cancelled') then
    raise exception 'status is invalid';
  end if;
  update public.class_bookings set
    status = v_status,
    notes = nullif(trim(p_notes), '')
  where id = p_booking_id;
end;
$$;

grant execute on function public.update_class_booking(uuid, text, text) to authenticated;

create or replace function public.set_class_booking_status(
  p_booking_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.update_class_booking(p_booking_id, p_status, null);
end;
$$;

grant execute on function public.set_class_booking_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fitness
-- ---------------------------------------------------------------------------

create or replace function public.create_workout_plan(
  p_org_id uuid,
  p_member_id uuid,
  p_trainer_id uuid,
  p_name text,
  p_goal text,
  p_start_date date,
  p_end_date date,
  p_notes text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  perform public.require_org_permission(p_org_id, 'fitness.manage');
  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;
  if p_trainer_id is not null and not exists (
    select 1 from public.trainers t
    where t.id = p_trainer_id and t.organization_id = p_org_id
  ) then
    raise exception 'trainer not found';
  end if;

  insert into public.workout_plans (
    organization_id, member_id, trainer_id, name, goal, start_date, end_date,
    notes, is_active, created_by
  )
  values (
    p_org_id, p_member_id, p_trainer_id, v_name, nullif(trim(p_goal), ''),
    p_start_date, p_end_date, nullif(trim(p_notes), ''),
    coalesce(p_is_active, true), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_workout_plan(
  uuid, uuid, uuid, text, text, date, date, text, boolean
) to authenticated;

create or replace function public.update_workout_plan(
  p_plan_id uuid,
  p_member_id uuid,
  p_trainer_id uuid,
  p_name text,
  p_goal text,
  p_start_date date,
  p_end_date date,
  p_notes text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.workout_plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');
  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;
  update public.workout_plans set
    member_id = p_member_id,
    trainer_id = p_trainer_id,
    name = v_name,
    goal = nullif(trim(p_goal), ''),
    start_date = p_start_date,
    end_date = p_end_date,
    notes = nullif(trim(p_notes), ''),
    is_active = coalesce(p_is_active, true)
  where id = p_plan_id;
end;
$$;

grant execute on function public.update_workout_plan(
  uuid, uuid, uuid, text, text, date, date, text, boolean
) to authenticated;

create or replace function public.set_workout_plan_status(
  p_plan_id uuid,
  p_active boolean
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
  select organization_id into v_org_id from public.workout_plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');
  update public.workout_plans set is_active = coalesce(p_active, false) where id = p_plan_id;
end;
$$;

grant execute on function public.set_workout_plan_status(uuid, boolean) to authenticated;

create or replace function public.create_diet_plan(
  p_org_id uuid,
  p_member_id uuid,
  p_trainer_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_notes text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  perform public.require_org_permission(p_org_id, 'fitness.manage');
  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  insert into public.diet_plans (
    organization_id, member_id, trainer_id, name, start_date, end_date,
    notes, is_active, created_by
  )
  values (
    p_org_id, p_member_id, p_trainer_id, v_name, p_start_date, p_end_date,
    nullif(trim(p_notes), ''), coalesce(p_is_active, true), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_diet_plan(
  uuid, uuid, uuid, text, date, date, text, boolean
) to authenticated;

create or replace function public.update_diet_plan(
  p_plan_id uuid,
  p_member_id uuid,
  p_trainer_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_notes text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.diet_plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');
  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;
  update public.diet_plans set
    member_id = p_member_id,
    trainer_id = p_trainer_id,
    name = v_name,
    start_date = p_start_date,
    end_date = p_end_date,
    notes = nullif(trim(p_notes), ''),
    is_active = coalesce(p_is_active, true)
  where id = p_plan_id;
end;
$$;

grant execute on function public.update_diet_plan(
  uuid, uuid, uuid, text, date, date, text, boolean
) to authenticated;

create or replace function public.set_diet_plan_status(
  p_plan_id uuid,
  p_active boolean
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
  select organization_id into v_org_id from public.diet_plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');
  update public.diet_plans set is_active = coalesce(p_active, false) where id = p_plan_id;
end;
$$;

grant execute on function public.set_diet_plan_status(uuid, boolean) to authenticated;

create or replace function public.create_body_measurement(
  p_org_id uuid,
  p_member_id uuid,
  p_measured_at date,
  p_weight_kg numeric,
  p_height_cm numeric,
  p_body_fat_percent numeric,
  p_chest_cm numeric,
  p_waist_cm numeric,
  p_hips_cm numeric,
  p_arms_cm numeric,
  p_thighs_cm numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_org_permission(p_org_id, 'fitness.manage');
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  insert into public.body_measurements (
    organization_id, member_id, measured_at, weight_kg, height_cm, body_fat_percent,
    chest_cm, waist_cm, hips_cm, arms_cm, thighs_cm, notes, created_by
  )
  values (
    p_org_id, p_member_id, coalesce(p_measured_at, (timezone('utc', now()))::date),
    p_weight_kg, p_height_cm, p_body_fat_percent, p_chest_cm, p_waist_cm,
    p_hips_cm, p_arms_cm, p_thighs_cm, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_body_measurement(
  uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

create or replace function public.update_body_measurement(
  p_measurement_id uuid,
  p_member_id uuid,
  p_measured_at date,
  p_weight_kg numeric,
  p_height_cm numeric,
  p_body_fat_percent numeric,
  p_chest_cm numeric,
  p_waist_cm numeric,
  p_hips_cm numeric,
  p_arms_cm numeric,
  p_thighs_cm numeric,
  p_notes text
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
  select organization_id into v_org_id from public.body_measurements where id = p_measurement_id;
  if v_org_id is null then
    raise exception 'measurement not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');
  update public.body_measurements set
    member_id = p_member_id,
    measured_at = coalesce(p_measured_at, measured_at),
    weight_kg = p_weight_kg,
    height_cm = p_height_cm,
    body_fat_percent = p_body_fat_percent,
    chest_cm = p_chest_cm,
    waist_cm = p_waist_cm,
    hips_cm = p_hips_cm,
    arms_cm = p_arms_cm,
    thighs_cm = p_thighs_cm,
    notes = nullif(trim(p_notes), '')
  where id = p_measurement_id;
end;
$$;

grant execute on function public.update_body_measurement(
  uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

create or replace function public.create_progress_entry(
  p_org_id uuid,
  p_member_id uuid,
  p_entry_date date,
  p_weight_kg numeric,
  p_photo_url text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_org_permission(p_org_id, 'fitness.manage');
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  insert into public.progress_entries (
    organization_id, member_id, entry_date, weight_kg, photo_url, notes, created_by
  )
  values (
    p_org_id, p_member_id, coalesce(p_entry_date, (timezone('utc', now()))::date),
    p_weight_kg, nullif(trim(p_photo_url), ''), nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_progress_entry(uuid, uuid, date, numeric, text, text) to authenticated;

create or replace function public.update_progress_entry(
  p_entry_id uuid,
  p_member_id uuid,
  p_entry_date date,
  p_weight_kg numeric,
  p_photo_url text,
  p_notes text
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
  select organization_id into v_org_id from public.progress_entries where id = p_entry_id;
  if v_org_id is null then
    raise exception 'progress entry not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');
  update public.progress_entries set
    member_id = p_member_id,
    entry_date = coalesce(p_entry_date, entry_date),
    weight_kg = p_weight_kg,
    photo_url = nullif(trim(p_photo_url), ''),
    notes = nullif(trim(p_notes), '')
  where id = p_entry_id;
end;
$$;

grant execute on function public.update_progress_entry(uuid, uuid, date, numeric, text, text) to authenticated;
