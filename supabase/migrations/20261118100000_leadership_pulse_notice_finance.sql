-- Leadership mobile: role-limited daily pulse, fee summary and urgent school notice.
-- Depends on 20261117100000_teacher_leave_notifications.sql.
-- Additive only; no RLS policies on underlying finance/student tables are widened.
begin;

create or replace function public.bn_leadership_school_pulse(p_school uuid,p_day date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  active_students integer; marked_students integer; attended_students integer;
  active_teachers integer; marked_teachers integer; present_teachers integer;
  leave_teachers integer; planned_periods integer; uncovered_periods integer;
begin
  if (select auth.uid()) is null or not school_private.has_role(p_school,array['school_admin','principal'])
  then raise exception 'Verified Owner or Principal required' using errcode='42501'; end if;
  if p_day is null then raise exception 'Choose a school day'; end if;

  select count(*) into active_students from public.school_students s
  where s.institution_id=p_school and lower(s.status)='active';

  select count(distinct a.student_id),
         count(distinct a.student_id) filter(where lower(a.status) in ('present','late','half day','half_day'))
  into marked_students,attended_students
  from public.school_attendance a join public.school_students s
    on s.id=a.student_id and s.institution_id=a.institution_id and lower(s.status)='active'
  where a.institution_id=p_school and a.day=p_day;

  select count(*) into active_teachers from public.school_users u
  where u.institution_id=p_school and u.role='teacher' and u.status='active';

  -- Use only mapped ERP faculty attendance; unlinked/unfinished records remain unknown.
  with teacher_marks as (
    select u.id, (
      select a.item->>'status' from jsonb_array_elements(
        coalesce(w.snapshot#>'{operations,staffAttendance}','[]'::jsonb)
      ) as a(item)
      where a.item->>'date'=p_day::text
        and a.item->>'staffId'=substring(coalesce(sp.notes,'') from '^ERP faculty ref: (.+)$')
      limit 1
    ) as state
    from public.school_users u
    left join public.school_staff_profiles sp
      on sp.school_user_id=u.id and sp.institution_id=u.institution_id
    left join public.school_workspaces w on w.institution_id=u.institution_id
    where u.institution_id=p_school and u.role='teacher' and u.status='active'
  )
  select count(*) filter(where state is not null),
         count(*) filter(where lower(state) in ('present','late','half day','half_day'))
    into marked_teachers,present_teachers from teacher_marks;

  select count(distinct l.teacher_id) into leave_teachers
  from public.school_teacher_leave_requests l
  where l.institution_id=p_school and l.status='approved' and p_day between l.starts_on and l.ends_on;

  select count(*),count(*) filter(where x.teacher_id is null)
  into planned_periods,uncovered_periods
  from school_private.bn_effective_teacher_day(p_school,p_day) x;

  return jsonb_build_object(
    'day',p_day,'students',active_students,'students_marked',marked_students,
    'students_present',attended_students,
    'student_percent',case when active_students>0 and marked_students=active_students
       then round(attended_students::numeric*100/active_students,1) else null end,
    'teachers',active_teachers,'teachers_marked',marked_teachers,
    'teachers_present',case when active_teachers>0 and marked_teachers=active_teachers
      then present_teachers else null end,
    'teachers_on_leave',leave_teachers,
    'scheduled_periods',planned_periods,
    'uncovered_periods',case when planned_periods>0 then uncovered_periods else null end
  );
end $$;

create or replace function public.bn_leadership_fee_snapshot(p_school uuid,p_day date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total numeric(14,2); cash numeric(14,2); online numeric(14,2); entries integer;
begin
  if (select auth.uid()) is null or not school_private.has_role(p_school,array['school_admin','principal'])
  then raise exception 'Verified Owner or Principal required' using errcode='42501'; end if;
  if p_day is null then raise exception 'Choose a school day'; end if;
  with paid as (
    select f.amount_rupees as amount,
      lower(btrim(coalesce(nullif(to_jsonb(f)->>'payment_method',''),
        nullif(to_jsonb(f)->>'payment_mode',''),nullif(to_jsonb(f)->>'mode',''),''))) as method
    from public.school_fee_entries f
    where f.institution_id=p_school and f.occurred_on=p_day and f.kind='payment'
  )
  select coalesce(sum(amount),0),coalesce(sum(amount) filter(where method='cash'),0),
    coalesce(sum(amount) filter(where method in ('upi','online','card','bank','bank transfer','netbanking','neft','imps','rtgs')),0),
    count(*)
    into total,cash,online,entries from paid;
  -- Payments without a recorded method must remain unclassified, not guessed.
  return jsonb_build_object('day',p_day,'total',total,'cash',cash,'online',online,
    'unclassified',total-cash-online,'receipt_count',entries,
    'basis','Posted school_fee_entries payment records; reconciliations and reversals must be reviewed');
end $$;

create or replace function public.bn_leadership_publish_urgent_notice(
  p_school uuid,p_request_id uuid,p_title text,p_body text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; prior public.school_notices%rowtype;
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

  select * into prior from public.school_notices where id=p_request_id;
  if found then
    if prior.institution_id=p_school and prior.created_by=actor
       and prior.title=btrim(p_title) and prior.body=btrim(p_body)
    then return prior.id; end if;
    raise exception 'Notice request key conflict' using errcode='23505';
  end if;

  insert into public.school_notices(id,institution_id,title,body,created_by)
  values(p_request_id,p_school,btrim(p_title),btrim(p_body),actor);
  insert into public.school_audit_events(institution_id,actor_id,action,entity,entity_id)
  values(p_school,actor,'leadership.urgent_notice_publish','notices',p_request_id);
  return p_request_id;
end $$;

revoke all on function public.bn_leadership_school_pulse(uuid,date),
  public.bn_leadership_fee_snapshot(uuid,date),
  public.bn_leadership_publish_urgent_notice(uuid,uuid,text,text)
from public,anon,authenticated;
grant execute on function public.bn_leadership_school_pulse(uuid,date),
  public.bn_leadership_fee_snapshot(uuid,date),
  public.bn_leadership_publish_urgent_notice(uuid,uuid,text,text)
to authenticated;

commit;
