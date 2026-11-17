begin;

alter table public.school_timetable_drafts add column room_number text not null default ''
  check (length(room_number) <= 40);
alter table public.school_timetable_published add column room_number text not null default ''
  check (length(room_number) <= 40);

-- Keep room publication in the existing atomic timetable publication transaction.
create function school_private.bn_publish_period_room()
returns trigger language plpgsql set search_path='' as $$
begin
  select d.room_number into new.room_number from public.school_timetable_drafts d
  where d.institution_id=new.institution_id and d.class_id=new.class_id and d.slot_id=new.slot_id;
  new.room_number := coalesce(new.room_number, '');
  return new;
end $$;
create trigger bn_publish_period_room before insert on public.school_timetable_published
for each row when (new.room_number='') execute function school_private.bn_publish_period_room();

create table public.school_teacher_leave_requests (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 teacher_id uuid not null,
 starts_on date not null,
 ends_on date not null,
 starts_at time,
 ends_at time,
 kind text not null check(kind in ('planned','emergency')),
 reason text not null check(length(btrim(reason)) between 1 and 500),
 status text not null default 'pending' check(status in ('pending','approved','declined','cancelled')),
 requested_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by uuid,
 schedule_year text,
 foreign key (teacher_id,institution_id) references public.school_users(id,institution_id),
 check (ends_on between starts_on and starts_on+30),
 check ((starts_at is null and ends_at is null) or
        (starts_on=ends_on and starts_at is not null and ends_at is not null and ends_at>starts_at))
);
create index bn_teacher_leave_dates on public.school_teacher_leave_requests(institution_id,teacher_id,starts_on,ends_on) where status='approved';

create table public.school_teacher_covers (
 institution_id uuid not null references public.institutions(id),
 day date not null,
 slot_id uuid not null,
 class_id uuid not null,
 leave_id uuid not null references public.school_teacher_leave_requests(id),
 original_id uuid not null,
 original_subject text not null,
 substitute_id uuid not null,
 published_at timestamptz not null default now(),
 primary key(institution_id,day,slot_id,class_id),
 foreign key(slot_id,institution_id) references public.school_timetable_slots(id,institution_id),
 foreign key(class_id,institution_id) references public.school_classes(id,institution_id),
 foreign key(original_id,institution_id) references public.school_users(id,institution_id),
 foreign key(substitute_id,institution_id) references public.school_users(id,institution_id),
 unique(institution_id,day,slot_id,substitute_id)
);

create table school_private.bn_teacher_alert_devices (
 installation uuid primary key,
 institution_id uuid not null references public.institutions(id),
 teacher_id uuid not null,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 token text unique not null,
 binding uuid not null default gen_random_uuid(),
 foreign key(teacher_id,institution_id) references public.school_users(id,institution_id)
);
create table school_private.bn_teacher_alert_deliveries (
 installation uuid not null references school_private.bn_teacher_alert_devices(installation) on delete cascade,
 event_id text not null,
 lease_until timestamptz not null,
 delivered boolean not null default false,
 primary key(installation,event_id)
);

alter table public.school_teacher_leave_requests enable row level security;
alter table public.school_teacher_covers enable row level security;
alter table school_private.bn_teacher_alert_devices enable row level security;
alter table school_private.bn_teacher_alert_deliveries enable row level security;
revoke all on public.school_teacher_leave_requests,public.school_teacher_covers from public,anon,authenticated;

create function school_private.bn_teacher_auth_ready(p_auth_user uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=p_auth_user
    and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
    and u.deleted_at is null
    and coalesce(u.raw_app_meta_data->>'bn_teacher_mobile_pending','false')<>'true')
$$;

