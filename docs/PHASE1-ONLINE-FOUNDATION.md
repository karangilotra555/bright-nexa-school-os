# Phase 1 — Online-only School OS foundation

Status: STARTED. No production school data migration or paid infrastructure provisioned.

## Confirmed infrastructure
- Frontend: Render static site bright-nexa-school-os, publishes docs/.
- API: Render web service bright-nexa-school-os-api, currently separate origin.
- Existing Node server: server.js uses local SQLite (data/school.db). Render free instance filesystem is not a durable shared database.
- Existing connected Supabase project contains CRM/hotel tables; DO NOT reuse it for school tenants.
- Static portal currently runs isolated demo mode; production auth is NOT connected.

## Architecture decision
1. Use a dedicated school database (separate Supabase project or managed Postgres).
2. Keep server-side sessions and roles. Never expose service-role keys to the browser.
3. Each school-owned row has institution_id, enforced at query and database policy layers.
4. Roles: platform_admin, school_admin, principal, accountant, teacher, receptionist. Apply least privilege.
5. Login with server-issued session; password hashes and reset flow; rate limiting and audit logs.
6. Move student records and school settings into transactional database APIs; do not use localStorage as source of truth.
7. Use durable backups and perform a restore drill before onboarding a real school.
8. Preserve existing demo in isolation until migration is tested. No fake production claims.

## Proposed tables (first migration)
institutions(id, name, status, created_at)
school_users(id, institution_id, email, password_hash, role, status, created_at)
students(id, institution_id, admission_number, name, class_id, dob, status, created_at, updated_at)
classes(id, institution_id, name, section, academic_year)
audit_events(id, institution_id, actor_id, action, entity, entity_id, created_at)
Unique index on (institution_id, admission_number).
Enforce foreign keys and tenant checks for every read/write. Use soft deletion or archival for student records.

## Release gates
- [ ] Provision isolated durable database; confirm pricing before provisioning
- [ ] Apply versioned migrations and test school A cannot access school B
- [ ] Connect Render API to durable database without leaking credentials
- [ ] Build school onboarding and secure role-based login
- [ ] Migrate admissions CRUD and verify concurrent multi-user edits
- [ ] Set up backup, restore, logs and error monitoring
- [ ] Connect static frontend to API; remove demo-only restriction only after full regression test
- [ ] Test desktop, mobile, slow connection, logout, expired session, unauthorized access

Do not call Phase 1 production-ready until all gates pass.
