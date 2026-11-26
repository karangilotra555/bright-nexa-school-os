-- Phase 2 (Contract Cutover): Run ONLY AFTER Edge Functions (`school-register-school`)
-- and PR #182 Render deployment (`teacher-access.js`) are verified live in production.
-- Removes the temporary 1-arg compatibility RPC so all registrations must use
-- email-bound activation codes and rate-limited `school-register-school`.
BEGIN;
DO $$
BEGIN
 IF pg_catalog.to_regprocedure('public.bn_register_school_for_user(uuid,text,text)') IS NULL
 OR pg_catalog.to_regprocedure('school_private.bn_register_first_school_legacy(text)') IS NULL THEN
  RAISE EXCEPTION 'Run Phase 1 (activation_trial_staging.sql) before locking down legacy registration RPC';
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.register_first_school(text) FROM PUBLIC,anon,authenticated,service_role;
DROP FUNCTION IF EXISTS public.register_first_school(text);

INSERT INTO school_private.bn_platform_audit(event_type,details)
VALUES('legacy_registration_rpc_locked_down',jsonb_build_object('function','public.register_first_school(text)'));
COMMIT;
