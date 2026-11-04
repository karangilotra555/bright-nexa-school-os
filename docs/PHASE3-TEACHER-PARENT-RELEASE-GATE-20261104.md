# Bright Nexa School OS — Phase 3 Teacher & Parent Access
Updated: 2026-11-04. Development branch `phase3/teacher-parent-access-20261104`, based on Phase 2 draft.

## Implementation slice
- Authenticated teacher dashboard uses the same school cloud records already filtered by Supabase RLS. Displays the teacher's active assigned classes, accessible students, and assigned attendance/homework permissions, without inventing records.
- Client-side guardrails in `school-access-guard.js` display and validate teacher class/subject rights. **They are not security authorization**; Supabase RLS remains the authority on every request.
- Subject teachers can publish homework only for their assigned subject(s) in their assigned class; class teachers with explicit homework permission can publish multiple subjects.
- Teacher attendance UPSERT requires an exact returned row for every marked student before displaying "saved"; unmarked students stay unmarked. Permissions are enforced by server-side RLS.
- Staff account role edits, teacher assignment create/update/revoke/restore and homework publish require a returned cloud acknowledgement. Teacher class grants are soft-revoked (active=false) instead of deleting historical assignment rows.
- Parent login remains verified email/password, with administrator-controlled links. Linked student filtering requires guardian and child to be in exactly the same institution and guardian active status.
- Parent child-switching uses a request epoch so late responses for child A cannot overwrite child B; parent-child membership is rechecked before rendering sensitive details, and revoked access is denied.
- Parent leave requests validate the server-created record's guardian, student, institution and pending status before reporting success.
- Parent attendance summary explicitly describes its last-100-marked-days scope, not all-time attendance.

## Current live data and critical onboarding gap
Verified from Supabase on 2026-11-04 (read-only inspection):
- `school_users`: 1; `school_teacher_assignments`: 0.
- `school_staff_profiles`: 20; these are **staff directory records, not teacher login accounts**.
- `school_guardians` and `school_guardian_students`: 0; verified parent-child portal has no linked children yet.
- `school_homework`, `school_parent_leaves` and `school_attendance`: 0.
No school data was created/edited/deleted as part of this Phase 3 branch.

## Still required before calling it production-ready
1. Preserve Phase 1/2 backup + isolated restore requirements; those are not complete.
2. Verify staff invitation email delivery and Supabase email verification with an authorized test teacher, then assign one class. Confirm teacher can see exactly assigned class and no other class.
3. Register a verified test guardian account, link it via an authorized school admin, test linked child A/B and revoked access (RLS and UI). No fake or arbitrary child link.
4. Test teacher subject restrictions, attendance changes, concurrent class or teacher revocation, offline behavior, expired tokens and multi-school isolation in a real browser.
5. Complete teacher marking/marksheets and grading, homework lifecycle, approval audit trails, parent communication notifications, Android parent APK cloud verification and staff/guardian enrollment support.
6. Verify full academic history reporting, privacy/consent/retention, and external disaster recovery backup. These features do not become working just by adding tabs.
7. Keep draft PR unmerged and do not deploy production until CI, browser tests and previous-phase release gates pass.

## Release acceptance
Pass automated suite, invite verified test teacher, create class assignment, take attendance with explicit marks, publish class/subject homework, create verified parent-to-child link, view only that child's records, remove link and prove access is revoked. Ensure no live-child data is used in testing without institutional permission.
