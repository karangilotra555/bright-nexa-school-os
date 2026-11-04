# Bright Nexa School OS — Phase D1 Platform Administration Release Gate
Date: 2026-11-04
Development branch: `phase-d1/saas-admin-20261104`
Stacked on Phase C1 draft PR #39 (which includes Phase B1 #38 and Phase A1 #37).

## Goal and implemented scope
Prepare the existing multi-school Supabase platform for professional SaaS operation, without weakening each school's private-record isolation or asserting payment functionality that has not been built.

1. **Separate platform administrator:** `bn_platform_admins` grants access only to explicitly provisioned Auth UUIDs. Default `active=false`. Authenticated accounts can SELECT their own membership row and cannot create, edit or delete it. A school owner `school_users.role='school_admin'` is **not** implicitly a platform admin.
2. **Tenant portfolio:** A separately authenticated `docs/platform-admin.html` console lists existing Supabase `institutions` metadata (name, ID, operational institution status) and subscription assignment status. No student, parent, guardian phone, fees, academic marks or payroll table access is granted.
3. **Plan catalogue:** Internal `bn_saas_plans` seed labels `pilot`, `standard`, `custom`; **no prices, quotas, payment collection or subscription enforcement**. These are operational labels only, not contracted packages.
4. **Manual plan assignments:** Platform admin can add or update the plan label, administrative state (`trial`, `active`, `paused`, `ended`), start/end dates and an internal note. Cross-tenant modifications are deliberately allowed only for approved platform admins, with row permissions in Postgres. Normal school admins can read *only* their school's own subscription row; they cannot update it or read the platform list.
5. **Immutable subscription history:** A protected trigger in the private database schema writes old/new plan and state, actor and timestamp to `bn_subscription_events`; API users get SELECT only (platform admin) and no edit/delete permissions.
6. **Fail-closed console:** Supabase Auth identity verified, separate session from owner login, one matching active platform membership required before any dashboard. Every saved plan must be confirmed by returned school ID, plan, state, date and actor. Existing `updated_at` is checked before PATCH to reject stale concurrent edits.

## Code delivered
- `supabase/migrations/20261104153000_phase_d1_platform_admin.sql` (staged only).
- `docs/platform-admin.html` + `docs/platform-admin.js` + `docs/platform-admin-core.js`.
- `tests/phase-d1-platform-admin.test.cjs`.

## Critical release / operational limitations
- The migration **has not been applied to production Supabase** and there are no platform admin memberships or real subscription rows created by this branch.
- There is **no payment gateway, tax invoice, bank settlement reconciliation, automated renewal, usage quota enforcement, tenant suspension, plan entitlements or school onboarding invitations**.
- Changing `bn_school_subscriptions.status` does **not** modify `institutions.status` or activate/suspend any access. Deliberately avoid accidental school outages.
- There is **no automatic tenant-usage or service health metric collector yet**. Tenant counts represent institution/assignment metadata only, not billing metrics.
- The console is a separate static page guarded by Auth and RLS, not a security control by itself. `noindex` is not a substitute for RLS.
- The school owner main UI and existing backup/teacher/parent portals are not modified by D1.
- The D1 branch inherits draft A1/B1/C1 code; those release gates must be cleared before any integrated production rollout.

## Manual platform-admin bootstrapping — staging first
A verified database operator must:
1. Create or identify a confirmed, non-shared Supabase Auth user in the isolated **staging** project.
2. Review that user's identity outside the app.
3. Insert/update its UUID into `public.bn_platform_admins` with `active=true` using a privileged *server-side* SQL session (never a browser API call or client service key).
4. Sign in to `platform-admin.html`; confirm a normal school owner, teacher, parent, anonymous visitor, and revoked platform user all fail closed.
5. Revoke a platform admin by changing `active=false` through the privileged database workflow. RLS rechecks membership on every subsequent query.

## Required staging/acceptance tests before merging
- Apply the migration in a separate disposable Supabase project and verify all new `public` tables have RLS and proper grants.
- Create two staging schools and two distinct school-owner Auth identities plus a separately approved platform admin; test `anon`, teacher, parent, first owner, second owner, platform admin and revoked platform admin.
- Verify platform admin sees **only institution metadata and subscription/audit records**, not school pupil, fee, parent or staff details via direct Data API.
- Verify normal owner cannot read another school's subscription or update even own subscription; owner cannot read `bn_platform_admins` membership for others.
- Test plan insert/update and trigger audit records in the same transaction; verify no direct insert/update/delete is possible against audit log.
- Race two browser tabs updating one subscription: stale `updated_at` must return no row and UI must refuse to claim success.
- Confirm `institutions.status` unchanged for `paused` and `ended` administrative plan states.
- Stress pagination beyond 500 tenant rows and verify console has no hard-coded school owner identity, password or secret.
- Test platform admin auth/session refresh/revocation on actual desktop browser and verify student/teacher/parent portals remain normal.
- Complete Phase A independent backup **restore** validation and real teacher/parent E2E before selling the product to other schools.

## Next Phase D milestones
- D2 — Verified school onboarding application + approval, owner invite, isolated starter classes/roles and authenticated setup checklist. Never fabricate live school staff.
- D3 — Subscription entitlements/usage metering and payment-provider integration: verified webhook, idempotent billing events, invoice/receipt policy and grace periods before enforcement.
- D4 — Platform monitoring: school health, authenticated errors, queued events, alerting, SLA dashboards and operational metrics without leaking private school records.
- D5 — Independent off-site backup, drill-tested restore to isolated project, incident response and audit exports.
- D6 — Customer onboarding workflow, school-facing help and measured product-support process.

Do not merge/deploy D1 solely on passing static/unit CI. Staged database role tests and real browser acceptance are mandatory.
