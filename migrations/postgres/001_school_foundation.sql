-- Bright Nexa School OS: dedicated Postgres database bootstrap.
-- Apply ONLY to a NEW school-specific database, never the existing CRM/hotel database.
-- Migration 001: tenant-scoped foundations. No demo data.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS institutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(trim(name)) > 0),
 status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended','closed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS school_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
 email text NOT NULL,
 password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('school_admin','principal','accountant','teacher','receptionist')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (institution_id, email)
);
CREATE TABLE IF NOT EXISTS school_classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
 name text NOT NULL,
 section text NOT NULL DEFAULT '',
 academic_year text NOT NULL,
 UNIQUE (institution_id,name,section,academic_year),
 UNIQUE (id,institution_id)
);
CREATE TABLE IF NOT EXISTS school_students (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
 class_id uuid,
 admission_number text NOT NULL,
 name text NOT NULL,
 dob date,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','transferred','graduated','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (institution_id, admission_number),
 FOREIGN KEY (class_id,institution_id) REFERENCES school_classes(id,institution_id)
);
CREATE TABLE IF NOT EXISTS school_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
 actor_id uuid REFERENCES school_users(id) ON DELETE SET NULL,
 action text NOT NULL,
 entity text NOT NULL,
 entity_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_students_tenant_class_idx ON school_students(institution_id,class_id);
CREATE INDEX IF NOT EXISTS school_audit_tenant_created_idx ON school_audit_events(institution_id,created_at DESC);

-- Fail closed for browser/direct PostgREST clients until explicit reviewed
-- tenant-isolation policies and auth identity mapping are deployed.
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions FORCE ROW LEVEL SECURITY;
ALTER TABLE school_users FORCE ROW LEVEL SECURITY;
ALTER TABLE school_classes FORCE ROW LEVEL SECURITY;
ALTER TABLE school_students FORCE ROW LEVEL SECURITY;
ALTER TABLE school_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON institutions,school_users,school_classes,school_students,school_audit_events FROM PUBLIC;
COMMIT;
