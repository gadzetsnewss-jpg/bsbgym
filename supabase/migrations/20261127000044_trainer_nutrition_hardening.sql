-- Migration: 20261127000044_trainer_nutrition_hardening.sql
-- Description: Corrective hardening for Nutrition Planning Module (20261127000043).
-- =============================================================================
-- Fixes:
-- 1. SELECT RLS policies:
--    - Replaces broad role check with explicit user_has_permission(organization_id, 'fitness.manage')
--      for privileged Owner/Admin roles. Cashier, Receptionist, and unauthorized roles are blocked.
--    - Keeps assigned Trainer access (own plans + actively assigned members) and Member access (own active/completed plans).
-- 2. Save RPC lifecycle & Immutability:
--    - save_full_diet_plan saves strictly as Draft (status = 'draft', is_active = false).
--    - Explicitly rejects p_status = 'active' and p_status = 'completed' for normal save operations.
--    - Explicitly rejects modifying existing Active and Completed plans in-place.
--    - Adds clone_diet_plan_to_draft RPC to create a new Draft from an existing plan while preserving the Active plan.
--    - Never archives an existing active plan during Save.
-- 3. Content Validation & Placeholder Defaults Removal:
--    - Removes placeholder defaults such as 'Meal' and 'Item'.
--    - Requires meaningful explicit meal name and food name or description.
--    - Publish strictly rejects empty plans and blank/placeholder-only content.
-- 4. Owner/Admin Edits & Immutability:
--    - For Owner/Admin edits on existing draft plans, preserves existing trainer_id when p_trainer_id is omitted.
--    - Changes trainer assignment only on an explicit authorized reassignment.
--    - Completed plans remain strictly immutable for Owner/Admin too; clone or create a new Draft instead.
-- 5. Trainer Reassignment Guards:
--    - When a Trainer updates an existing plan, requires p_member_id = v_existing_plan.member_id.
--    - Trainers cannot transfer an existing plan to another Member.
-- 6. Publish Validation & Member-Level Serialization:
--    - Serializes concurrent publishing per member by locking gym_members with FOR UPDATE.
--    - Verifies authorization and active Trainer assignment first.
--    - Verifies the target plan is a valid Draft before archiving any existing active plan.
--    - Only after all validation succeeds, archives previous active plan and activates new Draft atomically.
-- 7. Data preservation:
--    - Preserves existing NULL p_items behavior so omitted meal items never delete existing items.
--    - Atomically pre-validates jsonb items array before modifying diet_plan_items.
-- =============================================================================

-- 1. Hardened SELECT RLS Policy on public.diet_plans
drop policy if exists "org members can view diet plans" on public.diet_plans;
drop policy if exists "trainers can view diet plans" on public.diet_plans;
drop policy if exists "members can view diet plans" on public.diet_plans;
drop policy if exists "authorized users can view diet plans" on public.diet_plans;
drop policy if exists "diet_plans_select_policy" on public.diet_plans;
drop policy if exists "diet_plans_select_staff" on public.diet_plans;
drop policy if exists "diet_plans_select_member" on public.diet_plans;
drop policy if exists "diet_plans_select_trainer_or_admin" on public.diet_plans;

create policy "authorized users can view diet plans"
  on public.diet_plans for select
  to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      -- Explicitly authorized Owner / Admin / Staff with fitness.manage permission
      public.user_has_permission(organization_id, 'fitness.manage')
      -- Assigned Trainers: only their actively assigned members' plans where they are the trainer
      or (
        public.current_org_role_slug(organization_id) = 'trainer'
        and trainer_id = public.linked_trainer_id(organization_id)
        and public.can_view_member_data(organization_id, member_id)
      )
      -- Members: only active or completed plans for themselves (strictly never drafts)
      or (
        public.current_org_role_slug(organization_id) = 'member'
        and public.can_view_member_data(organization_id, member_id)
        and status in ('active', 'completed')
      )
    )
  );

