begin;

create function public.bn_teacher_save_exam_marks_batch(
  p_school uuid,p_class uuid,p_exam text,p_subject text,p_marks jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_snapshot jsonb;
  existing_marks jsonb;
  new_marks jsonb;
  updates jsonb;
  results jsonb;
begin
  if not school_private.teacher_can(p_school,p_class,'marks.write',p_subject) then
    raise exception 'Marks entry requires an active class and subject assignment' using errcode='42501';
  end if;
  if jsonb_typeof(p_marks) is distinct from 'array' then
    raise exception 'Marks must be a list' using errcode='22023';
  end if;
  if jsonb_array_length(p_marks) not between 1 and 500 then
    raise exception 'Submit between 1 and 500 marks' using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_marks) item
    where jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'student_id') is distinct from 'string'
      or jsonb_typeof(item->'obtained') is distinct from 'number'
      or coalesce(jsonb_typeof(item->'expected'),'missing') not in ('null','number')
  ) or exists (
    select 1 from jsonb_array_elements(p_marks) item
    group by (item->>'student_id')::uuid having count(*)>1
  ) then
    raise exception 'Invalid or duplicate mark entries' using errcode='22023';
  end if;

  select snapshot into current_snapshot from public.school_workspaces
    where institution_id=p_school for update;
  if current_snapshot is null then
    raise exception 'School workspace is not initialized' using errcode='55000';
  end if;
  existing_marks:=case when jsonb_typeof(current_snapshot#>'{operations,marks}')='array'
    then current_snapshot#>'{operations,marks}' else '[]'::jsonb end;

  with allowed as materialized (
    select distinct on (student_id) student_id,maximum,obtained
    from public.bn_teacher_exam_marks(p_school,p_class)
    where exam_id=p_exam and subject=p_subject
    order by student_id,maximum,obtained
  ), checked as (
    select request.student_id,request.obtained,allowed.maximum,
      coalesce(link.local_id,'cloud:'||request.student_id::text) as student_key,
      case
        when allowed.student_id is null then 'Student or examination is unavailable for this assignment.'
        when request.obtained not between 0 and allowed.maximum then 'Mark is outside the allowed range.'
        when request.obtained is distinct from allowed.obtained and request.expected is distinct from allowed.obtained
          then 'This mark changed. Reload marks before saving again.'
      end as error,
      request.obtained is distinct from allowed.obtained as changed
    from jsonb_to_recordset(p_marks) request(student_id uuid,obtained numeric,expected numeric)
    left join allowed on allowed.student_id=request.student_id
    left join public.school_workspace_links link
      on link.institution_id=p_school and link.entity='students' and link.cloud_id=request.student_id
  )
  select coalesce(jsonb_object_agg(student_key,jsonb_build_object('obtained',obtained,'maximum',maximum))
      filter (where error is null and changed),'{}'::jsonb),
    jsonb_agg(jsonb_build_object('student_id',student_id,'obtained',case when error is null then obtained end,'error',error))
  into updates,results from checked;

  if updates<>'{}'::jsonb then
    with current_rows as materialized (
      select mark,ord,mark->>'studentId' as student_key,
        mark->>'examId'=p_exam and lower(btrim(mark->>'subject'))=lower(btrim(p_subject))
          and updates ? (mark->>'studentId') as replaced
      from jsonb_array_elements(existing_marks) with ordinality vals(mark,ord)
    ), first_marks as (
      select distinct on (student_key) student_key,mark from current_rows
      where replaced order by student_key,ord
    )
    select coalesce((select jsonb_agg(mark order by ord) from current_rows where replaced is not true),'[]'::jsonb)
      || coalesce((select jsonb_agg(coalesce(old.mark,'{}'::jsonb)||jsonb_build_object(
        'id',coalesce(old.mark->>'id',gen_random_uuid()::text),'examId',p_exam,'studentId',entry.key,
        'subject',p_subject,'maximumMarks',entry.value->'maximum','obtainedMarks',entry.value->'obtained',
        'remark',coalesce(old.mark->>'remark','')
      ) order by entry.key)
      from jsonb_each(updates) entry left join first_marks old on old.student_key=entry.key),'[]'::jsonb)
    into new_marks;

    update public.school_workspaces
    set snapshot=jsonb_set(current_snapshot,'{operations,marks}',new_marks),revision=revision+1,updated_at=now()
    where institution_id=p_school;
  end if;
  return results;
end;
$$;

revoke all on function public.bn_teacher_save_exam_marks_batch(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.bn_teacher_save_exam_marks_batch(uuid,uuid,text,text,jsonb) to authenticated;

commit;
