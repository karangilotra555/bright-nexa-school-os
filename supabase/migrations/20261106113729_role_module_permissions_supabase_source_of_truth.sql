-- Supabase is authoritative for per-school role/module permissions.
CREATE TABLE IF NOT EXISTS public.school_role_module_permissions (
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('teacher','accountant','receptionist','transport_staff')),
  module_key text NOT NULL CHECK (module_key IN ('classes','attendance','homework','notices','profiles')),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id,role,module_key)
);
ALTER TABLE public.school_role_module_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_role_module_permissions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.school_role_module_permissions TO authenticated;
CREATE POLICY role_module_permissions_read ON public.school_role_module_permissions
  FOR SELECT TO authenticated
  USING (school_private.has_role(institution_id, ARRAY['school_admin','principal','teacher','accountant','receptionist','transport_staff']));
CREATE POLICY role_module_permissions_insert ON public.school_role_module_permissions
  FOR INSERT TO authenticated
  WITH CHECK (school_private.has_role(institution_id, ARRAY['school_admin']));
CREATE POLICY role_module_permissions_update ON public.school_role_module_permissions
  FOR UPDATE TO authenticated
  USING (school_private.has_role(institution_id, ARRAY['school_admin']))
  WITH CHECK (school_private.has_role(institution_id, ARRAY['school_admin']));

INSERT INTO public.school_role_module_permissions(institution_id,role,module_key,enabled)
SELECT i.id, d.role, d.module_key, d.enabled
FROM public.institutions i CROSS JOIN (
 VALUES
 ('teacher','classes',true),('teacher','attendance',true),('teacher','homework',true),('teacher','notices',true),('teacher','profiles',false),
 ('accountant','classes',true),('accountant','attendance',false),('accountant','homework',false),('accountant','notices',true),('accountant','profiles',true),
 ('receptionist','classes',true),('receptionist','attendance',false),('receptionist','homework',false),('receptionist','notices',true),('receptionist','profiles',true),
 ('transport_staff','classes',false),('transport_staff','attendance',false),('transport_staff','homework',false),('transport_staff','notices',true),('transport_staff','profiles',false)
) AS d(role,module_key,enabled)
ON CONFLICT (institution_id,role,module_key) DO NOTHING;

-- A narrow, private, definer helper avoids recursive RLS while evaluating a
-- staff member's own role. Unknown/nonstaff users gain no rights from this
-- helper; original RLS, including parent/guardian policies, remains authoritative.
CREATE OR REPLACE FUNCTION school_private.staff_module_enabled(p_institution_id uuid,p_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT CASE WHEN auth.uid() IS NULL THEN FALSE
    WHEN NOT EXISTS (SELECT 1 FROM public.school_users su
      WHERE su.institution_id=p_institution_id AND su.auth_user_id=auth.uid() AND su.status='active')
    THEN TRUE
    ELSE EXISTS (
      SELECT 1 FROM public.school_users su
      WHERE su.institution_id=p_institution_id AND su.auth_user_id=auth.uid() AND su.status='active'
        AND (su.role IN ('school_admin','principal')
          OR COALESCE(
            (SELECT rp.enabled FROM public.school_role_module_permissions rp
              WHERE rp.institution_id=p_institution_id AND rp.role=su.role AND rp.module_key=p_module),
            CASE
              WHEN su.role='teacher' THEN p_module IN ('classes','attendance','homework','notices')
              WHEN su.role IN ('accountant','receptionist') THEN p_module IN ('classes','notices','profiles')
              WHEN su.role='transport_staff' THEN p_module='notices'
              ELSE FALSE END
          )))
  END
$fn$;
REVOKE ALL ON FUNCTION school_private.staff_module_enabled(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_private.staff_module_enabled(uuid,text) TO authenticated;

-- Restrictive policies are ANDed with existing tenant, class and guardian RLS.
-- Teachers still require individually assigned classes and write rights.
CREATE POLICY role_guard_classes_read ON public.school_classes AS RESTRICTIVE FOR SELECT TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'classes') OR school_private.staff_module_enabled(institution_id,'attendance') OR school_private.staff_module_enabled(institution_id,'homework') OR school_private.staff_module_enabled(institution_id,'profiles'));
CREATE POLICY role_guard_students_read ON public.school_students AS RESTRICTIVE FOR SELECT TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'classes') OR school_private.staff_module_enabled(institution_id,'attendance') OR school_private.staff_module_enabled(institution_id,'profiles'));
CREATE POLICY role_guard_students_insert ON public.school_students AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (school_private.staff_module_enabled(institution_id,'profiles'));
CREATE POLICY role_guard_students_update ON public.school_students AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'profiles'))
 WITH CHECK (school_private.staff_module_enabled(institution_id,'profiles'));

CREATE POLICY role_guard_attendance_read ON public.school_attendance AS RESTRICTIVE FOR SELECT TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'attendance'));
CREATE POLICY role_guard_attendance_insert ON public.school_attendance AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (school_private.staff_module_enabled(institution_id,'attendance'));
CREATE POLICY role_guard_attendance_update ON public.school_attendance AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'attendance'))
 WITH CHECK (school_private.staff_module_enabled(institution_id,'attendance'));

CREATE POLICY role_guard_homework_read ON public.school_homework AS RESTRICTIVE FOR SELECT TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'homework'));
CREATE POLICY role_guard_homework_insert ON public.school_homework AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (school_private.staff_module_enabled(institution_id,'homework'));
CREATE POLICY role_guard_homework_update ON public.school_homework AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'homework'))
 WITH CHECK (school_private.staff_module_enabled(institution_id,'homework'));

CREATE POLICY role_guard_notices_read ON public.school_notices AS RESTRICTIVE FOR SELECT TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'notices'));
CREATE POLICY role_guard_profiles_read ON public.school_student_profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'profiles'));
-- Profiles are view-only for front-office/accounting users. Edits remain owner-only.
CREATE POLICY role_enabled_frontoffice_profiles_read ON public.school_student_profiles
 FOR SELECT TO authenticated USING (
   school_private.has_role(institution_id, ARRAY['accountant','receptionist'])
   AND school_private.staff_module_enabled(institution_id,'profiles')
 );
COMMENT ON TABLE public.school_role_module_permissions IS 'Authoritative per-school module visibility and staff RLS guards. Cloud only; no browser permissions storage.';
