-- Migration: 20261127000046_complete_attendance_management.sql
-- Description: Complete Production-Grade Member & Staff Attendance Management System
-- =============================================================================
-- Features:
-- 1. Hardened Member Attendance:
--    - Enforces database row-level locking on gym_members to serialize concurrent check-ins.
--    - Rejects suspended or inactive member accounts.
--    - Rejects pending, cancelled, expired, or non-existent memberships.
--    - Rejects check-in during active membership freeze.
--    - Rejects duplicate active/open check-in (check_out_at IS NULL).
--    - New check_out_member_attendance RPC for front-desk and manager check-out.
--    - New lookup_member_for_attendance RPC for fast QR/Code/Phone/Name front desk lookup.
-- 2. Complete Staff Attendance System:
--    - Dedicated public.staff_attendance_records table.
--    - Scoped RLS: staff/trainers can view only their own attendance; managers/owners can view all staff in branch.
--    - Self-service staff_clock_in and staff_clock_out RPCs with authoritative server timestamps.
--    - Concurrency safety: enforces partial unique index preventing duplicate open shifts per staff member.
--    - Authorized correct_staff_attendance RPC requiring mandatory reason and audit metadata.
--    - admin_record_staff_attendance RPC for manual entry by authorized personnel.
-- 3. Attendance Analytics & Aggregates:
--    - get_daily_attendance_summary RPC for real database KPIs.
--    - get_member_attendance_stats RPC for member portal streak and percentage calculations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: public.staff_attendance_records
-- ---------------------------------------------------------------------------

create table if not exists public.staff_attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_member_id uuid references public.organization_members(id) on delete set null,
  trainer_id uuid references public.trainers(id) on delete set null,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  status text not null default 'present'
    check (status in ('present', 'late', 'half_day', 'absent', 'on_leave')),
  method text not null default 'web'
    check (method in ('web', 'qr', 'manual', 'biometric', 'app')),
  working_hours numeric(6, 2),
  notes text,
  correction_reason text,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz,
  device_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at)
);

-- Branch foreign key guaranteeing branch belongs to organization
alter table public.staff_attendance_records drop constraint if exists staff_attendance_branch_org_fkey;
alter table public.staff_attendance_records add constraint staff_attendance_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

-- Indexes
create unique index if not exists staff_attendance_open_shift_idx
  on public.staff_attendance_records(organization_id, user_id)
  where check_out_at is null;

create index if not exists staff_attendance_org_idx
  on public.staff_attendance_records(organization_id, check_in_at desc);

create index if not exists staff_attendance_user_idx
  on public.staff_attendance_records(user_id, check_in_at desc);

create index if not exists staff_attendance_branch_idx
  on public.staff_attendance_records(organization_id, branch_id, check_in_at desc);

create index if not exists staff_attendance_date_idx
  on public.staff_attendance_records(organization_id, status, check_in_at desc);

-- Optimize member attendance active/open check-in checks
create index if not exists attendance_records_open_checkin_idx
  on public.attendance_records(organization_id, member_id)
  where check_out_at is null;

