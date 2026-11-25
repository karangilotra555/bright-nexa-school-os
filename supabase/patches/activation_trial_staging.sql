-- STAGING ONLY: not a production migration. Verify the real registration
-- function, grants, role membership and every write path before deploying.
BEGIN;
-- Prevent accidental replacement of an unexpected registration contract.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='register_first_school'
 AND p.oid=pg_catalog.to_regprocedure('public.register_first_school(text)')
 AND p.prorettype='uuid'::regtype AND p.prosecdef)
 OR (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='register_first_school')<>1 THEN
 RAISE EXCEPTION 'Unexpected registration RPC contract; review before applying';
 END IF;
END $$;

CREATE TABLE school_private.bn_activation_codes(
 code_hash text PRIMARY KEY,
 owner_email text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 redeemed_at timestamptz,
 redeemed_by uuid,
 institution_id uuid REFERENCES public.institutions(id) ON DELETE RESTRICT,
 CHECK(expires_at>issued_at),
 CHECK((redeemed_at IS NULL AND redeemed_by IS NULL AND institution_id IS NULL)
 OR (redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL AND institution_id IS NOT NULL))
);
CREATE TABLE school_private.bn_school_entitlements(
 institution_id uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE RESTRICT,
 plan text NOT NULL CHECK(plan IN ('trial','active')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at)
);
ALTER TABLE school_private.bn_activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_private.bn_school_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON school_private.bn_activation_codes,school_private.bn_school_entitlements FROM PUBLIC,anon,authenticated,service_role;

-- The platform operator's trusted server may issue a code. Never give a
-- service_role key to a school owner or expose it in the browser.
CREATE FUNCTION public.bn_issue_school_activation(p_owner_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_email text := lower(trim(p_owner_email)); v_code text;
BEGIN
 IF v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' THEN
 RAISE EXCEPTION 'Valid owner email required';
 END IF;
 -- Serialize issuance for the same email and invalidate superseded codes.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 181));
 UPDATE school_private.bn_activation_codes SET revoked_at=clock_timestamp()
 WHERE owner_email=v_email AND redeemed_at IS NULL AND revoked_at IS NULL;
 v_code := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 INSERT INTO school_private.bn_activation_codes(code_hash,owner_email,expires_at)
 VALUES(encode(sha256(convert_to(v_code,'UTF8')),'hex'),v_email,now()+interval '7 days');
 RETURN v_code;
