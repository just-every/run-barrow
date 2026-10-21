# Saved monthly reports (RPT-006 partial)

Open **Data → Saved monthly reports**. Name a sales or invoice-aging report,
save an account filter (and optional sales SKU), and select active staff from
the operator list. The HTTP save door also accepts sales channel/territory
filters. Definitions are immutable; save a new definition for different filters.
Owner/admin identities and owner-granted functional staff are eligible only when
their current Native activation/version, report entitlement and complete saved
account filter match. Invite an outside accountant as a finance or analyst member
through **Team**, explicitly grant the report type and account scope, and wait for
them to confirm the Native invitation. Never enter a bare email address, choose a
company buyer or use an agent credential. A grant covering listed accounts cannot
receive an all-account schedule. ACC-005's conservative grant policy remains
partial pending ct approval.

The monthly schedule runs on the first day at 09:00 UTC, using the previous
complete calendar month. **Run previous month now** creates that same period's
run immediately. Sales filters use inclusive calendar dates in the installation's
reporting zone; invoice aging is as of the period's last day. The first run
freezes the complete result, its filters, dates, read time and source links.
Source edits and repeat runs never rewrite it. Unavailable source facts remain
labelled unknown by the existing report, never invented. Supported sales filters
are exact account ID, channel, territory and SKU; finance supports account ID.

Each selected recipient gets at most one notification for each run, including
across dispatch concurrency and restarts. Email includes only report name,
schedule, period, as-of date and one link requiring their own Barrow sign-in.
There are no figures, account names, POs, attachments or access tokens in mail.
An accepted provider submission is labelled accepted, not delivered. A signed
provider event can confirm delivery or failure. If submission is interrupted,
refused or ambiguous, the durable row records it and does not automatically
resubmit. Review that status in **Your frozen reports**. Unconfigured and local
development installations send no report notification.

The whole frozen JSON is available for 90 elapsed days from its first run,
through **Download frozen report** or the email's **Download the report** link.
It retains each report's source order/invoice paths and original currency
semantics. Sending and downloading both recheck the exact operator identity,
active status, unchanged version, entitled role, removal, permanent address
suppression and access to the whole saved filter. Narrower access is refused,
recorded and never produces a trimmed result. Unauthorized or expired download
links return 403. No credential in the URL can grant access.

Choose **Remove me from this report** to withdraw. Owner/admin can remove another
selected recipient; functional staff remove only themselves in **Reports → Your
scheduled snapshots**. Removal, staff-grant revision changes, deactivation or operator-version
changes cancel queued notifications immediately and revoke existing downloads.
A later reactivation does not restore the saved operator version's entitlement.
Create a new native definition with current eligible identities if needed.

Configure the existing Resend sender, HTTPS installation origin, webhook secret
and delivery tenant before dispatch. Register `/api/barrow/report-mail/webhook`
for signed report delivery events. The unmodified Base mail intake verifies
signatures, exact provider-message/recipient correlation and replay identity.
A bounce, complaint or rejection permanently suppresses the address across
report sends and downloads, including receipts already held by quote mail.
Settings, freeze/queue, sender results, delivery events, removal/revocation,
downloads and refusals appear in the staff **Audit** and its export without
snapshot data or secrets.

Owner archives preserve definitions, frozen results and audit. Restored schedules
are inert, unsent notifications are cancelled, and old operator IDs never rebind
to a newly created owner. Save a new native definition to resume. The native
installation journey proves this through export and empty restore.

HTTP doors:

- `GET /api/barrow/report-schedules`: saved definitions, eligible operators and your latest 100 runs.
- `report.save`: `name`, `reportType` (`sales` or `finance`), `filters`, `recipientIds`.
- `report.run`: `scheduleId`; same schedule/period is idempotent.
- `report.remove-recipient`: `scheduleId`, optional `operatorId` (defaults to yourself).
- `report.dispatch`: process due definitions and pending eligible deliveries; also runs hourly through the installation scheduler.
- `GET /api/barrow/report-runs/<run-id>.json`: exact-recipient frozen download.

RPT-006 stays partial. Account-list pagination uses bounded current-authority pages. Tracking source/search and
its performance proof and broader scheduled report types remain missing. ACC-005
adds exact functional report/account coverage and grant-revision revocation;
ACC-006 must preserve this for territories and delegated coverage. INT-015 retains bounce
and suppression custody, and DATA-002 records every step.
