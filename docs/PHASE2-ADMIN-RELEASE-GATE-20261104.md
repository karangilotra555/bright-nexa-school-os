# Phase 2 — School Administration: Implementation & Release Gate
Updated: 2026-11-04. Branch: `phase2/school-admin-20261104` (based on Phase 1 draft).

## Requirements retained
- Preserve Haridwar Public School records, its 24-menu owner sidebar and currently connected modules; do not re-enable old sample/demo login.
- This PR does not modify the live Supabase database, and Render production still points at `main`. Phase 1 itself remains a draft.
- Authorisation and tenant isolation stay server-side via Supabase Auth + Row Level Security. Publishable key is the only browser key.

## Initial working code (not yet browser-pilot approved)
- Students: create, edit name/admission number/DOB/class/status; archive and reactivate instead of hard-deleting children/attendance/fee history. Archived students are included in the owner register but excluded from active student counts and selection.
- Staff: create/edit names, designation, and permanent/contract/part-time/visiting employment fields; login access and roles remain separate.
- Classes & sections: create/edit with unchanged class IDs, duplicate check, existing-name concurrency filter and server acknowledgement; no destructive class deletion.
- Attendance: existing live attendance mark/update flow retained; server response checked for exact row before treating a request as saved.
- Fees: existing append-only financial ledger retained, with complete paginated reads for owner totals rather than truncating at the first 1,000 entries. Payments still need an idempotency key, duplicate detection and reconciliation before offline write support.
- Module records: existing generic forms and Edit/Delete retained. Create/Update/Delete now require returned rows to confirm the server performed the action rather than silently claiming success on an RLS-denied no-op.
- Paging: classes, students, staff, fees and generic module records are loaded in deterministic 500-row tenant-scoped pages. Exceeding 40,000 records throws an explicit incomplete-data error; it must not silently undercount.
- Offline: encrypted snapshots now include archived students and updated owner shell JS. **Offline editing remains disabled.**

## Unfinished Phase 2 modules & verification
1. Real browser end-to-end save/edit/archive/reactivate tests on a non-production school (class assignments, fees, unique admissions, concurrent stale edit).
2. Teacher class assignment, teacher role access, leaves, full attendance workflow and parent identity linking verification with real invited test accounts.
3. Excel bulk import with validation, preview/rollback, duplicate reporting, correct per-school permissions; teacher/mark/report exports including CSV formula injection protection.
4. Examination grading schemes, promotion history, comprehensive report cards and timetable/substitute integration in the authoritative cloud schema (existing UI placeholders are not database parity).
5. Fee receipts, reversals (never hard delete payments), reconciliation, immutable audit trail, server idempotency for offline sync.
6. Privacy and statutory review, access and retention policies; school-level backup and **verified restore**, which remain Phase 1 blockers.
7. Accurate attendance/report data across long date ranges using server-side aggregates or filtered pagination; the current dashboard loads only the most recent 200 attendance entries.
8. Mobile/desktop, offline/read-only, cross-school, permissions, and accessibility regression testing. CI unit tests are necessary but do not prove complete real-world operation.

## Acceptance procedure
- Confirm no changes or new fees/students occurred in production from this development PR.
- Run the complete GitHub Actions test suite and verify new student/staff/class CRUD tests.
- Restore a private backup to an isolated environment; test two-school RLS and zero-row update errors.
- On pilot school, create a child, edit DOB, archive/reactivate; confirm fee/attendance history remains; test concurrent conflict instead of silent overwrites.
- Pilot staff contract/part-time edit and class rename; ensure teacher assignments and existing IDs persist.
- Verify fee totals with 1,201+ rows and no duplicate payments on a simulated network retry.
- Merge only after Phase 1 security/backup acceptance and browser tests; this document is not a production sign-off.
