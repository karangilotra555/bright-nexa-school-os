BEGIN;

CREATE POLICY owners_delete_school_homework ON public.school_homework
 FOR DELETE TO authenticated USING (school_private.has_role(institution_id, ARRAY['school_admin']));
CREATE POLICY owner_only_school_homework_delete ON public.school_homework
 AS RESTRICTIVE FOR DELETE TO authenticated USING (school_private.has_role(institution_id, ARRAY['school_admin']));
CREATE POLICY owner_only_teacher_assignment_delete ON public.school_teacher_assignments
 AS RESTRICTIVE FOR DELETE TO authenticated USING (school_private.has_role(institution_id, ARRAY['school_admin']));
CREATE POLICY owners_delete_teacher_assignments ON public.school_teacher_assignments
 FOR DELETE TO authenticated USING (school_private.has_role(institution_id, ARRAY['school_admin']));

-- Storage API removal still requires the existing SELECT policy. Limit its
-- DELETE permission to the owner of the school that owns the attached file.
DROP POLICY IF EXISTS homework_object_delete ON storage.objects;
CREATE POLICY homework_object_delete ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id = 'school-homework' AND EXISTS (
   SELECT 1 FROM public.school_homework_files f
   WHERE f.storage_path = storage.objects.name
     AND school_private.has_role(f.institution_id, ARRAY['school_admin'])
 )
);
CREATE POLICY owner_only_homework_object_delete ON storage.objects
 AS RESTRICTIVE FOR DELETE TO authenticated USING (
 bucket_id <> 'school-homework' OR EXISTS (
   SELECT 1 FROM public.school_homework_files f
   WHERE f.storage_path = storage.objects.name
     AND school_private.has_role(f.institution_id, ARRAY['school_admin'])
 )
);
CREATE POLICY owners_delete_homework_metadata ON public.school_homework_files
 FOR DELETE TO authenticated USING (school_private.has_role(institution_id, ARRAY['school_admin']));

-- Serialise Storage creation with removal of a failed upload's leftover
-- metadata. Existing INSERT permissions remain the authority to upload.
CREATE FUNCTION school_private.bn_lock_homework_file_upload(p_path text)
 RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = ''
 AS $fn$
   SELECT EXISTS (
     SELECT 1 FROM public.school_homework_files f
     JOIN public.school_homework h ON h.id = f.homework_id AND h.institution_id = f.institution_id
     JOIN public.school_users u ON u.id = h.created_by AND u.institution_id = h.institution_id
     WHERE f.storage_path = p_path AND u.auth_user_id = (SELECT auth.uid()) AND u.status = 'active'
       AND (school_private.has_role(h.institution_id, ARRAY['school_admin','principal'])
         OR school_private.teacher_can(h.institution_id, h.class_id, 'homework.write', h.subject))
     FOR KEY SHARE OF f
   )
 $fn$;
REVOKE ALL ON FUNCTION school_private.bn_lock_homework_file_upload(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_private.bn_lock_homework_file_upload(text) TO authenticated;

CREATE POLICY lock_homework_metadata_on_object_insert ON storage.objects
 AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
   bucket_id <> 'school-homework' OR school_private.bn_lock_homework_file_upload(name)
 );

-- BEFORE DELETE runs with the target row locked. A confirmed missing object
-- can still be cleaned up by its original uploader under the existing policy.
-- Owners remove the actual object via the Storage API before deleting its row.
CREATE FUNCTION school_private.bn_guard_homework_attachment_metadata_delete()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
 AS $fn$
 BEGIN
   IF EXISTS (
     SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'school-homework' AND o.name = OLD.storage_path
   ) THEN
     RAISE EXCEPTION 'Remove the published homework attachment from Storage before deleting its file record.'
       USING ERRCODE = '42501';
   END IF;
   RETURN OLD;
 END;
 $fn$;
REVOKE ALL ON FUNCTION school_private.bn_guard_homework_attachment_metadata_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_homework_attachment_metadata_delete
 BEFORE DELETE ON public.school_homework_files
 FOR EACH ROW EXECUTE FUNCTION school_private.bn_guard_homework_attachment_metadata_delete();

COMMIT;
