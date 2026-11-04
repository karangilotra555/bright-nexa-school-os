# Attendance follow-up increment

Baseline ad7ec6b. Independent branch from fee PR #43 and substitute PR #44. Preserve Attendance's five tabs, marking, holiday controls, staff/payroll flows and CSS.

Add one owner/admin action on the existing Students attendance header, opening the existing modal. Show class/section marking coverage for the selected date and a selected-class follow-up list based on recorded absences in a configurable calendar window (default 30 days, repeated threshold 3). Unmarked is never absent; explicit student holidays are excluded. Duplicate conflicting student/date records are flagged and excluded from absence counts. Ambiguous class/session mapping is flagged, never guessed. Future dates cannot be used as missing-attendance alerts.

Follow-up is a manual contact log, not automatic messaging or an eligibility decision. Owner/admin records Open, Contacted or Resolved, contact method/date, notes and optional next follow-up. Append events to optional operations.attendanceFollowUps using the existing onUpdate/persistence/backup path; preserve attendance arrays and all other operation fields. Revalidate the incident before saving. A later absence gets a separate case; unresolved older confirmed incidents stay visible until resolved even if outside the selected analysis window. Corrected attendance removes an invalid incident from current action lists without erasing contact history.

Use the existing selected class/date and current roster; do not reconstruct historical enrollment or invent working-day rules. Parent/student/teacher UI permissions are not expanded: only OWNER/ADMIN gets this new report/contact action.

- Add failing pure tests for unmarked vs absent, holidays, duplicates/conflicts, thresholds, class/stream scopes, open-case carryforward, resolved/new incidents, future dates, event validation, role checks and non-mutation.
- Implement report + append-only event builder; integrate existing modal and styles, existing onUpdate and optional default array.
- Rebuild source with pinned esbuild, preserve root/docs/desktop bundle mirrors and update precache revision. Preserve source/build helpers from #43 without importing that feature.
- Run complete suite, source/build parity and optional jsdom flow/persistence checks with isolated fixtures; obtain code review and publish draft PR. Disclose graphical/mobile verification limits.
