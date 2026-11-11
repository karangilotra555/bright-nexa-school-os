# Bright Nexa School OS — end-to-end release audit
Audit date: 2026-11-11 | Status: **NOT READY FOR 100% END-TO-END SIGN-OFF**

## Scope and method
- GitHub tracked tree: **390 paths**, including three website/PWA copies, a 1.3 MB generated ERP JavaScript bundle, source JSX, SQL migrations, and **73 existing Node test files** (before this PR).
- Read-only Supabase schema, live school record counts, security and performance advisors, controller source, Browser tab context, and CI/test harness reviewed.
- A full line-by-line manual sign-off of every dependency and all 390 paths is **not established**; source review, tests and live verification must be kept distinct.

## Verified production baseline (read-only)
- 1 school, workspace revision **28**, 5 classes, 1 student, 1 student profile.
- 0 teachers in canonical workspace, 0 staff profiles, 0 teacher Auth-linked school users, 0 teacher assignments.
- 0 attendance/homework/fee entries. Teacher and Parent live-data flow cannot be proven without authorized test accounts and actual records.
- Browser tab simultaneously displayed “ERP saved to Supabase” and “School sync conflict — not published.” This is a genuine **status consistency blocker**. Device-local pending records were not accessible from SQL or GitHub.

## Confirmed risk and fix in this PR
- **High:** Browser BroadcastChannel previously sent entire **unverified** institution/student/operations state (including potentially multi-megabyte student photos) to other tabs on every local mutation. Other tabs immediately replaced React records without a Supabase acknowledgement.
- Now unconfirmed changes never propagate to another tab. Following a confirmed revisioned cloud save, an institution-scoped small message triggers each tab to perform its existing conflict-aware Supabase refresh instead.
- Root, docs and packaged source mirrors plus exact Workbox SHA256 are enforced.
- The former `npm run build` printed “Build completed successfully” without building or checking any files. It now runs a **release-integrity check**, covering exact published mirrors, precache hashes, source/bundle safety and teacher cloud confirmation. This gate is **not** a claim that the UI is compiled from scratch.

## Module readiness matrix
| Module | Automated / code evidence | Authenticated live end-to-end |
| --- | --- | --- |
| Login, school selection, restore/backup | Controller tests + role routing | **Blocked by live browser conflict** |
| Classes, streams, sections | Cloud projection and cascade tests; 5 live rows | One school read verified; UI mutation/reload not proven |
| Admissions, student photo, profile | Source checks, RLS and upload tests | **Needs real photo/admin/parent verification** |
| Teacher Add, staff profiles/accounts | Teacher form awaits confirmed write (PR #98); 0 actual teachers in cloud | **Critical: missing successful real Teacher Add and login** |
| Teacher assignment, RBAC | RLS/roles tests, admin membership checks | Backend cross-role audit incomplete |
| Attendance/homework/files | Write/readback and idempotency tests | 0 real entries; Teacher→Parent→Android unverified |
| Fees/accountant | Append-only correction and receipt tests | No real fee record; role-limited live save unverified |
| Timetable/substitute | RPC and timetable tests | No published timetable to compare |
| Notices, exam, marksheet | Published-only and access tests | No published exam/marksheet to compare |
| Parent portal | Portal tests, linked-child RLS | No real linked parent login/records |
| PWA/Android | Workbox revision, mirrors, APK WebView route | Installed APK and device cache refresh unverified |
| Multi-tab and offline recovery | Conflict/backups test, this PR's verified-only broadcast | Browser-local pending recovery remains unresolved |

## Security and performance follow-up (do not blindly weaken RLS)
- All currently listed **public tables** have RLS enabled.
- Supabase security advisor reports **13 authenticated-callable SECURITY DEFINER functions**. These require per-function privilege/body verification; advisor findings are not automatic proof of exploitation. Do **not** switch them to unsafe generic grants.
- 5 tables are reported as RLS-enabled without policies (some intentionally private), and leaked-password protection is disabled.
- Performance advisor reported **52 foreign-key indexing suggestions**. Index selectively against measured query plans, not all at once.
- Supabase `school_workspace_push` timeout and redundant large student-photo rewrites were addressed by earlier PR #98, but live production confidence requires controlled repeated writes and refresh tests.

## Release criteria before declaring the system complete
1. No visible or underlying unresolved workspace conflict; verify original pending-device edits recovered safely.
2. Teacher created once → Supabase revision increments → refresh/second browser confirms same persistent Teacher ID → teacher login/roles work.
3. Student admission/edit/photo, class migration, attendance, homework, fee, timetable, marksheet each verified write/read and cross-portal propagation.
4. Role isolation tested on school-admin, accountant, librarian, teacher, parent and student accounts; unauthorized cross-school reads and writes denied.
5. Installed Android app tests and stale PWA cache recovery complete.
6. Run npm tests, integrity gate, production deploy verification, and controlled end-to-end smoke checks, with no silent local-only success.

**Do not clear browser storage or overwrite the school workspace to make a status green.**
