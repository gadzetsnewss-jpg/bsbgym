-- =============================================================================
-- BSB FitForge - Membership lifecycle RPCs (extend, renew, freeze guards)
-- =============================================================================
-- Additive. organization_id is derived from the membership row. Soft status
-- only. Freeze remains a membership timeline event — never a gym_member status.
-- No invoices or payments are created here; Billing is a later module.
-- =============================================================================

create or replace function public.extend_membership(
  p_membership_id uuid,
  p_days integer,
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
  select organization_id, status into v_org_id, v_status
  from public.memberships
  where id = p_membership_id;
  if v_org_id is null then
    raise exception 'membership not found';
  end if;
  perform public.require_org_permission(v_org_id, 'memberships.extend');
  if v_status is distinct from 'active' then
    raise exception 'only active memberships can be extended';
  end if;
  if p_days is null or p_days <= 0 then
    raise exception 'extension days must be greater than zero';
  end if;

  update public.memberships set
    end_date = end_date + (p_days || ' days')::interval,
    notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_membership_id;
end;
$$;

grant execute on function public.extend_membership(uuid, integer, text) to authenticated;

create or replace function public.renew_membership(
  p_membership_id uuid,
  p_plan_id uuid,
  p_start_date date,
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
  v_existing public.memberships%rowtype;
  v_plan public.membership_plans%rowtype;
  v_id uuid;
  v_start date;
  v_end date;
  v_price numeric;
  v_discount numeric;
  v_final numeric;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v_existing from public.memberships where id = p_membership_id;
  if v_existing.id is null then
    raise exception 'membership not found';
  end if;
  perform public.require_org_permission(v_existing.organization_id, 'memberships.create');
  perform public.require_branch_in_org(v_existing.organization_id, v_existing.branch_id);

  select * into v_plan from public.membership_plans
  where id = coalesce(p_plan_id, v_existing.plan_id)
    and organization_id = v_existing.organization_id;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;
  if v_plan.is_active is not true then
    raise exception 'plan is not active';
  end if;

  v_start := coalesce(
    p_start_date,
    greatest(v_existing.end_date + 1, (timezone('utc', now()))::date)
  );
  v_end := v_start + (v_plan.duration_days || ' days')::interval;
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
    v_existing.organization_id, v_existing.branch_id, v_existing.member_id, v_plan.id, 'active',
    v_start, v_end, v_price, v_discount, v_final, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.renew_membership(uuid, uuid, date, numeric, numeric, text) to authenticated;

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
  v_membership public.memberships%rowtype;
  v_plan public.membership_plans%rowtype;
  v_days integer;
begin
  perform public.require_org_permission(p_org_id, 'memberships.freeze');

  select * into v_membership from public.memberships where id = p_membership_id;
  if v_membership.id is null or v_membership.organization_id <> p_org_id then
    raise exception 'membership not found';
  end if;
  if v_membership.status is distinct from 'active' then
    raise exception 'only active memberships can be frozen';
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

  select * into v_plan from public.membership_plans
  where id = v_membership.plan_id and organization_id = p_org_id;
  if v_plan.id is null then
    raise exception 'plan not found';
  end if;
  if v_membership.freeze_days_used + v_days > v_plan.max_freeze_days then
    raise exception 'freeze exceeds the plan freeze allowance';
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
