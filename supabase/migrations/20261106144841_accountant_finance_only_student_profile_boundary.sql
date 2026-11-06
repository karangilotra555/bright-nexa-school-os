UPDATE public.school_role_module_permissions
 SET enabled=false,updated_at=now()
 WHERE role='accountant' AND module_key='profiles' AND enabled=true;
DROP POLICY IF EXISTS role_enabled_frontoffice_profiles_read ON public.school_student_profiles;
CREATE POLICY role_enabled_frontoffice_profiles_read ON public.school_student_profiles
 FOR SELECT TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['receptionist'])
   AND school_private.staff_module_enabled(institution_id,'profiles'));
DROP POLICY IF EXISTS role_guard_profiles_read ON public.school_student_profiles;
CREATE POLICY role_guard_profiles_read ON public.school_student_profiles
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (school_private.staff_module_enabled(institution_id,'profiles')
   AND NOT school_private.has_role(institution_id,ARRAY['accountant']));
