# Official WhatsApp Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Send up to 50 school reminders automatically to verified stored parent numbers with truthful provider statuses.

**Architecture:** Existing Supabase authentication and tenant membership protect a new Edge Function. Vault stores provider credentials; private service-only Postgres tables hold batches and webhook events. Existing React dialogs gain setup, preview and start controls while manual drafts remain available.

**Tech Stack:** Vanilla JS modules, Deno Edge runtime, Web Crypto, PostgreSQL/Vault, recovered React JSX, existing Node test runner and DOM fixture checks.

**Spec:** docs/superpowers/specs/2026-11-05-official-whatsapp-design.md

## Global Constraints
- No stealth, fabricated success, secret keys in public clients, or actual parent messages during tests.
- Exact admission/ID and guardian number matching; maximum 50 recipients per batch.
- No live sending before approved provider templates and webhook verification.
- Keep existing modules, layout, manual draft controls and school records.

## Review Focus
- Cross-tenant references and forged local admin tokens must fail.
- Duplicate start, concurrent workers and network ambiguity must not duplicate sends.
- Out-of-order/duplicate webhooks must not turn delivered/read back into sent/failed.
- A guardian number changed after preview must block dispatch.
- Expired login, missing provider setup and unapproved templates must remain actionable, never successful.

### Task 1: Validation and provider contract
- [x] Add failing core tests for exact matching, invalid numbers, template parameter counts, truthful acceptance and webhook signatures.
- [x] Implement pure core.mjs functions and provider request builder; run tests.

### Task 2: Durable service-only storage and Edge handler
- [x] Generate migration through Supabase CLI; implement Vault invoker RPCs, batch claims and status event replay with no client grants.
- [x] Implement authenticated routes, canonical preview, idempotent start, bounded worker and signed webhook handling.
- [x] Verify denied anonymous/authenticated access and synthetic tenant constraints inside rolled-back SQL transactions.

### Task 3: Existing UI integration
- [x] Add a small tested client and an in-dialog connection/login/template setup and preview workflow.
- [x] Pass structured fee/attendance/PTM context and admissions from existing queues; preserve manual operation.
- [x] Add actual React DOM tests with fake endpoints and zero external sending.

### Task 4: Release verification
- [x] Run full tests, targeted static checks, security advisors and independent review.
- [x] Publish source plus generated mirrors, deploy the new Edge Function and static frontend, and verify unauthenticated endpoint failures.
- [x] State exactly which school connection/template values are still required; do not call missing-credential setup a completed live send.

Verification: 156 Node tests pass; actual React DOM checks cover legacy manual queue/profile and official setup/preview/consent/accepted/new-batch flows. Deno check passes. Rolled-back SQL fixture verifies Vault create/update, batch idempotency, atomic claim, early-webhook replay and no delivered downgrade. Security advisor findings unchanged from baseline (4 existing RLS INFO, 4 existing definer-function WARN, leaked-password-protection WARN). Edge version 1 is ACTIVE; live unauthenticated connection is 401 and invalid webhook token is 403. Provider sending remains untested pending school credentials/templates/opt-in.
