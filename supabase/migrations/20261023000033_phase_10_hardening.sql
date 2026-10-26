-- =============================================================================
-- BSB FitForge - Phase 10: production hardening (additive)
-- =============================================================================
-- Confirmed gaps from the in-repo audit. No new tables, columns, statuses,
-- accounting rules, or product features. Existing RPCs remain the write path.
--
-- 1. Drop leftover direct write policies on organizations, branches, settings,
--    and subscriptions so REST cannot bypass SECURITY DEFINER RPCs.
-- 2. Protect privileged profile columns (status, org_id, branch_id, email,
--    username) from client UPDATE even though RLS allows own-row updates.
-- 3. Tighten child-table SELECT policies so line items inherit parent branch
--    access instead of org-wide visibility.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Settings / org / branch / subscription writes: RPC-only
-- ---------------------------------------------------------------------------
-- Phase 1.1 added admin/owner write policies. Phase 1.3 later introduced
-- SECURITY DEFINER RPCs as the application write path but left the policies
-- in place, so PostgREST could still skip validation (GSTIN, last-active
-- branch, immutable codes, setting-key format).

drop policy if exists "org owner can update their organization" on public.organizations;

drop policy if exists "org admins can create branches" on public.branches;
drop policy if exists "org admins can update branches" on public.branches;

drop policy if exists "org admins can manage organization settings" on public.organization_settings;
drop policy if exists "org admins can update organization settings" on public.organization_settings;
drop policy if exists "org admins can delete organization settings" on public.organization_settings;

drop policy if exists "org admins can manage branch settings" on public.branch_settings;
drop policy if exists "org admins can update branch settings" on public.branch_settings;
drop policy if exists "org admins can delete branch settings" on public.branch_settings;

drop policy if exists "org admins can manage subscriptions" on public.organization_subscriptions;
drop policy if exists "org admins can update subscriptions" on public.organization_subscriptions;
drop policy if exists "org admins can delete subscriptions" on public.organization_subscriptions;

-- ---------------------------------------------------------------------------
-- 2. Profile privileged-column protection
-- ---------------------------------------------------------------------------
-- Own-row UPDATE is still allowed (first_name, last_name, phone, avatar_url,
-- preferences, contact_number). status / org_id / branch_id / email / username
-- are membership or auth fields and must not be writable by the client.

create or replace function public.protect_profile_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.username is not null and new.username is distinct from old.username then
      raise exception 'username cannot be changed';
    end if;
    if new.status is distinct from old.status then
      raise exception 'profile status cannot be changed';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'profile organization cannot be changed';
    end if;
    if new.branch_id is distinct from old.branch_id then
      raise exception 'profile branch cannot be changed';
    end if;
    if new.email is distinct from old.email then
      raise exception 'profile email cannot be changed';
    end if;
  end if;
  if new.username is not null then
    new.username := public.normalize_username(new.username);
  end if;
  if new.contact_number is not null then
    new.contact_number := public.normalize_contact_number(new.contact_number);
  end if;
  return new;
end;
$$;

revoke all on function public.protect_profile_username() from public, anon, authenticated;

drop trigger if exists protect_profile_username on public.profiles;
create trigger protect_profile_username
  before insert or update on public.profiles
  for each row execute function public.protect_profile_username();

-- ---------------------------------------------------------------------------
-- 3. Child-table SELECT: inherit parent branch access
-- ---------------------------------------------------------------------------
-- Parent rows (invoices, pos_sales, purchases, credit_notes, memberships,
-- class_sessions) already require user_has_branch_access. Child rows only
-- checked is_org_member, so a branch-restricted staff member could read
-- another branch's line items by id.

drop policy if exists "org members can view invoice items" on public.invoice_items;
create policy "org members can view invoice items"
  on public.invoice_items for select
  using (
    exists (
      select 1
      from public.invoices parent
      where parent.id = invoice_id
        and parent.organization_id = invoice_items.organization_id
        and public.is_org_member(parent.organization_id)
        and public.user_has_branch_access(parent.organization_id, parent.branch_id)
    )
  );

drop policy if exists "org members can view installments" on public.installments;
create policy "org members can view installments"
  on public.installments for select
  using (
    exists (
      select 1
      from public.invoices parent
      where parent.id = invoice_id
        and parent.organization_id = installments.organization_id
        and public.is_org_member(parent.organization_id)
        and public.user_has_branch_access(parent.organization_id, parent.branch_id)
    )
  );

drop policy if exists "org members can view pos sale items" on public.pos_sale_items;
create policy "org members can view pos sale items"
  on public.pos_sale_items for select
  using (
    exists (
      select 1
      from public.pos_sales parent
      where parent.id = sale_id
        and parent.organization_id = pos_sale_items.organization_id
        and public.is_org_member(parent.organization_id)
        and public.user_has_branch_access(parent.organization_id, parent.branch_id)
    )
  );

drop policy if exists "org members can view purchase items" on public.purchase_items;
create policy "org members can view purchase items"
  on public.purchase_items for select
  using (
    exists (
      select 1
      from public.purchases parent
      where parent.id = purchase_id
        and parent.organization_id = purchase_items.organization_id
        and public.is_org_member(parent.organization_id)
        and public.user_has_branch_access(parent.organization_id, parent.branch_id)
    )
  );

drop policy if exists "org members can view credit note items" on public.credit_note_items;
create policy "org members can view credit note items"
  on public.credit_note_items for select
  using (
    exists (
      select 1
      from public.credit_notes parent
      where parent.id = credit_note_id
        and parent.organization_id = credit_note_items.organization_id
        and public.is_org_member(parent.organization_id)
        and public.user_has_branch_access(parent.organization_id, parent.branch_id)
    )
  );

drop policy if exists "org members can view membership freezes" on public.membership_freezes;
create policy "org members can view membership freezes"
  on public.membership_freezes for select
  using (
    exists (
      select 1
      from public.memberships parent
      where parent.id = membership_id
        and parent.organization_id = membership_freezes.organization_id
        and public.is_org_member(parent.organization_id)
        and public.user_has_branch_access(parent.organization_id, parent.branch_id)
    )
  );

drop policy if exists "org members can view class bookings" on public.class_bookings;
create policy "org members can view class bookings"
  on public.class_bookings for select
  using (
    exists (
      select 1
      from public.class_sessions parent
      where parent.id = class_session_id
        and parent.organization_id = class_bookings.organization_id
        and public.is_org_member(parent.organization_id)
        and public.user_has_branch_access(parent.organization_id, parent.branch_id)
    )
  );
