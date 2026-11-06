# School workspace migration

`supabase/migrations/20261105200548_school_workspace_sync.sql` was generated with the Supabase CLI. It contains no seed data, account creation or local-data import. The schema migration was applied to the existing Supabase project on 2026-11-06 after the user selected the free deployment path. The existing local store remains available. Connecting/importing a school's local workspace must be a separate, explicit UI action.

## API contract

Both RPCs are `SECURITY INVOKER`, use an empty search path, deny anonymous execution and explicitly require an active authenticated `school_admin` for the requested active/trial institution. Existing tenant RLS and relational foreign keys remain in force.

- `school_workspace_pull(p_institution_id uuid)` returns `{revision, snapshot, school:{id,name}}`. Before first import, `snapshot` is null. Pull creates an empty workspace row, but imports no records.
- `school_workspace_push(p_institution_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_projection jsonb)` atomically writes the snapshot and relational projection, then returns the same response shape. A mismatched revision raises SQLSTATE `40001`; clients must retain their pending local work, pull and explicitly resolve the conflict. Do not retry a stale write blindly.
- `snapshot = {institution: fullApplicationState, students: [...], operations: {...}}`. `snapshot.institution.institution` is the application's institution metadata. Fields unrelated to the mirrored entities remain intact.
- Projection arrays are required: `classes`, `students`, `attendance`, `homework`, `notices`, `fees`. Local IDs must be unique within each array. Class natural keys are institution/name/section/academic year; student natural keys are institution/admission number. Ambiguous class streams sharing a natural key are rejected rather than duplicated.
- Class rows: `{localId,name,section,academicYear}`. Student rows: `{localId,admissionNumber,name,classLocalId,dob,status,profile:{guardian_name,guardian_phone,address_line,details}}`. Attendance: `{localId,studentLocalId,classLocalId,day,status}`. Homework: `{localId,classLocalId,subject,title,instructions,dueOn}`. Notices: `{localId,title,body}`, restricted by the client to all-parent audiences. Fees: `{localId,studentLocalId,kind,amountRupees,description,occurredOn}`.

Stable local/cloud mappings preserve portal logins and existing relational IDs. Existing classes and students reconcile by natural key. Pull overlays relational classes, students, profiles, attendance, homework and notices, while retaining the original local IDs and unrelated fields. Previously portal-created rows receive deterministic `cloud:<uuid>` local IDs. Canonical relational identity/status/name fields override stale copies inside profile details.

For an unmapped class or student returned by pull, the `cloud:<uuid>` ID takes precedence over mutable natural keys on the next push. Renaming a class, changing its section/year or changing an admission number before the first save therefore updates the original row. A cloud ID outside the selected institution (or one that no longer exists) is rejected explicitly; it cannot fall back to a matching local natural key.

Student statuses return in the main application's title case (`Active`, `Transferred`, `Graduated`, `Archived`); projection statuses remain lowercase. Supported profile snake-case aliases such as `roll_number` and `father_name` map to the main application's camel-case fields and back on save. The school's nested name is persisted to `institutions.name` under administrator RLS and a name-column grant, and pull returns the canonical name. Other institution metadata remains in the full snapshot.

The private, non-callable definer trigger increments workspace revision when any mirrored table or the institution changes, including teacher writes. Its elevated privilege is restricted to revision invalidation; it returns no workspace content. Teachers and parents cannot read full workspaces or mappings. Each push may increment revision several times; revisions are opaque concurrency tokens, not save counts.

## Financial and deletion boundaries

The fee column becomes `numeric(14,2)`, with amounts greater than zero and at most 100,000,000 rupees. The balances view retains `security_invoker=true`. Projected obligations and credits are signed target amounts; subsequent edits or removal append compensating ledger entries tagged `workspace:<uuid>`. Existing entries are never updated or deleted. Repeated identical projections add no fee entries. Reassigning an existing financial item to a different student fails.

An affected student's existing non-workspace fee ledger causes the push to fail atomically with a reconciliation message. Once a workspace snapshot exists, **pull also fails explicitly if any school ledger entry is external**, including later direct accountant entries. The app therefore cannot claim synchronization while its receipt engine disagrees with the portal ledger. The migration does not invent a conversion from arbitrary ledger entries to the main application's obligation/receipt engine. Reconcile those records explicitly before enabling imports; never clear a ledger to get past the check.

