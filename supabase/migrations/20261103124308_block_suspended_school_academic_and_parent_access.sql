-- Suspended/closed institutions must not keep academic or parent data access,
-- even when their previously issued Auth JWT remains valid.
CREATE OR REPLACE FUNCTION school_private.has_role(target_institution uuid, allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.school_users u
  JOIN public.institutions i ON i.id=u.institution_id
  WHERE u.institution_id=target_institution AND i.status IN ('trial','active')
    AND u.auth_user_id=(SELECT auth.uid()) AND u.status='active' AND u.role=ANY(allowed_roles)
 );
$$;
CREATE OR REPLACE FUNCTION school_private.teacher_can(p_institution uuid,p_class uuid,p_action text,p_subject text DEFAULT '')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.school_users u
 JOIN public.institutions i ON i.id=u.institution_id
 JOIN public.school_teacher_assignments a ON a.school_user_id=u.id AND a.institution_id=u.institution_id
 WHERE u.auth_user_id=(SELECT auth.uid()) AND i.status IN ('trial','active')
 AND u.role='teacher' AND u.status='active' AND a.active=true
 AND u.institution_id=p_institution AND a.class_id=p_class
 AND (
 (p_action='roster.read' AND a.can_view_roster)
 OR (p_action='attendance.write' AND a.can_take_attendance)
 OR (p_action='attendance.read' AND (a.can_take_attendance OR a.can_view_roster))
 OR (p_action='homework.write' AND a.can_assign_homework AND
   (a.assignment_type='class_teacher' OR lower(btrim(a.subject))=lower(btrim(p_subject))))
 OR (p_action='homework.read' AND a.can_view_roster AND
   (a.assignment_type='class_teacher' OR lower(btrim(a.subject))=lower(btrim(p_subject))))
 OR (p_action='marks.write' AND a.can_enter_marks AND
   (a.assignment_type='class_teacher' OR lower(btrim(a.subject))=lower(btrim(p_subject))))
 ));
$$;
CREATE OR REPLACE FUNCTION school_private.parent_of(p_student uuid,p_institution uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.school_guardians g
 JOIN public.institutions i ON i.id=g.institution_id
 JOIN public.school_guardian_students gs ON gs.guardian_id=g.id AND gs.institution_id=g.institution_id
 JOIN public.school_students s ON s.id=gs.student_id AND s.institution_id=gs.institution_id
 WHERE g.auth_user_id=(SELECT auth.uid()) AND g.status='active'
 AND i.status IN ('trial','active') AND gs.student_id=p_student
 AND g.institution_id=p_institution AND s.status='active'
 );
$$;
CREATE OR REPLACE FUNCTION school_private.parent_in_school(p_institution uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.school_guardians g
 JOIN public.institutions i ON i.id=g.institution_id
 JOIN public.school_guardian_students gs ON gs.guardian_id=g.id AND gs.institution_id=g.institution_id
 JOIN public.school_students s ON s.id=gs.student_id AND s.institution_id=gs.institution_id
 WHERE g.institution_id=p_institution AND g.auth_user_id=(SELECT auth.uid())
 AND i.status IN ('trial','active') AND g.status='active' AND s.status='active'
 );
$$;
CREATE OR REPLACE FUNCTION school_private.parent_has_class(p_institution uuid,p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.school_guardians g
 JOIN public.institutions i ON i.id=g.institution_id
 JOIN public.school_guardian_students gs ON gs.guardian_id=g.id AND gs.institution_id=g.institution_id
 JOIN public.school_students s ON s.id=gs.student_id AND s.institution_id=gs.institution_id
 WHERE g.institution_id=p_institution AND g.auth_user_id=(SELECT auth.uid())
 AND i.status IN ('trial','active') AND g.status='active' AND s.status='active' AND s.class_id=p_class
 );
$$;
