# Bright Nexa — Cloud Teacher Access (22 Oct 2026)

## Deployment status

**Supabase project:** `mrfvbwmyxndrakskqyas` — Bright Nexa School OS (ap-south-1).
**Hosted teacher login (HTML website on Render):** https://bright-nexa-school-os.onrender.com/teacher-access.html
**Invite API:** `/functions/v1/school-invite-staff` — valid Supabase Auth JWT AND school_admin membership required.

Supabase Edge Functions force HTML pages to text/plain on shared hosts; the old Edge URL now redirects to Render's proper HTML static site. Existing School OS now links to the hosted teacher site through **Teachers · Online Access** in the nav/topbar. There is also a standalone HTML source at `teacher-access.html` and a copy under `docs/` for static hosting.

Both Supabase Edge functions are deployed; versions and migration history are managed in the linked Supabase project. The public teacher page is intentionally accessible without login, but all school-specific queries use authenticated JWTs and database RLS.

## Permissions

| Staff role | Access |
|---|---|
| School admin | Staff invitation, staff role/status management, class setup, teacher assignments, attendance and homework for their own institution |
| Principal | Institution academics, attendance and homework; staff invitation and role editing prohibited |
| Teacher | Only assigned class/section roster and the specific attendance/homework actions enabled by the school admin; subject teachers cannot publish other subjects |
| Accountant | Existing school-wide student/class data policies, no teacher homework/attendance write |
| Receptionist | Existing enrollment/student policies, no teacher homework/attendance write |
| Transport | No academic data unless a future transport-specific policy is added |

Teachers have per-assignment toggles for roster, attendance, homework and future marks. **Marks saving UI is not deployed yet.** Toggling `can_enter_marks` does not give access to an exam marks table until that backend is built.

The database migration `school_teacher_scoped_roles_and_academic_access` replaces the previous teacher-all-students read policy with class-assignment RLS and creates:
`school_teacher_assignments`, `school_attendance`, `school_homework`.
The additional migration `teacher_activity_authenticated_authorship` restricts attendance/homework writes to the signed-in actor.

Both migrations have been applied to the matching project using the Supabase connector. All three new tables have RLS enabled.

## Security verification

A transactional database test simulated a teacher assigned only Class VI-A Mathematics with School A; RLS allowed its single assigned student and denied School A's VI-B student, School B's student, English homework and unassigned attendance writes. The entire test fixture was rolled back — no synthetic records remain.

There are currently **zero institution, school_users and student rows** in this cloud project. Therefore **no real school admin can sign in yet**. A trusted initial school admin must be provisioned using Supabase Auth and a verified school_users membership; do not enable public anonymous school signup or introduce static admin passwords to avoid this onboarding step.

## Complete the first live school onboarding

1. Confirm an actual school, its responsible administrator and verified email; create the institution in the dedicated Supabase project.
2. Create/invite the initial admin through trusted provider-side Supabase Auth tooling. Bind that account's real `auth_user_id` to the institution in `school_users` with role `school_admin`. This cannot be self-provisioned by an unauthenticated browser.
3. In Supabase Auth URL settings, allow the hosted teacher site above as an invitation redirect. Confirm school mail delivery. The staff invite endpoint uses the hosted site as `redirectTo`.
4. Have that admin log into the teacher portal, invite teachers and assign their classes/subjects and permissions.
5. Test auth invitation, password activation, staff role changes, attendance and homework in the actual mobile/desktop browser. These end-to-end flows have not been verified with an activated school account yet.
6. Integrate admissions, student roster and academic actions from the primary online School OS UI into the same school-specific database. The existing bundled School OS UI is **not yet switched to Supabase**. Parent app auto-sync is a separate pending feature.

### Important deployment boundaries

- Cloud-first by default; **no local installer is being sent to schools**.
- The legacy standalone Node/SQLite `server.js` and prior staff-permissions policy remain as offline/pilot code and must **not** be treated as the cloud tenant authority.
- The currently deployed cloud RLS checks school users and assignment rows on **every** request. Hiding menu items alone does not secure data.
- This version does not automatically migrate existing browser-stored School OS data to cloud.
- Do not invite real teachers until the school owner/admin is verified and onboarding steps are complete.
