-- Pre-provisioned TEST-school claims and invitation-free staff directory.
-- No unauthenticated client may read or claim a prepared school by guessable email.
CREATE TABLE IF NOT EXISTS school_private.prepared_test_school_claims (
 institution_id uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE RESTRICT,
 owner_email text NOT NULL CHECK (owner_email = lower(owner_email)),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
 claimed_by uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
 claimed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT test_school_claim_consistency CHECK (
  (claimed_by IS NULL AND claimed_at IS NULL) OR
  (claimed_by IS NOT NULL AND claimed_at IS NOT NULL))
);
REVOKE ALL ON school_private.prepared_test_school_claims FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS prepared_unclaimed_owner_unique
 ON school_private.prepared_test_school_claims(owner_email)
 WHERE claimed_by IS NULL;

CREATE TABLE public.school_contact_profiles (
 institution_id uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE RESTRICT,
 owner_email text NOT NULL,
 contact_mobile text CHECK (contact_mobile IS NULL OR contact_mobile ~ '^[6-9][0-9]{9}$'),
 is_test_school boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_contact_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_contact_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_contact_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.school_contact_profiles TO authenticated;
CREATE POLICY school_test_contact_owner_read ON public.school_contact_profiles
 FOR SELECT TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin','principal']));

-- Existing cloud staff profiles were linked to an invited account only.
-- Allow safe draft records with NO login, which may be linked after a verified invitation.
ALTER TABLE public.school_staff_profiles ALTER COLUMN school_user_id DROP NOT NULL;
ALTER TABLE public.school_staff_profiles
 ADD COLUMN staff_category text NOT NULL DEFAULT 'teaching'
   CHECK (staff_category IN ('teaching','housekeeping')),
 ADD COLUMN contact_email text
   CHECK (contact_email IS NULL OR
     (length(contact_email) <= 254 AND contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 ADD COLUMN contact_mobile text
   CHECK (contact_mobile IS NULL OR contact_mobile ~ '^[6-9][0-9]{9}$'),
 ADD COLUMN is_seeded_test boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX school_staff_profile_email_tenant_unique
 ON public.school_staff_profiles(institution_id,lower(contact_email))
 WHERE contact_email IS NOT NULL;
DROP POLICY school_staff_profiles_insert ON public.school_staff_profiles;
CREATE POLICY school_staff_profiles_insert ON public.school_staff_profiles
 FOR INSERT TO authenticated
 WITH CHECK (
  school_private.has_role(institution_id,ARRAY['school_admin','principal'])
  AND (school_user_id IS NULL OR EXISTS
     (SELECT 1 FROM public.school_users u
       WHERE u.id=school_user_id AND u.institution_id=school_staff_profiles.institution_id
         AND u.role IN ('teacher','principal','receptionist','transport_staff','accountant')
         AND u.status='active'))
 );
DROP POLICY school_staff_profiles_update ON public.school_staff_profiles;
CREATE POLICY school_staff_profiles_update ON public.school_staff_profiles
 FOR UPDATE TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin','principal']))
 WITH CHECK (
  school_private.has_role(institution_id,ARRAY['school_admin','principal'])
  AND (school_user_id IS NULL OR EXISTS
     (SELECT 1 FROM public.school_users u
       WHERE u.id=school_user_id AND u.institution_id=school_staff_profiles.institution_id
         AND u.role IN ('teacher','principal','receptionist','transport_staff','accountant')
         AND u.status='active'))
 );

-- Staff can be marked present/absent even if invitation is still pending.
CREATE TABLE public.school_staff_directory_attendance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
 staff_profile_id uuid NOT NULL REFERENCES public.school_staff_profiles(id) ON DELETE RESTRICT,
 day date NOT NULL,
 status text NOT NULL CHECK (status IN ('present','absent','late','leave')),
 recorded_by uuid NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 250),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (staff_profile_id,day),
 FOREIGN KEY (recorded_by,institution_id)
  REFERENCES public.school_users(id,institution_id) ON DELETE RESTRICT
);
-- Tenant identity must match both the staff directory and recorder.
ALTER TABLE public.school_staff_profiles
 ADD CONSTRAINT school_staff_profiles_id_institution_unique UNIQUE(id,institution_id);
ALTER TABLE public.school_staff_directory_attendance
 ADD CONSTRAINT staff_attendance_tenant_profile_fk
 FOREIGN KEY (staff_profile_id,institution_id)
 REFERENCES public.school_staff_profiles(id,institution_id) ON DELETE RESTRICT;
ALTER TABLE public.school_staff_directory_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_staff_directory_attendance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_staff_directory_attendance FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.school_staff_directory_attendance TO authenticated;
CREATE POLICY staff_directory_attendance_read ON public.school_staff_directory_attendance
 FOR SELECT TO authenticated
 USING (
  school_private.has_role(institution_id,ARRAY['school_admin','principal'])
  OR EXISTS (
   SELECT 1 FROM public.school_staff_profiles p
   JOIN public.school_users u ON u.id=p.school_user_id AND u.institution_id=p.institution_id
   WHERE p.id=staff_profile_id AND p.institution_id=school_staff_directory_attendance.institution_id
    AND u.auth_user_id=(SELECT auth.uid()) AND u.status='active')
 );
CREATE POLICY staff_directory_attendance_insert ON public.school_staff_directory_attendance
 FOR INSERT TO authenticated
 WITH CHECK (
  school_private.has_role(institution_id,ARRAY['school_admin','principal'])
  AND EXISTS(SELECT 1 FROM public.school_users u
    WHERE u.id=recorded_by AND u.institution_id=school_staff_directory_attendance.institution_id
      AND u.auth_user_id=(SELECT auth.uid()) AND u.status='active')
 );
CREATE POLICY staff_directory_attendance_update ON public.school_staff_directory_attendance
 FOR UPDATE TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin','principal']))
 WITH CHECK (
  school_private.has_role(institution_id,ARRAY['school_admin','principal'])
  AND EXISTS(SELECT 1 FROM public.school_users u
    WHERE u.id=recorded_by AND u.institution_id=school_staff_directory_attendance.institution_id
      AND u.auth_user_id=(SELECT auth.uid()) AND u.status='active')
 );
CREATE INDEX school_staff_directory_attendance_month_idx
 ON public.school_staff_directory_attendance(institution_id,day);

-- Link a draft teacher profile after the owner explicitly sends an invitation.
CREATE OR REPLACE FUNCTION school_private.attach_invited_teacher_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.role = 'teacher' AND NEW.status='active' THEN
  UPDATE public.school_staff_profiles p SET school_user_id=NEW.id,updated_at=now()
  WHERE p.institution_id=NEW.institution_id AND p.staff_category='teaching'
    AND p.school_user_id IS NULL AND p.contact_email IS NOT NULL
    AND lower(p.contact_email)=lower(NEW.email);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION school_private.attach_invited_teacher_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER attach_invited_teacher_profile
 AFTER INSERT ON public.school_users
 FOR EACH ROW EXECUTE FUNCTION school_private.attach_invited_teacher_profile();

-- Secure prepared-school claim is permitted ONLY to its verified email owner.
CREATE OR REPLACE FUNCTION public.claim_prepared_test_school()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_actor uuid := (SELECT auth.uid());
 v_email text;
 v_institution uuid;
 v_member uuid;
BEGIN
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Sign in with your verified email first.' USING ERRCODE='28000';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text,1));
 SELECT lower(u.email) INTO v_email FROM auth.users u
  WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE;
 IF v_email IS NULL THEN
  RAISE EXCEPTION 'Verify your email before claiming a school.' USING ERRCODE='28000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.school_users WHERE auth_user_id=v_actor) THEN
  RETURN NULL;
 END IF;
 SELECT c.institution_id INTO v_institution
 FROM school_private.prepared_test_school_claims c
 JOIN public.institutions i ON i.id=c.institution_id
 WHERE c.owner_email=v_email AND c.claimed_by IS NULL AND c.expires_at>now()
   AND i.status='trial'
 FOR UPDATE OF c;
 IF v_institution IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.school_users(institution_id,auth_user_id,email,role,status)
 VALUES(v_institution,v_actor,v_email,'school_admin','active')
 RETURNING id INTO v_member;
 UPDATE school_private.prepared_test_school_claims
  SET claimed_by=v_actor,claimed_at=now()
  WHERE institution_id=v_institution AND claimed_by IS NULL;
 INSERT INTO public.school_audit_events(institution_id,actor_id,action,entity,entity_id)
 VALUES(v_institution,v_member,'school.prepared_test_claimed','institution',v_institution);
 RETURN v_institution;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_prepared_test_school() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_prepared_test_school() TO authenticated;
