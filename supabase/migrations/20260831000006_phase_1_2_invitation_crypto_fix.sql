-- =============================================================================
-- BSB FitForge - Phase 1.2: Invitation crypto function fix (000006)
-- -----------------------------------------------------------------------------
-- Fixes a latent Phase 3 bug discovered during Phase 1.2 verification: both
-- `create_invitation` and `accept_invitation` call `gen_random_bytes` and
-- `digest` unqualified while forcing `search_path TO 'public'`. Those functions
-- live in the `extensions` schema, so every invocation failed at runtime with
-- "function gen_random_bytes(integer) does not exist", breaking the entire
-- invitation flow.
--
-- Fix: schema-qualify the calls as `extensions.gen_random_bytes(...)` /
-- `extensions.digest(...)`. Behavior is otherwise identical.
-- =============================================================================

create or replace function public.create_invitation(
  p_org_id uuid,
  p_email text,
  p_role_id uuid,
  p_branch_ids uuid[] default null,
  p_all_branches boolean default false,
  p_expires_hours integer default 168
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_invitation_id uuid;
  v_role_slug text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_org_admin(p_org_id) then
    raise exception 'insufficient privileges';
  end if;
  if nullif(trim(p_email), '') is null or position('@' in trim(p_email)) = 0 then
    raise exception 'a valid email is required';
  end if;
  if p_role_id is null then
    raise exception 'a role is required';
  end if;
  select r.slug into v_role_slug
  from public.roles r
  where r.id = p_role_id and r.organization_id = p_org_id and r.is_active;
  if v_role_slug is null then
    raise exception 'role does not belong to this organization or is deactivated';
  end if;
  if v_role_slug = 'owner' then
    raise exception 'the owner role cannot be invited';
  end if;
  if v_role_slug = 'admin' and not public.is_org_owner(p_org_id) then
    raise exception 'only the owner can invite an admin';
  end if;
  if not p_all_branches and p_branch_ids is not null then
    if exists (
      select 1
      from unnest(p_branch_ids) as b(bid)
      left join public.branches br on br.id = b.bid and br.organization_id = p_org_id
      where br.id is null
    ) then
      raise exception 'one or more branches are invalid';
    end if;
  end if;
  if exists (
    select 1 from public.invitations i
    where i.organization_id = p_org_id
      and lower(i.email) = lower(trim(p_email))
      and i.status = 'pending'
      and i.expires_at > now()
  ) then
    raise exception 'an active invitation already exists for this email';
  end if;

  v_token := replace(encode(extensions.gen_random_bytes(32), 'base64'), '/', '_');
  v_token := replace(v_token, '+', '-');
  v_token := replace(v_token, '=', '');

  insert into public.invitations (
    organization_id, email, role_id, token_hash, status, access_all_branches,
    expires_at, created_by
  )
  values (
    p_org_id,
    lower(trim(p_email)),
    p_role_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'pending',
    p_all_branches,
    now() + make_interval(hours => p_expires_hours),
    auth.uid()
  )
  returning id into v_invitation_id;

  if not p_all_branches and p_branch_ids is not null then
    insert into public.invitation_branches (organization_id, invitation_id, branch_id)
    select p_org_id, v_invitation_id, b.bid
    from unnest(p_branch_ids) as b(bid);
  end if;

  return query select v_invitation_id, v_token;
end;
$$;

grant execute on function public.create_invitation(uuid, text, uuid, uuid[], boolean, integer) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_member_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if nullif(trim(p_token), '') is null then
    raise exception 'invitation token is required';
  end if;

  select * into v_inv
  from public.invitations i
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  limit 1;

  if v_inv.id is null then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation has already been used or revoked';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired';
  end if;
  if lower(v_inv.email) <> lower((select email from auth.users where id = auth.uid())) then
    raise exception 'invitation is not for this account';
  end if;
  if exists (
    select 1 from public.organization_members m
    where m.organization_id = v_inv.organization_id and m.user_id = auth.uid()
  ) then
    raise exception 'you are already a member of this organization';
  end if;

  insert into public.organization_members (
    organization_id, user_id, role_id, status, access_all_branches,
    accepted_at, created_by
  )
  values (
    v_inv.organization_id, auth.uid(), v_inv.role_id, 'active',
    v_inv.access_all_branches, now(), v_inv.created_by
  )
  returning id into v_member_id;

  if not v_inv.access_all_branches then
    insert into public.member_branches (organization_id, member_id, branch_id)
    select v_inv.organization_id, v_member_id, ib.branch_id
    from public.invitation_branches ib
    where ib.invitation_id = v_inv.id;
  end if;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  select jsonb_build_object(
    'organization_id', v_inv.organization_id,
    'member_id', v_member_id,
    'role', r.slug,
    'name', o.name
  )
  into v_result
  from public.roles r
  join public.organizations o on o.id = r.organization_id
  where r.id = v_inv.role_id;

  return v_result;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;
