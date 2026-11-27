-- Migration: 20261127000043_trainer_nutrition_planning.sql
-- Description: Upgrade BSB FitForge Trainer Diet Plan into a Complete Nutrition Planning Module.
-- Adds goals, macro targets, meal scheduling, and food item details.
-- Enforces that draft plans remain hidden from members at the database RLS level.

-- 1. Extend public.diet_plans
alter table public.diet_plans
  add column if not exists goal text check (goal is null or goal in ('Fat Loss', 'Muscle Gain', 'Weight Maintenance', 'General Fitness', 'Custom')),
  add column if not exists status text not null default 'active' check (status in ('draft', 'active', 'completed')),
  add column if not exists daily_calorie_target integer check (daily_calorie_target is null or daily_calorie_target >= 0),
  add column if not exists protein_target_g numeric(6,1) check (protein_target_g is null or protein_target_g >= 0),
  add column if not exists carb_target_g numeric(6,1) check (carb_target_g is null or carb_target_g >= 0),
  add column if not exists fat_target_g numeric(6,1) check (fat_target_g is null or fat_target_g >= 0),
  add column if not exists water_intake_liters numeric(4,1) check (water_intake_liters is null or water_intake_liters >= 0);

-- Sync initial status for existing rows
update public.diet_plans
set status = case when is_active then 'active' else 'completed' end
where status is null or status = 'active';

create index if not exists idx_diet_plans_member_status on public.diet_plans(member_id, status);
create index if not exists idx_diet_plans_org_status on public.diet_plans(organization_id, status);

-- 2. Extend public.diet_plan_items
alter table public.diet_plan_items
  add column if not exists meal_time text,
  add column if not exists food_name text,
  add column if not exists quantity numeric(8,2) check (quantity is null or quantity >= 0),
  add column if not exists unit text,
  add column if not exists protein_g numeric(6,1) check (protein_g is null or protein_g >= 0),
  add column if not exists carbs_g numeric(6,1) check (carbs_g is null or carbs_g >= 0),
  add column if not exists fat_g numeric(6,1) check (fat_g is null or fat_g >= 0),
  add column if not exists instructions text;

create index if not exists idx_diet_plan_items_plan_sort on public.diet_plan_items(diet_plan_id, sort_order);

-- 3. Scoped RLS: Members can view their published plans only; draft plans remain hidden
drop policy if exists "org members can view diet plans" on public.diet_plans;
create policy "org members can view diet plans"
  on public.diet_plans for select
  using (
    public.is_org_member(organization_id)
    and public.can_view_member_data(organization_id, member_id)
    and (
      public.current_org_role_slug(organization_id) is distinct from 'member'
      or status in ('active', 'completed')
    )
  );

drop policy if exists "org members can view diet plan items" on public.diet_plan_items;
create policy "org members can view diet plan items"
  on public.diet_plan_items for select
  using (
    exists (
      select 1
      from public.diet_plans parent
      where parent.id = diet_plan_id
        and parent.organization_id = diet_plan_items.organization_id
        and public.is_org_member(parent.organization_id)
        and public.can_view_member_data(parent.organization_id, parent.member_id)
        and (
          public.current_org_role_slug(parent.organization_id) is distinct from 'member'
          or parent.status in ('active', 'completed')
        )
    )
  );

