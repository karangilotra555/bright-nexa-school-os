# Phase 1 — School OS data safety / offline foundation
Date: 2026-11-04. Branch: `phase1/offline-data-safety-20261104`. PR #28.

## Non-negotiable constraints
- Retain **Haridwar Public School** and all current authenticated records, menus, role checks, and modules.
- Do **not** re-enable sample/demo login and do not replace real school records with fixtures.
- Keep `main` / Render production unchanged until documented pilot acceptance.
- No service-role key, Auth tokens, passwords or plaintext student records in browser offline stores.

## Implemented in this draft PR
1. `docs/offline-vault.js`: optional school/user-scoped AES-256-GCM encrypted IndexedDB snapshot; PBKDF2-SHA256 passphrase-derived key with random salt; 24-hour max snapshot age. No passphrase or key stored on disk.
2. `docs/owner-offline-ui.js`: opt-in **Enable offline copy** action for a verified school owner, password-type modal, and an offline **read-only** unlock path. School membership snapshot is encrypted, not presumed to remain valid forever.
3. `docs/owner-offline-sw.js`: only caches the owner HTML/JS shell; never intercepts Supabase Auth, REST requests, or child/staff records.
4. `docs/real-owner-workspace.js` / `.html`: save an encrypted copy after a successfully verified cloud reload when the owner has opted in; try read-only fallback on a network failure. Every mutation remains cloud-only and fails closed when offline.
5. `entry-sw-reset.js` and published mirror: retire legacy Workbox while preserving the new owner offline shell worker.
6. `docs/offline-vault.js` includes a **non-connected** encrypted outbox with acknowledge-before-delete behavior for future syncing. Fees are explicitly barred from queueing until server-side idempotency and ledger reconciliation exist.
7. Existing obsolete demo-mode tests now check the actual owner-login flow. GitHub CI has passed **122 tests, 0 failures** as of the initial phase branch run.

## Not yet done / release blockers
- This is **not** a finished online+offline bidirectional school ERP. Offline student admissions, attendance, fees, employee editing, homework and permissions are **not active**. No changes made to the production database.
- **No independent backup has been created.** The Supabase organization is currently on the Free plan. A separate encrypted offsite `pg_dump` backup, documented credentials management, routine schedule, retention, and verified restore to an isolated database are required before real-school launch. A browser cache cannot replace this.
- Need owner and teacher airplane-mode, restart, multiple-device, wrong passphrase, device-loss and browser-storage-eviction pilot tests. CI unit tests do not cover real browser/Android behavior.
- Need authenticated server-side idempotency on each queued record, conflict handling, unique operation IDs, atomic acknowledgements, retry backoff, and role/suspension revalidation. **Never replay fee payments on timeout without checking the authoritative ledger first.**
- Need durable export/privacy controls, verified cloud Auth renewal, logout/session revocation behavior, school-specific retention and backup policy.
- Need Supabase security review: Auth leaked-password protection warning, four authenticated SECURITY DEFINER function warnings (verify intended grants and checks), and test multi-school RLS. Do not grant broad access to quiet lint warnings.
- Confirm Render production deploy policy before any merge; deployments currently track `main`.

## Explicit acceptance procedure
1. Record existing school table counts and create external encrypted database backup.
2. Restore to a non-production database and compare record counts/foreign keys.
3. Test verified online owner login, manual opt-in, local encrypted snapshot and read-only offline reopening on the same device. Verify local DB contains ciphertext, not names.
4. In airplane mode, confirm ALL edits visibly fail closed: no fake success or false `synced` status.
5. Reconnect; verify login re-check, tenant isolation, role restrictions, and cloud-origin data consistency.
6. Add a tested idempotent sync backend and enable offline edits in incremental modules **only after** data-safety proofs.
7. Keep this PR draft until manual pilot and backup gates are approved.

## Recovery note
If an owner forgets the offline passphrase or the browser deletes IndexedDB, the offline copy is unrecoverable; the verified cloud database remains authoritative. Treat the offline copy as **convenience, not disaster recovery**.
