# School timetable and student-photo sync — implementation & release checklist
**Date:** 2026-11-07  
**Branch:** `feat/school-timetable-photo-sync-20261107`  
**Review:** PR #65, stacked on PR #64 (`fix/one-student-parent-portal-20261107`). Neither PR has been deployed to the live school.

## School timetable: intended workflow

**Where:** Main School OS left sidebar → **School Timetable** (opens the existing Staff/Teacher portal, authorized school admin); Staff Portal → **School Timetable** in its existing left navigation.

1. Create Classes & Batches/sections and academic years in existing ERP/class setup.
2. Staff Portal → Roles & Permissions → assign a **class teacher** and **subject teachers**, each with active class/subject mapping.
3. School Timetable → choose academic year and Class / Section.
4. Define common working days and bell times: first period, duration, short break, lunch, periods/day. School creates concrete, indexed slots in Supabase.
5. Click a classroom period, choose subject and a teacher explicitly assigned to that class (subject teachers must match the subject); save as **Draft**.
6. Optionally specify teacher/subject weekly period workloads; generator fills only missing draft periods, without overwriting an existing period or double-booking a teacher.
7. Review weekly Mon–Sat grid, breaks, subject-teacher mapping, overlaps and unpublished changes.
8. **Publish** the completed class timetable. Server checks admin role, every teaching period filled, teacher cross-class clashes, and class/academic session match. Published rows become visible together in one transaction.
9. Student/Parent portal Profile → **My Class, Teachers & Timetable** shows only their linked student's approved timetable, and current teacher display names. Teacher portal reads assigned classes' published schedule under RLS.

**Safety:** Admin is the only draft editor. Principal has published read access. Teacher read requires assigned class/roster access. Student/parent read requires their specific guardian-to-student link. No separate local timetable database. References to classes, staff and students reuse existing Supabase UUIDs.

**Known limitation:** Bell schedule currently applies to a whole academic year. Schools that require different short-day LKG / primary / senior school bell plans need a future per-school-division schedule profile; do not invent these rules or auto-fill data.

## Student photo upload and sync

**Where:** Staff Portal → Student Profiles → select student → Load profile → **Student photo · Private cloud storage**.

- Admin uploads JPG/PNG/WebP (up to **5 MB**) to private `school-student-photos` bucket, under `school-id/student-id/photo-random-id.ext`.
- Upload uses publishable client key + verified user's JWT and Storage RLS; no service-role key in the browser.
- A scoped `bn_save_student_photo` RPC validates the existing uploaded file/student/school and updates only `school_student_profiles.details.photo_path`. Other profile fields remain untouched.
- Linked parent/student and authorized teacher can read **only the current student's published photo** through a narrow, security-definer helper in private `school_private` schema. Full student profile medical/contact fields are not thereby exposed.
- Student/Parent portal uses a **5-minute signed photo URL** and updates photo on refresh; no public bucket URL.
- `school_save_student_profile` is extended to preserve the server-published `photo_path` during later ordinary student-profile saves, and rejects client-supplied replacement photo paths.
- Stored older image objects are not automatically purged. Future storage-cleanup policy should delete superseded files only after a verified migration/retention period.

## Migration contents

`supabase/migrations/20261107160000_bell_timetable_private_student_photos.sql` adds:
- `school_timetable_slots` (bell timings and breaks)
- `school_timetable_drafts` and `school_timetable_subject_loads`
- `school_timetable_published`
- `bn_publish_class_timetable` and `bn_portal_student_timetable` restricted RPCs
- SQL overlap checks, school/academic year/teacher assignment checks and immutable used bell slots
- Private Storage bucket and RLS, `school_private.bn_can_read_student_photo`, `bn_save_student_photo`
- Safe photo-pointer preservation in the existing invoker-mode `school_save_student_profile`
- Explicit authenticated Data API table grants; new tables have RLS enabled

Prior PR #64 adds `bn_portal_class_teachers` RPC and unifies student/parent portal. PR #65 must be reviewed and deployed after PR #64.

## Live database read-only baseline, 7 Nov 2026

- 34 `school_students`, 20 `school_classes`
- 1 active `school_teacher_assignments` record
- 1 detailed `school_student_profiles` record
- 0 Storage objects
- 0 initialized workspace snapshots
- Timetable tables and student-photo bucket **do not exist in production yet**

The blank workspace snapshot means the main React ERP's local/remote reconciliation has **not** been completed. Do not claim that existing local ERP edits automatically publish into cloud tables, or perform an empty-workspace import over these 34 records.

## Validation / release gates

1. **Backup first:** produce an independently restorable Supabase backup and validate restoration, plus a separate export of any unsynced local ERP state.
2. Approve/merge the shared portal PR #64 only after checking migration and student login compatibility with existing guardian accounts.
3. Review SQL permissions and dedicated student-photo bucket configuration; use a separate isolated database or Supabase development branch (after any required cost approval). Test under real `authenticated`/RLS roles and two different schools.
4. Apply the migration transaction to the target production Supabase project in a controlled maintenance window. Check table grants, private bucket and policies.
5. Merge PR #65 and verify Render + Pages release is serving matching mirrored assets. Cache busting must not silently leave old portal files.
6. Create **only authorized test records**: admin, teacher A assigned to Class A, teacher B assigned to another class, two unrelated parent-child accounts, optional isolated class/student roster. Never alter school students just to make tests pass.
7. **Timetable acceptance:** admin creates 5/6-day schedule, short break and lunch, fills class timetable, publishes; assigned teacher sees own class, parent sees own child's grid; draft changes are not visible until publish. Direct SQL slot edits after publish fail. Unauthorized teacher/other school cannot see or edit.
8. **Photo acceptance:** upload admin photo; parent sees only linked student photo, teacher sees current photo only for assigned class; unrelated parent gets no signed URL. Edit another profile field after photo upload and ensure published photo remains. Cross-school upload/path substitutions fail.
9. **No false green:** passing CI/PGlite tests prove source compatibility and isolated permission behavior; they are not a substitute for a real Render/Supabase/PWA test. Only after all gates can this be called **live and synchronized**.

## Safety
No production student data, passwords, photos, timetable or existing live rows were modified during PR #65 development.
