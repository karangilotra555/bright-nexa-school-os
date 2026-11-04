# Daily adjustment worksheet — validation

Location: existing Smart Tools → Substitute → Daily adjustment worksheet. Existing single-teacher suggestions remain unchanged. Fee PR #43 is separate and is not included in this branch.

## Implemented

- Real calendar date with generated-timetable working-day validation.
- Multiple full-day absent teachers, all excluded from cover candidates.
- Qualified class/subject matching, original timetable clashes, unavailable slots and cumulative daily capacity checks, including zero capacity.
- Explicit named worksheet confirmation and undo; every confirmation rechecks all prior decisions.
- Adjusted-day CSV includes confirmed substitutes, named reviewer and unresolved periods. An unresolved absent teacher is not exported as still assigned.
- Date/absence changes clear stale worksheet decisions after confirmation when needed. Editing timetable inputs, days or periods invalidates timetable and worksheet exports. Regenerating asks before discarding confirmed covers.

No CSS block, sidebar, top-level tab, schema, role, database or real school record was changed. The new controls reuse existing styles inside a collapsed section.

## Scope

This is a session-only planning worksheet using the existing generated timetable. Export before closing or changing the plan. It does not save cloud duties, mark actual teacher attendance, authenticate the reviewer, send staff notifications or integrate a school holiday calendar. Existing single-teacher suggestions still refer to the original weekly plan and are labelled accordingly. The original weekly plan is never rewritten by a confirmation.

## Checks

- 8 new engine tests failed before implementation, then passed. They cover multiabsence, concurrent class clashes, cumulative workload, zero capacity, unavailable/subject/class restrictions, invalid/nonworking dates, duplicate/unknown teachers, stale/forged confirmations, reviewer validation and non-mutation.
- Optional jsdom test preserves the CSS byte-for-byte and five existing tabs; exercises legacy suggestions, confirmation, undo, actual CSV contents and invalidation. A new regression assertion reproduced and caught stale exports after period-count edits, then passed after the fix.
- Full repository suite: 77/77 passing (69 baseline + 8 daily-adjustment tests; separate fee-branch tests are not part of this branch).
- Graphical browser/mobile comparison is still required before production release; jsdom cannot establish layout, overflow or pixel parity.

```sh
npm ci
npm test
# Optional DOM integration test tools outside application dependencies:
npm install --prefix /tmp/bright-nexa-ui-tools --ignore-scripts --no-audit --no-fund jsdom@26.1.0
NODE_PATH=/tmp/bright-nexa-ui-tools/node_modules node scripts/check-daily-substitute-ui.cjs
```

No production deploy or Windows package rebuild is claimed by these checks.