create function school_private.bn_teacher_member(p_school uuid)
returns uuid language sql stable set search_path='' as $$
  select u.id from public.school_users u join public.institutions i on i.id=u.institution_id
  where u.institution_id=p_school and u.auth_user_id=auth.uid() and u.role='teacher'
    and u.status='active' and i.status in ('active','trial')
    and coalesce(auth.jwt()#>>'{app_metadata,bn_teacher_mobile_pending}','false')<>'true'
    and school_private.bn_teacher_auth_ready(u.auth_user_id)
$$;

create function school_private.bn_clear_inactive_teacher_devices()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'active' or new.role<>'teacher' or new.auth_user_id is distinct from old.auth_user_id then
    delete from school_private.bn_teacher_alert_devices d where d.teacher_id=old.id;
  end if;
  return new;
end $$;
create trigger bn_clear_inactive_teacher_devices after update of status,role,auth_user_id on public.school_users
for each row execute function school_private.bn_clear_inactive_teacher_devices();

create function public.bn_list_teacher_leaves(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid; can_review boolean;
begin
  can_review := school_private.has_role(p_school,array['school_admin']);
  viewer := school_private.bn_teacher_member(p_school);
  if not can_review and viewer is null then raise exception 'Teacher or school admin required' using errcode='42501'; end if;

  return coalesce((select jsonb_agg(to_jsonb(r) order by r.priority,r.requested_at desc) from (
    select l.id,l.teacher_id,u.display_name as teacher_name,l.starts_on,l.ends_on,l.starts_at,l.ends_at,
           l.kind,l.reason,l.status,l.requested_at,l.decided_at,
           case when l.status='pending' and l.kind='emergency' then 0 when l.status='pending' then 1 else 2 end as priority
    from public.school_teacher_leave_requests l join public.school_users u on u.id=l.teacher_id
    where l.institution_id=p_school and (can_review or l.teacher_id=viewer)
    order by priority,l.requested_at desc limit 100
  ) r),'[]'::jsonb);
end $$;

create function public.bn_request_teacher_leave(p_school uuid,p_from date,p_to date,p_start time,p_end time,p_kind text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare teacher uuid; leave_id uuid;
begin
  teacher := school_private.bn_teacher_member(p_school);
  if teacher is null then raise exception 'Active teacher required' using errcode='42501'; end if;
  if p_from<(now() at time zone 'Asia/Kolkata')::date then raise exception 'Use today or a future date'; end if;
  perform pg_advisory_xact_lock(hashtext('bn-tt-publish:'||p_school::text));
  if exists(select 1 from public.school_teacher_leave_requests l
    where l.institution_id=p_school and l.teacher_id=teacher and l.status in ('pending','approved')
      and l.starts_on<=p_to and l.ends_on>=p_from
      and (l.starts_at is null or p_start is null or (l.starts_at<p_end and l.ends_at>p_start)))
  then raise exception 'An overlapping leave request already exists'; end if;
  insert into public.school_teacher_leave_requests(institution_id,teacher_id,starts_on,ends_on,starts_at,ends_at,kind,reason)
  values(p_school,teacher,p_from,p_to,p_start,p_end,p_kind,btrim(p_reason)) returning id into leave_id;
  return leave_id;
end $$;

create function school_private.bn_active_timetable_year(p_school uuid)
returns text language sql stable set search_path='' as $$
 select coalesce(
   (select nullif(btrim(w.snapshot#>>'{institution,institution,session}'),'')
    from public.school_workspaces w where w.institution_id=p_school),
   (select max(p.academic_year) from public.school_timetable_published p where p.institution_id=p_school)
 )
$$;

create function school_private.bn_has_cover_qualification(p_school uuid,p_teacher uuid,p_class uuid,p_subject text)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.school_teacher_assignments a
   where a.institution_id=p_school and a.school_user_id=p_teacher and a.active
     and ((a.assignment_type='subject_teacher' and lower(btrim(a.subject))=lower(btrim(p_subject)))
     or (a.assignment_type='class_teacher' and a.class_id=p_class)))
$$;

create function public.bn_review_teacher_leave(p_school uuid,p_leave uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('approved','declined','cancelled') or p_status is null then raise exception 'Invalid decision'; end if;
  if p_status<>'cancelled' and not school_private.has_role(p_school,array['school_admin'])
  then raise exception 'School admin required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('bn-tt-publish:'||p_school::text));
  update public.school_teacher_leave_requests l
     set status=p_status,decided_at=now(),decided_by=auth.uid(),
         schedule_year=case when p_status='approved' then school_private.bn_active_timetable_year(p_school) end
   where l.institution_id=p_school and l.id=p_leave and l.status='pending'
     and (p_status<>'cancelled' or l.teacher_id=school_private.bn_teacher_member(p_school));
  if not found then raise exception 'The request is unavailable or already reviewed'; end if;
end $$;

create function school_private.bn_time_off(p_school uuid,p_teacher uuid,p_day date,p_start time,p_end time)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from public.school_teacher_leave_requests l
    where l.institution_id=p_school and l.teacher_id=p_teacher and l.status='approved'
      and p_day between l.starts_on and l.ends_on
      and (l.starts_at is null or (l.starts_at<p_end and l.ends_at>p_start)))
$$;

create function school_private.bn_timetable_holiday(p_school uuid,p_day date)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.school_workspaces w,
 lateral jsonb_array_elements(coalesce(w.snapshot#>'{operations,holidays}','[]')) h
 where w.institution_id=p_school and h->>'date'=p_day::text and h->>'appliesTo' in ('All','Teaching Staff'))
$$;

create function school_private.bn_effective_teacher_day(p_school uuid,p_day date)
returns table(slot_id uuid,class_id uuid,class_name text,subject text,room_number text,label text,
              starts_at time,ends_at time,regular_id uuid,teacher_id uuid,cover_published_at timestamptz)
language sql stable set search_path='' as $$
  select s.id,c.id,concat_ws(' ',c.name,nullif(c.section,''),nullif(c.academic_stream,'')),p.subject,p.room_number,
    s.label,s.starts_at,s.ends_at,p.teacher_user_id,
    case when off.on_leave then checked.substitute_id else regular.id end,
    case when off.on_leave and checked.substitute_id is not null then cover.published_at end
  from public.school_timetable_published p
  join public.school_timetable_slots s on s.id=p.slot_id and s.institution_id=p.institution_id
  join public.school_classes c on c.id=p.class_id and c.institution_id=p.institution_id
  left join public.school_users regular on regular.id=p.teacher_user_id and regular.role='teacher' and regular.status='active'
    and exists(select 1 from public.school_teacher_assignments a where a.institution_id=p_school and a.school_user_id=regular.id
      and a.class_id=c.id and a.active and (a.assignment_type='class_teacher'
        or (a.assignment_type='subject_teacher' and lower(btrim(a.subject))=lower(btrim(p.subject)))))
  cross join lateral (select school_private.bn_time_off(p_school,p.teacher_user_id,p_day,s.starts_at,s.ends_at) as on_leave) off
  left join public.school_teacher_covers cover on cover.institution_id=p_school and cover.day=p_day
    and cover.slot_id=s.id and cover.class_id=c.id and cover.original_id=p.teacher_user_id
  left join public.school_users u on u.id=cover.substitute_id and u.status='active' and u.role='teacher'
  cross join lateral (select case when u.id is not null
    and lower(btrim(cover.original_subject))=lower(btrim(p.subject))
    and school_private.bn_has_cover_qualification(p_school,u.id,c.id,p.subject)
    and not school_private.bn_time_off(p_school,u.id,p_day,s.starts_at,s.ends_at)
    and not exists(select 1 from public.school_timetable_published busy
      where busy.institution_id=p_school and busy.slot_id=s.id and busy.teacher_user_id=u.id)
    then u.id end as substitute_id) checked
  where p.institution_id=p_school and p.academic_year=school_private.bn_active_timetable_year(p_school)
    and s.weekday=extract(dow from p_day) and s.kind='period'
    and not school_private.bn_timetable_holiday(p_school,p_day)
$$;

create function public.bn_teacher_day(p_school uuid,p_day date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid;
begin
  viewer := school_private.bn_teacher_member(p_school);
  if viewer is null then raise exception 'Active teacher required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg((to_jsonb(d)-'regular_id'-'teacher_id'-'cover_published_at')
      ||jsonb_build_object('is_cover',d.regular_id<>viewer) order by d.starts_at,d.class_id)
    from school_private.bn_effective_teacher_day(p_school,p_day) d where d.teacher_id=viewer),'[]'::jsonb);
end $$;

create function school_private.bn_cover_candidates(p_school uuid,p_day date,p_slot uuid,p_class uuid,p_subject text)
returns table(teacher_id uuid, teacher_name text, subject_match boolean, periods bigint)
language sql stable set search_path='' as $$
  select u.id,coalesce(nullif(u.display_name,''),'Teacher'),
    exists(select 1 from public.school_teacher_assignments a
      where a.institution_id=p_school and a.school_user_id=u.id and a.active
        and a.assignment_type='subject_teacher' and lower(btrim(a.subject))=lower(btrim(p_subject))),
    (select count(*) from school_private.bn_effective_teacher_day(p_school,p_day) w where w.teacher_id=u.id)
  from public.school_users u
  join public.school_timetable_slots s on s.id=p_slot and s.institution_id=u.institution_id
  where u.institution_id=p_school and u.role='teacher' and u.status='active'
    and not school_private.bn_time_off(p_school,u.id,p_day,s.starts_at,s.ends_at)
    and not exists(select 1 from school_private.bn_effective_teacher_day(p_school,p_day) w
      where w.slot_id=p_slot and w.teacher_id=u.id and w.class_id<>p_class)
    and school_private.bn_has_cover_qualification(p_school,u.id,p_class,p_subject)
$$;

create function public.bn_teacher_leave_cover_plan(p_school uuid,p_leave uuid,p_day date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare request public.school_teacher_leave_requests%rowtype;
begin
  if not school_private.has_role(p_school,array['school_admin']) then raise exception 'School admin required' using errcode='42501'; end if;
  select * into request from public.school_teacher_leave_requests l where l.institution_id=p_school
    and l.id=p_leave and l.status='approved' and p_day between l.starts_on and l.ends_on;
  if not found then raise exception 'Choose a date within the approved leave'; end if;
  return coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('cover_needs_review',
    d.teacher_id is null and exists(select 1 from public.school_teacher_covers c
      where c.institution_id=p_school and c.day=p_day and c.slot_id=d.slot_id and c.class_id=d.class_id), 'candidates',(
    select coalesce(jsonb_agg(to_jsonb(c) order by c.subject_match desc,c.periods,c.teacher_name,c.teacher_id),'[]'::jsonb)
    from school_private.bn_cover_candidates(p_school,p_day,d.slot_id,d.class_id,d.subject) c
  )) order by d.starts_at,d.class_id)
  from school_private.bn_effective_teacher_day(p_school,p_day) d
  where d.regular_id=request.teacher_id and (request.starts_at is null or
    (request.starts_at<d.ends_at and request.ends_at>d.starts_at))),'[]'::jsonb);
end $$;

create function public.bn_publish_teacher_covers(p_school uuid,p_leave uuid,p_day date,p_covers jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare request public.school_teacher_leave_requests%rowtype; selected record; period record;
begin
  if not school_private.has_role(p_school,array['school_admin']) then raise exception 'School admin required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('bn-tt-publish:'||p_school::text));
  select * into request from public.school_teacher_leave_requests l where l.institution_id=p_school
    and l.id=p_leave and l.status='approved' and p_day between l.starts_on and l.ends_on;
  if not found then raise exception 'Choose a date within the approved leave'; end if;
  for selected in select * from jsonb_to_recordset(p_covers) as x(slot_id uuid,class_id uuid,teacher_id uuid)
  loop
    select * into period from school_private.bn_effective_teacher_day(p_school,p_day) d
      where d.slot_id=selected.slot_id and d.class_id=selected.class_id and d.regular_id=request.teacher_id
        and (request.starts_at is null or (request.starts_at<d.ends_at and request.ends_at>d.starts_at));
    if not found or (p_day+period.ends_at) at time zone 'Asia/Kolkata' <= now()
    then raise exception 'The period is no longer available. Refresh the plan.'; end if;
    if selected.teacher_id is null then
      delete from public.school_teacher_covers c where c.institution_id=p_school and c.day=p_day
        and c.slot_id=selected.slot_id and c.class_id=selected.class_id and c.original_id=request.teacher_id;
      continue;
    end if;
    if not exists(select 1 from school_private.bn_cover_candidates(p_school,p_day,selected.slot_id,selected.class_id,period.subject) c
        where c.teacher_id=selected.teacher_id)
    then raise exception 'The cover teacher is no longer available. Refresh the plan.'; end if;
    insert into public.school_teacher_covers(institution_id,day,slot_id,class_id,leave_id,original_id,original_subject,substitute_id)
    values(p_school,p_day,selected.slot_id,selected.class_id,p_leave,request.teacher_id,period.subject,selected.teacher_id)
    on conflict(institution_id,day,slot_id,class_id) do update
      set leave_id=excluded.leave_id,original_id=excluded.original_id,original_subject=excluded.original_subject,substitute_id=excluded.substitute_id,published_at=now()
      where school_teacher_covers.substitute_id is distinct from excluded.substitute_id
        or school_teacher_covers.leave_id is distinct from excluded.leave_id
        or school_teacher_covers.original_subject is distinct from excluded.original_subject;
  end loop;
end $$;

create function public.bn_enable_teacher_period_alerts(p_school uuid,p_installation uuid,p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare teacher uuid; new_binding uuid;
begin
  teacher := school_private.bn_teacher_member(p_school);
  if teacher is null then raise exception 'Active teacher required' using errcode='42501'; end if;
  if coalesce(length(p_token),0) not between 20 and 4096 then raise exception 'Invalid device token'; end if;
  perform pg_advisory_xact_lock(hashtext('bn-teacher-alert:'||p_token));
  delete from school_private.bn_teacher_alert_devices where token=p_token and installation<>p_installation;
  insert into school_private.bn_teacher_alert_devices as d(installation,institution_id,teacher_id,auth_user_id,token)
  values(p_installation,p_school,teacher,auth.uid(),p_token)
  on conflict(installation) do update set institution_id=excluded.institution_id,teacher_id=excluded.teacher_id,auth_user_id=excluded.auth_user_id,token=excluded.token,
    binding=case when (d.institution_id,d.teacher_id,d.auth_user_id)=(excluded.institution_id,excluded.teacher_id,excluded.auth_user_id) then d.binding else gen_random_uuid() end
  where d.token=excluded.token or d.teacher_id=excluded.teacher_id
  returning binding into new_binding;
  if new_binding is null then raise exception 'Device registration changed. Enable alerts again.'; end if;
  return new_binding;
end $$;

create function public.bn_disable_teacher_period_alerts(p_school uuid,p_installation uuid)
returns void language sql security definer set search_path='' as $$
 delete from school_private.bn_teacher_alert_devices
 where installation=p_installation and institution_id=p_school and teacher_id=school_private.bn_teacher_member(p_school)
$$;

create function public.bn_claim_teacher_period_alerts(p_at timestamptz)
returns jsonb language sql security definer set search_path='' as $$
 with clock as (
   select (p_at at time zone 'Asia/Kolkata')::date as day
 ), active_devices as (
   select d.* from school_private.bn_teacher_alert_devices d
   join public.school_users u on u.id=d.teacher_id and u.role='teacher' and u.status='active' and u.auth_user_id=d.auth_user_id
     and school_private.bn_teacher_auth_ready(u.auth_user_id)
   join public.institutions i on i.id=d.institution_id and i.status in ('trial','active')
 ), periods as materialized (
   select scopes.institution_id,t.*,
     lead(t.class_name) over teacher_schedule as next_class,
     lead(t.subject) over teacher_schedule as next_subject,
     lead(t.room_number) over teacher_schedule as next_room,
     lead(t.starts_at) over teacher_schedule as next_start
   from (select distinct institution_id from active_devices) scopes cross join clock
   cross join lateral school_private.bn_effective_teacher_day(scopes.institution_id,clock.day) t
   where t.teacher_id is not null
   window teacher_schedule as (partition by scopes.institution_id,t.teacher_id order by t.starts_at,t.class_id)
 ), events as (
   select p.institution_id,p.teacher_id,clock.day||':end:'||p.slot_id as event_id,
     case when p.next_start is null then 'Teaching complete for today' else 'Your next class · '||to_char(clock.day+p.next_start,'HH12:MI AM') end as title,
     case when p.next_start is null then 'Your last scheduled period has ended.' else
       concat_ws(' · ',p.next_class,p.next_subject,case when p.next_room='' then 'Room pending' else 'Room '||p.next_room end) end as body,
     least(((clock.day+p.ends_at) at time zone 'Asia/Kolkata')+interval '3 minutes',
       coalesce(((clock.day+p.next_start) at time zone 'Asia/Kolkata')+interval '90 seconds','infinity')) as expires
   from periods p cross join clock
   where (clock.day+p.ends_at) at time zone 'Asia/Kolkata' between p_at-interval '2 minutes' and p_at
   union all
   select recent.institution_id,p.teacher_id,recent.day||':cover:'||p.slot_id||':'||p.class_id||':'||p.cover_published_at,
     case when (recent.day+p.starts_at) at time zone 'Asia/Kolkata' <= p_at then 'Cover this period now'
       else 'Cover period added · '||to_char(recent.day+p.starts_at,'DD Mon, HH12:MI AM') end,
     concat_ws(' · ',p.class_name,p.subject,case when p.room_number='' then 'Room pending' else 'Room '||p.room_number end),
     least((recent.day+p.ends_at) at time zone 'Asia/Kolkata',p.cover_published_at+interval '5 minutes')
   from (select distinct c.institution_id,c.day from public.school_teacher_covers c cross join clock
     where c.day>=clock.day and c.published_at between p_at-interval '4 minutes' and p_at
       and exists(select 1 from active_devices d where d.institution_id=c.institution_id and d.teacher_id=c.substitute_id)) recent
   cross join lateral school_private.bn_effective_teacher_day(recent.institution_id,recent.day) p
   where p.cover_published_at between p_at-interval '4 minutes' and p_at
     and (recent.day+p.ends_at) at time zone 'Asia/Kolkata' > p_at
   union all
   select l.institution_id,l.teacher_id,l.id||':decision:'||l.status,
     case l.status when 'approved' then 'Leave approved' else 'Leave declined' end,
     to_char(l.starts_on,'DD Mon YYYY') || case when l.starts_on<>l.ends_on then ' to '||to_char(l.ends_on,'DD Mon YYYY')
       when l.starts_at is not null then ' · '||to_char(l.starts_on+l.starts_at,'HH24:MI')||'–'||to_char(l.ends_on+l.ends_at,'HH24:MI')
       else '' end,
     l.decided_at+interval '5 minutes'
   from public.school_teacher_leave_requests l where l.status in ('approved','declined')
     and l.decided_at between p_at-interval '4 minutes' and p_at
 ), eligible as materialized (
   select d.installation,d.token,d.binding,e.event_id,e.title,e.body,e.expires
   from active_devices d join events e using(institution_id,teacher_id)
   where e.expires>p_at
 ), claims as (
   insert into school_private.bn_teacher_alert_deliveries as d(installation,event_id,lease_until)
   select distinct e.installation,e.event_id,p_at+interval '45 seconds' from eligible e
   where not exists(select 1 from school_private.bn_teacher_alert_deliveries sent
     where sent.installation=e.installation and sent.event_id=e.event_id
       and (sent.delivered or sent.lease_until>p_at))
   order by e.installation,e.event_id limit 400
   on conflict(installation,event_id) do update set lease_until=excluded.lease_until
    where not d.delivered and d.lease_until<=p_at
   returning installation,event_id
 ), pruned as (
   delete from school_private.bn_teacher_alert_deliveries where lease_until<p_at-interval '7 days'
 )
 select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from eligible e join claims c using(installation,event_id)
$$;

-- Firebase may rotate its token while the WebView is closed. Only the native
-- installation holding the random, revocable binding can rotate the mapping.
create function public.bn_rotate_teacher_period_alert_token(p_installation uuid,p_binding uuid,p_token text)
returns void language sql security definer set search_path='' as $$
 update school_private.bn_teacher_alert_devices d set token=p_token
 where d.installation=p_installation and d.binding=p_binding and length(p_token) between 20 and 4096
   and school_private.bn_teacher_auth_ready(d.auth_user_id)
   and exists(select 1 from public.school_users u where u.id=d.teacher_id and u.auth_user_id=d.auth_user_id
     and u.role='teacher' and u.status='active')
   and exists(select 1 from public.institutions i where i.id=d.institution_id and i.status in ('active','trial'))
$$;
revoke all on function public.bn_rotate_teacher_period_alert_token(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.bn_rotate_teacher_period_alert_token(uuid,uuid,text) to anon,authenticated;

create function public.bn_finish_teacher_period_alert(p_installation uuid,p_binding uuid,p_token text,p_event text,p_invalid boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_invalid then
   delete from school_private.bn_teacher_alert_devices where installation=p_installation and binding=p_binding and token=p_token;
 else
   update school_private.bn_teacher_alert_deliveries d set delivered=true
    where d.installation=p_installation and d.event_id=p_event and exists (
      select 1 from school_private.bn_teacher_alert_devices device
      where device.installation=d.installation and device.binding=p_binding and device.token=p_token);
 end if;
end $$;

do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='school_private' and p.proname in
   ('bn_publish_period_room','bn_teacher_auth_ready','bn_clear_inactive_teacher_devices','bn_teacher_member','bn_time_off','bn_active_timetable_year','bn_has_cover_qualification','bn_timetable_holiday','bn_effective_teacher_day','bn_cover_candidates'))
    or (n.nspname='public' and p.proname in
   ('bn_list_teacher_leaves','bn_request_teacher_leave','bn_review_teacher_leave','bn_teacher_day',
    'bn_teacher_leave_cover_plan','bn_publish_teacher_covers','bn_enable_teacher_period_alerts','bn_disable_teacher_period_alerts',
    'bn_claim_teacher_period_alerts','bn_finish_teacher_period_alert'))
  loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    if fn.proname in ('bn_claim_teacher_period_alerts','bn_finish_teacher_period_alert') then
      execute format('grant execute on function %s to service_role',fn.signature);
    elsif fn.nspname='public' then
      execute format('grant execute on function %s to authenticated',fn.signature);
    end if;
  end loop;
end $$;
commit;
