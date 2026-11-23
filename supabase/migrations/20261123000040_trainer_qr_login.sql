-- Migration: 20261123000040_trainer_qr_login.sql
-- Petpooja Captain-style QR Login for Trainers in BSB FitForge.

create table if not exists public.trainer_qr_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'consumed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_ip text,
  consumed_user_agent text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);

create index if not exists idx_trainer_qr_token_hash on public.trainer_qr_challenges (token_hash);
create index if not exists idx_trainer_qr_trainer_status on public.trainer_qr_challenges (trainer_id, status);
create index if not exists idx_trainer_qr_org_id on public.trainer_qr_challenges (organization_id);

alter table public.trainer_qr_challenges enable row level security;

-- Policy: Owners and Admins can view and manage QR challenges for their organization
drop policy if exists trainer_qr_challenges_org_admin on public.trainer_qr_challenges;
create policy trainer_qr_challenges_org_admin on public.trainer_qr_challenges
  for all
  using (
    public.is_org_admin(organization_id)
  )
  with check (
    public.is_org_admin(organization_id)
  );

-- RPC: create_trainer_qr_challenge
-- Atomically invalidates any prior active QR challenges for this trainer and creates a new one.
create or replace function public.create_trainer_qr_challenge(
  p_org_id uuid,
  p_trainer_id uuid,
  p_token_hash text,
  p_expires_in_seconds int default 90
)
returns table (
  challenge_id uuid,
  organization_id uuid,
  trainer_id uuid,
  user_id uuid,
  expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_expires_at timestamptz;
  v_inserted public.trainer_qr_challenges%rowtype;
begin
  -- Validate caller is org admin
  if not (
    public.is_org_admin(p_org_id)
    or auth.jwt() ->> 'role' = 'service_role'
    or current_user in ('service_role', 'postgres')
  ) then
    raise exception 'Access denied: only gym owners and administrators can generate trainer QR logins.'
      using errcode = '42501';
  end if;

  -- Validate trainer belongs to organization and has a linked user_id
  select t.user_id into v_user_id
  from public.trainers t
  where t.id = p_trainer_id and t.organization_id = p_org_id;

  if v_user_id is null then
    raise exception 'Trainer not found or has no linked login account.'
      using errcode = 'P0002';
  end if;

  -- Invalidate any existing active challenges for this trainer
  update public.trainer_qr_challenges
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = auth.uid()
  where trainer_id = p_trainer_id
    and organization_id = p_org_id
    and status = 'active';

  v_expires_at := now() + (coalesce(p_expires_in_seconds, 90) || ' seconds')::interval;

  insert into public.trainer_qr_challenges (
    organization_id,
    trainer_id,
    user_id,
    token_hash,
    status,
    expires_at,
    created_by
  )
  values (
    p_org_id,
    p_trainer_id,
    v_user_id,
    p_token_hash,
    'active',
    v_expires_at,
    auth.uid()
  )
  returning * into v_inserted;

  return query
  select
    v_inserted.id,
    v_inserted.organization_id,
    v_inserted.trainer_id,
    v_inserted.user_id,
    v_inserted.expires_at,
    v_inserted.status;
end;
$$;

-- RPC: consume_trainer_qr_challenge
-- Atomically validates and marks a challenge as consumed.
create or replace function public.consume_trainer_qr_challenge(
  p_token_hash text,
  p_ip text default null,
  p_user_agent text default null
)
returns table (
  challenge_id uuid,
  organization_id uuid,
  trainer_id uuid,
  user_id uuid,
  trainer_name text,
  trainer_code text,
  auth_email text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rec public.trainer_qr_challenges%rowtype;
  v_trainer_name text;
  v_trainer_code text;
  v_auth_email text;
begin
  select * into v_rec
  from public.trainer_qr_challenges
  where token_hash = p_token_hash
  for update;

  if v_rec.id is null then
    raise exception 'Invalid QR challenge token.' using errcode = 'P0002';
  end if;

  if v_rec.status = 'consumed' then
    raise exception 'QR challenge token has already been used.' using errcode = 'P0003';
  end if;

  if v_rec.status = 'revoked' then
    raise exception 'QR challenge token has been revoked.' using errcode = 'P0004';
  end if;

  if v_rec.expires_at <= now() or v_rec.status = 'expired' then
    update public.trainer_qr_challenges
    set status = 'expired'
    where id = v_rec.id;
    raise exception 'QR challenge token has expired.' using errcode = 'P0005';
  end if;

  -- Mark atomically as consumed
  update public.trainer_qr_challenges
  set status = 'consumed',
      consumed_at = now(),
      consumed_ip = p_ip,
      consumed_user_agent = p_user_agent
  where id = v_rec.id;

  -- Get trainer info
  select
    coalesce(t.full_name, trim(t.first_name || ' ' || coalesce(t.last_name, ''))),
    t.code
  into v_trainer_name, v_trainer_code
  from public.trainers t
  where t.id = v_rec.trainer_id;

  -- Get auth user email
  select email into v_auth_email
  from auth.users
  where id = v_rec.user_id;

  return query
  select
    v_rec.id,
    v_rec.organization_id,
    v_rec.trainer_id,
    v_rec.user_id,
    v_trainer_name,
    v_trainer_code,
    v_auth_email;
end;
$$;

-- RPC: revoke_trainer_qr_challenge
create or replace function public.revoke_trainer_qr_challenge(
  p_org_id uuid,
  p_trainer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_org_admin(p_org_id)
    or auth.jwt() ->> 'role' = 'service_role'
    or current_user in ('service_role', 'postgres')
  ) then
    raise exception 'Access denied: only gym owners and administrators can revoke QR challenges.'
      using errcode = '42501';
  end if;

  update public.trainer_qr_challenges
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = auth.uid()
  where trainer_id = p_trainer_id
    and organization_id = p_org_id
    and status = 'active';

  return true;
end;
$$;

grant execute on function public.create_trainer_qr_challenge to authenticated, service_role;
grant execute on function public.consume_trainer_qr_challenge to anon, authenticated, service_role;
grant execute on function public.revoke_trainer_qr_challenge to authenticated, service_role;
