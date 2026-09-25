-- =============================================================================
-- BSB FitForge - Phase 3.2: Module operations schema
-- =============================================================================
-- Additive operational tables that hang off gym_members, trainers, plans and
-- class templates created by migration 20260914000009:
--
--   * memberships / membership_freezes      (Memberships)
--   * attendance_records                    (Attendance)
--   * trainer_assignments / pt_sessions     (Trainers)
--   * class_sessions / class_bookings       (Classes)
--   * workout_plans + items / diet_plans + items / body_measurements /
--     progress_entries                      (Fitness)
--
-- Security model (unchanged): organization_id on every row, RLS enabled,
-- branch-scoped reads via the existing helpers, and no direct write policies -
-- each module UI will add SECURITY DEFINER RPCs. No hard deletes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Memberships
-- ---------------------------------------------------------------------------

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  member_id uuid not null references public.gym_members(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id),
  status text not null default 'active'
    check (status in ('pending', 'active', 'expired', 'cancelled')),
  start_date date not null,
  end_date date not null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  final_amount numeric(12, 2) not null default 0 check (final_amount >= 0),
  freeze_days_used integer not null default 0 check (freeze_days_used >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table public.memberships drop constraint if exists memberships_branch_org_fkey;
alter table public.memberships add constraint memberships_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists memberships_org_idx on public.memberships(organization_id);
create index if not exists memberships_org_branch_idx on public.memberships(organization_id, branch_id);
create index if not exists memberships_member_idx on public.memberships(member_id, status);
create index if not exists memberships_end_date_idx on public.memberships(organization_id, end_date);

alter table public.memberships enable row level security;

drop policy if exists "org members can view memberships" on public.memberships;
create policy "org members can view memberships"
  on public.memberships for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.membership_freezes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days integer not null check (days > 0),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists membership_freezes_org_idx on public.membership_freezes(organization_id);
create index if not exists membership_freezes_membership_idx on public.membership_freezes(membership_id);

alter table public.membership_freezes enable row level security;

drop policy if exists "org members can view membership freezes" on public.membership_freezes;
create policy "org members can view membership freezes"
  on public.membership_freezes for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 2. Attendance
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  member_id uuid not null references public.gym_members(id) on delete cascade,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  method text not null default 'manual'
    check (method in ('manual', 'qr', 'biometric', 'app')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at)
);

alter table public.attendance_records drop constraint if exists attendance_records_branch_org_fkey;
alter table public.attendance_records add constraint attendance_records_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists attendance_records_org_idx on public.attendance_records(organization_id, check_in_at desc);
create index if not exists attendance_records_member_idx on public.attendance_records(member_id, check_in_at desc);

alter table public.attendance_records enable row level security;

drop policy if exists "org members can view attendance" on public.attendance_records;
create policy "org members can view attendance"
  on public.attendance_records for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Trainers: assignments + PT sessions
-- ---------------------------------------------------------------------------

