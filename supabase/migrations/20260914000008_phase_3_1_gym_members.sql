-- =============================================================================
-- BSB FitForge - Phase 3.1: Gym members (customers)
-- =============================================================================
-- Additive work on top of Phase 1.3. It does NOT rebuild auth, roles, staff
-- membership (`organization_members`), branches or the existing RBAC catalogue.
--
-- Gym members are a separate domain from staff:
--   * staff live in organization_members / profiles
--   * gym customers live in public.gym_members
--
-- This migration:
--   1. Adds gym_member_status and public.gym_members (org-scoped, branch-scoped).
--   2. Enforces member code uniqueness per organization: UNIQUE (organization_id, code).
--   3. Adds user_has_permission (owner/admin = full org permissions; others
--      use explicit role_permissions). Does not replace is_org_admin/owner.
--   4. Adds SECURITY DEFINER RPCs for create / update / status. organization_id
--      is never the only gate: RPCs re-check membership, permission and branch
--      access from auth.uid().
--   5. assigned_trainer_id is nullable with NO foreign key — there is no
--      trainers table yet. The column is reserved so the Trainers module can
--      attach a real relationship later without redesigning members.
--   6. Soft status only (active / inactive / suspended). No hard delete RPC.
--      Frozen is intentionally NOT a member status (membership freeze is later).
--
-- Direct table writes are blocked by RLS (select-only). Mutations go through
-- the RPCs so validation, unique codes and permission checks cannot be skipped.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.gym_member_status as enum ('active', 'inactive', 'suspended');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. gym_members
-- ---------------------------------------------------------------------------

create table if not exists public.gym_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  code text not null,
  first_name text not null,
  last_name text not null,
  full_name text generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored,
  email text,
  phone text not null,
  gender text,
  date_of_birth date,
  photo_url text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  assigned_trainer_id uuid,
  status public.gym_member_status not null default 'active',
  joined_at date not null default (timezone('utc', now()))::date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (gender is null or gender in ('male', 'female', 'other', 'unspecified'))
);

alter table public.gym_members drop constraint if exists gym_members_branch_org_fkey;
alter table public.gym_members add constraint gym_members_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists gym_members_org_idx on public.gym_members(organization_id);
create index if not exists gym_members_org_status_idx on public.gym_members(organization_id, status);
create index if not exists gym_members_org_branch_idx on public.gym_members(organization_id, branch_id);
create index if not exists gym_members_org_phone_idx on public.gym_members(organization_id, phone);
create index if not exists gym_members_full_name_idx on public.gym_members(organization_id, full_name);

alter table public.gym_members enable row level security;

drop policy if exists "org members can view gym members in authorized branches" on public.gym_members;
create policy "org members can view gym members in authorized branches"
  on public.gym_members for select
  using (
    public.is_org_member(organization_id)
    and public.user_has_branch_access(organization_id, branch_id)
  );

-- No insert/update/delete policies: writes go exclusively through SECURITY
-- DEFINER RPCs so permission, code uniqueness and branch checks cannot be
-- skipped via the REST API.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at' and tgrelid = 'public.gym_members'::regclass
  ) then
    create trigger set_updated_at
      before update on public.gym_members
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. user_has_permission
--    Owner and admin have full organization-level permissions (existing
--    is_org_admin covers both). Manager/staff/trainer/others use explicit
--    role_permissions. Does not bypass RLS.
-- ---------------------------------------------------------------------------

