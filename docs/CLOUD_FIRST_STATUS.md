# Bright Nexa School OS — cloud-first status

Updated 6 November 2026.

## Canonical stores

- Supabase PostgreSQL is the intended primary source of truth. Existing canonical relational tables include school institutions, school users, classes, students, staff profiles, class assignments, attendance, homework, notices, guardians, student profiles, fee entries, and school-role module permissions.
- `school_workspaces.snapshot` holds the full main ERP institution/students/operations JSON. Its safe local-to-cloud first import is explicit and guarded. Its relational projection currently mirrors six areas (classes, students, attendance, homework, notices, fees); modules that have no independent relational projection remain as part of the full JSON snapshot.
- `school_role_module_permissions` is school-scoped, RLS-protected and used by the Teacher Portal. Staff account names use Supabase Auth metadata for self-edits and `school_users.display_name` for administrator edits.
- Local browser/IndexedDB content is not a separate primary dataset. The existing offline cache, local recovery copies and conflict-preserving queue remain in place; never delete or silently import them.

## Evidence and remaining blockers

At the 2026-11-06 production inspection there was one cloud-workspace row with a NULL snapshot (no complete main ERP import), while relational school rows already existed. An empty workspace must **not** be treated as synchronized. No blanket data migration, demo replacement, or destructive reconciliation was performed.

The cloud-first startup patch asks the existing client to open its single authenticated school automatically on returning visits. This safely restores a nonempty cloud snapshot when it exists; it deliberately does not auto-upload local data into an empty cloud workspace. The user must review local records and use the existing School cloud connection UI to perform the initial guarded import. Its projection should match canonical school records by tenant and natural keys; abort on ambiguity rather than create duplicates.

Outstanding before full production claim: controlled initial import from the user's existing device, normalization of modules that still live only inside the full workspace JSON, private photo/document storage and linked appearance across portals, multi-device writes and conflicting edits, fee reconciliation, cross-school RLS and full disaster-recovery validation, latest Render deployment verification. Do not treat green CI as proof of these end-to-end behaviors.

## Validation checklist

1. Capture verified backup of current cloud relational tables and local school workspace before import.
2. Inspect existing school identity, academic year, student admission IDs, class/section keys, and mismatched or sample records; stop on ambiguity.
3. Explicitly import or open the cloud workspace; verify `snapshot IS NOT NULL` and revision advance without changing existing relational entities unexpectedly.
4. Check a student/class/role change across admin, teacher and parent portals, another browser, sign-out/sign-in, and mobile.
5. Check photo/document links and permissions, attendance/history, fees/receipts, duplicate prevention, offline recovery, and conflict response.
6. Confirm Render serves the exact tested commit and the current UI, without redesigning approved screens.