Removing any already mapped nonfinancial entity fails the entire push with an explicit error. Changing a previously published all-parent notice to a restricted audience also fails, rather than leaving a misleading successful save. Archive students using their status; retain linked classes, attendance, homework and published notices until a separately reviewed lifecycle operation exists. The sync does not delete attachment dependencies or historical records. Existing local-only workflows remain available, but unsupported cloud deletions stay pending and must be surfaced to the user.

The attendance constraint previously tied historical attendance to the student's **current** class. It is replaced with the student/institution FK; the independent class/institution FK stays in place. Historical attendance therefore retains its original class after a transfer. Existing teacher RLS still requires active current-class enrollment for teacher attendance writes. Additional school-admin policies allow importing/correcting historical attendance and fee entries for archived/transferred students with actor and tenant checks.

## Verification performed

Read-only inspection of live schema columns, constraints, grants, RLS policies, role helper and fee view informed this migration. During initial preparation no school records were queried or changed. During the free rollout, nine affected tables were exported to a private local backup outside the repository, restored offline, and compared field-for-field before and after the hosted migration. All 60 backed-up rows were preserved. The migration and RPCs execute successfully in disposable PGlite PostgreSQL with fixture tables and authenticated RLS. Run:

```powershell
$env:PGLITE_MODULE='C:\Users\Zion\bn-sync-test-tools\node_modules\@electric-sql\pglite'
node tests/workspace-database.cjs
```

The module can instead resolve through a normal development installation of `@electric-sql/pglite`. The fixture verifies atomic initial import, natural-key reconciliation, preserving custom fields, immutable decimal fee corrections and removal offsets, no duplicate fee writes, stale-revision rejection, cross-school denial, unauthorized/teacher workspace denial, teacher attendance revision invalidation, relational overlays, attendance surviving a transfer, rejected mapped deletions and rejection of existing external fee history.

The fixture deliberately approximates the existing schema and does not prove every production policy, extension, trigger or dependent view. It does not simulate simultaneous sessions or PostgREST serialization. Production security advisors were checked before and after migration; the same existing findings remained. No paid staging branch was created. Browser end-to-end cloud writes and simultaneous hosted sessions remain unverified. The repository does not contain a complete baseline migration suitable for recreating the production database from scratch.

## Free rollout verification (2026-11-06)

Paid branching was rejected by the user. A separate project was quoted at $0 but could not be created because the account already had two free projects. No project was paused, deleted or upgraded.

The production schema catalog (35 tables, 73 policies, constraints, grants, functions and triggers) was restored into disposable local PGlite. Nine affected tables (60 rows) were separately backed up outside the repository and restored there. Migration preserved every backed-up field. Actual catalog policies were exercised with isolated fixture accounts: admin import, assigned teacher attendance update, parent visibility, workspace denial for teacher/parent, and stale admin revision rejection passed. Auth functions are stubbed in this local check; it is not a full hosted Auth/Storage backup or a browser end-to-end test.

Run with private local exports (never commit exports):

```text
node scripts/check-production-schema.cjs <catalog.json> <affected-records.json>
```

The workspace migration was then applied transactionally to the existing free project. A live read-back confirmed all nine backed-up tables remained unchanged. No local workspace or demo records were automatically imported. Production security advisors added no new findings; pre-existing definer-function and password-protection warnings remain for separate review.

Existing external fees still require reconciliation before workspace import. The explicit school confirmation in the UI must be used before importing records. Hosted authenticated end-to-end and genuinely simultaneous-session tests remain outstanding; do not describe the demo as fully production-verified.

## Recovery

The private backup is scoped to the affected school tables and schema metadata. It does not back up Auth accounts/passwords, Storage objects, or every project table. Offline restoration of that scope passed. A full disaster-recovery drill remains outstanding.

For application rollback, revert the application release to 3211e4b and retain local backups/pending work. Keep new database tables and mappings until recovery has been reviewed. Do not blindly reverse decimal amounts to bigint or restore the old attendance FK after transfers: either can lose data or fail validation. Preserve appended fee adjustments as audit history.
