-- Phase 9: In-app notification read-state writes.
--
-- Additive only. The existing `notifications` table (created in
-- 20260914000011_phase_3_2_commerce_crm.sql) stays SELECT-only at RLS;
-- these SECURITY DEFINER RPCs are the only write path. They set `is_read`
-- on the caller's own rows and never touch finance, memberships, billing,
-- or any other table. No new columns, types, or scheduled jobs.

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_notification_id is null then
    raise exception 'notification not found';
  end if;

  update public.notifications
     set is_read = true
   where id = p_notification_id
     and recipient_id = auth.uid();
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_org_id is null or not public.is_org_member(p_org_id) then
    raise exception 'not an organization member';
  end if;

  update public.notifications
     set is_read = true
   where organization_id = p_org_id
     and recipient_id = auth.uid()
     and is_read = false;
end;
$$;

grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
