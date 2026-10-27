-- =============================================================================
-- BSB FitForge - Install trainer assignment write RPCs
-- =============================================================================
-- Additive. Live production is missing public.create_trainer_assignment
-- (PostgREST PGRST202), so Add Assignment mapped to the generic database
-- toast. Reuses trainer_assignments + gym_members.assigned_trainer_id.
-- Source of truth for the current trainer is trainer_assignments (one active
-- row per member); the RPC ends prior active rows then sets assigned_trainer_id.
-- Signatures match 20260916000013. Safe to re-run.
-- =============================================================================

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
