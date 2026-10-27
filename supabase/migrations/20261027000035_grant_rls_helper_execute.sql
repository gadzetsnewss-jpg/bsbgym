-- =============================================================================
-- BSB FitForge - Grant EXECUTE on RLS policy helpers
-- =============================================================================
-- 20261024000034 revoked current_org_role_slug / linked_* / can_view_member_data
-- from authenticated. Postgres still requires EXECUTE for the invoking role
-- when those SECURITY DEFINER helpers are used inside RLS policies, so Owner
-- SELECTs on trainers, trainer_assignments, gym_members and pt_sessions
-- raised "permission denied for function" (mapped to the generic forbidden
-- message). Anon stays revoked. Additive; safe to re-run.
-- =============================================================================

revoke all on function public.current_org_role_slug(uuid) from public, anon;
revoke all on function public.linked_trainer_id(uuid) from public, anon;
revoke all on function public.linked_gym_member_id(uuid) from public, anon;
revoke all on function public.can_view_member_data(uuid, uuid) from public, anon;

grant execute on function public.current_org_role_slug(uuid) to authenticated;
grant execute on function public.linked_trainer_id(uuid) to authenticated;
grant execute on function public.linked_gym_member_id(uuid) to authenticated;
grant execute on function public.can_view_member_data(uuid, uuid) to authenticated;
