# Pending fees report implementation plan

Goal: add the first fee-recovery function inside the existing Fees / Collect Fee screen, preserving all three workflow steps and existing styles.

Baseline: ad7ec6b, clean checkout. Work branch: feat/fee-pending-report. User explicitly requested sequential implementation without redesign.

Design: one secondary Pending fees report action in the existing collection header opens the existing modal component. Use selected class, section, stream, session and search filters. Reuse Xn obligations and existing payment/concession/reversal calculations. Separate overdue, due today, future scheduled and unscheduled outstanding. Due dates derive only from a configured valid dueDay and a billing month/year; do not invent annual/one-time dates. Include active students only. Report is read-only; Open fee profile selects the existing student; CSV is escaped. No reminders sent, no payment matching or new records in this first change.

Alternatives: a new dashboard/sidebar destination would scatter finance tools and violate the requested preservation. A new top-level fee step would alter the existing workflow. The existing collection header and modal are the smallest compatible integration.

- [ ] Add failing behavior tests for due-date boundaries, future amounts, no-date amounts, partial payments/concessions/reversals, active-only rows, month-end due days, CSV injection and non-mutation.
- [ ] Implement pure report helper adjacent to the existing fee engine and a report modal in the recovered JSX source. Preserve CSS and all existing code outside the integration points.
- [ ] Use pinned esbuild to rebuild the recovered JSX with its embedded React; preserve named exports and external Excel chunk. Sync only the three deployed bundle copies. Verify all existing tests and source/bundle syntax.
- [ ] Inspect a safe preview if available; explicitly state if browser verification of changed code cannot be completed. Review diff and produce a reviewable branch/PR, leaving real data untouched.

Release limits: no claim of working reminders, bank reconciliation, production/browser verification or a Windows installer until individually tested. Application rollback is the baseline commit; no data migration is involved.
