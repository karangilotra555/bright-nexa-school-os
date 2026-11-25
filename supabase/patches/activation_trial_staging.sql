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
CREATE TABLE school_private.bn_activation_attempts(
 bucket text PRIMARY KEY,
 window_start timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempts integer NOT NULL DEFAULT 1
);
CREATE TABLE school_private.bn_trial_reminders(
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
 ends_at timestamptz NOT NULL,
 milestone_days integer NOT NULL CHECK(milestone_days IN (7,3,1)),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(institution_id,ends_at,milestone_days)
);
CREATE TABLE school_private.bn_platform_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_type text NOT NULL,
 actor_uid uuid,
 owner_email text,
 institution_id uuid,
 code_digest_prefix text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE school_private.bn_activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_private.bn_school_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_private.bn_activation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_private.bn_trial_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_private.bn_platform_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON school_private.bn_activation_codes,school_private.bn_school_entitlements,
 school_private.bn_activation_attempts,school_private.bn_trial_reminders,school_private.bn_platform_audit
 FROM PUBLIC,anon,authenticated,service_role;

-- Reconcile existing empty legacy subscription table found in preflight so
-- school_private.bn_school_entitlements is the single authoritative subscription source.
DO $$
DECLARE
 v_rows bigint := 0;
 v_fks text;
 v_views text;
BEGIN
 IF to_regclass('public.bn_school_subscriptions') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM public.bn_school_subscriptions' INTO v_rows;
  IF v_rows <> 0 THEN
   RAISE EXCEPTION 'public.bn_school_subscriptions has % row(s); reconcile into school_private.bn_school_entitlements before dropping', v_rows;
  END IF;
  SELECT string_agg(c.conname || ' on ' || c.conrelid::regclass::text, ', ') INTO v_fks
  FROM pg_catalog.pg_constraint c
  WHERE c.confrelid = 'public.bn_school_subscriptions'::regclass
    AND c.conrelid <> 'public.bn_school_subscriptions'::regclass;
  IF v_fks IS NOT NULL THEN
   RAISE EXCEPTION 'public.bn_school_subscriptions has dependent foreign keys (%); review before dropping', v_fks;
  END IF;
  SELECT string_agg(DISTINCT r.ev_class::regclass::text, ', ') INTO v_views
  FROM pg_catalog.pg_depend d
  JOIN pg_catalog.pg_rewrite r ON r.oid = d.objid
  WHERE d.refobjid = 'public.bn_school_subscriptions'::regclass
    AND d.classid = 'pg_catalog.pg_rewrite'::regclass
    AND r.ev_class <> 'public.bn_school_subscriptions'::regclass;
  IF v_views IS NOT NULL THEN
   RAISE EXCEPTION 'public.bn_school_subscriptions has dependent views (%); review before dropping', v_views;
  END IF;
  DROP TABLE public.bn_school_subscriptions;
  INSERT INTO school_private.bn_platform_audit(event_type,details)
  VALUES('legacy_subscription_table_retired',jsonb_build_object('table','public.bn_school_subscriptions','row_count',0));
 END IF;
END $$;

