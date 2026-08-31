-- =============================================================================
-- BSB FitForge - Phase 1.1: Database Foundation additions
-- =============================================================================
-- Additive migration on top of the Phase 3 multi-tenant schema. It does NOT
-- rebuild or rename anything; it adds the missing foundation pieces:
--
--   * organizations.slug (unique, auto-generated) + gstin
--   * branches.gstin
--   * profiles.status / org_id / branch_id / full_name (denormalized defaults)
--   * organization_settings (JSONB key/value, org-scoped)
--   * branch_settings (JSONB key/value, org + branch scoped)
--   * organization_subscriptions (subscription foundation, no billing)
--   * helper functions: current_user_org_id / user_has_org_access /
--     user_has_branch_access
--
-- Mapping to the Phase 1.1 spec (existing schema already covers these):
--   * user_roles       -> organization_members (user <-> org <-> role)
--                          + member_branches (branch access). A separate
--                          table is intentionally NOT created to avoid two
--                          sources of truth for membership.
--   * roles            -> existing roles table (org-scoped, is_system,
--                          is_active) already satisfies the spec.
--   * profiles         -> stays org-agnostic (one user can belong to many
--                          organizations). org_id/branch_id are nullable
--                          denormalized references for the common single-org
--                          case; organization_members is authoritative.
--
-- Column naming follows the existing convention (`organization_id`, not
-- `org_id`) so typed access stays consistent across all tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. organizations: unique slug + gstin
-- ---------------------------------------------------------------------------

alter table public.organizations add column if not exists slug text;
alter table public.organizations add column if not exists gstin text;

-- Auto-generate a unique slug from the organization name on insert.
create or replace function public.set_org_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
begin
  v_base := trim(both '-' from regexp_replace(lower(trim(new.name)), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then
    v_base := 'org';
  end if;
  v_slug := v_base;
  if exists (select 1 from public.organizations where slug = v_slug) then
    v_slug := v_base || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  new.slug := v_slug;
  return new;
end;
$$;

drop trigger if exists set_org_slug on public.organizations;
create trigger set_org_slug
  before insert on public.organizations
  for each row when (new.slug is null)
  execute function public.set_org_slug();

-- Backfill any existing rows (idempotent).
update public.organizations
set slug = trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'))
where slug is null or slug = '';

-- Handle potential collisions from the backfill before locking uniqueness.
update public.organizations o
set slug = o.slug || '-' || substr(replace(o.id::text, '-', ''), 1, 6)
where o.slug is not null
  and exists (
    select 1 from public.organizations o2
    where o2.slug = o.slug and o2.id <> o.id
  );

alter table public.organizations alter column slug set not null;
create unique index if not exists organizations_slug_unique on public.organizations(slug);
create index if not exists organizations_status_idx on public.organizations(status);

-- ---------------------------------------------------------------------------
-- 2. branches: gstin + composite uniqueness for branch_settings FK
-- ---------------------------------------------------------------------------

alter table public.branches add column if not exists gstin text;

-- Composite unique (organization_id, id) so branch_settings can FK on the
-- pair and guarantee a branch row always belongs to its organization_id.
alter table public.branches drop constraint if exists branches_org_id_unique;
alter table public.branches add constraint branches_org_id_unique unique (organization_id, id);

-- ---------------------------------------------------------------------------
-- 3. profiles: status, default org/branch, full_name
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists status public.user_status not null default 'active';
alter table public.profiles add column if not exists org_id uuid references public.organizations(id) on delete set null;
alter table public.profiles add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.profiles add column if not exists full_name text
  generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored;

create index if not exists profiles_org_idx on public.profiles(org_id);
create index if not exists profiles_status_idx on public.profiles(status);

-- ---------------------------------------------------------------------------
-- 4. organization_settings
-- ---------------------------------------------------------------------------

create table if not exists public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, setting_key)
);

