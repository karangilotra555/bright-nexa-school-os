# Bright Nexa School OS — Cloud Pilot Release / Acceptance Gate
Updated 3 Nov 2026.

## Source of truth
- **Real** school login and staff attendance/homework: \`/index.html\` (Supabase Auth + RLS).
- **Real** school accounting, parent identity link, notices, and leave approvals: \`/school-operations.html\`.
- **Real** verified parent cloud browser portal: \`/parents-cloud.html\`. Requires verified email + school-admin link to each child; cannot access school data before approval.
- **Fictional** owner React dashboard: \`/school-demo.html\`. Never use to enter real student records or expect cloud sync.
- **Legacy** Node/SQLite API and Android Parents Demo APK: *not* the authoritative cloud database. Do not distribute either to parents as the production app.

## Functional controls implemented
- Separate institutions with row-level security, verified admin/staff identity and per-class teacher permissions.
- Unmarked students stay unmarked in the cloud attendance form; only explicitly selected attendance statuses are upserted.
- Immutable \`school_fee_entries\` fee/payment ledger, exact \`school_fee_balances\` and school-wide \`school_fee_summary\`, constrained to permitted staff and linked guardian.
- Guardian linking is school-admin-only and requires an existing verified Supabase Auth email. Guardian links can be revoked; both actions write privileged audit events.
- Verified guardian parent access to only approved student's roster, attendance, homework, fees, school notices, and own leave requests.
- Staff cannot use suspended/closed school memberships to read or write academic records.
- No real student/sample/parent data was seeded in the new project. Synthetic RLS tests were executed in transactions and rolled back.

## Before any real-school launch — mandatory actions
1. Select a legitimate school administrator and institutional authorization. The DB currently has no real schools/staff/students.
2. Confirm Supabase Auth email verification, URL allowlist for \`https://bright-nexa-school-os.onrender.com/teacher-access.html\` and \`https://bright-nexa-school-os.onrender.com/parents-cloud.html\`, email deliverability, password reset, rate limits and CAPTCHA.
3. Check database uptime, retention/backup plan, and funded always-on hosting. Free environments can become inactive; no production SLA is claimed here.
4. Owner: Create School, verify email, then create a trial school. Admin: add class, one *authorized* test student, invite teacher; verify class-specific permissions.
5. Parent: self-register + verify email; school admin links parent's exact verified email to the test child; confirm login, attendance, fee, notice and leave requests.
6. Explicitly test outsider and two-school isolation, revoking guardian permission, duplicate admissions, staff account suspension, staff password reset, and rollback/restore from backup.
7. Only onboard real students after an institutional privacy review, retention policy, consent, data export/deletion, receipts/finance reconciliation and support procedures are approved.

## Not yet in production parity
- The large React owner **sample** modules (marksheets/exams, advanced timetable, transport, payroll, ID cards) still do not write to this cloud database.
- Android Parents Demo APK has **not** been converted and release-tested against verified guardian cloud accounts. The verified parent browser portal is available, not a production APK.
- Real end-to-end Auth verification / SMS/email delivery / first institution acceptance tests need real accounts and explicit school approval.
- Full load/performance testing, backups with verified restore, monitoring/SLA, payment-gateway integration, and legally required privacy policies remain separate release gates.

**Release classification:** cloud pilot foundation, not production-approved for live children/parent data.
