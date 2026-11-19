-- Use the existing Android device registration with a separate emergency leave delivery queue.
begin;

alter table school_private.bn_urgent_circular_devices drop constraint bn_urgent_circular_devices_portal_check;
alter table school_private.bn_urgent_circular_devices add constraint bn_urgent_circular_devices_portal_check
  check(portal in ('parent','teacher','leadership'));

create or replace function school_private.bn_can_receive_urgent_circular(p_school uuid,p_user uuid,p_portal text)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from public.institutions i where i.id=p_school and i.status in ('active','trial'))
  and case p_portal
    when 'teacher' then school_private.bn_teacher_auth_ready(p_user) and exists(
      select 1 from public.school_users u where u.institution_id=p_school and u.auth_user_id=p_user
        and u.role='teacher' and u.status='active'
    )
    when 'leadership' then exists(
      select 1 from public.school_users m join auth.users u on u.id=m.auth_user_id
      where m.institution_id=p_school and m.auth_user_id=p_user and m.status='active'
        and m.role in ('school_admin','principal') and u.email_confirmed_at is not null
        and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
        and coalesce(u.raw_app_meta_data->>'bn_teacher_mobile_pending','false')<>'true'
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
   from school_private.bn_urgent_circular_devices d where d.institution_id=p_school and d.portal in ('parent','teacher')
     and school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal);
  return posted;
end $$;

create table school_private.bn_emergency_leave_deliveries (
  leave_id uuid not null references public.school_teacher_leave_requests(id) on delete cascade,
  installation uuid not null,
  binding uuid not null,
  expires_at timestamptz not null,
  lease_until timestamptz not null default now(),
  accepted_at timestamptz,
  primary key(leave_id,installation)
);
create index bn_emergency_leave_deliveries_expiry on school_private.bn_emergency_leave_deliveries(expires_at);
alter table school_private.bn_emergency_leave_deliveries enable row level security;
revoke all on school_private.bn_emergency_leave_deliveries from public,anon,authenticated;

create function school_private.bn_queue_emergency_leave_alert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into school_private.bn_emergency_leave_deliveries(leave_id,installation,binding,expires_at)
  select new.id,d.installation,d.binding,new.requested_at+interval '20 minutes'
  from school_private.bn_urgent_circular_devices d
  where d.institution_id=new.institution_id and d.portal='leadership'
    and school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal);
  return new;
end $$;
revoke all on function school_private.bn_queue_emergency_leave_alert() from public,anon,authenticated;

create trigger bn_queue_emergency_leave_alert after insert on public.school_teacher_leave_requests
for each row when (new.kind='emergency' and new.status='pending')
execute function school_private.bn_queue_emergency_leave_alert();

create function public.bn_claim_emergency_leave_alerts(p_at timestamptz)
returns jsonb language sql security definer set search_path='' as $$
  with ready as (
    select q.leave_id,q.installation,q.binding,d.token,l.institution_id,
      'Emergency leave request: '||left(coalesce(nullif(u.display_name,''),'Teacher'),100) as title,
      to_char(l.starts_on,'DD Mon YYYY') || case
        when l.starts_at is not null then ' · '||to_char(l.starts_on+l.starts_at,'HH24:MI')||'–'||to_char(l.ends_on+l.ends_at,'HH24:MI')
        when l.ends_on<>l.starts_on then ' – '||to_char(l.ends_on,'DD Mon YYYY')
        else ' · Full day' end as body
    from school_private.bn_emergency_leave_deliveries q
    join public.school_teacher_leave_requests l on l.id=q.leave_id
    join public.school_users u on u.id=l.teacher_id and u.institution_id=l.institution_id
    join school_private.bn_urgent_circular_devices d on d.installation=q.installation
      and d.portal='leadership' and d.binding=q.binding and d.institution_id=l.institution_id
    where l.kind='emergency' and l.status='pending' and q.accepted_at is null
      and q.lease_until<=p_at and q.expires_at>p_at
      and school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal)
    order by q.expires_at,q.leave_id,q.installation limit 100 for update of q skip locked
  ), leases as (
    update school_private.bn_emergency_leave_deliveries q set lease_until=p_at+interval '2 minutes'
    from ready r where (q.leave_id,q.installation)=(r.leave_id,r.installation)
    returning q.leave_id as event_id,q.installation,q.binding,r.token,r.institution_id as school,
      q.expires_at as expires,q.lease_until as claim_until,r.title,r.body
  ), pruned as (
    delete from school_private.bn_emergency_leave_deliveries where expires_at<p_at-interval '7 days'
  )
  select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from leases l
