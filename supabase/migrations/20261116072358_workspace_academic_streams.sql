begin;

alter table public.school_classes
  add column academic_stream text not null default '',
  drop constraint school_classes_institution_id_name_section_academic_year_key;

-- Preserve existing IDs and class assignments. Backfill only from the linked
-- ERP class itself. A missing stream remains unspecified for legacy records.
update public.school_classes c
set academic_stream=existing.stream
from (
  select l.institution_id,l.cloud_id,
    coalesce(nullif(btrim(l.payload->>'academicStream'),''),nullif(btrim(cls->>'academicStream'),'')) as stream
  from public.school_workspace_links l
  join public.school_workspaces w on w.institution_id=l.institution_id
  left join lateral jsonb_array_elements(coalesce(w.snapshot#>'{operations,classes}','[]'::jsonb)) cls
    on cls->>'id'=l.local_id
  where l.entity='classes'
) existing
where c.institution_id=existing.institution_id and c.id=existing.cloud_id and existing.stream is not null;

create unique index school_classes_tenant_year_section_stream_key
  on public.school_classes(institution_id,name,section,academic_year,lower(btrim(academic_stream)));

-- Keep the deployed workspace functions and their grants. Require each
-- expected clause before patching so a divergent definition fails atomically.
do $migration$
declare
  push_sql text:=pg_get_functiondef('public.school_workspace_push(uuid,bigint,jsonb,jsonb)'::regprocedure);
  pull_sql text:=pg_get_functiondef('public.school_workspace_pull(uuid)'::regprocedure);
  marks_sql text:=pg_get_functiondef('public.bn_teacher_exam_marks(uuid,uuid)'::regprocedure);
  anchor text;
  replacement text;
begin
  for anchor,replacement in values
    (
      'rev bigint; key text; mapped uuid;',
      'rev bigint; key text; mapped uuid; class_stream text; student_stream text;'
    ),(
      $old$  target:=school_private.workspace_id(p_institution_id,'classes',e->>'localId');$old$,
      $new$  target:=school_private.workspace_id(p_institution_id,'classes',e->>'localId');
  class_stream:=btrim(e->>'academicStream');
  if class_stream is null then
   select btrim(cls->>'academicStream') into class_stream
   from jsonb_array_elements(coalesce(p_snapshot#>'{operations,classes}','[]'::jsonb)) cls
   where cls->>'id'=e->>'localId' limit 1;
  end if;$new$
    ),(
      $old$  if target is null then
   select id into target from public.school_classes where institution_id=p_institution_id and name=e->>'name' and section=coalesce(e->>'section','') and academic_year=e->>'academicYear';
  end if;
  target:=coalesce(target,gen_random_uuid());
  insert into public.school_classes(id,institution_id,name,section,academic_year) values(target,p_institution_id,e->>'name',coalesce(e->>'section',''),e->>'academicYear')
  on conflict(id) do update set name=excluded.name,section=excluded.section,academic_year=excluded.academic_year$old$,
      $new$  if target is null then
   select id into target from public.school_classes
    where institution_id=p_institution_id and name=e->>'name'
      and section=coalesce(e->>'section','') and academic_year=e->>'academicYear'
      and lower(btrim(academic_stream))=lower(coalesce(class_stream,''));
  elsif class_stream is null then
   select academic_stream into strict class_stream from public.school_classes
    where institution_id=p_institution_id and id=target;
  end if;
  target:=coalesce(target,gen_random_uuid());
  insert into public.school_classes(id,institution_id,name,section,academic_year,academic_stream)
   values(target,p_institution_id,e->>'name',coalesce(e->>'section',''),e->>'academicYear',coalesce(class_stream,''))
  on conflict(id) do update set name=excluded.name,section=excluded.section,
   academic_year=excluded.academic_year,academic_stream=excluded.academic_stream$new$
    ),(
      'or school_classes.academic_year is distinct from excluded.academic_year',
      'or school_classes.academic_year is distinct from excluded.academic_year or school_classes.academic_stream is distinct from excluded.academic_stream'
    ),(
      $old$  if nullif(e->>'classLocalId','') is not null and cid is null then raise exception 'Unknown student class' using errcode='22023'; end if;$old$,
      $new$  if nullif(e->>'classLocalId','') is not null and cid is null then raise exception 'Unknown student class' using errcode='22023'; end if;
  student_stream:=nullif(btrim(e#>>'{profile,details,academicStream}'),'');
  if student_stream is not null and exists(
   select 1 from public.school_classes c where c.institution_id=p_institution_id and c.id=cid
    and c.academic_stream<>'' and lower(btrim(c.academic_stream))<>lower(student_stream)
  ) then
   raise exception 'Student academic stream does not match the selected class' using errcode='22023';
  end if;$new$
    )
  loop
    if strpos(push_sql,anchor)=0 then
      raise exception 'Unexpected workspace push definition. Stream migration cancelled.';
    end if;
    push_sql:=replace(push_sql,anchor,replacement);
  end loop;

  for anchor,replacement in values
    (
      $old$  'status',initcap(s.status),'dateOfBirth',s.dob) ||$old$,
      $new$  'status',initcap(s.status),'dateOfBirth',s.dob) ||
  case when coalesce(c.academic_stream,'')<>'' then jsonb_build_object('academicStream',c.academic_stream) else '{}'::jsonb end ||$new$
    ),(
      $old$'section',c.section,'academicYear',c.academic_year) order by c.name,c.section,c.id$old$,
      $new$'section',c.section,'academicYear',c.academic_year,'academicStream',c.academic_stream) order by c.name,c.section,c.academic_stream,c.id$new$
    )
  loop
    if strpos(pull_sql,anchor)=0 then
      raise exception 'Unexpected workspace pull definition. Stream migration cancelled.';
    end if;
    pull_sql:=replace(pull_sql,anchor,replacement);
  end loop;

  anchor:=$old$    and (nullif(btrim(exam->>'academicStream'),'') is null or exists ($old$;
  replacement:=$new$    and (nullif(btrim(exam->>'academicStream'),'') is null
      or (nullif(btrim(c.academic_stream),'') is not null
        and lower(btrim(c.academic_stream))=lower(btrim(exam->>'academicStream')))
      or (nullif(btrim(c.academic_stream),'') is null and exists ($new$;
  if strpos(marks_sql,anchor)=0 or strpos(marks_sql,$old$    ))
    and points.maximum$old$)=0 then
    raise exception 'Unexpected teacher marks definition. Stream migration cancelled.';
  end if;
  marks_sql:=replace(replace(marks_sql,anchor,replacement),$old$    ))
    and points.maximum$old$,$new$    )))
    and points.maximum$new$);

  execute push_sql;
  execute pull_sql;
  execute marks_sql;
end $migration$;

commit;
