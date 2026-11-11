-- Applied to Supabase on 2026-11-11 as migration 20261111070007.
-- Existing authorized school reads must not lock the shared workspace row.
-- The school_workspace_push function retains SELECT FOR UPDATE and its
-- atomic revision check, preventing concurrent writers from overwriting data.
-- Replace-only: no school data, grants, or RLS policy changes.
CREATE OR REPLACE FUNCTION public.school_workspace_pull(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare w public.school_workspaces; result jsonb; rows jsonb; ops jsonb; school jsonb;
begin
 if auth.uid() is null or not school_private.has_role(p_institution_id,array['school_admin']) then
  raise exception 'Active school administrator required' using errcode='42501';
 end if;
 select * into w from public.school_workspaces where institution_id=p_institution_id;
 if not found then
  insert into public.school_workspaces(institution_id) values(p_institution_id) on conflict do nothing;
  select * into w from public.school_workspaces where institution_id=p_institution_id;
 end if;
 select jsonb_build_object('id',id,'name',name) into school from public.institutions where id=p_institution_id;
 if w.snapshot is null then return jsonb_build_object('revision',w.revision,'snapshot',null,'school',school); end if;

 result:=w.snapshot; ops:=coalesce(result->'operations','{}');
 result:=jsonb_set(result,'{institution,institution,name}',school->'name');
 -- Include portal-created rows using a deterministic local ID; never replace unrelated local fields.
 select coalesce(jsonb_agg(coalesce(old.value,'{}') || coalesce(p.details,'{}') || school_private.workspace_profile_aliases(p.details) || jsonb_build_object(
  'id',coalesce(m.local_id,'cloud:'||s.id::text),'admissionNumber',s.admission_number,'name',s.name,
  'classId',coalesce(cm.local_id,'cloud:'||c.id::text),'className',coalesce(c.name,''),'section',coalesce(c.section,''),
  'status',initcap(s.status),'dateOfBirth',s.dob) ||
  jsonb_build_object('guardianName',coalesce(p.guardian_name,''),'parentMobile',coalesce(p.guardian_phone,''),'address',coalesce(p.address_line,''),
  'alternateMobile',coalesce(p.alternate_contact_phone,''),'admissionDate',p.admission_on) order by s.created_at,s.id),'[]') into rows
 from public.school_students s
 left join public.school_classes c on c.id=s.class_id and c.institution_id=s.institution_id
 left join public.school_student_profiles p on p.student_id=s.id and p.institution_id=s.institution_id
 left join public.school_workspace_links m on m.institution_id=s.institution_id and m.entity='students' and m.cloud_id=s.id
 left join public.school_workspace_links cm on cm.institution_id=c.institution_id and cm.entity='classes' and cm.cloud_id=c.id
 left join lateral (select value from jsonb_array_elements(coalesce(result->'students','[]')) where value->>'id'=coalesce(m.local_id,'cloud:'||s.id::text) limit 1) old on true
 where s.institution_id=p_institution_id;
 result:=jsonb_set(result,'{students}',rows);
 select coalesce(jsonb_agg(coalesce(old.value,'{}')||jsonb_build_object('id',coalesce(m.local_id,'cloud:'||c.id::text),'name',c.name,'section',c.section,'academicYear',c.academic_year) order by c.name,c.section,c.id),'[]') into rows
 from public.school_classes c
 left join public.school_workspace_links m on m.institution_id=c.institution_id and m.entity='classes' and m.cloud_id=c.id
 left join lateral (select value from jsonb_array_elements(coalesce(ops->'classes','[]')) where value->>'id'=coalesce(m.local_id,'cloud:'||c.id::text) limit 1) old on true
 where c.institution_id=p_institution_id;
 ops:=jsonb_set(ops,'{classes}',rows);
 select coalesce(jsonb_agg(coalesce(old.value,'{}')||jsonb_build_object('id',coalesce(m.local_id,'cloud:'||a.id::text),
  'studentId',coalesce(sm.local_id,'cloud:'||a.student_id::text),'classId',coalesce(cm.local_id,'cloud:'||a.class_id::text),
  'className',c.name,'section',c.section,'date',a.day,'status',initcap(a.status)) order by a.day,a.id),'[]') into rows
 from public.school_attendance a join public.school_classes c on c.id=a.class_id and c.institution_id=a.institution_id
 left join public.school_workspace_links m on m.institution_id=a.institution_id and m.entity='attendance' and m.cloud_id=a.id
 left join public.school_workspace_links sm on sm.institution_id=a.institution_id and sm.entity='students' and sm.cloud_id=a.student_id
 left join public.school_workspace_links cm on cm.institution_id=a.institution_id and cm.entity='classes' and cm.cloud_id=a.class_id
 left join lateral (select value from jsonb_array_elements(coalesce(ops->'attendance','[]')) where value->>'id'=coalesce(m.local_id,'cloud:'||a.id::text) limit 1) old on true
 where a.institution_id=p_institution_id;
 ops:=jsonb_set(ops,'{attendance}',rows);
 select coalesce(jsonb_agg(coalesce(old.value,'{}')||jsonb_build_object('id',coalesce(m.local_id,'cloud:'||h.id::text),
  'classId',coalesce(cm.local_id,'cloud:'||h.class_id::text),'className',c.name,'section',c.section,
  'subject',h.subject,'title',h.title,'description',h.instructions,'dueDate',h.due_on) order by h.created_at,h.id),'[]') into rows
 from public.school_homework h join public.school_classes c on c.id=h.class_id and c.institution_id=h.institution_id
 left join public.school_workspace_links m on m.institution_id=h.institution_id and m.entity='homework' and m.cloud_id=h.id
 left join public.school_workspace_links cm on cm.institution_id=h.institution_id and cm.entity='classes' and cm.cloud_id=h.class_id
 left join lateral (select value from jsonb_array_elements(coalesce(ops->'homework','[]')) where value->>'id'=coalesce(m.local_id,'cloud:'||h.id::text) limit 1) old on true
 where h.institution_id=p_institution_id;
 ops:=jsonb_set(ops,'{homework}',rows);
 select coalesce(jsonb_agg(item order by sort_key),'[]') into rows from (
  select coalesce(old.value,'{}')||jsonb_build_object('id',coalesce(m.local_id,'cloud:'||n.id::text),'audience','All','title',n.title,'content',n.body) item,n.id::text sort_key
  from public.school_notices n
  left join public.school_workspace_links m on m.institution_id=n.institution_id and m.entity='notices' and m.cloud_id=n.id
  left join lateral (select value from jsonb_array_elements(coalesce(ops->'notices','[]')) where value->>'id'=coalesce(m.local_id,'cloud:'||n.id::text) limit 1) old on true
  where n.institution_id=p_institution_id
  union all
  select x,x->>'id' from jsonb_array_elements(coalesce(ops->'notices','[]')) x
  where not exists(select 1 from public.school_workspace_links m where m.institution_id=p_institution_id and m.entity='notices' and m.local_id=x->>'id')
   and not exists(select 1 from public.school_notices n where n.institution_id=p_institution_id and 'cloud:'||n.id::text=x->>'id')
 ) notices;
 ops:=jsonb_set(ops,'{notices}',rows);
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'studentId',coalesce(m.local_id,'cloud:'||f.student_id::text),
  'kind',f.kind,'amountRupees',f.amount_rupees,'reference',f.reference,
  'description',f.description,'date',f.occurred_on
 ) order by f.occurred_on,f.id),'[]'::jsonb) into rows
 from public.school_fee_entries f
 left join public.school_workspace_links m
  on m.institution_id=f.institution_id and m.entity='students' and m.cloud_id=f.student_id
 where f.institution_id=p_institution_id and coalesce(f.reference,'') not like 'workspace:%';
 ops:=jsonb_set(ops,'{externalFeeLedger}',rows);
 return jsonb_build_object('revision',w.revision,'snapshot',jsonb_set(result,'{operations}',ops),'school',school);
end $function$