create or replace function public.user_has_permission(p_org_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_org_admin(p_org_id)
    or exists (
      select 1
      from public.organization_members m
      join public.role_permissions rp
        on rp.role_id = m.role_id
       and rp.organization_id = m.organization_id
      where m.organization_id = p_org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and rp.permission = p_permission
    );
$$;

grant execute on function public.user_has_permission(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Member code generation (internal). Unique per organization.
-- ---------------------------------------------------------------------------

create or replace function public.generate_gym_member_code(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_code text;
begin
  select coalesce(max(
    case
      when code ~ '^MEM-[0-9]+$' then substring(code from 5)::integer
      else 0
    end
  ), 0) + 1
  into v_n
  from public.gym_members
  where organization_id = p_org_id;

  loop
    v_code := 'MEM-' || lpad(v_n::text, 4, '0');
    exit when not exists (
      select 1
      from public.gym_members
      where organization_id = p_org_id
        and code = v_code
    );
    v_n := v_n + 1;
  end loop;

  return v_code;
end;
$$;

revoke all on function public.generate_gym_member_code(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_gym_member
-- ---------------------------------------------------------------------------

create or replace function public.create_gym_member(
  p_org_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_gender text default null,
  p_date_of_birth date default null,
  p_photo_url text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_notes text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_country text default null,
  p_joined_at date default null,
  p_assigned_trainer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_phone text;
  v_email text;
  v_gender text;
  v_first text;
  v_last text;
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
  if not public.user_has_permission(p_org_id, 'members.create') then
    raise exception 'insufficient privileges';
  end if;
  if p_branch_id is null then
    raise exception 'branch is required';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_org_id
  ) then
    raise exception 'branch not found';
  end if;
  if not public.user_has_branch_access(p_org_id, p_branch_id) then
    raise exception 'insufficient privileges';
  end if;

  v_first := trim(p_first_name);
  v_last := trim(p_last_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  if v_last is null or v_last = '' then
    raise exception 'last name is required';
  end if;

  v_phone := regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g');
  if v_phone is null or v_phone = '' then
    raise exception 'phone is required';
  end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'phone must contain at least 8 digits';
  end if;

  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_gender := nullif(lower(trim(p_gender)), '');
  if v_gender is not null and v_gender not in ('male', 'female', 'other', 'unspecified') then
    raise exception 'gender is invalid';
  end if;

  if p_assigned_trainer_id is not null then
    raise exception 'trainer assignment is not available yet';
  end if;

  v_code := public.generate_gym_member_code(p_org_id);

  insert into public.gym_members (
    organization_id, branch_id, code,
    first_name, last_name, email, phone, gender, date_of_birth, photo_url,
    emergency_contact_name, emergency_contact_phone, notes,
    address_line1, address_line2, city, state, postal_code, country,
    assigned_trainer_id, status, joined_at, created_by
  )
  values (
    p_org_id,
    p_branch_id,
    v_code,
    v_first,
    v_last,
    v_email,
    v_phone,
    v_gender,
    p_date_of_birth,
    nullif(trim(p_photo_url), ''),
    nullif(trim(p_emergency_contact_name), ''),
    nullif(trim(p_emergency_contact_phone), ''),
    nullif(trim(p_notes), ''),
    nullif(trim(p_address_line1), ''),
    nullif(trim(p_address_line2), ''),
    nullif(trim(p_city), ''),
    nullif(trim(p_state), ''),
    nullif(trim(p_postal_code), ''),
    nullif(trim(p_country), ''),
    null,
    'active',
    coalesce(p_joined_at, (timezone('utc', now()))::date),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_gym_member(
  uuid, uuid, text, text, text, text, text, date, text, text, text, text,
  text, text, text, text, text, text, date, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. update_gym_member (code and organization_id are immutable)
-- ---------------------------------------------------------------------------

create or replace function public.update_gym_member(
  p_member_id uuid,
  p_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_gender text default null,
  p_date_of_birth date default null,
  p_photo_url text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_notes text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_country text default null,
  p_joined_at date default null,
  p_assigned_trainer_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_old_branch uuid;
  v_phone text;
  v_email text;
  v_gender text;
  v_first text;
  v_last text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_member_id is null then
    raise exception 'member is required';
  end if;

  select organization_id, branch_id
  into v_org_id, v_old_branch
  from public.gym_members
  where id = p_member_id;

  if v_org_id is null then
    raise exception 'member not found';
  end if;
  if not public.is_org_member(v_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if not public.user_has_permission(v_org_id, 'members.update') then
    raise exception 'insufficient privileges';
  end if;
  if not public.user_has_branch_access(v_org_id, v_old_branch) then
    raise exception 'insufficient privileges';
  end if;
  if p_branch_id is null then
    raise exception 'branch is required';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id
      and b.organization_id = v_org_id
  ) then
    raise exception 'branch not found';
  end if;
  if not public.user_has_branch_access(v_org_id, p_branch_id) then
    raise exception 'insufficient privileges';
  end if;

  v_first := trim(p_first_name);
  v_last := trim(p_last_name);
  if v_first is null or v_first = '' then
    raise exception 'first name is required';
  end if;
  if v_last is null or v_last = '' then
    raise exception 'last name is required';
  end if;

  v_phone := regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g');
  if v_phone is null or v_phone = '' then
    raise exception 'phone is required';
  end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'phone must contain at least 8 digits';
  end if;

  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  v_gender := nullif(lower(trim(p_gender)), '');
  if v_gender is not null and v_gender not in ('male', 'female', 'other', 'unspecified') then
    raise exception 'gender is invalid';
  end if;

  if p_assigned_trainer_id is not null then
    raise exception 'trainer assignment is not available yet';
  end if;

  update public.gym_members
  set
    branch_id = p_branch_id,
    first_name = v_first,
    last_name = v_last,
    email = v_email,
    phone = v_phone,
    gender = v_gender,
    date_of_birth = p_date_of_birth,
    photo_url = nullif(trim(p_photo_url), ''),
    emergency_contact_name = nullif(trim(p_emergency_contact_name), ''),
    emergency_contact_phone = nullif(trim(p_emergency_contact_phone), ''),
    notes = nullif(trim(p_notes), ''),
    address_line1 = nullif(trim(p_address_line1), ''),
    address_line2 = nullif(trim(p_address_line2), ''),
    city = nullif(trim(p_city), ''),
    state = nullif(trim(p_state), ''),
    postal_code = nullif(trim(p_postal_code), ''),
    country = nullif(trim(p_country), ''),
    assigned_trainer_id = null,
    joined_at = coalesce(p_joined_at, joined_at)
  where id = p_member_id
    and organization_id = v_org_id;

  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

grant execute on function public.update_gym_member(
  uuid, uuid, text, text, text, text, text, date, text, text, text, text,
  text, text, text, text, text, text, date, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. set_gym_member_status (soft activate / deactivate / suspend)
-- ---------------------------------------------------------------------------

create or replace function public.set_gym_member_status(
  p_member_id uuid,
  p_status public.gym_member_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_branch_id uuid;
  v_required text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_member_id is null then
    raise exception 'member is required';
  end if;
  if p_status is null then
    raise exception 'status is required';
  end if;

  select organization_id, branch_id
  into v_org_id, v_branch_id
  from public.gym_members
  where id = p_member_id;

  if v_org_id is null then
    raise exception 'member not found';
  end if;
  if not public.is_org_member(v_org_id) then
    raise exception 'insufficient privileges';
  end if;

  v_required := case
    when p_status = 'inactive' then 'members.delete'
    else 'members.update'
  end;
  if not public.user_has_permission(v_org_id, v_required) then
    raise exception 'insufficient privileges';
  end if;
  if not public.user_has_branch_access(v_org_id, v_branch_id) then
    raise exception 'insufficient privileges';
  end if;

  update public.gym_members
  set status = p_status
  where id = p_member_id
    and organization_id = v_org_id;

  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

grant execute on function public.set_gym_member_status(uuid, public.gym_member_status) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Audit: gym member lifecycle (extend existing trigger, no secrets)
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
      v_meta := jsonb_build_object(
        'name', coalesce(new.name, old.name),
        'code', coalesce(new.code, old.code)
      );
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
      v_meta := jsonb_build_object(
        'code', coalesce(new.code, old.code),
        'name', coalesce(new.full_name, old.full_name)
      );
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

    else
      return coalesce(new, old);
  end case;

  if v_org_id is not null then
    perform public.record_audit_event(v_org_id, v_action, v_target_type, v_target_id, v_meta);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_gym_members on public.gym_members;
create trigger audit_gym_members
  after insert or update or delete on public.gym_members
  for each row execute function public.audit_event_trigger();
