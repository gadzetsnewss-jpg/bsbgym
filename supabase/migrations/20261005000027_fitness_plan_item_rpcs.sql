-- =============================================================================
-- BSB FitForge - Workout/diet plan item write path
-- =============================================================================
-- Additive. Reuses public.workout_plan_items / diet_plan_items. organization_id
-- is derived from the parent plan. Writes go through SECURITY DEFINER RPCs.
-- Select-only RLS stays the read boundary. No hard deletes.
-- =============================================================================

create or replace function public.create_workout_plan_item(
  p_org_id uuid,
  p_plan_id uuid,
  p_exercise_id uuid,
  p_day_label text,
  p_sets integer,
  p_reps text,
  p_weight text,
  p_rest_seconds integer,
  p_sort_order integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org_id uuid;
  v_sort integer;
begin
  perform public.require_org_permission(p_org_id, 'fitness.manage');

  select organization_id into v_org_id
  from public.workout_plans
  where id = p_plan_id;
  if v_org_id is null or v_org_id <> p_org_id then
    raise exception 'plan not found';
  end if;

  if p_exercise_id is not null and not exists (
    select 1 from public.exercises e
    where e.id = p_exercise_id and e.organization_id = p_org_id
  ) then
    raise exception 'exercise not found';
  end if;

  v_sort := coalesce(p_sort_order, (
    select coalesce(max(i.sort_order), -1) + 1
    from public.workout_plan_items i
    where i.plan_id = p_plan_id
  ));

  insert into public.workout_plan_items (
    organization_id, plan_id, exercise_id, day_label, sets, reps, weight,
    rest_seconds, sort_order, notes
  )
  values (
    p_org_id, p_plan_id, p_exercise_id, nullif(trim(p_day_label), ''),
    p_sets, nullif(trim(p_reps), ''), nullif(trim(p_weight), ''),
    p_rest_seconds, v_sort, nullif(trim(p_notes), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_workout_plan_item(
  uuid, uuid, uuid, text, integer, text, text, integer, integer, text
) to authenticated;

create or replace function public.update_workout_plan_item(
  p_item_id uuid,
  p_exercise_id uuid,
  p_day_label text,
  p_sets integer,
  p_reps text,
  p_weight text,
  p_rest_seconds integer,
  p_sort_order integer,
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
  select organization_id into v_org_id from public.workout_plan_items where id = p_item_id;
  if v_org_id is null then
    raise exception 'item not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');

  if p_exercise_id is not null and not exists (
    select 1 from public.exercises e
    where e.id = p_exercise_id and e.organization_id = v_org_id
  ) then
    raise exception 'exercise not found';
  end if;

  update public.workout_plan_items set
    exercise_id = p_exercise_id,
    day_label = nullif(trim(p_day_label), ''),
    sets = p_sets,
    reps = nullif(trim(p_reps), ''),
    weight = nullif(trim(p_weight), ''),
    rest_seconds = p_rest_seconds,
    sort_order = coalesce(p_sort_order, sort_order),
    notes = nullif(trim(p_notes), '')
  where id = p_item_id;
end;
$$;

grant execute on function public.update_workout_plan_item(
  uuid, uuid, text, integer, text, text, integer, integer, text
) to authenticated;

create or replace function public.create_diet_plan_item(
  p_org_id uuid,
  p_diet_plan_id uuid,
  p_meal text,
  p_description text,
  p_calories integer,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org_id uuid;
  v_meal text;
  v_sort integer;
begin
  perform public.require_org_permission(p_org_id, 'fitness.manage');

  select organization_id into v_org_id
  from public.diet_plans
  where id = p_diet_plan_id;
  if v_org_id is null or v_org_id <> p_org_id then
    raise exception 'plan not found';
  end if;

  v_meal := trim(p_meal);
  if v_meal is null or v_meal = '' then
    raise exception 'meal is required';
  end if;

  v_sort := coalesce(p_sort_order, (
    select coalesce(max(i.sort_order), -1) + 1
    from public.diet_plan_items i
    where i.diet_plan_id = p_diet_plan_id
  ));

  insert into public.diet_plan_items (
    organization_id, diet_plan_id, meal, description, calories, sort_order
  )
  values (
    p_org_id, p_diet_plan_id, v_meal, nullif(trim(p_description), ''),
    p_calories, v_sort
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_diet_plan_item(
  uuid, uuid, text, text, integer, integer
) to authenticated;

create or replace function public.update_diet_plan_item(
  p_item_id uuid,
  p_meal text,
  p_description text,
  p_calories integer,
  p_sort_order integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_meal text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id from public.diet_plan_items where id = p_item_id;
  if v_org_id is null then
    raise exception 'item not found';
  end if;
  perform public.require_org_permission(v_org_id, 'fitness.manage');

  v_meal := trim(p_meal);
  if v_meal is null or v_meal = '' then
    raise exception 'meal is required';
  end if;

  update public.diet_plan_items set
    meal = v_meal,
    description = nullif(trim(p_description), ''),
    calories = p_calories,
    sort_order = coalesce(p_sort_order, sort_order)
  where id = p_item_id;
end;
$$;

grant execute on function public.update_diet_plan_item(
  uuid, text, text, integer, integer
) to authenticated;
