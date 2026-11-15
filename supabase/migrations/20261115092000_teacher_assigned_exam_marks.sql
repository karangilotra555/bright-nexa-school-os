begin;

-- Match the ERP's class labels, including legacy Roman and ordinal labels.
create function school_private.exam_class_label(p_label text)
returns text language sql immutable set search_path='' as $$
  with cleaned as (
    select regexp_replace(lower(btrim(p_label)), '^(class|grade|batch|std|standard)\s*[-:]?\s*', '') as name
  ), normalized as (
    select regexp_replace(regexp_replace(name, '^(\d+)\s*[-–—].*$', '\1'), '^(\d+)(st|nd|rd|th)$', '\1') as name
    from cleaned
  )
  select coalesce(array_position(array['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii'],name)::text,name)
  from normalized;
$$;
revoke all on function school_private.exam_class_label(text) from public,anon,authenticated;

create function public.bn_teacher_marks_classes(p_school uuid)
returns table(id uuid,name text,section text,academic_year text)
language sql stable security definer set search_path='' as $$
  select distinct c.id,c.name,c.section,c.academic_year
  from public.school_classes c join public.school_teacher_assignments a
    on a.institution_id=c.institution_id and a.class_id=c.id
  join public.school_users u on u.id=a.school_user_id and u.institution_id=a.institution_id
  where u.auth_user_id=(select auth.uid()) and c.institution_id=p_school and a.active and a.can_enter_marks
    and school_private.teacher_can(p_school,c.id,'marks.write',coalesce(a.subject,''))
  order by c.name,c.section,c.academic_year;
$$;

create function public.bn_teacher_exam_marks(p_school uuid,p_class uuid)
returns table(
  exam_id text, exam_name text, student_id uuid, student_name text,
  admission_number text, subject text, maximum numeric, obtained numeric
)
language sql stable security definer set search_path='' as $$
  select exam->>'id',exam->>'name',s.id,s.name,s.admission_number,config->>'name',
    points.maximum,case when jsonb_typeof(saved.mark->'obtainedMarks')='number' then (saved.mark->>'obtainedMarks')::numeric end
  from public.school_classes c
  join public.school_students s on s.institution_id=c.institution_id and s.class_id=c.id and s.status='active'
  join public.school_workspaces w on w.institution_id=c.institution_id
  left join public.school_workspace_links sl on sl.institution_id=s.institution_id and sl.entity='students' and sl.cloud_id=s.id
  left join public.school_workspace_links cl on cl.institution_id=c.institution_id and cl.entity='classes' and cl.cloud_id=c.id
  cross join lateral (select coalesce(sl.local_id,'cloud:'||s.id::text) as id) local_student
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(w.snapshot->'operations'->'exams')='array' then w.snapshot->'operations'->'exams' else '[]'::jsonb end
  ) exam
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(exam->'subjects')='array' then exam->'subjects' else '[]'::jsonb end
  ) config
  cross join lateral (
    select case when jsonb_typeof(config->'maximumMarks')='number' then (config->>'maximumMarks')::numeric end as maximum
  ) points
  left join lateral (
    select mark
    from jsonb_array_elements(case when jsonb_typeof(w.snapshot->'operations'->'marks')='array'
      then w.snapshot->'operations'->'marks' else '[]'::jsonb end) with ordinality as rows(mark,ord)
    where mark->>'examId'=exam->>'id' and mark->>'studentId'=local_student.id
      and lower(btrim(mark->>'subject'))=lower(btrim(config->>'name'))
    order by ord limit 1
  ) saved on true
  where c.institution_id=p_school and c.id=p_class
    and length(btrim(exam->>'name'))>0 and length(exam->>'id') between 1 and 200
    and (nullif(btrim(exam->>'classId'),'') is null or exam->>'classId' in (cl.local_id,c.id::text,'cloud:'||c.id::text))
    and school_private.exam_class_label(exam->>'className')=school_private.exam_class_label(c.name)
    and (lower(btrim(coalesce(exam->>'section',''))) in ('','all')
      or regexp_replace(lower(btrim(exam->>'section')), '^(sec|section)\s*[-:]?\s*','')=lower(btrim(c.section)))
    and (nullif(btrim(exam->>'academicYear'),'') is null or exam->>'academicYear'=c.academic_year)
    and (nullif(btrim(exam->>'academicStream'),'') is null or exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(w.snapshot->'students')='array'
        then w.snapshot->'students' else '[]'::jsonb end) student
      where student->>'id'=local_student.id and student->>'academicStream'=exam->>'academicStream'
    ))
    and points.maximum>0 and length(btrim(config->>'name'))>0
    and school_private.teacher_can(p_school,p_class,'marks.write',config->>'name')
  order by exam->>'startDate' desc nulls last, exam->>'name', exam->>'id', s.name, s.id, config->>'name';
