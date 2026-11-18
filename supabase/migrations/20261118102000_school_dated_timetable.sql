begin;

-- Read the same effective published lessons as Teacher App. Raw cover and
-- leave tables remain inaccessible to browser roles.
create function public.bn_school_dated_timetable(p_school uuid,p_class uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null
     or not school_private.has_role(p_school,array['school_admin','principal'])
     or not exists (select 1 from public.institutions i
                    where i.id=p_school and i.status in ('active','trial'))
  then raise exception 'Verified Owner or Principal school access required' using errcode='42501'; end if;
  if not exists (select 1 from public.school_classes c where c.id=p_class and c.institution_id=p_school)
  then raise exception 'Select a verified class in this school' using errcode='42501'; end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
     or p_to<p_from or p_to-p_from>30
  then raise exception 'Choose a date range of up to 31 days' using errcode='22023'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(lesson) order by lesson.day,lesson.starts_at,lesson.slot_id)
    from (
      select p_from+d.offset_days as day,t.class_id,t.slot_id,t.label,t.subject,t.room_number,t.starts_at,t.ends_at,
             t.regular_id,t.teacher_id,regular.display_name as regular_name,assigned.display_name as teacher_name,
             t.cover_published_at is not null as is_cover
      from generate_series(0,p_to-p_from) as d(offset_days)
      cross join lateral school_private.bn_effective_teacher_day(p_school,p_from+d.offset_days) t
      left join public.school_users regular on regular.id=t.regular_id and regular.institution_id=p_school
      left join public.school_users assigned on assigned.id=t.teacher_id and assigned.institution_id=p_school
      where t.class_id=p_class
    ) lesson
  ),'[]'::jsonb);
end $$;

revoke all on function public.bn_school_dated_timetable(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.bn_school_dated_timetable(uuid,uuid,date,date) to authenticated;

commit;
