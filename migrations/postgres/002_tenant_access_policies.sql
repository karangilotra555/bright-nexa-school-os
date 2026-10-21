-- Bright Nexa School OS — migration 002.
-- Run ONLY on a dedicated school database after 001.
-- Supabase Auth handles passwords; never store password hashes in public tables.
BEGIN;

ALTER TABLE school_users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE school_users ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS school_users_tenant_auth_idx ON school_users(institution_id,auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- SECURITY DEFINER prevents recursive RLS when evaluating school membership.
-- Fixed search_path avoids search-path object shadowing.
CREATE OR REPLACE FUNCTION public.school_has_role(target_institution uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_users u
    WHERE u.institution_id = target_institution
      AND u.auth_user_id = (SELECT auth.uid())
      AND u.status = 'active'
      AND u.role = ANY(allowed_roles)
  );
$$;
REVOKE ALL ON FUNCTION public.school_has_role(uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.school_has_role(uuid,text[]) TO authenticated;

-- Institution members can view their own school profile, never another school's.
CREATE POLICY school_institution_read ON institutions FOR SELECT TO authenticated
USING (public.school_has_role(id, ARRAY['school_admin','principal','accountant','teacher','receptionist']));

-- Membership list may be read by administrators only. Do not expose credentials.
CREATE POLICY school_users_admin_read ON school_users FOR SELECT TO authenticated
USING (public.school_has_role(institution_id, ARRAY['school_admin','principal']));

CREATE POLICY school_classes_read ON school_classes FOR SELECT TO authenticated
USING (public.school_has_role(institution_id, ARRAY['school_admin','principal','accountant','teacher','receptionist']));
CREATE POLICY school_classes_insert ON school_classes FOR INSERT TO authenticated
WITH CHECK (public.school_has_role(institution_id, ARRAY['school_admin','principal']));
CREATE POLICY school_classes_update ON school_classes FOR UPDATE TO authenticated
USING (public.school_has_role(institution_id, ARRAY['school_admin','principal']))
WITH CHECK (public.school_has_role(institution_id, ARRAY['school_admin','principal']));

CREATE POLICY school_students_read ON school_students FOR SELECT TO authenticated
USING (public.school_has_role(institution_id, ARRAY['school_admin','principal','accountant','teacher','receptionist']));
CREATE POLICY school_students_insert ON school_students FOR INSERT TO authenticated
WITH CHECK (public.school_has_role(institution_id, ARRAY['school_admin','principal','receptionist']));
CREATE POLICY school_students_update ON school_students FOR UPDATE TO authenticated
USING (public.school_has_role(institution_id, ARRAY['school_admin','principal','receptionist']))
WITH CHECK (public.school_has_role(institution_id, ARRAY['school_admin','principal','receptionist']));

-- Audit events must be append-only from the trusted backend, not browser clients.
-- school_audit_events has no client policies.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON institutions,school_users,school_classes,school_students TO authenticated;
GRANT INSERT,UPDATE ON school_classes,school_students TO authenticated;
COMMIT;