$$;

create function public.bn_teacher_save_exam_mark(
  p_school uuid,p_class uuid,p_exam text,p_student uuid,p_subject text,p_obtained numeric,p_expected numeric
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_snapshot jsonb;
  target record;
  student_key text;
  new_marks jsonb;
  old_mark jsonb;
  new_mark jsonb;
begin
  if not school_private.teacher_can(p_school,p_class,'marks.write',p_subject) then
    raise exception 'Marks entry requires an active class and subject assignment' using errcode='42501';
  end if;
  select snapshot into current_snapshot from public.school_workspaces where institution_id=p_school for update;
  select * into target from public.bn_teacher_exam_marks(p_school,p_class) row
  where row.exam_id=p_exam and row.student_id=p_student and row.subject=p_subject limit 1;
  if not found then
    raise exception 'Student or examination is unavailable for this assignment' using errcode='42501';
  end if;
  if p_obtained is null or not (p_obtained between 0 and target.maximum) then
    raise exception 'Marks must be between 0 and %',target.maximum using errcode='22023';
  end if;
  if target.obtained is not distinct from p_obtained then
    return jsonb_build_object('obtained',target.obtained,'maximum',target.maximum,'changed',false);
  end if;
  if target.obtained is distinct from p_expected then
    raise exception 'This mark changed. Reload marks before saving again.' using errcode='40001';
  end if;

  select coalesce((select l.local_id from public.school_workspace_links l
    where l.institution_id=p_school and l.entity='students' and l.cloud_id=p_student),'cloud:'||p_student::text)
  into student_key;
  select coalesce(jsonb_agg(mark order by ord) filter (where not is_target),'[]'::jsonb),
    (jsonb_agg(mark order by ord) filter (where is_target))->0
  into new_marks,old_mark
  from (
    select mark,ord,coalesce(mark->>'examId'=p_exam and mark->>'studentId'=student_key
      and lower(btrim(mark->>'subject'))=lower(btrim(p_subject)),false) as is_target
    from jsonb_array_elements(case when jsonb_typeof(current_snapshot->'operations'->'marks')='array'
      then current_snapshot->'operations'->'marks' else '[]'::jsonb end) with ordinality rows(mark,ord)
  ) marks;
  new_mark:=coalesce(old_mark,'{}'::jsonb)||jsonb_build_object(
    'id',coalesce(old_mark->>'id',gen_random_uuid()::text),'examId',p_exam,'studentId',student_key,
    'subject',p_subject,'maximumMarks',target.maximum,'obtainedMarks',p_obtained,'remark',coalesce(old_mark->>'remark','')
  );
  update public.school_workspaces set snapshot=jsonb_set(current_snapshot,'{operations,marks}',new_marks||jsonb_build_array(new_mark)),
    revision=revision+1,updated_at=now() where institution_id=p_school;
  return jsonb_build_object('obtained',p_obtained,'maximum',target.maximum,'changed',true);
end;
$$;

revoke all on function public.bn_teacher_marks_classes(uuid), public.bn_teacher_exam_marks(uuid,uuid),
  public.bn_teacher_save_exam_mark(uuid,uuid,text,uuid,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.bn_teacher_marks_classes(uuid), public.bn_teacher_exam_marks(uuid,uuid),
  public.bn_teacher_save_exam_mark(uuid,uuid,text,uuid,text,numeric,numeric) to authenticated;
commit;
