-- =============================================================================
-- BSB FitForge - Phase 3: Authentication & Organization Foundation
-- =============================================================================
-- Multi-tenant foundation:
--   profiles, organizations, branches, roles, role_permissions,
--   organization_members, member_branches, invitations, invitation_branches
--
-- Security model:
--   * RLS is enabled on every table (final security layer).
--   * organization_id is stamped on every organization-owned row.
--   * organization_id is NEVER trusted from the frontend - all multi-write
--     operations run through SECURITY DEFINER RPCs that resolve the caller's
--     organization from the auth context (auth.uid()).
--   * Invitation tokens are stored only as SHA-256 hashes and the column is
--     not selectable by normal roles.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- Enums
-- =============================================================================

do $$ begin
  create type public.user_status as enum ('active', 'invited', 'suspended', 'deactivated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.branch_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.organization_status as enum ('active', 'trial', 'suspended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- Reference data (configurable, not hardcoded in application logic)
-- =============================================================================

create table if not exists public.business_types (
  code text primary key,
  label text not null,
  sort_order integer not null default 0
);

insert into public.business_types (code, label, sort_order) values
  ('gym', 'Gym', 10),
  ('fitness_center', 'Fitness Center', 20),
  ('crossfit', 'CrossFit', 30),
  ('yoga', 'Yoga', 40),
  ('pilates', 'Pilates', 50),
  ('mma', 'MMA', 60),
  ('dance', 'Dance', 70),
  ('swimming', 'Swimming', 80),
  ('personal_training', 'Personal Training', 90),
  ('wellness', 'Wellness', 100)
on conflict (code) do nothing;

alter table public.business_types enable row level security;

create policy "business_types readable by authenticated users"
  on public.business_types for select to authenticated using (true);

-- =============================================================================
-- Organizations
-- =============================================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  business_type text references public.business_types(code),
  email text,
  phone text,
  website text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  tax_id text,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  date_format text not null default 'DD/MM/YYYY',
  logo_url text,
  status public.organization_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

create policy "org members can view their organization"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "org owner can update their organization"
  on public.organizations for update
  using (public.is_org_owner(id));

-- =============================================================================
-- Branches
-- =============================================================================

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  timezone text not null default 'Asia/Kolkata',
  status public.branch_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists branches_org_idx on public.branches(organization_id);

alter table public.branches enable row level security;

create policy "org members can view branches"
  on public.branches for select
  using (public.is_org_member(organization_id));

create policy "org admins can create branches"
  on public.branches for insert
  with check (public.is_org_admin(organization_id));

create policy "org admins can update branches"
  on public.branches for update
  using (public.is_org_admin(organization_id));

-- =============================================================================
-- Roles & permissions
-- =============================================================================

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists roles_org_idx on public.roles(organization_id);

alter table public.roles enable row level security;

create policy "org members can view roles"
  on public.roles for select
  using (public.is_org_member(organization_id));

create policy "org admins can create roles"
  on public.roles for insert
  with check (public.is_org_admin(organization_id));

create policy "org admins can update roles"
  on public.roles for update
  using (public.is_org_admin(organization_id));

create policy "org admins can delete roles"
  on public.roles for delete
  using (public.is_org_admin(organization_id));

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission text not null,
  unique (role_id, permission)
);

create index if not exists role_permissions_role_idx on public.role_permissions(role_id);

alter table public.role_permissions enable row level security;

create policy "org members can view role permissions"
  on public.role_permissions for select
  using (public.is_org_member(organization_id));

create policy "org admins can create role permissions"
  on public.role_permissions for insert
  with check (public.is_org_admin(organization_id));

create policy "org admins can update role permissions"
  on public.role_permissions for update
  using (public.is_org_admin(organization_id));

create policy "org admins can delete role permissions"
  on public.role_permissions for delete
  using (public.is_org_admin(organization_id));

-- =============================================================================
-- Profiles (one per auth user, created by trigger)
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users can view profiles of org colleagues"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = public.profiles.id
    )
  );

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- =============================================================================
-- Organization members
-- =============================================================================

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  status public.user_status not null default 'active',
  access_all_branches boolean not null default false,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_org_idx on public.organization_members(organization_id);
create index if not exists organization_members_user_idx on public.organization_members(user_id);

alter table public.organization_members enable row level security;

create policy "org members can view members of their organization"
  on public.organization_members for select
  using (public.is_org_member(organization_id));

-- Inserts/updates/deletes go exclusively through RPCs (create_organization,
-- accept_invitation, update_member_role, set_member_status,
-- update_member_branch_access) so every mutation is centrally validated.

-- =============================================================================
-- Member branch access
-- =============================================================================

create table if not exists public.member_branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.organization_members(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (member_id, branch_id)
);

create index if not exists member_branches_org_idx on public.member_branches(organization_id);
create index if not exists member_branches_member_idx on public.member_branches(member_id);
create index if not exists member_branches_branch_idx on public.member_branches(branch_id);

alter table public.member_branches enable row level security;

create policy "org members can view branch access"
  on public.member_branches for select
  using (public.is_org_member(organization_id));

-- =============================================================================
-- Invitations
-- =============================================================================

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id) on delete cascade,
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  access_all_branches boolean not null default false,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invitations_org_idx on public.invitations(organization_id);
create index if not exists invitations_email_idx on public.invitations(lower(email));

-- Prevent duplicate pending invitations for the same email in one organization.
create unique index if not exists invitations_pending_email_unique
  on public.invitations (organization_id, lower(email))
  where status = 'pending';

alter table public.invitations enable row level security;

create policy "org members can view invitations"
  on public.invitations for select
  using (public.is_org_member(organization_id));

-- Invitation secrets are never readable through normal queries.
revoke select (token_hash) on public.invitations from anon, authenticated;

-- =============================================================================
-- Invitation branch access
-- =============================================================================

create table if not exists public.invitation_branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  unique (invitation_id, branch_id)
);

create index if not exists invitation_branches_invitation_idx on public.invitation_branches(invitation_id);

alter table public.invitation_branches enable row level security;

create policy "org members can view invitation branch access"
  on public.invitation_branches for select
  using (public.is_org_member(organization_id));

-- =============================================================================
-- Triggers
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare t text;
begin
  foreach t in array array[
    'public.organizations',
    'public.branches',
    'public.roles',
    'public.role_permissions',
    'public.profiles',
    'public.organization_members',
    'public.invitations'
  ] loop
    execute format(
      'create trigger set_updated_at before update on %I.%I for each row execute function public.set_updated_at()',
      split_part(t, '.', 1),
      split_part(t, '.', 2)
    );
  end loop;
end $$;
