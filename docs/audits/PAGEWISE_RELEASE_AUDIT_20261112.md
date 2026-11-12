# Bright Nexa School OS — Page-wise Release Audit

Audit date: 2026-11-12. Scope: deployed static frontend + connected GitHub source and **read-only** Supabase production inspection.
This is an evidence-based engineering ledger; it is NOT a certificate that every page passed authenticated live click tests.

## Legend
- **Code fixed**: change committed, regression tests present. Production deployment and actual click-to-readback not implied.
- **Cloud evidence**: live aggregated database inspection only, no destructive test.
- **Blocked**: required role credentials, actual mobile app session, or live browser interactions unavailable here.
- **Unverified**: not tested end to end.
- Never use "All working", "Fully synced" or "Production ready" while any P0 item remains.

## Dashboard — page 1 (current priority)

| Area | Finding | Action / status |
| --- | --- | --- |
| Deep link | `?tab=Dashboard` previously displayed Settings after internal navigation | Route/selected-tab synchronization added in `school-dashboard-integrity.js` with regression test; live post-deploy click still required |
| Cloud save status | Top bar said `ERP saved to Supabase` while fixed cloud conflict panel said `not published` | Conflict guard now overrides visual/accessible badge warning. Actual browser conflict still needs **verified backup-first** resolution |
| Date | Attendance and current-month fees used UTC date near India midnight | Local-calendar date calculation fixed in source and mirrored release bundles; Workbox precache updated |
| Attendance | Percent counted recorded attendance entries, not all enrolled active pupils | Explicit coverage limitation added; actual class/date coverage chart still to be developed |
| Fees | Monthly collection shown beside all-time receipt count; bad/missing payment date could crash calculation | Monthly receipt count uses same date predicate; missing dates are ignored safely; source and bundles mirrored |
| Student/teacher KPI | Browser snapshot could differ from Supabase | Read-only authenticated school-scoped Supabase HEAD count added for active students/teachers, with failure shown as unavailable; do not call it complete data reconciliation |
| Placeholder owner name | Default text `Rajesh` appeared if name missing | Neutral `School Admin` fallback added |
| Quick actions | Add Student, Attendance, Fees, Notice have existing handlers | Static action routing covered; live authenticated navigation/reopen not tested |
| Today's school pulse | Attendance, fees, marks, growth items have destination actions | Source/bundle regression covered; dynamic click verification pending |
| Decorative header icons | Some panel header icons were buttons without a click handler | Marked non-interactive, preserving visual layout |
| Quality score | Derived from current workspace; not independently audited KPI | Must be labeled as local data / cannot claim a cloud score |
| Live verdict | Browser showed a sync conflict and no confirmed cloud reconciliation | **BLOCKED, not production accepted** |

## Other School OS pages — inspected baseline and acceptance gates

