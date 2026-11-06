-- Main app workspace, opt-in only. No school data is imported by this migration.
begin;
create table public.school_workspaces (
 institution_id uuid primary key references public.institutions(id),
 revision bigint not null default 0 check (revision >= 0),
 snapshot jsonb,
 updated_at timestamptz not null default now(),
 check (snapshot is null or jsonb_typeof(snapshot) = 'object')
);
create table public.school_workspace_links (
 institution_id uuid not null references public.institutions(id),
 entity text not null check (entity in ('classes','students','attendance','homework','notices','fees')),
 local_id text not null check (length(local_id) between 1 and 200),
 cloud_id uuid not null,
 payload jsonb not null default '{}',
 primary key (institution_id,entity,local_id),
 unique (institution_id,entity,cloud_id)
);
alter table public.school_workspaces enable row level security;
alter table public.school_workspace_links enable row level security;
create policy workspace_admin on public.school_workspaces for all to authenticated
 using (school_private.has_role(institution_id,array['school_admin']))
 with check (school_private.has_role(institution_id,array['school_admin']));
create policy workspace_links_admin on public.school_workspace_links for all to authenticated
 using (school_private.has_role(institution_id,array['school_admin']))
 with check (school_private.has_role(institution_id,array['school_admin']));
revoke all on public.school_workspaces,public.school_workspace_links from anon,authenticated;
grant select,insert,update on public.school_workspaces,public.school_workspace_links to authenticated;

-- Transfers retain their historical attendance class while both FKs enforce tenant ownership.
alter table public.school_attendance drop constraint school_attendance_student_tenant_class_fkey;
alter table public.school_attendance add constraint school_attendance_student_tenant_fkey
 foreign key (student_id,institution_id) references public.school_students(id,institution_id);
create policy workspace_admin_attendance_insert on public.school_attendance for insert to authenticated
 with check (school_private.has_role(institution_id,array['school_admin']) and exists
 (select 1 from public.school_users u where u.id=recorded_by and u.institution_id=school_attendance.institution_id and u.auth_user_id=auth.uid() and u.status='active'));
create policy workspace_admin_attendance_update on public.school_attendance for update to authenticated
 using (school_private.has_role(institution_id,array['school_admin']))
 with check (school_private.has_role(institution_id,array['school_admin']) and exists
 (select 1 from public.school_users u where u.id=recorded_by and u.institution_id=school_attendance.institution_id and u.auth_user_id=auth.uid() and u.status='active'));
create policy workspace_admin_notices_update on public.school_notices for update to authenticated
 using (school_private.has_role(institution_id,array['school_admin']))
 with check (school_private.has_role(institution_id,array['school_admin']));
grant update on public.school_notices to authenticated;
grant update(name) on public.institutions to authenticated;
create policy workspace_admin_school_name_update on public.institutions for update to authenticated
 using (school_private.has_role(id,array['school_admin']))
 with check (school_private.has_role(id,array['school_admin']) and length(btrim(name)) between 3 and 120);

-- Decimal rupees, retaining the invoker view and all original ledger records.
drop view public.school_fee_balances;
alter table public.school_fee_entries alter column amount_rupees type numeric(14,2);
alter table public.school_fee_entries drop constraint school_fee_entries_amount_rupees_check;
alter table public.school_fee_entries add constraint school_fee_entries_amount_rupees_check check (amount_rupees > 0 and amount_rupees <= 100000000);
create view public.school_fee_balances with (security_invoker=true) as
 select institution_id,student_id,coalesce(sum(case when kind='charge' then amount_rupees else -amount_rupees end),0::numeric) balance_rupees,count(*) entry_count
 from public.school_fee_entries group by institution_id,student_id;
revoke all on public.school_fee_balances from anon;
grant select on public.school_fee_balances to authenticated;
-- Historical corrections must also work for transferred/archived students, retaining actor/tenant checks.
create policy workspace_admin_fee_insert on public.school_fee_entries for insert to authenticated
 with check (school_private.has_role(institution_id,array['school_admin']) and exists
 (select 1 from public.school_users u where u.id=created_by and u.institution_id=school_fee_entries.institution_id and u.auth_user_id=auth.uid() and u.status='active'));

