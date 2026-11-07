-- Student/Parent shared portal: read ONLY the teachers assigned to the child's class.
-- No school records are updated; classroom roster, private staff email, salary,
-- phone and unpublished staff profiles are never exposed through this RPC.
-- Deployment requires a separate RLS/role acceptance check on a test tenant.
BEGIN;
CREATE OR REPLACE FUNCTION public.bn_portal_class_teachers(
  p_institution_id uuid, p_student_id uuid
)
RETURNS TABLE(assignment_type text, subject text, teacher_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT a.assignment_type::text,
         CASE WHEN a.assignment_type = 'class_teacher'
              THEN 'Class teacher'::text
              ELSE NULLIF(btrim(a.subject),'')::text END AS subject,
         COALESCE(
           NULLIF(btrim(u.display_name),''),
           NULLIF(btrim(sp.display_name),''),
           'Assigned teacher'
         )::text AS teacher_name
    FROM public.school_students s
    JOIN public.school_classes c
      ON c.id=s.class_id AND c.institution_id=s.institution_id
    JOIN public.school_teacher_assignments a
      ON a.class_id=c.id AND a.institution_id=s.institution_id
    JOIN public.school_users u
      ON u.id=a.school_user_id AND u.institution_id=s.institution_id
    LEFT JOIN public.school_staff_profiles sp
      ON sp.school_user_id=u.id AND sp.institution_id=s.institution_id
   WHERE auth.uid() IS NOT NULL
     AND school_private.parent_of(p_student_id,p_institution_id)
     AND s.id=p_student_id AND s.institution_id=p_institution_id AND s.status='active'
     AND a.active=TRUE AND u.status='active' AND u.role='teacher'
     AND a.assignment_type IN ('class_teacher','subject_teacher')
   ORDER BY CASE WHEN a.assignment_type='class_teacher' THEN 0 ELSE 1 END,
            a.subject, u.display_name;
$function$;
REVOKE ALL ON FUNCTION public.bn_portal_class_teachers(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bn_portal_class_teachers(uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.bn_portal_class_teachers(uuid,uuid) TO authenticated;
COMMIT;