$$;

create function public.bn_emergency_leave_alert_still_allowed(
  p_installation uuid,p_binding uuid,p_token text,p_leave uuid,p_claim_until timestamptz
)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from school_private.bn_emergency_leave_deliveries q
    join public.school_teacher_leave_requests l on l.id=q.leave_id
    join school_private.bn_urgent_circular_devices d on d.installation=q.installation
      and d.portal='leadership' and d.binding=q.binding and d.institution_id=l.institution_id
    where q.leave_id=p_leave and q.installation=p_installation and q.binding=p_binding
      and q.lease_until=p_claim_until and q.lease_until>now() and q.expires_at>now()
      and q.accepted_at is null and l.kind='emergency' and l.status='pending' and d.token=p_token
      and school_private.bn_can_receive_urgent_circular(d.institution_id,d.auth_user_id,d.portal)
  )
$$;

create function public.bn_finish_emergency_leave_alert(
  p_installation uuid,p_binding uuid,p_token text,p_leave uuid,p_claim_until timestamptz,p_invalid boolean,p_retry_at timestamptz
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_invalid then
    delete from school_private.bn_urgent_circular_devices where installation=p_installation and portal='leadership'
      and binding=p_binding and token=p_token;
  elsif p_retry_at is not null then
    update school_private.bn_emergency_leave_deliveries set lease_until=least(expires_at,p_retry_at)
    where leave_id=p_leave and installation=p_installation and binding=p_binding
      and lease_until=p_claim_until and accepted_at is null and least(expires_at,p_retry_at)>lease_until;
  else
    update school_private.bn_emergency_leave_deliveries set accepted_at=now()
    where leave_id=p_leave and installation=p_installation and binding=p_binding
      and lease_until=p_claim_until and accepted_at is null;
  end if;
end $$;

create function public.bn_leadership_emergency_leave(p_school uuid,p_leave uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not school_private.bn_can_receive_urgent_circular(p_school,auth.uid(),'leadership')
  then raise exception 'Verified Owner or Principal required' using errcode='42501'; end if;
  return (select jsonb_build_object('id',l.id,'teacher_name',u.display_name,'starts_on',l.starts_on,
    'ends_on',l.ends_on,'starts_at',l.starts_at,'ends_at',l.ends_at,'reason',l.reason,'kind',l.kind,
    'status',l.status,'can_cancel',l.status='pending' or (l.status='approved'
      and school_private.bn_teacher_leave_starts_at(l)>statement_timestamp() at time zone 'Asia/Kolkata'))
    from public.school_teacher_leave_requests l join public.school_users u
      on u.id=l.teacher_id and u.institution_id=l.institution_id
    where l.institution_id=p_school and l.id=p_leave and l.kind='emergency');
end $$;

revoke all on function public.bn_claim_emergency_leave_alerts(timestamptz),
  public.bn_emergency_leave_alert_still_allowed(uuid,uuid,text,uuid,timestamptz),
  public.bn_finish_emergency_leave_alert(uuid,uuid,text,uuid,timestamptz,boolean,timestamptz),
  public.bn_leadership_emergency_leave(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bn_claim_emergency_leave_alerts(timestamptz),
  public.bn_emergency_leave_alert_still_allowed(uuid,uuid,text,uuid,timestamptz),
  public.bn_finish_emergency_leave_alert(uuid,uuid,text,uuid,timestamptz,boolean,timestamptz) to service_role;
grant execute on function public.bn_leadership_emergency_leave(uuid,uuid) to authenticated;

commit;
