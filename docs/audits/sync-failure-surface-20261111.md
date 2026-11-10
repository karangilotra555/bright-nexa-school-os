# Bright Nexa School OS — Sync Failure Surface Audit

Date: 2026-11-11. Main browser ERP, staff/student/parent portals, PWA and Supabase audited against current source.

## Rule
Supabase is authoritative. Do not assert success without a confirmed response/readback; do not silently publish local-only data; do not delete browser data or pending records to resolve a conflict. Network timeouts do not prove that a server write did not commit.

| No. | Surface | Risk / observed failure | Safeguard / evidence | Verification |
| --- | --- | --- | --- | --- |
| 1 | Verified school login / enrollment | Expired session, wrong-school handoff, hung verification | Authenticated school membership + 20s bounded verification; school gate | CI + authenticated browser outstanding |
| 2 | ERP workspace hydration | Local fingerprint mismatch and old revisions | Explicit backup-first cloud open and conflict guard | Controller tests; browser recovery outstanding |
| 3 | Classes / sections / students | Full-workspace mismatch, duplicate upload on lost response | Revision-bound push; exact cloud readback on uncertain commit | CI / class setup tests |
| 4 | ERP save queue / browser storage | Quota exceeded on large school snapshots; pending in-memory before durable save | Verified IndexedDB pending fallback, serialized writes, no false success on failure | Large-snapshot reload test; browser quota simulation outstanding |
| 5 | Another tab/device editing school | Stale revision / concurrent save | Binding consistency checks and safe conflict state; never overwrite unsent remote/local changes | Multi-tab controller tests |
| 6 | Teacher attendance | PostgREST minimal response without row confirmation | Full-row write acknowledgement, read-back of class/day before success | Source/test contract; authenticated teacher pending |
| 7 | Homework and attachments | POST may commit despite network timeout, upload may succeed with lost response | Stable homework ID, readback, verify Storage object before destructive cleanup | Tests for idempotency / UI pending |
| 8 | Fee ledger / payments | Reference input required by UI, RLS no-op, ambiguous POST | Optional secure reference, correction ledger, readback, bounded staff requests | CI; 0 fee records so real payment test deferred |
| 9 | Staff / RBAC / student profile | Partial/no-row mutation silently considered success | Auth + role RLS; PATCH/DELETE must return affected rows; timed client requests | CI; user sessions outstanding |
| 10 | Notices / marksheets | Published data may be absent or delayed | Published-only feed, errors shown and no local success claim | Relevant tests; no published records available |
| 11 | Timetable / substitutions | Multi-step draft and publish flows can partially complete | Server-published timetable RPC; UI errors on failure | Timetable tests; multi-step transaction boundary still a residual risk |
| 12 | Student photos | Storage save committed, signed URL preview fails | Publish success separated from preview availability; bounded upload/sign requests | Source/tests; real photo upload outstanding |
| 13 | Teacher tools cloud drafts | Expired token, hung save, duplicate requests | Authenticated RLS, bounded requests and save readback | Draft tests |
| 14 | Parent portal (fees/attendance/homework) | Hung dashboard/leave request or stale parent view | Bounded fetches; RLS linked-child reads, explicit unavailable state | Parent tests; browser/mobile pending |
| 15 | Android / PWA / deployments | WebView, service worker and Render deploy old assets | Matching script revisions and SHA256 SW fingerprints, mirrored root/docs/PWA | CI + live Render, native APK install pending |

## Supabase read-only baseline on audit
1 school workspace (revision 7), 1 class, 1 student, 1 student profile, 1 active school user; 0 attendance, 0 homework, 0 notices, 0 fee entries, 0 published marksheets, 0 timetable drafts/publications, 0 class teacher assignments. No demo users or school rows added or deleted.

## Constraints and remaining validation
Automated tests can exercise negative paths without changing school records. They cannot establish installed Android APK compatibility, authenticated Teacher ↔ Parent end-to-end propagation, or live photo uploads while the production account has no assigned teachers / attendance / homework. Browser-local pending records are not remotely readable. Do **not** assert every route is fully synchronized on the basis of matching row counts or a green CI badge alone.
