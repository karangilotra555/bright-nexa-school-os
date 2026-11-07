-- Normalize blank optional guardian fields during authorized school ERP cloud publishing.
-- Historical production failures: bn_student_profile_guardian_len (SQLSTATE 23514).
-- Retain original admin auth, school tenancy, RLS, revision, and data-reconciliation logic.
-- Idempotent: this can be reapplied safely to existing patched deployments.
DO $migration$
DECLARE
  source_sql text;
  corrected text;
BEGIN
  SELECT pg_get_functiondef('public.school_workspace_push(uuid,bigint,jsonb,jsonb)'::regprocedure) INTO source_sql;
  IF source_sql IS NULL
     OR position('e#>>''{profile,guardian_name}''' in source_sql) = 0
     OR position('e#>>''{profile,guardian_phone}''' in source_sql) = 0
  THEN
    RAISE EXCEPTION 'Unexpected school_workspace_push definition; safe migration cancelled';
  END IF;

  corrected := source_sql;
  IF position('nullif(btrim(e#>>''{profile,guardian_name}''), '''')' in source_sql) = 0 THEN
    corrected := replace(corrected,
      'e#>>''{profile,guardian_name}''',
      'nullif(btrim(e#>>''{profile,guardian_name}''), '''')');
  END IF;
  IF position('nullif(btrim(e#>>''{profile,guardian_phone}''), '''')' in source_sql) = 0 THEN
    corrected := replace(corrected,
      'e#>>''{profile,guardian_phone}''',
      'nullif(btrim(e#>>''{profile,guardian_phone}''), '''')');
  END IF;
  IF corrected <> source_sql THEN
    EXECUTE corrected;
  END IF;
END $migration$;
