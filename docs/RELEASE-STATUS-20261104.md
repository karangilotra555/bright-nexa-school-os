# School OS release checkpoint — 2026-11-04

Production branch `main` now includes the integrated Phase 1–4 development stack. This release is **not** an unconditional sign-off of every module.

## Delivered in code and verified by automated CI
- Owner dashboard: real authenticated Supabase cloud data, student register create/edit/archive, class/section edits, staff profile editing, attendance, append-only fee ledger, notices, generic owner modules.
- Student XLSX/CSV admissions preview and validation; one confirmed cloud batch save only after explicit action.
- Teacher and parent portals: assignment-based and linked-child safeguards with server RLS; teacher subject validation; verified parent-leave acknowledgements.
- Exam-specific mark reports, print and safe CSV; Smart Timetable roster read, local scheduling, substitutions; no auto-published schedule.
- Owner encrypted **24-hour read-only** offline snapshot, protected with separate passphrase.
- Owner self-service **encrypted school backup download + local verification**; user must keep a copy **outside Supabase** with its passphrase.
- Fee reference reused on uncertain response, server receipt lookup, existing `(institution_id,reference)` DB uniqueness to prevent duplicate submissions.

## Pre-release safety
- Private internal snapshot `school_release_safety_20261104` contains copies of 18 school-related PostgreSQL tables, taken before this release.
- Before deployment, school-data counts were 34 students, 20 staff profiles and 20 class-sections. These were checked again after moving `main` and matched.
- Safety snapshot is **inside the same database**; it is not sufficient for fire/disaster recovery.
- Previous main commit for rollback reference: `24a80cfc93fe55084964e22f5544548315688c61`.
- Integrated commit: `32c11df32add0edec011119b4824b7215699f372`.
- GitHub Actions run `41791700775`: 164 tests passed, 0 failed. Browser sign-in/E2E tests are not covered by these unit tests.

## Owner action on first login
1. Sign into https://bright-nexa-school-os.onrender.com with your existing owner account. Do not re-create the school or reset credentials.
2. Open the owner dashboard and click **Download encrypted backup**. Use a unique 12+ character passphrase, **different** from the login password. Save the downloaded `.bnbackup` file outside the school web app in a private folder or Drive.
3. Click **Verify backup file**, select that file and enter the passphrase. Check the record counts. This is a decryption/read test, **not** a production database restore.
4. Only then try student admission, a harmless test notice, teacher invitation, class assignment, and teacher/parent sign-in with consent from those accounts. Check success confirmations.
5. Never import sample school data, fabricate exam marks, or post fee entries for a real child merely for testing. Use an authorized disposable test school or explicit real transaction.

## Known restrictions before selling to schools
- Off-site backup has not yet been created by the school owner, and a database restore into a separate environment has not yet been exercised.
- Offline editing/bidirectional sync is deliberately disabled, to protect fees and class data; offline only shows encrypted read-only copy.
- Teacher invitations and parent linking need a real verified school account; staff directory rows do not grant logins. No teacher or parent child links existed at time of audit.
- Official grades, approvals, promotion workflows, immutable mark audit ledger, timetable cloud publishing, Android Parent APK and full messaging/broadcast are not complete.
- Real owner browser test for newly integrated code, multi-school RLS deny checks, and mobile UI sign-off remain required; CI green is not enough to assert everything works.

Do not remove legacy source files or database snapshot until an independent backup and an authorized browser verification succeed. WACRM remains untouched.
