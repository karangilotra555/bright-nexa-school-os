create table public.school_homework_files (
 id uuid primary key default gen_random_uuid(),
 homework_id uuid not null references public.school_homework(id) on delete cascade,
 institution_id uuid not null references public.institutions(id),
 storage_path text not null unique,
 name text not null check(char_length(name) between 1 and 180),
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png','image/webp')),
 size bigint not null check(size between 1 and 10485760),
 created_at timestamptz not null default now(),
 check(storage_path like institution_id::text||'/'||homework_id::text||'/%')
);
create index school_homework_files_homework on public.school_homework_files(homework_id);
alter table public.school_homework_files enable row level security;
grant select,insert,delete on public.school_homework_files to authenticated;
revoke all on public.school_homework_files from anon;
create policy homework_files_read on public.school_homework_files for select to authenticated using (
 exists(select 1 from public.school_homework h where h.id=school_homework_files.homework_id and h.institution_id=school_homework_files.institution_id)
);
create policy homework_files_insert on public.school_homework_files for insert to authenticated with check (
 exists(select 1 from public.school_homework h join public.school_users u on u.id=h.created_by and u.institution_id=h.institution_id
 where h.id=school_homework_files.homework_id and h.institution_id=school_homework_files.institution_id and u.auth_user_id=(select auth.uid()) and u.status='active'
 and (school_private.has_role(h.institution_id,array['school_admin','principal']) or school_private.teacher_can(h.institution_id,h.class_id,'homework.write',h.subject)))
);
create policy homework_files_delete on public.school_homework_files for delete to authenticated using (
 exists(select 1 from public.school_homework h join public.school_users u on u.id=h.created_by and u.institution_id=h.institution_id
 where h.id=school_homework_files.homework_id and h.institution_id=school_homework_files.institution_id and u.auth_user_id=(select auth.uid()) and u.status='active'
 and (school_private.has_role(h.institution_id,array['school_admin','principal']) or school_private.teacher_can(h.institution_id,h.class_id,'homework.write',h.subject)))
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('school-homework','school-homework',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy homework_object_read on storage.objects for select to authenticated using(bucket_id='school-homework' and exists(select 1 from public.school_homework_files f where f.storage_path=storage.objects.name));
create policy homework_object_insert on storage.objects for insert to authenticated with check(bucket_id='school-homework' and exists(
 select 1 from public.school_homework_files f join public.school_homework h on h.id=f.homework_id and h.institution_id=f.institution_id join public.school_users u on u.id=h.created_by and u.institution_id=h.institution_id
 where f.storage_path=storage.objects.name and u.auth_user_id=(select auth.uid()) and u.status='active' and (school_private.has_role(h.institution_id,array['school_admin','principal']) or school_private.teacher_can(h.institution_id,h.class_id,'homework.write',h.subject))));
create policy homework_object_delete on storage.objects for delete to authenticated using(bucket_id='school-homework' and exists(
 select 1 from public.school_homework_files f join public.school_homework h on h.id=f.homework_id and h.institution_id=f.institution_id join public.school_users u on u.id=h.created_by and u.institution_id=h.institution_id
 where f.storage_path=storage.objects.name and u.auth_user_id=(select auth.uid()) and u.status='active' and (school_private.has_role(h.institution_id,array['school_admin','principal']) or school_private.teacher_can(h.institution_id,h.class_id,'homework.write',h.subject))));
