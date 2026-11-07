# ERP Integration Audit — 7 November 2026

**Scope:** Bright Nexa School OS, non-destructive read-only inspection of the connected Supabase School OS database and current GitHub `main` code. No student records or production school settings were altered.

## Sources of truth

- Supabase Postgres is the intended canonical school data store (`AGENTS.md`).
- Main ERP React app still initially reads local IndexedDB/localStorage and only uses the cloud workspace after explicitly binding/opening a school.
- Cloud Staff and Parent Portals read relational Supabase tables under RLS.
- The legacy Node/Render API still uses a separate SQLite database, including its own student roster and a separate parent dashboard/publication route. Do **not** treat it as the canonical store.

## Observed, read-only baseline

| Area | Cloud state as observed |
| --- | --- |
| Institutions | 1 |
| Student rows | 34; all active and assigned to a class; unique admission numbers |
| Classes | 20 |
| Attendance | 2; valid student/class references |
| Student detailed profiles | 1 |
| Staff directory | 20 entries; **all marked `is_seeded_test`**, none linked to `school_users` |
| Staff auth accounts | 2 active accounts (admin + teacher) |
| Class-teacher assignments | 1 |
| Guardian-student links | 1; references valid |
| Fee entries, homework, notices | 0 / 0 / 0 |
| Workspace snapshot | NULL, revision 0 |
| Workspace entity links | 0 |
| Cloud Storage objects | 0 |
| Students with DOB | 20 of 34 |

These values can change. Recheck before any migration. The absence of cloud files does not prove whether a local browser contains images.

## Confirmed integration blocker

A `NULL` `school_workspaces.snapshot` **does not mean an empty school**. The main ERP currently presents an "Import this device into empty workspace" action even when Supabase already has relational data.

The first upload's `school_workspace_push` may resolve students by admission number and update existing student/profile/class fields, despite having no complete cloud snapshot to reconcile. Existing parent/attendance records or separate local records may then diverge.

PR #61 adds a database-side **fail-closed** guard for first imports into schools already containing relational records. This prevents accidental overwrite but does **not** complete reconciliation. It must be tested/reviewed and applied as a migration before relying on the guard in production.

## Integration repair order — preserve the approved design

1. **Backup and inventory.** Produce a verified, restorable Supabase snapshot and separate local-device export, with metadata on counts and tenant IDs. Never store student PII, photos, keys or passwords in GitHub, issues or audit logs.
2. **Read-only reconciliation.** Match classes by full class+section+academic year; students by tenant+admission ID; reconcile their immutable UUIDs; identify local-only entries and cloud-only entries. Do not guess matches by names.
3. **Populate a canonical workspace deliberately.** Explicit one-time, admin-approved migration in a database transaction. Preserve existing class/student UUIDs, attendance, guardians, profiles, fees and staff memberships. Ensure `school_workspace_links` maps local IDs to the correct existing cloud rows. No demo seed imports. Verify post-migration counts and restoreability before enabling bidirectional sync.
4. **Unify modules progressively.** Connect ERP student edit, photo upload, teachers/staff, attendance, homework, fees and marks to tenant-scoped cloud APIs. A single save must be visible to Staff and Parent Portals upon refresh; UI cache is not authoritative.
5. **Files.** Store photos/docs in private tenant-scoped Supabase Storage; DB holds metadata/path. Validate uploads and RLS; avoid putting base64 photos in public URLs or GitHub.
6. **Parent/teacher acceptance.** Use isolated test records and separate identities, test assigned/unassigned classes, parent-only child access and cross-school reads. Confirm name, profile, photo, attendance and fees propagate across devices.
7. **Offline/restart/rollback.** Test offline queue and conflicting writes; automatic backups and restore; confirm local SQLite loss on Render free instance cannot remove real records.

## Do-not-claim checks

- 34 cloud students != 34 students successfully rendered in the main desktop ERP.
- Passing unit tests != live device A -> device B sync.
- 20 staff profiles != 20 login-capable staff (current directory rows are seeded test data).
- Cloud Storage objects 0 != successful cloud photo sync.
- Zero fee records != zero locally entered fees or cleared dues.
- PR #61 passing CI != deployed Supabase migration.

## Release gates

Do not merge PR #61 or begin migrating live school data until a backed-up reconciliation plan has been explicitly approved. Track overlapping PR #59 (admin token and student login hardening) and PR #60 (AI Teacher Tools) independently.