-- 2. Hardened SELECT RLS Policy on public.diet_plan_items
drop policy if exists "org members can view diet plan items" on public.diet_plan_items;
drop policy if exists "trainers can view diet plan items" on public.diet_plan_items;
drop policy if exists "members can view diet plan items" on public.diet_plan_items;
drop policy if exists "authorized users can view diet plan items" on public.diet_plan_items;
drop policy if exists "diet_plan_items_select_policy" on public.diet_plan_items;
drop policy if exists "diet_plan_items_select_staff" on public.diet_plan_items;
drop policy if exists "diet_plan_items_select_member" on public.diet_plan_items;
drop policy if exists "diet_plan_items_select_trainer_or_admin" on public.diet_plan_items;

create policy "authorized users can view diet plan items"
  on public.diet_plan_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.diet_plans parent
      where parent.id = diet_plan_items.diet_plan_id
        and parent.organization_id = diet_plan_items.organization_id
        and public.is_org_member(parent.organization_id)
        and (
          -- Explicitly authorized Owner / Admin / Staff with fitness.manage permission
          public.user_has_permission(parent.organization_id, 'fitness.manage')
          -- Assigned Trainers: only their actively assigned members' plans where they are the trainer
          or (
            public.current_org_role_slug(parent.organization_id) = 'trainer'
            and parent.trainer_id = public.linked_trainer_id(parent.organization_id)
            and public.can_view_member_data(parent.organization_id, parent.member_id)
          )
          -- Members: only active or completed plans for themselves (strictly never drafts)
          or (
            public.current_org_role_slug(parent.organization_id) = 'member'
            and public.can_view_member_data(parent.organization_id, parent.member_id)
            and parent.status in ('active', 'completed')
          )
        )
    )
  );

