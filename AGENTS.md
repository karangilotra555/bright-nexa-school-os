# Project Preservation Rules

These instructions apply to every coding agent working in this repository. Follow the user's latest explicit request and higher-priority instructions. A request to improve, advance, modernize, professionalize, or fix the project is not permission to redesign or rebuild it.

## 1. Preserve the existing application

- Treat the existing approved application as the product to maintain. Improve it in place.
- Preserve its visual design, layout, sidebar, menu order, routes, screens, fields, buttons, workflows, modules, APIs, exports and existing working functions unless the user explicitly requests a change to them.
- Add new features within existing screens and navigation where appropriate. Do not replace the application with a smaller version, parallel dashboard, generic template, or placeholder.
- Do not remove, hide, disable or simplify an existing feature to make a new feature or test pass.
- Do not replace a real feature with sample data, a hardcoded response, an empty handler or a “coming soon” screen.
- Preserve desktop, browser, mobile, online and offline behavior wherever already implemented. Do not silently convert local storage to cloud-only storage or vice versa.
- Fixing a verified bug is allowed within the requested scope; preserve surrounding behavior and document the intentional difference.

## 2. Establish the actual baseline before edits

- Inspect the current repository, applicable instructions, Git status, entry points and affected flows before changing files.
- Identify the version the user has approved. Use a verified commit/tag or provided build; never assume a version number, screenshot or current HEAD proves approval.
- Record the starting commit and working-tree state. Use a recoverable branch/worktree/checkpoint before implementation. Preserve user changes; never reset, clean, force-checkout or overwrite them.
- If there is no Git repository, make a separate copy of the files being edited. Do not copy credentials or private school databases into the repository or public artifacts.
- Inventory the affected screens, functions and data contracts. For UI changes, capture relevant before screenshots when the app can run.
- An existing AGENTS.md must be read and merged carefully. Do not overwrite unrelated project instructions with this file.

## 3. Keep the change narrow

- Make the smallest coherent change that fulfills the request.
- No unrelated refactoring, file moves, renaming, dependency upgrades, framework swaps, schema rewrites or broad formatting changes.
- Reuse existing components, styles, services and validation before introducing replacements.
- Do not change business rules, calculation formulas, authentication, role permissions or data ownership as an incidental consequence of UI work.
- Do not patch generated bundles when maintainable source is available. Follow the project's build process and preserve packaging entry points.
- Never weaken tests, remove assertions or approve changed visual snapshots merely to hide a regression.

## 4. Approval for structural changes

If fulfilling the request unavoidably changes protected structure or behavior beyond what the user explicitly requested:

1. Complete safe inspection and independent preparation first.
2. Explain the exact screens, functions, files and data affected, why it is necessary, and the smallest compatible alternative.
3. Obtain explicit user approval before making that structural change.

Routine compatible fixes within the requested scope do not require repeated permission. Approval to add one feature does not authorize unrelated redesign or removal of another feature.

## 5. Protect records and access

- Preserve existing records, IDs, relationships, attachments, receipts and audit history.
- Never mix demo/sample records into a real institution. Keep test data in an isolated disposable environment.
- Do not modify, archive or delete real records for testing without explicit authorization.
- Do not reset databases, storage, browser profiles or authentication to resolve an error.
- Preserve role and institution boundaries. Do not bypass authorization to make a screen work.
- Keep secrets out of code, screenshots, logs, reports and commits.
- Schema changes must be necessary, backward compatible where possible, and accompanied by a specific migration, verification and rollback/recovery plan. Never claim a backup is restorable without evidence.

## 6. Verify preservation, not just compilation

- Review the final diff against the starting checkpoint. Every changed file must have a reason tied to the request.
- Run the relevant existing checks. Add focused regression coverage when a bug or behavior change warrants it.
- Verify the requested behavior and the existing flows it affects. A successful build alone is not proof of correct functionality.
- For UI work, compare before/after views at the same viewport: layout, sidebar, menus, labels, forms and navigation must remain intact outside the requested change.
- For School OS, choose relevant checks from: admissions, student profiles, teachers, classes, attendance, fees/receipts, timetable, exams/report cards, settings, backups, navigation and role access. Use safe fixtures for writes and permission tests.
- Keep real financial data and permissions unchanged during verification unless specifically authorized.
- If checks are blocked by credentials, missing data or environment limitations, say exactly what is untested. Do not replace missing evidence with an assumption.
- If an unintended regression appears, fix or revert only the agent's own change before continuing. Preserve unrelated user work.

## 7. Merge and deployment

- Do not push directly to a protected/default branch when the repository requires a pull request.
- Merge/deploy only within the user's authorization and after relevant checks pass. Do not bypass failing CI, branch protection or approval gates.
- An unrelated regression or unexplained structural diff blocks the release of the affected change.
- Keep a known rollback target and distinguish rollback of application code from recovery of changed data.
- This file is an agent instruction, not an automatic technical lock. Do not claim branch protection, CI, visual tests or backups are installed unless they actually are.

## 8. Completion report

Report briefly:

- What changed and why.
- Which existing flows were verified and the evidence/results.
- What remains untested or blocked.
- Whether anything was committed, merged or deployed; include the actual reference when available.

Never claim “all working”, “no features lost” or “fully secure” without corresponding verification.

**Default: preserve the existing product; improve only what the user requested.**
