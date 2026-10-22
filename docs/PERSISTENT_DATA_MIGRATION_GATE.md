# Bright Nexa School OS — data preservation / PostgreSQL migration gate

Status: **migration staging schema deployed; live API NOT migrated**.

## Why this is urgent
The legacy Render service `bright-nexa-school-os-api` uses `node:sqlite`
with `data/school.db` on the Render **Free ephemeral filesystem**.
Stopping/redeploying/spin-down can destroy changes since the last deploy.
The file `data/.server-secrets.json` is also ephemeral unless its secrets are
provided as stable server environment variables.

The existing cloud Teacher Portal uses a separate Supabase school data schema.
Its tables are NOT a drop-in replacement for the single-school legacy SQLite
tables, nor are parent/TC/marksheet pages fully cloud-synchronized.

## Implemented in this migration (safe to use without API downtime)

- Supabase private schema `school_migration`:
  `import_batches`, `import_rows`. It is outside exposed public schemas,
  with no client RLS policies or anonymous/authenticated grants.
  **The staging schema has been applied to Supabase project
  `mrfvbwmyxndrakskqyas`.** The school-facing database is not switched.
- `scripts/export-legacy-sqlite.cjs`: uses a single read-only SQLite
  transaction and PRAGMA integrity check. Writes a lossless, private,
  checksummed JSON archive of `institution`, `students`, `audit_logs`,
  and `rate_limits`. Uses exclusive creation and 0600 permissions.
  Does not copy/print server secrets, does not seed an empty database.
- `scripts/import-legacy-postgres.cjs`: dry-run validates checksums and
  row IDs without database access; `--apply` imports into **private
  staging**, inside an atomic PostgreSQL transaction. Replays are
  idempotent and verified by counts and per-row canonical SHA-256 digests.
  It does not promote data into live tables or enable DOB-based login.
- Node 24 engine pin (`.node-version`, `package.json`,
  `package-lock.json`) matches existing `Dockerfile` (Node 24).
  Backups/credentials are excluded from Git.

## Safe export procedure (only from a machine with ACTUAL school.db)

**Do not perform a Render deployment to add an export button.** On
the Free service a redeploy itself can destroy the file being recovered,
and Free Render does not provide shell access.

If an independent, verified copy of `school.db` exists, or the application
is running on a local machine with it:

```sh
node scripts/export-legacy-sqlite.cjs --db /path/to/existing/school.db --out /secure/brightnexa.school-export.json
node scripts/import-legacy-postgres.cjs --file /secure/brightnexa.school-export.json
```

Review the record counts and SHA256. Do not send a file containing children’s
personal data over public chat/email or commit it to GitHub. Use a private,
encrypted transfer method agreed with the school.

One-time staging import requires a direct PostgreSQL URL held in a local
environment variable `SCHOOL_MIGRATION_DATABASE_URL` with
`sslmode=require`. Never include that URL/password in GitHub, a
browser/PWA script, or public documentation.

```sh
npm install --no-save --package-lock=false pg@8.16.3
# After setting SCHOOL_MIGRATION_DATABASE_URL in a trusted shell:
node scripts/import-legacy-postgres.cjs --file /secure/brightnexa.school-export.json --apply
```

Import output says `staged:true` and prints only counts/hash/batch id.
Check the staging counts in Supabase with a private administrator connection
and make a second independent, encrypted archive before any cutover.

## Critical limitation on the currently live Free Render API

There is no authorized shell or file backup action available for this
Free instance through the currently connected Render integration. The
live API exposes a WRITE snapshot endpoint, but does **not** expose a
secure authenticated all-tables backup DOWNLOAD endpoint. Adding an
endpoint requires a redeploy, which is **not safe** if live data still
resides only on the instance filesystem.

If the only copy of real records is on that running ephemeral filesystem,
a complete lossless migration cannot be claimed. Recover from the last
trusted SQLite copy / school backup before making further API changes.
Do not confuse the fictional demo records with verified real-school data.

## Required before production cutover

1. Verify the true source data, whether students are fictional demo records,
   and the completeness/hash of the independent archive.
2. Verify the school and map the source to a real tenant UUID; do not merge
   one school’s records with a different school.
3. Implement and test production multi-school PostgreSQL CRUD endpoints,
   audited server-side RBAC, and durable secrets.
4. Replace weak Admission Number + DOB with a real guardian identity
   and secure enrolment / password or OTP flow.
5. Make marksheet, TC, fees, attendance and Parents App read/write only
   authenticated cloud records; test independent devices and schools.
6. Take an encrypted PostgreSQL backup; test restore and verify source vs
   destination counts and records.
7. Only then point existing user traffic to the PostgreSQL-backed APIs,
   verify production traffic, and retire the ephemeral legacy SQLite writer.

**DO NOT merge/deploy the migration PR as a substitute for these gates.**
The legacy `server.js` is unchanged by this PR; it will remain SQLite
until the source archive and cloud-compatible routes are verified.