| Page / route | Verified evidence | Remaining acceptance check |
| --- | --- | --- |
| School Profile | Main ERP module exists | Save fields, reload, Supabase institution row readback, owner permission and photo |
| Class & Section Setup | 5 class rows in cloud | Create/edit/delete with admin confirmation, dropdown refresh across students/timetable/exams |
| Students | 1 cloud student, profile/photo regression code present | Name/DOB/roll/admission edit → cloud readback → reopen, one photo, no duplicate records |
| ID Cards & Certificates | A4/TC templates and integrity checks exist | Authenticated school data, print layout, unique issued TC number, no invented fee/promotion |
| Teachers | 0 active teacher cloud users | Secure invite, activation, role gate, assigned class, PWA sign-in and attendance write |
| Teachers · Online Access | Role-based portal and assignment readiness exist | Actual teacher/staff sessions; unauthorized API rejection, allowed readback |
| Non-Teaching Staff | ERP module exists | CRUD, salary/leave/attendance persistence and owner reports |
| School Timetable | 0 cloud slots, 0 published periods and 0 active teacher assignments | Bell schedule + class teacher + timetable publish → teacher/student mobile readback |
| Attendance | 1 relational row | Admin/assigned teacher saves, class coverage, duplicate prevention, portal display |
| Homework & Notices | 1 homework record and 2 attachments in cloud | Teacher assigned-class upload, file download, linked student mobile display |
| Exams & Marks | No published marksheets in cloud | Class-based exam, marks entry, edit, publish, parent/student readback |
| Report Cards | Module and A4 template exist | Published-only accurate marksheet including grade, total and component scores |
| Fees | 0 cloud fee entries | Accountant-only collection/reversal/receipt → cloud write/readback and owner report |
| Expenses & Budget | ERP module exists | Owner/accountant role authorization; add/edit/financial aggregates |
| Owner Reports | Owner-only module and tests | Reconcile fees, salaries, attendance, expenses with actual cloud records |
| Transport & Routes | ERP module exists | Persist route assignment, staff permission and report linkage |
| Infrastructure & Assets | ERP module exists | Asset edit/save, quantity/status and audit history reconciliation |
| Parent Messages | ERP module exists | Real messaging, explicit send confirmation, no fake "sent" status |
| Parents App | 0 verified guardian-student links | Real guardian activation and own-child-only RLS + app readback |
| AI Teacher Tools | AI backend/provider routing previously failed HTTP 404; code updated | Deploy current API + authenticated real prompt output; no fabricated generated content |
| Smart Tools | Workbox navigation fallback fixed in code | Live embedded screen without duplicate ERP or broken routes |
| Opportunity Desk | ERP module exists | Working action/save/edit and role permissions |
| Growth Passport | ERP module exists | Achievement save/readback, student-scoped mobile view |
| School Quality Score | Local deterministic scoring exists | Display sample coverage, input provenance, realistic confidence, no false 100% |
| Settings | Web backup/role truth guard added; no native Google Web OAuth | Secure OAuth, remote encrypted backup readback; cloud RBAC and server-side audit |
| Contact & Support | Sidebar module exists | Validate action handlers and outbound support route |

## Release acceptance criteria (repeat on each page)
1. Verify the deployed commit SHA equals the tested GitHub SHA. On Render static site, `docs/` is the publish root.
2. Verify school and role identity via Supabase JWT + RLS; never rely on hidden buttons or a 4-digit PIN as authorization.
3. For every create/update/delete: test successful write, query cloud primary record, reopen browser, verify exact values; for failure, show actionable error and preserve unsent local records.
4. Test empty state, large data, duplicate state, mobile sizing and session expiry. Test actual owned Android PWA/WebView before claiming teacher/parent sync.
5. Check cross-module dependencies (Students → Class, Teacher → Assignment, Exam → Marksheet, Fee → Owner Reports). No fabricated sample data.
6. For sync conflicts, take verified backup first. Never auto-overwrite user records, upload a conflicting snapshot, or reset school data for convenient test results.
7. Keep regression tests green after each change and record the commit SHA + live evidence in this ledger.

## Current live baseline
- Supabase school workspace count 1, revision 36 (read-only query).
- 1 student, 5 classes, 0 active teachers, 0 active assignments, 1 attendance row, 1 homework record, 0 published timetable periods, 0 published marksheets, 0 guardian-student links.
- GitHub Dashboard automated regressions pass in run `43267223278`. A green GitHub build is not itself a live UX verification.
- At last Render check, the last confirmed live static deployment was commit `b21672eca3815351fd4e83d7514903dc6ab6c7a9`, older than Dashboard patches; Render service reports auto-deploy enabled but recent observed deploys were manual. Do not infer production has adopted changes without checking a newer deploy.
- **P0 open:** authenticated browser-local/cloud conflict and actual Teacher/Parent mobile end-to-end sync verification.

## Change discipline
Preserve existing user-defined design, sidebar ordering, module workflows, data and Supabase source of truth. Changes go root + `docs` + `app-extracted/dist` where applicable. No demo seeds, no uncontrolled overwrite, and no secret keys in client.