END $$;
REVOKE ALL ON FUNCTION public.bn_issue_school_activation(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_issue_school_activation(text) TO service_role;

CREATE FUNCTION public.bn_revoke_school_activation(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $
BEGIN
 IF p_code IS NULL OR p_code !~ '^[0-9a-f]{64} rather than duplicating its tenant logic.
-- The prior public RPC must no longer be executable directly.
ALTER FUNCTION public.register_first_school(text) SET SCHEMA school_private;
ALTER FUNCTION school_private.register_first_school(text) RENAME TO bn_register_first_school_legacy;
REVOKE ALL ON FUNCTION school_private.bn_register_first_school_legacy(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.register_first_school(p_school_name text,p_activation_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_hash text; v_school uuid; v_start timestamptz;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Verified owner required' USING ERRCODE='42501'; END IF;
 SELECT lower(trim(u.email)) INTO v_email FROM auth.users u WHERE u.id=v_uid AND u.email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verified owner email required' USING ERRCODE='42501'; END IF;
 IF p_activation_code IS NULL OR p_activation_code !~ '^[0-9a-f]{64}$' THEN
 RAISE EXCEPTION 'Invalid or unavailable activation code' USING ERRCODE='42501'; END IF;
 -- Serialize registration for this verified account even with different codes.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 182));
 v_hash := encode(sha256(convert_to(p_activation_code,'UTF8')),'hex');
 -- Row lock serializes concurrent redemption. No write survives if
 -- legacy registration or entitlement creation fails.
 PERFORM 1 FROM school_private.bn_activation_codes c
 WHERE c.code_hash=v_hash AND c.owner_email=v_email AND c.revoked_at IS NULL
 AND c.redeemed_at IS NULL AND c.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or unavailable activation code' USING ERRCODE='42501'; END IF;
 v_school := school_private.bn_register_first_school_legacy(p_school_name);
 IF v_school IS NULL OR NOT school_private.has_role(v_school,ARRAY['school_admin']) THEN
 RAISE EXCEPTION 'Registration not confirmed' USING ERRCODE='42501'; END IF;
 v_start := clock_timestamp();
 INSERT INTO school_private.bn_school_entitlements(institution_id,plan,starts_at,ends_at)
 VALUES(v_school,'trial',v_start,v_start+interval '720 hours');
 UPDATE school_private.bn_activation_codes SET redeemed_at=v_start,redeemed_by=v_uid,institution_id=v_school
 WHERE code_hash=v_hash;
 RETURN v_school;
END $$;
REVOKE ALL ON FUNCTION public.register_first_school(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_first_school(text,text) TO authenticated;

CREATE FUNCTION public.bn_school_trial_status(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e school_private.bn_school_entitlements%ROWTYPE; v_now timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL OR NOT school_private.has_role(p_institution_id,ARRAY['school_admin','principal']) THEN
 RAISE EXCEPTION 'School access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM school_private.bn_school_entitlements WHERE institution_id=p_institution_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unassigned','server_time',v_now); END IF;
 RETURN jsonb_build_object('status',CASE WHEN v_now>=e.ends_at THEN 'expired' ELSE e.plan END,
 'starts_at',e.starts_at,'ends_at',e.ends_at,'server_time',v_now);
END $$;
REVOKE ALL ON FUNCTION public.bn_school_trial_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_school_trial_status(uuid) TO authenticated;

CREATE FUNCTION public.bn_renew_school_entitlement(p_institution_id uuid,p_days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_days IS NULL OR p_days<1 OR p_days>366 THEN RAISE EXCEPTION 'Invalid renewal duration'; END IF;
 UPDATE school_private.bn_school_entitlements SET plan='active',
 starts_at=CASE WHEN ends_at<=v_now THEN v_now ELSE starts_at END,
 ends_at=greatest(ends_at,v_now)+make_interval(hours=>24*p_days),updated_at=v_now
 WHERE institution_id=p_institution_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'No entitlement found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bn_renew_school_entitlement(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_renew_school_entitlement(uuid,integer) TO service_role;

-- Staging guard: block writes even inside SECURITY DEFINER RPCs, including
-- updates that attempt to move a record out of an expired tenant.
-- No entitlement is treated as legacy until explicit migration/backfill.
CREATE FUNCTION school_private.bn_assert_school_writable(p_school uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $
DECLARE v_end timestamptz;
BEGIN
 SELECT ends_at INTO v_end FROM school_private.bn_school_entitlements
 WHERE institution_id=p_school FOR SHARE;
 IF FOUND AND clock_timestamp()>=v_end THEN
 RAISE EXCEPTION 'Subscription expired: school is read-only. Contact Bright Nexa.' USING ERRCODE='42501';
 END IF;
END $;
REVOKE ALL ON FUNCTION school_private.bn_assert_school_writable(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION school_private.bn_guard_trial_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
 PERFORM school_private.bn_assert_school_writable(OLD.institution_id);
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
 PERFORM school_private.bn_assert_school_writable(NEW.institution_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $;
REVOKE ALL ON FUNCTION school_private.bn_guard_trial_write() FROM PUBLIC,anon,authenticated,service_role;
-- Explicit known tenant data tables only; production requires catalog audit
-- of additional tables, storage paths, auth actions and queued operations.
DO $
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['school_students','school_student_profiles','school_classes','school_attendance',
 'school_homework','school_homework_files','school_teacher_assignments','school_fee_entries',
 'school_notices','school_workspaces','school_workspace_links','school_module_records'] LOOP
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public' AND c.relname=t AND c.relkind IN ('r','p')
 AND a.attname='institution_id' AND a.atttypid='uuid'::regtype AND NOT a.attisdropped) THEN
 EXECUTE format('CREATE TRIGGER bn_trial_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION school_private.bn_guard_trial_write()',t);
 END IF;
 END LOOP;
END $;

-- Remaining release gates: real operator identity/authorization UI,
-- rate limits, old RPC privilege audit including custom
-- grants, onboarding integration, existing tenant entitlement assignment,
-- expiry coverage beyond the staged table set (including Storage), reminders, production E2E tests.
COMMIT;
 THEN RETURN false; END IF;
 UPDATE school_private.bn_activation_codes SET revoked_at=clock_timestamp()
 WHERE code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex')
 AND redeemed_at IS NULL AND revoked_at IS NULL;
 RETURN FOUND;
END $;
REVOKE ALL ON FUNCTION public.bn_revoke_school_activation(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_revoke_school_activation(text) TO service_role;

-- Keep original registration logic rather than duplicating its tenant logic.
-- The prior public RPC must no longer be executable directly.
ALTER FUNCTION public.register_first_school(text) SET SCHEMA school_private;
ALTER FUNCTION school_private.register_first_school(text) RENAME TO bn_register_first_school_legacy;
REVOKE ALL ON FUNCTION school_private.bn_register_first_school_legacy(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.register_first_school(p_school_name text,p_activation_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_hash text; v_school uuid; v_start timestamptz;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Verified owner required' USING ERRCODE='42501'; END IF;
 SELECT lower(trim(u.email)) INTO v_email FROM auth.users u WHERE u.id=v_uid AND u.email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verified owner email required' USING ERRCODE='42501'; END IF;
 IF p_activation_code IS NULL OR p_activation_code !~ '^[0-9a-f]{64}$' THEN
 RAISE EXCEPTION 'Invalid or unavailable activation code' USING ERRCODE='42501'; END IF;
 v_hash := encode(sha256(convert_to(p_activation_code,'UTF8')),'hex');
 -- Row lock serializes concurrent redemption. No write survives if
 -- legacy registration or entitlement creation fails.
 PERFORM 1 FROM school_private.bn_activation_codes c
 WHERE c.code_hash=v_hash AND c.owner_email=v_email AND c.revoked_at IS NULL
 AND c.redeemed_at IS NULL AND c.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or unavailable activation code' USING ERRCODE='42501'; END IF;
 v_school := school_private.bn_register_first_school_legacy(p_school_name);
 IF v_school IS NULL OR NOT school_private.has_role(v_school,ARRAY['school_admin']) THEN
 RAISE EXCEPTION 'Registration not confirmed' USING ERRCODE='42501'; END IF;
 v_start := clock_timestamp();
 INSERT INTO school_private.bn_school_entitlements(institution_id,plan,starts_at,ends_at)
 VALUES(v_school,'trial',v_start,v_start+interval '720 hours');
 UPDATE school_private.bn_activation_codes SET redeemed_at=v_start,redeemed_by=v_uid,institution_id=v_school
 WHERE code_hash=v_hash;
 RETURN v_school;
END $$;
REVOKE ALL ON FUNCTION public.register_first_school(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_first_school(text,text) TO authenticated;

CREATE FUNCTION public.bn_school_trial_status(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e school_private.bn_school_entitlements%ROWTYPE; v_now timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL OR NOT school_private.has_role(p_institution_id,ARRAY['school_admin','principal']) THEN
 RAISE EXCEPTION 'School access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM school_private.bn_school_entitlements WHERE institution_id=p_institution_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unassigned','server_time',v_now); END IF;
 RETURN jsonb_build_object('status',CASE WHEN v_now>=e.ends_at THEN 'expired' ELSE e.plan END,
 'starts_at',e.starts_at,'ends_at',e.ends_at,'server_time',v_now);
END $$;
REVOKE ALL ON FUNCTION public.bn_school_trial_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_school_trial_status(uuid) TO authenticated;

CREATE FUNCTION public.bn_renew_school_entitlement(p_institution_id uuid,p_days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_days IS NULL OR p_days<1 OR p_days>366 THEN RAISE EXCEPTION 'Invalid renewal duration'; END IF;
 UPDATE school_private.bn_school_entitlements SET plan='active',
 starts_at=CASE WHEN ends_at<=v_now THEN v_now ELSE starts_at END,
 ends_at=greatest(ends_at,v_now)+make_interval(hours=>24*p_days),updated_at=v_now
 WHERE institution_id=p_institution_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'No entitlement found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bn_renew_school_entitlement(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_renew_school_entitlement(uuid,integer) TO service_role;

-- Remaining release gates: real operator identity/authorization UI,
-- code revocation/rate limits, old RPC privilege audit including custom
-- grants, onboarding integration, existing tenant entitlement assignment,
-- expiry enforcement on ALL write paths, reminders, production E2E tests.
COMMIT;
