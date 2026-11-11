# Bright Nexa School OS — Student Profile and Marks Regression Ledger

Updated: 2026-11-12. This file is a durable issue/fix log. Do not mark a feature complete without authenticated browser + Supabase readback.

## User-reported live UI regressions to preserve until resolved
- Student detail modal: excessive whitespace, oversized layout, two presentations of the same student photo (hero + Student Photograph panel). Keep **one prominent photo** and retain photo upload/change separately in the editor. Do not remove existing photo data or storage paths.
- Student detail fields: no obvious working edit action. Required: an Edit control with prefilled fields, Save/Cancel, Supabase-confirmed persistence, error/retry, and correct readback after reopening. Do not substitute display-only editing or silent local saves.
- Student roster IDs: Roll Number, Admission Number, and Permanent Student ID must have clearly separate ownership/creation rules; do not auto-generate conflicting IDs or claim sync without cloud readback.
- Marksheets: no artificial split of one overall score into PT/Notebook/Enrichment/Annual. Score components must reflect actual corresponding entries. Marksheet preview is not a source of truth for grade entry.
- Authenticated ERP browser context showed **School sync conflict — not published** and no marks/examinations configured. Never label all synced while this conflict is present. Preserve unsent local data; do not overwrite/delete or auto-run recovery.
- Preserve sidebar/menu routes, role permissions, signed-photo security, and existing working screens while fixing.

## Completed code changes
- 2026-11-12: `marksheet.html` and `marksheet-a4.html` plus docs and dist mirrors now display blank missing component scores rather than fabricate values, with a regression test.
- 2026-11-12 earlier: restored admin portal ERP links, made desktop nav independently scrollable and mobile links visible, added sidebar regression tests.

- 2026-11-12: `school-profile-modal-ux.js` added to all ERP release mirrors: visible header Edit details button delegates to existing edit action, duplicate Student Photograph card hidden only when it displays the same hero image, modal default width constrained; automated regression verifies existing edit callback and preserved other attachments. This is a UI-only repair, not proof of cloud persistence.
- 2026-11-12: Workbox index checksum refreshed after ERP script inclusion; GitHub CI run 43092872900 completed successfully.

- 2026-11-12 sync conflict follow-up: direct read-only production Supabase check confirmed workspace revision 33, one student in the authoritative snapshot and one matching relational student record. This does not reveal browser-local pending edits.
- `school-workspace-controller.js` plus docs/dist mirrors now attempts exact RAW cloud readback for **clean** browser snapshots with stale checksum metadata, and repairs metadata only on equal fingerprints and stable binding/generation. Real divergence uses verified-owner, backup-before-replace recovery; failed automatic recovery now reports its underlying error. Pending edits are never silently uploaded or dropped. A focused regression test was added and GitHub CI run `43093976035` passed.
- Deployment and authenticated browser-local recovery still require independent verification. Never report cloud conflict as resolved on the user's machine without the device actually reaching `synced` and verifying a subsequent readback.

- 2026-11-12: Responsive marksheet control toolbar repaired in `marksheet.html` and `marksheet-a4.html`, including docs/dist mirrors: flex wrapping, full-width action row, flexible selects, non-breaking button labels, compact mobile layout. A4 printed sheet design preserved. Regression test added to `tests/marksheet-component-integrity.test.cjs`; CI run `43094684525` passed. Live Render deployment still needs verification.

## Verification still required
- Live authenticated student edit/create/reopen and Supabase readback; photo once + upload/change; marks entry via exam form + portal published feed; Cloud sync conflict recovery with explicit backed-up local records; native Android.
- Main ERP profile and student editor live in the large React source/bundle; they were **not modified by the marksheet patch**. Do not say editing or duplicate photo is fixed.
- No demo/new records created, no student data deleted, no owner permissions relaxed.
