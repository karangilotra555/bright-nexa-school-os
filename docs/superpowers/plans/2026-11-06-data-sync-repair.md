# School data synchronization repair

Baseline: user-approved 3211e4b, isolated review clone, branch fix/interconnected-school-data. Existing untracked review files are preserved.

User approved Supabase as the primary school database while preserving local/offline records and the latest staff/profile/question-paper changes.

- [x] Repair classroom cascades across homework, exams, marks and fee references without mixing streams.
- [x] Repair legacy snapshot/parent-publishing contracts, decimal amounts, archived statuses and response/error handling.
- [x] Implement authenticated tenant-scoped Supabase adapter, explicit school selection/import, persistent offline queue and revision-conflict handling.
- [x] Preserve offline records with atomic IndexedDB writes, local backups, cross-tab checks and durable edit guards during hydration.
- [x] Prepare migration with stable local/cloud IDs, portal overlays, historical attendance and append-only fee adjustments. External ledgers require explicit reconciliation; unsupported cloud deletions fail visibly.
- [x] Rebuild all three bundles and refresh offline shell/script cache hashes; add behavioral regression checks.
- [x] Final verification: 218 tests, isolated PostgreSQL assertions, cloud dialog and existing profile/queue UI checks pass. Draft PR: https://github.com/karangilotra555/bright-nexa-school-os/pull/49.

Hosted migration/deployment is not performed by this implementation. See [cloud-workspace-migration.md](../../cloud-workspace-migration.md) for the concrete staging verification and recovery procedure. The isolated PostgreSQL fixture approximates production; it does not establish production backup restoration, concurrent-session behavior or signed-in live end-to-end verification.
