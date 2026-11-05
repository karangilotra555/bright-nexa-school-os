# Official school WhatsApp sending

The user selected automatic sending by saved parent number, without manually finding chats. Implement official Meta template messaging; do not implement anti-detection or browser stealth. Preserve manual drafts and the existing application layout.

Use the existing Supabase school identity and school_admin membership, not the local dashboard's legacy synchronization token. Keep credentials in existing Supabase Vault, and serve them only to the backend through service-role-only invoker RPCs. Every batch belongs to one institution; admissions/approved aliases and guardian phones are matched exactly, never names. A changed or mismatched number blocks sending.

Existing queues gain Automatic sending and connection setup inside the WhatsApp workflow. Preview the approved template and canonical recipients, then let the administrator explicitly start a batch of at most 50. Missing credentials, unapproved templates, unverified webhook, invalid numbers, or missing parent consent block live sends. API acceptance is separate from webhook sent/delivered/read. Unknown network outcomes are not automatically retried.

Persist batches, attempts, provider IDs and signed webhook events. Use atomic database claims and short background work units, with polling/resume for interrupted batches; do not pretend a free Edge Function has unlimited runtime. One real provider-approved connection and templates must be supplied by the school before live verification; do not use hotel credentials or send any real test message without selecting its recipient.

Alternatives: extending the current Node server would rely on its legacy admin-token issuer and separate student store; browser automation cannot provide reliable delivery receipts. Supabase is the chosen implementation default because real cloud staff identity and tenant boundaries already exist. No existing records or permissions will be modified for tests.
