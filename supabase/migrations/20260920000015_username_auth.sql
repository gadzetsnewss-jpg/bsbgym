-- =============================================================================
-- Username + contact number for staff auth (additive)
-- =============================================================================
-- Supabase Auth still stores credentials on auth.users. Username is a public
-- identifier on profiles; login resolves it server-side and never returns
-- another user's email or contact number to the client.
-- =============================================================================

create or replace function public.normalize_username(p_username text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_username, ''))), '');
$$;

revoke all on function public.normalize_username(text) from public, anon, authenticated;

create or replace function public.normalize_contact_number(p_contact text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
  v_national text;
begin
  v_digits := regexp_replace(coalesce(p_contact, ''), '[^0-9]', '', 'g');
  if v_digits is null or v_digits = '' then
    return null;
  end if;
  if left(v_digits, 2) = '91' and length(v_digits) = 12 then
    v_national := substr(v_digits, 3);
  elsif length(v_digits) = 10 then
    v_national := v_digits;
  else
    return null;
  end if;
  if v_national !~ '^[6-9][0-9]{9}$' then
    return null;
  end if;
  return '+91' || v_national;
end;
$$;

revoke all on function public.normalize_contact_number(text) from public, anon, authenticated;

alter table public.profiles
  add column if not exists username text,
  add column if not exists contact_number text;

do $$
declare
  r record;
  v_base text;
  v_candidate text;
  i int;
begin
  for r in
    select id, email, phone
    from public.profiles
    where username is null
  loop
    v_base := left(
      regexp_replace(lower(split_part(coalesce(r.email, ''), '@', 1)), '[^a-z0-9]', '', 'g'),
      24
    );
    if v_base is null or length(v_base) < 3 or v_base !~ '^[a-z0-9]' then
      v_base := 'user' || substr(replace(r.id::text, '-', ''), 1, 8);
    end if;
    v_candidate := v_base;
    i := 0;
    while exists (select 1 from public.profiles p where p.username = v_candidate) loop
      i := i + 1;
      v_candidate := left(v_base, 24) || i::text;
    end loop;
    update public.profiles
    set
      username = v_candidate,
      contact_number = coalesce(contact_number, public.normalize_contact_number(r.phone))
    where id = r.id;
  end loop;
end $$;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (
        username is null
        or (
          char_length(username) between 3 and 32
          and username = lower(username)
          and username ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_contact_number_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_contact_number_format
      check (
        contact_number is null
        or contact_number ~ '^\+91[6-9][0-9]{9}$'
      );
  end if;
end $$;

create or replace function public.username_is_available(p_username text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := public.normalize_username(p_username);
  if v_username is null then
    return false;
  end if;
  return not exists (
    select 1
    from public.profiles p
    where p.username = v_username
  );
end;
$$;

revoke all on function public.username_is_available(text) from public;
grant execute on function public.username_is_available(text) to anon, authenticated;

create or replace function public.auth_email_for_username(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_username text;
  v_email text;
begin
  v_username := public.normalize_username(p_username);
  if v_username is null then
    return null;
  end if;
  select u.email
    into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = v_username
  limit 1;
  return v_email;
end;
$$;

revoke all on function public.auth_email_for_username(text) from public, anon, authenticated;
grant execute on function public.auth_email_for_username(text) to service_role;

create or replace function public.protect_profile_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.username is not null and new.username is distinct from old.username then
    raise exception 'username cannot be changed';
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_contact text;
begin
  v_username := public.normalize_username(new.raw_user_meta_data ->> 'username');
  v_contact := public.normalize_contact_number(
    coalesce(new.raw_user_meta_data ->> 'contact_number', new.phone)
  );

  if v_username is not null then
    if char_length(v_username) < 3 or char_length(v_username) > 32
       or v_username !~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$' then
      raise exception 'username is invalid';
    end if;
    if exists (select 1 from public.profiles p where p.username = v_username) then
      raise exception 'username is already taken';
    end if;
  end if;

  insert into public.profiles (
    id, first_name, last_name, email, phone, username, contact_number
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    v_contact,
    v_username,
    v_contact
  );
  return new;
end;
$$;
