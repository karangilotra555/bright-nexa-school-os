
-- Bright Nexa: verified guardian cloud access, immutable fee ledger, notices and leave requests.
-- Apply to empty pilot database after reviewing existing school membership RLS.
ALTER TABLE public.school_students
  ADD CONSTRAINT school_students_id_institution_unique UNIQUE (id,institution_id);

CREATE TABLE public.school_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id,auth_user_id),
  UNIQUE (id,institution_id)
);
CREATE TABLE public.school_guardian_students (
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  guardian_id uuid NOT NULL,
  student_id uuid NOT NULL,
  relationship text NOT NULL DEFAULT 'guardian' CHECK (relationship IN ('mother','father','guardian')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_id,student_id),
  FOREIGN KEY (guardian_id,institution_id) REFERENCES public.school_guardians(id,institution_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id,institution_id) REFERENCES public.school_students(id,institution_id) ON DELETE CASCADE
);
CREATE INDEX school_guardian_students_student_idx ON public.school_guardian_students(student_id,institution_id);
CREATE TABLE public.school_fee_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  student_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('charge','payment')),
  amount_rupees bigint NOT NULL CHECK (amount_rupees BETWEEN 1 AND 100000000),
  description text NOT NULL DEFAULT '' CHECK (char_length(description)<=250),
  reference text,
  created_by uuid NOT NULL,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id,institution_id) REFERENCES public.school_students(id,institution_id),
  FOREIGN KEY (created_by,institution_id) REFERENCES public.school_users(id,institution_id),
  UNIQUE (institution_id,reference),
  CHECK (reference IS NULL OR char_length(btrim(reference)) BETWEEN 1 AND 100)
);
CREATE INDEX school_fee_student_idx ON public.school_fee_entries(student_id,occurred_on DESC);
CREATE TABLE public.school_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 180),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 2500),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (created_by,institution_id) REFERENCES public.school_users(id,institution_id)
);
CREATE INDEX school_notice_recent_idx ON public.school_notices(institution_id,created_at DESC);
CREATE TABLE public.school_parent_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  student_id uuid NOT NULL,
  parent_auth_user_id uuid NOT NULL REFERENCES auth.users(id),
  from_on date NOT NULL,
  to_on date NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_on>=from_on AND to_on<=from_on+INTERVAL '90 days'),
  FOREIGN KEY (student_id,institution_id) REFERENCES public.school_students(id,institution_id)
);
CREATE INDEX school_parent_leaves_school_idx ON public.school_parent_leaves(institution_id,created_at DESC);
CREATE INDEX school_parent_leaves_student_idx ON public.school_parent_leaves(student_id,created_at DESC);

-- These specific private helpers are the only cross-table guardian authorization decisions.
-- Each helper checks auth.uid() against verified guardian membership and active students.
CREATE FUNCTION school_private.parent_of(p_student uuid,p_institution uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.school_guardians g
    JOIN public.school_guardian_students gs
      ON gs.guardian_id=g.id AND gs.institution_id=g.institution_id
    JOIN public.school_students s
      ON s.id=gs.student_id AND s.institution_id=gs.institution_id
    WHERE g.auth_user_id=(SELECT auth.uid()) AND g.status='active'
      AND gs.student_id=p_student AND g.institution_id=p_institution AND s.status='active'
  );
$$;
CREATE FUNCTION school_private.parent_in_school(p_institution uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.school_guardians g
    JOIN public.school_guardian_students gs ON gs.guardian_id=g.id AND gs.institution_id=g.institution_id
    JOIN public.school_students s ON s.id=gs.student_id AND s.institution_id=gs.institution_id
    WHERE g.institution_id=p_institution AND g.auth_user_id=(SELECT auth.uid())
      AND g.status='active' AND s.status='active'
  );
$$;
CREATE FUNCTION school_private.parent_has_class(p_institution uuid,p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.school_guardians g
    JOIN public.school_guardian_students gs ON gs.guardian_id=g.id AND gs.institution_id=g.institution_id
    JOIN public.school_students s ON s.id=gs.student_id AND s.institution_id=gs.institution_id
    WHERE g.institution_id=p_institution AND g.auth_user_id=(SELECT auth.uid())
      AND g.status='active' AND s.status='active' AND s.class_id=p_class
  );
