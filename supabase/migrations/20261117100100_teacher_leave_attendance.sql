begin;

-- Read the existing ERP's authoritative staff marks from its school workspace.
-- Resolve the account through the verified link installed by Teacher App setup.
create function public.bn_teacher_attendance_month(p_school uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid; can_review boolean; first_day date; last_day date; workspace jsonb;
begin
  can_review := school_private.has_role(p_school,array['school_admin']);
  viewer := school_private.bn_teacher_member(p_school);
  if not can_review and viewer is null then raise exception 'Teacher or school admin required' using errcode='42501'; end if;
  first_day := date_trunc('month',p_month)::date;
  last_day := (first_day+interval '1 month - 1 day')::date;
  select w.snapshot->'operations' into workspace from public.school_workspaces w where w.institution_id=p_school;

  return (with teachers as (
    select u.id, case when s.notes like 'ERP faculty ref: %' then substring(s.notes from 18) end as faculty_id
    from public.school_users u
    left join public.school_staff_profiles s on s.institution_id=p_school and s.school_user_id=u.id
    where u.institution_id=p_school and u.role='teacher' and (can_review or u.id=viewer)
  ), approved as (
    select l.teacher_id,(l.starts_on+n)::date as day,l.starts_at,l.ends_at,l.schedule_year
    from public.school_teacher_leave_requests l
    cross join lateral generate_series(greatest(first_day,l.starts_on)-l.starts_on,least(last_day,l.ends_on)-l.starts_on) n
    join teachers t on t.id=l.teacher_id
    where l.institution_id=p_school and l.status='approved' and l.starts_on<=last_day and l.ends_on>=first_day
  ), approved_by_day as (
    select a.teacher_id,a.day,bool_or(a.starts_at is null) as full_day,
      case when bool_or(a.starts_at is null) then 1::numeric
           when min(b.first_bell) is null then null
           else least(1,round(sum(greatest(0,extract(epoch from least(a.ends_at,b.last_bell)-greatest(a.starts_at,b.first_bell))))
             / nullif(max(extract(epoch from b.last_bell-b.first_bell)),0),4)) end as units
    from approved a left join lateral (
      select min(s.starts_at) as first_bell,max(s.ends_at) as last_bell
      from public.school_timetable_slots s where s.institution_id=p_school
        and s.academic_year=coalesce(a.schedule_year,school_private.bn_active_timetable_year(p_school))
        and s.weekday=extract(dow from a.day) and s.kind='period'
    ) b on true
    where extract(dow from a.day)<>0 and not school_private.bn_timetable_holiday(p_school,a.day)
    group by a.teacher_id,a.day
  ), stored as (
    select distinct on (t.id, mark->>'date') t.id as teacher_id,mark->>'date' as day,mark->>'status' as mark
    from jsonb_array_elements(coalesce(workspace->'staffAttendance','[]')) mark
    join teachers t on t.faculty_id=mark->>'staffId'
    where mark->>'staffType'='Teaching' and mark->>'date' between first_day::text and last_day::text
    order by t.id,mark->>'date',mark->>'markedAt' desc nulls last
  ), daily as (
    select t.faculty_id,coalesce(a.day::text,s.day) as date,s.mark as marked_status,
      a.teacher_id is not null as approved_leave,a.full_day,a.units,
      case when a.full_day then 'Approved leave'
           when a.teacher_id is not null then 'Approved partial leave'
           else s.mark end as status
    from approved_by_day a full join stored s on s.teacher_id=a.teacher_id and s.day=a.day::text
    join teachers t on t.id=coalesce(a.teacher_id,s.teacher_id)
  )
  select jsonb_build_object('linked',can_review or exists(select 1 from teachers t where t.faculty_id is not null),
    'rows',coalesce((select jsonb_agg(to_jsonb(d) order by d.date desc) from daily d),'[]'::jsonb)));
end $$;

revoke all on function public.bn_teacher_attendance_month(uuid,date) from public,anon,authenticated;
grant execute on function public.bn_teacher_attendance_month(uuid,date) to authenticated;
commit;