-- Private trigger needs definer rights solely to bump a workspace the teacher cannot read.
-- It exposes neither the snapshot nor a callable mutation API.
create function school_private.workspace_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
 if TG_TABLE_NAME='institutions' then
  if TG_OP='DELETE' then tenant:=OLD.id; else tenant:=NEW.id; end if;
 else
  if TG_OP='DELETE' then tenant:=OLD.institution_id; else tenant:=NEW.institution_id; end if;
 end if;
 update public.school_workspaces set revision=revision+1,updated_at=now()
 where institution_id=tenant;
 if TG_TABLE_NAME<>'institutions' and TG_OP='UPDATE' then
  if OLD.institution_id is distinct from NEW.institution_id then
   update public.school_workspaces set revision=revision+1,updated_at=now() where institution_id=OLD.institution_id;
  end if;
 end if;
 return null;
end $$;
revoke all on function school_private.workspace_invalidate() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['institutions','school_classes','school_students','school_student_profiles','school_attendance','school_homework','school_notices','school_fee_entries'] loop
  execute format('create trigger workspace_invalidate after insert or update or delete on public.%I for each row execute function school_private.workspace_invalidate()',t);
 end loop;
end $$;

create function school_private.workspace_id(p_school uuid,p_entity text,p_local text) returns uuid
 language sql stable security invoker set search_path='' as $$
 select cloud_id from public.school_workspace_links where institution_id=p_school and entity=p_entity and local_id=p_local
$$;
revoke all on function school_private.workspace_id(uuid,text,text) from public,anon;
grant execute on function school_private.workspace_id(uuid,text,text) to authenticated;

-- Supported profile aliases are explicit so arbitrary detail keys cannot replace canonical identity.
create function school_private.workspace_profile_aliases(d jsonb, to_portal boolean default false) returns jsonb
 language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(case when to_portal then snake else camel end,
 d->case when to_portal then camel else snake end),'{}')
 from (values ('roll_number','rollNumber'),('father_name','fatherName'),('mother_name','motherName'),
 ('first_name','firstName'),('middle_name','middleName'),('last_name','lastName'),
 ('father_occupation','fatherOccupation'),('mother_occupation','motherOccupation'),
 ('blood_group','bloodGroup'),('aadhaar_number','aadhaarNumber'),('pen_number','penNumber'),
 ('apaar_id','apaarId'),('udise_number','udiseNumber'),('student_email','studentEmail'),
 ('house_name','houseName'),('previous_school','previousSchool'),('bus_route','busRoute'),('bus_stop','busStop'),
 ('medical_conditions','medicalConditions'),('emergency_contact_name','emergencyContactName'),
 ('emergency_contact_phone','emergencyContactPhone'),('permanent_address','permanentAddress'),
 ('permanent_city','permanentCity'),('permanent_state','permanentState'),('permanent_postal_code','permanentPostalCode')) m(snake,camel)
 where d ? case when to_portal then camel else snake end
$$;
revoke all on function school_private.workspace_profile_aliases(jsonb,boolean) from public,anon;
grant execute on function school_private.workspace_profile_aliases(jsonb,boolean) to authenticated;

create function public.school_workspace_pull(p_institution_id uuid) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare w public.school_workspaces; result jsonb; rows jsonb; ops jsonb; school jsonb;
begin
 if auth.uid() is null or not school_private.has_role(p_institution_id,array['school_admin']) then
  raise exception 'Active school administrator required' using errcode='42501';
 end if;
 insert into public.school_workspaces(institution_id) values(p_institution_id) on conflict do nothing;
 select * into w from public.school_workspaces where institution_id=p_institution_id for update;
 select jsonb_build_object('id',id,'name',name) into school from public.institutions where id=p_institution_id;
 if w.snapshot is null then return jsonb_build_object('revision',w.revision,'snapshot',null,'school',school); end if;
 if exists(select 1 from public.school_fee_entries f where f.institution_id=p_institution_id and coalesce(f.reference,'') not like 'workspace:%') then
  raise exception 'Fee reconciliation required: external ledger entries cannot be represented as local receipts automatically' using errcode='22023';
 end if;
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
 return jsonb_build_object('revision',w.revision,'snapshot',jsonb_set(result,'{operations}',ops),'school',school);