-- 4. RPC: save_full_diet_plan (Handles creation, updating, meal scheduling, and publishing)
create or replace function public.save_full_diet_plan(
  p_org_id uuid,
  p_plan_id uuid default null,
  p_member_id uuid default null,
  p_trainer_id uuid default null,
  p_name text default null,
  p_goal text default null,
  p_status text default 'active',
  p_start_date date default null,
  p_end_date date default null,
  p_daily_calorie_target integer default null,
  p_protein_target_g numeric default null,
  p_carb_target_g numeric default null,
  p_fat_target_g numeric default null,
  p_water_intake_liters numeric default null,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
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
  v_is_active boolean;
  v_item jsonb;
  v_item_meal text;
  v_item_desc text;
  v_item_food text;
  v_item_cals integer;
  v_sort integer := 0;
  v_trainer_id uuid := p_trainer_id;
  v_existing_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'active');
  if v_status not in ('draft', 'active', 'completed') then
    v_status := 'active';
  end if;
  v_is_active := (v_status = 'active');

  -- Verify user has permission to manage fitness or is assigned trainer
  if not (
    public.user_has_permission(p_org_id, 'fitness.manage')
    or (
      public.current_org_role_slug(p_org_id) = 'trainer'
      and public.can_view_member_data(p_org_id, p_member_id)
    )
  ) then
    raise exception 'insufficient privileges';
  end if;

  -- If user is a trainer, ensure trainer_id matches their linked trainer
  if public.current_org_role_slug(p_org_id) = 'trainer' then
    v_trainer_id := public.linked_trainer_id(p_org_id);
  end if;

  -- Validate member exists in org
  if not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
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

  -- If publishing (status = 'active'), mark previously active plans for this member as completed
  if v_status = 'active' then
    update public.diet_plans
    set status = 'completed',
        is_active = false,
        updated_at = now()
    where organization_id = p_org_id
      and member_id = p_member_id
      and status = 'active'
      and (p_plan_id is null or id <> p_plan_id);
  end if;

  if p_plan_id is not null then
    -- Verify plan belongs to organization
    select organization_id into v_existing_org
    from public.diet_plans
    where id = p_plan_id;

    if v_existing_org is null or v_existing_org <> p_org_id then
      raise exception 'plan not found';
    end if;

    update public.diet_plans set
      member_id = p_member_id,
      trainer_id = v_trainer_id,
      name = v_name,
      goal = nullif(trim(p_goal), ''),
      status = v_status,
      daily_calorie_target = p_daily_calorie_target,
      protein_target_g = p_protein_target_g,
      carb_target_g = p_carb_target_g,
      fat_target_g = p_fat_target_g,
      water_intake_liters = p_water_intake_liters,
      start_date = p_start_date,
      end_date = p_end_date,
      notes = nullif(trim(p_notes), ''),
      is_active = v_is_active,
      updated_at = now()
    where id = p_plan_id;

    v_plan_id := p_plan_id;
  else
    insert into public.diet_plans (
      organization_id, member_id, trainer_id, name, goal, status,
      daily_calorie_target, protein_target_g, carb_target_g, fat_target_g, water_intake_liters,
      start_date, end_date, notes, is_active, created_by, created_at, updated_at
    ) values (
      p_org_id, p_member_id, v_trainer_id, v_name, nullif(trim(p_goal), ''), v_status,
      p_daily_calorie_target, p_protein_target_g, p_carb_target_g, p_fat_target_g, p_water_intake_liters,
      p_start_date, p_end_date, nullif(trim(p_notes), ''), v_is_active, auth.uid(), now(), now()
    )
    returning id into v_plan_id;
  end if;

  -- Recreate items atomically if items are provided
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    delete from public.diet_plan_items
    where diet_plan_id = v_plan_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_item_meal := coalesce(nullif(trim(v_item->>'meal'), ''), 'Meal');
      v_item_food := nullif(trim(v_item->>'foodName'), '');
      v_item_desc := coalesce(v_item_food, nullif(trim(v_item->>'description'), ''), 'Item');
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

-- 5. RPC: publish_diet_plan
create or replace function public.publish_diet_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_plan from public.diet_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  if not (
    public.user_has_permission(v_plan.organization_id, 'fitness.manage')
    or (
      public.current_org_role_slug(v_plan.organization_id) = 'trainer'
      and public.can_view_member_data(v_plan.organization_id, v_plan.member_id)
    )
  ) then
    raise exception 'insufficient privileges';
  end if;

  -- Archive existing active plans for this member
  update public.diet_plans
  set status = 'completed',
      is_active = false,
      updated_at = now()
  where organization_id = v_plan.organization_id
    and member_id = v_plan.member_id
    and status = 'active'
    and id <> p_plan_id;

  -- Publish this plan
  update public.diet_plans
  set status = 'active',
      is_active = true,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.publish_diet_plan(uuid) from public, anon;
grant execute on function public.publish_diet_plan(uuid) to authenticated;

-- 6. RPC: complete_diet_plan
create or replace function public.complete_diet_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_plan from public.diet_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;

  if not (
    public.user_has_permission(v_plan.organization_id, 'fitness.manage')
    or (
      public.current_org_role_slug(v_plan.organization_id) = 'trainer'
      and public.can_view_member_data(v_plan.organization_id, v_plan.member_id)
    )
  ) then
    raise exception 'insufficient privileges';
  end if;

  update public.diet_plans
  set status = 'completed',
      is_active = false,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.complete_diet_plan(uuid) from public, anon;
grant execute on function public.complete_diet_plan(uuid) to authenticated;
