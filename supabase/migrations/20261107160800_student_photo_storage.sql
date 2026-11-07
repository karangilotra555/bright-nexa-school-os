-- Private student photo storage. Data stays in the user's Supabase tenant.
-- Files are not public and no existing profile is changed by this migration.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('school-student-photos','school-student-photos',false,5242880,
 ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO NOTHING;

-- Paths use <institution uuid>/<student uuid>/<random uuid>.<jpg|png|webp>
-- Parse only validated, canonical paths. Never cast arbitrary user strings.
CREATE OR REPLACE FUNCTION public.bn_photo_path_ids(p_path text)
RETURNS TABLE(institution_id uuid,student_id uuid)
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE parts text[];
BEGIN
 IF p_path IS NULL OR p_path !~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' THEN RETURN; END IF;
 parts=string_to_array(p_path,'/');
 BEGIN
   institution_id=parts[1]::uuid;
   student_id=parts[2]::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RETURN;
 END;
 RETURN NEXT;
END;$$;

CREATE OR REPLACE FUNCTION public.bn_photo_can_write(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.bn_photo_path_ids(p_path) ids
  JOIN public.school_students s ON s.id=ids.student_id AND s.institution_id=ids.institution_id
  WHERE s.status='active' AND school_private.has_role(ids.institution_id,ARRAY['school_admin'])
 );
$$;
CREATE OR REPLACE FUNCTION public.bn_photo_can_read(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.bn_photo_path_ids(p_path) ids
  JOIN public.school_students s ON s.id=ids.student_id AND s.institution_id=ids.institution_id
  WHERE s.status='active' AND (
    school_private.has_role(ids.institution_id,ARRAY['school_admin'])
    OR school_private.parent_of(ids.student_id,ids.institution_id)
  )
 );
$$;
REVOKE ALL ON FUNCTION public.bn_photo_path_ids(text),public.bn_photo_can_write(text),public.bn_photo_can_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bn_photo_can_write(text),public.bn_photo_can_read(text) TO authenticated;

DROP POLICY IF EXISTS bn_school_photo_read ON storage.objects;
CREATE POLICY bn_school_photo_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='school-student-photos' AND public.bn_photo_can_read(name));
DROP POLICY IF EXISTS bn_school_photo_insert ON storage.objects;
CREATE POLICY bn_school_photo_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='school-student-photos' AND public.bn_photo_can_write(name));
DROP POLICY IF EXISTS bn_school_photo_delete ON storage.objects;
CREATE POLICY bn_school_photo_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='school-student-photos' AND public.bn_photo_can_write(name));

-- Profile metadata is updated only after the file exists in private Storage.
-- This RPC writes ONLY the photo path and leaves all existing profile fields
-- (including APAAR, contacts, and medical information) unchanged.
CREATE OR REPLACE FUNCTION public.bn_student_photo_save(p_student_id uuid,p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid;
BEGIN
 SELECT s.institution_id INTO tenant FROM public.school_students s
 WHERE s.id=p_student_id AND s.status='active';
 IF tenant IS NULL OR NOT school_private.has_role(tenant,ARRAY['school_admin']) THEN
  RAISE EXCEPTION 'School admin is required.' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.bn_photo_path_ids(p_path) ids
  WHERE ids.student_id=p_student_id AND ids.institution_id=tenant
 ) THEN RAISE EXCEPTION 'Student photo path does not belong to this student.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM storage.objects o
  WHERE o.bucket_id='school-student-photos' AND o.name=p_path
 ) THEN RAISE EXCEPTION 'Uploaded student photo not found.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.school_student_profiles(student_id,institution_id,details)
 VALUES(p_student_id,tenant,jsonb_build_object('student_photo_path',p_path))
 ON CONFLICT(student_id) DO UPDATE SET
  details=coalesce(school_student_profiles.details,'{}'::jsonb)||
   jsonb_build_object('student_photo_path',p_path),
  updated_at=now();
 RETURN TRUE;
END;$$;
REVOKE ALL ON FUNCTION public.bn_student_photo_save(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bn_student_photo_save(uuid,text) TO authenticated;
COMMIT;
