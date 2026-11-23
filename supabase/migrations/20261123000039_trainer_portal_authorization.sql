-- Trainer Portal Authorization & Scoping
-- Authorizes trainers to create/update PT sessions for actively assigned members
-- Enforces that trainers can only manage workout/diet plans and progress/measurements for actively assigned members

-- 1. create_pt_session
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
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not (
    public.user_has_permission(p_org_id, 'trainers.assign')
    or (
      public.linked_trainer_id(p_org_id) is not distinct from p_trainer_id
      and public.can_view_member_data(p_org_id, p_member_id)
    )
  ) then
    raise exception 'insufficient privileges';
  end if;

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

-- 2. update_pt_session
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
  v_trainer uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id, trainer_id into v_org_id, v_trainer
  from public.pt_sessions where id = p_session_id;

  if v_org_id is null then
    raise exception 'session not found';
  end if;

  if not (
    public.user_has_permission(v_org_id, 'trainers.edit')
    or (
      public.linked_trainer_id(v_org_id) is not distinct from v_trainer
      and p_trainer_id = v_trainer
      and public.can_view_member_data(v_org_id, p_member_id)
    )
  ) then
    raise exception 'insufficient privileges';
  end if;

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

-- 3. create_workout_plan
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
  if not public.can_view_member_data(p_org_id, p_member_id) then
    raise exception 'not authorized for this member';
  end if;
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

-- 4. update_workout_plan
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
  if not public.can_view_member_data(v_org_id, p_member_id) then
    raise exception 'not authorized for this member';
  end if;
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

-- 5. create_diet_plan
create or replace function public.create_diet_plan(
  p_org_id uuid,
  p_member_id uuid,
  p_trainer_id uuid,
  p_name text,
  p_daily_calorie_target integer,
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
  if not public.can_view_member_data(p_org_id, p_member_id) then
    raise exception 'not authorized for this member';
  end if;
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
    organization_id, member_id, trainer_id, name, daily_calorie_target,
    start_date, end_date, notes, is_active, created_by
  )
  values (
    p_org_id, p_member_id, p_trainer_id, v_name, p_daily_calorie_target,
    p_start_date, p_end_date, nullif(trim(p_notes), ''),
    coalesce(p_is_active, true), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_diet_plan(
  uuid, uuid, uuid, text, integer, date, date, text, boolean
) to authenticated;

-- 6. update_diet_plan
create or replace function public.update_diet_plan(
  p_plan_id uuid,
  p_member_id uuid,
  p_trainer_id uuid,
  p_name text,
  p_daily_calorie_target integer,
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
  if not public.can_view_member_data(v_org_id, p_member_id) then
    raise exception 'not authorized for this member';
  end if;
  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;

  update public.diet_plans set
    member_id = p_member_id,
    trainer_id = p_trainer_id,
    name = v_name,
    daily_calorie_target = p_daily_calorie_target,
    start_date = p_start_date,
    end_date = p_end_date,
    notes = nullif(trim(p_notes), ''),
    is_active = coalesce(p_is_active, true)
  where id = p_plan_id;
end;
$$;

grant execute on function public.update_diet_plan(
  uuid, uuid, uuid, text, integer, date, date, text, boolean
) to authenticated;

-- 7. create_body_measurement
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
  if not public.can_view_member_data(p_org_id, p_member_id) then
    raise exception 'not authorized for this member';
  end if;
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

-- 8. update_body_measurement
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
  if not public.can_view_member_data(v_org_id, p_member_id) then
    raise exception 'not authorized for this member';
  end if;

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

-- 9. create_progress_entry
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
  if not public.can_view_member_data(p_org_id, p_member_id) then
    raise exception 'not authorized for this member';
  end if;
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

grant execute on function public.create_progress_entry(
  uuid, uuid, date, numeric, text, text
) to authenticated;

-- 10. update_progress_entry
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
    raise exception 'entry not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');
  if not public.can_view_member_data(v_org_id, p_member_id) then
    raise exception 'not authorized for this member';
  end if;

  update public.progress_entries set
    member_id = p_member_id,
    entry_date = coalesce(p_entry_date, entry_date),
    weight_kg = p_weight_kg,
    photo_url = nullif(trim(p_photo_url), ''),
    notes = nullif(trim(p_notes), '')
  where id = p_entry_id;
end;
$$;

grant execute on function public.update_progress_entry(
  uuid, uuid, date, numeric, text, text
) to authenticated;
