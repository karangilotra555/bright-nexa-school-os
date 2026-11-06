CREATE POLICY school_principal_profile_read ON public.school_student_profiles FOR SELECT TO authenticated USING (school_private.has_role(institution_id, ARRAY['principal']));
