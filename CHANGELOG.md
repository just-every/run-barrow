# Changes

## 0.1.4

- Deploy without an email provider with `MAIL_PROVIDER=none`. The owner can get a one-use sign-in link with `rer signin`.
- Pin rer 0.2.144 and adopt Base's Business policy stop and decision relay changes.
- Publish the production demo from the released tag.

## 0.1.3

Barrow's work since 0.1.2 (25 Oct), released so its demo opens current code. 28 migrations are added (0051_buying_profiles.sql … 0080_order_notices.sql, all listed in RELEASE.json); the RER CLI pin is 0.2.96.

- Wholesale orders: seasonal prebooks with linked fulfillment releases, seasonal credit holds with a reviewed finance release, finance credit limits, and buyer payment promises.
- Money records: deposit exports reconcile and keep linked financial events; deposit commission no longer overlaps after corrected returns; storefront price display is honoured in selling-unit orders.
- Integrations: QBO source revisions stay owned until reconciliation, linked QBO invoices are confirmed after page updates, Xero scope admission is repaired, and the human-reviewed versioned wholesale entity exchange is complete.
- Agent door: populated carts are preserved in native MCP order forms across signed agent policies; a deactivated sponsor's requests are refused.
- Privacy: account erasure redacts personal native order attribution and return narratives in audit and current revisions; invoice PDFs render retained Unicode buyer names.

## 2026-10-19

- Rebuilt the workspace as the owner-picked order pad: one top bar, a large style card beside a size matrix (styles down, sizes across, Units and Line $), a price change settled inside its own row, and a sticky footer with the running total. Accounts, orders, move-in, data, sign-in and setup take the same look.
- The order pad groups SKUs that end in a size into one style row, jumps to a scanned or typed SKU, and opens a draft to re-prepare it at today's prices.
- New orders record their currency (USD); the invoice CSV reads it, and earlier records keep AUD.
- The demo tells Juniper & Vale's Atlanta market week with US stockists and USD prices.

## 2026-10-16

- Built the picked market-awning design across the run-site homepage, native sign-in and setup, and all wholesale workspace screens. Shared self-hosted Barlow type and tokens replace Outfit and teal styling.
- Added on-site Markdown guides for getting started, trade accounts, ordering, move-in, agent drafts and backup/restore, with the Run Barrow path at `/run`. Installed `/` remains the Lobby.
- Added the run-site deployment configuration and workflow with publishing disabled by default. Updated the pinned RER CLI to 0.2.21.
