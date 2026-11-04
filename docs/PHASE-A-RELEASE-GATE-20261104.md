# Bright Nexa School OS — Phase A Release Gate
Date: 2026-11-04

## Phase A goal
Make daily school operation dependable for **fee collection, attendance, verified teachers/parents, and backup/disaster recovery** before broad feature expansion.

## Phase A1: Implemented on development branch (not on live main)
Branch: `phase-a1/fees-attendance-20261104`
PR: https://github.com/karangilotra555/bright-nexa-school-os/pull/37

### Finance, reporting, receipts
- Exact charge/payment ledger per active child and optional archived child; class/admission search; month collection totals; positive unpaid recorded balance and separate advance-credit balances.
- **NEVER** label unpaid ledger balance "overdue": school fee due dates, approved concessions, fees by month/grade, late fee policy and payment allocation do not yet exist.
- Download formula-safe balances CSV. All calculations derive only from current school-scoped, RLS-read ledger rows.
- Generate a printable **payment acknowledgment** only for a real recorded payment with receipt reference and matching verified school/student IDs. Not a GST invoice, official bank settlement confirmation or payment gateway.
- Malformed ledger rows block report export; none are silently included in total.

### Attendance
- Full, paginated cloud fetch for a selected month, by class and student; no reliance on the owner's old 200-row recent-attendance dashboard limit.
- Present, absent, late and excused breakdown with per-student **percentage among marked days only**. Today's unmarked students are not falsely marked absent.
- Per-student and per-day CSV exports, including missing daily marking coverage. Duplicate or invalid marks trigger visible issue warnings.
- A school holiday calendar, timetable of mandatory instructional days, approved leaves and real absence alerts have not yet been implemented.

### Today’s Operations
- Read-only dashboard cards with today’s recorded/unmarked attendance; month collections and recorded unpaid fee balance; pending parent leave requests; active teacher account vs staff-directory profile counts; teacher-class assignment, verified parent account and child-link readiness.
- Connected shortcuts route to the actual teacher invitation, guardian linking, class attendance and fee ledger modules.
- A setup warning is based on confirmed school data, not demo records; no synthetic income or student attendance.

### Security and preservation
- Existing Supabase RLS governs all reads; no anonymous data reads; no service_role key; no changes to existing school records or owner credentials.
- New pure reporting functions and UI loaded before owner controller; owner offline shell cache version updated. Read-only offline snapshot cannot claim a fresh financial/attendance report.
- Existing 24 sidebar modules, Settings and backup encryption remain in place; new Phase A1 panels supplement, not replace, them.

## Remaining Phase A milestones (NOT done)
A2 — Fee structures per class/session, approved concessions, billing schedules and due dates, safe charge generation, auditable reversals, receipt numbering and real payment reconciliation. Do not bulk-charge children without a dry-run and isolated DB testing.
A3 — Class attendance calendar/holidays/leave sync, teacher validation pilot, daily class completion reports, approved absent notifications and reports.
A4 — Real teacher invitation/auth activation, class rights and attendance/homework on two verified test accounts; real guardian email verification, approved child linking, pending leave and notices.
A5 — **Independent off-site automatic backup** and a tested restore into an isolated Supabase project with counts, foreign key integrity and RLS checks. Existing local passwordless backup download/readback is not a verified cloud recovery process.

## Release criteria before production merge
1. GitHub CI fully green; latest Phase A1 integration tests currently 192/192 (verify latest status again before merge).
2. Signed-in owner browser desktop/mobile smoke: fees filters, CSV export, one confirmed real payment receipt, old archived record, month attendance filter and 500+ school marks pagination.
3. Test privacy/tenant denial with two **disposable** schools, accountant restrictions, teacher read rights, revoked guardian links.
4. Reconcile report charges and payments against exact Supabase SQL for a dedicated isolated test school, not just UI test data.
5. Explicitly confirm no fee entry is ever generated solely by opening a report and no unmarked student becomes absent.
6. Keep original Haridwar Public School data unchanged; do not create financial/attendance test data in its production account.
7. Verify backup restore, RLS and incident recovery before selling as production-ready ERP.

### Production data status when starting Phase A
Observed live school: 34 students, 20 staff directory profiles and 20 class-sections; no teacher class assignments, linked parent accounts, attendance entries or fee ledger entries. Automated unit tests do not prove real teacher/parent onboarding works.
