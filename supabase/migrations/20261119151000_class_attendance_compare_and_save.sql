begin;

-- Keep the existing authenticated attendance RLS and composite foreign keys in
-- force. An unavailable row or a concurrent change rolls back the whole batch.
create function public.bn_save_class_attendance(
  p_school uuid,p_class uuid,p_day date,p_recorder uuid,p_marks jsonb
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  mark record;
  saved jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to save class attendance' using errcode='42501';
  end if;
  if p_school is null or p_class is null or p_recorder is null or p_day is null
    or not isfinite(p_day) or p_day>(now() at time zone 'Asia/Kolkata')::date
    or jsonb_typeof(p_marks) is distinct from 'array'
  then raise exception 'Choose a class, attendance date and marks' using errcode='22023'; end if;
  if jsonb_array_length(p_marks) not between 1 and 1000 then
    raise exception 'Submit between 1 and 1000 attendance changes' using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_marks) item
    where jsonb_typeof(item->'student_id') is distinct from 'string'
      or coalesce(item->>'status','') not in ('present','absent','late','excused')
      or coalesce(jsonb_typeof(item->'expected'),'missing') not in ('string','null')
  ) or exists (
    select 1 from jsonb_array_elements(p_marks) item
    group by (item->>'student_id')::uuid having count(*)>1
  ) then raise exception 'Invalid or duplicate attendance changes' using errcode='22023'; end if;

  for mark in select * from jsonb_to_recordset(p_marks) as m(student_id uuid,status text,expected text)
    order by m.student_id
  loop
    if mark.expected is null then
      insert into public.school_attendance (institution_id,class_id,day,student_id,status,recorded_by)
      values (p_school,p_class,p_day,mark.student_id,mark.status,p_recorder)
      on conflict (student_id,day) do nothing;
    else
      update public.school_attendance a set status=mark.status,recorded_by=p_recorder,updated_at=now()
      where a.institution_id=p_school and a.class_id=p_class and a.day=p_day
        and a.student_id=mark.student_id and a.status=mark.expected;
    end if;
    if not found then
      raise sqlstate 'PT409' using message='Attendance changed or is unavailable. Reload the latest roster.';
    end if;
    saved := saved || jsonb_build_object('student_id',mark.student_id,'status',mark.status);
  end loop;
  return saved;
end $$;

revoke all on function public.bn_save_class_attendance(uuid,uuid,date,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bn_save_class_attendance(uuid,uuid,date,uuid,jsonb) to authenticated;

commit;
