-- First-school onboarding. Called only by a verified Supabase Auth identity.
-- No browser-supplied role, institution ID or email can affect privileges.
create or replace function public.register_first_school(p_school_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_name text;
  v_school uuid;
  v_school_user uuid;
begin
  if v_actor is null then
    raise exception 'Sign in to your verified owner account first.' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 1));
  select u.email into v_email
  from auth.users as u
  where u.id = v_actor and u.email_confirmed_at is not null
    and u.is_anonymous is false and u.email is not null;
  if v_email is null then
    raise exception 'Verify your account email before creating a school.' using errcode = '28000';
  end if;
  v_name := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_school_name, '')), '[[:space:]]+', ' ', 'g');
  if pg_catalog.char_length(v_name) < 3 or pg_catalog.char_length(v_name) > 120 then
    raise exception 'School name must be 3 to 120 characters.' using errcode = '22023';
  end if;
  if exists(select 1 from public.school_users as su where su.auth_user_id = v_actor) then
    raise exception 'This account is already assigned to a school. Contact support for multi-school access.' using errcode = '23505';
  end if;
  insert into public.institutions(name, status)
  values(v_name, 'trial') returning id into v_school;
  insert into public.school_users(institution_id, auth_user_id, email, role, status)
  values(v_school, v_actor, v_email, 'school_admin', 'active') returning id into v_school_user;
  insert into public.school_audit_events(institution_id, actor_id, action, entity, entity_id)
  values(v_school, v_school_user, 'school.self_registered', 'institution', v_school);
  return v_school;
end;
$$;
revoke all on function public.register_first_school(text) from public, anon, authenticated;
grant execute on function public.register_first_school(text) to authenticated;
comment on function public.register_first_school(text) is
  'Verified first-owner signup only; one institution per auth account; admin role from server-side auth only.';
