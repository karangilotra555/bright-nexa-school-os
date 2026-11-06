# Bright Nexa School OS — Roles, RBAC and Mobile (6 Nov 2026)

Supabase is the **primary source of truth**. Preserve the existing approved interface, class/student IDs and live records. This replaces the old rollout note which incorrectly said no Teacher Portal had been deployed.

## External code reviewed

- [4jean/lav_sms](https://github.com/4jean/lav_sms) (MIT, Laravel 8): `app/Helpers/Qs.php` role teams; custom route middleware; finance, marks, timetable, student and library workflow ideas. Its README flags unfinished modules, and some generic routes need independent object-level verification.
- [adilmohak/django-lms](https://github.com/adilmohak/django-lms) (MIT, archived): `accounts/decorators.py` role checks; course/quiz/result data models. Inspected API permission files are empty; its README redirects to SkyLearn. Learn concepts, not copy the stack.
- Bright Nexa must retain existing Node/JavaScript/Supabase, not be rebuilt in Laravel or Django.

## Requested seven-role mapping

| Requested role | Current identity | Current reality |
| --- | --- | --- |
| Super Admin | `school_admin` | Own-school owner; staff invites, roles and core administration. Not a global multi-school superuser. Owner-only delete/audit policy still requires full validation. |
| Admin | `principal` | Academic administrator; not allowed unrestricted role/fee management. Needs further action-by-action ERP review. |
| Accountant | `accountant` | Fees/receipts backend; existing broader student/class/profile visibility must be tightened before claiming finance-only rights. |
| Librarian | `librarian` | Added to school staff schema and authenticated invite function. New `school_library_items` and `school_library_loans` with tenant RLS, immutable issue records, one active loan per physical copy. New `library.html` interface. Device/user acceptance pending. |
| Teacher | `teacher` + assigned class/subject permissions | Attendance and homework from responsive Staff Portal with Supabase RLS. Marks/timetable mobile authoring incomplete. |
| Student | Student identity via student/parent portal | Own published data only; not a separately finalized Supabase staff-style Auth role. |
| Parent | Guardian/child linkage and Parent PWA | Own linked child; attendance/homework/fees/profile/leave screens. Cross-identity live tests outstanding. |

Additional `receptionist` and `transport_staff` roles remain preserved.

## Strict 3-layer enforcement (not just checkboxes)

1. Verify identity, current active school membership or guardian/child identity.
2. Verify action capability and class/subject/ownership scope on every request and export.
3. Supabase RLS, tenant-scoped foreign keys and triggers enforce denial even when frontend is bypassed.

Module visibility is **not** the authority. Librarian issues/returns do not grant academic, attendance or fee writes. No browser-only inventory database is permitted.

## Mobile-first workflow

Teacher mobile PWA: verified login → assigned class → attendance date → explicitly mark students (or mark remaining present) → save to Supabase → refresh on another device. Homework and attachments are in the existing Staff Portal. Separate install manifest and role-gated Attendance/Homework shortcuts were added in GitHub commit `1222294`.

Parent PWA: login → child dashboard, attendance, homework, fees, notices and leave. Office-only workflows remain in the owner ERP. **Offline teacher queue/conflict, live Android install, and cross-device save/read remain unverified.**

## Production acceptance blockers

- Confirm Render is serving the exact tested GitHub release and has not retained stale teacher/library JS. Green CI is not a live deployment test.
- The full ERP `school_workspaces.snapshot` remains NULL despite existing relational student/class records. Back up/reconcile first; do not initialize by overwriting with local demo data.
- Test actual admin, principal, accountant, librarian, assigned teacher, unassigned teacher, parent, unrelated parent and other-school sessions, including forbidden direct REST calls.
- Parent/Student view of school library borrowing is not yet connected to the Parent PWA, though linked-parent row read policy is present.
- Narrow Accountant visibility and finish teacher marks, timetable/leave approvals, private files, offline sync, notifications, audit and full backup/restore before calling all seven roles production-ready.
