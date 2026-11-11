-- Applied to this Supabase database as migration 20261111092219.
-- Prevent unnecessary rewrites of multi-megabyte student photo payloads
-- when saving unrelated teacher or school records. All existing data remains.
CREATE OR REPLACE FUNCTION public.school_workspace_push(p_institution_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_projection jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare w public.school_workspaces; actor uuid; e jsonb; kind text; cid uuid; sid uuid; target uuid; prior jsonb;
 amount numeric; previous numeric; delta numeric; rev bigint; key text; mapped uuid;
begin
 if auth.uid() is null or not school_private.has_role(p_institution_id,array['school_admin']) then
  raise exception 'Active school administrator required' using errcode='42501';
 end if;
 if jsonb_typeof(p_snapshot) is distinct from 'object' or jsonb_typeof(p_snapshot->'institution') is distinct from 'object'
 or jsonb_typeof(p_snapshot->'students') is distinct from 'array' or jsonb_typeof(p_snapshot->'operations') is distinct from 'object'
 or jsonb_typeof(p_projection) is distinct from 'object' then raise exception 'Invalid workspace snapshot' using errcode='22023'; end if;
 foreach kind in array array['classes','students','attendance','homework','notices','fees'] loop
  if jsonb_typeof(p_projection->kind) is distinct from 'array' then raise exception 'Missing projection array: %',kind using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_projection->kind) x where nullif(x->>'localId','') is null)
   or exists(select 1 from jsonb_array_elements(p_projection->kind) x group by x->>'localId' having count(*)>1) then
   raise exception 'Invalid or duplicate local ID in %',kind using errcode='22023'; end if;
 end loop;
 insert into public.school_workspaces(institution_id) values(p_institution_id) on conflict do nothing;
 select * into w from public.school_workspaces where institution_id=p_institution_id for update;
 if p_expected_revision is null or w.revision<>p_expected_revision then raise exception 'Workspace revision conflict; pull before saving' using errcode='40001'; end if;

 -- First import cannot silently overwrite a pre-existing school roster or
 -- orphan its attendance, fee, homework and portal records. A NULL snapshot
 -- is NOT proof of an empty school. Reconcile existing cloud data explicitly.
 if w.snapshot is null and (
   exists(select 1 from public.school_classes x where x.institution_id=p_institution_id)
   or exists(select 1 from public.school_students x where x.institution_id=p_institution_id)
   or exists(select 1 from public.school_attendance x where x.institution_id=p_institution_id)
   or exists(select 1 from public.school_fee_entries x where x.institution_id=p_institution_id)
   or exists(select 1 from public.school_homework x where x.institution_id=p_institution_id)
   or exists(select 1 from public.school_notices x where x.institution_id=p_institution_id)
   or exists(select 1 from public.school_workspace_links x where x.institution_id=p_institution_id)
 ) then
   raise exception 'School has existing cloud records but no initialized workspace. Reconcile before importing this device; no records were saved.' using errcode='22023';
 end if;
 -- Removal is not a safe delete: attendance, attachments and financial history may depend on it.
 -- Fail atomically instead of claiming a save and bringing the removed record back on pull.
 if exists(select 1 from public.school_workspace_links l where l.institution_id=p_institution_id and l.entity<>'fees'
  and not exists(select 1 from jsonb_array_elements(p_projection->l.entity) x where x->>'localId'=l.local_id)) then
  raise exception 'Cloud-linked records cannot be removed or hidden by this sync. Archive students; retain classes, attendance, homework and published notices.' using errcode='22023';
 end if;
 select id into strict actor from public.school_users where institution_id=p_institution_id and auth_user_id=auth.uid() and role='school_admin' and status='active';
 if nullif(btrim(p_snapshot#>>'{institution,institution,name}'),'') is null then raise exception 'School name is required' using errcode='22023'; end if;
 update public.institutions set name=p_snapshot#>>'{institution,institution,name}' where id=p_institution_id and name is distinct from p_snapshot#>>'{institution,institution,name}';
 for e in select value from jsonb_array_elements(p_projection->'classes') loop
  target:=school_private.workspace_id(p_institution_id,'classes',e->>'localId');
  if target is null and e->>'localId' like 'cloud:%' then
   select id into target from public.school_classes where institution_id=p_institution_id and 'cloud:'||id::text=e->>'localId';
   if target is null then raise exception 'Unknown or inaccessible cloud class ID' using errcode='22023'; end if;
  end if;
  if target is null then
   select id into target from public.school_classes where institution_id=p_institution_id and name=e->>'name' and section=coalesce(e->>'section','') and academic_year=e->>'academicYear';
  end if;
  target:=coalesce(target,gen_random_uuid());
  insert into public.school_classes(id,institution_id,name,section,academic_year) values(target,p_institution_id,e->>'name',coalesce(e->>'section',''),e->>'academicYear')
  on conflict(id) do update set name=excluded.name,section=excluded.section,academic_year=excluded.academic_year
   where school_classes.institution_id=p_institution_id and (
     school_classes.name is distinct from excluded.name
     or school_classes.section is distinct from excluded.section
     or school_classes.academic_year is distinct from excluded.academic_year
   );
  insert into public.school_workspace_links values(p_institution_id,'classes',e->>'localId',target,e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload where school_workspace_links.payload is distinct from excluded.payload;
 end loop;
 for e in select value from jsonb_array_elements(p_projection->'students') loop
  cid:=school_private.workspace_id(p_institution_id,'classes',e->>'classLocalId');
  if nullif(e->>'classLocalId','') is not null and cid is null then raise exception 'Unknown student class' using errcode='22023'; end if;
  target:=school_private.workspace_id(p_institution_id,'students',e->>'localId');
  if target is null and e->>'localId' like 'cloud:%' then
   select id into target from public.school_students where institution_id=p_institution_id and 'cloud:'||id::text=e->>'localId';
   if target is null then raise exception 'Unknown or inaccessible cloud student ID' using errcode='22023'; end if;
  end if;
  if target is null then select id into target from public.school_students where institution_id=p_institution_id and admission_number=e->>'admissionNumber'; end if;
  target:=coalesce(target,gen_random_uuid());
  insert into public.school_students(id,institution_id,class_id,admission_number,name,dob,status)
   values(target,p_institution_id,cid,e->>'admissionNumber',e->>'name',nullif(e->>'dob','')::date,coalesce(e->>'status','active'))
  on conflict(id) do update set class_id=excluded.class_id,admission_number=excluded.admission_number,name=excluded.name,dob=excluded.dob,status=excluded.status,updated_at=now()
  where school_students.institution_id=p_institution_id and (
    school_students.class_id is distinct from excluded.class_id
    or school_students.admission_number is distinct from excluded.admission_number
    or school_students.name is distinct from excluded.name
    or school_students.dob is distinct from excluded.dob
    or school_students.status is distinct from excluded.status
  );
  insert into public.school_workspace_links values(p_institution_id,'students',e->>'localId',target,e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload where school_workspace_links.payload is distinct from excluded.payload;
  insert into public.school_student_profiles(student_id,institution_id,guardian_name,guardian_phone,address_line,alternate_contact_phone,admission_on,details)
   values(target,p_institution_id,nullif(btrim(e#>>'{profile,guardian_name}'), ''),nullif(btrim(e#>>'{profile,guardian_phone}'), ''),e#>>'{profile,address_line}',e#>>'{profile,details,alternateMobile}',nullif(e#>>'{profile,details,admissionDate}','')::date,
   coalesce(e#>'{profile,details}','{}')||school_private.workspace_profile_aliases(e#>'{profile,details}',true))
  on conflict(student_id) do update set guardian_name=excluded.guardian_name,guardian_phone=excluded.guardian_phone,address_line=excluded.address_line,
   alternate_contact_phone=excluded.alternate_contact_phone,admission_on=excluded.admission_on,
   details=school_student_profiles.details||excluded.details,updated_at=now()
   where school_student_profiles.institution_id=p_institution_id
   and (
     school_student_profiles.guardian_name is distinct from excluded.guardian_name
     or school_student_profiles.guardian_phone is distinct from excluded.guardian_phone
     or school_student_profiles.address_line is distinct from excluded.address_line
     or school_student_profiles.alternate_contact_phone is distinct from excluded.alternate_contact_phone
     or school_student_profiles.admission_on is distinct from excluded.admission_on
     or school_student_profiles.details is distinct from (school_student_profiles.details||excluded.details)
   );
 end loop;
 for e in select value from jsonb_array_elements(p_projection->'attendance') loop
  cid:=school_private.workspace_id(p_institution_id,'classes',e->>'classLocalId'); sid:=school_private.workspace_id(p_institution_id,'students',e->>'studentLocalId');
  if cid is null or sid is null then raise exception 'Unknown attendance student or class' using errcode='22023'; end if;
  target:=school_private.workspace_id(p_institution_id,'attendance',e->>'localId');
  if target is null and e->>'localId' like 'cloud:%' then
   select id into target from public.school_attendance where institution_id=p_institution_id and 'cloud:'||id::text=e->>'localId';
   if target is null then raise exception 'Unknown or inaccessible cloud attendance ID' using errcode='22023'; end if;
  end if;
  if target is null then select id into target from public.school_attendance where institution_id=p_institution_id and student_id=sid and day=(e->>'day')::date; end if;
  target:=coalesce(target,gen_random_uuid());
  insert into public.school_attendance(id,institution_id,class_id,student_id,day,status,recorded_by) values(target,p_institution_id,cid,sid,(e->>'day')::date,lower(e->>'status'),actor)
  on conflict(id) do update set class_id=excluded.class_id,student_id=excluded.student_id,day=excluded.day,status=excluded.status,recorded_by=actor,updated_at=now() where school_attendance.institution_id=p_institution_id;
  insert into public.school_workspace_links values(p_institution_id,'attendance',e->>'localId',target,e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload where school_workspace_links.payload is distinct from excluded.payload;
 end loop;
 foreach kind in array array['homework','notices'] loop
  for e in select value from jsonb_array_elements(p_projection->kind) loop
   target:=school_private.workspace_id(p_institution_id,kind,e->>'localId');
   -- Adopt IDs generated by pull for previously portal-created homework/notices, only within this tenant.
   if target is null and e->>'localId' like 'cloud:%' then
    if kind='homework' then select id into target from public.school_homework where institution_id=p_institution_id and 'cloud:'||id::text=e->>'localId';
    else select id into target from public.school_notices where institution_id=p_institution_id and 'cloud:'||id::text=e->>'localId'; end if;
    if target is null then raise exception 'Unknown or inaccessible cloud % ID',kind using errcode='22023'; end if;
   end if;
   target:=coalesce(target,gen_random_uuid());
   if kind='homework' then
    cid:=school_private.workspace_id(p_institution_id,'classes',e->>'classLocalId');
    if cid is null then raise exception 'Unknown homework class' using errcode='22023'; end if;
    insert into public.school_homework(id,institution_id,class_id,subject,title,instructions,due_on,created_by)
     values(target,p_institution_id,cid,e->>'subject',e->>'title',e->>'instructions',nullif(e->>'dueOn','')::date,actor)
    on conflict(id) do update set class_id=excluded.class_id,subject=excluded.subject,title=excluded.title,instructions=excluded.instructions,due_on=excluded.due_on where school_homework.institution_id=p_institution_id;
   else
    insert into public.school_notices(id,institution_id,title,body,created_by) values(target,p_institution_id,e->>'title',e->>'body',actor)
    on conflict(id) do update set title=excluded.title,body=excluded.body where school_notices.institution_id=p_institution_id;
   end if;
   insert into public.school_workspace_links values(p_institution_id,kind,e->>'localId',target,e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload where school_workspace_links.payload is distinct from excluded.payload;
  end loop;
 end loop;
 -- Each projected financial item has a signed target. Changes append a correction; history stays immutable.
 for e in select value from jsonb_array_elements(p_projection->'fees') union all
  select payload||jsonb_build_object('amountRupees',0) from public.school_workspace_links l
  where l.institution_id=p_institution_id and l.entity='fees' and not exists(select 1 from jsonb_array_elements(p_projection->'fees') x where x->>'localId'=l.local_id)
 loop
  sid:=school_private.workspace_id(p_institution_id,'students',e->>'studentLocalId');
  if sid is null or e->>'kind' not in ('charge','payment') then raise exception 'Invalid fee student or kind' using errcode='22023'; end if;
  amount:=(e->>'amountRupees')::numeric;
  if amount is null or amount<0 or amount>100000000 or amount<>round(amount,2) then raise exception 'Invalid fee amount' using errcode='22023'; end if;
  select payload,cloud_id into prior,target from public.school_workspace_links where institution_id=p_institution_id and entity='fees' and local_id=e->>'localId';
  if prior is not null and prior->>'studentLocalId' is distinct from e->>'studentLocalId' then raise exception 'Cannot reassign financial history' using errcode='22023'; end if;

  previous:=coalesce((prior->>'amountRupees')::numeric,0)*case when prior->>'kind'='payment' then -1 else 1 end;
  delta:=amount*case when e->>'kind'='payment' then -1 else 1 end-previous;
  if delta<>0 then
   if exists(select 1 from public.school_fee_entries f
    where f.institution_id=p_institution_id and f.student_id=sid and coalesce(f.reference,'') not like 'workspace:%') then
    raise exception 'Accountant ledger entries already exist for this student. Use Staff Portal > Fees & Payments to review the balance before changing ERP fees.' using errcode='22023';
   end if;
   insert into public.school_fee_entries(institution_id,student_id,kind,amount_rupees,description,reference,created_by,occurred_on)
   values(p_institution_id,sid,case when delta>0 then 'charge' else 'payment' end,abs(delta),left(coalesce(e->>'description','Workspace adjustment'),250),'workspace:'||gen_random_uuid()::text,actor,coalesce(nullif(e->>'occurredOn','')::date,current_date)) returning id into mapped;
   target:=coalesce(target,mapped);
  end if;
  insert into public.school_workspace_links values(p_institution_id,'fees',e->>'localId',coalesce(target,gen_random_uuid()),e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload where school_workspace_links.payload is distinct from excluded.payload;
 end loop;
 update public.school_workspaces set snapshot=p_snapshot #- '{operations,externalFeeLedger}',revision=revision+1,updated_at=now() where institution_id=p_institution_id;
 return public.school_workspace_pull(p_institution_id);
end $function$

