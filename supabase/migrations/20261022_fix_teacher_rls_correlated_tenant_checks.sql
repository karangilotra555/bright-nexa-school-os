-- Applied in Supabase project Bright Nexa School OS on 22 Oct 2026.
-- HOTFIX: eliminate ambiguous correlated column references in RLS checks.
-- ATTENTION: this file documents the deployed migration; do not rerun over
-- a database where this same migration has already been applied.
-- Composite foreign keys prevent spoofed cross-school/class references.
ALTER TABLE public.school_students
 ADD CONSTRAINT school_students_id_institution_class_unique
 UNIQUE (id,institution_id,class_id);
ALTER TABLE public.school_attendance
 ADD CONSTRAINT school_attendance_student_tenant_class_fkey
 FOREIGN KEY (student_id,institution_id,class_id)
 REFERENCES public.school_students(id,institution_id,class_id);
ALTER TABLE public.school_attendance
 ADD CONSTRAINT school_attendance_recorder_tenant_fkey
 FOREIGN KEY (recorded_by,institution_id)
 REFERENCES public.school_users(id,institution_id);
ALTER TABLE public.school_homework
 ADD CONSTRAINT school_homework_creator_tenant_fkey
 FOREIGN KEY (created_by,institution_id)
 REFERENCES public.school_users(id,institution_id);

DROP POLICY IF EXISTS school_attendance_insert ON public.school_attendance;
CREATE POLICY school_attendance_insert ON public.school_attendance
FOR INSERT TO authenticated
WITH CHECK (
((recorded_by IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM school_users u
  WHERE ((u.id = school_attendance.recorded_by) AND (u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (u.institution_id = school_attendance.institution_id) AND (u.status = 'active'::text)))) AND (school_private.has_role(institution_id, ARRAY['school_admin'::text, 'principal'::text]) OR school_private.teacher_can(institution_id, class_id, 'attendance.write'::text, ''::text)) AND (EXISTS ( SELECT 1
   FROM school_students s
  WHERE ((s.id = school_attendance.student_id) AND (s.institution_id = school_attendance.institution_id) AND (s.class_id = school_attendance.class_id) AND (s.status = 'active'::text)))))
)
;

DROP POLICY IF EXISTS school_attendance_update ON public.school_attendance;
CREATE POLICY school_attendance_update ON public.school_attendance
FOR UPDATE TO authenticated
USING (
(school_private.has_role(institution_id, ARRAY['school_admin'::text, 'principal'::text]) OR school_private.teacher_can(institution_id, class_id, 'attendance.write'::text, ''::text))
)
WITH CHECK (
((recorded_by IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM school_users u
  WHERE ((u.id = school_attendance.recorded_by) AND (u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (u.institution_id = school_attendance.institution_id) AND (u.status = 'active'::text)))) AND (school_private.has_role(institution_id, ARRAY['school_admin'::text, 'principal'::text]) OR school_private.teacher_can(institution_id, class_id, 'attendance.write'::text, ''::text)) AND (EXISTS ( SELECT 1
   FROM school_students s
  WHERE ((s.id = school_attendance.student_id) AND (s.institution_id = school_attendance.institution_id) AND (s.class_id = school_attendance.class_id) AND (s.status = 'active'::text)))))
)
;

DROP POLICY IF EXISTS school_homework_insert ON public.school_homework;
CREATE POLICY school_homework_insert ON public.school_homework
FOR INSERT TO authenticated
WITH CHECK (
((created_by IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM school_users u
  WHERE ((u.id = school_homework.created_by) AND (u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (u.institution_id = school_homework.institution_id) AND (u.status = 'active'::text)))) AND (school_private.has_role(institution_id, ARRAY['school_admin'::text, 'principal'::text]) OR school_private.teacher_can(institution_id, class_id, 'homework.write'::text, subject)))
)
;

DROP POLICY IF EXISTS school_homework_update ON public.school_homework;
CREATE POLICY school_homework_update ON public.school_homework
FOR UPDATE TO authenticated
USING (
(school_private.has_role(institution_id, ARRAY['school_admin'::text, 'principal'::text]) OR (school_private.teacher_can(institution_id, class_id, 'homework.write'::text, subject) AND (EXISTS ( SELECT 1
   FROM school_users u
  WHERE ((u.id = school_homework.created_by) AND (u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (u.institution_id = school_homework.institution_id) AND (u.status = 'active'::text))))))
)
WITH CHECK (
(school_private.has_role(institution_id, ARRAY['school_admin'::text, 'principal'::text]) OR (school_private.teacher_can(institution_id, class_id, 'homework.write'::text, subject) AND (EXISTS ( SELECT 1
   FROM school_users u
  WHERE ((u.id = school_homework.created_by) AND (u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (u.institution_id = school_homework.institution_id) AND (u.status = 'active'::text))))))
)
;

DROP POLICY IF EXISTS teacher_assignments_insert ON public.school_teacher_assignments;
CREATE POLICY teacher_assignments_insert ON public.school_teacher_assignments
FOR INSERT TO authenticated
WITH CHECK (
(school_private.has_role(institution_id, ARRAY['school_admin'::text]) AND (EXISTS ( SELECT 1
   FROM school_users u
  WHERE ((u.id = school_teacher_assignments.school_user_id) AND (u.institution_id = school_teacher_assignments.institution_id) AND (u.role = 'teacher'::text) AND (u.status = 'active'::text)))))
)
;

DROP POLICY IF EXISTS teacher_assignments_update ON public.school_teacher_assignments;
CREATE POLICY teacher_assignments_update ON public.school_teacher_assignments
FOR UPDATE TO authenticated
USING (
school_private.has_role(institution_id, ARRAY['school_admin'::text])
)
WITH CHECK (
(school_private.has_role(institution_id, ARRAY['school_admin'::text]) AND (EXISTS ( SELECT 1
   FROM school_users u
  WHERE ((u.id = school_teacher_assignments.school_user_id) AND (u.institution_id = school_teacher_assignments.institution_id) AND (u.role = 'teacher'::text) AND (u.status = 'active'::text)))))
)
;

