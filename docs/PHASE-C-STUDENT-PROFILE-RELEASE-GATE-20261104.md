# Bright Nexa School OS — Phase C1
Date: 2026-11-04
Branch: phase-c1/student-profiles-documents-20261104 — stacked on Phase B1 draft #38, itself stacked on Phase A1 draft #37.

## Implemented code
- Owner **Students → Student profile & document checklist**. Select a current or archived student. Open private guardian, emergency contact, address and admission-date editor.
- School-owned contact records stored separately from the canonical student register. Validation checks phones, email, dates, length and same-school/student identity; optimistic updated_at concurrency check and exact PostgREST returned-row confirmation.
- Separate document receipt checklist: admission form, birth certificate, guardian ID, student photo, transfer certificate, address proof, other; statuses not received, received and manually verified by owner. Verification captures authenticated owner UUID and timestamp.
- Documents are **metadata records only**. No uploaded files, no claiming government verification, no issuing/certifying digitally signed certificates.
- Two new private tables have same-school composite FKs, owner-only RLS SELECT/INSERT/UPDATE, no DELETE grant/policy and unique institution+student+type. No parent, teacher, accountant or public read of private guardian data.
- Data remains on demand, not put into localStorage or the general student page state. Existing 24 owner modules, admissions, archived students and fee/attendance histories are preserved.
- Encrypted local backup now includes both private tables. Legacy encrypted backups with the previous 16 tables remain readable; note that such older backups **do not contain** the newly added private data.
- SQL migration is staged in repository and **not applied** to production Supabase; no actual student data modified.

## Phase C remaining
- C2: Verified school documents / transfer-certificate registry, signed issue workflow, safe PDF, revocation and QR verification backend. Existing legacy static QR prototype is NOT a certified document service.
- C3: Library catalog, copy inventory, loan/return events and overdue calculations with full audit and staff permissions.
- C4: Transport route/student assignments, parent pickup contact permissions, linked transport fees and safety notices.
- C5: Staff attendance-to-payroll calculation with payslip generation, tax/statutory rules review and audit; do not invent salary entries.
- C6: Advanced owner dashboards for academics, finance and staffing with class/session filters; saved exports.

## Required release gates
1. Apply Phase A1, B1 and C1 migrations only to a disposable staging Supabase first. Test two schools, owner vs teacher/parent/accountant allow/deny and a revoked account.
2. Test active and archived child, stale updated_at conflicts, duplicate doc statuses, guardian contact creation/edit, verified owner attribution.
3. Browser check existing owner Students form, school Settings, teacher/parent portals, downloaded backup and restored copy.
4. Test prior backups and complete new backups against independent restore. Protect private student address and guardian information.
5. Do not deploy this stacked branch to live main until preceding Phase A/B release gates and staging verification pass.