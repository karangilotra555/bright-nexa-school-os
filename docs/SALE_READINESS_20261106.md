# Sale readiness and fixes — 6 November 2026

Baseline: GitHub `8fd0904ce5ac31d6d75f9400fc750b216321642e`.
Verdict: not yet verified for a general production sale.

## Implemented in this change

- Teacher attendance starts unmarked unless a saved server status exists.
- Save rejects unmarked/invalid statuses; an explicit bulk action marks only
  remaining students present and preserves absent/late/excused selections.
- Root and hosted teacher portal copies remain identical.
- LF checkout attributes preserve precached asset hashes on Windows.
- Attendance DOM harness accepts CRLF source. Both preservation scripts use the
  user-selected current GitHub baseline, preserving subsequent class-filter and
  WhatsApp UI changes. Fee profile navigation is tested using its current label.

## Verification evidence

- `npm test`: 227 tests pass, plus isolated PGlite workspace behavior and cloud
  dialog verification. These are fixtures, not real-device production tests.
- `node scripts/check-fee-ui.cjs`: collection/setup/receipt DOM preserved against
  the selected baseline; report and profile navigation pass, no writes performed.
- `node scripts/check-attendance-followup-ui.cjs`: DOM preservation, persistence,
  unchanged attendance records, and teacher denial pass in isolated DOM fixtures.
- New attendance regression tests failed before the fix and passed afterward.
- Read-only production queries: one school, 34 students, one workspace with NULL
  snapshot, two attendance rows, one guardian link, one teacher assignment, zero
  fee entries and zero homework file rows. Counts do not establish correctness.
- RLS is enabled on inspected public tables. Attendance module guards are
  RESTRICTIVE and combine with assignment/guardian policies; their existence is
  not a substitute for live actor isolation tests.
- Homework Storage bucket is private. Auth leaked-password protection is disabled.

## Unresolved release gates

1. At inspection, live index, teacher HTML/JS and service worker differed from
   GitHub. Live teacher JS still saved module permissions in localStorage. Deploy
   the reviewed release and verify downloaded asset bytes afterward.
2. Main ERP cloud snapshot remains uninitialized. Reconcile the existing owner's
   local dataset and relational records with a verified backup before explicit
   import. Never initialize with samples or overwrite existing students blindly.
3. Demonstrate actual admin/teacher/parent sign-in and device A save -> device B
   refresh, revoked access, other-child and other-school denial on a test tenant.
4. Verify fee collection, receipt, reversal, balances and parent visibility with
   fixture transactions in an isolated environment; production fees are empty.
5. Teacher mobile durable offline draft/sync, conflict handling, attendance
   correction audit/approval and notifications are not established by this fix.
6. Full backup/restore (database, Auth identities, private Storage) and private
   student-photo/document flows remain unverified. Local migration fixtures do
   not establish whole-project disaster recovery.
7. Broader requested roles/modules (including librarian and teacher marks) need
   explicit delivery acceptance; do not advertise all seven roles as complete.

No production records, roles, schema or school data were changed in this audit.
