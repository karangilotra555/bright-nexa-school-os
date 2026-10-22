-- All school data requires a verified staff or admin login.
-- Supabase publishable API keys are public; anonymous database access isn't.
REVOKE ALL PRIVILEGES ON TABLE
 public.institutions,
 public.school_users,
 public.school_classes,
 public.school_students,
 public.school_audit_events,
 public.school_teacher_assignments,
 public.school_attendance,
 public.school_homework
FROM anon;
