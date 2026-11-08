begin;
alter policy bn_student_photo_upload on storage.objects with check (
 bucket_id='school-student-photos'
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/photo-[a-zA-Z0-9_-]{8,50}\.(jpg|jpeg|png|webp)$'
 and exists (
  select 1 from public.school_students s
  where s.institution_id::text=split_part(objects.name,'/',1)
    and s.id::text=split_part(objects.name,'/',2)
    and s.status='active'
    and school_private.has_role(s.institution_id,array['school_admin'])
 )
);
commit;
