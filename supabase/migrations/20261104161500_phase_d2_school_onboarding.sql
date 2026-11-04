-- Bright Nexa Phase D2 — staged, NOT applied to live.
-- A separately approved platform admin can request a school and explicitly invite its owner.
-- Privileged provisioning/activation are server-only calls (service_role, never browser).
-- No existing school or owner records are updated during migration.
begin;

create table public.bn_school_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  school_name text not null check (char_length(btrim(school_name)) between 3 and 120),
  owner_email text not null check (char_length(owner_email) between 5 and 254 and owner_email=lower(btrim(owner_email))),
  contact_phone text check (contact_phone is null or char_length(contact_phone) between 7 and 20),
  notes text check (notes is null or char_length(notes)<=300),
  status text not null default 'draft'
    check (status in ('draft','inviting','invited','needs_attention','activated')),
  institution_id uuid unique references public.institutions(id) on delete restrict,
  owner_auth_user_id uuid unique references auth.users(id) on delete restrict,
  owner_verified_at timestamptz,
  invited_at timestamptz,
  activated_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bn_onboarding_consistent_status check (
    (status='draft' and institution_id is null and owner_auth_user_id is null and invited_at is null)
    or (status='inviting' and institution_id is null and owner_auth_user_id is null)
    or (status='needs_attention')
    or (status='invited' and institution_id is not null and owner_auth_user_id is not null and invited_at is not null)
    or (status='activated' and institution_id is not null and owner_auth_user_id is not null and invited_at is not null and activated_at is not null)
  )
);
create unique index bn_onboarding_email_once on public.bn_school_onboarding_requests(lower(owner_email));
create index bn_onboarding_status_created on public.bn_school_onboarding_requests(status,created_at desc);
alter table public.bn_school_onboarding_requests enable row level security;
revoke all on table public.bn_school_onboarding_requests from public,anon,authenticated;
grant select on table public.bn_school_onboarding_requests to authenticated;
create policy bn_onboarding_platform_read on public.bn_school_onboarding_requests
 for select to authenticated using(
  exists(select 1 from public.bn_platform_admins a where a.auth_user_id=(select auth.uid()) and a.active)
 );

create table public.bn_school_onboarding_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.bn_school_onboarding_requests(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check(operation in ('requested','invitation_started','invited','needs_attention','owner_verified','activated')),
  note text check(note is null or char_length(note)<=220),
  recorded_at timestamptz not null default now()
);
create index bn_onboarding_events_request_date
 on public.bn_school_onboarding_events(request_id,recorded_at desc);
alter table public.bn_school_onboarding_events enable row level security;
revoke all on table public.bn_school_onboarding_events from public,anon,authenticated;
grant select on table public.bn_school_onboarding_events to authenticated;
create policy bn_onboarding_events_platform_read on public.bn_school_onboarding_events
 for select to authenticated using(
  exists(select 1 from public.bn_platform_admins a where a.auth_user_id=(select auth.uid()) and a.active)
 );
-- No browser INSERT, UPDATE or DELETE privileges on requests/events.

-- Complete a previously invited owner atomically: creates trial school + active school-admin
-- membership. Email invitation is sent by the external edge function BEFORE this transaction.
-- If the mail provider succeeded but this DB call fails, operator must reconcile; never retry blindly.
create function public.bn_complete_school_invitation(
  p_request_id uuid, p_owner_id uuid, p_actor_id uuid, p_owner_email text)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_request public.bn_school_onboarding_requests%rowtype;
  v_school uuid;
begin
  if not exists(
    select 1 from public.bn_platform_admins
     where auth_user_id=p_actor_id and active=true
  ) then
    raise exception 'Active platform administrator required' using errcode='42501';
  end if;
  select * into v_request from public.bn_school_onboarding_requests
   where id=p_request_id for update;
  if not found or v_request.status<>'inviting' then
    raise exception 'Invitation has already changed or requires manual reconciliation' using errcode='23505';
  end if;
  if p_owner_id is null or lower(btrim(p_owner_email))<>v_request.owner_email then
    raise exception 'Invitation identity does not match approved request' using errcode='23514';
  end if;
  if exists(
    select 1 from public.school_users
     where auth_user_id=p_owner_id or lower(email)=v_request.owner_email
  ) then
    raise exception 'Owner account already belongs to a school: manual review required' using errcode='23505';
  end if;
  insert into public.institutions(name,status)
    values(v_request.school_name,'trial') returning id into v_school;
  insert into public.school_users(institution_id,auth_user_id,email,role,status)
    values(v_school,p_owner_id,v_request.owner_email,'school_admin','active');
  insert into public.school_contact_profiles(institution_id,owner_email,contact_mobile,is_test_school)
    values(v_school,v_request.owner_email,v_request.contact_phone,false);
  update public.bn_school_onboarding_requests
     set status='invited',institution_id=v_school,owner_auth_user_id=p_owner_id,
         invited_at=now(),updated_at=now(),updated_by=p_actor_id
     where id=v_request.id;
  insert into public.bn_school_onboarding_events(request_id,actor_id,operation,note)
    values(v_request.id,p_actor_id,'invited','Trial school created for invited owner; email verification pending');
  return v_school;
