-- READ ONLY. Run only on the authorized School OS project before migration.
-- No school/student records or credentials are selected.
SELECT n.nspname AS schema_name,c.relname AS table_name,c.relrowsecurity AS rls_enabled,
       EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='institution_id' AND NOT a.attisdropped) AS has_institution_id
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','school_private','storage') AND c.relkind IN ('r','p')
ORDER BY 1,2;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN ('public','school_private','storage') ORDER BY 1,2,3;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','school_private') ORDER BY 1,2,3;
SELECT pg_get_functiondef(to_regprocedure('public.register_first_school(text)')) AS current_registration_rpc;

-- Reconcile check for legacy empty subscription table reported in production preflight.
SELECT to_regclass('public.bn_school_subscriptions') AS bn_school_subscriptions_oid;
SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull
FROM pg_attribute a
WHERE a.attrelid = to_regclass('public.bn_school_subscriptions') AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = to_regclass('public.bn_school_subscriptions')
   OR confrelid = to_regclass('public.bn_school_subscriptions');
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','school_private')
  AND pg_get_functiondef(p.oid) ILIKE '%bn_school_subscriptions%';
DO $$
DECLARE n_rows bigint;
BEGIN
  IF to_regclass('public.bn_school_subscriptions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.bn_school_subscriptions' INTO n_rows;
    RAISE NOTICE 'public.bn_school_subscriptions row count = %', n_rows;
  END IF;
END $$;