end $$;

create function public.school_workspace_push(p_institution_id uuid,p_expected_revision bigint,p_snapshot jsonb,p_projection jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
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
  on conflict(id) do update set name=excluded.name,section=excluded.section,academic_year=excluded.academic_year where school_classes.institution_id=p_institution_id;
  insert into public.school_workspace_links values(p_institution_id,'classes',e->>'localId',target,e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload;
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
  on conflict(id) do update set class_id=excluded.class_id,admission_number=excluded.admission_number,name=excluded.name,dob=excluded.dob,status=excluded.status,updated_at=now() where school_students.institution_id=p_institution_id;
  insert into public.school_workspace_links values(p_institution_id,'students',e->>'localId',target,e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload;
  insert into public.school_student_profiles(student_id,institution_id,guardian_name,guardian_phone,address_line,alternate_contact_phone,admission_on,details)
   values(target,p_institution_id,e#>>'{profile,guardian_name}',e#>>'{profile,guardian_phone}',e#>>'{profile,address_line}',e#>>'{profile,details,alternateMobile}',nullif(e#>>'{profile,details,admissionDate}','')::date,
   coalesce(e#>'{profile,details}','{}')||school_private.workspace_profile_aliases(e#>'{profile,details}',true))
  on conflict(student_id) do update set guardian_name=excluded.guardian_name,guardian_phone=excluded.guardian_phone,address_line=excluded.address_line,
   alternate_contact_phone=excluded.alternate_contact_phone,admission_on=excluded.admission_on,
   details=school_student_profiles.details||excluded.details,updated_at=now() where school_student_profiles.institution_id=p_institution_id;
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
  insert into public.school_workspace_links values(p_institution_id,'attendance',e->>'localId',target,e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload;
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
   insert into public.school_workspace_links values(p_institution_id,kind,e->>'localId',target,e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload;
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
  if exists(select 1 from public.school_fee_entries f where f.institution_id=p_institution_id and f.student_id=sid and coalesce(f.reference,'') not like 'workspace:%') then
   raise exception 'Existing fee ledger requires reconciliation before importing this student' using errcode='22023';
  end if;
  previous:=coalesce((prior->>'amountRupees')::numeric,0)*case when prior->>'kind'='payment' then -1 else 1 end;
  delta:=amount*case when e->>'kind'='payment' then -1 else 1 end-previous;
  if delta<>0 then
   insert into public.school_fee_entries(institution_id,student_id,kind,amount_rupees,description,reference,created_by,occurred_on)
   values(p_institution_id,sid,case when delta>0 then 'charge' else 'payment' end,abs(delta),left(coalesce(e->>'description','Workspace adjustment'),250),'workspace:'||gen_random_uuid()::text,actor,coalesce(nullif(e->>'occurredOn','')::date,current_date)) returning id into mapped;
   target:=coalesce(target,mapped);
  end if;
  insert into public.school_workspace_links values(p_institution_id,'fees',e->>'localId',coalesce(target,gen_random_uuid()),e) on conflict(institution_id,entity,local_id) do update set payload=excluded.payload;
 end loop;
 update public.school_workspaces set snapshot=p_snapshot,revision=revision+1,updated_at=now() where institution_id=p_institution_id;
 return public.school_workspace_pull(p_institution_id);
end $$;
revoke all on function public.school_workspace_pull(uuid),public.school_workspace_push(uuid,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.school_workspace_pull(uuid),public.school_workspace_push(uuid,bigint,jsonb,jsonb) to authenticated;
commit;
