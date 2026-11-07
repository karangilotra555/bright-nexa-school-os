begin;

-- Published copies are independent of later draft edits in the ERP.
create table public.school_published_marksheets (
  institution_id uuid not null,
  student_id uuid not null,
  exam_id text not null check (length(exam_id) between 1 and 200),
  exam_name text not null,
  exam_date text,
  subjects jsonb not null check (jsonb_typeof(subjects)='array' and jsonb_array_length(subjects)>0),
  published_at timestamptz not null default now(),
  published_by uuid not null,
  primary key (institution_id,student_id,exam_id),
  foreign key (student_id,institution_id) references public.school_students(id,institution_id)
);
alter table public.school_published_marksheets enable row level security;
revoke all on public.school_published_marksheets from public,anon,authenticated;

create function public.bn_school_marksheet_drafts(p_school uuid,p_student uuid)
returns table(exam_id text,exam_name text,exam_date text,subjects jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not school_private.has_role(p_school,array['school_admin']) then
    raise exception 'Active school administrator required' using errcode='42501';
  end if;
  return query
  with source as (
    select w.snapshot->'operations' as operations,
      coalesce(l.local_id,'cloud:'||s.id::text) as local_id
    from public.school_students s
    join public.school_workspaces w on w.institution_id=s.institution_id
    left join public.school_workspace_links l on l.institution_id=s.institution_id and l.entity='students' and l.cloud_id=s.id
    where s.institution_id=p_school and s.id=p_student and s.status='active'
  ), marks as (
    select m->>'examId' as exam, m->>'subject' as subject,
      case when jsonb_typeof(m->'obtainedMarks')='number' then (m->>'obtainedMarks')::numeric end as obtained,
      case when jsonb_typeof(m->'maximumMarks')='number' then (m->>'maximumMarks')::numeric end as maximum
    from source s cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.operations->'marks')='array' then s.operations->'marks' else '[]'::jsonb end
    ) m where m->>'studentId'=s.local_id
  )
  select e->>'id', e->>'name', e->>'startDate', r.subjects
  from source s cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.operations->'exams')='array' then s.operations->'exams' else '[]'::jsonb end
  ) e cross join lateral (
    select jsonb_agg(jsonb_build_object('subject',m.subject,'obtained',m.obtained,'maximum',m.maximum) order by m.subject) as subjects
    from marks m where m.exam=e->>'id'
    having count(*)>0
       and count(*)=count(distinct lower(btrim(m.subject)))
       and bool_and(coalesce(length(btrim(m.subject))>0 and m.maximum>0 and m.obtained between 0 and m.maximum,false))
  ) r
  where length(btrim(e->>'name'))>0 and length(e->>'id') between 1 and 200
  order by e->>'startDate' desc nulls last,e->>'name';
end;
$$;

create function public.bn_publish_school_marksheet(p_school uuid,p_student uuid,p_exam text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare d record; published timestamptz;
begin
  if (select auth.uid()) is null or not school_private.has_role(p_school,array['school_admin']) then
    raise exception 'Active school administrator required' using errcode='42501';
  end if;
  perform 1 from public.school_workspaces w where w.institution_id=p_school for share;
  select * into d from public.bn_school_marksheet_drafts(p_school,p_student) r where r.exam_id=p_exam;
  if not found then
    raise exception 'No valid marks for this exam in Supabase. Save the marks in ERP and wait for cloud confirmation first.' using errcode='22023';
  end if;
  insert into public.school_published_marksheets(institution_id,student_id,exam_id,exam_name,exam_date,subjects,published_by)
  values(p_school,p_student,d.exam_id,d.exam_name,d.exam_date,d.subjects,(select auth.uid()))
  on conflict(institution_id,student_id,exam_id) do update set
    exam_name=excluded.exam_name,exam_date=excluded.exam_date,subjects=excluded.subjects,
    published_by=excluded.published_by,published_at=excluded.published_at
  returning published_at into published;
  return published;
end;
$$;

create function public.bn_school_published_marksheets(p_school uuid,p_student uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'examId',m.exam_id,'examName',m.exam_name,'examDate',m.exam_date,
    'publishedAt',m.published_at,'subjects',allowed.subjects
  ) order by m.exam_date desc nulls last,m.exam_name),'[]'::jsonb)
  from public.school_published_marksheets m
  join public.school_students s on s.id=m.student_id and s.institution_id=m.institution_id
  join public.institutions i on i.id=s.institution_id and i.status in ('trial','active')
  cross join lateral (
    select jsonb_agg(subject order by ord) as subjects
    from jsonb_array_elements(m.subjects) with ordinality as data(subject,ord)
    where school_private.has_role(p_school,array['school_admin','principal'])
      or school_private.parent_of(p_student,p_school)
      or (school_private.staff_module_enabled(p_school,'profiles')
        and school_private.teacher_can(p_school,s.class_id,'marks.write',subject->>'subject'))
  ) allowed
  where (select auth.uid()) is not null and m.institution_id=p_school and m.student_id=p_student
    and s.status='active' and allowed.subjects is not null;
$$;

revoke all on function public.bn_school_marksheet_drafts(uuid,uuid),public.bn_publish_school_marksheet(uuid,uuid,text),
  public.bn_school_published_marksheets(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bn_school_marksheet_drafts(uuid,uuid),public.bn_publish_school_marksheet(uuid,uuid,text),
  public.bn_school_published_marksheets(uuid,uuid) to authenticated;
commit;
