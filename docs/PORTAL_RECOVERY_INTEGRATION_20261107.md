# Bright Nexa — Portal Integration & Password Recovery Rollout

**Date:** 7 November 2026  
**Status:** Code staged in PR #62; not deployed. Preserve all live school records and UI design.

## Supabase stays authoritative

No migration from Supabase to per-device local DB. The existing main school ERP still uses a local-first workspace cache; teacher and parent portals use Supabase relational tables. A verified backup + mapping reconciliation is required before they can all be called fully synchronized (see PR #61).

At audit time there were 34 active students, 20 classes, 2 attendance rows, 0 fee entries, 0 homework, 0 notices, 1 student detailed profile, 1 linked guardian/student relation, 0 Storage files, and a NULL school workspace snapshot. These are observations, not acceptance tests.

## Teacher/staff login

- `teacher-access.html`: *Forgot password?* opens a registered school-email form.
- `teacher-access.js`: calls Supabase Auth `/auth/v1/recover` with a same-origin recovery redirect. It always uses a generic message on success to avoid exposing registered emails.
- A Supabase recovery email contains a one-time link, **never a plaintext password**.
- Recovery callback prompts for a new 12+ character password, then clears the recovery session.
- The old login, invite activation, attendance controls and role restrictions stay in place.
- Configure Auth allowed redirect URLs for both:
  - `https://bright-nexa-school-os.onrender.com/teacher-access.html`
  - `https://karangilotra555.github.io/bright-nexa-school-os/teacher-access.html`

## Student/parent portal

- Root `/parents.html` now uses the same Supabase cloud portal as `docs/parents.html`. The previous Render root page used an independent SQLite DOB login.
- Both copies now load cloud client, attendance calendar, and the detailed profile renderer.
- The student profile displays school-published fields. **Absent details show as missing; do not generate or guess them.**
- Original `student-portal.html` is a separate legacy document/QR verification view and is NOT yet migrated to the authoritative cloud identity flow; review its login/navigation before public release.
- Cloud Storage currently has no files; student photos are therefore NOT verified as synchronized.
- Fee and homework tables are empty; parent portal can show source-of-truth data when school publishes it, but this is not yet a real end-to-end test.
- The Android Parents app is a WebView pointing at the school's configured URL and `/parents.html`, so updating that route brings it onto the cloud backend. Existing APK and direct school-origin behavior require device testing.

## Student Forgot Password

**Important:** Student Auth identities currently use internal synthetic `@student.brightnexa.invalid` addresses. Normal Supabase `resetPasswordForEmail` cannot deliver mail to those addresses.

New `school-student-login` Edge actions:
1. `request-reset`: admission number, school ID and guardian email. It only sends a Supabase magic link if the school already registered that guardian email and the student has an activated linked Auth identity. The public response is generic. Requests are rate-limited.
2. `complete-reset`: email-link callback gives a Supabase-verified guardian Auth JWT, student admission ID and strong new password. Server checks guardian email matches that specific child, school is correct and active, synthetic student Auth identity is linked and activated, then changes only that student's password using the server-held service role.
3. Replay from an older email session is denied using a password-reset timestamp in server-controlled app metadata. The callback does not persist the guardian JWT in local/session storage.

The email directs to `https://bright-nexa-school-os.onrender.com/parent-password-recovery.html`. **Add this exact URL** to Supabase Auth's allowed redirect URLs before deploying. Magic Link must be enabled. Set production-grade custom SMTP with verified sender; the default Supabase mail service is rate-limited/best effort. Do not send or store plaintext passwords.

**Current onboarding blocker:** Audit found **0 guardian_email values across the 34 students**. School must enter the correct guardian email in the authorized student profile editor and verify the recipient before any student can receive email recovery. Do not guess addresses, batch-fill, or send email to an unrelated person.

The new Edge version must be deployed with `verify_jwt=false` **only because the function explicitly verifies its own JWTs for privileged actions**. Anonymous `request-reset` is deliberately rate-limited. A full adversarial review and live email/device test are required before enabling it for a paying school. Consider stronger atomic one-time recovery consumption before broad multi-school rollout.

## Teacher assigned-class / student privacy

- `school_private.teacher_can` verifies active teacher membership, active assignment, tenant, class ID and permission type.
- Teacher mobile attendance UI refuses unassigned classes, rejects changing class/day after loading and refuses unmarked students.
- Supabase RLS `school_attendance` insert/update and `school_students` read use server-verified role or `teacher_can` predicates; client dropdowns alone cannot grant access.
- `school_student_profiles`, child attendance and fee reads use `school_private.parent_of` for a linked active child; other children should be invisible.
- No real identity test performed in this release. Test teacher A vs teacher B, school A vs school B, parent A vs other child with **isolated test accounts** before claiming live privacy isolation.

## Deployment gates

1. Keep PR #59 admin token hardening and PR #61 first-import data safety in scope; neither should be bypassed.
2. Review PR #62 and all CI tests; only then merge/serve page and deploy Edge function **in the same controlled release**.
3. Configure Supabase Auth redirect allowlist and SMTP; add/verify guardian emails through the school.
4. Verify delivery and expiry of password-reset links without exposing tokens in screenshots/logs.
5. Verify the teacher PWA, Android WebView, student profile and parent cloud updates using controlled records.
6. Do not initialize or overwrite the full ERP workspace until backup + reconciliation. Local data alone is NOT proof of sync.
