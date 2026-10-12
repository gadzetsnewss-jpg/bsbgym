-- Additive. Branch override writes for the existing branch_settings JSONB store.
-- Reuses is_org_admin and require_branch_in_org. No new tables. No deletes.

create or replace function public.upsert_branch_setting(
  p_org_id uuid,
  p_branch_id uuid,
  p_setting_key text,
  p_setting_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_org_id is null then
    raise exception 'organization is required';
  end if;
  if not public.is_org_admin(p_org_id) then
    raise exception 'insufficient privileges';
  end if;
  perform public.require_branch_in_org(p_org_id, p_branch_id);
  if nullif(trim(p_setting_key), '') is null then
    raise exception 'setting key is required';
  end if;
  if p_setting_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'setting key is invalid';
  end if;

  insert into public.branch_settings (
    organization_id, branch_id, setting_key, setting_value
  )
  values (
    p_org_id,
    p_branch_id,
    trim(p_setting_key),
    coalesce(p_setting_value, '{}'::jsonb)
  )
  on conflict (branch_id, setting_key)
  do update set setting_value = excluded.setting_value;
end;
$$;

grant execute on function public.upsert_branch_setting(uuid, uuid, text, jsonb) to authenticated;
