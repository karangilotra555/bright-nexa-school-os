-- Scoped academic leave authority: Principal may review and publish cover, not manage owner/finance settings.
-- Apply after 20261117100000_teacher_leave_notifications.sql; no data deletion or changes.
-- Rollback: re-apply the original four function definitions from the baseline migration (same signatures).
begin;

create or replace function public.bn_list_teacher_leaves(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid; can_review boolean;
begin
  can_review := school_private.has_role(p_school,array['school_admin','principal']);
  viewer := school_private.bn_teacher_member(p_school);
  if not can_review and viewer is null then raise exception 'Teacher, Owner or Principal required' using errcode='42501'; end if;

  return coalesce((select jsonb_agg(to_jsonb(r) order by r.priority,r.requested_at desc) from (
    select l.id,l.teacher_id,u.display_name as teacher_name,l.starts_on,l.ends_on,l.starts_at,l.ends_at,
           l.kind,l.reason,l.status,l.requested_at,l.decided_at,
           case when l.status='pending' and l.kind='emergency' then 0 when l.status='pending' then 1 else 2 end as priority
    from public.school_teacher_leave_requests l join public.school_users u on u.id=l.teacher_id
    where l.institution_id=p_school and (can_review or l.teacher_id=viewer)
    order by priority,l.requested_at desc limit 100
  ) r),'[]'::jsonb);
end $$;

create or replace function public.bn_review_teacher_leave(p_school uuid,p_leave uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('approved','declined','cancelled') or p_status is null then raise exception 'Invalid decision'; end if;
  if p_status<>'cancelled' and not school_private.has_role(p_school,array['school_admin','principal'])
  then raise exception 'Owner or Principal required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('bn-tt-publish:'||p_school::text));
  update public.school_teacher_leave_requests l
     set status=p_status,decided_at=now(),decided_by=auth.uid(),
         schedule_year=case when p_status='approved' then school_private.bn_active_timetable_year(p_school) end
   where l.institution_id=p_school and l.id=p_leave and l.status='pending'
     and (p_status<>'cancelled' or l.teacher_id=school_private.bn_teacher_member(p_school));
  if not found then raise exception 'The request is unavailable or already reviewed'; end if;
end $$;

create or replace function public.bn_teacher_leave_cover_plan(p_school uuid,p_leave uuid,p_day date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare request public.school_teacher_leave_requests%rowtype;
begin
  if not school_private.has_role(p_school,array['school_admin','principal']) then raise exception 'Owner or Principal required' using errcode='42501'; end if;
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

create or replace function public.bn_publish_teacher_covers(p_school uuid,p_leave uuid,p_day date,p_covers jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare request public.school_teacher_leave_requests%rowtype; selected record; period record;
begin
  if not school_private.has_role(p_school,array['school_admin','principal']) then raise exception 'Owner or Principal required' using errcode='42501'; end if;
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

commit;