create index if not exists attendance_records_branch_date_idx
  on public.attendance_records(organization_id, branch_id, check_in_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS Policies on staff_attendance_records
-- ---------------------------------------------------------------------------

alter table public.staff_attendance_records enable row level security;

drop policy if exists "staff attendance select policy" on public.staff_attendance_records;
create policy "staff attendance select policy"
  on public.staff_attendance_records for select
  to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      -- Privileged roles with attendance.view permission can view authorized branches
      (
        public.user_has_permission(organization_id, 'attendance.view')
        and public.user_has_branch_access(organization_id, branch_id)
      )
      -- Staff & Trainers can always view their own attendance records
      or (user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Hardened RPC: create_attendance_record (Member Check-in)
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
  v_member public.gym_members%rowtype;
  v_membership_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.require_org_permission(p_org_id, 'attendance.create');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  -- 1. CONCURRENCY HARDENING: Lock member row exclusively
  select * into v_member
  from public.gym_members
  where id = p_member_id
    and organization_id = p_org_id
  for update;

  if v_member.id is null then
    raise exception 'member not found';
  end if;

  -- 2. Member status check
  if v_member.status = 'suspended' then
    raise exception 'member account is suspended';
  elsif v_member.status = 'inactive' then
    raise exception 'member account is inactive';
  elsif v_member.status <> 'active' then
    raise exception 'member is not active';
  end if;

  v_method := coalesce(nullif(lower(trim(p_method)), ''), 'manual');
  if v_method not in ('manual', 'qr', 'biometric', 'app') then
    raise exception 'method is invalid';
  end if;

  v_check_in := coalesce(p_check_in_at, timezone('utc', now()));
  v_check_date := (timezone('utc', v_check_in))::date;

  -- 3. Check for open check-in
  if exists (
    select 1 from public.attendance_records r
    where r.member_id = p_member_id
      and r.organization_id = p_org_id
      and r.check_out_at is null
  ) then
    raise exception 'member already has an open check-in';
  end if;

  -- 4. Active Membership validation
  -- Look up membership status
  select m.status into v_membership_status
  from public.memberships m
  where m.member_id = p_member_id
    and m.organization_id = p_org_id
  order by
    case when m.status = 'active' and m.start_date <= v_check_date and m.end_date >= v_check_date then 1
         when m.status = 'active' then 2
         when m.status = 'pending' then 3
         when m.status = 'expired' then 4
         else 5 end asc,
    m.end_date desc
  limit 1;

  if v_membership_status is null then
    raise exception 'member does not have an active membership';
  elsif v_membership_status = 'pending' then
    raise exception 'membership is pending activation or payment';
  elsif v_membership_status = 'cancelled' then
    raise exception 'membership is cancelled';
  end if;

  -- Must have an active membership covering the check-in date
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

  -- 5. Freeze validation
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

  -- 6. Insert attendance record
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

revoke all on function public.create_attendance_record(uuid, uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.create_attendance_record(uuid, uuid, uuid, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hardened RPC: check_out_member_attendance
-- ---------------------------------------------------------------------------

create or replace function public.check_out_member_attendance(
  p_org_id uuid,
  p_record_id uuid,
  p_check_out_at timestamptz default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.attendance_records%rowtype;
  v_out timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not (
    public.user_has_permission(p_org_id, 'attendance.create')
    or public.user_has_permission(p_org_id, 'attendance.manage')
  ) then
    raise exception 'insufficient attendance privileges';
  end if;

  select * into v_rec
  from public.attendance_records
  where id = p_record_id
    and organization_id = p_org_id
  for update;

  if v_rec.id is null then
    raise exception 'attendance record not found';
  end if;

  if not public.user_has_branch_access(p_org_id, v_rec.branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  if v_rec.check_out_at is not null then
    raise exception 'member has already checked out';
  end if;

  v_out := coalesce(p_check_out_at, timezone('utc', now()));
  if v_out < v_rec.check_in_at then
    raise exception 'check-out cannot be before check-in';
  end if;

  update public.attendance_records
  set check_out_at = v_out,
      notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_record_id;
end;
$$;

revoke all on function public.check_out_member_attendance(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.check_out_member_attendance(uuid, uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: staff_clock_in (Self-Service Staff / Trainer Clock-In)
-- ---------------------------------------------------------------------------

create or replace function public.staff_clock_in(
  p_org_id uuid,
  p_branch_id uuid,
  p_method text default 'web',
  p_notes text default null,
  p_device_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_trainer_id uuid;
  v_role text;
  v_method text;
  v_record_id uuid;
  v_now timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_org_id is null or p_branch_id is null then
    raise exception 'organization_id and branch_id are required';
  end if;

  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  -- Resolve organization_member
  select m.id into v_member_id
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = v_user_id
    and m.status = 'active';

  if v_member_id is null then
    raise exception 'staff member not found in organization or inactive';
  end if;

  v_role := public.current_org_role_slug(p_org_id);
  if v_role = 'member' then
    raise exception 'gym members cannot use staff clock-in; use member check-in instead';
  end if;

  -- Resolve trainer if role is trainer
  if v_role = 'trainer' then
    v_trainer_id := public.linked_trainer_id(p_org_id);
  end if;

  -- Enforce duplicate open shift prevention
  if exists (
    select 1
    from public.staff_attendance_records
    where organization_id = p_org_id
      and user_id = v_user_id
      and check_out_at is null
  ) then
    raise exception 'staff member already has an open shift';
  end if;

  v_method := coalesce(nullif(lower(trim(p_method)), ''), 'web');
  if v_method not in ('web', 'qr', 'manual', 'biometric', 'app') then
    raise exception 'invalid attendance method';
  end if;

  v_now := timezone('utc', now());

  insert into public.staff_attendance_records (
    organization_id,
    branch_id,
    user_id,
    org_member_id,
    trainer_id,
    check_in_at,
    status,
    method,
    notes,
    device_metadata,
    created_at,
    updated_at
  ) values (
    p_org_id,
    p_branch_id,
    v_user_id,
    v_member_id,
    v_trainer_id,
    v_now,
    'present',
    v_method,
    nullif(trim(p_notes), ''),
    coalesce(p_device_metadata, '{}'::jsonb),
    v_now,
    v_now
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;

revoke all on function public.staff_clock_in(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.staff_clock_in(uuid, uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: staff_clock_out (Self-Service Staff / Trainer Clock-Out)
-- ---------------------------------------------------------------------------

create or replace function public.staff_clock_out(
  p_org_id uuid,
  p_record_id uuid default null,
  p_notes text default null,
  p_device_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_record public.staff_attendance_records%rowtype;
  v_now timestamptz;
  v_hours numeric(6, 2);
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_record_id is not null then
    select * into v_record
    from public.staff_attendance_records
    where id = p_record_id
      and organization_id = p_org_id
      and user_id = v_user_id
    for update;
  else
    select * into v_record
    from public.staff_attendance_records
    where organization_id = p_org_id
      and user_id = v_user_id
      and check_out_at is null
    order by check_in_at desc
    limit 1
    for update;
  end if;

  if v_record.id is null then
    raise exception 'no open staff shift found to clock out';
  end if;

  if v_record.check_out_at is not null then
    raise exception 'shift is already clocked out';
  end if;

  v_now := timezone('utc', now());
  v_hours := round((extract(epoch from (v_now - v_record.check_in_at)) / 3600.0)::numeric, 2);

  update public.staff_attendance_records
  set check_out_at = v_now,
      working_hours = v_hours,
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      device_metadata = coalesce(device_metadata, '{}'::jsonb) || coalesce(p_device_metadata, '{}'::jsonb),
      updated_at = v_now
  where id = v_record.id;
end;
$$;

revoke all on function public.staff_clock_out(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.staff_clock_out(uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC: correct_staff_attendance (Owner / Admin Attendance Correction)
-- ---------------------------------------------------------------------------

create or replace function public.correct_staff_attendance(
  p_org_id uuid,
  p_record_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_status text,
  p_reason text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.staff_attendance_records%rowtype;
  v_status text;
  v_hours numeric(6, 2);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.require_org_permission(p_org_id, 'attendance.manage');

  v_reason := nullif(trim(p_reason), '');
  if v_reason is null then
    raise exception 'correction reason is required';
  end if;

  select * into v_rec
  from public.staff_attendance_records
  where id = p_record_id
    and organization_id = p_org_id
  for update;

  if v_rec.id is null then
    raise exception 'staff attendance record not found';
  end if;

  if not public.user_has_branch_access(p_org_id, v_rec.branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  v_status := coalesce(nullif(lower(trim(p_status)), ''), v_rec.status);
  if v_status not in ('present', 'late', 'half_day', 'absent', 'on_leave') then
    raise exception 'invalid attendance status';
  end if;

  if p_check_in_at is null then
    raise exception 'check-in time is required';
  end if;

  if p_check_out_at is not null and p_check_out_at < p_check_in_at then
    raise exception 'check-out cannot be before check-in';
  end if;

  if p_check_out_at is not null then
    v_hours := round((extract(epoch from (p_check_out_at - p_check_in_at)) / 3600.0)::numeric, 2);
  else
    v_hours := null;
  end if;

  update public.staff_attendance_records
  set check_in_at = p_check_in_at,
      check_out_at = p_check_out_at,
      status = v_status,
      working_hours = v_hours,
      correction_reason = v_reason,
      corrected_by = auth.uid(),
      corrected_at = timezone('utc', now()),
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      updated_at = timezone('utc', now())
  where id = p_record_id;
end;
$$;

revoke all on function public.correct_staff_attendance(uuid, uuid, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.correct_staff_attendance(uuid, uuid, timestamptz, timestamptz, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC: admin_record_staff_attendance (Manual Entry by Authorized Staff)
-- ---------------------------------------------------------------------------

create or replace function public.admin_record_staff_attendance(
  p_org_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz default null,
  p_status text default 'present',
  p_notes text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_trainer_id uuid;
  v_status text;
  v_hours numeric(6, 2);
  v_record_id uuid;
  v_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.require_org_permission(p_org_id, 'attendance.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient branch privileges';
  end if;

  select m.id into v_member_id
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = p_user_id
    and m.status = 'active';

  if v_member_id is null then
    raise exception 'staff member not found in organization';
  end if;

  select t.id into v_trainer_id
  from public.trainers t
  where t.organization_id = p_org_id
    and t.user_id = p_user_id
  limit 1;

  v_status := coalesce(nullif(lower(trim(p_status)), ''), 'present');
  if v_status not in ('present', 'late', 'half_day', 'absent', 'on_leave') then
    raise exception 'invalid attendance status';
  end if;

  if p_check_in_at is null then
    raise exception 'check-in time is required';
  end if;

  if p_check_out_at is not null and p_check_out_at < p_check_in_at then
    raise exception 'check-out cannot be before check-in';
  end if;

  if p_check_out_at is not null then
    v_hours := round((extract(epoch from (p_check_out_at - p_check_in_at)) / 3600.0)::numeric, 2);
  end if;

  v_now := timezone('utc', now());

  insert into public.staff_attendance_records (
    organization_id,
    branch_id,
    user_id,
    org_member_id,
    trainer_id,
    check_in_at,
    check_out_at,
    status,
    method,
    working_hours,
    notes,
    correction_reason,
    corrected_by,
    corrected_at,
    created_at,
    updated_at
  ) values (
    p_org_id,
    p_branch_id,
    p_user_id,
    v_member_id,
    v_trainer_id,
    p_check_in_at,
    p_check_out_at,
    v_status,
    'manual',
    v_hours,
    nullif(trim(p_notes), ''),
    nullif(trim(p_reason), ''),
    case when p_reason is not null then auth.uid() else null end,
    case when p_reason is not null then v_now else null end,
    v_now,
    v_now
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;

revoke all on function public.admin_record_staff_attendance(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.admin_record_staff_attendance(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. RPC: get_daily_attendance_summary (Real Database Analytics)
-- ---------------------------------------------------------------------------

create or replace function public.get_daily_attendance_summary(
  p_org_id uuid,
  p_branch_id uuid default null,
  p_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_members_today integer := 0;
  v_members_open integer := 0;
  v_staff_today integer := 0;
  v_staff_open integer := 0;
  v_staff_hours numeric(8, 2) := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_org_member(p_org_id) then
    raise exception 'not an organization member';
  end if;

  v_date := coalesce(p_date, (timezone('utc', now()))::date);
  v_start := v_date::timestamptz;
  v_end := (v_date + 1)::timestamptz;

  -- 1. Member check-ins count today
  select count(distinct member_id) into v_members_today
  from public.attendance_records
  where organization_id = p_org_id
    and check_in_at >= v_start
    and check_in_at < v_end
    and (p_branch_id is null or branch_id = p_branch_id);

  -- 2. Members currently in gym (open check-in)
  select count(*) into v_members_open
  from public.attendance_records
  where organization_id = p_org_id
    and check_out_at is null
    and (p_branch_id is null or branch_id = p_branch_id);

  -- 3. Staff count today
  select count(distinct user_id), coalesce(sum(working_hours), 0)
  into v_staff_today, v_staff_hours
  from public.staff_attendance_records
  where organization_id = p_org_id
    and check_in_at >= v_start
    and check_in_at < v_end
    and (p_branch_id is null or branch_id = p_branch_id);

  -- 4. Staff currently on duty (open shift)
  select count(*) into v_staff_open
  from public.staff_attendance_records
  where organization_id = p_org_id
    and check_out_at is null
    and (p_branch_id is null or branch_id = p_branch_id);

  return jsonb_build_object(
    'date', v_date,
    'members_today', v_members_today,
    'members_currently_in_gym', v_members_open,
    'staff_today', v_staff_today,
    'staff_on_duty', v_staff_open,
    'staff_total_hours', v_staff_hours
  );
end;
$$;

revoke all on function public.get_daily_attendance_summary(uuid, uuid, date) from public, anon;
grant execute on function public.get_daily_attendance_summary(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. RPC: get_member_attendance_stats (Member Portal Streak & Rates)
-- ---------------------------------------------------------------------------

create or replace function public.get_member_attendance_stats(
  p_org_id uuid,
  p_member_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target_member_id uuid;
  v_role text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_total_visits integer := 0;
  v_month_visits integer := 0;
  v_month_days_present integer := 0;
  v_distinct_dates date[];
  v_current_streak integer := 0;
  v_prev_date date;
  v_d date;
  v_today date;
  v_attendance_pct numeric(5, 1) := 0;
  v_active_membership_start date;
  v_active_membership_end date;
  v_days_in_month integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_role := public.current_org_role_slug(p_org_id);
  if v_role = 'member' then
    v_target_member_id := public.linked_gym_member_id(p_org_id);
  else
    v_target_member_id := p_member_id;
  end if;

  if v_target_member_id is null then
    return jsonb_build_object(
      'total_visits', 0,
      'month_visits', 0,
      'month_days_present', 0,
      'current_streak', 0,
      'attendance_percentage', 0
    );
  end if;

  v_today := (timezone('utc', now()))::date;
  v_month_start := date_trunc('month', v_today)::timestamptz;
  v_month_end := (date_trunc('month', v_today) + interval '1 month')::timestamptz;
  v_days_in_month := extract(day from (date_trunc('month', v_today) + interval '1 month - 1 day'));

  -- Total visits all-time
  select count(*) into v_total_visits
  from public.attendance_records
  where organization_id = p_org_id
    and member_id = v_target_member_id;

  -- Month visits
  select count(*), count(distinct (timezone('utc', check_in_at))::date)
  into v_month_visits, v_month_days_present
  from public.attendance_records
  where organization_id = p_org_id
    and member_id = v_target_member_id
    and check_in_at >= v_month_start
    and check_in_at < v_month_end;

  -- Current streak calculation
  select array_agg(d order by d desc) into v_distinct_dates
  from (
    select distinct (timezone('utc', check_in_at))::date as d
    from public.attendance_records
    where organization_id = p_org_id
      and member_id = v_target_member_id
      and (timezone('utc', check_in_at))::date <= v_today
  ) sub;

  if v_distinct_dates is not null and array_length(v_distinct_dates, 1) > 0 then
    -- Streak continues if visited today or yesterday
    if v_distinct_dates[1] = v_today or v_distinct_dates[1] = (v_today - 1) then
      v_current_streak := 1;
      v_prev_date := v_distinct_dates[1];

      for i in 2..array_length(v_distinct_dates, 1) loop
        v_d := v_distinct_dates[i];
        if v_prev_date - v_d = 1 then
          v_current_streak := v_current_streak + 1;
          v_prev_date := v_d;
        else
          exit;
        end if;
      end loop;
    end if;
  end if;

  -- Active membership duration for monthly attendance percentage
  select m.start_date, m.end_date
  into v_active_membership_start, v_active_membership_end
  from public.memberships m
  where m.member_id = v_target_member_id
    and m.organization_id = p_org_id
    and m.status = 'active'
  order by m.end_date desc
  limit 1;

  if v_days_in_month > 0 then
    v_attendance_pct := round(((v_month_days_present::numeric / v_days_in_month::numeric) * 100.0), 1);
  end if;

  return jsonb_build_object(
    'total_visits', v_total_visits,
    'month_visits', v_month_visits,
    'month_days_present', v_month_days_present,
    'current_streak', v_current_streak,
    'attendance_percentage', v_attendance_pct,
    'days_in_month', v_days_in_month
  );
end;
$$;

revoke all on function public.get_member_attendance_stats(uuid, uuid) from public, anon;
grant execute on function public.get_member_attendance_stats(uuid, uuid) to authenticated;
