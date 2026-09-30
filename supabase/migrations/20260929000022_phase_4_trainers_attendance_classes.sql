-- Phase 4: attendance membership/freeze/open-check-in guards,
-- first-class class session write RPCs, and booking capacity/waitlist.

-- ---------------------------------------------------------------------------
-- Attendance: require an active membership covering the check-in date,
-- reject freeze windows, and block a second open check-in.
-- Signature of create_attendance_record is unchanged.
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
  v_check_in timestamptz;
  v_check_date date;
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

  v_check_in := coalesce(p_check_in_at, timezone('utc', now()));
  v_check_date := (timezone('utc', v_check_in))::date;

  if not exists (
    select 1 from public.memberships m
    where m.member_id = p_member_id
      and m.organization_id = p_org_id
      and m.status = 'active'
      and m.start_date <= v_check_date
      and m.end_date >= v_check_date
  ) then
    raise exception 'member does not have an active membership';
  end if;

  if exists (
    select 1
    from public.membership_freezes f
    join public.memberships m on m.id = f.membership_id
    where m.member_id = p_member_id
      and m.organization_id = p_org_id
      and f.start_date <= v_check_date
      and f.end_date >= v_check_date
  ) then
    raise exception 'check-in is not allowed during a membership freeze';
  end if;

  if exists (
    select 1 from public.attendance_records r
    where r.member_id = p_member_id
      and r.organization_id = p_org_id
      and r.check_out_at is null
  ) then
    raise exception 'member already has an open check-in';
  end if;

  insert into public.attendance_records (
    organization_id, branch_id, member_id, check_in_at, method, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id,
    v_check_in,
    v_method, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_attendance_record(
  uuid, uuid, uuid, timestamptz, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Class sessions (additive write path; table already exists)
-- ---------------------------------------------------------------------------

create or replace function public.create_class_session(
  p_org_id uuid,
  p_branch_id uuid,
  p_class_template_id uuid,
  p_trainer_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_template public.class_templates%rowtype;
  v_starts timestamptz;
  v_ends timestamptz;
  v_trainer uuid;
  v_capacity integer;
begin
  perform public.require_org_permission(p_org_id, 'classes.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

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

  if p_trainer_id is not null then
    if not exists (
      select 1 from public.trainers t
      where t.id = p_trainer_id and t.organization_id = p_org_id
    ) then
      raise exception 'trainer not found';
    end if;
    v_trainer := p_trainer_id;
  else
    v_trainer := v_template.trainer_id;
  end if;

  v_capacity := coalesce(p_capacity, v_template.capacity, 0);
  if v_capacity < 0 then
    raise exception 'capacity cannot be negative';
  end if;

  insert into public.class_sessions (
    organization_id, branch_id, class_template_id, trainer_id,
    starts_at, ends_at, capacity, status, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_class_template_id, v_trainer,
    v_starts, v_ends, v_capacity, 'scheduled',
    nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_class_session(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text
) to authenticated;

create or replace function public.update_class_session(
  p_session_id uuid,
  p_branch_id uuid,
  p_trainer_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
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
  v_capacity integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.class_sessions where id = p_session_id;
  if v_org_id is null then
    raise exception 'class session not found';
  end if;
  perform public.require_org_permission(v_org_id, 'classes.manage');
  perform public.require_branch_in_org(v_org_id, p_branch_id);

  if p_starts_at is null or p_ends_at is null then
    raise exception 'start and end time are required';
  end if;
  if p_ends_at < p_starts_at then
    raise exception 'end time cannot be before start time';
  end if;

  v_status := coalesce(nullif(lower(trim(p_status)), ''), 'scheduled');
  if v_status not in ('scheduled', 'completed', 'cancelled') then
    raise exception 'status is invalid';
  end if;

  if p_trainer_id is not null then
    if not exists (
      select 1 from public.trainers t
      where t.id = p_trainer_id and t.organization_id = v_org_id
    ) then
      raise exception 'trainer not found';
    end if;
  end if;

  v_capacity := coalesce(p_capacity, 0);
  if v_capacity < 0 then
    raise exception 'capacity cannot be negative';
  end if;

  update public.class_sessions set
    branch_id = p_branch_id,
    trainer_id = p_trainer_id,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    capacity = v_capacity,
    status = v_status,
    notes = nullif(trim(p_notes), ''),
    updated_at = timezone('utc', now())
  where id = p_session_id;
end;
$$;

grant execute on function public.update_class_session(
  uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text
) to authenticated;

create or replace function public.set_class_session_status(
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
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.class_sessions where id = p_session_id;
  if v_org_id is null then
    raise exception 'class session not found';
  end if;
  perform public.require_org_permission(v_org_id, 'classes.manage');
  v_status := coalesce(nullif(lower(trim(p_status)), ''), '');
  if v_status not in ('scheduled', 'completed', 'cancelled') then
    raise exception 'status is invalid';
  end if;
  update public.class_sessions set
    status = v_status,
    updated_at = timezone('utc', now())
  where id = p_session_id;
end;
$$;

grant execute on function public.set_class_session_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bookings: capacity auto-waitlist, keep duplicate-member guard.
-- Signature of create_class_booking is unchanged.
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
  v_capacity integer;
  v_taken integer;
  v_session_status text;
  v_check_date date;
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

  select s.capacity, s.status, (timezone('utc', s.starts_at))::date
    into v_capacity, v_session_status, v_check_date
  from public.class_sessions s
  where s.id = v_session;

  if v_session_status = 'cancelled' then
    raise exception 'class session is cancelled';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.member_id = p_member_id
      and m.organization_id = p_org_id
      and m.status = 'active'
      and m.start_date <= v_check_date
      and m.end_date >= v_check_date
  ) then
    raise exception 'member does not have an active membership';
  end if;

  if exists (
    select 1
    from public.membership_freezes f
    join public.memberships m on m.id = f.membership_id
    where m.member_id = p_member_id
      and m.organization_id = p_org_id
      and f.start_date <= v_check_date
      and f.end_date >= v_check_date
  ) then
    raise exception 'booking is not allowed during a membership freeze';
  end if;

  if exists (
    select 1 from public.class_bookings b
    where b.class_session_id = v_session and b.member_id = p_member_id
  ) then
    raise exception 'member is already booked for this class';
  end if;

  if v_status in ('booked', 'attended') then
    select count(*)::integer into v_taken
    from public.class_bookings b
    where b.class_session_id = v_session
      and b.status in ('booked', 'attended');
    if coalesce(v_capacity, 0) > 0 and coalesce(v_taken, 0) >= v_capacity then
      v_status := 'waitlisted';
    end if;
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
  v_old_status text;
  v_session uuid;
  v_wait uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id, status, class_session_id
    into v_org_id, v_old_status, v_session
  from public.class_bookings where id = p_booking_id;
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

  if v_old_status in ('booked', 'attended') and v_status in ('cancelled', 'no_show') then
    select b.id into v_wait
    from public.class_bookings b
    where b.class_session_id = v_session
      and b.status = 'waitlisted'
    order by b.created_at
    limit 1;
    if v_wait is not null then
      update public.class_bookings set status = 'booked' where id = v_wait;
    end if;
  end if;
end;
$$;

grant execute on function public.update_class_booking(uuid, text, text) to authenticated;