create index if not exists organization_settings_org_idx on public.organization_settings(organization_id);

alter table public.organization_settings enable row level security;

create policy "org members can view organization settings"
  on public.organization_settings for select
  using (public.is_org_member(organization_id));

create policy "org admins can manage organization settings"
  on public.organization_settings for insert
  with check (public.is_org_admin(organization_id));

create policy "org admins can update organization settings"
  on public.organization_settings for update
  using (public.is_org_admin(organization_id));

create policy "org admins can delete organization settings"
  on public.organization_settings for delete
  using (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 5. branch_settings
-- ---------------------------------------------------------------------------

create table if not exists public.branch_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, setting_key)
);

-- Composite FK: a branch_settings row's branch must belong to its org.
alter table public.branch_settings drop constraint if exists branch_settings_branch_org_fkey;
alter table public.branch_settings add constraint branch_settings_branch_org_fkey
  foreign key (organization_id, branch_id) references public.branches(organization_id, id);

create index if not exists branch_settings_org_idx on public.branch_settings(organization_id);
create index if not exists branch_settings_branch_idx on public.branch_settings(branch_id);

alter table public.branch_settings enable row level security;

create policy "org members can view branch settings"
  on public.branch_settings for select
  using (public.is_org_member(organization_id));

create policy "org admins can manage branch settings"
  on public.branch_settings for insert
  with check (public.is_org_admin(organization_id));

create policy "org admins can update branch settings"
  on public.branch_settings for update
  using (public.is_org_admin(organization_id));

create policy "org admins can delete branch settings"
  on public.branch_settings for delete
  using (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 6. organization_subscriptions (foundation only; no billing/payment logic)
-- ---------------------------------------------------------------------------

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_name text not null default 'free',
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'canceled', 'expired')),
  start_date timestamptz,
  end_date timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_subscriptions_org_idx on public.organization_subscriptions(organization_id);

-- At most one active subscription per organization.
create unique index if not exists organization_subscriptions_active_org_unique
  on public.organization_subscriptions(organization_id)
  where status = 'active';

alter table public.organization_subscriptions enable row level security;

create policy "org members can view subscriptions"
  on public.organization_subscriptions for select
  using (public.is_org_member(organization_id));

create policy "org admins can manage subscriptions"
  on public.organization_subscriptions for insert
  with check (public.is_org_admin(organization_id));

create policy "org admins can update subscriptions"
  on public.organization_subscriptions for update
  using (public.is_org_admin(organization_id));

create policy "org admins can delete subscriptions"
  on public.organization_subscriptions for delete
  using (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 7. set_updated_at triggers for the new tables
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'public.organization_settings',
    'public.branch_settings',
    'public.organization_subscriptions'
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
-- 8. Tenant helper functions
--    SECURITY DEFINER (same pattern as is_org_member/admin/owner), always
--    deriving identity from auth.uid() - never from the frontend.
-- ---------------------------------------------------------------------------

-- Convenience: the most recent active organization for the current user.
-- The application resolves the exact "active membership" per request; this is
-- a single-org convenience helper (most users belong to one organization).
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = auth.uid()
    and m.status = 'active'
  order by m.created_at desc
  limit 1;
$$;

-- True when the current user has an active membership in the organization.
create or replace function public.user_has_org_access(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- True when the current user can access the branch (all-branches membership
-- or an explicit member_branches grant).
create or replace function public.user_has_branch_access(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branches b
    join public.organization_members m
      on m.organization_id = b.organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
    where b.id = p_branch_id
      and (
        m.access_all_branches
        or exists (
          select 1
          from public.member_branches mb
          where mb.member_id = m.id
            and mb.branch_id = p_branch_id
        )
      )
  );
$$;

grant execute on function public.current_user_org_id() to authenticated;
grant execute on function public.user_has_org_access(uuid) to authenticated;
grant execute on function public.user_has_branch_access(uuid) to authenticated;
