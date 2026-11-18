-- Keep the circular, its audit entry and its Android delivery queue in one transaction.
-- Depends on 20261117100000_teacher_leave_notifications.sql and 20261118100000_leadership_pulse_notice_finance.sql.
begin;

create table school_private.bn_urgent_circular_devices (
  installation uuid not null,
  portal text not null check(portal in ('parent','teacher')),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  registration uuid not null,
  binding uuid not null default gen_random_uuid(),
  primary key(installation,portal),
  unique(portal,token)
);
create index bn_urgent_circular_devices_school on school_private.bn_urgent_circular_devices(institution_id);

create table school_private.bn_urgent_circular_deliveries (
  notice_id uuid not null references public.school_notices(id) on delete cascade,
  installation uuid not null,
  portal text not null,
  binding uuid not null,
  expires_at timestamptz not null,
  lease_until timestamptz not null default now(),
  accepted_at timestamptz,
  primary key(notice_id,installation,portal)
);
create index bn_urgent_circular_delivery_expiry on school_private.bn_urgent_circular_deliveries(expires_at);
alter table school_private.bn_urgent_circular_devices enable row level security;
alter table school_private.bn_urgent_circular_deliveries enable row level security;
revoke all on school_private.bn_urgent_circular_devices,school_private.bn_urgent_circular_deliveries from public,anon,authenticated;

create function school_private.bn_can_receive_urgent_circular(p_school uuid,p_user uuid,p_portal text)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from public.institutions i where i.id=p_school and i.status in ('active','trial'))
  and case p_portal
    when 'teacher' then school_private.bn_teacher_auth_ready(p_user) and exists(
      select 1 from public.school_users u where u.institution_id=p_school and u.auth_user_id=p_user
        and u.role='teacher' and u.status='active'
    )
    when 'parent' then exists(
      select 1 from auth.users u
      join public.school_guardians g on g.auth_user_id=u.id and g.institution_id=p_school and g.status='active'
      join public.school_guardian_students l on l.guardian_id=g.id and l.institution_id=g.institution_id
      join public.school_students s on s.id=l.student_id and s.institution_id=l.institution_id and s.status='active'
      where u.id=p_user and u.email_confirmed_at is not null and u.deleted_at is null
        and (u.banned_until is null or u.banned_until<=now())
        and coalesce(u.raw_app_meta_data->>'bn_password_pending','false')<>'true'
        and u.raw_app_meta_data->>'bn_institution_id'=p_school::text
        and u.raw_app_meta_data->>'bn_student_id'=s.id::text
    )
    else false
  end
$$;
revoke all on function school_private.bn_can_receive_urgent_circular(uuid,uuid,text) from public,anon,authenticated;

