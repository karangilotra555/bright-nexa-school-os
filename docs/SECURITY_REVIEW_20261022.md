# Bright Nexa — Security review follow-up
22 October 2026 · Scope: connected GitHub `main` and Bright Nexa Supabase project

## Finding: nested RLS expressions were incorrectly correlated — HIGH

Some earlier RLS policy subqueries used unqualified outer column names. Postgres resolved expressions such as
`u.institution_id = institution_id` and `s.class_id = class_id` inside subqueries to self-comparisons instead of matching the target attendance/homework/assignment row.

This was not flagged by automated Supabase advisor. It potentially weakened write-time tenant and class consistency checks, even though existing role-level checks also apply.

**Fix applied to the actual Supabase project:**
- Replaced attendance, homework and teacher-assignment write policies with qualified outer relations.
- Added composite foreign keys to enforce matching school and student class for attendance, matching staff tenant for attendance recorders, and matching staff tenant for homework creators.
- Removed all `anon` table privileges on eight school tables, in addition to existing RLS.
- Repaired six policies and created four relational constraints. Migration SQL is stored in `supabase/migrations/20261022_fix_teacher_rls_correlated_tenant_checks.sql` and `supabase/migrations/20261022_revoke_anonymous_school_table_grants.sql`.

**Verified:** A real Postgres transaction using a simulated authenticated subject teacher allowed their own class attendance, denied a forged other-school student attendance row and denied out-of-subject homework. Test transaction was fully rolled back. Audit query verified new foreign keys, policy definitions and absence of anonymous table grants; project remains empty of fictional schools/students.

## Review report triage

| Original finding | Reassessment | Action |
|---|---|---|
| Laptop local branch behind GitHub | Workstation needs `git status` to determine if pull is safe; no access from connected GitHub account to laptop filesystem. Production is cloud-first; a local copy is optional. | No remote PC pull claimed or performed |
| Hardcoded Supabase publishable key | **Expected/public** by design; publishable client keys are not secret. Never embed `service_role` / `sb_secret_` keys in browser. | Verified RLS and tightened anonymous grants; regression test |
| 800+ line `server.js` | Legacy Node/SQLite pilot, not the cloud tenant authorization source. A structural refactor needs route-level behavior/contract tests first. | Schedule separate modularization; avoid risky rewrite during live security changes |
| Missing `.env.example` | Verified missing. | Added an explanatory, placeholder-only `.env.example` |
| Duplicate logo files | SHA claim not independently verified and consumers need an asset reference audit before deletion. | No unsafe deletion performed |

## Other material limitations

- Supabase school table `school_audit_events` has RLS enabled **with no client policies**. This is *intentionally* unavailable to standard users and is only written by privileged server-side code; Supabase advisor labels it informational (`rls_enabled_no_policy`). Do not grant teachers audit log reading to silence the warning.
- All school tables were empty when auditing. Initial admin onboarding and Auth invitation redirects still need end-to-end confirmation before sending staff credentials to real schools.
- The core school demo's UI and Parents App are not yet end-to-end synchronized through a verified multi-school production database.
- Legacy student admission number + DOB authentication on Node/SQLite is for testing; not an acceptable real parent authentication mechanism.
- Claims of GPG-signed commits or duplicate assets in the supplied review were not independently verified in this pass.

## Workstation instruction (ONLY if someone needs the local developer checkout)

With a clean working tree and the correct checked-out repository, run:

```bash
git status --short
git fetch origin
git status -sb
git pull --ff-only origin main
```

Do not `git reset --hard` or force pull over uncommitted school project work. The user does not distribute local software to schools by default.
