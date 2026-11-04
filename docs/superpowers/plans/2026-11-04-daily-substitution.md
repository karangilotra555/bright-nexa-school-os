# Daily substitute adjustment

Baseline ad7ec6b. Separate branch from fee PR #43; preserve existing styles, navigation, timetable and single-teacher suggestions.

Add a Daily adjustment worksheet inside the existing Substitute section. User chooses a real date, marks multiple absent teachers, sees affected lessons, confirms a qualified/free substitute and exports the dated adjusted day. Each confirmation must re-check all absence, original timetable, subject/class restrictions, unavailability and daily load including earlier covers. No double booking, no automatic substitution or invented qualified teacher. Uncovered lessons stay visible.

The existing timetable is in-memory browser planning, not a persisted production calendar. This increment uses the same scope, labels confirmations as worksheet decisions and provides export; it does not claim staff notification, authenticated principal approval or cloud/attendance integration. No real record, role, messaging or storage change. Date/absence/plan changes invalidate the worksheet and its export. Existing single-teacher output remains available.

Tasks:
- Add failing pure-engine tests for dates, multiple absences, cumulative covers, daily caps including zero, class/subject/unavailability, stale confirmations and non-mutation.
- Add engine worksheet/confirmation functions; do not rewrite existing schedule/substitutes APIs.
- Add controls using existing form/button/table classes in Substitute only. No CSS edits. Revalidate on every confirmation, clear stale outputs when inputs change, export actual adjusted day with explicit uncovered statuses.
- Mirror existing static files to docs. Run full tests and DOM integration checks using fixtures. Preserve the existing three timetable/absence controls and old result flow.
- Publish a draft branch/PR; disclose graphical browser review limits before release.
