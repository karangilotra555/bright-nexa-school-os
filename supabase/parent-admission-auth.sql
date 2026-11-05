-- Service-only login throttling. No passwords or mobile numbers are stored here.
create table if not exists school_private.parent_login_attempts (
 bucket text primary key,
 window_start timestamptz not null default now(),
 attempts integer not null default 1
);
alter table school_private.parent_login_attempts enable row level security;
revoke all on school_private.parent_login_attempts from public,anon,authenticated;
grant usage on schema school_private to service_role;
grant all on school_private.parent_login_attempts to service_role;
create or replace function public.bn_parent_login_attempt(p_bucket text,p_limit integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if length(p_bucket)<>64 or p_limit not in (10,60) then return false; end if;
 delete from school_private.parent_login_attempts where window_start < now()-interval '1 day';
 insert into school_private.parent_login_attempts(bucket) values(p_bucket)
 on conflict(bucket) do update set
 attempts=case when school_private.parent_login_attempts.window_start < now()-interval '15 minutes' then 1 else school_private.parent_login_attempts.attempts+1 end,
 window_start=case when school_private.parent_login_attempts.window_start < now()-interval '15 minutes' then now() else school_private.parent_login_attempts.window_start end
 returning attempts into n;
 return n<=p_limit;
end $$;
revoke all on function public.bn_parent_login_attempt(text,integer) from public,anon,authenticated;
grant execute on function public.bn_parent_login_attempt(text,integer) to service_role;
-- Bootstrap tokens cannot become usable for records after the password changes.
-- Existing guardian sessions without this new server-controlled flag keep their access.
do $$
declare f record; definition text;
begin
 for f in select oid from pg_proc where pronamespace='school_private'::regnamespace and proname in ('parent_of','parent_in_school','parent_has_class') loop
  definition:=pg_get_functiondef(f.oid);
  if position('bn_password_pending' in definition)=0 then
   definition:=replace(definition,'SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (', 'SELECT (SELECT auth.uid()) IS NOT NULL AND coalesce((SELECT auth.jwt())->''app_metadata''->>''bn_password_pending'',''false'') <> ''true'' AND EXISTS (');
   execute definition;
  end if;
 end loop;
end $$;
