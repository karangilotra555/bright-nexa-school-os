-- Replace the withdrawal RPC in place for databases that already applied the first version.
begin;

create function school_private.bn_teacher_leave_starts_at(p_leave public.school_teacher_leave_requests)
returns timestamp language sql stable set search_path='' as $$
  select p_leave.starts_on + coalesce(p_leave.starts_at, (
    select min(s.starts_at) from public.school_timetable_slots s
    where s.institution_id=p_leave.institution_id and s.kind='period'
      and s.academic_year=coalesce(p_leave.schedule_year,school_private.bn_active_timetable_year(p_leave.institution_id))
      and s.weekday=extract(dow from p_leave.starts_on)
  ), time '00:00')
$$;
revoke all on function school_private.bn_teacher_leave_starts_at(public.school_teacher_leave_requests)
  from public,anon,authenticated;

create or replace function public.bn_list_teacher_leaves(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  viewer uuid := school_private.bn_teacher_member(p_school);
  can_review boolean := coalesce(school_private.has_role(p_school,array['school_admin','principal']),false);
begin
  if auth.uid() is null or (not can_review and viewer is null)
  then raise exception 'Teacher, Owner or Principal required' using errcode='42501'; end if;

  return coalesce((select jsonb_agg(to_jsonb(r) order by r.priority,r.requested_at desc) from (
    select l.id,l.teacher_id,u.display_name as teacher_name,l.starts_on,l.ends_on,l.starts_at,l.ends_at,
           l.kind,l.reason,l.status,l.requested_at,l.decided_at,
           l.status='pending' or (l.status='approved'
             and school_private.bn_teacher_leave_starts_at(l)>statement_timestamp() at time zone 'Asia/Kolkata') as can_cancel,
           case when l.status='pending' and l.kind='emergency' then 0 when l.status='pending' then 1 else 2 end as priority
    from public.school_teacher_leave_requests l
    join public.school_users u on u.id=l.teacher_id and u.institution_id=l.institution_id
    where l.institution_id=p_school and (can_review or l.teacher_id=viewer)
    order by priority,l.requested_at desc limit 100
  ) r),'[]'::jsonb);
end $$;

create or replace function public.bn_review_teacher_leave(p_school uuid,p_leave uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare
  req public.school_teacher_leave_requests%rowtype;
  is_admin boolean := coalesce(school_private.has_role(p_school,array['school_admin','principal']),false);
  viewer uuid := school_private.bn_teacher_member(p_school);
  decision_at timestamptz;
begin
  if p_status is null or p_status not in ('approved','declined','cancelled')
  then raise exception 'Invalid decision'; end if;
  if auth.uid() is null or (not is_admin and (p_status <> 'cancelled' or viewer is null))
  then raise exception 'School leadership or the requesting teacher is required' using errcode='42501'; end if;

  perform pg_advisory_xact_lock(hashtext('bn-tt-publish:'||p_school::text));
  select * into req from public.school_teacher_leave_requests l
    where l.institution_id=p_school and l.id=p_leave for update;
  if not found or (not is_admin and req.teacher_id is distinct from viewer)
  then raise exception 'The request is unavailable to this account' using errcode='42501'; end if;
  decision_at := clock_timestamp();

  if p_status='cancelled' then
    if req.status not in ('pending','approved')
    then raise exception 'The request is unavailable or already reviewed'; end if;
    if req.status='approved' and school_private.bn_teacher_leave_starts_at(req)<=decision_at at time zone 'Asia/Kolkata'
    then raise exception 'Leave has already started and cannot be withdrawn'; end if;

    delete from public.school_teacher_covers c where c.institution_id=p_school and c.leave_id=p_leave;
  elsif req.status<>'pending' then
    raise exception 'The request is unavailable or already reviewed';
  end if;

  update public.school_teacher_leave_requests
  set status=p_status,decided_at=decision_at,decided_by=auth.uid(),
      schedule_year=case when p_status='approved' then school_private.bn_active_timetable_year(p_school) else req.schedule_year end
  where institution_id=p_school and id=p_leave;
end $$;

commit;
