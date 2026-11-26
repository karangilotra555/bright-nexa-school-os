-- Safe Dependency-Ordered Rollback for Phase 1 / Phase 2 trial & activation migration.
-- Works cleanly whether only Phase 1 ran OR Phase 1 + Phase 2 lockdown both ran.
-- Retains `school_private.bn_*` audit/entitlement tables (non-destructive; zero data loss).
BEGIN;

DROP TRIGGER IF EXISTS bn_trial_institution_guard ON public.institutions;
DROP TRIGGER IF EXISTS bn_trial_wa_recipient_guard ON public.school_whatsapp_recipients;
DO $$
DECLARE r record;
BEGIN
 FOR r IN
  SELECT n.nspname,c.relname
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE t.tgname='bn_trial_write_guard'
 LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS bn_trial_write_guard ON %I.%I',r.nspname,r.relname);
 END LOOP;
END $$;

DROP POLICY IF EXISTS bn_trial_storage_insert_guard ON storage.objects;
DROP POLICY IF EXISTS bn_trial_storage_update_guard ON storage.objects;
DROP POLICY IF EXISTS bn_trial_storage_delete_guard ON storage.objects;

DROP FUNCTION IF EXISTS public.bn_register_school_for_user(uuid,text,text);
DROP FUNCTION IF EXISTS public.register_first_school(text,text);
DROP FUNCTION IF EXISTS public.register_first_school(text);

DO $$
BEGIN
 IF pg_catalog.to_regprocedure('school_private.bn_register_first_school_legacy(text)') IS NOT NULL THEN
  ALTER FUNCTION school_private.bn_register_first_school_legacy(text) SET SCHEMA public;
  ALTER FUNCTION public.bn_register_first_school_legacy(text) RENAME TO register_first_school;
 END IF;
 IF pg_catalog.to_regprocedure('public.register_first_school(text)') IS NOT NULL THEN
  REVOKE ALL ON FUNCTION public.register_first_school(text) FROM PUBLIC,anon,authenticated,service_role;
  GRANT EXECUTE ON FUNCTION public.register_first_school(text) TO authenticated;
 END IF;
END $$;

DROP FUNCTION IF EXISTS public.bn_school_trial_status(uuid);
DROP FUNCTION IF EXISTS public.bn_school_writable(uuid);
DROP FUNCTION IF EXISTS public.bn_activation_attempt(text,integer);
DROP FUNCTION IF EXISTS public.bn_issue_school_activation(text,uuid);
DROP FUNCTION IF EXISTS public.bn_revoke_school_activation(text,uuid);
DROP FUNCTION IF EXISTS public.bn_revoke_school_activation_by_prefix(text,text,uuid);
DROP FUNCTION IF EXISTS public.bn_list_school_activations(integer);
DROP FUNCTION IF EXISTS public.bn_assign_school_entitlement(uuid,text,integer,uuid);
DROP FUNCTION IF EXISTS public.bn_renew_school_entitlement(uuid,integer,uuid);
DROP FUNCTION IF EXISTS public.bn_list_school_entitlements(integer);
DROP FUNCTION IF EXISTS public.bn_list_platform_audit(integer);

DROP FUNCTION IF EXISTS school_private.bn_storage_school_writable(text);
DROP FUNCTION IF EXISTS school_private.bn_school_is_writable(uuid);
DROP FUNCTION IF EXISTS school_private.bn_assert_school_writable(uuid);
DROP FUNCTION IF EXISTS school_private.bn_guard_trial_write();
DROP FUNCTION IF EXISTS school_private.bn_guard_whatsapp_recipient_write();
DROP FUNCTION IF EXISTS school_private.bn_guard_institution_write();

COMMIT;