CREATE FUNCTION public.bn_activation_attempt(p_bucket text,p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempts integer;
BEGIN
 IF p_bucket IS NULL OR length(p_bucket)<>64 OR p_limit IS NULL OR p_limit<1 OR p_limit>60 THEN
 RETURN false;
 END IF;
 DELETE FROM school_private.bn_activation_attempts WHERE window_start < clock_timestamp()-interval '1 day';
 INSERT INTO school_private.bn_activation_attempts(bucket,window_start,attempts)
 VALUES(p_bucket,clock_timestamp(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 attempts=CASE WHEN school_private.bn_activation_attempts.window_start < clock_timestamp()-interval '15 minutes'
 THEN 1 ELSE school_private.bn_activation_attempts.attempts+1 END,
 window_start=CASE WHEN school_private.bn_activation_attempts.window_start < clock_timestamp()-interval '15 minutes'
 THEN clock_timestamp() ELSE school_private.bn_activation_attempts.window_start END
 RETURNING attempts INTO v_attempts;
 RETURN v_attempts<=p_limit;
END $$;
REVOKE ALL ON FUNCTION public.bn_activation_attempt(text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_activation_attempt(text,integer) TO service_role;

-- The platform operator's trusted server may issue a code. Never give a
-- service_role key to a school owner or expose it in the browser.
CREATE FUNCTION public.bn_issue_school_activation(p_owner_email text,p_actor_uid uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_email text := lower(trim(p_owner_email)); v_code text; v_hash text;
BEGIN
 IF v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' THEN
 RAISE EXCEPTION 'Valid owner email required';
 END IF;
 -- Serialize issuance for the same email and invalidate superseded codes.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 181));
 UPDATE school_private.bn_activation_codes SET revoked_at=clock_timestamp()
 WHERE owner_email=v_email AND redeemed_at IS NULL AND revoked_at IS NULL;
 v_code := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 v_hash := encode(sha256(convert_to(v_code,'UTF8')),'hex');
 INSERT INTO school_private.bn_activation_codes(code_hash,owner_email,expires_at)
 VALUES(v_hash,v_email,now()+interval '7 days');
 INSERT INTO school_private.bn_platform_audit(event_type,actor_uid,owner_email,code_digest_prefix)
 VALUES('activation_issued',p_actor_uid,v_email,left(v_hash,12));
 RETURN v_code;
END $$;
REVOKE ALL ON FUNCTION public.bn_issue_school_activation(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_issue_school_activation(text,uuid) TO service_role;

CREATE FUNCTION public.bn_revoke_school_activation(p_code text,p_actor_uid uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_hash text;
BEGIN
 IF p_code IS NULL OR p_code !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
 v_hash := encode(sha256(convert_to(p_code,'UTF8')),'hex');
 UPDATE school_private.bn_activation_codes SET revoked_at=clock_timestamp()
 WHERE code_hash=v_hash AND redeemed_at IS NULL AND revoked_at IS NULL;
 IF FOUND THEN
 INSERT INTO school_private.bn_platform_audit(event_type,actor_uid,code_digest_prefix)
 VALUES('activation_revoked',p_actor_uid,left(v_hash,12));
 RETURN true;
 END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.bn_revoke_school_activation(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_revoke_school_activation(text,uuid) TO service_role;

-- Keep original registration logic rather than duplicating its tenant logic.
-- Remove all direct browser/authenticated registration access so every signup
-- must flow through the rate-limited school-register-school Edge Function.
ALTER FUNCTION public.register_first_school(text) SET SCHEMA school_private;
ALTER FUNCTION school_private.register_first_school(text) RENAME TO bn_register_first_school_legacy;
REVOKE ALL ON FUNCTION school_private.bn_register_first_school_legacy(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.bn_register_school_for_user(p_owner_uid uuid,p_school_name text,p_activation_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_email text;
 v_hash text;
 v_school uuid;
 v_start timestamptz;
 v_prev_sub text := pg_catalog.current_setting('request.jwt.claim.sub',true);
 v_prev_claims text := pg_catalog.current_setting('request.jwt.claims',true);
BEGIN
 IF p_owner_uid IS NULL THEN RAISE EXCEPTION 'Verified owner required' USING ERRCODE='42501'; END IF;
 SELECT lower(trim(u.email)) INTO v_email FROM auth.users u WHERE u.id=p_owner_uid AND u.email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verified owner email required' USING ERRCODE='42501'; END IF;
 IF p_activation_code IS NULL OR p_activation_code !~ '^[0-9a-f]{64}$' THEN
 RAISE EXCEPTION 'Invalid or unavailable activation code' USING ERRCODE='42501'; END IF;
 -- Serialize registration for this verified account even across distinct codes.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_uid::text, 182));
 v_hash := encode(sha256(convert_to(p_activation_code,'UTF8')),'hex');
 -- Row lock serializes concurrent redemption. No write survives if legacy registration or entitlement insert fails.
 PERFORM 1 FROM school_private.bn_activation_codes c
 WHERE c.code_hash=v_hash AND c.owner_email=v_email AND c.revoked_at IS NULL
 AND c.redeemed_at IS NULL AND c.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or unavailable activation code' USING ERRCODE='42501'; END IF;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',p_owner_uid::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claims',jsonb_build_object('sub',p_owner_uid::text,'role','authenticated')::text,true);
 BEGIN
  v_school := school_private.bn_register_first_school_legacy(p_school_name);
  IF v_school IS NULL OR NOT school_private.has_role(v_school,ARRAY['school_admin']) THEN
  RAISE EXCEPTION 'Registration not confirmed' USING ERRCODE='42501'; END IF;
 EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_prev_sub,''),true);
  PERFORM pg_catalog.set_config('request.jwt.claims',coalesce(v_prev_claims,''),true);
  RAISE;
 END;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_prev_sub,''),true);
 PERFORM pg_catalog.set_config('request.jwt.claims',coalesce(v_prev_claims,''),true);

 v_start := clock_timestamp();
 INSERT INTO school_private.bn_school_entitlements(institution_id,plan,starts_at,ends_at)
 VALUES(v_school,'trial',v_start,v_start+interval '720 hours');
 UPDATE school_private.bn_activation_codes SET redeemed_at=v_start,redeemed_by=p_owner_uid,institution_id=v_school
 WHERE code_hash=v_hash;
 INSERT INTO school_private.bn_platform_audit(event_type,actor_uid,owner_email,institution_id,code_digest_prefix)
 VALUES('school_registered',p_owner_uid,v_email,v_school,left(v_hash,12));
 RETURN v_school;
END $$;
REVOKE ALL ON FUNCTION public.bn_register_school_for_user(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_register_school_for_user(uuid,text,text) TO service_role;

CREATE FUNCTION public.bn_school_trial_status(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 e school_private.bn_school_entitlements%ROWTYPE;
 v_now timestamptz:=clock_timestamp();
 v_days integer;
 v_milestone integer;
 v_new_milestone integer;
BEGIN
 IF auth.uid() IS NULL OR NOT school_private.has_role(p_institution_id,ARRAY['school_admin','principal']) THEN
 RAISE EXCEPTION 'School access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM school_private.bn_school_entitlements WHERE institution_id=p_institution_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unassigned','server_time',v_now); END IF;
 IF v_now < e.ends_at THEN
 v_days := greatest(0, ceil(extract(epoch FROM (e.ends_at - v_now)) / 86400.0)::integer);
 v_milestone := CASE WHEN v_days <= 1 THEN 1 WHEN v_days <= 3 THEN 3 WHEN v_days <= 7 THEN 7 ELSE NULL END;
 IF v_milestone IS NOT NULL THEN
 INSERT INTO school_private.bn_trial_reminders(institution_id,ends_at,milestone_days)
 VALUES(p_institution_id,e.ends_at,v_milestone)
 ON CONFLICT DO NOTHING
 RETURNING milestone_days INTO v_new_milestone;
 IF v_new_milestone IS NOT NULL THEN
 INSERT INTO school_private.bn_platform_audit(event_type,actor_uid,institution_id,details)
 VALUES('trial_reminder_recorded',auth.uid(),p_institution_id,jsonb_build_object('milestone_days',v_new_milestone,'ends_at',e.ends_at));
 END IF;
 END IF;
 END IF;
 RETURN jsonb_build_object(
 'status',CASE WHEN v_now>=e.ends_at THEN 'expired' ELSE e.plan END,
 'starts_at',e.starts_at,'ends_at',e.ends_at,'server_time',v_now,
 'milestone_days',v_milestone,'new_reminder_milestone',v_new_milestone
 );
END $$;
REVOKE ALL ON FUNCTION public.bn_school_trial_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_school_trial_status(uuid) TO authenticated;

CREATE FUNCTION school_private.bn_school_is_writable(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS (
 SELECT 1 FROM school_private.bn_school_entitlements e
 WHERE e.institution_id=p_school AND clock_timestamp()>=e.ends_at
 );
$$;
REVOKE ALL ON FUNCTION school_private.bn_school_is_writable(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.bn_school_writable(p_institution_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR (
 NOT school_private.has_role(p_institution_id,ARRAY['school_admin','principal','teacher','accountant','librarian','receptionist','transport_staff'])
 AND NOT school_private.parent_in_school(p_institution_id)
 )) THEN
 RAISE EXCEPTION 'School access denied' USING ERRCODE='42501';
 END IF;
 RETURN school_private.bn_school_is_writable(p_institution_id);
END $$;
REVOKE ALL ON FUNCTION public.bn_school_writable(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_school_writable(uuid) TO authenticated,service_role;

CREATE FUNCTION public.bn_assign_school_entitlement(p_institution_id uuid,p_plan text DEFAULT 'active',p_days integer DEFAULT 30,p_actor_uid uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_plan NOT IN ('trial','active') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
 IF p_days IS NULL OR p_days<1 OR p_days>366 THEN RAISE EXCEPTION 'Invalid entitlement duration'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id=p_institution_id) THEN RAISE EXCEPTION 'School not found'; END IF;
 IF EXISTS (SELECT 1 FROM school_private.bn_school_entitlements WHERE institution_id=p_institution_id) THEN
 RAISE EXCEPTION 'Entitlement already assigned; use renewal'; END IF;
 INSERT INTO school_private.bn_school_entitlements(institution_id,plan,starts_at,ends_at)
 VALUES(p_institution_id,p_plan,v_now,v_now+make_interval(hours=>24*p_days));
 INSERT INTO school_private.bn_platform_audit(event_type,actor_uid,institution_id,details)
 VALUES('entitlement_assigned',p_actor_uid,p_institution_id,jsonb_build_object('plan',p_plan,'days',p_days));
END $$;
REVOKE ALL ON FUNCTION public.bn_assign_school_entitlement(uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_assign_school_entitlement(uuid,text,integer,uuid) TO service_role;

CREATE FUNCTION public.bn_renew_school_entitlement(p_institution_id uuid,p_days integer,p_actor_uid uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_days IS NULL OR p_days<1 OR p_days>366 THEN RAISE EXCEPTION 'Invalid renewal duration'; END IF;
 UPDATE school_private.bn_school_entitlements SET plan='active',
 starts_at=CASE WHEN ends_at<=v_now THEN v_now ELSE starts_at END,
 ends_at=greatest(ends_at,v_now)+make_interval(hours=>24*p_days),updated_at=v_now
 WHERE institution_id=p_institution_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'No entitlement found'; END IF;
 INSERT INTO school_private.bn_platform_audit(event_type,actor_uid,institution_id,details)
 VALUES('entitlement_renewed',p_actor_uid,p_institution_id,jsonb_build_object('days',p_days));
END $$;
REVOKE ALL ON FUNCTION public.bn_renew_school_entitlement(uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_renew_school_entitlement(uuid,integer,uuid) TO service_role;

-- Super Admin platform operator listing and digest-prefix revocation (service_role only).
CREATE FUNCTION public.bn_list_school_activations(p_limit integer DEFAULT 100)
RETURNS TABLE(
 code_digest_prefix text,
 owner_email text,
 issued_at timestamptz,
 expires_at timestamptz,
 revoked_at timestamptz,
 redeemed_at timestamptz,
 institution_id uuid,
 school_name text,
 status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT left(c.code_hash,12) AS code_digest_prefix,
  c.owner_email,c.issued_at,c.expires_at,c.revoked_at,c.redeemed_at,c.institution_id,
  i.name AS school_name,
  CASE
   WHEN c.redeemed_at IS NOT NULL THEN 'redeemed'
   WHEN c.revoked_at IS NOT NULL THEN 'revoked'
   WHEN clock_timestamp()>=c.expires_at THEN 'expired'
   ELSE 'active'
  END AS status
 FROM school_private.bn_activation_codes c
 LEFT JOIN public.institutions i ON i.id=c.institution_id
 ORDER BY c.issued_at DESC
 LIMIT greatest(1,least(coalesce(p_limit,100),500));
$$;
REVOKE ALL ON FUNCTION public.bn_list_school_activations(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_list_school_activations(integer) TO service_role;

CREATE FUNCTION public.bn_revoke_school_activation_by_prefix(p_code_prefix text,p_owner_email text,p_actor_uid uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_email text := lower(trim(p_owner_email)); v_hash text;
BEGIN
 IF p_code_prefix IS NULL OR p_code_prefix !~ '^[0-9a-f]{12}$' OR v_email IS NULL OR v_email='' THEN
  RETURN false;
 END IF;
 SELECT c.code_hash INTO v_hash
 FROM school_private.bn_activation_codes c
 WHERE left(c.code_hash,12)=p_code_prefix AND c.owner_email=v_email
  AND c.redeemed_at IS NULL AND c.revoked_at IS NULL
 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE school_private.bn_activation_codes SET revoked_at=clock_timestamp()
 WHERE code_hash=v_hash AND redeemed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO school_private.bn_platform_audit(event_type,actor_uid,owner_email,code_digest_prefix)
 VALUES('activation_revoked',p_actor_uid,v_email,p_code_prefix);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bn_revoke_school_activation_by_prefix(text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_revoke_school_activation_by_prefix(text,text,uuid) TO service_role;

CREATE FUNCTION public.bn_list_school_entitlements(p_limit integer DEFAULT 200)
RETURNS TABLE(
 institution_id uuid,
 name text,
 institution_status text,
 plan text,
 starts_at timestamptz,
 ends_at timestamptz,
 effective_status text,
 days_remaining integer,
 milestones_sent integer[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT i.id AS institution_id,i.name,(to_jsonb(i)->>'status')::text AS institution_status,
  e.plan,e.starts_at,e.ends_at,
  CASE
   WHEN e.institution_id IS NULL THEN 'unassigned'
   WHEN clock_timestamp()>=e.ends_at THEN 'expired'
   ELSE e.plan
  END AS effective_status,
  CASE
   WHEN e.institution_id IS NULL THEN NULL
   ELSE greatest(0,ceil(extract(epoch FROM (e.ends_at-clock_timestamp()))/86400.0)::integer)
  END AS days_remaining,
  coalesce((
   SELECT array_agg(r.milestone_days ORDER BY r.milestone_days)
   FROM school_private.bn_trial_reminders r
   WHERE r.institution_id=i.id AND r.ends_at=e.ends_at
  ),ARRAY[]::integer[]) AS milestones_sent
 FROM public.institutions i
 LEFT JOIN school_private.bn_school_entitlements e ON e.institution_id=i.id
 ORDER BY i.name NULLS LAST,i.id
 LIMIT greatest(1,least(coalesce(p_limit,200),500));
$$;
REVOKE ALL ON FUNCTION public.bn_list_school_entitlements(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_list_school_entitlements(integer) TO service_role;

CREATE FUNCTION public.bn_list_platform_audit(p_limit integer DEFAULT 100)
RETURNS TABLE(
 id uuid,
 event_type text,
 actor_uid uuid,
 owner_email text,
 institution_id uuid,
 code_digest_prefix text,
 details jsonb,
 created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id,a.event_type,a.actor_uid,a.owner_email,a.institution_id,a.code_digest_prefix,a.details,a.created_at
 FROM school_private.bn_platform_audit a
 ORDER BY a.created_at DESC,a.id
 LIMIT greatest(1,least(coalesce(p_limit,100),500));
$$;
REVOKE ALL ON FUNCTION public.bn_list_platform_audit(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bn_list_platform_audit(integer) TO service_role;

-- Enforce expiry across tables, private WordPress/alert tables, and Storage
-- even inside SECURITY DEFINER RPCs.
CREATE FUNCTION school_private.bn_assert_school_writable(p_school uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_end timestamptz;
BEGIN
 SELECT ends_at INTO v_end FROM school_private.bn_school_entitlements
 WHERE institution_id=p_school FOR SHARE;
 IF FOUND AND clock_timestamp()>=v_end THEN
 RAISE EXCEPTION 'Subscription expired: school is read-only. Contact Bright Nexa.' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION school_private.bn_assert_school_writable(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION school_private.bn_guard_trial_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
 PERFORM school_private.bn_assert_school_writable(OLD.institution_id);
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
 PERFORM school_private.bn_assert_school_writable(NEW.institution_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION school_private.bn_guard_trial_write() FROM PUBLIC,anon,authenticated,service_role;

-- Allow incoming Meta webhook delivery callbacks and in-flight worker outcome
-- reconciliation to update previously dispatched WhatsApp recipient status
-- while blocking new queued claims, inserts, or deletes on expired schools.
CREATE FUNCTION school_private.bn_guard_whatsapp_recipient_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE'
  AND NEW.id=OLD.id
  AND NEW.institution_id=OLD.institution_id
  AND NEW.batch_id=OLD.batch_id
  AND NEW.student_id=OLD.student_id
  AND NEW.phone=OLD.phone
  AND NEW.parameters=OLD.parameters
  AND (
   (OLD.state IN ('processing','accepted','sent','delivered','unknown')
    AND NEW.state IN ('accepted','sent','delivered','read','failed','unknown')
    AND NEW.attempt_id IS NOT DISTINCT FROM OLD.attempt_id)
   OR (OLD.state='processing' AND NEW.state='unknown')
  ) THEN
  RETURN NEW;
 END IF;
 IF TG_OP IN ('UPDATE','DELETE') THEN
  PERFORM school_private.bn_assert_school_writable(OLD.institution_id);
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  PERFORM school_private.bn_assert_school_writable(NEW.institution_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION school_private.bn_guard_whatsapp_recipient_write() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION school_private.bn_guard_institution_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM school_private.bn_assert_school_writable(OLD.id);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 PERFORM school_private.bn_assert_school_writable(NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION school_private.bn_guard_institution_write() FROM PUBLIC,anon,authenticated,service_role;

-- Restrictive Storage policy helper: no direct entitlement disclosure to outsiders.
CREATE FUNCTION school_private.bn_storage_school_writable(p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_prefix text:=split_part(p_path,'/',1); v_school uuid;
BEGIN
 IF v_prefix IS NULL OR v_prefix !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RETURN false;
 END IF;
 v_school:=v_prefix::uuid;
 RETURN school_private.has_role(v_school,ARRAY['school_admin','principal','teacher'])
 AND school_private.bn_school_is_writable(v_school);
END $$;
REVOKE ALL ON FUNCTION school_private.bn_storage_school_writable(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION school_private.bn_storage_school_writable(text) TO authenticated;

DO $$
DECLARE rec record;
BEGIN
 IF to_regclass('public.institutions') IS NOT NULL THEN
 EXECUTE 'DROP TRIGGER IF EXISTS bn_trial_institution_guard ON public.institutions';
 EXECUTE 'CREATE TRIGGER bn_trial_institution_guard BEFORE UPDATE OR DELETE ON public.institutions FOR EACH ROW EXECUTE FUNCTION school_private.bn_guard_institution_write()';
 END IF;
 IF to_regclass('public.school_whatsapp_recipients') IS NOT NULL THEN
 EXECUTE 'DROP TRIGGER IF EXISTS bn_trial_wa_recipient_guard ON public.school_whatsapp_recipients';
 EXECUTE 'CREATE TRIGGER bn_trial_wa_recipient_guard BEFORE INSERT OR UPDATE OR DELETE ON public.school_whatsapp_recipients FOR EACH ROW EXECUTE FUNCTION school_private.bn_guard_whatsapp_recipient_write()';
 END IF;
 FOR rec IN
 SELECT n.nspname AS schema_name,c.relname AS table_name
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname IN ('public','school_private') AND c.relkind IN ('r','p')
 AND a.attname='institution_id' AND a.atttypid='uuid'::regtype AND NOT a.attisdropped
 AND NOT (n.nspname='school_private' AND c.relname IN ('bn_activation_codes','bn_school_entitlements','bn_activation_attempts','bn_trial_reminders','bn_platform_audit'))
 AND NOT (n.nspname='public' AND c.relname IN ('school_whatsapp_events','school_whatsapp_recipients'))
 LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS bn_trial_write_guard ON %I.%I',rec.schema_name,rec.table_name);
 EXECUTE format('CREATE TRIGGER bn_trial_write_guard BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION school_private.bn_guard_trial_write()',rec.schema_name,rec.table_name);
 END LOOP;

 IF to_regclass('storage.objects') IS NOT NULL THEN
 EXECUTE 'DROP POLICY IF EXISTS bn_trial_storage_insert_guard ON storage.objects';
 EXECUTE 'DROP POLICY IF EXISTS bn_trial_storage_update_guard ON storage.objects';
 EXECUTE 'DROP POLICY IF EXISTS bn_trial_storage_delete_guard ON storage.objects';
 EXECUTE $p$CREATE POLICY bn_trial_storage_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (bucket_id NOT IN ('school-homework','school-student-photos') OR school_private.bn_storage_school_writable(name))$p$;
 EXECUTE $p$CREATE POLICY bn_trial_storage_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (bucket_id NOT IN ('school-homework','school-student-photos') OR school_private.bn_storage_school_writable(name)) WITH CHECK (bucket_id NOT IN ('school-homework','school-student-photos') OR school_private.bn_storage_school_writable(name))$p$;
 EXECUTE $p$CREATE POLICY bn_trial_storage_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (bucket_id NOT IN ('school-homework','school-student-photos') OR school_private.bn_storage_school_writable(name))$p$;
 END IF;
END $$;

COMMIT;
