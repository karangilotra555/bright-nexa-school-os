-- School OS: seven-role verification fixes. Additive, tenant-scoped, no school data deletion.
-- Public finance RPC discloses only id/name/admission number to verified admin/accountant.
BEGIN;

CREATE OR REPLACE FUNCTION school_private.staff_module_enabled(p_institution_id uuid, p_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT CASE
  WHEN auth.uid() IS NULL THEN FALSE
  -- Parent portal is allowed through its *own row-level* parent policies,
  -- but arbitrary signed-in users are not exempted from restrictive staff guards.
  WHEN NOT EXISTS (
   SELECT 1 FROM public.school_users su
   WHERE su.institution_id=p_institution_id AND su.auth_user_id=auth.uid()
    AND su.status='active'
  ) THEN school_private.parent_in_school(p_institution_id)
  ELSE EXISTS (
   SELECT 1 FROM public.school_users su
   WHERE su.institution_id=p_institution_id AND su.auth_user_id=auth.uid()
    AND su.status='active'
    AND (su.role IN ('school_admin','principal')
      OR (su.role <> 'accountant' AND COALESCE(
        (SELECT rp.enabled FROM public.school_role_module_permissions rp
          WHERE rp.institution_id=p_institution_id AND rp.role=su.role AND rp.module_key=p_module),
        CASE
          WHEN su.role='teacher' THEN p_module IN ('classes','attendance','homework','notices')
          WHEN su.role='receptionist' THEN p_module IN ('classes','notices','profiles')
          WHEN su.role='transport_staff' THEN p_module='notices'
          ELSE FALSE END
      )))
   )
 END
$function$;

CREATE OR REPLACE FUNCTION school_private.finance_student_active(p_institution_id uuid,p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT school_private.has_role(p_institution_id,ARRAY['school_admin','accountant'])
 AND EXISTS (
  SELECT 1 FROM public.school_students s
  WHERE s.id=p_student_id AND s.institution_id=p_institution_id AND s.status='active'
 )
$function$;
REVOKE ALL ON FUNCTION school_private.finance_student_active(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION school_private.finance_student_active(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bn_finance_students(p_institution_id uuid)
RETURNS TABLE(id uuid,name text,admission_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT s.id,s.name,s.admission_number
 FROM public.school_students s
 WHERE s.institution_id=p_institution_id AND s.status='active'
  AND school_private.has_role(p_institution_id,ARRAY['school_admin','accountant'])
 ORDER BY s.name,s.admission_number
$function$;
REVOKE ALL ON FUNCTION public.bn_finance_students(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bn_finance_students(uuid) TO authenticated;

DROP POLICY IF EXISTS fee_entries_insert ON public.school_fee_entries;
CREATE POLICY fee_entries_insert ON public.school_fee_entries
FOR INSERT TO authenticated WITH CHECK (
 school_private.finance_student_active(institution_id,student_id)
 AND EXISTS (
  SELECT 1 FROM public.school_users su
  WHERE su.id=school_fee_entries.created_by
   AND su.institution_id=school_fee_entries.institution_id
   AND su.auth_user_id=(SELECT auth.uid()) AND su.status='active'
 )
);

DROP POLICY IF EXISTS teacher_assignments_read ON public.school_teacher_assignments;
CREATE POLICY teacher_assignments_read ON public.school_teacher_assignments
FOR SELECT TO authenticated USING (
 school_private.has_role(institution_id,ARRAY['school_admin','principal'])
 OR EXISTS (
  SELECT 1 FROM public.school_users u
  WHERE u.id=school_teacher_assignments.school_user_id
    AND u.institution_id=school_teacher_assignments.institution_id
    AND u.auth_user_id=(SELECT auth.uid())
    AND u.status='active' AND u.role='teacher'
 )
);
COMMIT;
