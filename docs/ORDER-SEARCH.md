# Operational order search (RPT-006 partial)

In Orders, open **Operational order search**. Enter company, PO reference,
external order ID or SKU and press **Search**. Filters combine with AND;
multiple identities within one field combine with OR. Text is a literal
substring, with ASCII case folding: `%`, `_` and quotes have no wildcard or SQL
meaning. Company matches the order's recorded customer name or the current
account name. External order ID matches the recorded Pier order ID, Pier
reference or issued invoice number. SKU matches recorded order lines.

Each page contains at most 25 summaries. Next and Previous retain the applied
filters even if the form has been edited. Newest/oldest sort by recorded
preparation time then order ID; ship-window sorts use the recorded requested
delivery date with missing dates last and order ID as the tie breaker. Paging
reads the current database, so a concurrent order change can move a row between
pages. Superseded drafts are excluded. No full order bodies or attachments are
loaded for a search page. Expand a result to fetch that exact order through its
ordinary authorized door and inspect its lines, revision, timeline and
confirmation references. Existing owner/admin and exact account-buyer scope
apply; agents cannot use this person-only search.

`GET /api/barrow/orders/search` takes `company`, `po`, `externalId`, `sku`,
`sort` (`newest`, `oldest`, `ship-asc`, `ship-desc`) and `page` (1–999999).
Search fields accept at most 160 characters. The response contains `rows`,
`page`, `pageSize` and `hasNext`; private results use `Cache-Control: no-store`.
Amounts retain their recorded ISO currency and integer cents, including legacy
AUD. Searching does not read an upstream provider or change any commercial fact.

The named RPT-006 HTTP journey seeds 400 companies and 20,000 historical orders
across three seasonal date cohorts, and measures twenty first-page requests
per PO, SKU and ship-window sort against the two-second p95 requirement. It
also exercises combined filters, literal input, stable tie ordering, buyer
isolation, agent/anonymous refusal, empty and invalid requests, and source
record reconciliation. This is test data, never application data.

The original workspace and order history are also bounded. `GET /api/barrow/state`
returns at most 25 order bodies in `orders` and page metadata/counts in
`orderPage`. It retains superseded records for API history. `waitingDraft` is
one independently selected authorized draft: newest stale account revision
first, otherwise newest draft, with order ID ties. It can lie outside page one.
The order pad reads that draft directly and pages the selected account's drafts.

`GET /api/barrow/orders/history` returns at most 25 full `orders`, page-scoped
`people`, `page`, `pageSize`, `hasNext`, full visible status `counts`, duplicate
PO flags and completed substitution references. Filters are `po`, `sku`,
`location`, inclusive `from`/`to` preparation dates in America/New_York, exact
`accountId`, and `status`: `all`, `draft`, `review`, `submitted`, `reserving`,
`shortfall`, `approved`, `releasing`, `cancelled`. Review groups submitted,
reserving, shortfall and releasing. History excludes superseded drafts and
keeps descending insertion order. PO/SKU/location retain the original Unicode
`en-US` case folding and literal substring semantics; location includes recorded
ship-to name, street, city and state. Text filters accept at most 160 characters.
Invalid dates, inverted bounds, unknown statuses and invalid pages refuse.

Next/Previous in the original history and draft chooser retain their current
filters. Changing a history filter starts at page one. Counts, duplicate-PO
release checks and completed substitution checks cover the authorized collection,
not just the displayed page. Drafts outside the first page remain selectable;
opening one loads its exact current record. History reads stored bodies in
batches of at most 100, retaining only one browser page; its Unicode/date
filtering may scan batches and has no additional latency claim. Concurrent
writes may move current-data pages. Bulk confirmation selection uses the current
history page. History also returns a page-scoped `accountRevisions` map for stale-draft warnings independent of account pages.

Saved monthly sales and invoice-aging definitions, exact-staff delivery, frozen
source-linked downloads and revocation now ship in **Data → Saved monthly reports**.
See [Scheduled reports](SCHEDULED-REPORTS.md) for the recipient checks and schedule.

RPT-006 remains partial. Carrier tracking search and its performance point,
broader report types and functional finance/rep recipient
acceptance remain missing. There is no connected carrier tracking source.


Account cards and selectors also page the directory. `GET /api/barrow/accounts`
returns `accounts` (at most 25 full records), `page`, `pageSize` and `hasNext`.
`q` matches a literal substring of company name, account ID, email or Pier customer
ID with ASCII case folding; `%`, `_` and quotes have no special meaning. Queries
accept at most 160 characters. `sort` is `id` (default), `name-asc` or `name-desc`;
name sorts use ASCII case folding and exact ascending ID ties. Page is 1–999999.
Current-data pages can move during concurrent edits. Existing supplier, exact
account-buyer and agent-grant read access is unchanged; this adds no authority.

The initial workspace transfers only the first 25 accounts and `accountPage`
metadata. Account cards and pickers retain their search while paging; a search or
sort change starts at page one. Choose a later-page account for orders, locations,
statements, fulfillment or unused-account erasure. The selected account stays
selected across directory pages and loads through
`GET /api/barrow/accounts/by-id/<id>`, which rechecks ordinary account access.
Loading, no matches and failures are explicit; Retry accounts repeats the request.

Account editing keeps full-directory duplicate review. The supplier-only
`GET /api/barrow/accounts/duplicates` takes `name`, `pierCustomerId`, `exclude`
(the current account ID) and `page`. It retains ACC-004's Unicode NFKC normalized
company-name / exact Pier-ID matching, scanning at most 100 bodies per database
batch and returning at most 25 candidate IDs, names and revisions. Confirm each
page before moving to the next, then save. The existing save transaction rechecks
every matching revision across the complete directory; incomplete or stale review
refuses, without merging or reassigning identities. This is review of possible
duplicates, not a new rule for account ownership.

RPT-006 governs order search; RPT-008 governs independent account pages and duplicate review.
