-- Real test-school teaching staff profiles and attendance. Browser demo has no access.
CREATE TABLE public.school_staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  school_user_id uuid NOT NULL,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 150),
  designation text NOT NULL DEFAULT '',
  employment_type text NOT NULL DEFAULT 'permanent'
    CHECK (employment_type IN ('permanent','contract','part_time','visiting')),
  contract_end_on date,
  days_per_week integer CHECK (days_per_week BETWEEN 1 AND 7),
  hours_per_day numeric(4,1) CHECK (hours_per_day > 0 AND hours_per_day <= 12),
  visits_per_month integer CHECK (visits_per_month BETWEEN 1 AND 31),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_user_id, institution_id),
  FOREIGN KEY (school_user_id,institution_id) REFERENCES public.school_users(id,institution_id) ON DELETE RESTRICT,
  CONSTRAINT staff_profile_employment_details CHECK (
     (employment_type <> 'contract' OR contract_end_on IS NOT NULL)
     AND (employment_type <> 'part_time' OR (days_per_week IS NOT NULL AND hours_per_day IS NOT NULL))
     AND (employment_type <> 'visiting' OR visits_per_month IS NOT NULL)
  )
);
ALTER TABLE public.school_staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_staff_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_staff_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.school_staff_profiles TO authenticated;
CREATE POLICY school_staff_profiles_read ON public.school_staff_profiles
FOR SELECT TO authenticated
USING (school_private.has_role(institution_id, ARRAY['school_admin','principal']));
CREATE POLICY school_staff_profiles_insert ON public.school_staff_profiles
FOR INSERT TO authenticated
WITH CHECK (
 school_private.has_role(institution_id, ARRAY['school_admin','principal'])
 AND EXISTS (SELECT 1 FROM public.school_users u
   WHERE u.id=school_user_id AND u.institution_id=school_staff_profiles.institution_id
     AND u.role IN ('teacher','principal','receptionist','transport_staff','accountant') AND u.status='active')
);
CREATE POLICY school_staff_profiles_update ON public.school_staff_profiles
FOR UPDATE TO authenticated
USING (school_private.has_role(institution_id, ARRAY['school_admin','principal']))
WITH CHECK (
 school_private.has_role(institution_id, ARRAY['school_admin','principal'])
 AND EXISTS (SELECT 1 FROM public.school_users u
   WHERE u.id=school_user_id AND u.institution_id=school_staff_profiles.institution_id
     AND u.role IN ('teacher','principal','receptionist','transport_staff','accountant') AND u.status='active')
);
CREATE INDEX school_staff_profiles_institution_idx ON public.school_staff_profiles(institution_id);

CREATE TABLE public.school_staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  school_user_id uuid NOT NULL,
  day date NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','late','leave')),
  recorded_by uuid NOT NULL,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 250),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_user_id,day),
  FOREIGN KEY (school_user_id,institution_id) REFERENCES public.school_users(id,institution_id) ON DELETE RESTRICT,
  FOREIGN KEY (recorded_by,institution_id) REFERENCES public.school_users(id,institution_id) ON DELETE RESTRICT
);
ALTER TABLE public.school_staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_staff_attendance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_staff_attendance FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.school_staff_attendance TO authenticated;
CREATE POLICY school_staff_attendance_read ON public.school_staff_attendance
FOR SELECT TO authenticated
USING (
 school_private.has_role(institution_id, ARRAY['school_admin','principal'])
 OR EXISTS (SELECT 1 FROM public.school_users own
   WHERE own.id=school_staff_attendance.school_user_id AND own.institution_id=school_staff_attendance.institution_id
     AND own.auth_user_id=(SELECT auth.uid()) AND own.status='active'
     AND EXISTS (SELECT 1 FROM public.institutions inst WHERE inst.id=own.institution_id AND inst.status IN ('trial','active')))
);
CREATE POLICY school_staff_attendance_insert ON public.school_staff_attendance
FOR INSERT TO authenticated
WITH CHECK (
 school_private.has_role(institution_id, ARRAY['school_admin','principal'])
 AND EXISTS (SELECT 1 FROM public.school_users recorder
   WHERE recorder.id=recorded_by AND recorder.institution_id=school_staff_attendance.institution_id
     AND recorder.auth_user_id=(SELECT auth.uid()) AND recorder.status='active')
 AND EXISTS (SELECT 1 FROM public.school_users subject
   WHERE subject.id=school_user_id AND subject.institution_id=school_staff_attendance.institution_id
     AND subject.role IN ('teacher','principal','receptionist','transport_staff','accountant') AND subject.status='active')
);
CREATE POLICY school_staff_attendance_update ON public.school_staff_attendance
FOR UPDATE TO authenticated
USING (school_private.has_role(institution_id, ARRAY['school_admin','principal']))
WITH CHECK (
 school_private.has_role(institution_id, ARRAY['school_admin','principal'])
 AND EXISTS (SELECT 1 FROM public.school_users recorder
   WHERE recorder.id=recorded_by AND recorder.institution_id=school_staff_attendance.institution_id
     AND recorder.auth_user_id=(SELECT auth.uid()) AND recorder.status='active')
 AND EXISTS (SELECT 1 FROM public.school_users subject
   WHERE subject.id=school_user_id AND subject.institution_id=school_staff_attendance.institution_id
     AND subject.role IN ('teacher','principal','receptionist','transport_staff','accountant') AND subject.status='active')
);
CREATE INDEX school_staff_attendance_tenant_day ON public.school_staff_attendance(institution_id,day);
