# Bright Nexa School OS — Phase 4: Academics, Import & Timetable
Updated: 2026-11-04. Development branch: `phase4/academics-import-20261104` stacked on Phase 3 draft.
**The code is NOT deployed to production.** No Supabase student, marks, staff or other records were written during development.

## Implemented code (not browser-pilot signed off)

### Exams & Report Cards
- Exam mark forms validate active student ID against the currently loaded owner school's roster, subject/exam names, marks >= 0, max > 0, max <= 1000 and score <= max. Only up to two decimal places allowed.
- Duplicate student/exam/subject entries are rejected within the current authoritative owner snapshot, but **not yet atomically enforced by a database unique index**. Concurrent writers, legacy duplicated rows and row-level audit remain release gates.
- Report Card selects one student and **one exam**. It never merges Unit Test/Final marks, grades, or data for another student. Archived students stay available for historical printed reports.
- Invalid and duplicate legacy subject rows produce warnings and block print/export until reconciled; no fabricated grade, rank, pass/fail, promotion or official school scoring policy.
- Printable exam-specific report and local CSV export; dangerous Excel formula prefixes are quoted/neutralized. Exports must be handled as student personal data.
- Current exams use owner-only `school_module_records` JSON entries. This is not yet a properly modeled teacher marks ledger, results publishing workflow, immutable audit log, or parent-visible report card.

### Excel / CSV student admission import (real owner register)
- Supports `.csv`, `.tsv`, `.xlsx` (first sheet), maximum 4 MB and 200 student rows per upload; XLSX formulas/macros are not executed.
- No file uploads during preview: parse and inspect locally; show row-level errors and first 20 valid rows.
- Map admission number, student name, class, optional section/academic year/DOB. Reject ambiguous class/academic year, nonexistent class, future/invalid DOB, duplicate admission in current school (including archived) and duplicate IDs anywhere in the file (including otherwise invalid rows).
- Excel admission IDs with leading zeros **must be stored as TEXT** in the workbook; Excel numeric cells may already have lost leading zeros.
- **All-or-nothing preview:** if one row invalid, the cloud import button stays disabled, and no subset silently imports.
- Explicit confirmation required. Immediately before committing, fetch all authorized class and student IDs from Supabase, re-validate against the latest cloud state, then insert the entire batch in ONE PostgREST POST request (database transaction). No per-row partial creation by the client.
- Verify server returned one matching school-scoped row per requested student. If a network response is lost or uncertain, do not blindly retry: refresh the cloud student roster to distinguish committed vs uncommitted records.
- Atomic DB uniqueness for case-insensitive admission numbers already exists from earlier migrations; cross-school RLS remains the database authority. This workflow cannot replace verified disaster-recovery backups.

### Smart Timetable cloud roster
- Existing conflict-aware Smart Timetable, substitution, performance, and CSV/XLSX audit logic remains intact.
- Optional button loads **cloud classes and teaching staff DIRECTORY names** for a school admin/principal only, after verified Supabase Auth, active role and active institution checks. Reads are restricted to one institution and validated against tenant IDs. Multiple school memberships without explicit school selection are blocked.
- Cloud read is explicit and read-only; staff directory profiles are **not** automatically treated as verified teacher logins or approved qualified subject teachers.
- Imported classes become editable weekly requirements with blank subjects; imported staff have blank qualifications and class assignments. Owner must review subjects/periods and staff permissions manually. Nothing is auto-published.
- Timetable editor starts empty, rather than silently preloading fictional teachers. Optional sample controls remain separate for tool education and never write cloud data.

## Prior phases still block production merge
Phase 1: authenticated encrypted offline snapshot/browser tests and separate backup + verified restore.
Phase 2: actual browser CRUD, permissions, fee idempotency/reconciliation, class/student concurrency and tenancy.
Phase 3: real teacher invite, verified teacher class assignment, verified parent-child linking and cross-tenant authorization testing. Existing Supabase had zero teacher assignments and zero guardians at inspection time.

## Required acceptance checks
1. Run complete GitHub Actions CI.
2. Test admissions preview with a disposable test school: good CSV, quoted commas, duplicate ID in a rejected row, archived ID, wrong school class, similar classes in different academic years, 200 row boundary, future DOB, Excel serial date, leading-zero admission and malformed XLSX.
3. Test a successful single-batch cloud insert and simulate a lost response, race-condition duplicate entry and revoked RLS; confirm none creates duplicate or claims an unconfirmed save.
4. Test unit/final marks on a disposable student and two distinct exam names, edit existing mark, report output, invalid duplicate historical rows, CSV injection and printed layout.
5. Test Smart Timetable cloud import with verified owner, principal, teacher denied, expired session, suspended institution, staff profiles flagged for review and multi-school owner account. Manually set subjects and confirm generated timetable has no teacher clash.
6. Confirm owner offline **read-only** view still loads all new shell scripts and never imports, publishes, or writes while offline.
7. Test mobile/desktop browser flow and accessibility, backup/restore, print margins and school privacy/retention policies.
8. Keep draft PR stacked on Phase 3 until Phase 1–4 acceptance gates all pass. No premature live data migration or deployment.
