# Bright Nexa School OS — Phase B1: Exam Planner and School Grading
Date: 2026-11-04. Development branch stacked on Phase A1 draft PR #37.

## Implemented in code
- Real class/academic-year specific exam subject plans: exam, subject, date, time, duration, maximum marks and draft/scheduled status.
- Configurable school grading policy for each academic year with explicit unique percentage thresholds covering zero. No board-default grading rules are invented.
- Report Cards preview validates each exam subject versus selected pupil class, marks completeness, maximum matches and duplicate/unplanned entries. Provisional grades shown only with no problems; otherwise issues shown.
- Existing marks, Report Cards, teacher/parent portals, Phase A1 reports, settings and offline backup untouched.
- Owner-only school_module_records with Supabase RLS. Migration supabase/migrations/20261104102000_phase_b_exam_plan_and_grading.sql adds allowed module keys and DB unique indexes.
- No student/exam data inserted in live Supabase; migration not applied to live database.

## Not yet complete
- No official exam approval or result publication to parents, no transcript certification, no automatic pass/fail or promotion.
- No authenticated teacher marks ledger or principal review queue, cloud timetable publishing, versioned academic audit, SMS/WhatsApp/email delivery.
- The draft planning feature uses owner-only generic JSON module records, not final normalized foreign-key academic tables.

## Phase B next milestones
- B2: Dedicated marks ledger, approval and publication workflow, printable school-certified results and parent-visible approved reports.
- B3: Versioned and approved cloud timetable publishing with teacher and guardian RLS reads, effective dates and conflict checks.
- B4: Consent-aware messaging outbox, verified contact data, provider integration, retries and delivery receipts, no exposed client secrets.

## Production release gates
1. Test migration and RLS two-tenant allow/deny in disposable staging first; do not apply to the real school yet.
2. Test exam plan/policy create/edit, exact PostgREST return checks, duplicated saves and two-tab concurrency.
3. Test grade audit with different exams, wrong maxima, archived students, unplanned/duplicate/missing marks.
4. Verify parent portal has no access to draft scores or policies; existing printable marks and all 24 owner modules remain intact.
5. Complete Phase A teacher/parent authenticated E2E and independent backup/restore tests before commercial launch.
