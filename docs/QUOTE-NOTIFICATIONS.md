# Quote email delivery

AUTO-003 uses the installation's configured mail sender. In local development mail is suppressed and labelled suppressed. Production Resend returns provider acceptance, which is never labelled mailbox delivery.

Existing ORD-005 notices are durable. The account buyer receives buyer-visible messages and ready revisions; active owner/admin staff act for the rep until ACC-006. Internal notes reach only staff. An actor receives no notice for their own action. Email contains a short activity summary and an authenticated quote HTTP link; the link never grants access.

Quote changes dispatch queued notices. The hourly scheduled handler and the supplier command `quote-mail.dispatch` also dispatch bounded batches. An impending-expiry notice is nominated once for each proposed revision on its inclusive last valid calendar day in America/New_York. Accepted, superseded and expired revisions do not send stale reminders. Recipient identity and current authorization are checked again before a send. A durable delivery ID is reused for a lost response; provider idempotency prevents a second logical submission within its window.

Configure a Resend delivery webhook at `/api/barrow/quote-mail/webhook` and save its signing secret as `MAIL_WEBHOOK_SECRET` (an optional deployment secret). Base verifies the original bytes and the Svix signature/timestamp. Barrow accepts only events whose exact provider message ID and recipient match a recorded delivery. Replays retain one event, and out-of-order events use Base's terminal-state ordering. Invalid or unrelated events are refused without mutation. No webhook body or secret is returned in diagnostics.

A send failure or verified bounce, rejection, complaint or delay creates an owned failed-contact task in Data. The active owner is assigned initially. Staff record attempted contact, reassign, schedule the next contact or explicitly resolve it with a reason through the existing follow-up command. Failed contact and quote acceptance do not close it. A retry/reconcile command resumes task creation after an interruption. Diagnostics expose delivery status and attempts; provider acceptance alone remains distinct from delivered.

Archives retain delivery evidence and follow-up history but export all delivery jobs as archived and mark historical notices ineligible. Restoring an archive sends nothing. New native quote activity creates new eligible notices. Installation credentials and webhook secrets are excluded by the existing portability policy.
