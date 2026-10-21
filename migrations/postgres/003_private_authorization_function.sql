-- Apply after 002. Keep authorization helpers outside exposed public API schema.
BEGIN;
CREATE SCHEMA IF NOT EXISTS school_private;
CREATE OR REPLACE FUNCTION school_private.has_role(target_institution uuid, allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT EXISTS (SELECT 1 FROM public.school_users u
 WHERE u.institution_id = target_institution
 AND u.auth_user_id = (SELECT auth.uid())
 AND u.status = 'active' AND u.role = ANY(allowed_roles));
$$;
REVOKE ALL ON FUNCTION public.school_has_role(uuid,text[]) FROM PUBLIC, anon, authenticated;
DROP POLICY school_institution_read ON public.institutions;
DROP POLICY school_users_admin_read ON public.school_users;
DROP POLICY school_classes_read ON public.school_classes;
DROP POLICY school_classes_insert ON public.school_classes;
DROP POLICY school_classes_update ON public.school_classes;
DROP POLICY school_students_read ON public.school_students;
DROP POLICY school_students_insert ON public.school_students;
DROP POLICY school_students_update ON public.school_students;
DROP FUNCTION public.school_has_role(uuid,text[]);
GRANT USAGE ON SCHEMA school_private TO authenticated;
REVOKE ALL ON FUNCTION school_private.has_role(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_private.has_role(uuid,text[]) TO authenticated;
CREATE POLICY school_institution_read ON public.institutions FOR SELECT TO authenticated
USING (school_private.has_role(id, ARRAY['school_admin','principal','accountant','teacher','receptionist']));
CREATE POLICY school_users_admin_read ON public.school_users FOR SELECT TO authenticated
USING (school_private.has_role(institution_id, ARRAY['school_admin','principal']));
CREATE POLICY school_classes_read ON public.school_classes FOR SELECT TO authenticated
USING (school_private.has_role(institution_id, ARRAY['school_admin','principal','accountant','teacher','receptionist']));
CREATE POLICY school_classes_insert ON public.school_classes FOR INSERT TO authenticated
WITH CHECK (school_private.has_role(institution_id, ARRAY['school_admin','principal']));
CREATE POLICY school_classes_update ON public.school_classes FOR UPDATE TO authenticated
USING (school_private.has_role(institution_id, ARRAY['school_admin','principal']))
WITH CHECK (school_private.has_role(institution_id, ARRAY['school_admin','principal']));
CREATE POLICY school_students_read ON public.school_students FOR SELECT TO authenticated
USING (school_private.has_role(institution_id, ARRAY['school_admin','principal','accountant','teacher','receptionist']));
CREATE POLICY school_students_insert ON public.school_students FOR INSERT TO authenticated
WITH CHECK (school_private.has_role(institution_id, ARRAY['school_admin','principal','receptionist']));
CREATE POLICY school_students_update ON public.school_students FOR UPDATE TO authenticated
USING (school_private.has_role(institution_id, ARRAY['school_admin','principal','receptionist']))
WITH CHECK (school_private.has_role(institution_id, ARRAY['school_admin','principal','receptionist']));
COMMIT;