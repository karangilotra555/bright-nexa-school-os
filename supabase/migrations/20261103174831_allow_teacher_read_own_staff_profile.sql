CREATE POLICY school_staff_profiles_self_read ON public.school_staff_profiles
 FOR SELECT TO authenticated
 USING (
  school_user_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.school_users su
    WHERE su.id=school_staff_profiles.school_user_id
      AND su.institution_id=school_staff_profiles.institution_id
      AND su.auth_user_id=(SELECT auth.uid())
      AND su.status='active'
  )
 );