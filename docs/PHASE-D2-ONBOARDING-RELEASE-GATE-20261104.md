# Bright Nexa School OS — Phase D2 verified school onboarding
Date: 2026-11-04. Branch: `phase-d2/school-onboarding-20261104`.
Stacked on D1 draft PR #40; D1 includes C1 #39, B1 #38 and A1 #37.

## Implemented development code
**Onboarding status flow:** Draft school request → explicit owner email invitation → verified owner accepts invitation and sets own password → owner configures real classes and staff access → platform admin reviews readiness → trial institution activated.

The separate platform page `docs/platform-admin.html` now includes a Create School wizard and owner readiness checklist. It uses:
- `docs/platform-onboarding-core.js` for bounded school-name, owner email, phone, notes and readiness validation
- `docs/platform-onboarding.js` for verified JWT calls and explicit administrator confirmation before email/activation
- `supabase/functions/platform-school-onboarding/index.ts` for server-side authenticated platform-admin enforcement and invitation flow
- `supabase/migrations/20261104161500_phase_d2_school_onboarding.sql` for two new RLS-protected tables and service-only transaction functions
- `tests/phase-d2-onboarding.test.cjs` for input, tenant, activation, idempotency and client secret regressions.

**Draft creation is not email delivery.** The admin enters school name, owner email and optional contact, then saves a draft. The admin must separately click **Send owner invitation**, with confirmation, before any real email can be sent. The server verifies Supabase Auth JWT and active `bn_platform_admins` membership on **every** call.

### Real owner invitation
- Uses server-side Supabase Auth `admin.inviteUserByEmail`, with redirect to the already available `/index.html` invitation/password setup flow. No default password or unverified owner identity.
- Server records an `inviting` state first so concurrent admin clicks cannot send duplicate emails.
- After invitation, a *single DB transaction* creates an `institutions.status='trial'` row, a school-scoped `school_users.role='school_admin'` membership and contact record (`is_test_school=false`).
- If email was sent but DB provisioning fails, state changes to `needs_attention` for manual reconciliation. Automatic re-invite is blocked. This cannot guarantee email delivery: check Supabase Auth provider and real recipient.
- Existing email already assigned to any school is blocked, respecting current one-school-per-Auth-user design.

### Owner setup & activation
The actual owner, after accepting the invitation, uses existing School OS:
1. Sign in and set a secure password.
2. Create at least one actual `school_classes` row with class, section and academic year.
3. Invite a teacher through the existing protected school-invite-staff flow.
4. Give that active teacher a real class assignment through existing teacher roles UI.

Platform admin clicks **Refresh real setup status**. Edge server confirms owner's `email_confirmed_at` from Auth, then uses a service-role-only SQL readiness function counting valid classes, active teacher accounts and active teacher-class assignments **for that school only**. No fake students or teachers are generated.

The **Activate verified school** action has a separate confirmation and rechecks readiness; a service-role-only transactional function updates `institutions.status` from `trial` to `active` **only after** all prerequisites pass. Non-trial schools cannot be activated by this path. Activation and invitation history is recorded on private append-only event tables. The platform console can see school identity/status and operational counts, not student, guardian, fee or academic-record PII.

### Deliberately NOT done
- No automatic payment, billing, subscription enforcement or plans tied to newly provisioned schools; D1 administrative plan labeling remains separate.
- No teacher/parent invitation without a school owner's direct approval; teachers are provisioned through existing school owner workflow.
- No default/seeded/dummy student records, fake classes, fake staff, or hardcoded passwords.
- No support for an existing Auth identity already owning another school; requires authorized migration workflow.
- No self-serve school signup approval or unsolicited email. The separate existing first-school self-registration RPC is retained unchanged and needs policy review before commercial signup.
- No robust invitation-delivery tracking or automated reissue: failed/repeated invites need controlled manual reconciliation.
- No new backups, independent recovery drill or production multi-tenant security certification.

## Mandatory release gates
1. **Do not deploy the staged migration to the live Supabase project without prior isolated/staging tests.** D1 RLS and all earlier draft migrations must be installed first on staging.
2. Create two disposable staging schools and three distinct verified identities: platform admin, School A owner, School B owner. Check school owner/teacher/parent/anonymous accounts cannot read platform onboarding, make requests, or invoke provisioning/activation RPC. Validate grants separately from RLS.
3. Verify a platform admin without active membership cannot call Edge endpoint even with valid JWT. Provision an approved platform admin via privileged server-side SQL only.
4. Test duplicate draft request key, existing-email collision, double invitation button, Supabase invite SMTP failures, provider-confirmed email but SQL failure, and manual reconciliation. **Never automatically resend** after an uncertain invitation.
5. Email confirmation and password-setting E2E: after the invite link is clicked, owner can see *only their own* trial school, create classes, invite teacher and assign a class.
6. Activation blocked if no confirmed owner, no class, no teacher, no assignment, wrong-tenant teacher, revoked teacher assignment, disabled teacher, or if institution is not trial. Confirm successful activation changes the *right* institution and produces immutable audit event.
7. Verify with SQL that all original schools remain unchanged by migration, and neither backend nor browser contains a privileged key. Run security advisors and compare role grants. Check rate limiting and SMTP provider configuration before sending production invites.
8. Validate with real browser desktop/mobile, security headers, online/offline behavior and no broken D1 dashboard. Do not claim End-to-End or user-facing readiness from static/unit CI alone.
9. Complete phase A1 independent encrypted backup restore and earlier A/B/C production gates before selling SaaS.

## Next Phase D slices
- D3: Real subscriptions, invoices, verified payment webhooks, grace periods and documented access controls.
- D4: Tenant health and incident monitoring with aggregate-only metrics and audit export.
- D5: Independent offsite encrypted backup, tested isolated restore and operational recovery checklist.
- D6: Customer support dashboard, school onboarding communications, approved role-based support access and launch readiness.

No production invitation, school creation, role grant, activation or Render deployment has been performed during development of this branch.