end;
$$;
revoke all on function public.bn_complete_school_invitation(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.bn_complete_school_invitation(uuid,uuid,uuid,text) to service_role;

-- Atomically promote a trial institution only AFTER the platform server confirms the
-- invited owner's email in Auth and stores owner_verified_at. No fake starter classes/staff.
create function public.bn_activate_invited_school(p_request_id uuid,p_actor_id uuid)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_request public.bn_school_onboarding_requests%rowtype;
  v_school uuid;
begin
  if not exists(
    select 1 from public.bn_platform_admins
     where auth_user_id=p_actor_id and active=true
  ) then
    raise exception 'Active platform administrator required' using errcode='42501';
  end if;
  select * into v_request from public.bn_school_onboarding_requests
   where id=p_request_id for update;
  if not found or v_request.status<>'invited' or v_request.owner_verified_at is null
     or v_request.institution_id is null or v_request.owner_auth_user_id is null then
    raise exception 'Onboarding is not ready for activation' using errcode='23514';
  end if;
  if not exists(
    select 1 from public.school_users su
     where su.institution_id=v_request.institution_id
       and su.auth_user_id=v_request.owner_auth_user_id
       and su.email=v_request.owner_email and su.role='school_admin' and su.status='active'
  ) then
    raise exception 'Verified school owner membership missing' using errcode='23514';
  end if;
  if not exists(select 1 from public.school_classes c where c.institution_id=v_request.institution_id) then
    raise exception 'School owner must configure at least one class' using errcode='23514';
  end if;
  if not exists(
    select 1 from public.school_teacher_assignments a
      join public.school_users u on u.id=a.school_user_id
      join public.school_classes c on c.id=a.class_id
     where a.institution_id=v_request.institution_id and a.active=true
       and u.institution_id=v_request.institution_id and u.role='teacher' and u.status='active'
       and c.institution_id=v_request.institution_id
  ) then
    raise exception 'Owner must invite a teacher and assign an actual class' using errcode='23514';
  end if;
  update public.institutions
     set status='active'
   where id=v_request.institution_id and status='trial'
   returning id into v_school;
  if v_school is null then
    raise exception 'Only trial schools can be activated by D2' using errcode='23514';
  end if;
  update public.bn_school_onboarding_requests
     set status='activated',activated_at=now(),updated_at=now(),updated_by=p_actor_id
   where id=v_request.id;
  insert into public.bn_school_onboarding_events(request_id,actor_id,operation,note)
   values(v_request.id,p_actor_id,'activated','Owner, class and teacher assignments verified');
  return v_school;
end;
$$;
revoke all on function public.bn_activate_invited_school(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bn_activate_invited_school(uuid,uuid) to service_role;


-- Aggregate only setup counts, not student, guardian, fee or staff personal records.
create function public.bn_onboarding_readiness(p_request_id uuid,p_actor_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
 v public.bn_school_onboarding_requests%rowtype;
 v_classes integer;
 v_teachers integer;
 v_assignments integer;
 v_invited boolean;
 v_verified boolean;
begin
 if not exists(select 1 from public.bn_platform_admins
               where auth_user_id=p_actor_id and active=true) then
   raise exception 'Active platform administrator required' using errcode='42501';
 end if;
 select * into v from public.bn_school_onboarding_requests where id=p_request_id;
 if not found then
   raise exception 'School onboarding request not found' using errcode='23514';
 end if;
 select count(*)::integer into v_classes from public.school_classes
   where institution_id=v.institution_id;
 select count(*)::integer into v_teachers from public.school_users
   where institution_id=v.institution_id and role='teacher' and status='active';
 select count(*)::integer into v_assignments
   from public.school_teacher_assignments a
   join public.school_users u on u.id=a.school_user_id and u.institution_id=a.institution_id
   join public.school_classes c on c.id=a.class_id and c.institution_id=a.institution_id
   where a.institution_id=v.institution_id and a.active=true
     and u.role='teacher' and u.status='active';
 v_invited := v.status in ('invited','activated') and v.institution_id is not null;
 v_verified := v.owner_verified_at is not null;
 return pg_catalog.jsonb_build_object(
   'invite_sent',v_invited,'owner_verified',v_verified,'institution_id',v.institution_id,
   'classes',v_classes,'teacher_accounts',v_teachers,'teacher_assignments',v_assignments,
   'ready',(v_invited and v_verified and v_classes>=1 and v_teachers>=1 and v_assignments>=1)
 );
end;
$$;
revoke all on function public.bn_onboarding_readiness(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bn_onboarding_readiness(uuid,uuid) to service_role;

commit;