create function public.bn_enable_urgent_circular_alerts(p_school uuid,p_portal text,p_installation uuid,p_token text,p_registration uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare device_binding uuid;
begin
  if (select auth.uid()) is null or not school_private.bn_can_receive_urgent_circular(p_school,auth.uid(),p_portal)
    or (p_portal='parent' and coalesce(auth.jwt()#>>'{app_metadata,bn_password_pending}','false')='true')
    or (p_portal='teacher' and coalesce(auth.jwt()#>>'{app_metadata,bn_teacher_mobile_pending}','false')='true')
  then raise exception 'Verified school access required' using errcode='42501'; end if;
  if p_installation is null or p_registration is null or coalesce(length(p_token),0) not between 20 and 4096
  then raise exception 'Invalid device registration'; end if;

  perform pg_advisory_xact_lock(hashtext('bn-urgent-circular:'||p_portal||':'||p_token));
  delete from school_private.bn_urgent_circular_devices d
    where d.portal=p_portal and d.token=p_token and d.installation<>p_installation;
  insert into school_private.bn_urgent_circular_devices as d(installation,portal,institution_id,auth_user_id,token,registration)
  values(p_installation,p_portal,p_school,auth.uid(),p_token,p_registration)
  on conflict(installation,portal) do update set institution_id=excluded.institution_id,
    auth_user_id=excluded.auth_user_id,token=excluded.token,registration=excluded.registration,
    binding=case when (d.institution_id,d.auth_user_id)=(excluded.institution_id,excluded.auth_user_id)
      then d.binding else gen_random_uuid() end
  where d.token=excluded.token or d.auth_user_id=excluded.auth_user_id
  returning binding into device_binding;
  if device_binding is null then raise exception 'Device registration changed. Enable alerts again.'; end if;
  return device_binding;
end $$;

create function public.bn_disable_urgent_circular_alerts(p_school uuid,p_portal text,p_installation uuid,p_binding uuid,p_registration uuid)
returns void language sql security definer set search_path='' as $$
  delete from school_private.bn_urgent_circular_devices d where d.installation=p_installation
    and d.portal=p_portal and d.institution_id=p_school and d.auth_user_id=auth.uid() and d.binding=p_binding and d.registration=p_registration
$$;

-- Keep the mapping current after Firebase rotates the installation token.
create function public.bn_rotate_urgent_circular_token(p_installation uuid,p_portal text,p_binding uuid,p_token text)
returns void language sql security definer set search_path='' as $$
  update school_private.bn_urgent_circular_devices d set token=p_token
  where d.installation=p_installation and d.portal=p_portal and d.binding=p_binding
    and length(p_token) between 20 and 4096
    and school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal)
$$;

create or replace function public.bn_leadership_publish_urgent_notice(p_school uuid,p_request_id uuid,p_title text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; posted uuid; prior public.school_notices%rowtype;
begin
  if (select auth.uid()) is null or not school_private.has_role(p_school,array['school_admin','principal'])
  then raise exception 'Verified Owner or Principal required' using errcode='42501'; end if;
  if p_request_id is null or length(btrim(coalesce(p_title,''))) not between 8 and 120
    or length(btrim(coalesce(p_body,''))) not between 15 and 1500
  then raise exception 'Enter a valid notice title and message'; end if;
  select u.id into actor from public.school_users u
   where u.institution_id=p_school and u.auth_user_id=auth.uid()
     and u.role in ('school_admin','principal') and u.status='active'
   order by u.id limit 1;
  if actor is null then raise exception 'Verified school membership required' using errcode='42501'; end if;

  insert into public.school_notices(id,institution_id,title,body,created_by)
  values(p_request_id,p_school,btrim(p_title),btrim(p_body),actor)
  on conflict(id) do nothing returning id into posted;
  if posted is null then
    select * into prior from public.school_notices where id=p_request_id;
    if prior.institution_id=p_school and prior.created_by=actor
       and prior.title=btrim(p_title) and prior.body=btrim(p_body)
    then return prior.id; end if;
    raise exception 'Notice request key conflict' using errcode='23505';
  end if;

  insert into public.school_audit_events(institution_id,actor_id,action,entity,entity_id)
  values(p_school,actor,'leadership.urgent_notice_publish','notices',posted);
  insert into school_private.bn_urgent_circular_deliveries(notice_id,installation,portal,binding,expires_at)
   select posted,d.installation,d.portal,d.binding,now()+interval '20 minutes'
   from school_private.bn_urgent_circular_devices d where d.institution_id=p_school
     and school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal);
  return posted;
end $$;

create function public.bn_claim_urgent_circular_alerts(p_at timestamptz)
returns jsonb language sql security definer set search_path='' as $$
  with ready as (
    select q.notice_id,q.installation,q.portal,d.token,d.binding,q.expires_at
    from school_private.bn_urgent_circular_deliveries q
    join public.school_notices n on n.id=q.notice_id
    join school_private.bn_urgent_circular_devices d on d.installation=q.installation and d.portal=q.portal
      and d.binding=q.binding and d.institution_id=n.institution_id
    where q.accepted_at is null and q.expires_at>p_at and q.lease_until<=p_at
      and school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal)
    order by q.expires_at,q.notice_id,q.installation,q.portal limit 100 for update of q skip locked
  ), leases as (
    update school_private.bn_urgent_circular_deliveries q set lease_until=p_at+interval '2 minutes'
    from ready r where (q.notice_id,q.installation,q.portal)=(r.notice_id,r.installation,r.portal)
    returning r.notice_id as event_id,r.installation,r.portal,r.token,r.binding,r.expires_at as expires,q.lease_until as claim_until
  ), pruned as (
    delete from school_private.bn_urgent_circular_deliveries where expires_at<p_at-interval '7 days'
  )
  select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from leases l
$$;

-- A queued recipient might be revoked while another delivery is running.
create function public.bn_urgent_circular_alert_still_allowed(
  p_installation uuid,p_portal text,p_binding uuid,p_token text,p_notice uuid,p_claim_until timestamptz
)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from school_private.bn_urgent_circular_deliveries q
    join public.school_notices n on n.id=q.notice_id
    join school_private.bn_urgent_circular_devices d on d.installation=q.installation and d.portal=q.portal
      and d.binding=q.binding and d.institution_id=n.institution_id
    where q.notice_id=p_notice and q.installation=p_installation and q.portal=p_portal
      and d.binding=p_binding and d.token=p_token and q.accepted_at is null
      and q.lease_until=p_claim_until and q.lease_until>now() and q.expires_at>now()
      and school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal)
  )
$$;

create function public.bn_finish_urgent_circular_alert(p_installation uuid,p_portal text,p_binding uuid,p_token text,p_notice uuid,p_invalid boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_invalid then
    delete from school_private.bn_urgent_circular_devices d where d.installation=p_installation
      and d.portal=p_portal and d.binding=p_binding and d.token=p_token;
  else
    update school_private.bn_urgent_circular_deliveries q set accepted_at=now()
    where q.notice_id=p_notice and q.installation=p_installation and q.portal=p_portal and q.binding=p_binding
      and exists(select 1 from school_private.bn_urgent_circular_devices d where d.installation=q.installation
        and d.portal=q.portal and d.binding=p_binding and d.token=p_token);
  end if;
end $$;

create function public.bn_leadership_urgent_delivery_status(p_school uuid,p_notice uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not school_private.has_role(p_school,array['school_admin','principal'])
    or not exists(select 1 from public.school_notices n where n.id=p_notice and n.institution_id=p_school)
  then raise exception 'Verified Owner or Principal required' using errcode='42501'; end if;
  return (with deliveries as (
    select q.accepted_at,q.expires_at,d.installation is not null and
      school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal) as eligible
    from school_private.bn_urgent_circular_deliveries q
    left join school_private.bn_urgent_circular_devices d on d.installation=q.installation and d.portal=q.portal
      and d.binding=q.binding and d.institution_id=p_school
    where q.notice_id=p_notice
  ) select jsonb_build_object(
    'waiting',count(*) filter (where accepted_at is null and expires_at>now() and eligible),
    'accepted',count(*) filter (where accepted_at is not null),
    'expired',count(*) filter (where accepted_at is null and expires_at<=now()),
    'unavailable',count(*) filter (where accepted_at is null and expires_at>now() and not eligible)
  ) from deliveries);
end $$;
revoke all on function public.bn_leadership_urgent_delivery_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bn_leadership_urgent_delivery_status(uuid,uuid) to authenticated;

revoke all on function public.bn_enable_urgent_circular_alerts(uuid,text,uuid,text,uuid),
 public.bn_disable_urgent_circular_alerts(uuid,text,uuid,uuid,uuid),public.bn_rotate_urgent_circular_token(uuid,text,uuid,text),
 public.bn_claim_urgent_circular_alerts(timestamptz),
 public.bn_urgent_circular_alert_still_allowed(uuid,text,uuid,text,uuid,timestamptz),public.bn_finish_urgent_circular_alert(uuid,text,uuid,text,uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.bn_enable_urgent_circular_alerts(uuid,text,uuid,text,uuid),
 public.bn_disable_urgent_circular_alerts(uuid,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.bn_rotate_urgent_circular_token(uuid,text,uuid,text) to anon,authenticated;
grant execute on function public.bn_claim_urgent_circular_alerts(timestamptz),
 public.bn_urgent_circular_alert_still_allowed(uuid,text,uuid,text,uuid,timestamptz),
 public.bn_finish_urgent_circular_alert(uuid,text,uuid,text,uuid,boolean) to service_role;

commit;
