# Bright Nexa School OS — Dashboard page audit (12 November 2026)

**URL:** `/index.html?openSchool=true&tab=Dashboard`

## Scope and evidence
- Observed authenticated Render tab through the connected browser's read-only page context. The URL said Dashboard while the visible content was Settings & Data Safety. Top cloud badge claimed "ERP saved to Supabase", while an open cloud alert said "School sync conflict — not published".
- Inspected the compiled React Dashboard and source, navigation, status controller, Workbox manifest and authenticated RLS paths.
- Read-only Supabase SQL: 1 active student, 0 active teacher cloud logins, 1 attendance row across history, 0 fee entries, 1 workspace. These are cloud counts; ERP's separate local roster can differ.
- No mutation of any institution, student, teacher, fee, attendance, photo, credential or backup was performed.

## Confirmed code issues / changes
1. **P0 — URL and visible tab differ.** Dashboard deep-link could show Settings when tab state changed while query parameter remained `Dashboard`. Added `school-dashboard-integrity.js` in root/docs/dist to align navigation with the URL, honor initial Dashboard deep-link and update the query on active navigation changes. No React state is persisted or school data changed.
2. **P0 — falsely reassuring cloud indicator.** An actionable `bn-cloud-publish-status` alert can remain open while the independent React topbar badge says "ERP saved to Supabase". The guard now visibly states **Sync conflict — not published**, sets an accessible warning and does not write any local/cloud records. This is a presentation safety correction, **not** device-side conflict resolution.
3. **P1 — UTC day boundary.** `new Date().toISOString().slice(0,10)` was used for "today's" attendance and the fee month in Dashboard code; UTC 00:00-05:30 differs from the device's India calendar day. Updated both React source and all published compiled bundles to derive date from local year/month/day. Service worker compiled asset checksum synchronized. Added India-midnight date regression.
4. **P1 — attendance score denominators.** 100% represents proportion among available recorded entries, not coverage of all enrolled students. Adds clear visible coverage caveat, without manufacturing attendance records or altering calculations.
5. **P1 — local versus cloud teacher/student counts.** The student and teacher KPI counts come from ERP snapshot, not necessarily current Supabase `school_students` or active `school_users`. Added JWT-scoped, institution-filtered **read-only HEAD** exact counts for active students and teacher accounts, with separate, clearly labeled Supabase figures on the same KPI cards; failures show "Cloud count readback unavailable". Does not overwrite React counts, leak cross-school data, or fake a save. Ensures a school switch cannot reuse another school's cached counts.
6. **P2 — misleading fees label.** Dashboard amount is for current month; receipt count is also filtered by payment status in the local ERP. Label now explains that values come from the local ERP and require cloud confirmation.
7. **P2 — nonfunctional panel overflow icons.** Dashboard panel headings created icon-only buttons without action handlers; these are disabled/non-focusable and hidden as decorations, preserving real Quick Actions.

## Dashboard quick action wiring (source inspection)
- Add student → opens existing student admission form.
- Mark attendance → existing Attendance module.
- Record fee → existing Fees module.
- Create notice → existing Homework & Notices module.
- View improvement plan → School Quality Score (computed from local school records; not an independent verification of school quality).
- Sidebar has numerous ERP modules and staff/mobile links; their navigation controls exist, but **live click → save → Supabase readback → reopen** was not performed by the read-only browser tool. Do not classify these end-to-end as verified.

## Remaining work / release criteria
- The device currently displays **School sync conflict — not published**. Requires explicit safe browser-device recovery with verified local/pending backup; cannot claim all green from Supabase admin SQL alone. Do not delete/overwrite local data as an audit shortcut.
- Verify active student/teacher cloud count labels against a live Render deployment and ensure React rerenders, local school switching, and attendance date behave correctly.
- Cross-check Dashboard fee receipts and attendance coverage with authenticated RLS requests and a real school-day test.
- Render static site has autoDeploy enabled, but the last confirmed live deployment was an older commit at the start of this audit. Do not mark new code live until Render's deployed commit and visual readback match.
- Automated GitHub Actions build + suite passed on run `43267223278`; these are automated checks, not authenticated production acceptance tests.

## Preservation rules
Keep the approved ERP design, sidebar/menu order, routes, active Supabase schema, RBAC, school records, backups, existing imports/exports and PWA integrations unchanged unless a targeted verified defect requires a specific adjustment.
