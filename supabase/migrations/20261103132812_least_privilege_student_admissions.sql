-- Bright Nexa: least-privilege PostgREST school table grants and case-insensitive admission numbers.
-- RLS still controls each permitted INSERT/UPDATE/SELECT.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
 public.institutions,public.school_users,public.school_classes,public.school_students,
 public.school_audit_events,public.school_teacher_assignments,public.school_attendance,
 public.school_homework,public.school_guardians,public.school_guardian_students,
 public.school_fee_entries,public.school_notices,public.school_parent_leaves
FROM anon,authenticated;

-- Never let a browser delete institutional or academic records permanently.
REVOKE DELETE ON TABLE public.institutions,public.school_users,public.school_classes,
 public.school_students,public.school_attendance,public.school_homework,
 public.school_fee_entries,public.school_notices,public.school_parent_leaves,
 public.school_guardians,public.school_guardian_students
FROM authenticated;

ALTER TABLE public.school_students
 ADD CONSTRAINT school_students_admission_nonblank
 CHECK (char_length(btrim(admission_number)) BETWEEN 1 AND 60 AND char_length(btrim(name)) BETWEEN 1 AND 180);

CREATE UNIQUE INDEX school_students_admission_ci_unique
 ON public.school_students(institution_id,lower(btrim(admission_number)));

CREATE INDEX IF NOT EXISTS school_students_class_tenant_idx
 ON public.school_students(class_id,institution_id);