$$;
REVOKE ALL ON FUNCTION school_private.parent_of(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION school_private.parent_in_school(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION school_private.parent_has_class(uuid,uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA school_private TO authenticated;
GRANT EXECUTE ON FUNCTION school_private.parent_of(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION school_private.parent_in_school(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION school_private.parent_has_class(uuid,uuid) TO authenticated;

ALTER TABLE public.school_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_guardian_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_fee_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_parent_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.school_guardian_students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.school_fee_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.school_notices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.school_parent_leaves FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.school_guardians,public.school_guardian_students,public.school_fee_entries,public.school_notices,public.school_parent_leaves FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_guardians,public.school_guardian_students,public.school_fee_entries,public.school_notices,public.school_parent_leaves TO authenticated;
GRANT INSERT ON public.school_fee_entries,public.school_notices,public.school_parent_leaves TO authenticated;
GRANT UPDATE(status) ON public.school_parent_leaves TO authenticated;

CREATE POLICY guardian_self_read ON public.school_guardians FOR SELECT TO authenticated USING
 (auth_user_id=(SELECT auth.uid()) OR school_private.has_role(institution_id,ARRAY['school_admin']));
CREATE POLICY guardian_links_read ON public.school_guardian_students FOR SELECT TO authenticated USING
 (school_private.parent_of(student_id,institution_id) OR school_private.has_role(institution_id,ARRAY['school_admin']));
CREATE POLICY fee_entries_read ON public.school_fee_entries FOR SELECT TO authenticated USING
 (school_private.parent_of(student_id,institution_id)
  OR school_private.has_role(institution_id,ARRAY['school_admin','accountant']));
CREATE POLICY fee_entries_insert ON public.school_fee_entries FOR INSERT TO authenticated WITH CHECK
 (school_private.has_role(institution_id,ARRAY['school_admin','accountant'])
  AND EXISTS(SELECT 1 FROM public.school_users su WHERE su.id=school_fee_entries.created_by
     AND su.institution_id=school_fee_entries.institution_id AND su.auth_user_id=(SELECT auth.uid())
     AND su.status='active')
  AND EXISTS(SELECT 1 FROM public.school_students s WHERE s.id=school_fee_entries.student_id
     AND s.institution_id=school_fee_entries.institution_id AND s.status='active'));
CREATE POLICY notices_read ON public.school_notices FOR SELECT TO authenticated USING
 (school_private.parent_in_school(institution_id)
  OR school_private.has_role(institution_id,ARRAY['school_admin','principal','teacher','receptionist','accountant','transport_staff']));
CREATE POLICY notices_insert ON public.school_notices FOR INSERT TO authenticated WITH CHECK
 (school_private.has_role(institution_id,ARRAY['school_admin','principal'])
  AND EXISTS(SELECT 1 FROM public.school_users su WHERE su.id=school_notices.created_by
   AND su.institution_id=school_notices.institution_id AND su.auth_user_id=(SELECT auth.uid()) AND su.status='active'));
CREATE POLICY parent_leave_read ON public.school_parent_leaves FOR SELECT TO authenticated USING
 ((parent_auth_user_id=(SELECT auth.uid()) AND school_private.parent_of(student_id,institution_id))
   OR school_private.has_role(institution_id,ARRAY['school_admin','principal']));
CREATE POLICY parent_leave_insert ON public.school_parent_leaves FOR INSERT TO authenticated WITH CHECK
 (parent_auth_user_id=(SELECT auth.uid()) AND status='pending'
   AND school_private.parent_of(student_id,institution_id));
CREATE POLICY parent_leave_update ON public.school_parent_leaves FOR UPDATE TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin','principal']))
 WITH CHECK (school_private.has_role(institution_id,ARRAY['school_admin','principal']));

-- Add parent-specific reads without broadening existing staff policies.
CREATE POLICY school_parent_institution_read ON public.institutions FOR SELECT TO authenticated
  USING (school_private.parent_in_school(id));
CREATE POLICY school_parent_class_read ON public.school_classes FOR SELECT TO authenticated
  USING (school_private.parent_has_class(institution_id,id));
CREATE POLICY school_parent_student_read ON public.school_students FOR SELECT TO authenticated
  USING (school_private.parent_of(id,institution_id));
CREATE POLICY school_parent_attendance_read ON public.school_attendance FOR SELECT TO authenticated
  USING (school_private.parent_of(student_id,institution_id));
CREATE POLICY school_parent_homework_read ON public.school_homework FOR SELECT TO authenticated
  USING (school_private.parent_has_class(institution_id,class_id));

-- Only a verified school admin can link or unlink a verified guardian Auth identity.
-- The guardian must first sign up and verify the account email themselves.
CREATE FUNCTION public.school_link_guardian(p_student_id uuid,p_email text,p_relationship text DEFAULT 'guardian')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_school uuid; v_actor uuid; v_guardian_user uuid; v_guardian_id uuid; v_email text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'School admin sign-in required' USING errcode='28000'; END IF;
 SELECT s.institution_id INTO v_school FROM public.school_students s
  JOIN public.institutions i ON i.id=s.institution_id
  WHERE s.id=p_student_id AND s.status='active' AND i.status IN ('trial','active');
 IF v_school IS NULL OR NOT school_private.has_role(v_school,ARRAY['school_admin']) THEN
   RAISE EXCEPTION 'Student not found or admin access denied' USING errcode='42501';
 END IF;
 SELECT su.id INTO v_actor FROM public.school_users su
  WHERE su.institution_id=v_school AND su.auth_user_id=auth.uid() AND su.role='school_admin' AND su.status='active';
 v_email:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_email,'')));
 IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR pg_catalog.char_length(v_email)>254 THEN
    RAISE EXCEPTION 'Valid verified guardian email required' USING errcode='22023';
 END IF;
 IF p_relationship NOT IN ('mother','father','guardian') THEN
   RAISE EXCEPTION 'Invalid guardian relationship' USING errcode='22023';
 END IF;
 SELECT u.id INTO v_guardian_user FROM auth.users u
   WHERE pg_catalog.lower(u.email)=v_email AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE;
 IF v_guardian_user IS NULL THEN
    RAISE EXCEPTION 'Guardian must sign up and verify this email before being linked' USING errcode='22023';
 END IF;
 INSERT INTO public.school_guardians(institution_id,auth_user_id,email,status)
 VALUES(v_school,v_guardian_user,v_email,'active')
 ON CONFLICT (institution_id,auth_user_id) DO UPDATE SET email=excluded.email,status='active'
 RETURNING id INTO v_guardian_id;
 INSERT INTO public.school_guardian_students(institution_id,guardian_id,student_id,relationship)
 VALUES(v_school,v_guardian_id,p_student_id,p_relationship)
 ON CONFLICT (guardian_id,student_id) DO UPDATE SET relationship=excluded.relationship;
 INSERT INTO public.school_audit_events(institution_id,actor_id,action,entity,entity_id)
 VALUES(v_school,v_actor,'guardian.linked','student',p_student_id);
 RETURN v_guardian_id;
END;$$;
REVOKE ALL ON FUNCTION public.school_link_guardian(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_link_guardian(uuid,text,text) TO authenticated;
CREATE FUNCTION public.school_unlink_guardian(p_student_id uuid,p_guardian_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_school uuid; v_actor uuid; v_deleted integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'School admin sign-in required' USING errcode='28000'; END IF;
 SELECT s.institution_id INTO v_school FROM public.school_students s WHERE s.id=p_student_id;
 IF v_school IS NULL OR NOT school_private.has_role(v_school,ARRAY['school_admin']) THEN
   RAISE EXCEPTION 'Student not found or admin access denied' USING errcode='42501';
 END IF;
 SELECT su.id INTO v_actor FROM public.school_users su
  WHERE su.institution_id=v_school AND su.auth_user_id=auth.uid() AND su.role='school_admin' AND su.status='active';
 DELETE FROM public.school_guardian_students
  WHERE institution_id=v_school AND student_id=p_student_id AND guardian_id=p_guardian_id;
 GET DIAGNOSTICS v_deleted=ROW_COUNT;
 IF v_deleted>0 THEN
   INSERT INTO public.school_audit_events(institution_id,actor_id,action,entity,entity_id)
   VALUES(v_school,v_actor,'guardian.unlinked','student',p_student_id);
 END IF;
 RETURN v_deleted>0;
END;$$;
REVOKE ALL ON FUNCTION public.school_unlink_guardian(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_unlink_guardian(uuid,uuid) TO authenticated;
