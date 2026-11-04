# Pending fees report — validation and release scope

Baseline: `ad7ec6b`. Feature: Fees → Collect Fee → Pending fees report.

This is the first fee-recovery increment. It does not implement or send reminders, store follow-up promises, import bank statements or confirm payments. Existing fee setup, collection, receipt printing/reversal, roles and storage are preserved. No real institution data was used or changed in testing.

## Verification performed

- Baseline existing suite: 69/69 pass.
- Added 8 report behavior tests; observed failures before implementation, then all passed.
- Complete suite after implementation: 77/77 pass.
- Actual generated bundle mounted in jsdom against the baseline deployed bundle, using isolated fake fee/student records. Collection DOM is identical after excluding the one added action wrapper. Existing fee setup and receipt register DOM are identical. Report opens, displays amounts, has CSV export and closes through Open fee profile without calling the record update handler.
- CSS, navigation, schema, application dependencies and package manifests were not edited.
- Rebuilt source and synchronized web, docs and extracted desktop bundles. Updated only their bundle precache revisions to avoid retaining an old script.

## Reproduction

```sh
npm ci
npm test
node scripts/build-school-ui.cjs
# Optional isolated UI test tools; keep them outside the application:
npm install --prefix /tmp/bright-nexa-ui-tools --ignore-scripts --no-audit --no-fund esbuild@0.25.12 jsdom@26.1.0
NODE_PATH=/tmp/bright-nexa-ui-tools/node_modules node scripts/check-fee-ui.cjs ad7ec6b
```

The recovered JSX embeds the existing React runtime. The build uses `w.createElement` and preserves the public module exports used by the existing Excel chunk. Generated artifact diffs are large because the recovered JSX is recompiled; review the 110-line additive JSX change separately. No generated bundle was hand-edited.

## Limits before release

- Full graphical browser comparison of the changed branch, including mobile and dialog sizing, has not been performed. jsdom checks DOM and event behavior, not pixels or layout.
- Real bank reconciliation, paid messaging, production data persistence and Windows installer packaging are outside this increment.
- The report uses current balances and the current fee plan. Changing the comparison date classifies those balances; it does not reconstruct historical receipts or fee-plan edits.
- A billing period with no concrete month/year or no valid configured due day is unscheduled, not overdue. This includes annual/one-time fees in the current model.
- No main-branch merge or production deployment is part of this validation record.

## Manual review steps

1. In an isolated workspace, select Fees → Collect Fee; confirm the original three workflow steps and styles.
2. Filter class, section, academic session and student search. Open Pending fees report; confirm the subtitle reflects the same filters.
3. Check overdue, due today, future and unscheduled amounts against known fixture receipts including concessions and reversals.
4. Export detailed CSV, confirm its obligation lines total to the displayed outstanding balance and spreadsheet formulas are escaped.
5. Open a listed student's fee profile and check existing payment/receipt actions. Do not post a real payment for testing.
6. Check empty filters, narrower desktop/mobile viewports, closing the dialog, and existing fee setup/receipts.
