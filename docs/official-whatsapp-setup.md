# Official school WhatsApp sending

Open **Settings → WhatsApp connection → Configure school WhatsApp**, or **Fee reminder / Absentee / PTM queue → Automatic sending (Official API)**. Sign in with the real cloud school administrator email/password. The local desktop admin token is deliberately not accepted for messaging.

Supply the school's Meta Phone number ID, WhatsApp Business account ID, system-user access token with WhatsApp messaging/management permissions, app secret, and a random webhook verification token of at least 24 characters. Provider secrets are encrypted in Supabase Vault and never returned to the browser. Setup is administrator only.

Create and obtain Meta approval for text templates with numbered BODY parameters, then enter the exact template names and language:

| Kind | Parameters in order | Example BODY |
| --- | --- | --- |
| Fee | Student, amount, due date, school | Dear parent, {{1}} has INR {{2}} due by {{3}} at {{4}}. Please contact the school office for assistance. |
| Absence | Student, date, school | Dear parent, {{1}} was marked absent on {{2}} at {{3}}. Please contact the class teacher if this is incorrect. |
| PTM | Student, exam, date, time, venue, school | Dear parent, the {{2}} PTM for {{1}} is on {{3}} at {{4}}, venue {{5}}, {{6}}. |

Provider approval is checked at setup, preview, start and worker start. Dynamic headers, media and buttons are intentionally rejected. Manual draft text is separate from the approved automatic template. This does not add automatic sending to the undirected circular share dialog.

Set the callback URL shown in setup in Meta, use the same verification token, and subscribe to **messages**. Refresh webhook status after Meta verifies it. API acceptance is shown separately from signed webhook Sent/Delivered/Read confirmations.

Select at most 50 students. Preview matches cloud IDs/admission numbers/approved aliases and registered guardian numbers; names do not resolve a recipient. An unlinked local record or differing cloud phone blocks the batch. Review the actual approved messages and confirm parent opt-in, then start once. Remaining messages process automatically in a bounded cloud background worker. If the worker is interrupted or reaches its time limit, reopen the last batch and resume queued recipients. Closing the dialog does not cancel requests already accepted by WhatsApp. Unknown outcomes require investigation and are never automatically retried. Meta pricing, number eligibility, template classification and opt-in requirements apply.

## Release verification and recovery

New storage is isolated in four `school_whatsapp_*` tables; existing school records are not migrated or changed. All new tables/RPCs deny anon/authenticated direct access and require the service role, with Edge verifying the actual active administrator and institution first. New migration: `20261105164233_official_whatsapp_queue.sql`.

Rollback application code to `7edfeeb2a35e89a512718c8fb6acf73b0fc8aa22` to remove the new UI. Disable the `school-whatsapp` function to stop new work (accepted WhatsApp requests cannot be recalled). Keep the new tables/Vault entries for delivery audit; do not drop queues as part of a routine rollback. Storage removal, if necessary later, must first export batches/events and preserve encrypted credentials, then drop only the five new `school_wa_*` RPCs and four `school_whatsapp_*` tables. Existing school tables are unaffected.

Live provider sending cannot be verified until the school's Meta credentials, approved templates, webhook and opted-in test recipient are supplied. No hotel/WACRM credentials are reused. Fixture tests do not send real WhatsApp messages.