create table if not exists public.trainer_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  member_id uuid not null references public.gym_members(id) on delete cascade,
  assigned_at date not null default (timezone('utc', now()))::date,
  status text not null default 'active' check (status in ('active', 'ended')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trainer_assignments_active_unique
  on public.trainer_assignments(member_id)
  where status = 'active';
create index if not exists trainer_assignments_org_idx on public.trainer_assignments(organization_id);
create index if not exists trainer_assignments_trainer_idx on public.trainer_assignments(trainer_id, status);

alter table public.trainer_assignments enable row level security;

drop policy if exists "org members can view trainer assignments" on public.trainer_assignments;
create policy "org members can view trainer assignments"
  on public.trainer_assignments for select
  using (public.is_org_member(organization_id));

create table if not exists public.pt_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  trainer_id uuid not null references public.trainers(id),
  member_id uuid not null references public.gym_members(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pt_sessions drop constraint if exists pt_sessions_branch_org_fkey;
alter table public.pt_sessions add constraint pt_sessions_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists pt_sessions_org_idx on public.pt_sessions(organization_id, scheduled_at desc);
create index if not exists pt_sessions_trainer_idx on public.pt_sessions(trainer_id, scheduled_at desc);

alter table public.pt_sessions enable row level security;

drop policy if exists "org members can view pt sessions" on public.pt_sessions;
create policy "org members can view pt sessions"
  on public.pt_sessions for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Classes: sessions + bookings/waitlist
-- ---------------------------------------------------------------------------

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  class_template_id uuid not null references public.class_templates(id) on delete cascade,
  trainer_id uuid references public.trainers(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 0 check (capacity >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

alter table public.class_sessions drop constraint if exists class_sessions_branch_org_fkey;
alter table public.class_sessions add constraint class_sessions_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists class_sessions_org_idx on public.class_sessions(organization_id, starts_at desc);
create index if not exists class_sessions_branch_idx on public.class_sessions(organization_id, branch_id, starts_at);

alter table public.class_sessions enable row level security;

drop policy if exists "org members can view class sessions" on public.class_sessions;
create policy "org members can view class sessions"
  on public.class_sessions for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

create table if not exists public.class_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  member_id uuid not null references public.gym_members(id) on delete cascade,
  status text not null default 'booked'
    check (status in ('booked', 'waitlisted', 'attended', 'no_show', 'cancelled')),
  booked_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_session_id, member_id)
);

create index if not exists class_bookings_org_idx on public.class_bookings(organization_id);
create index if not exists class_bookings_session_idx on public.class_bookings(class_session_id, status);
create index if not exists class_bookings_member_idx on public.class_bookings(member_id, status);

alter table public.class_bookings enable row level security;

drop policy if exists "org members can view class bookings" on public.class_bookings;
create policy "org members can view class bookings"
  on public.class_bookings for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 5. Fitness: workout plans, diet plans, measurements, progress
-- ---------------------------------------------------------------------------

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.gym_members(id) on delete cascade,
  trainer_id uuid references public.trainers(id) on delete set null,
  name text not null,
  goal text,
  start_date date,
  end_date date,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_plans_org_idx on public.workout_plans(organization_id);
create index if not exists workout_plans_member_idx on public.workout_plans(member_id, is_active);

alter table public.workout_plans enable row level security;

drop policy if exists "org members can view workout plans" on public.workout_plans;
create policy "org members can view workout plans"
  on public.workout_plans for select
  using (public.is_org_member(organization_id));

create table if not exists public.workout_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  day_label text,
  sets integer check (sets is null or sets >= 0),
  reps text,
  weight text,
  rest_seconds integer check (rest_seconds is null or rest_seconds >= 0),
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists workout_plan_items_org_idx on public.workout_plan_items(organization_id);
create index if not exists workout_plan_items_plan_idx on public.workout_plan_items(plan_id, sort_order);

alter table public.workout_plan_items enable row level security;

drop policy if exists "org members can view workout plan items" on public.workout_plan_items;
create policy "org members can view workout plan items"
  on public.workout_plan_items for select
  using (public.is_org_member(organization_id));

create table if not exists public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.gym_members(id) on delete cascade,
  trainer_id uuid references public.trainers(id) on delete set null,
  name text not null,
  start_date date,
  end_date date,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists diet_plans_org_idx on public.diet_plans(organization_id);
create index if not exists diet_plans_member_idx on public.diet_plans(member_id, is_active);

alter table public.diet_plans enable row level security;

drop policy if exists "org members can view diet plans" on public.diet_plans;
create policy "org members can view diet plans"
  on public.diet_plans for select
  using (public.is_org_member(organization_id));

create table if not exists public.diet_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  diet_plan_id uuid not null references public.diet_plans(id) on delete cascade,
  meal text not null,
  description text,
  calories integer check (calories is null or calories >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists diet_plan_items_org_idx on public.diet_plan_items(organization_id);
create index if not exists diet_plan_items_plan_idx on public.diet_plan_items(diet_plan_id, sort_order);

alter table public.diet_plan_items enable row level security;

drop policy if exists "org members can view diet plan items" on public.diet_plan_items;
create policy "org members can view diet plan items"
  on public.diet_plan_items for select
  using (public.is_org_member(organization_id));

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.gym_members(id) on delete cascade,
  measured_at date not null default (timezone('utc', now()))::date,
  weight_kg numeric(6, 2),
  height_cm numeric(6, 2),
  body_fat_percent numeric(5, 2),
  chest_cm numeric(6, 2),
  waist_cm numeric(6, 2),
  hips_cm numeric(6, 2),
  arms_cm numeric(6, 2),
  thighs_cm numeric(6, 2),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists body_measurements_org_idx on public.body_measurements(organization_id);
create index if not exists body_measurements_member_idx on public.body_measurements(member_id, measured_at desc);

alter table public.body_measurements enable row level security;

drop policy if exists "org members can view body measurements" on public.body_measurements;
create policy "org members can view body measurements"
  on public.body_measurements for select
  using (public.is_org_member(organization_id));

create table if not exists public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.gym_members(id) on delete cascade,
  entry_date date not null default (timezone('utc', now()))::date,
  weight_kg numeric(6, 2),
  photo_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists progress_entries_org_idx on public.progress_entries(organization_id);
create index if not exists progress_entries_member_idx on public.progress_entries(member_id, entry_date desc);

alter table public.progress_entries enable row level security;

drop policy if exists "org members can view progress entries" on public.progress_entries;
create policy "org members can view progress entries"
  on public.progress_entries for select
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'public.memberships',
    'public.trainer_assignments',
    'public.pt_sessions',
    'public.class_sessions',
    'public.class_bookings',
    'public.workout_plans',
    'public.diet_plans'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'set_updated_at' and tgrelid = t::regclass
    ) then
      execute format(
        'create trigger set_updated_at before update on %I.%I for each row execute function public.set_updated_at()',
        split_part(t, '.', 1),
        split_part(t, '.', 2)
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Audit: memberships, attendance, class bookings, trainer assignments
-- ---------------------------------------------------------------------------

create or replace function public.audit_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_action text;
  v_target_type text;
  v_target_id uuid;
  v_meta jsonb;
begin
  case tg_table_name
    when 'organizations' then
      if tg_op = 'INSERT' then
        v_action := 'organization.created';
        v_org_id := new.id;
        v_target_type := 'organization';
        v_target_id := new.id;
        v_meta := jsonb_build_object('name', new.name);
      elsif tg_op = 'UPDATE' then
        v_action := 'organization.updated';
        v_org_id := new.id;
        v_target_type := 'organization';
        v_target_id := new.id;
        v_meta := jsonb_build_object('name', new.name);
      else
        return coalesce(new, old);
      end if;

    when 'branches' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'branch';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.name, old.name), 'code', coalesce(new.code, old.code));
      if tg_op = 'INSERT' then
        v_action := 'branch.created';
      elsif new.status is distinct from old.status then
        v_action := case when new.status = 'active' then 'branch.reactivated' else 'branch.deactivated' end;
      else
        v_action := 'branch.updated';
      end if;

    when 'invitations' then
      v_org_id := new.organization_id;
      v_target_type := 'invitation';
      v_target_id := new.id;
      v_meta := jsonb_build_object('email', new.email);
      if tg_op = 'INSERT' then
        v_action := 'invitation.created';
      elsif new.status = 'accepted' then
        v_action := 'invitation.accepted';
      elsif new.status = 'revoked' then
        v_action := 'invitation.revoked';
      elsif new.status = 'expired' then
        v_action := 'invitation.expired';
      else
        v_action := 'invitation.updated';
      end if;

    when 'organization_members' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'member';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('user_id', coalesce(new.user_id, old.user_id));
      if tg_op = 'INSERT' then
        v_action := 'member.joined';
      elsif tg_op = 'DELETE' then
        v_action := 'member.removed';
      elsif new.role_id is distinct from old.role_id then
        v_action := 'member.role_changed';
      elsif new.status is distinct from old.status then
        v_action := case when new.status = 'active' then 'member.reactivated' else 'member.status_changed' end;
      elsif new.access_all_branches is distinct from old.access_all_branches then
        v_action := 'member.branch_access_changed';
      else
        v_action := 'member.updated';
      end if;

    when 'member_branches' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'member';
      v_target_id := coalesce(new.member_id, old.member_id);
      v_meta := jsonb_build_object('branch_id', coalesce(new.branch_id, old.branch_id));
      v_action := 'member.branch_access_changed';

    when 'roles' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'role';
      v_target_id := coalesce(new.id, old.id);
      if tg_op = 'INSERT' then
        v_action := 'role.created';
      elsif new.is_active is distinct from old.is_active then
        v_action := case when new.is_active then 'role.reactivated' else 'role.deactivated' end;
      else
        v_action := 'role.updated';
      end if;

    when 'role_permissions' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'role';
      v_target_id := coalesce(new.role_id, old.role_id);
      v_meta := jsonb_build_object('permission', coalesce(new.permission, old.permission));
      v_action := case tg_op when 'INSERT' then 'role.permission_granted' else 'role.permission_revoked' end;

    when 'gym_members' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'gym_member';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('code', coalesce(new.code, old.code), 'name', coalesce(new.full_name, old.full_name));
      if tg_op = 'INSERT' then
        v_action := 'gym_member.created';
      elsif tg_op = 'DELETE' then
        v_action := 'gym_member.removed';
      elsif new.status is distinct from old.status then
        v_action := case
          when new.status = 'active' then 'gym_member.reactivated'
          when new.status = 'inactive' then 'gym_member.deactivated'
          when new.status = 'suspended' then 'gym_member.suspended'
          else 'gym_member.status_changed'
        end;
      else
        v_action := 'gym_member.updated';
      end if;

    when 'trainers' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'trainer';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.full_name, old.full_name));
      if tg_op = 'INSERT' then
        v_action := 'trainer.created';
      elsif new.status is distinct from old.status then
        v_action := case when new.status = 'active' then 'trainer.reactivated' else 'trainer.deactivated' end;
      else
        v_action := 'trainer.updated';
      end if;

    when 'memberships' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'membership';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('member_id', coalesce(new.member_id, old.member_id));
      if tg_op = 'INSERT' then
        v_action := 'membership.created';
      elsif new.status is distinct from old.status then
        v_action := case
          when new.status = 'active' then 'membership.reactivated'
          when new.status = 'expired' then 'membership.expired'
          when new.status = 'cancelled' then 'membership.cancelled'
          else 'membership.status_changed'
        end;
      else
        v_action := 'membership.updated';
      end if;

    when 'membership_freezes' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'membership';
      v_target_id := coalesce(new.membership_id, old.membership_id);
      v_meta := jsonb_build_object('days', coalesce(new.days, old.days));
      v_action := 'membership.freeze_recorded';

    when 'attendance_records' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'attendance';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('member_id', coalesce(new.member_id, old.member_id));
      v_action := case tg_op when 'INSERT' then 'attendance.check_in' else 'attendance.updated' end;

    when 'class_bookings' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'class_booking';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('member_id', coalesce(new.member_id, old.member_id));
      if tg_op = 'INSERT' then
        v_action := 'class_booking.created';
      else
        v_action := 'class_booking.updated';
      end if;

    when 'trainer_assignments' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'trainer_assignment';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('trainer_id', coalesce(new.trainer_id, old.trainer_id));
      v_action := case tg_op when 'INSERT' then 'trainer.assigned' else 'trainer.assignment_updated' end;

    when 'membership_plans' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'membership_plan';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.name, old.name));
      v_action := case tg_op when 'INSERT' then 'membership_plan.created' else 'membership_plan.updated' end;

    when 'products' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'product';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.name, old.name));
      v_action := case tg_op when 'INSERT' then 'product.created' else 'product.updated' end;

    when 'suppliers' then
      v_org_id := coalesce(new.organization_id, old.organization_id);
      v_target_type := 'supplier';
      v_target_id := coalesce(new.id, old.id);
      v_meta := jsonb_build_object('name', coalesce(new.name, old.name));
      v_action := case tg_op when 'INSERT' then 'supplier.created' else 'supplier.updated' end;

    else
      return coalesce(new, old);
  end case;

  if v_org_id is not null then
    perform public.record_audit_event(v_org_id, v_action, v_target_type, v_target_id, v_meta);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_memberships on public.memberships;
create trigger audit_memberships
  after insert or update on public.memberships
  for each row execute function public.audit_event_trigger();

drop trigger if exists audit_attendance_records on public.attendance_records;
create trigger audit_attendance_records
  after insert or update on public.attendance_records
  for each row execute function public.audit_event_trigger();

drop trigger if exists audit_class_bookings on public.class_bookings;
create trigger audit_class_bookings
  after insert or update on public.class_bookings
  for each row execute function public.audit_event_trigger();

drop trigger if exists audit_trainer_assignments on public.trainer_assignments;
create trigger audit_trainer_assignments
  after insert or update on public.trainer_assignments
  for each row execute function public.audit_event_trigger();
