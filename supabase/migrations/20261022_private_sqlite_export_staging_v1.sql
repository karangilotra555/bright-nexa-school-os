-- Bright Nexa: private staging for a verified export of legacy SQLite records.
-- NOT a replacement for tenant-aware production tables. Staged rows cannot be
-- accessed via the public Data API and are never used for parent DOB login.
CREATE SCHEMA IF NOT EXISTS school_migration;
REVOKE ALL ON SCHEMA school_migration FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS school_migration.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label text NOT NULL CHECK (length(source_label) BETWEEN 3 AND 120),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  expected_counts jsonb NOT NULL,
  target_institution_id uuid NULL REFERENCES public.institutions(id),
  state text NOT NULL DEFAULT 'staged'
    CHECK (state IN ('staged','verified','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_label, content_sha256)
);

CREATE TABLE IF NOT EXISTS school_migration.import_rows (
  batch_id uuid NOT NULL REFERENCES school_migration.import_batches(id) ON DELETE RESTRICT,
  source_table text NOT NULL CHECK (source_table IN ('institution','students','audit_logs','rate_limits')),
  source_key text NOT NULL,
  row_sha256 text NOT NULL CHECK (row_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_table, source_key)
);
CREATE INDEX IF NOT EXISTS legacy_import_rows_table_idx
 ON school_migration.import_rows(batch_id, source_table);

ALTER TABLE school_migration.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_migration.import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA school_migration FROM PUBLIC, anon, authenticated;
-- No client RLS policies: only trusted direct PostgreSQL administrators can
-- perform an audited staging import. Never publish these PII-rich tables.