-- 3. Hardened RPC: save_full_diet_plan (Saves strictly Draft; rejects modifying Active/Completed plans)
create or replace function public.save_full_diet_plan(
  p_org_id uuid,
  p_plan_id uuid default null,
  p_member_id uuid default null,
  p_trainer_id uuid default null,
  p_name text default null,
  p_goal text default null,
  p_status text default 'draft',
  p_start_date date default null,
  p_end_date date default null,
  p_daily_calorie_target integer default null,
  p_protein_target_g numeric default null,
  p_carb_target_g numeric default null,
  p_fat_target_g numeric default null,
  p_water_intake_liters numeric default null,
  p_notes text default null,
  p_items jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_name text;
  v_status text;
  v_item jsonb;
  v_item_meal text;
  v_item_desc text;
  v_item_food text;
  v_item_cals integer;
  v_item_qty numeric;
  v_item_protein numeric;
  v_item_carbs numeric;
  v_item_fat numeric;
  v_sort integer := 0;
  v_role text;
  v_trainer_id uuid;
  v_existing_plan public.diet_plans%rowtype;
  v_target_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_org_id is null then
    raise exception 'organization_id is required';
  end if;

  if not public.is_org_member(p_org_id) then
    raise exception 'not an organization member';
  end if;

  v_role := public.current_org_role_slug(p_org_id);
  if v_role is null or v_role = 'member' then
    raise exception 'members cannot create or edit diet plans';
  end if;

  -- 1. Save RPC lifecycle: save_full_diet_plan only saves Draft
  -- Reject active and completed status for normal save operations
  v_status := coalesce(nullif(trim(p_status), ''), 'draft');
  if v_status in ('active', 'completed') then
    raise exception 'save_full_diet_plan only saves draft plans; use publish_diet_plan to activate a plan';
  end if;
  if v_status <> 'draft' then
    raise exception 'invalid diet plan status: %', p_status;
  end if;

  -- 2. If updating an existing plan, lock and verify ownership, immutability, and assignment
  if p_plan_id is not null then
    select * into v_existing_plan
    from public.diet_plans
    where id = p_plan_id
    for update;

    if v_existing_plan.id is null or v_existing_plan.organization_id <> p_org_id then
      raise exception 'plan not found';
    end if;

    -- Reject modifying existing Active or Completed plans in-place (must clone or create new draft)
    if v_existing_plan.status in ('active', 'completed') then
      raise exception 'cannot modify an % diet plan; create or clone to a new draft instead', v_existing_plan.status;
    end if;

    if v_role = 'trainer' then
      v_trainer_id := public.linked_trainer_id(p_org_id);
      if v_trainer_id is null then
        raise exception 'linked trainer not found';
      end if;

      -- Trainer A must not edit another trainer's plan
      if v_existing_plan.trainer_id is distinct from v_trainer_id then
        raise exception 'not authorized to modify another trainer plan';
      end if;

      -- Verify trainer still has active assignment to the existing plan's member
      if not public.can_view_member_data(p_org_id, v_existing_plan.member_id) then
        raise exception 'not authorized: member is not actively assigned to trainer';
      end if;

      -- Trainers must never transfer an existing plan to another Member
      if p_member_id is not null and p_member_id is distinct from v_existing_plan.member_id then
        raise exception 'trainers cannot transfer an existing plan to another member';
      end if;

      v_target_member_id := v_existing_plan.member_id;
    elsif public.user_has_permission(p_org_id, 'fitness.manage') then
      -- Owner/Admin:
      if p_member_id is not null and p_member_id is distinct from v_existing_plan.member_id then
        v_target_member_id := p_member_id;
      else
        v_target_member_id := v_existing_plan.member_id;
      end if;

      -- For Owner/Admin edits, preserve existing trainer_id when p_trainer_id is omitted (null)
      -- Change trainer assignment only on an explicit authorized reassignment.
      if p_trainer_id is null then
        v_trainer_id := v_existing_plan.trainer_id;
      else
        v_trainer_id := p_trainer_id;
      end if;

      if v_trainer_id is not null and not exists (
        select 1 from public.trainers where id = v_trainer_id and organization_id = p_org_id
      ) then
        raise exception 'trainer not found in organization';
      end if;
    else
      raise exception 'insufficient privileges';
    end if;
  else
    -- Creating a new plan
    v_target_member_id := p_member_id;
    if v_target_member_id is null then
      raise exception 'member_id is required';
    end if;

    if v_role = 'trainer' then
      v_trainer_id := public.linked_trainer_id(p_org_id);
      if v_trainer_id is null then
        raise exception 'linked trainer not found';
      end if;

      -- Verify target member is actively assigned to this trainer
      if not public.can_view_member_data(p_org_id, v_target_member_id) then
        raise exception 'member is not assigned to trainer';
      end if;
    elsif public.user_has_permission(p_org_id, 'fitness.manage') then
      v_trainer_id := p_trainer_id;
      if v_trainer_id is not null and not exists (
        select 1 from public.trainers where id = v_trainer_id and organization_id = p_org_id
      ) then
        raise exception 'trainer not found in organization';
      end if;
    else
      raise exception 'insufficient privileges';
    end if;
  end if;

  -- 3. Validate target member exists in organization
  if not exists (
    select 1 from public.gym_members m
    where m.id = v_target_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'plan name is required';
  end if;

  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'end date cannot be before start date';
  end if;

  -- 4. Upsert plan record strictly as draft (never archive active plans on save)
  if p_plan_id is not null then
    update public.diet_plans set
      member_id = v_target_member_id,
      trainer_id = v_trainer_id,
      name = v_name,
      goal = nullif(trim(p_goal), ''),
      status = 'draft',
      daily_calorie_target = p_daily_calorie_target,
      protein_target_g = p_protein_target_g,
      carb_target_g = p_carb_target_g,
      fat_target_g = p_fat_target_g,
      water_intake_liters = p_water_intake_liters,
      start_date = p_start_date,
      end_date = p_end_date,
      notes = nullif(trim(p_notes), ''),
      is_active = false,
      updated_at = now()
    where id = p_plan_id;

    v_plan_id := p_plan_id;
  else
    insert into public.diet_plans (
      organization_id, member_id, trainer_id, name, goal, status,
      daily_calorie_target, protein_target_g, carb_target_g, fat_target_g, water_intake_liters,
      start_date, end_date, notes, is_active, created_by, created_at, updated_at
    ) values (
      p_org_id, v_target_member_id, v_trainer_id, v_name, nullif(trim(p_goal), ''), 'draft',
      p_daily_calorie_target, p_protein_target_g, p_carb_target_g, p_fat_target_g, p_water_intake_liters,
      p_start_date, p_end_date, nullif(trim(p_notes), ''), false, auth.uid(), now(), now()
    )
    returning id into v_plan_id;
  end if;

  -- 5. Meal items handling:
  -- If p_items is NULL, PRESERVE existing items!
  -- Only replace if caller explicitly passes a JSON array.
  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' then
      raise exception 'items must be a json array or null';
    end if;

    -- Pre-validate all items before deleting any existing rows (atomic)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'each item in items must be a json object';
      end if;

      -- Validate explicit meal name (reject blank or placeholder 'meal')
      v_item_meal := nullif(trim(v_item->>'meal'), '');
      if v_item_meal is null or lower(v_item_meal) = 'meal' then
        raise exception 'each item must have a meaningful explicit meal name';
      end if;

      -- Validate explicit food name or description (reject blank or placeholder 'item')
      v_item_food := nullif(trim(v_item->>'foodName'), '');
      v_item_desc := coalesce(v_item_food, nullif(trim(v_item->>'description'), ''));
      if v_item_desc is null or lower(v_item_desc) = 'item' then
        raise exception 'each item must have an explicit food name or description';
      end if;

      if v_item->>'calories' is not null and trim(v_item->>'calories') <> '' then
        begin
          v_item_cals := (v_item->>'calories')::integer;
          if v_item_cals < 0 then
            raise exception 'calories cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid calories value: %', v_item->>'calories';
        end;
      end if;

      if v_item->>'quantity' is not null and trim(v_item->>'quantity') <> '' then
        begin
          v_item_qty := (v_item->>'quantity')::numeric;
          if v_item_qty < 0 then
            raise exception 'quantity cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid quantity value: %', v_item->>'quantity';
        end;
      end if;

      if v_item->>'proteinG' is not null and trim(v_item->>'proteinG') <> '' then
        begin
          v_item_protein := (v_item->>'proteinG')::numeric;
          if v_item_protein < 0 then
            raise exception 'protein cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid protein value: %', v_item->>'proteinG';
        end;
      end if;

      if v_item->>'carbsG' is not null and trim(v_item->>'carbsG') <> '' then
        begin
          v_item_carbs := (v_item->>'carbsG')::numeric;
          if v_item_carbs < 0 then
            raise exception 'carbs cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid carbs value: %', v_item->>'carbsG';
        end;
      end if;

      if v_item->>'fatG' is not null and trim(v_item->>'fatG') <> '' then
        begin
          v_item_fat := (v_item->>'fatG')::numeric;
          if v_item_fat < 0 then
            raise exception 'fat cannot be negative';
          end if;
        exception when others then
          raise exception 'invalid fat value: %', v_item->>'fatG';
        end;
      end if;
    end loop;

    -- All items are valid: atomically replace
    delete from public.diet_plan_items
    where diet_plan_id = v_plan_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_item_meal := trim(v_item->>'meal');
      v_item_food := nullif(trim(v_item->>'foodName'), '');
      v_item_desc := coalesce(v_item_food, nullif(trim(v_item->>'description'), ''));
      v_item_cals := case
        when v_item->>'calories' is not null and trim(v_item->>'calories') <> ''
        then (v_item->>'calories')::integer
        else null
      end;

      insert into public.diet_plan_items (
        organization_id,
        diet_plan_id,
        meal,
        description,
        calories,
        sort_order,
        meal_time,
        food_name,
        quantity,
        unit,
        protein_g,
        carbs_g,
        fat_g,
        instructions
      ) values (
        p_org_id,
        v_plan_id,
        v_item_meal,
        v_item_desc,
        v_item_cals,
        coalesce((v_item->>'sortOrder')::integer, v_sort),
        nullif(trim(v_item->>'mealTime'), ''),
        v_item_food,
        case
          when v_item->>'quantity' is not null and trim(v_item->>'quantity') <> ''
          then (v_item->>'quantity')::numeric
          else null
        end,
        nullif(trim(v_item->>'unit'), ''),
        case
          when v_item->>'proteinG' is not null and trim(v_item->>'proteinG') <> ''
          then (v_item->>'proteinG')::numeric
          else null
        end,
        case
          when v_item->>'carbsG' is not null and trim(v_item->>'carbsG') <> ''
          then (v_item->>'carbsG')::numeric
          else null
        end,
        case
          when v_item->>'fatG' is not null and trim(v_item->>'fatG') <> ''
          then (v_item->>'fatG')::numeric
          else null
        end,
        nullif(trim(v_item->>'instructions'), '')
      );

      v_sort := v_sort + 1;
    end loop;
  end if;

  return v_plan_id;
end;
$$;

revoke all on function public.save_full_diet_plan from public, anon;
grant execute on function public.save_full_diet_plan to authenticated;

-- 4. New RPC: clone_diet_plan_to_draft
-- Creates a new Draft version copying all targets and meal items from an Active or Completed plan.
-- The existing Active Plan remains visible and active until the new Draft is published.
create or replace function public.clone_diet_plan_to_draft(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.diet_plans%rowtype;
  v_new_plan_id uuid;
  v_role text;
  v_trainer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_plan_id is null then
    raise exception 'plan_id is required';
  end if;

  select * into v_source
  from public.diet_plans
  where id = p_plan_id;

  if v_source.id is null then
    raise exception 'plan not found';
  end if;

  -- Permit cloning only from Active or Completed source plans as intended
  if v_source.status not in ('active', 'completed') then
    raise exception 'only active or completed diet plans can be cloned to draft';
  end if;

  v_role := public.current_org_role_slug(v_source.organization_id);

  if v_role = 'trainer' then
    v_trainer_id := public.linked_trainer_id(v_source.organization_id);
    if v_trainer_id is null or v_source.trainer_id is distinct from v_trainer_id then
      raise exception 'not authorized to clone another trainer plan';
    end if;

    if not public.can_view_member_data(v_source.organization_id, v_source.member_id) then
      raise exception 'not authorized: member is not actively assigned to trainer';
    end if;
  elsif not public.user_has_permission(v_source.organization_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  else
    v_trainer_id := v_source.trainer_id;
  end if;

  -- Create a new draft plan copying all goals, targets, dates, notes from the source plan
  insert into public.diet_plans (
    organization_id,
    member_id,
    trainer_id,
    name,
    goal,
    status,
    daily_calorie_target,
    protein_target_g,
    carb_target_g,
    fat_target_g,
    water_intake_liters,
    start_date,
    end_date,
    notes,
    is_active,
    created_by,
    created_at,
    updated_at
  ) values (
    v_source.organization_id,
    v_source.member_id,
    v_trainer_id,
    v_source.name || ' (Draft)',
    v_source.goal,
    'draft',
    v_source.daily_calorie_target,
    v_source.protein_target_g,
    v_source.carb_target_g,
    v_source.fat_target_g,
    v_source.water_intake_liters,
    coalesce(v_source.start_date, (timezone('utc', now()))::date),
    v_source.end_date,
    v_source.notes,
    false,
    auth.uid(),
    now(),
    now()
  )
  returning id into v_new_plan_id;

  -- Copy all meal items from source plan to the new draft
  insert into public.diet_plan_items (
    organization_id,
    diet_plan_id,
    meal,
    description,
    calories,
    sort_order,
    meal_time,
    food_name,
    quantity,
    unit,
    protein_g,
    carbs_g,
    fat_g,
    instructions
  )
  select
    organization_id,
    v_new_plan_id,
    meal,
    description,
    calories,
    sort_order,
    meal_time,
    food_name,
    quantity,
    unit,
    protein_g,
    carbs_g,
    fat_g,
    instructions
  from public.diet_plan_items
  where diet_plan_id = p_plan_id
  order by sort_order asc;

  return v_new_plan_id;
end;
$$;

revoke all on function public.clone_diet_plan_to_draft(uuid) from public, anon;
grant execute on function public.clone_diet_plan_to_draft(uuid) to authenticated;

-- 5. Hardened RPC: publish_diet_plan (Strict atomic validation and publish with Member-level lock)
create or replace function public.publish_diet_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.diet_plans%rowtype;
  v_role text;
  v_trainer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_plan_id is null then
    raise exception 'plan_id is required';
  end if;

  -- 1. Initial retrieval of target plan to identify member and organization
  select * into v_plan
  from public.diet_plans
  where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  -- 2. SERIALIZE PUBLISHING PER MEMBER:
  -- Lock the member row in gym_members with FOR UPDATE.
  -- This prevents concurrent publish requests for different Draft plans of the same Member
  -- from racing and creating multiple active plans.
  perform 1
  from public.gym_members
  where id = v_plan.member_id
    and organization_id = v_plan.organization_id
  for update;

  -- 3. Lock target plan row and re-read state after acquiring Member lock
  select * into v_plan
  from public.diet_plans
  where id = p_plan_id
  for update;

  -- 4. Verify authorization and current active Trainer assignment FIRST
  v_role := public.current_org_role_slug(v_plan.organization_id);

  if v_role = 'trainer' then
    v_trainer_id := public.linked_trainer_id(v_plan.organization_id);
    if v_trainer_id is null or v_plan.trainer_id is distinct from v_trainer_id then
      raise exception 'not authorized to publish another trainer plan';
    end if;

    if not public.can_view_member_data(v_plan.organization_id, v_plan.member_id) then
      raise exception 'not authorized: member is not actively assigned to trainer';
    end if;
  elsif not public.user_has_permission(v_plan.organization_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  end if;

  -- 5. Verify target plan is a valid Draft (reject completed plans, active plans, or non-draft)
  if v_plan.status = 'completed' then
    raise exception 'cannot publish a completed diet plan';
  end if;

  if v_plan.status = 'active' then
    raise exception 'diet plan is already active';
  end if;

  if v_plan.status <> 'draft' then
    raise exception 'only draft diet plans can be published';
  end if;

  -- 6. Verify target plan has at least one meal item
  if not exists (
    select 1
    from public.diet_plan_items
    where diet_plan_id = p_plan_id
  ) then
    raise exception 'cannot publish diet plan without meal items';
  end if;

  -- Reject blank and placeholder-only content ('Meal', 'Item', empty text)
  if exists (
    select 1
    from public.diet_plan_items
    where diet_plan_id = p_plan_id
      and (
        meal is null or trim(meal) = '' or lower(trim(meal)) = 'meal'
        or (
          (food_name is null or trim(food_name) = '' or lower(trim(food_name)) = 'item')
          and (description is null or trim(description) = '' or lower(trim(description)) = 'item')
        )
      )
  ) then
    raise exception 'cannot publish diet plan with blank or placeholder-only meal items';
  end if;

  -- 7. Only after ALL validation succeeds:
  -- Archive the previous active plan for this member in this organization
  update public.diet_plans
  set status = 'completed',
      is_active = false,
      updated_at = now()
  where organization_id = v_plan.organization_id
    and member_id = v_plan.member_id
    and status = 'active'
    and id <> p_plan_id;

  -- Publish the target plan atomically
  update public.diet_plans
  set status = 'active',
      is_active = true,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.publish_diet_plan(uuid) from public, anon;
grant execute on function public.publish_diet_plan(uuid) to authenticated;

-- 6. Hardened RPC: complete_diet_plan (Preserves historical items)
create or replace function public.complete_diet_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.diet_plans%rowtype;
  v_role text;
  v_trainer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_plan_id is null then
    raise exception 'plan_id is required';
  end if;

  select * into v_plan from public.diet_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  v_role := public.current_org_role_slug(v_plan.organization_id);

  if v_role = 'trainer' then
    v_trainer_id := public.linked_trainer_id(v_plan.organization_id);
    if v_trainer_id is null or v_plan.trainer_id is distinct from v_trainer_id then
      raise exception 'not authorized to complete another trainer plan';
    end if;

    if not public.can_view_member_data(v_plan.organization_id, v_plan.member_id) then
      raise exception 'not authorized: member is not actively assigned to trainer';
    end if;
  elsif not public.user_has_permission(v_plan.organization_id, 'fitness.manage') then
    raise exception 'insufficient privileges';
  end if;

  -- Complete plan and preserve all historical diet_plan_items
  update public.diet_plans
  set status = 'completed',
      is_active = false,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.complete_diet_plan(uuid) from public, anon;
grant execute on function public.complete_diet_plan(uuid) to authenticated;
