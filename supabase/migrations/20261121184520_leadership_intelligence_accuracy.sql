-- Correct intelligence calculations and add class identifiers without changing RPC signatures.
begin;

create or replace function public.bn_leadership_at_risk_students(
  p_school uuid,
  p_threshold numeric default 75,
  p_class uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  is_leader boolean := coalesce(school_private.has_role(p_school, array['school_admin','principal']), false);
begin
  if (select auth.uid()) is null or not is_leader then
    raise exception 'Verified Owner or Principal required' using errcode='42501';
  end if;

  return coalesce((
    with student_records as (
      select
        s.id as student_id,
        s.name,
        s.admission_number,
        c.id as class_id,
        c.name as class_name,
        c.section,
        c.academic_stream,
        c.name || '-' || c.section ||
          case when btrim(c.academic_stream) <> '' then ' (' || btrim(c.academic_stream) || ')' else '' end as class_label,
        coalesce(sp.guardian_name, '') as guardian_name,
        coalesce(sp.guardian_phone, '') as guardian_phone
      from public.school_students s
      join public.school_classes c on c.id = s.class_id and c.institution_id = s.institution_id
      left join public.school_student_profiles sp on sp.student_id = s.id and sp.institution_id = s.institution_id
      where s.institution_id = p_school
        and lower(s.status) = 'active'
        and (p_class is null or s.class_id = p_class)
    ),
    attendance_history as (
      select a.student_id, a.day, lower(a.status) as status,
        max(a.day) filter (where lower(a.status) is distinct from 'absent')
          over (partition by a.student_id) as last_non_absent
      from public.school_attendance a
      join student_records sr on sr.student_id = a.student_id
      where a.institution_id = p_school
        and a.day <= (now() at time zone 'Asia/Kolkata')::date
    ),
    attendance_stats as (
      select student_id, count(*) as total_days,
        count(*) filter (where status in ('present', 'late', 'half day', 'half_day')) as present_days,
        round(100.0 * count(*) filter (where status in ('present', 'late', 'half day', 'half_day'))
          / count(*), 1) as attendance_percent,
        count(*) filter (where status = 'absent' and (last_non_absent is null or day > last_non_absent)) as consecutive_absent
      from attendance_history
      group by student_id
    )
    select jsonb_agg(
      jsonb_build_object(
        'student_id', sr.student_id,
        'name', sr.name,
        'admission_number', sr.admission_number,
        'class_id', sr.class_id,
        'class_name', sr.class_name,
        'section', sr.section,
        'class_label', sr.class_label,
        'academic_stream', sr.academic_stream,
        'guardian_name', sr.guardian_name,
        'guardian_phone', sr.guardian_phone,
        'total_days', coalesce(ast.total_days, 0),
        'present_days', coalesce(ast.present_days, 0),
        'attendance_percent', coalesce(ast.attendance_percent, 0),
        'consecutive_absent', coalesce(ast.consecutive_absent, 0)
      ) order by coalesce(ast.attendance_percent, 0) asc, coalesce(ast.consecutive_absent, 0) desc
    )
    from student_records sr
    left join attendance_stats ast on ast.student_id = sr.student_id
    where (coalesce(ast.total_days, 0) > 0 and coalesce(ast.attendance_percent, 0) < p_threshold)
       or (coalesce(ast.consecutive_absent, 0) >= 3)
  ), '[]'::jsonb);
end $$;

create or replace function public.bn_leadership_class_attendance_summary(
  p_school uuid,
  p_day date default (now() at time zone 'Asia/Kolkata')::date
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  is_leader boolean := coalesce(school_private.has_role(p_school, array['school_admin','principal']), false);
begin
  if (select auth.uid()) is null or not is_leader then
    raise exception 'Verified Owner or Principal required' using errcode='42501';
  end if;

  return coalesce((
    with classes as (
      select
        c.id as class_id,
        c.name as class_name,
        c.section,
        c.academic_stream,
        c.name || '-' || c.section ||
          case when btrim(c.academic_stream) <> '' then ' (' || btrim(c.academic_stream) || ')' else '' end as class_label,
        count(s.id) as total_students
      from public.school_classes c
      left join public.school_students s on s.class_id = c.id and s.institution_id = c.institution_id and lower(s.status) = 'active'
      where c.institution_id = p_school
      group by c.id, c.name, c.section, c.academic_stream
    ),
    eligible_marks as (
      select a.class_id, a.student_id, a.day, lower(a.status) as status
      from public.school_attendance a
      join public.school_students s on s.id = a.student_id and s.institution_id = a.institution_id
        and s.class_id = a.class_id and lower(s.status) = 'active'
      where a.institution_id = p_school and a.day between p_day - 7 and p_day
    ),
    today_stats as (
      select
        a.class_id,
        count(distinct a.student_id) as marked_today,
        round(
          (count(*) filter (where a.status in ('present','late','half day','half_day'))::numeric * 100) /
          nullif(count(*), 0), 1
        ) as today_percent
      from eligible_marks a
      where a.day = p_day
      group by a.class_id
    ),
    complete_previous_days as (
      select a.class_id, a.day, count(*) as marked,
        count(*) filter (where a.status in ('present','late','half day','half_day')) as present
      from eligible_marks a
      join classes c on c.class_id = a.class_id
      where a.day < p_day
      group by a.class_id, a.day, c.total_students
      having count(distinct a.student_id) = c.total_students
    ),
    week_stats as (
      select class_id, round(sum(present) * 100.0 / nullif(sum(marked), 0), 1) as week_percent
      from complete_previous_days
      group by class_id
    )
    select jsonb_agg(
      jsonb_build_object(
        'class_id', c.class_id,
        'class_name', c.class_name,
        'section', c.section,
        'class_label', c.class_label,
        'academic_stream', c.academic_stream,
        'total_students', c.total_students,
        'marked_today', coalesce(ts.marked_today, 0),
        'today_percent', ts.today_percent,
        'week_percent', ws.week_percent,
        'trend', case
          when ts.marked_today = c.total_students and ws.week_percent is not null and ts.today_percent < ws.week_percent - 5 then 'dropped'
          when ts.marked_today = c.total_students and ws.week_percent is not null and ts.today_percent > ws.week_percent + 5 then 'improved'
          else 'stable' end
      ) order by c.class_name, c.section
    )
    from classes c
    left join today_stats ts on ts.class_id = c.class_id
    left join week_stats ws on ws.class_id = c.class_id
  ), '[]'::jsonb);
end $$;

create or replace function public.bn_leadership_fee_followups(
  p_school uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  is_owner boolean := coalesce(school_private.has_role(p_school, array['school_admin']), false);
begin
  if (select auth.uid()) is null or not is_owner then
    raise exception 'Verified Owner required for student fee follow-ups' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'student_id', s.id,
        'name', s.name,
        'admission_number', s.admission_number,
        'class_id', c.id,
        'class_name', c.name,
        'section', c.section,
        'academic_stream', c.academic_stream,
        'class_label', c.name || '-' || c.section ||
          case when btrim(c.academic_stream) <> '' then ' (' || btrim(c.academic_stream) || ')' else '' end,
        'balance_rupees', b.balance_rupees,
        'guardian_name', coalesce(sp.guardian_name, 'Parent'),
        'guardian_phone', coalesce(sp.guardian_phone, '')
      ) order by b.balance_rupees desc
    )
    from public.school_fee_balances b
    join public.school_students s on s.id = b.student_id and s.institution_id = b.institution_id
    join public.school_classes c on c.id = s.class_id and c.institution_id = s.institution_id
    left join public.school_student_profiles sp on sp.student_id = s.id and sp.institution_id = s.institution_id
    where b.institution_id = p_school
      and b.balance_rupees > 0
      and lower(s.status) = 'active'
  ), '[]'::jsonb);
end $$;

revoke all on function public.bn_leadership_at_risk_students(uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.bn_leadership_class_attendance_summary(uuid, date) from public, anon, authenticated;
revoke all on function public.bn_leadership_fee_followups(uuid) from public, anon, authenticated;

grant execute on function public.bn_leadership_at_risk_students(uuid, numeric, uuid) to authenticated;
grant execute on function public.bn_leadership_class_attendance_summary(uuid, date) to authenticated;
grant execute on function public.bn_leadership_fee_followups(uuid) to authenticated;

commit;
