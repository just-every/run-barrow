<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a Barrow installation

The primary journey: Approve a stockist, publish its assortment and terms, review its quote or order, acknowledge stock, follow delivery and returns, collect payment and reconcile the account.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 44 | 58 | 42 | 144 |
| Agent surface | 0 | 0 | 13 | 13 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 44 | 58 | 55 | 157 |

Judged from the code and tests at commit `8d652780a7f6bc1f7cbdbf2230f9d5e61b370dba` (28 October 2026). Field proof register: 5 rows; 0 passed, 0 failed, 5 not run.

## Core

### Published guarantees carried forward

#### BAR-001 — Accounts and access

Core · published · **done** · Cites BASE-ROLE-001, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Trade-account ownership is bound to its native buyer identity; changing the contact email cannot transfer an account or its orders. Supplier and company roles retain that isolation.

**Acceptance.**
1. Read as two buyers, attempt another account’s commercial records and supplier actions as a buyer, and revoke the catalog grant. Unauthorized access exposes no commercial data and changes nothing.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** None.

#### BAR-002 — Orders and invoices

Core · published · **done** · Cites BASE-DATA-001 · Rules D-6, D-1, D-2

**Requirement.** Orders retain exact price, currency, terms and human approval snapshots, and send one durable idempotent command to the chosen inventory authority. Pier remains authoritative when selected. Shortfalls remain explicit and cannot become fully fulfilled invoices; invoicing a permitted split names only its allocated or shipped units. USD integer cents are the US default; legacy AUD records retain their currency. Tax, shipping and collection extend this order record through the clauses below rather than remaining exclusions. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#bar-002).

**Acceptance.**
1. Prepare and approve a USD order, lose the inventory response and repeat the command; inspect one external reservation, an explicit shortfall, and an invoice limited to eligible quantities.
2. Change current prices afterward and download again: the issued snapshot and currency are unchanged.
3. Repeat for a legacy AUD record.

**Evidence.** `tests/api/order-guarantee.test.mjs` — “BAR-002: USD and legacy AUD orders retain exact human snapshots, one acknowledged Pier handoff, and invoice only fully eligible quantities”
**Gap.** None.

#### BAR-003 — Agent preparation

Core · published · **partial** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-SECRET-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** A scoped account agent reads its catalog and prepares validated drafts. The seven-day grant’s catalog and draft calls carry standard; submission and commercial decisions carry commitment, invoice delivery carries external, erasure carries destructive, and grant changes carry access. The company’s policy decides these calls; attribution distinguishes preparation from subsequent decisions.

**Acceptance.**
1. Issue a grant and read the catalog and prepare an order through the documented commands; under the held company policy inspect the resulting preparation and commitment decisions, including a refused out-of-scope call.
2. Revoke the grant and repeat the read; inspect the preparing, submitting and deciding identities.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Missing journey: company-policy decisions for the seven-day account grant’s commercial calls. The cited HTTP journey proves scoped catalog/draft preparation, legacy refusal and revocation.

#### BAR-004 — Account move-in

Core · published · **partial** · Rules D-6, D-3

**Requirement.** Base import-kit retains reviewed trade-account CSV plans, original source custody, fingerprints, resumable jobs and undo journals. Source/account changes invalidate approval. Native edits, identity reassignment and order dependencies block unsafe undo; replay resumes the same job. Named platform importers below extend this door. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#bar-004).

**Acceptance.**
1. Upload the documented account/price CSV through Move in, preview without account writes, refuse a stale fingerprint, apply over several batches and replay it.
2. Inspect originals and journal, then undo untouched accounts and refuse undo after a native edit or dependent order.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Missing journey: refuse import undo after a dependent order and inspect unchanged commercial records. The cited journeys prove batch preview/apply/replay, original custody and a native-edit undo fence.

#### BAR-005 — Export, restore and erasure

Core · published · **partial** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-SECRET-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Owner archives recover Barrow commercial records and import custody while keeping connection and identity credentials separate. Unused-account erasure retires import originals and fences older archives with the later erasure journal; retained ordered-account financial evidence follows DATA-003 rather than the superseded blanket erasure refusal. The [commercial custody rules](docs/COMMERCIAL-RULES.md#bar-005) retain the original source record.

**Acceptance.**
1. Export a populated installation through its portability door, restore into an empty installation and compare commercial records.
2. Confirm credentials are excluded.
3. Erase an unused imported account, export again and refuse an older archive when supplied with the later journal; preserve ordered-account commercial evidence under DATA-003.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Missing journey in the cited evidence: ordered-account retention-aware erasure and restored financial custody. The cited flow proves archive equality, unused imported-account erasure and a later-journal restore refusal; the fuller retention journey is in tests/api/retention.test.mjs.

#### BAR-006 — Run site

Core · published · **partial** · Cites BASE-PUBLIC-001, BASE-DOCS-001 · Rules D-6 · Register R-1, R-2

**Requirement.** The separate public site introduces Barrow, links to /run and serves repository owner guides at /docs without reading installation data. Installed / remains the Lobby. The existing deployment gate controls publication. Target promises are distinct from the implementation status published by this contract. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#bar-006).

**Acceptance.**
1. Build with rer build --site, serve the output and traverse the homepage, /run, guide navigation, local assets and a missing guide.
2. Confirm the installed route keeps its Lobby and the site contains no private account data.

**Evidence.** `tests/site.test.mjs` — “built run site serves its guides, Markdown navigation and local assets”
**Gap.** Missing journey: serve the public site and inspect the installed Lobby in the same public-door run. The cited built-site journey traverses public guides/assets and a missing guide.

### Trade accounts and authority

#### ACC-001 — Trade applications and approval

Core · target · **partial** · Cites BASE-ROLE-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-SECRET-001, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-4

**Requirement.** A prospective US stockist submits company name, EIN or business identifier where needed, contact, resale documents, requested locations and expected volume. Staff review duplicates and approve, request information or decline with a reason before private prices or terms become accessible. Invitations and application status are visible to both parties. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#acc-001). Application documents remain quarantined without a configured scanner; the existing scanner-custody decision is resolved, and engineering proof is owed. The applicant’s verified application session and entitled staff share state, dates, requests, reasons and documents; internal notes stay staff-only. RL-1 records the adopted commercial semantics.

**Acceptance.**
1. Apply from the public trade form, request a missing certificate, approve and sign in.
2. The new buyer sees only its approved assortment; a declined or pending applicant cannot see prices.

**Evidence.** `tests/api/flows.test.mjs` — “trade applicant verification, duplicate-reviewed decisions, quarantined certificates, usage reacceptance and owner custody through HTTP”; `tests/journeys/applications.test.mjs` — “native trade application, review, private status, usage acceptance and retention screens at desktop and phone”
**Gap.** Public application certificate screening and downloadable review await the owner-configured scanner processor and Base adapter required by ct 22 October 15:46Z. Without it uploads and existing documents remain quarantined; no malware verdict is claimed.

#### ACC-008 — Versioned portal usage terms

Core · target · **partial** · From ACC-001 · Cites BASE-ROLE-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-SECRET-001, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-4

**Requirement.** On first sign-in, and again when the merchant publishes a new version, a buyer accepts the current portal usage terms, recorded with version, person and time; ORD-015 governs the separate sales terms on orders. Acceptance binds the newest immutable version and the actor; commercial access waits until the applicable acceptance. An agent’s equivalent acceptance carries commitment and follows company policy, with truthful attribution. Sales terms remain ORD-015. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#acc-001) apply to this capability. Any agent call carries the classes computed in the Agent surface; the company’s policy decides that call within its sponsor’s current role.

**Acceptance.**
1. Approve a new stockist and require the current portal terms before commercial access.
2. Publish a new version and require fresh acceptance at next sign-in; retain the previous acceptance’s version, actor and time.

**Evidence.** `tests/api/flows.test.mjs` — “trade applicant verification, duplicate-reviewed decisions, quarantined certificates, usage reacceptance and owner custody through HTTP”; `tests/journeys/applications.test.mjs` — “native trade application, review, private status, usage acceptance and retention screens at desktop and phone”
**Gap.** Carried partial from ACC-001. A separate portal-usage terms judgment is missing; the cited native application journey shows versioned usage acceptance and renewed acceptance.

#### ACC-002 — Company buyers and purchasing rights

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-003, BASE-DATA-006, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Each company has a company administrator who manages contacts and locations, purchasers who build carts, purchasing approvers who release allowed orders and finance viewers who read invoices/statements. Rights and spend limits are explicit per user and location. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. this clause routes ORD-005’s buyer-side quote notices and thread to the company users with purchasing rights for the account. this clause inherits ORD-002's list sharing: a shared list is seen and edited by the company users who hold purchasing rights for that account, a private list only by its creator, and another company's lists read as not found. the approved ACC-001 account’s first buyer becomes its company administrator. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#acc-002). RL-2 records the adopted commercial semantics.

**Acceptance.**
1. Invite four company users, build a cart as a limited purchaser, approve it as the authorized approver, read its statement as finance and refuse finance ordering and cross-company administration.
2. route AUTO-003 emails and expiry reminders to the company purchasers with current rights, retaining exact recipient identity/revocation and private internal notes.

**Evidence.** `tests/api/flows.test.mjs` — “trade applicant verification, duplicate-reviewed decisions, quarantined certificates, usage reacceptance and owner custody through HTTP”; `tests/api/flows.test.mjs` — “company buyers: native invitations, scoped purchasing approval, finance, shared lists, exact recipients and one-user erasure”; `tests/journeys/company.test.mjs` — “company administrator invites four native users, limited purchaser waits for another approver, finance reads invoices, shared lists and removal at desktop and phone”
**Gap.** None.

#### ACC-003 — Billing and delivery locations

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** An account maintains separate bill-to, ship-to and contact records with US address validation, default delivery instructions and location-specific tax exemption references. Orders snapshot the chosen addresses; an address edit never rewrites an already accepted order. this clause adds its records to DATA-001’s export (JSON and per-kind CSV) with stable IDs, currency, source mapping and revision, in the same owner/buyer scope. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#acc-003).

**Acceptance.**
1. Save a headquarters and two stores, place an order to each store, change the default afterward and inspect unchanged order addresses and the correct tax jurisdictions.

**Evidence.** `tests/api/locations.test.mjs` — “ACC-003: a headquarters bill-to and two store ship-tos, orders to each store, a changed default and edits that never rewrite order addresses or tax jurisdictions”
**Gap.** None.

#### ACC-004 — Account lifecycle and commercial profile

Core · target · **done** · Cites BASE-ROLE-001 · Rules D-6

**Requirement.** Staff maintain account identifiers, active/on-hold/closed states, channel, territory, assigned rep, catalogs, negotiated terms and provider references. Deactivation blocks new orders while buyers retain permitted history and statements. Duplicate companies are reviewed without silently reassigning historical ownership. Legacy accounts without a state are active. On-hold and closed accounts cannot prepare a new draft, submit a draft or receive a first supplier approval; history, invoices and recovery of an already approved reservation remain available. Channel, territory, rep, catalog and provider references are recorded profile metadata; ACC-005, ACC-006, CAT-006 and CAT-008 add their scoped role, assignment and catalog capabilities them. A matching company name after NFKC normalization, trimming, whitespace collapsing and lowercasing, or an exact Pier customer ID, is a possible duplicate. The supplier reviews the matching account IDs and current revisions as separate companies before a native create or company-name/Pier-customer-ID change. CSV previews bind native and source-company matches into the reviewed fingerprint; applying it records the review actor and time and never merges identities. CSV updates preserve existing lifecycle and profile metadata absent from that format. Completion covers current account, ordering, history and invoice doors; PAY-007 must preserve authorized statement access for on-hold and closed accounts before introducing statements. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#acc-004). Any agent call carries the classes computed in the Agent surface; the company’s policy decides that call within its sponsor’s current role.

**Acceptance.**
1. Record the commercial profile, place an order, hold then close its account and attempt checkout through the buyer and agent HTTP doors, including submission and first approval of earlier drafts.
2. History and invoices remain readable to the same authorized buyer; new orders are refused and a duplicate email cannot take over the company.
3. Recover an already-approved lost reservation response after closure without a second stock command.
4. Refuse an unreviewed or stale duplicate-company save, review separate companies, import a duplicate-bearing CSV plan and inspect the attributed review through an owner export; original identities and native profile fields survive.

**Evidence.** `tests/api/flows.test.mjs` — “ACC-004: profile, hold and closure preserve buyer history and refuse new commitments or identity takeover”; `tests/api/flows.test.mjs` — “ACC-004: duplicate companies require an exact recorded review; imports show duplicates without reassigning history”; `tests/api/order-guarantee.test.mjs` — “BAR-002: USD and legacy AUD orders retain exact human snapshots, one acknowledged Pier handoff, and invoice only fully eligible quantities”
**Gap.** None.

#### ACC-005 — Supplier roles and separation of duties

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Owner manages installation and grants; sales managers control catalogs, prices, assignments and exceptions; reps sell only assigned accounts; operations staff manage fulfillment and returns; finance controls credit, refunds and reconciliation; analysts read authorized reports. operations-role access inherits RPT-003’s report and its account/warehouse scope obligations. this clause inherits PRI-007 scoped manager exception authority and limits, with attributed reasons and audit. this clause replaces ORD-004’s zero quote-discount limit (every discount needs a recorded owner/admin approval) with per-role amount limits for reps and sales managers. this clause gives the finance role its RPT-004 report access and refuses non-finance staff beyond their permitted summaries. this clause applies its role rights to AUTO-005 task reads, refresh, assignments, contacts, resolutions and staff exports. replace REP-004 owner/admin manager authority with the functional role limits while preserving private commission decisions and attributed policy audit. functional reviewer roles inherit ACC-001’s owner/admin review, document privacy and attributed decisions, and AUTO-001’s routes, review tasks and escalation. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#acc-005). RL-3 records the adopted commercial semantics.

**Acceptance.**
1. Invite each supplier role, attempt a credit override as a rep and a catalog edit as operations, allow the authorized finance and manager actions and inspect attributed audit events.
2. each new functional supplier role, including invited analyst/finance operators for outside accountants or buyer AP, becomes eligible for RPT-006 only for its entitled report types.
3. Outside recipients are invited operators, never bare addresses.

**Evidence.** `tests/api/application-followup.test.mjs` — “AUTO-001: rules route verified applications by territory, requested terms and certificate to a reviewer with a deadline and a prepared request; applicants get generic status emails; escalation persists through requests, answers and emails until a decision or explicit closure”; `tests/journeys/application-routing.test.mjs` — “applications route by territory to a reviewer with a prepared request, the applicant gets generic status emails, and the escalated task stays on the board through the request until a decision at desktop and phone”; `tests/api/staff.test.mjs` — “ACC-005: owner grants Native members scoped functional work, amount approvals and reports; narrowing and revocation immediately close every exercised door”; `tests/journeys/staff.test.mjs` — “owner invites five native functional staff roles, exact scoped reports and supplier doors, then revokes live rep access at desktop and phone”; `tests/journeys/applications.test.mjs` — “owner grants functional application review and finance document access, reviewers use their own doors, and revocation closes them at desktop and phone”; `tests/journeys/credit-payments.test.mjs` — “merchant issues a linked return credit, applies it and reviews pending and failed refunds with exact buyer balances and unchanged commission reversals at desktop and phone”
**Gap.** Functional application review and AUTO-001 routing/tasks/escalation are proven for current all-account sales-manager `applications` grants, with finance certificate-only and other-role refusals. PAY-010 credit and refund decisions now have explicit account-scoped finance allowances and current grant admission. PAY-004/005 credit override and hold doors, INT-002/003 and SHIP-004 still inherit source-backed role and amount admission; ACC-005 stays partial under ct’s 21 October ruling until the finance doors ship. ACC-006 coverage is implemented.

#### ACC-006 — Rep territories and delegated coverage

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001 · Rules D-6

**Requirement.** Managers assign reps to named accounts and territories with temporary coverage dates. Buyers see their current rep, and a transfer changes future access and attribution without rewriting previous orders or commissions. ORD-005’s supplier-side quote notices and internal notes reach the assigned or covering rep instead of every owner and admin, and a rep reads only their accounts’ quote threads. RPT-001’s sales report shows a rep only their assigned or covered territories, and another territory is refused. this clause limits each rep to their permitted RPT-004 account summaries and refuses another rep’s accounts through the page and CSV. this clause scopes AUTO-005 next actions and their source links to assigned or covered rep accounts, with current coverage dates and permitted reassignments. scope REP-004 manager/rep statements and exports to current permitted accounts without rewriting frozen historical rep/split attribution; rep labels alone grant no access. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#acc-006).

**Acceptance.**
1. Assign two reps disjoint accounts, give one temporary vacation coverage and expire it.
2. Order and export access follows current assignments; historical commission attribution survives a transfer.
3. route AUTO-003 emails and expiry reminders to the assigned or covering rep and scope failed-contact task ownership/reassignment to current coverage; rep profile metadata alone grants nothing.
4. RPT-007 scheduled report sends and downloads require current assigned/covered-account access to the whole saved filter; narrower access is refused with an attributed reason, never trimmed.
5. Assignment changes revoke existing links and cancel queued deliveries.

**Evidence.** `tests/api/rep-territories.test.mjs` — “ACC-006: managers assign reps to territories and accounts with dated coverage; access, quote routing, reports, tasks, commissions and sends follow the current assignment and no history is rewritten”; `tests/journeys/territories.test.mjs` — “manager assigns, covers and transfers rep territories; the rep, the buyer and the manager each see only the current assignment at desktop and phone”
**Gap.** None.

#### ACC-007 — Buyer purchasing approvals

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Company administrators set location or amount approval policies, multiple sequential approvers, delegation and escalation. A purchaser can revise or withdraw an unapproved request; a material price, quantity, address or credit change invalidates its approval. Supplier approval remains a separately attributable decision. ACC-002 now supplies per-user/per-location limits and the distinct-person company release; this clause supplies the additional revision, delegation and escalation policy. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#acc-007).

**Acceptance.**
1. Submit a $6,000 cart above a purchaser limit, complete two approvals, revise quantities and require fresh approval.
2. Delegate an absent approver and prove a lower-rights buyer cannot bypass the route.

**Evidence.** `tests/api/company-approvals.test.mjs` — “ACC-007: amount and location routes run sequential approvers with delegation, escalation, withdrawal and fresh approval after any material change”; `tests/journeys/approvals.test.mjs` — “a company administrator sets a two-step route and delegation; a $6,000 cart waits, is approved in order by a delegate and finance, then released at desktop and phone”
**Gap.** None.

### Catalogs and merchandising

#### CAT-001 — Private account assortments

Core · target · **done** · Cites BASE-ROLE-001, BASE-SECRET-001 · Rules D-6

**Requirement.** Only active SKUs and agreed prices assigned to the signed-in account appear in its catalog or ordering responses. Another account cannot retrieve hidden SKUs, prices or the inventory authority credentials by guessing identifiers. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-001).

**Acceptance.**
1. Sign in as two buyers with different price lists and request both catalogs and direct API paths; each sees only its own priced items and no upstream credentials.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** None.

#### CAT-002 — Product discovery and media

Core · target · **partial** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Buyers search SKU, barcode, product name and description, filter by category, season, availability and attributes, and inspect images, zoom, specifications and downloadable product attachments. Private media follows account permissions and search remains useful in a catalog of at least 10,000 variants: on that fixture a barcode or SKU lookup returns its variant, and a filtered search returns its first page, within 1 second at the 95th percentile. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-002).

**Acceptance.**
1. Load a 10,000-variant wholesale assortment fixture, find a known SKU by barcode within 1 second and by attribute filters, view its images and spec sheet, and refuse the same private attachment from an unentitled buyer.

**Evidence.** `tests/api/catalog-search.test.mjs` — “catalog search finds entitled SKU, barcode and text with stable pages and observed-stock variant filters”; `tests/api/catalog-search.test.mjs` — “catalog search enforces current account authority and invalidates observations after price, attribute or connection changes”; `tests/journeys/catalog-search-scale.test.mjs` — “10,000-variant public catalog SKU, barcode and filtered first-page searches have p95 at most one second”
**Gap.** Search API foundation only. Private images/zoom/specifications/attachments and their entitlement, category/season/description search and buyer search UI remain unbuilt. DATA-001 product/media JSON/CSV manifests, MOVE-007 catalog/media reconciliation and fingerprint approval, and DATA-003 broader media custody/holds/review/erasure remain unproved. DATA-004 malware screening needs the owner-provisioned scanner and Base adapter. Search stock is a dated supplier-refreshed observation; ordering retains live Pier checks.

#### CAT-003 — Digital line sheets

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-6

**Requirement.** Merchandisers assemble seasonal visual line sheets with product variants, wholesale prices and, where the sheet is set to show them, suggested retail prices (PRI-008), packs, availability and ship windows. Each sheet chooses wholesale only, retail only or both. Buyers add lines directly to a cart; account-scoped sharing and PDF downloads retain the recipient price book, price display setting and revision. Sending a sheet to many buyers at once, with segments, suggested-products order forms and campaign tracking, is CAT-011. A sheet's downloadable order form inherits ORD-001's cart preview (aliases, duplicates, hidden SKUs, PRI-003 corrections, explicit merge or replace) . this clause adds line-sheet opens, views and items viewed per buyer to RPT-002’s report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-003).

**Acceptance.**
1. Publish a spring line sheet showing wholesale and MSRP to one account and a wholesale-only sheet to another account with different prices, order from each on a phone and export each account PDF.
2. Each page and PDF shows exactly its configured price columns; a revoked share cannot expose the sheet or another account price.

**Evidence.** `tests/api/line-sheets.test.mjs` — “recipient seasonal sheets retain exact variants, columns, ship windows and revision, and revocation closes every sheet door”; `tests/api/line-sheets.test.mjs` — “line-sheet size runs and fixed assortments preview exact extended-size prices, preserve Pier SKU quantities, and refuse unavailable sizes without redistribution”; `tests/api/line-sheets.test.mjs` — “line-sheet buyer opens and visible-item views appear independently in the scoped quote conversion report”; `tests/api/pricing.test.mjs` — “MSRP books import and edit exact USD/CAD cents and preserve configured sheet, PDF and order document prices without changing wholesale totals”; `tests/journeys/line-sheets.test.mjs` — “supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone”
**Gap.** None.

#### CAT-004 — Shoppable lookbooks and presentations

Core · target · **missing** · Cites BASE-INPUT-003 · Rules D-6

**Requirement.** Staff combine editorial images, video, product hotspots and collections into branded lookbooks and rep presentations. Every hotspot opens an eligible live product and ordering respects current commercial rules even when the presentation is older. this clause adds lookbook and presentation opens, views and items viewed per buyer to RPT-002’s report. PRI-008’s per-surface wholesale/retail/both display, exact optional variant MSRP and margin semantics apply to this surface . The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-004).

**Acceptance.**
1. Create a lookbook with a video and three hotspots, share to an approved buyer, retire one SKU and order from the remaining two; the retired item is clearly unavailable and historical presentation does not bypass pricing.

**Evidence.** None.
**Gap.** Implement shoppable lookbooks and presentations and prove the stated journey.

#### CAT-005 — Branded responsive storefront

Core · target · **partial** · Cites BASE-ACCESS-002 · Rules D-6 · Register R-1, R-2

**Requirement.** A wholesaler configures its logo, colors, domain, collections and navigation for a trade storefront with sign-in, clear support contact and account-aware merchandising. Responsive layout preserves shopping and checkout on desktop and phone. PRI-008’s per-surface wholesale/retail/both display, exact optional variant MSRP and margin semantics apply to this surface . The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-005).

**Acceptance.**
1. Configure a brand, sign in and complete a representative cart at 1440px and 390px.
2. Logo, navigation, prices, validation and the final confirmation remain readable and operable.

**Evidence.** `src/barrow/ui/app.tsx`; `src/barrow/ui/order-pad.tsx`
**Gap.** Responsive Barrow catalog exists; merchant branding, domains and full checkout journey are missing.

#### CAT-006 — Multiple brands and buying profiles

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001 · Rules D-6

**Requirement.** One installation can present separate branded storefronts, assortments and price books while an authorized buyer switches purchasing profiles deliberately. Legal seller, currency, permissions and order ownership remain visible and a cart cannot accidentally mix sellers. Additional brands inherit PRI-001: explicit ISO currency labels and exact integer minor units without conversion by relabeling; whole-unit quantities × integer cents need no rounding. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-006).

**Acceptance.**
1. Configure two brands and a buyer approved for one, refuse the other brand, then approve a second profile and switch.
2. Each cart, invoice and export names the correct seller and ISO currency, retaining exact integer minor units without conversion by relabeling.

**Evidence.** `tests/api/pricing.test.mjs` — “CAT-006: one company buyer deliberately selects approved brand price books; exact currencies, sellers and accepted terms survive orders, invoices and later seller edits”; `tests/journeys/line-sheets.test.mjs` — “owner approves two brand price books and one company buyer deliberately switches between their sellers, currencies and sales terms at desktop and phone”; `tests/api/data-export.test.mjs` — “DATA-001: owner and buyer export open JSON/CSV commercial records that reconcile, resolve documents and stay in scope”
**Gap.** None.

#### CAT-007 — Style color size and assortment matrices

Core · target · **done** · Cites BASE-INPUT-003 · Rules D-6

**Requirement.** Products support style/color/size variants, barcodes, images, size runs and fixed assortment packs. A matrix order resolves into exact variant SKUs, with variant-specific stock and minimum rules rather than a single ambiguous style quantity. Wholesale price and MSRP may differ per size within one style (for example extended sizes), and the matrix shows each size's price. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-007).

**Acceptance.**
1. Order a size run that includes a higher-priced extended size and a case assortment through a line-sheet matrix, inspect exact SKU quantities and per-size prices in the order and inventory handoff, and reject an unavailable size without silently reallocating it.

**Evidence.** `tests/api/line-sheets.test.mjs` — “line-sheet size runs and fixed assortments preview exact extended-size prices, preserve Pier SKU quantities, and refuse unavailable sizes without redistribution”; `tests/journeys/line-sheets.test.mjs` — “supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone”
**Gap.** None.

#### CAT-008 — Season and catalog publishing

Core · target · **missing** · Cites BASE-DATA-001 · Rules D-6

**Requirement.** Merchandisers stage imports and edits, preview an account view, schedule effective seasons and retire products without losing historical lines. Retiring or canceling a product that still sits in open orders goes through the ORD-016 preview rather than leaving those orders unchanged. Published revisions and archived media references remain identifiable on orders and presentations. this clause adds the season dimension to RPT-001’s sales report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-008).

**Acceptance.**
1. Stage next-season products, preview as a named buyer, publish at its effective date and archive a prior style.
2. New orders use the new assortment; prior orders keep their original SKU description.
3. Retiring a style with an open order opens the ORD-016 preview for it.

**Evidence.** None.
**Gap.** Implement season and catalog publishing and prove the stated journey.

#### CAT-009 — Bulk product and catalog maintenance

Core · target · **done** · Cites BASE-ROLE-001, BASE-DATA-001 · Rules D-6

**Requirement.** Authorized catalog staff import and export SKU-bound metadata, categories, assortment labels, variant attributes and private media references through a reviewed workbook. Labels never grant buyer access. The selected ERP retains its declared product fields; changing an upstream-owned SKU, name, barcode or stock field is refused and routed to that authority. Preview binds the reconciled source fingerprint and reports duplicates, broken references and removed listings. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#cat-009) apply to this capability.

**Acceptance.**
1. Preview a product workbook with a duplicate barcode and broken media reference, correct it, apply and export.
2. Refuse a source-owned edit or route it explicitly to that source.

**Evidence.** `tests/api/move-rehearsal.test.mjs` — “CAT-009: owner previews a real catalog workbook, corrects duplicate barcodes and broken media, applies the approved fingerprint and exports stable source identities”; `tests/journeys/catalog-maintenance.test.mjs` — “owner previews duplicate-barcode and broken-media XLSX, corrects the workbook, approves its fingerprint and downloads applied metadata at desktop and phone”
**Gap.** None.

#### CAT-010 — Bulk image upload and naming rules

Core · target · **partial** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-4

**Requirement.** Authorized staff drag in batches of up to 1,000 product images, or a zip archive, at once. A configurable naming rule (for example style + color + position suffix, or barcode + position) links each file to its style, color or variant and image slot. Preview lists matched files with their target and position and unmatched files with the reason: unknown style, malformed name, unsupported type or oversize. Unmatched files are held and attach automatically when a matching product is imported later. Re-uploading a file for the same slot replaces it in place, one image per slot, and identical content is stored once. Images are private media under CAT-002 permissions and flow to line sheets, lookbooks, PDFs and the rep app's offline cache. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-010).

**Acceptance.**
1. Configure a style_color_position rule and drag in a batch that includes a misspelled filename and an image for a style not yet imported, then import that style and re-upload one image.
2. Matched files attach to the right variant and position, the misspelling is listed with its reason, the held file attaches after the import, and the re-upload replaces its slot without a duplicate.

**Evidence.** `tests/api/move-rehearsal.test.mjs` — “CAT-010: private batch preview, held style import and same-slot replacement preserve positions and deduplicate sanitized bytes”; `tests/journeys/catalog-maintenance.test.mjs` — “owner previews duplicate-barcode and broken-media XLSX, corrects the workbook, approves its fingerprint and downloads applied metadata at desktop and phone”
**Gap.** Conservative default pending ct approval: owner or admin only; baseline or progressive RGB or grayscale JPEG only, at most 200 KiB; metadata removed before hashing; bytes stay in this installation’s D1 and archives, no independent media download and no external processor. Unknown valid JPEGs retain bytes; malformed, unsupported and oversize files retain only filename and reason. Later imports fill empty slots only; occupied slots require explicit re-upload. Batches accept up to 1,000 files within 30 MiB, with ZIP input bounded to 20 MiB; larger aggregate batches remain unproved. Broader CAT-002 buyer media entitlement, all-slot line-sheet and PDF delivery, CAT-004 lookbooks, REP-007 offline cache, DATA-001 complete media manifests and DATA-003 explicit media review, holds and erasure remain. DATA-004 malware screening requires an owner-provisioned scanner and Base adapter; no malware verdict is claimed. No DONE claim.

#### CAT-011 — Line sheet group sends and campaigns

Core · target · **missing** · Cites BASE-ROLE-001, BASE-SECRET-001, BASE-ACCESS-002 · Rules D-6

**Requirement.** From a published line sheet, lookbook, custom product list or working order, an authorized user (within ACC-005 role rights and ACC-006 rep assignment) sends it to many buyers in one action. Recipients are individual approved buyers or a saved segment defined by ACC-004 and ACC-006 attributes: channel, territory, assigned rep, season activity, last-season order value or tag. A segment resolves at send time to approved buyers only; pending, declined, held and closed accounts are excluded and listed as excluded with the reason. The user writes a subject and message, can attach each recipient's own priced PDF or XLSX, and can choose to send a suggested-products order form: pre-filled lines and quantities the buyer adjusts and confirms through the normal cart under PRI-007 and ORD-015 rules. The user can send a test to themselves, save the send as a draft and schedule it. Each recipient gets a personal link delivered through INT-015 that is priced and scoped to their own account. Opening it requires that buyer's sign-in or a single-account signed token, so a forwarded link never shows another account's prices. Delivery, bounce and suppression state is kept per recipient. The send is kept as a campaign record with delivered, bounced, suppressed, opened, viewed and ordered counts and order value per recipient; orders are attributed to it under RPT-002's rules. Resending a campaign reaches only recipients who have not yet received it, and adding accounts to it sends only to the new ones. Reps do the same for their assigned accounts from the rep app (REP-001). this clause adds per-send delivered, opened, viewed, ordered and order value to RPT-002’s report, attributing an order only when it was placed from the campaign’s link or form. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#cat-011).

**Acceptance.**
1. Build a segment of 30 accounts across two price books that includes one pending account, one closed account and one suppressed email address.
2. Send a spring line sheet to it as a suggested-products order form with a PDF attached, after a test send and a saved draft.
3. Exactly 28 sends go out, the pending and closed accounts are listed as excluded and the suppressed address is reported as suppressed.
4. Open the link as buyers from each price book: each sees only their own prices on the page and in the PDF.
5. Forward one link to a buyer at another account, who gets no access to the first account's prices.
6. Place two orders from the form: the campaign shows 28 delivered, the opens and views, and 2 orders with their value.
7. Resend the campaign: no new email reaches any of the 28 recipients.

**Evidence.** None.
**Gap.** Group sends, saved segments, suggested-products order forms, per-recipient priced links and campaign tracking are not implemented.

### Commercial pricing

#### PRI-001 — Negotiated USD price books

Core · target · **done** · Cites BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-1

**Requirement.** US accounts receive negotiated price books in USD with exact integer minor units, visible currency and documented rounding. Integer-cent prices multiplied by whole-unit quantities require no rounding; screens label the ISO currency code. New orders record their price book’s ISO currency (USD by default, with explicit CAD books under PRI-008); orders without a currency field are legacy AUD and retain that label and their cents through restore. Existing AUD orders retain their original currency; currency is never inferred from a dollar symbol or converted by relabeling an amount. PRI-008 adds optional suggested retail prices (MSRP) per currency beside the wholesale price and inherits these exact-cent and visible-currency obligations . CAT-006 and PRI-006 inherit them for additional brands and currencies. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pri-001).

**Acceptance.**
1. Assign different USD prices to two accounts, prepare orders and compare checkout, invoice and exported cents.
2. Restore a legacy AUD order and show AUD unchanged.

**Evidence.** `tests/api/order-guarantee.test.mjs` — “BAR-002: USD and legacy AUD orders retain exact human snapshots, one acknowledged Pier handoff, and invoice only fully eligible quantities”
**Gap.** None.

#### PRI-002 — Quantity breaks and account discounts

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1

**Requirement.** Price books express volume or graduated breaks, account/group discounts and approved overrides with an explicit precedence and effective period. Cart and quote explain which rule won; changing quantity recomputes the full eligible total before approval. ORD-004 and ORD-005 inherit the same pricing explanations and frozen rule snapshots before adding quotes or quote revisions. Until ACC-005 supplies supplier roles and exception limits, the signed-in owner/admin approves rules by saving the account; Agent calls for edit them carry the effect’s risk classes and follow company policy. Each SKU stock-unit price and each configured selling-unit price may have its own dated rule; thresholds count that selected selling unit, never mixed-unit stock totals. Effective dates are inclusive YYYY-MM-DD days in America/New_York. A volume threshold applies its rate to the whole line at or above the threshold; graduated rates apply only to quantities above each threshold, with the agreed rate below the first. A named group discount is assigned in the account price; an explicit account discount, including zero, replaces it. An approved override with a reason replaces all breaks and discounts. Rates are integer USD cents and discounts integer basis points; the exact line amount after discount rounds once to nearest cent, half up. Orders sum integer line cents. The cart recomputes when quantities change; submission and first approval refuse a changed effective rule and require a new draft. Orders, invoice CSV and archives freeze the applied rule, segments, date, discount, explanation and exact total; legacy CSV account imports preserve rules absent from their format. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pri-002). Any agent call carries the classes computed in the Agent surface; the company’s policy decides that call within its sponsor’s current role.

**Acceptance.**
1. Price quantities just below and above a volume break, combine an account discount and a negotiated override, and verify the displayed rule and exact total survive the order snapshot.

**Evidence.** `tests/api/pricing.test.mjs` — “PRI-002 / PRI-007: dated volume/graduated breaks, account/group precedence and approved overrides explain and freeze exact commercial totals”
**Gap.** None.

#### PRI-003 — Case packs minimums and increments

Core · target · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1

**Requirement.** Merchants set SKU minimums, order-value minimums, case-pack multiples and allowed increments, including per-split minimum policies. Invalid quantities receive an explanation and an explicit suggested correction; no import silently inflates a buyer commitment. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pri-003).

**Acceptance.**
1. Enter below-minimum and non-case quantities in the cart, CSV and API, then split a valid order.
2. Each door enforces the configured rules and requires the buyer to accept any corrected quantities.

**Evidence.** `tests/api/case-packs.test.mjs` — “PRI-003: case packs and increments refuse invalid quantities at the order, agent, reorder and import doors with explicit corrections, never silently inflating”
**Gap.** Missing journey: enforce the declared per-split quantity policy on a valid split order. The cited journey proves cart, agent, reorder and import pack/increment corrections.

#### PRI-004 — Unit of measure pricing

Core · target · **done** · Rules D-6, D-1

**Requirement.** Buyers select allowed each/case/pallet or measured units with exact conversions, price basis, pack contents and stock deductions. Mixed units cannot create fractional cases accidentally and invoice lines name both ordered units and base units. The current account price is per one Pier stock unit; optional, case-sensitive selling-unit definitions add a distinct code, exact base-quantity conversion, integer USD-cent price and pack contents. Counts, including case and pallet, are whole units. Explicit measured units accept positive quantities and conversions with up to six decimal places and at most 1,000,000; conversions requiring finer base precision or exceeding the inventory authority range are refused. Each measured line rounds once to the nearest cent, exact half cents up, and the order adds those integer line cents. Combined base quantities per SKU enforce minimums and stock and become one Pier reservation line per item. Orders and invoice CSV retain ordered unit, conversion, base unit/quantity, pack contents and line-price basis; old records leave unrecorded unit labels absent. Draft editing and ORD-003 reorders preserve separate SKU/unit lines and revalidate current conversions and prices; issued snapshots never change. Later order doors in ORD-001, ORD-002, ORD-004, ORD-008, ORD-009, ORD-013, ORD-014, REP-002 and INT-012 inherit these unit and price-basis obligations . The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pri-004).

**Acceptance.**
1. Order two cases of 12 and six each of one SKU, inspect 30 base units in the handoff and the correct separate invoice bases, and reject an undefined unit conversion.

**Evidence.** `tests/api/units.test.mjs` — “PRI-004: mixed cases/each and measured units use exact base stock, unit prices and immutable invoice bases”
**Gap.** None.

#### PRI-005 — Bundles and wholesale promotions

Core · target · **done** · Cites BASE-AUDIT-001 · Rules D-6, D-1

**Requirement.** Staff create fixed bundles, mix-and-match offers and time-limited promotions with eligible accounts, SKU groups, redemption rules and stacking precedence. Preview exposes the discount and margin impact; returns reverse only the original applicable discount. this clause adds promoted orders, their promotion discounts and results net of returns to RPT-002’s report, with the attribution rule shown. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pri-005).

**Acceptance.**
1. Combine eligible styles to qualify for a mix-and-match promotion, remove one, apply a nonstackable discount and return part of the bundle.
2. Totals and credits follow the published rule once.
3. supplier owners and admins publish dated offers for explicit accounts and SKU sets.
4. Fixed bundles require every configured base-unit quantity; mix offers require a combined base-unit threshold.
5. Each qualified offer redeems once per order against all eligible units.
6. Highest priority wins, with offer ID breaking ties: an exclusive winner replaces account and group discounts and excludes other offers; otherwise stackable offers apply sequentially to remaining cents.
7. Approved overrides and negotiated quotes are excluded.
8. Preview shows the current account total, offer basis, discount, final cents and margin against an explicit supplier-entered scenario cost, never inferred inventory cost. Draft replacements and submitted quantity revisions requalify the whole basket; submission and supplier approval refuse stale promotion prices. Approved lines freeze offer IDs, names, original basis, discounts and net cents. PAY-010 credits only the original net line value against a real Pier receipt, once per receipt, without retroactive requalification; the final returned unit receives remaining rounding cents. RPT-002 counts placed, uncancelled promoted orders once by preparation date, account and currency, using frozen offer attribution and original net values less cumulative Pier returns. Per-offer rows overlap for stacked offers; summary totals count each order once. Product, rep and cohort comparisons use the same scope. Unavailable Pier returns show unknown, never zero.

**Evidence.** `tests/api/pricing.test.mjs` — “promotion mix qualification, removal, exclusive precedence and source-priced partial returns reconcile once in the scoped conversion report”; `tests/api/pricing.test.mjs` — “fixed bundle requirements, dated account eligibility, ordered stacking and stale promotion drafts are enforced through public commands”; `tests/journeys/promotions.test.mjs` — “supplier publishes offers, previews removal and margin, and sees original return credits and net promotion attribution at desktop and phone”
**Gap.** None.

#### PRI-006 — Effective prices and additional currencies

Core · target · **partial** · Rules D-6, D-1

**Requirement.** Merchants schedule price-book revisions and, after the USD default, offer explicit CAD/EUR/GBP books where enabled. One order has one explicitly labeled ISO currency; all prices and totals retain exact integer minor units (whole-unit quantity × integer cents requires no rounding), taxes and provider collections use it, and reports disclose their recorded USD conversion basis rather than rewriting transaction amounts. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pri-006).

**Acceptance.**
1. Schedule a future USD revision, quote before and after it, then place a CAD order through a compatible payment sandbox.
2. All documents keep the agreed ISO currency and original integer minor units and the report shows its dated USD conversion; whole-unit quantities × integer cents need no rounding.

**Evidence.** `tests/api/pricing.test.mjs` — “scheduled book revisions quote exact USD prices on either side of midnight Eastern and refuse stale cart and quote acceptance”; `tests/api/pricing.test.mjs` — “explicit foreign currency books preserve exact cents in every commercial document and disclose a frozen dated USD reporting basis”; `tests/api/catalog-search.test.mjs` — “catalog search enforces current account authority and invalidates observations after price, attribute or connection changes”; `tests/journeys/pricing.test.mjs` — “supplier schedules a complete book and dated USD basis, buyer keeps CAD documents, and reports show the recorded conversion without changing cents”
**Gap.** CAD Stripe sandbox receipt pending: the held-key harness requires a public HTTPS callback ingress unavailable in this cloud environment. Local network-edge payment assertions do not prove this live-provider acceptance point.

#### PRI-007 — Explainable commercial validation

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1

**Requirement.** The server revalidates account entitlement, price revision, minimums, units, stock freshness, credit, tax and shipping before acceptance. Buyers see each blocking rule and whether a manager can approve an exception. Stale client totals and agent-provided prices cannot become authoritative. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#pri-007) apply. Any agent call carries the classes computed in the Agent surface; the company’s policy decides that call within its sponsor’s current role. RL-4 records the adopted commercial semantics.

**Acceptance.**
1. Alter client and agent totals and prices, refuse invalid units, packs and minimums, change a price after drafting and submit through the public API.
2. Recheck live stock and refuse an unavailable/revoked source; a supplier reservation shortfall stays visible and cannot invoice.
3. Exercise freshness refusal, refresh and a supplier-only reasoned exception, and inspect its audit.
4. The credit-exhaustion step is retained in PAY-004/PAY-005 as part of credit acceptance.

**Evidence.** `tests/api/validation.test.mjs` — “PRI-007: server admission rejects hidden items, undefined units, minimums and changed prices; client and agent totals never become authority”; `tests/api/pricing.test.mjs` — “PRI-002 / PRI-007: dated volume/graduated breaks, account/group precedence and approved overrides explain and freeze exact commercial totals”; `tests/api/stock-promise.test.mjs` — “STK-002 / PRI-007: Pier stock by warehouse and incoming promise dates, account warehouse rules and a stale-stock limit with refresh or recorded exception”
**Gap.** Missing journey in the old evidence set: complete credit, tax and shipping admission with recorded exceptions. The cited validation, pricing and stock journeys prove native amounts, units, minimums, stale prices and stock; credit proof now also exists in tests/api/purchase.test.mjs but is not old cited evidence.

#### PRI-008 — Suggested retail prices and price display

Core · target · **partial** · Cites BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-1

**Requirement.** Price books retain exact integer minor units and explicit ISO currency labels under PRI-001, and carry an optional suggested retail price (MSRP) per variant and currency next to the wholesale price; it is imported, edited and exported with the price book and may differ by size. Merchants choose for each line sheet, lookbook, storefront and document type whether buyers see wholesale, retail or both, and where both show, the buyer sees the margin between them. MSRP is informational only: it never feeds cart, quote, tax, invoice, payment or commission totals, and a missing MSRP shows as absent rather than derived from wholesale. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pri-008).

**Acceptance.**
1. Import a price book with wholesale and MSRP columns in USD and CAD, publish one line sheet showing both prices and one showing wholesale only, and open each as its buyer on the page, PDF, order confirmation (ORD-014) and order CSV.
2. Each shows exactly the configured columns and ISO currency with exact integer minor units, the displayed margin matches the two prices, and every order total equals the wholesale lines alone.
3. Whole-unit quantities × integer cents require no rounding.

**Evidence.** `tests/api/pricing.test.mjs` — “MSRP books import and edit exact USD/CAD cents and preserve configured sheet, PDF and order document prices without changing wholesale totals”; `tests/journeys/line-sheets.test.mjs` — “supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone”
**Gap.** Missing journey: configured MSRP display across every named lookbook, storefront, confirmation PDF and CSV surface. The cited journeys prove account books and line-sheet display without changing wholesale totals.

### Buying quoting and order lifecycle

#### ORD-001 — Quick order and CSV cart upload

Core · target · **done** · Cites BASE-DATA-001, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1, D-2

**Requirement.** Buyers and reps add lines by SKU or barcode, paste quantities and upload a CSV with SKU/barcode and quantity. A buyer can also download the working cart as a spreadsheet order form, fill it in offline and upload it back through the same preview. Preview resolves aliases, duplicates, packs, hidden SKUs and errors before replacing or merging a cart by explicit choice. Valid lines are not quietly lost. Uploaded and offline-form quantities inherit PRI-003's case-pack, increment and minimum refusal with explicit corrections. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-001). RL-5 records the adopted commercial semantics.

**Acceptance.**
1. Upload a real-shaped 80-line CSV with a duplicate, unknown SKU and invalid case quantity; review and correct errors, choose merge, and compare every accepted line and total in the prepared draft.
2. Add lines by SKU and by scanned barcode, and see unknown, archived and unlisted SKUs refused alike.
3. Download the cart's style-by-size order form, fill it offline and upload it: the preview shows exactly the filled quantities.

**Evidence.** `tests/api/cart-import.test.mjs` — “ORD-001: barcode/SKU paste and an 80-line CSV preview resolve duplicates, hidden SKUs and case packs before an explicit merge or replace; order forms round-trip”
**Gap.** None.

#### ORD-002 — Saved shopping lists

Core · target · **done** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1, D-2

**Requirement.** Company buyers save, name, share and duplicate lists for stores, recurring assortments and projects. Lists store desired SKUs and quantities rather than frozen commercial promises; adding a list to a cart rechecks current price, stock and pack rules. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-002).

**Acceptance.**
1. Save and share a store replenishment list, change one price and discontinue one SKU, then add it to a cart as another authorized buyer.
2. Show current totals and explicit exceptions without exposing another company list.

**Evidence.** `tests/api/saved-lists.test.mjs` — “ORD-002: a shared store list adds to another authorized person’s cart at current prices with explicit exceptions; private and other-company lists stay hidden”
**Gap.** None.

#### ORD-003 — Reorder from history

Core · target · **done** · Rules D-6, D-1, D-2

**Requirement.** Buyers find prior orders by PO, date, SKU and delivery location, then reorder all or selected lines. Current availability, replacement SKUs, prices and minimums are compared with the original and require acknowledgment of material differences. A delivery location is the order’s user-entered label and, where the account keeps ACC-003 locations, its copied ship-to (format checked, not USPS-verified); history search matches either, and a reorder keeps the original ship-to while it is active, otherwise the current default. Date search uses inclusive calendar-day bounds in America/New_York. Replacement SKUs are explicitly selected from the current account assortment, never guessed or silently substituted. Selected original quantities stay unchanged; insufficient stock or unmet current SKU/order minimums block the reorder rather than silently correcting quantities. The review shows original and current ISO currency, unit prices, SKU minimums, current availability, payment terms and the selected-line totals; its acknowledgment binds the original revision, current account revision and comparison fingerprint. Changed inputs require a fresh review. Acknowledgment prepares a new draft for ordinary human submission and records the original order and acknowledging person; it does not reserve stock. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-003).

**Acceptance.**
1. Open a six-month-old order, select three lines, reorder after a price and SKU change and review the difference summary before checkout; the original order is unchanged.

**Evidence.** `tests/api/reorder.test.mjs` — “ORD-003: search six-month history, selectively reorder with current SKU/price/minimum/stock review and preserve the original”
**Gap.** None.

#### ORD-004 — Negotiated wholesale quotes

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2

**Requirement.** Buyers request quotes from a cart; reps propose account-specific line prices, quantities, discounts, shipping, terms and validity dates subject to manager limits. An accepted quote converts to exactly one linked order after current stock and credit checks; expiry or revision invalidates stale acceptance. This clause inherits PRI-002 pricing precedence, date/rounding semantics, current-rule revalidation, explanations and frozen snapshots . this clause adds its records to DATA-001’s export (JSON and per-kind CSV) with stable IDs, currency, source mapping and revision, in the same owner/buyer scope. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. Until ACC-005 supplies reps and sales managers, the supplier owner or admin proposes quotes and the manager limit is zero: any quoted line below its current PRI-002 basis needs a recorded owner/admin discount approval with a reason before the buyer can accept, and ACC-005 inherits per-role amount limits for quote discounts . A proposed line takes either a negotiated selling-unit price (quantity × price in integer cents) or a discount in basis points off its PRI-002 basis line, each rounded half up once to a cent. Valid-through dates are inclusive calendar dates in America/New_York, and acceptance after that date is refused. Only the account’s buyer accepts, only the latest approved revision can be accepted, and accepting it again returns the same order. Acceptance recalculates every line at the PRI-002 rule and refuses a quote whose basis changed (a revision at the rule is required), checks PRI-003 quantity rules, the account’s ACC-004 lifecycle and minimum, and live Pier promiseable stock, then creates one submitted order with the quoted lines, terms and revision that still needs supplier approval under BAR-002. Barrow records no credit exposure yet, so PAY-004 and PAY-005 add their credit check to quote acceptance before they ship. A shipping note remains a note. When delivery methods are configured under SHIP-001, the proposed delivery charge and window are separately recorded, explicitly accepted by the buyer and carried into the order charges after current eligibility revalidation. ORD-004 adds no import; an importer that later feeds quotes reports them in MOVE-007’s reconciliation under its own clause. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-004).

**Acceptance.**
1. Request a quote, approve a rep discount, accept it twice through buyer and API doors and inspect one order with the accepted revision.
2. Expire a second quote and refuse its acceptance.

**Evidence.** `tests/api/quotes.test.mjs` — “ORD-004: a buyer requests a quote, a discount is approved, double acceptance through the buyer and API doors yields one order at the accepted revision, and stale, revised or expired quotes are refused”
**Gap.** None.

#### ORD-005 — Quote conversation revisions and notes

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1, D-2

**Requirement.** Quote threads distinguish buyer-visible messages from internal notes, retain attachments and every revision, identify who changed commercial terms, and notify the assigned buyer and rep. Approvals and acceptance bind to one version. This clause inherits PRI-002 pricing precedence, date/rounding semantics, current-rule revalidation, explanations and frozen snapshots . The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-005).

**Acceptance.**
1. Exchange a message, add an internal margin note and revise a quote while the buyer has its old version open.
2. Notify participants, hide the internal note from buyer exports and refuse old-version acceptance.
3. AUTO-003 emails these notices to the same audiences; in-app notices are unchanged.
4. Emails contain the notice summary and authorized quote link, never the message body, internal-note text or attachment.

**Evidence.** `tests/api/quotes.test.mjs` — “ORD-005: buyer messages and staff-only internal notes with attachments, revisions that name who changed which terms, participant notices, and acceptance bound to one version”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”
**Gap.** None.

#### ORD-006 — Self-service checkout

Core · target · **partial** · Rules D-6, D-1, D-2

**Requirement.** Approved buyers review lines, addresses, delivery windows, freight, tax, discounts, payment choice and terms, then place an order without mandatory supplier intervention when policy permits. A held or approval-required order says what remains unresolved and never claims acceptance or payment prematurely. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-006).

**Acceptance.**
1. Complete one eligible card order and one net-terms order through the buyer storefront, then attempt a credit-held order.
2. Receive clear confirmations for accepted orders and an actionable hold for the third.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Buyers submit drafts with terms; every order requires supplier approval and checkout tax, freight and payment are missing.

#### ORD-007 — Purchase references and requested dates

Core · target · **done** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1, D-2

**Requirement.** Orders retain buyer PO number, buyer SKU aliases, requested delivery date, cancel-after date, instructions and supporting PO attachment. Duplicate PO detection is account-scoped, supports intentional releases and asks for confirmation instead of creating accidental repeat orders. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-007).

**Acceptance.**
1. Submit the same company PO twice, refuse the accidental duplicate, authorize a numbered release and inspect date and attachment fields in the order and ERP handoff.

**Evidence.** `tests/api/purchase.test.mjs` — “ORD-007: purchase dates, instructions and buyer SKU aliases reach the order and Pier; an accidental duplicate PO is refused until a numbered release is authorized”
**Gap.** None.

#### ORD-008 — Seasonal prebooks and ship windows

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2

**Requirement.** Buyers order future seasons and preorder inventory against published opening/closing dates, minimums, deposits and promised ship/cancel windows. Prebook quantities and available-now stock are distinguished, capacity is checked with the inventory authority and later releases remain linked to the original commitment. this clause takes over ordering into future ship windows against STK-002’s incoming supply, with source-provided promise authority and explicit unknowns. this clause adds its release-level commitments and recorded promise-change history to RPT-003. this clause shows prebooks as their own rows in RPT-001’s sales report. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#ord-008) apply.

**Acceptance.**
1. Place a spring prebook with two ship windows and a deposit, close the season, release the first window and backorder a delayed style.
2. Buyer and operations see committed, released and outstanding quantities separately.

**Evidence.** `tests/api/stock-promise.test.mjs` — “seasonal prebooks bind published windows, live incoming capacity and exact deposits; closing, release and delayed commitments reconcile without booking twice”; `tests/api/stock-promise.test.mjs` — “seasonal admissions refuse closed dates, insufficient or changed source capacity, wrong currency and warehouses, stale observations and invalid windows”; `tests/api/stock-promise.test.mjs` — “seasonal authority, deposit gates, promise bounds and restore fences preserve original commitments and refuse replayed effects”; `tests/api/pricing.test.mjs` — “seasonal brand profile requires current approval and keeps the exact CAD seller, deposit and linked invoice without mixing currencies”; `tests/journeys/confirmations.test.mjs` — “buyer books a spring season with a deposit and two windows; supplier closes intake, releases once and records a delayed style visible to buyer and operations”
**Gap.** Missing journey: reconcile the seasonal deposit through two invoiced releases and a delayed style. The cited source proves seasonal commitments and fixed-window release, while PAY-003 allocation remains owed.

#### ORD-009 — Backorders and shipment splits

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2

**Requirement.** Buyers choose ship-complete, partial shipment or permitted backorder policies with explicit freight and billing consequences. Accepted lines may split into dated releases; shipped, allocated, backordered and canceled quantities reconcile to the original and exceptions need a named owner. Canceling a remaining release inherits STK-004's acknowledged release and held-until-confirmed promise. Each split release inherits PRI-003's quantity rules, with any per-split minimum policy stated before splits ship. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause adds its records to DATA-001’s export (JSON and per-kind CSV) with stable IDs, currency, source mapping and revision, in the same owner/buyer scope. this clause takes over ordering into future ship windows against STK-002’s incoming supply, with source-provided promise authority and explicit unknowns. this clause adds its release-level commitments and recorded promise-change history to RPT-003. retain REP-004 original commission attribution on release splits and earn/reverse only the eligible quantity once. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-009).

**Acceptance.**
1. Accept ten cases with six available now and four next month, choose a split, ship six and cancel one remaining case.
2. Order, invoices, freight and stock authority agree on six shipped and three outstanding.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Reservation shortfalls are visible; buyer backorder acceptance, release splits and shipment billing do not exist.

#### ORD-010 — Immutable agreed order snapshots

Core · target · **done** · Cites BASE-DATA-001 · Rules D-6, D-1, D-2

**Requirement.** Prepared orders retain customer reference, exact line quantities and prices, terms and preparing identity; submitted and approved orders retain those people and dates. Editing current account prices cannot rewrite the agreed order or stable invoice export. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-010).

**Acceptance.**
1. Prepare, submit and approve through buyer/supplier HTTP doors, change the account price and terms, then download twice.
2. Original prices, total, terms, reference and approval identities remain unchanged.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** None.

#### ORD-011 — Order changes and cancellation

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-6, D-1, D-2

**Requirement.** Edits reach a submitted or accepted order from two doors until the disclosed fulfillment cutoff. Buyers request edits or cancellation themselves. Sales staff start edits on the buyer's behalf, for example after a phone call, within their ACC-005 role and amount limits. Either door can change line quantities, add or remove lines, move ship and cancel windows, and change ship-to and PO. Every edit shows a before/after diff and obtains any required commercial approval. It then coordinates the inventory release or reallocation (STK-004), tax recalculation, payment authorization and deposit adjustment (PAY-003), and sends one edit handoff to the inventory/ERP authority (STK-003, INT-020). The result is one new ORD-014 revision carrying exactly that diff. A staff edit notifies the buyer with the revision (AUTO-004). Where ORD-015 or account policy marks the change as material, the order is held until the buyer accepts the new revision. Shipped units cannot be canceled or edited. this clause adds its revision and promise-change history to RPT-003. retain REP-004 frozen attribution and original discount basis through revisions, applying exact commission differences once rather than earning the whole order again. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#ord-011) apply.

**Acceptance.**
1. As a buyer, request a quantity reduction after acceptance but before picking, approve it, release stock and adjust the charge once.
2. Refuse cancellation of already shipped lines and offer a linked return request.
3. As a sales coordinator, move another accepted order's ship window and reduce one size.
4. Revision 2 shows only that diff, the inventory authority receives one edit, and the buyer gets one change notice.
5. On a terms-required account the edited order holds until the buyer re-accepts.
6. A rep without edit rights and an edit past the cutoff are refused.

**Evidence.** `tests/api/confirmations.test.mjs` — “ORD-014: a seasonal matrix order with two ship windows is confirmed with seller identity and variants, revised once by its buyer, emailed per exact revision and kept for buyer and rep”
**Gap.** Supplier-started edits within ACC-005 role and amount limits, accepted-order edits with STK-004 release or reallocation and one edit handoff to Pier (the pinned Pier has no order-edit command), adding or removing lines, moving windows, ship-to and PO, the disclosed cutoff, AUTO-004 change notices, material-change holds, RPT-003 revision history, REP-004 commission differences, refusing shipped lines with a linked return and the acceptance journey remain.

#### ORD-012 — Buyer order status and confirmations

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-6, D-1, D-2

**Requirement.** An account-scoped timeline shows submitted, approval pending, accepted, held, backordered, allocated, shipped, delivered, returned and closed states with source timestamps, documents and owner. Confirmations and change notices identify the exact order revision; unknown upstream state stays unknown. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-012).

**Acceptance.**
1. Follow a real-shaped order through acceptance, split shipment and delivery via connected events, open its timeline as the buyer and verify the confirmation, tracking and exception state.
2. Another buyer cannot read it.

**Evidence.** `tests/api/timeline.test.mjs` — “ORD-012: the buyer timeline shows recorded Barrow and real Pier events, split shipments and a return, never infers delivery, and is account-scoped”
**Gap.** Missing journey: follow split shipment and verified carrier delivery through the buyer timeline. The cited journey proves recorded native order, confirmation and inventory states and labels unavailable tracking unknown.

#### ORD-013 — Multi-location orders and release groups

Core · target · **missing** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ACCESS-002 · Rules D-6, D-1, D-2

**Requirement.** A purchaser can allocate one buying session across authorized ship-to locations and delivery windows, seeing separate freight/tax and minimums before confirming a linked group of orders. Partial failure reports which releases were accepted; retry cannot duplicate accepted children. This clause owns ORD-001's multi-delivery order form: per-delivery ship window, PO and ship-to columns, uploaded through ORD-001's preview and shown as one release per delivery with its quantities, PO and location before confirming. this clause adds its records to DATA-001’s export (JSON and per-kind CSV) with stable IDs, currency, source mapping and revision, in the same owner/buyer scope. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. preserve REP-004 frozen commission attribution across locations/releases and assert exact eligible earning quantities without duplication. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-013).

**Acceptance.**
1. Split one assortment across three stores and two delivery windows, fail one inventory handoff and retry.
2. Inspect one accepted child per intended release with correct addresses, totals and group reference.
3. Download a matrix order form, fill sizes for two deliveries with different POs and ship-tos, and upload it: the preview shows two releases with the right quantities, POs and locations.

**Evidence.** None.
**Gap.** Implement multi-location orders and release groups and prove the stated journey.

#### ORD-014 — Order confirmation documents

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1, D-2

**Requirement.** Every submitted, accepted and revised order produces a numbered order confirmation PDF and CSV with seller and buyer identity, PO, bill-to and ship-to, product images, style/color/size quantities, wholesale prices and, where configured, MSRP (PRI-008), ship and cancel windows, payment terms, the attached sales-terms version and its acceptance or signature record (ORD-015). Each revision is a separate document; earlier revisions stay downloadable, and the confirmation email links or attaches the exact revision. Each confirmation appears on ORD-012’s timeline. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#ord-014) apply to this capability.

**Acceptance.**
1. Submit a matrix order with two ship windows, download its confirmation PDF and CSV as buyer and rep, revise one quantity and download again.
2. Both revisions are retained and differ only in the changed line, each names its terms version and acceptance, and another buyer is refused.

**Evidence.** `tests/api/confirmations.test.mjs` — “ORD-014: numbered submitted and accepted confirmations retain exact commercial snapshots through edits, retry and cancellation”; `tests/api/confirmations.test.mjs` — “ORD-014: a seasonal matrix order with two ship windows is confirmed with seller identity and variants, revised once by its buyer, emailed per exact revision and kept for buyer and rep”; `tests/journeys/confirmations.test.mjs` — “owner records seller and variant details, a buyer revises a two-window seasonal order before acceptance, and the owner exports that season as style, color and size totals at desktop and phone”
**Gap.** None.

#### ORD-017 — Named confirmation export layouts

Core · target · **done** · From ORD-014 · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1, D-2

**Requirement.** Brand admins keep several named order export layouts (columns, order and per-variant or matrix shape), mark one as the default, and staff pick a layout when downloading; INT-020 uses the same layouts for ERP files. Layout changes never rewrite issued snapshots; selectable columns and matrix shape follow the commercial rules. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#ord-014) apply to this capability.

**Acceptance.**
1. Save a second export layout, set it as default and download a confirmation: the CSV follows that layout.

**Evidence.** `tests/api/confirmations.test.mjs` — “ORD-017: named per-line export layouts set default and selected column ordering without rewriting immutable confirmation values, and survive archive restore”; `tests/journeys/confirmations.test.mjs` — “owner records seller and variant details, a buyer revises a two-window seasonal order before acceptance, and the owner exports that season as style, color and size totals at desktop and phone”; `tests/api/confirmations.test.mjs` — “ORD-014: a seasonal matrix order with two ship windows is confirmed with seller identity and variants, revised once by its buyer, emailed per exact revision and kept for buyer and rep”
**Gap.** None.

#### ORD-018 — Bulk order and production exports

Core · target · **done** · From ORD-014 · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1, D-2

**Requirement.** Staff can also select many orders, by filter or by hand (for example one season's spring delivery), and export them as one spreadsheet in a chosen layout, either one row per order line or totaled by style, color and size for production and cutting plans; the export names every included order and revision. Each confirmation revision appears on ORD-012's order timeline. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-014).

**Acceptance.**
1. Select 50 orders from one season and export per line and totaled by style, color and size; totals equal the selected source lines and name every included revision.

**Evidence.** `tests/api/confirmations.test.mjs` — “ORD-018: bulk CSV combines 50 explicitly selected immutable revisions with named layouts, source identities and unchanged selling-unit bases”; `tests/api/confirmations.test.mjs` — “ORD-018: fifty recorded orders of one season export per line and as style, color and size production totals equal to their lines”; `tests/journeys/confirmations.test.mjs` — “owner records seller and variant details, a buyer revises a two-window seasonal order before acceptance, and the owner exports that season as style, color and size totals at desktop and phone”
**Gap.** None.

#### ORD-015 — Versioned sales terms and buyer acceptance

Core · target · **partial** · Cites BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001 · Rules D-6, D-1, D-2

**Requirement.** Merchants publish versioned sales terms and conditions (cancellation, returns, chargebacks, minimums and deposits) as text or PDF and assign a version per account, brand or season, separately from payment terms and portal usage terms. Where an account requires acceptance, checkout refuses submission until the buyer accepts the current version, and a rep order captures the buyer's on-device signature and printed name, offline included. Each order records who accepted which version, how and when. A later version never changes an accepted order; it applies to new orders and to material revisions, which require fresh acceptance. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-015).

**Acceptance.**
1. Assign terms version 1 to an account that requires acceptance, attempt submission without accepting (refused), accept as the buyer and submit, then submit a rep order with signature capture.
2. Publish version 2: both orders keep version 1 and its acceptance record in their confirmation PDFs, and the next order requires version 2.

**Evidence.** `tests/api/sales-terms.test.mjs` — “ORD-015: versioned sales terms are accepted by the buyer or captured by signature, stay on each order across a later version, and the next order needs the new version”; `tests/api/sales-terms.test.mjs` — “ORD-015: terms published as a PDF download only for the buyer they are assigned to, and agents cannot publish or assign”
**Gap.** Missing journey: capture sales-terms acceptance in the offline native rep app, synchronize it and read the immutable confirmation. The cited HTTP journey proves native buyer acceptance, uploaded signature and later-version isolation.

#### ORD-016 — Canceled styles across open orders

Core · target · **missing** · Cites BASE-ROLE-001 · Rules D-6, D-1, D-2

**Requirement.** When production drops a style, color or size, an authorized sales manager marks it canceled for a season or delivery window. Barrow then flags every open order and prebook that contains it, unshipped units only. The Orders page shows a preview with the affected units and wholesale value per order and per account, and totals across them. From the preview, staff choose Drop All, drop from selected orders, or offer a STK-005 substitute on selected orders. Each affected order then gets exactly one ORD-011 revision, one stock release or reallocation request (STK-004) and one deposit, credit or payment-authorization adjustment (PAY-003, PAY-010). It also gets one buyer notice (AUTO-004) naming the dropped lines and any substitute offer. Shipped and invoiced units are never touched; minimums broken by the drop are flagged for review rather than silently enforced. The drop runs under one idempotency key, so replaying or resuming it changes nothing already applied, and a partial failure lists exactly which orders are still pending. CAT-008 retirement of a product that still sits in open orders routes through this preview. reverse REP-004 only the cancelled original merchandise commission under its frozen splits and retain attributed source adjustments without duplicate reversals. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ord-016).

**Acceptance.**
1. Cancel a style that sits in 25 open prebooks across 20 accounts, one of them partly shipped.
2. The preview lists all 25 orders with units and value.
3. Drop All creates 25 revisions, each with one stock release request; the shipped units stay on the partly shipped order.
4. Deposits are adjusted once, and each of the 20 buyers gets one notice.
5. Interrupt the run after 10 orders and resume, then replay the drop: no order gets a second revision, release or notice.
6. Offer a substitute on two other orders instead and see each buyer's accept/decline under STK-005.

**Evidence.** None.
**Gap.** External dependency: the pinned run-pier revision has no partial order-edit command; its whole-order cancellation cannot reduce one style or preserve another open line. Native prebooks, financial adjustments, notices and the following door also remain: no style cancellation, open-order impact preview, bulk drop or per-order revision, release, deposit adjustment and buyer notice exist.

### Stock promises and fulfillment handoff

#### STK-001 — Live customer-visible availability

Core · target · **done** · Rules D-6, D-1, D-2, D-5

**Requirement.** The catalog reads current promiseable quantities from Pier and validates them when preparing a draft. It exposes observation time and account-priced items without leaking the upstream business state. Missing or revoked connection authority prevents a fabricated stock promise. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#stk-001).

**Acceptance.**
1. Read an account catalog against real Pier stock, exhaust a SKU and attempt an over-order.
2. Confirm the available quantity, server refusal and no stock effect from draft preparation.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** None.

#### STK-002 — Available to promise by warehouse and date

Core · target · **done** · Cites BASE-AUDIT-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** Connected inventory adapters, or scheduled ATS files through the INT-020 flat-file feed, provide warehouse-specific sellable stock, reserved quantities, incoming receipts and available-to-promise dates where the source supports them. The portal labels source, freshness and unknown dates, respects account warehouse rules and blocks acceptance on stale promises under merchant policy. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#stk-002).

**Acceptance.**
1. Connect two Pier warehouses and a committed PO with a later promise date, compare immediate stock by warehouse with incoming supply, and see an order beyond received stock refused.
2. Limit an account to one warehouse and see only its stock promised.
3. Set a 15-minute limit and attempt to submit a draft observed 20 minutes ago: the stale source is shown, and only a valid refresh or a recorded supplier exception lets it submit.
4. With Pier unreachable, nothing is promised.

**Evidence.** `tests/api/stock-promise.test.mjs` — “STK-002 / PRI-007: Pier stock by warehouse and incoming promise dates, account warehouse rules and a stale-stock limit with refresh or recorded exception”
**Gap.** None.

#### STK-003 — Durable order acknowledgment

Core · target · **done** · Rules D-6, D-1, D-2, D-5

**Requirement.** Each accepted order has one external handoff identity, an acknowledged source order ID and reconciliation state. Timeouts remain pending rather than successful, retries reuse the same identity, and a changed destination cannot accept an old order accidentally. This applies to every inventory adapter and to INT-020 order files, whose processed acknowledgment closes the handoff. Completion is judged on the current Pier door; INT-001, INT-004 through INT-010 and INT-020 must preserve the durable identity, pending-on-timeout, acknowledgment, reconciliation and destination-binding obligations before adding or enabling another inventory handoff. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#stk-003).

**Acceptance.**
1. Drop an acknowledgment after the inventory system creates its order, retry, and reconcile by external key.
2. Inspect one upstream order and the retained acknowledgment; change the configured destination and refuse the old-order handoff.

**Evidence.** `tests/api/order-guarantee.test.mjs` — “BAR-002: USD and legacy AUD orders retain exact human snapshots, one acknowledged Pier handoff, and invoice only fully eligible quantities”
**Gap.** None.

#### STK-004 — Reservation release and stock exceptions

Core · target · **done** · Cites BASE-ROLE-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** Inventory remains authoritative for reserving, expiring, releasing and reallocating stock. Barrow requests these effects for cancellations, approval expiry and substitutions, tracks acknowledgments and prevents an unconfirmed release from appearing available to other buyers. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#stk-004).

**Acceptance.**
1. Cancel an allocated unshipped order, lose the release response and repeat it.
2. The authority releases once; Barrow clears the exception only after confirmation and shows the correct remaining promiseable stock.

**Evidence.** `tests/api/release.test.mjs` — “STK-004: a cancelled allocated order releases once in real Pier, stays unpromised until acknowledged, and shipped orders refuse”
**Gap.** None.

#### STK-005 — Buyer-approved substitutions

Core · target · **partial** · Cites BASE-DATA-001, BASE-INPUT-003, BASE-ACCESS-002 · Rules D-6, D-1, D-2, D-5

**Requirement.** Staff propose substitute SKUs or sizes with price, unit, delivery and tax differences. The buyer accepts the exact proposed revision unless a documented account policy already grants that authority; original and substitute lines remain linked for fulfillment and credits. Any release or reallocation a substitution triggers inherits STK-004's durable release identity, held-until-acknowledged promise and shipped-unit refusal . The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#stk-005).

**Acceptance.**
1. Short a discontinued style, propose a differently priced replacement, decline once then accept a revised offer.
2. Only the accepted quantity and price reach inventory, and the original shortfall remains traceable.

**Evidence.** `tests/api/substitutions.test.mjs` — “STK-005: buyer declines then accepts a current-price split substitution; only execution replaces the real stock reservation and exports both links”; `tests/api/substitutions.test.mjs` — “STK-005: substitution scope, current account/units/stock, explicit basket and dispatched or legacy source guards refuse without inventory effects”; `tests/api/substitutions.test.mjs` — “STK-005: a lost source-release acknowledgment blocks replacement approval until retry confirms one durable release and reservation”
**Gap.** Missing journey: accept a substitute with verified tax differences and follow its exact release/reallocation. The cited substitution journeys prove priced native replacements, declining/reviewing and stock/refusal history; tax remains unknown.

### Field sales and mobile

#### REP-001 — Assigned-account rep ordering

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-AGENT-008 · Rules D-6, D-1

**Requirement.** Reps switch only among assigned accounts, see their negotiated prices, stock, history and balances and create quotes or orders on behalf of the buyer with clear acting-as attribution. Buyer approval policies still apply; Reps send line sheets and suggested-products order forms to their assigned accounts through CAT-011. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rep-001).

**Acceptance.**
1. Sign in as a rep, select an assigned account and prepare an order for buyer approval.
2. Refuse another territory and show the rep plus buyer identities on the accepted order.

**Evidence.** `tests/api/rep-ordering.test.mjs` — “REP-001: a rep switches only among assigned accounts, sees prices, stock, history and balances, prepares for the buyer, and the accepted order names rep and buyer”; `tests/journeys/rep-ordering.test.mjs` — “a rep prepares an order for an assigned account, the buyer submits it, and the accepted order names rep and buyer at desktop and phone”
**Gap.** None.

#### REP-002 — Offline native rep order writing

Core · target · **missing** · Cites BASE-ROLE-001, BASE-ACCESS-002 · Rules D-6, D-1 · Register R-3

**Requirement.** iOS and Android rep apps download explicitly authorized customer catalogs, media, prices and history for trade shows and travel, protect cached data with device sign-in and revoke access on the next connection. Offline drafts show their stock/price age and never claim a live reservation or settled payment. Reps scan products into drafts (REP-006), capture walk-up prospects (REP-007) and collect buyer signatures on sales terms (ORD-015) without a connection. Phone and tablet layouts are both supported; on an iPad or Android tablet in landscape the rep sees the line sheet beside the size matrix of the selected style. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rep-002).

**Acceptance.**
1. On both supported mobile platforms, including an iPad in landscape showing the line sheet beside the size matrix, download an assigned account, disconnect, present its line sheet and write several drafts.
2. Restart offline and recover them, then revoke the rep and reconnect to remove further access.

**Evidence.** None.
**Gap.** Implement offline native rep order writing and prove the stated journey.

#### REP-003 — Offline synchronization and conflicts

Core · target · **missing** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-6, D-1

**Requirement.** Reconnection automatically uploads each offline draft exactly once, revalidates changed prices, assortment, stock and credit and presents conflicts for rep/buyer resolution. The app shows queued, syncing, blocked and acknowledged states and retains unsent work through a crash. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rep-003).

**Acceptance.**
1. Write three offline orders, change one price and exhaust one SKU, reconnect with a dropped response and restart.
2. One draft synchronizes once and two show specific conflicts; no stale draft auto-submits or duplicates.

**Evidence.** None.
**Gap.** Implement offline synchronization and conflicts and prove the stated journey.

#### REP-004 — Rep commissions and attribution

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1

**Requirement.** Managers configure commission rules by rep, account, product and effective period, including splits, approved discounts and whether earning occurs at acceptance, shipment or payment. Returns and credits reverse the correct earned amount; statements explain each source line and export to payroll/accounting. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rep-004).

**Acceptance.**
1. Assign a split commission, accept and ship an order, record partial payment then return a line.
2. Each rep statement shows the correct earned and reversed cents and a transfer does not rewrite prior attribution.

**Evidence.** `tests/api/commissions.test.mjs` — “REP-004: dated split commissions keep approved discounts, original attribution and source-linked shipment/return cents through transfers, replay and restore; payment earnings are not recorded”; `tests/api/commissions.test.mjs` — “REP-004: policy validation, current revisions, effective precedence, mixed-unit allocation and full return/cancellation reversals conserve original cents”; `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”; `tests/api/credit-payments.test.mjs` — “finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice”
**Gap.** Missing journey: partial-payment-basis earned and reversed commission with the exact source allocation. The cited commission journeys prove frozen acceptance/shipment/return amounts and transfer isolation; the payment basis remains unrecorded.

#### REP-005 — Visits samples and trade-show selling

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · Rules D-6, D-1

**Requirement.** Reps plan account visits and appointments, record notes and sample requests, present collections and turn a show basket into a follow-up quote or order. Tasks link to the account and owner; sample fulfillment is handed to the inventory system without maintaining another stock ledger. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rep-005).

**Acceptance.**
1. Schedule a showroom visit, record a sample request and buyer notes, prepare a quote, assign a follow-up and hand the sample to inventory.
2. The rep sees the next action and completion acknowledgment.

**Evidence.** `tests/api/rep-ordering.test.mjs` — “REP-005: a rep plans a showroom visit for a held account, records buyer notes and a sample request, turns the show basket into a quote, assigns the follow-up, and sees Pier’s acknowledgment once the samples reach inventory”; `tests/journeys/rep-ordering.test.mjs` — “a rep plans a showroom visit, records buyer notes and samples, turns the show basket into a quote, and sees the follow-up and Pier’s sample acknowledgment at desktop and phone”
**Gap.** None.

#### REP-006 — Barcode scanning in the rep app

Core · target · **missing** · Cites BASE-ROLE-001 · Rules D-6, D-1

**Requirement.** On iOS and Android, online and offline, reps scan UPC, EAN/GTIN or merchant barcodes with the device camera or a paired Bluetooth HID scanner. Each scan resolves to the exact variant in the selected account's assortment and adds or increments its quantity in the open draft, honoring case packs (PRI-003). An unknown or out-of-assortment code shows "not found, search instead" and never adds a guessed product. The buyer web portal offers camera scanning on supported phones through the same resolution. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rep-006).

**Acceptance.**
1. On iOS and Android offline, scan a hang-tag UPC with the camera and another with a paired HID scanner, scan one twice and one case-pack SKU, and scan an unknown code.
2. Matched variants carry the right quantities in the open draft, the unknown code prompts search, and the draft synchronizes once on reconnection.

**Evidence.** None.
**Gap.** No native rep app or camera/HID barcode scanning exists.

#### REP-007 — Trade-show prospect capture

Core · target · **missing** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-6, D-1, D-4

**Requirement.** At a show or appointment, offline included, a rep captures a walk-up prospect's company, contact, addresses, business identifier, resale certificate photo and source show, and writes a draft for it from a show assortment that exposes only the show price book. On sync the prospect enters ACC-001 review with duplicate detection against existing companies. The draft stays unsubmitted and reserves no stock until approval, then becomes the approved account's draft for buyer confirmation. A declined prospect gains no price access. prospects enter ACC-001’s verified application queue; certificate photos are private application documents under ACC-001’s byte, scope and custody rules. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rep-007).

**Acceptance.**
1. Offline, create a prospect, attach a certificate photo and write a draft from the show assortment, then reconnect.
2. The prospect lands in the ACC-001 queue tagged with its show and any duplicate, the draft remains unsubmitted with no reservation, approval turns it into the new account's draft for buyer confirmation, and a declined prospect sees no prices.

**Evidence.** None.
**Gap.** Offline prospect capture, show assortments and routing into application review are not implemented.

#### MOB-001 — Buyer mobile access and accessibility

Core · target · **partial** · Rules D-6

**Requirement.** Buyers complete catalog discovery, quick orders, approval, payment and shipment tracking in a responsive web portal at 1440px and 390px. Keyboard, screen-reader names, focus, error summaries and usable touch controls cover the same journeys; offline status never disguises a failed order. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#mob-001).

**Acceptance.**
1. Use keyboard and a screen reader through a 40-line cart with a size matrix and approval, then complete checkout and tracking on a 390px phone and 1440px desktop.
2. Check focus after validation and the visible accepted-order end state.

**Evidence.** `src/barrow/ui/app.tsx`; `src/barrow/ui/order-pad.tsx`; `src/barrow/ui/orders.tsx`
**Gap.** Responsive catalog and order UI exists; full mobile buying/payment journeys and accessibility acceptance are unproven.

### Payments credit invoices and account finance

#### PAY-001 — Stripe card checkout

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-SECRET-001 · Rules D-6, D-1, D-5 · Register R-5

**Requirement.** Merchants connect their own Stripe account and collect card payments with hosted/tokenized entry, supported authentication and exact order/currency references. Authorization, capture, decline and cancellation are distinct; signed provider events and idempotency reconcile money state and never expose full card data. A merchant may add a disclosed card surcharge only where card-network rules and the buyer's state permit it, shown before payment and never applied to debit cards or ACH. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause adds unapplied card payments to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. this clause adds verified card-payment exceptions to AUTO-005 with source links, owner and positive resolution evidence. extend DATA-003’s commercial-retention minimum from the latest recorded financial event, including every event introduced here, and assert the exact UTC seven-calendar-year cutoff (leap day clamps to February 28), refusal before that cutoff, the configured retention expiry, legal-hold refusal and attributed release, explicit owner review and attributed erasure receipt, preservation of required financial history, and refusal to resurrect erased data when restoring an older archive with the later erasure journal. add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#pay-001) apply.

**Acceptance.**
1. Use Stripe test checkout for successful and declined cards and an authentication challenge, replay an event and lose a capture response.
2. The buyer sees one appropriate payment result and one reconciled charge; a configured surcharge appears for an eligible credit card and is refused for a debit card and a prohibiting state.

**Evidence.** `tests/api/card-payments.test.mjs` — “hosted card review preserves the approved order, exact surcharge and authorization; lost capture and signed replay reconcile one receipt in every statement format”; `tests/api/card-payments.test.mjs` — “verified decline stays owned until provider cancellation and an authentication challenge stays unpaid”; `tests/api/card-payments.test.mjs` — “card surcharge is calculated only for verified credit funding and an explicitly permitted matching state”; `tests/api/card-payments.test.mjs` — “hosted verification failure creates an unpaid owned exception and owner cancellation cannot later authorize it”; `tests/api/card-payments.test.mjs` — “two installations under one Stripe merchant keep customer, checkout, idempotency and signed event effects separate”; `tests/api/retention.test.mjs` — “DATA-003 / DATA-001: owner review, legal holds, seven-year commercial floor, attributed PO erasure receipt and restore fence”; `tests/api/retention.test.mjs` — “ordered-account owner erasure revokes access, redacts personal classes, preserves financial evidence and returns attributed custody”; `tests/api/retention.test.mjs` — “independent erasure journal reapplies after D1 rewind and old archive import; missing or incomplete journal refuses data and auth”; `tests/api/retention.test.mjs` — “post-floor review defaults to personal redaction; explicit order deletion leaves reconciliable totals and exclusions have recorded reasons”
**Gap.** Missing exact-candidate journey in Verify: complete the provider-hosted bank-authentication challenge and inspect its reconciled result. The API fixtures prove successful/declined card, capture recovery, signed replay and an unpaid challenge; the real hosted driver is only a prior held-key receipt.

#### PAY-002 — Stripe ACH collection

Core · target · **missing** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · Rules D-6, D-1, D-5 · Register R-5

**Requirement.** US buyers authorize ACH debit with the provider mandate and bank verification flow. Pending, processing, settled, failed and returned states remain distinct; staff set fulfillment policy for unsettled funds and later returns reopen the balance without inventing settlement. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause adds unapplied ACH cash to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. this clause adds verified ACH-payment exceptions to AUTO-005 with source links, owner and positive resolution evidence. extend DATA-003’s commercial-retention minimum from the latest recorded financial event, including every event introduced here, and assert the exact UTC seven-calendar-year cutoff (leap day clamps to February 28), refusal before that cutoff, the configured retention expiry, legal-hold refusal and attributed release, explicit owner review and attributed erasure receipt, preservation of required financial history, and refusal to resurrect erased data when restoring an older archive with the later erasure journal. add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-002).

**Acceptance.**
1. Authorize a test bank account, submit a debit, inspect the pending statement then simulate settlement and a return.
2. Order policy, balance and buyer notification reflect each verified provider event once.

**Evidence.** None.
**Gap.** Implement stripe ach collection and prove the stated journey.

#### PAY-003 — Deposits partial payments and allocations

Core · target · **missing** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · Rules D-6, D-1, D-5

**Requirement.** Orders can require percentage or fixed deposits, scheduled remaining payments and partial invoice payments. Payments allocate to named invoices/releases with unapplied cash shown separately, so a deposit is neither a second sale nor a full-paid statement. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause adds its records to DATA-001’s export (JSON and per-kind CSV) with stable IDs, currency, source mapping and revision, in the same owner/buyer scope. this clause adds deposits and partial payments with their allocations to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. this clause adds paid amounts, including partial payments, to RPT-001’s sales report and reduces its outstanding amounts. this clause adds deposits and verified partial payments to RPT-004 aging, reducing the correct invoice balances and buckets in the page and CSV with provider source IDs. this clause adds unresolved deposit/allocation/payment exceptions to AUTO-005 with source links, owner and positive resolution evidence. extend DATA-003’s commercial-retention minimum from the latest recorded financial event, including every event introduced here, and assert the exact UTC seven-calendar-year cutoff (leap day clamps to February 28), refusal before that cutoff, the configured retention expiry, legal-hold refusal and attributed release, explicit owner review and attributed erasure receipt, preservation of required financial history, and refusal to resurrect erased data when restoring an older archive with the later erasure journal. add REP-004 verified partial-payment allocations to the original immutable commission lines, assert earning on payment and exact remaining/reversed cents, and export the provider source references. add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-003).

**Acceptance.**
1. Collect a 30% deposit on a seasonal prebook, invoice two releases, apply the deposit and a partial balance payment.
2. Statement and provider references reconcile to the exact amount outstanding.

**Evidence.** None.
**Gap.** Implement deposits partial payments and allocations and prove the stated journey.

#### PAY-004 — Approved net terms and credit limits

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-5

**Requirement.** Finance sets due-on-receipt or net terms, credit limit, credit currency and exposure policy covering open orders, unpaid invoices and permitted deposits. Checkout uses the connected receivables balance, shows available credit and requests approval when exposure exceeds policy. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause inherits PRI-007 credit-exposure revalidation, including exhaustion after drafting, with current blocking reasons and authorized recorded exceptions. ORD-004 quote acceptance runs this credit-exposure check before converting a quote into an order. this clause adds available credit and exposure to RPT-004 with source-linked currency amounts in the page and CSV. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-004).

**Acceptance.**
1. Give an account net 30 and a $10,000 limit, place an $8,000 order with $3,000 already owed, and block or route it for approval.
2. Record a payment and observe recalculated available credit.

**Evidence.** `tests/api/purchase.test.mjs` — “credit terms and exposure block an exhausted draft and quote, then verified principal restores available credit without double counting invoices”; `tests/api/purchase.test.mjs` — “finance hold and exact-order release refuse buyers and reps, audit decisions, invalidate on exposure changes and appear in the order timeline”; `tests/api/company-approvals.test.mjs` — “ACC-007: amount and location routes run sequential approvers with delegation, escalation, withdrawal and fresh approval after any material change”; `tests/api/order-guarantee.test.mjs` — “BAR-002: USD and legacy AUD orders retain exact human snapshots, one acknowledged Pier handoff, and invoice only fully eligible quantities”; `tests/journeys/credit-policy.test.mjs` — “finance configures net terms, holds checkout and releases one reviewed order after partial payment with current source-linked credit at desktop and phone”
**Gap.** Completion judgment remains pending under the fleet DONE evidence rule. Seasonal deposit allocations still need PAY-003 reconciliation with the newer ORD-008 implementation.

#### PAY-005 — Credit holds and controlled release

Core · target · **partial** · Cites BASE-ROLE-001, BASE-DATA-001 · Rules D-6, D-1, D-5

**Requirement.** Finance can impose overdue, manual or provider credit holds with reason, expiry and named owner. Reps and buyers see a suitable explanation and remediation request. Only authorized finance can release or override within limits, recording the decision and rechecking current exposure before acceptance. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. A hold and its release add entries to ORD-012's order timeline. this clause inherits PRI-007 current credit-exposure revalidation and recorded exception authority, including refusal when credit is exhausted after drafting. a credit hold also refuses ORD-004 quote acceptance with its explanation. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-005).

**Acceptance.**
1. Hold an overdue account, attempt checkout as buyer and rep, collect a partial payment, then release within a finance limit.
2. Refuse a rep override and invalidate a stale release if exposure changes.

**Evidence.** `tests/api/purchase.test.mjs` — “credit terms and exposure block an exhausted draft and quote, then verified principal restores available credit without double counting invoices”; `tests/api/purchase.test.mjs` — “finance hold and exact-order release refuse buyers and reps, audit decisions, invalidate on exposure changes and appear in the order timeline”; `tests/api/company-approvals.test.mjs` — “ACC-007: amount and location routes run sequential approvers with delegation, escalation, withdrawal and fresh approval after any material change”; `tests/api/order-guarantee.test.mjs` — “BAR-002: USD and legacy AUD orders retain exact human snapshots, one acknowledged Pier handoff, and invoice only fully eligible quantities”; `tests/journeys/credit-policy.test.mjs` — “finance configures net terms, holds checkout and releases one reviewed order after partial payment with current source-linked credit at desktop and phone”
**Gap.** Completion judgment remains pending under the fleet DONE evidence rule. Seasonal deposit allocations still need PAY-003 reconciliation with the newer ORD-008 implementation.

#### PAY-006 — B2B pay later through Resolve

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · Rules D-6, D-1, D-5 · Register R-5

**Requirement.** Eligible merchants offer Resolve-backed B2B net terms using provider enrollment, US business verification, credit decision, available-credit and invoice/charge states. Buyer sees financing terms, fees and lender identity before consent; Barrow never grants credit or treats an application as approval. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause adds verified financing/payment exceptions to AUTO-005 with source links, owner and positive resolution evidence. extend DATA-003’s commercial-retention minimum from the latest recorded financial event, including every event introduced here, and assert the exact UTC seven-calendar-year cutoff (leap day clamps to February 28), refusal before that cutoff, the configured retention expiry, legal-hold refusal and attributed release, explicit owner review and attributed erasure receipt, preservation of required financial history, and refusal to resurrect erased data when restoring an older archive with the later erasure journal. add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-006).

**Acceptance.**
1. Connect a Resolve sandbox merchant, submit eligible and declined buyer applications, accept a provider-approved order and reconcile invoice funding and repayment events.
2. A declined decision or insufficient provider credit cannot be overridden as provider approval.

**Evidence.** None.
**Gap.** Implement b2b pay later through resolve and prove the stated journey.

#### PAY-007 — Customer account statements

Core · target · **partial** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1, D-5

**Requirement.** Buyers and authorized staff see dated opening balance, invoices, deposits, payments, returns, credit notes, unapplied cash and closing balance by currency, with source document links and downloadable PDF/CSV. Account history explains partial settlement and disputed balances. PAY-007 inherits ACC-004: holding or closing an account never removes its authorized access to existing statements. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause adds its records to DATA-001’s export (JSON and per-kind CSV) with stable IDs, currency, source mapping and revision, in the same owner/buyer scope. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-007). RL-6 records the adopted commercial semantics.

**Acceptance.**
1. Open a statement spanning an opening balance, two invoices, deposit, partial payment and credit; compare the closing balance with the connected ledger and download it as the buyer.
2. Another company is refused.
3. Hold and then close the account and confirm that its authorized buyer can still read and download the statement.

**Evidence.** `tests/api/statements.test.mjs` — “PAY-007: a dated statement of invoices with opening and closing balances by currency, as JSON, CSV and PDF, for the buyer even after hold and close”; `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”; `tests/journeys/credit-payments.test.mjs` — “merchant issues a linked return credit, applies it and reviews pending and failed refunds with exact buyer balances and unchanged commission reversals at desktop and phone”
**Gap.** Missing journey: a seasonal deposit and general partial-payment allocation reconciled across the complete buyer statement. The cited journeys prove invoice, explicit verified principal and linked credit/refund balances and account-scope refusal.

#### PAY-008 — Invoice documents and delivery

Core · target · **partial** · Cites BASE-INPUT-003 · Rules D-6, D-1, D-5

**Requirement.** Eligible accepted releases produce stable numbered invoice records with seller/buyer identity, PO, line quantities, currency, tax, freight, terms and due dates. Buyers download PDF and CSV; the configured accounting authority controls legal issue/void state, and delivery is tracked without duplicate invoice creation. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-008).

**Acceptance.**
1. Invoice a split shipment through the connected accounting sandbox, deliver its PDF, download CSV and change the current price list.
2. Both documents retain the issued revision, correct tax/freight and one accounting invoice ID.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Stable fully reserved USD/legacy AUD invoice CSV and due dates exist; PDF, tax, freight, delivery and accounting authority sync are missing.

#### PAY-009 — Receivables aging and collections

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-5

**Requirement.** Finance sees current and aged receivables by due date, account, rep and disputed status, assigns collection follow-ups and schedules policy-based reminders with contact consent and stopping rules. Verified settlement, dispute or promise-to-pay changes the next action; a sent reminder alone does not close collection. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-009).

**Acceptance.**
1. Age three invoices, dispute one and record a promise-to-pay for another.
2. Run scheduled reminders, settle the third via provider event and inspect aging, recipient delivery and the remaining owned tasks.

**Evidence.** None.
**Gap.** Implement receivables aging and collections and prove the stated journey.

#### PAY-010 — Credit notes and refunds

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003 · Rules D-6, D-1, D-5

**Requirement.** Authorized finance issues linked line-level credit notes for returns, price corrections and cancellations, applies them to an invoice or initiates provider refunds under role limits. Tax and freight adjustments use the original commercial basis; failed or pending refunds remain visible and do not count as returned funds. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#pay-010) apply.

**Acceptance.**
1. Credit a partial return, apply part to an unpaid invoice and refund the paid remainder through Stripe.
2. Replay the refund callback and verify one credit, one refund and the exact statement balance.

**Evidence.** `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”; `tests/api/credit-payments.test.mjs` — “unpaid returned principal is applied before refundable cash; invalid returns, over-credit, stale applications and cross-company effects are refused”; `tests/api/credit-payments.test.mjs` — “finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice”; `tests/api/retention.test.mjs` — “DATA-003 / DATA-001: owner review, legal holds, seven-year commercial floor, attributed PO erasure receipt and restore fence”; `tests/api/retention.test.mjs` — “ordered-account owner erasure revokes access, redacts personal classes, preserves financial evidence and returns attributed custody”; `tests/api/retention.test.mjs` — “independent erasure journal reapplies after D1 rewind and old archive import; missing or incomplete journal refuses data and auth”; `tests/api/retention.test.mjs` — “post-floor review defaults to personal redaction; explicit order deletion leaves reconciliable totals and exclusions have recorded reasons”; `tests/api/substitutions.test.mjs` — “STK-005: buyer declines then accepts a current-price split substitution; only execution replaces the real stock reservation and exports both links”; `tests/journeys/credit-payments.test.mjs` — “merchant issues a linked return credit, applies it and reviews pending and failed refunds with exact buyer balances and unchanged commission reversals at desktop and phone”
**Gap.** Live Stripe test credit, invoice application, original-card refund, signed callback replay and exact statement receipt remain unproved. The held cloud test merchant completes checkout and capture with surcharges disabled, but this execution environment cannot establish the public webhook tunnel needed for signed provider delivery. Complete the held-key credit journey on a host with reachable callback ingress. The activated Native finance roster and saved allowance edit fields are proven at 1440 and 390 by the credit journey in Verify shard 1. PAY-012 retains its separate bank-mandate gap.

#### PAY-011 — Payment disputes and reconciliation

Core · target · **missing** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · Rules D-6, D-1, D-5

**Requirement.** Staff see card disputes, ACH returns, chargebacks and provider fees alongside the original order/invoice, submit permitted evidence through the provider and reconcile gross, fees, net and timing differences to accounting. Disputes remain distinct from product returns and do not delete the sale. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause adds disputed balances to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. this clause adds failed payments and disputed invoice balances to RPT-004 in the page and CSV without deleting the invoice. this clause adds verified payment disputes, ACH returns and reconciliation exceptions to AUTO-005 with source links and owner; reminders alone never close them. extend DATA-003’s commercial-retention minimum from the latest recorded financial event, including every event introduced here, and assert the exact UTC seven-calendar-year cutoff (leap day clamps to February 28), refusal before that cutoff, the configured retention expiry, legal-hold refusal and attributed release, explicit owner review and attributed erasure receipt, preservation of required financial history, and refusal to resurrect erased data when restoring an older archive with the later erasure journal. add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-011).

**Acceptance.**
1. Receive a Stripe test dispute and ACH return, attach delivery evidence, reconcile a payout including fees and inspect a named owner for the open disputed balance.

**Evidence.** None.
**Gap.** Implement payment disputes and reconciliation and prove the stated journey.

#### PAY-012 — Saved payment methods and consent

Core · target · **partial** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-SECRET-001, BASE-ACCESS-002 · Rules D-6, D-1, D-5

**Requirement.** Buyers manage provider-tokenized cards and bank mandates with explicit company and location permission and consent for later charges. Staff see masked brand and last four digits and status only; removing consent blocks new off-session collections without erasing historical receipts. Card semantics: an active company finance buyer explicitly consents after Stripe-hosted card verification for the source company and exact delivery location. Each later approved invoice needs a fresh exact-amount and surcharge authorization; no schedule or automatic collection is added. Current company finance and location permission is rechecked at use. Supplier finance staff see masked records only; supplier owner or admin may withdraw consent but cannot grant buyer consent. Withdrawal fences every new saved-card authorization, including already-prepared attempts, and preserves earlier receipts. Reusable card and customer references never appear in public payment reads, commercial exports or owner archives; saved consent is excluded from restore. PAY-002 retains the bank collection dependency, and PAY-012 retains its bank-mandate obligation. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#pay-012).

**Acceptance.**
1. Save a test payment method, authorize a later balance charge, remove consent and attempt another charge.
2. Provider tokens stay private, the new charge is blocked and old receipts remain accessible.

**Evidence.** `tests/api/card-payments.test.mjs` — “saved company card needs separate exact-amount authorization, withdrawal fences later charges and keeps receipts without exposing reusable tokens”; `tests/api/card-payments.test.mjs` — “saved consent is bound to company delivery location and current company finance authority”
**Gap.** Card acceptance is proven. Bank mandates remain unimplemented and blocked on enabling Stripe ACH Direct Debit on the held test merchant (PAY-002); no bank-mandate or bank-collection completion is claimed.

### US sales tax and exemptions

#### TAX-001 — Avalara AvaTax calculation

Core · target · **missing** · Rules D-6, D-5

**Requirement.** An Avalara AvaTax adapter calculates US state/local sales tax from seller nexus settings, product tax codes, ship-from/to, freight and account exemptions. Checkout quotes, committed invoice transactions, voids and credits retain provider IDs and explain any recalculation before buyer acceptance. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause inherits PRI-007 tax validation with current blocking reasons before acceptance. STK-005 substitution offers and acceptance show the source-verified tax difference on the original commercial basis; a tax unknown cannot be presented as verified. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#tax-001).

**Acceptance.**
1. Use an AvaTax sandbox with taxable interstate and exempt orders, change the delivery address, commit an invoice and credit one line.
2. Checkout, invoice and provider transaction totals reconcile to the cent.

**Evidence.** None.
**Gap.** Implement avalara avatax calculation and prove the stated journey.

#### TAX-002 — TaxJar alternative tax adapter

Core · target · **missing** · Cites BASE-ROLE-001 · Rules D-6, D-5

**Requirement.** Merchants can choose TaxJar instead of AvaTax for configured US tax calculation and transaction/refund reporting. Provider authority and jurisdiction setup are explicit, unavailable calculation blocks acceptance or requires a disclosed authorized policy, and switching providers does not rewrite issued tax. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause inherits PRI-007 tax validation with current blocking reasons before acceptance. STK-005 substitution offers and acceptance show the source-verified tax difference on the original commercial basis; a tax unknown cannot be presented as verified. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#tax-002).

**Acceptance.**
1. Configure TaxJar, quote two destination jurisdictions, import a refund and interrupt the provider during checkout.
2. Refuse an invented tax amount and preserve previous invoice provider references after a switch.

**Evidence.** None.
**Gap.** Implement taxjar alternative tax adapter and prove the stated journey.

#### TAX-003 — Resale certificates and exemption review

Core · target · **missing** · Cites BASE-INPUT-003 · Rules D-6, D-5

**Requirement.** Buyers upload resale certificates with company, state, effective/expiry dates and covered locations. Staff review them, and Avalara ECM can collect and validate certificate custody. Only applicable approved exemptions affect tax; expiry requests renewal and exposes the order impact. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause inherits PRI-007 exemption validation with current blocking reasons before acceptance. STK-005 substitution offers preserve the original exemption basis and disclose how its verified change affects tax. validate and review ACC-001 application certificates; the application’s format check is not exemption validation. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#tax-003).

**Acceptance.**
1. Upload a certificate for one state, approve it through staff review, order in covered and uncovered states and let it expire.
2. Only the eligible transaction is exempt and the buyer receives a renewal action.

**Evidence.** None.
**Gap.** Implement resale certificates and exemption review and prove the stated journey.

#### TAX-004 — Tax corrections and audit trail

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-5

**Requirement.** Tax-relevant address, certificate, refund and line changes create linked adjustments using the selected tax provider. Issued transactions remain immutable with correction references, and finance exports the tax basis and provider response for reconciliation and advisor filing. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. STK-005 substitution tax corrections preserve original-line linkage and disclose the verified original-to-replacement difference. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#tax-004).

**Acceptance.**
1. Correct an address after invoice issue and return a taxable item.
2. Inspect the original plus linked correcting transaction in Barrow and the provider export; no silent mutation or duplicate refund tax occurs.

**Evidence.** None.
**Gap.** Implement tax corrections and audit trail and prove the stated journey.

### Shipping delivery returns and service

#### SHIP-001 — Delivery methods and shipping charges

Core · target · **done** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-SECRET-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** Merchants offer configured parcel, freight/LTL, local pickup and own-carrier-account choices by account, warehouse and order size, with handling fees, free-freight thresholds and delivery windows. Checkout shows the binding quote or marks a freight quote as approval-required before acceptance. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause inherits PRI-007 shipping validation with current blocking reasons before acceptance. ORD-004 quotes carry quoted shipping amounts into these charges; until then a quote records shipping as a note only. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ship-001).

**Acceptance.**
1. Compare pickup, UPS parcel and freight-quote orders, cross a free-freight threshold and change the ship-to state.
2. Buyer explicitly accepts the final method, cost and window before ordering.

**Evidence.** `tests/api/shipping.test.mjs` — “SHIP-001: pickup, parcel, own-account and approved freight preserve explicit buyer choice, exact fees, windows, scope and acknowledged inventory snapshots”; `tests/api/shipping.test.mjs` — “SHIP-001: quote shipping amounts become frozen order charges only after the buyer accepts the final delivery revision”
**Gap.** None.

#### SHIP-002 — EasyPost carrier connection

Core · target · **missing** · Cites BASE-AUDIT-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** EasyPost connects USPS, UPS and FedEx accounts for eligible rates, address validation, labels and tracking; operations choose packages and service using fulfillment data from the inventory/WMS. Rate quotes are time-bound and label purchase/void requests are idempotent with provider references. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. STK-005 substitution offers and acceptance disclose verified carrier charge and delivery differences, retaining the exact accepted revision. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ship-002).

**Acceptance.**
1. Rate and purchase a sandbox UPS label, a USPS shipment and a FedEx shipment, lose one response and retry, then void an unused label.
2. Exactly one label charge occurs per purchase and the order retains tracking IDs.

**Evidence.** None.
**Gap.** Implement easypost carrier connection and prove the stated journey.

#### SHIP-003 — Shipment tracking and delivery exceptions

Core · target · **missing** · Rules D-6, D-1, D-2, D-5

**Requirement.** Buyer timelines show each package, carrier, tracking link, shipped quantities, expected delivery and verified carrier events. Delays, failed delivery and missing tracking create owned exceptions; a label or estimated date never counts as delivery. Buyer delivery disputes remain open until resolved. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. Carrier tracking and delivery events add their entries to ORD-012's order timeline with source and time before they ship. this clause adds verified tracking, delivery and on-time-delivery measures to RPT-003 without treating dispatch or a label as delivery. this clause adds source-linked delivery exceptions to AUTO-005 and closes them only on verified carrier resolution or an attributed human resolution, never a label. STK-005 substitution offers and timelines disclose source-confirmed delivery differences without inferring delivery from estimates. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ship-003).

**Acceptance.**
1. Ship two packages, send delayed and delivered carrier events out of order, then raise a missing-package report.
2. Only the truly delivered package closes and the other has an assigned follow-up.

**Evidence.** None.
**Gap.** Implement shipment tracking and delivery exceptions and prove the stated journey.

#### SHIP-004 — Return authorizations and claims

Core · target · **missing** · Cites BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-1, D-2, D-5

**Requirement.** Buyers request an RMA for eligible order lines with reason, condition, photos and quantity; staff approve instructions and labels, track receipt/inspection in the WMS and decide restock, replacement or credit under policy. Neither request nor carrier receipt alone grants a credit. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause adds its records to DATA-001’s export (JSON and per-kind CSV) with stable IDs, currency, source mapping and revision, in the same owner/buyer scope. this clause adds return credits to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. this clause adds source-linked unresolved return/delivery claims to AUTO-005, preserving ownership until verified or attributed resolution. claims and returns for STK-005 replacements retain each line’s original order/line linkage and exact accepted replacement basis. link REP-004 return commission reversals to the original line and frozen split, preserving the physical receipt source and avoiding a second reversal when PAY-010 credits the same return. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ship-004).

**Acceptance.**
1. Request a damaged-goods return with photos, approve two of three units, receive and inspect them in the connected system and issue the approved credit.
2. Remaining disputed quantity stays open and stock changes only in the authority.

**Evidence.** None.
**Gap.** Implement return authorizations and claims and prove the stated journey.

#### SHIP-005 — Exchanges and service resolution

Core · target · **missing** · Rules D-6, D-1, D-2, D-5

**Requirement.** Buyers and staff manage shortages, defects, exchanges and replacement shipments linked to the original order and RMA. The case has an owner, response deadline and buyer-visible resolution; price differences, tax and freight are approved before the exchange order is accepted. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#ship-005).

**Acceptance.**
1. Report a short shipment, choose a replacement of different value, approve its price difference and follow the linked shipment to delivery.
2. The original case closes only after the buyer-facing resolution is recorded.

**Evidence.** None.
**Gap.** Implement exchanges and service resolution and prove the stated journey.

### Connected systems and reliability

#### INT-001 — Optional Pier inventory connection

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-SECRET-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** Pier is an optional stock/order authority alongside the adapters below. Its authenticated connection supplies catalog/stock and receives durable reservation commands without exposing supplier credentials to buyers. Revocation and destination mismatch remain actionable; adopting Barrow does not require adopting Pier. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-001).

**Acceptance.**
1. Configure Pier, place an approved order and revoke its credential.
2. Show a failed handoff without lost orders, reconnect the same origin and reconcile it, then configure a different supported inventory authority without creating a Pier ledger.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Real Pier HTTP catalog and reservations ship; it is currently mandatory for ordering and no alternate inventory adapter ships.

#### INT-002 — QuickBooks Online accounting

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · Rules D-6, D-1, D-2, D-5 · Register R-5

**Requirement.** OAuth connects the merchant QuickBooks Online company, maps customers/items/tax/accounts and creates or links invoices and credit memos at the chosen billing event. Payments and balances return to Barrow; currency, periods, external IDs and duplicate prevention are visible in a reconciliation queue. Its accounting handoffs and failures appear in OPS-001 diagnostics with a correlation ID and resume action . this clause adds the comparison of the closing balance with the QuickBooks ledger to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. this clause adds RPT-004 reconciliation of aged balances against the connected QuickBooks ledger, with differences, currency and source IDs in the page and CSV. this clause adds source-confirmed QuickBooks payment/reconciliation exceptions to AUTO-005 and retains ownership until acknowledged or attributed resolution. extend DATA-003’s commercial-retention minimum from the latest recorded financial event, including every event introduced here, and assert the exact UTC seven-calendar-year cutoff (leap day clamps to February 28), refusal before that cutoff, the configured retention expiry, legal-hold refusal and attributed release, explicit owner review and attributed erasure receipt, preservation of required financial history, and refusal to resurrect erased data when restoring an older archive with the later erasure journal. add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-002).

**Acceptance.**
1. Connect a QBO sandbox, invoice an order, receive a partial payment and credit a return.
2. Replay sync and inspect one invoice/credit in the correct company and an exact buyer balance; token revocation leaves actionable failures.

**Evidence.** None.
**Gap.** Implement quickbooks online accounting and prove the stated journey.

#### INT-003 — Xero accounting

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003 · Rules D-6, D-1, D-2, D-5 · Register R-5

**Requirement.** A Xero tenant connection maps contacts, items, invoices, credits and tax codes and returns payment/receivable status. Source-owned edits surface as conflicts rather than silently overwriting issued documents; account statements identify the ledger authority. Its accounting handoffs and failures appear in OPS-001 diagnostics with a correlation ID and resume action . this clause adds the comparison of the closing balance with the Xero ledger to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. this clause adds RPT-004 reconciliation of aged balances against the connected Xero ledger, with differences, currency and source IDs in the page and CSV. this clause adds source-confirmed Xero payment/reconciliation exceptions to AUTO-005 and retains ownership until acknowledged or attributed resolution. extend DATA-003’s commercial-retention minimum from the latest recorded financial event, including every event introduced here, and assert the exact UTC seven-calendar-year cutoff (leap day clamps to February 28), refusal before that cutoff, the configured retention expiry, legal-hold refusal and attributed release, explicit owner review and attributed erasure receipt, preservation of required financial history, and refusal to resurrect erased data when restoring an older archive with the later erasure journal. add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-003).

**Acceptance.**
1. Send a net-terms order to Xero sandbox, allocate a payment in Xero, sync back and compare the buyer statement.
2. Edit an issued invoice upstream and inspect a reconciliation conflict rather than a duplicate.

**Evidence.** None.
**Gap.** Implement xero accounting and prove the stated journey.

#### INT-004 — NetSuite ERP

Core · target · **missing** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** NetSuite connects customers, subsidiary/location, items/variants, price levels, stock/ATP, sales orders, fulfillment, invoices and payments using explicit field ownership. External IDs link every release and retry; mapping and permission failures appear with a named owner. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-004).

**Acceptance.**
1. Map a sandbox subsidiary and warehouse, submit a prebook and split fulfillment, return invoice/payment states and revoke a role permission mid-sync.
2. Inspect linked records, correct balances and resumable errors.

**Evidence.** None.
**Gap.** Implement netsuite erp and prove the stated journey.

#### INT-005 — Shopify commerce connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** A Shopify connection maps products/variants, customers/company identifiers, stock locations and wholesale orders without replacing the merchant consumer store. Existing storefront pricing/fulfillment authority is explicit; correlated orders, fulfillments and refunds synchronize without feedback loops. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-005).

**Acceptance.**
1. Connect a development store, import variants and customer mapping, place a Barrow order and fulfill/refund it in Shopify.
2. See one order on each side and correct buyer status after duplicate events.

**Evidence.** None.
**Gap.** Implement shopify commerce connection and prove the stated journey.

#### INT-006 — WooCommerce commerce connection

Core · target · **missing** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** A WooCommerce connection exchanges products/variations, customers, inventory and orders through authorized REST/webhook interfaces with stable external IDs. Wholesale account pricing stays protected and returned fulfillment/refund states update the linked order without changing retail customer prices. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-006).

**Acceptance.**
1. Connect a controlled WooCommerce store, import a variation, order with negotiated pricing, receive a fulfillment and refund and replay the webhook.
2. Retail prices remain distinct and no duplicate order is created.

**Evidence.** None.
**Gap.** Implement woocommerce commerce connection and prove the stated journey.

#### INT-007 — Cin7 Core inventory connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** Cin7 Core supplies product, stock, customer and price mappings and receives sales orders/releases; fulfillment, invoice and payment references return under chosen ownership. Warehouse allocations and backorders remain in Cin7 rather than a Barrow stock ledger. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-007).

**Acceptance.**
1. Connect a Cin7 test company, order mixed available/backordered lines, fulfill a release and reconcile the portal timeline and source quantities.
2. Retry an acknowledgment failure without another sale.

**Evidence.** None.
**Gap.** Implement cin7 core inventory connection and prove the stated journey.

#### INT-008 — Brightpearl inventory connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-1, D-2, D-5

**Requirement.** A Brightpearl adapter maps accounts, products, warehouses, price lists and sales orders and returns allocation, shipment and financial document references. Setup names ownership and shows gaps in unsupported custom fields before live ordering. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-008).

**Acceptance.**
1. Map a Brightpearl sandbox account and warehouse, place an order and receive a partial shipment; inspect matched external IDs and a surfaced invalid-field error with no duplicate handoff.

**Evidence.** None.
**Gap.** Implement brightpearl inventory connection and prove the stated journey.

#### INT-009 — Katana inventory connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** A Katana adapter reads sellable product/variant availability and expected production supply where exposed, sends approved sales orders and returns fulfillment references. Manufacturing scheduling and stock postings remain in Katana. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-009).

**Acceptance.**
1. Connect a Katana test account, map a made-to-order SKU, show its source-provided availability date, create one sales order and receive its completed fulfillment without inventing production progress.

**Evidence.** None.
**Gap.** Implement katana inventory connection and prove the stated journey.

#### INT-010 — Unleashed inventory connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** An Unleashed adapter maps customers, products, units, price/stock data, warehouses and sales orders and returns shipment/invoice references. Sync preserves source identities, units and tax basis and reports refused mappings before accepting an order. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-010).

**Acceptance.**
1. Connect a test organization, order cases with a mapped unit conversion, ship in Unleashed and compare base quantities and buyer status.
2. Invalid unit mapping blocks the handoff with a repair action.

**Evidence.** None.
**Gap.** Implement unleashed inventory connection and prove the stated journey.

#### INT-011 — Faire brand order ingest

Core · target · **done** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** Brands authorize Faire External API V2 order reads, with OAuth for multi-brand integrations, and ingest paginated orders under their original Faire IDs. Customer/product matching, fees, fulfillment and payment ownership are explicit; channel settlement is not charged again. Polling checkpoints and deduplication recover gaps without assuming a webhook exists. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-011).

**Acceptance.**
1. Authorize a brand sandbox or controlled API boundary, fetch multiple pages, interrupt and resume, match an unknown SKU for review and ingest a replay.
2. Each Faire order appears once and no Stripe collection is initiated for Faire-owned settlement.

**Evidence.** `tests/api/faire.test.mjs` — “Faire HTTP intake resumes paged reads, holds unknown SKUs for owner review and deduplicates source orders without collection”; `tests/api/faire.test.mjs` — “Faire owner decisions are private, attributed, append-only and fully exported; restored reads require fresh consent”; `tests/api/faire.test.mjs` — “Faire refuses invalid credentials, foreign destinations and malformed source pages without advancing a checkpoint”; `tests/api/faire.test.mjs` — “Faire refuses an older overlapping page after a newer complete poll returns to the same checkpoint”; `tests/journeys/faire.test.mjs` — “Faire source quantities and unknown fulfillment facts remain visible without a Pier connection”
**Gap.** None.

#### INT-012 — Documented wholesale API

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-1, D-2, D-5

**Requirement.** A versioned authenticated API exchanges products, variants, accounts, locations, price books, quotes, orders, invoices and fulfillment state with pagination, scopes, validation and stable external IDs. Public documentation and sample requests expose the same business rules as the screens; no direct database access is needed. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-012).

**Acceptance.**
1. Create an integration grant, import a small real-shaped catalog and company, place an order and read its invoice/fulfillment through documented API requests.
2. Refuse cross-account scopes and stale revisions.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Native state, catalog and order commands exist; general integration scopes, entity coverage and versioned exchange are missing.

#### INT-013 — Webhooks retry and failed-handoff queue

Core · target · **done** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-SECRET-001, BASE-MAIL-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** Signed outbound events and authenticated incoming provider callbacks retain event identity, timestamp and delivery result. Backoff, rate limits, dead-letter state, replay and duplicate/out-of-order handling are visible to operators. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-013).

**Acceptance.**
1. Subscribe a test endpoint, reject several deliveries, replay a signed event and send out-of-order provider states.
2. See one business effect, retained attempts and a queue item that clears only on acknowledged resolution.

**Evidence.** `tests/api/webhooks.test.mjs` — “INT-013: signed immutable events retain failed attempts, endpoint backoff/rate limits and dead letters until acknowledged replay with one receiver effect”; `tests/api/webhooks.test.mjs` — “INT-013 / DATA-002 / DATA-003: owner consent, masked encrypted secret rotation and revocation, private doors and inert restored history preserve custody”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”; `tests/api/audit.test.mjs` — “DATA-002: every current commercial mutation has searchable, attributed, append-only audit and complete safe CSV custody”; `tests/journeys/webhooks.test.mjs` — “owner subscribes a trusted endpoint, inspects failed attempts and dead letter, replays one signed event until acknowledged and revokes custody at desktop and phone”
**Gap.** None.

#### INT-014 — Connector setup and reconciliation

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · Rules D-6, D-1, D-2, D-5

**Requirement.** Owners choose record authority and field mappings, preview source samples and test permissions before enabling each connector. A health view reports last successful sync, lag, unmapped records, duplicates and count/value differences, with repair, retry and a responsible owner. For INT-020 flat-file feeds it also lists each file picked up or written, its row counts, quarantined rows with their error report, and unacknowledged order files. Disconnection does not erase orders. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-014). Any agent call carries the classes computed in the Agent surface; the company’s policy decides that call within its sponsor’s current role.

**Acceptance.**
1. Set up a connector with a missing item and mismatched balance, inspect preview, repair mappings and reconcile before go-live.
2. Revoke credentials later; keep local history and show precisely which records need attention.
3. Exercise inherited DATA-002 connector/configuration/reconciliation changes through the staff audit search and complete export: actor/kind, source, time, revision, reason; append-only and private from buyers/agents.

**Evidence.** `tests/api/diagnostics.test.mjs` — “owner inspects connector samples, repairs missing mappings, retains exact source differences and private audit after credential revocation”; `tests/api/move-rehearsal.test.mjs` — “owner rehearses and reconciles a source delta, signs scoped authority and exports only new orders; rollback preserves a dependent shipment”; `tests/api/stock-promise.test.mjs` — “scheduled stock synchronization resumes an interrupted ACK, sends one requested private notice on replay, and retains an owned persistent exception”; `tests/journeys/connector-review.test.mjs` — “owner inspects and repairs a missing connector item, then sees retained source history after revocation at desktop and phone”; `tests/journeys/delta-cutover.test.mjs` — “owner reviews delta citations and scoped feed rehearsal, signs cutoff, delivers a new order and preserves shipment dependencies on rollback at desktop and phone”; `tests/api/faire.test.mjs` — “Faire HTTP intake resumes paged reads, holds unknown SKUs for owner review and deduplicates source orders without collection”; `tests/api/faire.test.mjs` — “Faire owner decisions are private, attributed, append-only and fully exported; restored reads require fresh consent”; `tests/api/faire.test.mjs` — “Faire refuses invalid credentials, foreign destinations and malformed source pages without advancing a checkpoint”; `tests/journeys/faire.test.mjs` — “Faire source quantities and unknown fulfillment facts remain visible without a Pier connection”
**Gap.** None.

#### INT-015 — Operational email and connected mailboxes

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-MAIL-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** Resend delivers branded invitations, confirmations, quote messages, reminders and CAT-011 line-sheet and suggested-order sends with delivery/bounce state and suppression. Authorized Google Workspace Gmail or Microsoft 365 Outlook mailboxes can supply inbound POs and attach reviewed replies to the right account/order under revocable scopes. Internal notes never leak into buyer mail. Delivery failures appear in OPS-001 diagnostics before delivery states ship. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-015).

**Acceptance.**
1. Deliver a confirmation and simulate a bounce at the provider edge, ingest a PO from each authorized mailbox and revoke a mailbox.
2. Inspect account/thread matching, suppression and no further ingestion after revocation.
3. Quote delivery uses AUTO-003's durable Resend states, terminal-address suppression and tenant/message/address-authorized signed intake.
4. RPT-006 adds signed Resend report-delivery receipts and permanent address bounce/complaint/rejection suppression via the documented commercial door; a report or quote suppression blocks both report sends and downloads.
5. Acceptance records authenticated bounce/replay, refuses a forged event, blocks later notifications and refuses an existing report link.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”; `tests/api/order-search.test.mjs` — “RPT-006 / ACC-005 / ACC-006 / INT-015 / DATA-002: saved monthly reports freeze whole source-linked snapshots, email exact staff once, and revoke private downloads on recipient or authority changes”
**Gap.** Quote delivery states, suppression and signed intake exist; report delivery and suppression now also ship; mailbox intake and remaining operational messages are missing.

#### INT-016 — EDI wholesale order exchange

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5 · Register R-5

**Requirement.** Wholesalers connect SPS Commerce or Orderful for partner-mapped X12 850 purchase orders, 855 acknowledgments, 856 advance ship notices and 810 invoices. Partner identifiers, acknowledgments, validation and duplicates are explicit; Barrow owns the order experience while the partner operates EDI transport. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-016).

**Acceptance.**
1. In a partner sandbox ingest an 850, resolve a missing SKU, accept it once, send its 855 and linked 856/810 and inspect transport acknowledgment and exceptions without duplicate orders.

**Evidence.** None.
**Gap.** Implement edi wholesale order exchange and prove the stated journey.

#### INT-017 — AIMS360 apparel ERP connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-1, D-2, D-5

**Requirement.** An AIMS360 adapter imports styles with color/size matrices, UPCs, wholesale and retail prices, images, available-to-sell by warehouse, and customers with terms and reps, and sends approved Barrow orders as AIMS360 sales orders with exact size quantities, ship and cancel windows, PO and rep attribution. Pick ticket, shipment, invoice and payment references return to the order timeline; AIMS360 stays the inventory and invoicing authority. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-017).

**Acceptance.**
1. Connect an AIMS360 test company, import a style with a color/size matrix, images and ATS, place an order with rep attribution, drop its acknowledgment and retry.
2. AIMS360 holds one sales order with the exact size quantities, its fulfillment and invoice references return to the buyer timeline, and no duplicate order exists.

**Evidence.** None.
**Gap.** No AIMS360 adapter exists.

#### INT-018 — ApparelMagic apparel ERP connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-1, D-2, D-5

**Requirement.** An ApparelMagic adapter imports styles with color/size matrices, UPCs, prices, images, available-to-sell and customers with terms and reps, and sends approved Barrow orders as ApparelMagic sales orders with exact size quantities, ship and cancel windows, PO and rep attribution. Pick ticket, shipment, invoice and payment references return to the order timeline; ApparelMagic stays the inventory and invoicing authority. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-018).

**Acceptance.**
1. Connect an ApparelMagic test company, import a style with a color/size matrix, images and ATS, place an order with rep attribution, drop its acknowledgment and retry.
2. ApparelMagic holds one sales order with the exact size quantities, its fulfillment and invoice references return to the buyer timeline, and no duplicate order exists.

**Evidence.** None.
**Gap.** No ApparelMagic adapter exists.

#### INT-019 — A2000 apparel ERP connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** An A2000 adapter exchanges styles with color/size matrices, UPCs, prices, available-to-sell and customers, and sends approved orders as A2000 sales orders with exact size quantities, windows, PO and rep attribution through A2000's supported file or API exchange, returning shipment and invoice references. A2000 stays the inventory and invoicing authority. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-019).

**Acceptance.**
1. Connect an A2000 test company or its documented exchange boundary, import a size-matrix style with ATS, place an order with rep attribution and replay the exchange.
2. A2000 holds one sales order with the exact size quantities and its shipment and invoice references return to the buyer timeline.

**Evidence.** None.
**Gap.** No A2000 adapter exists.

#### INT-020 — Scheduled flat-file SFTP data feed

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-SECRET-001 · Rules D-6, D-1, D-2, D-5

**Requirement.** This feed is for a merchant whose ERP has no built-in adapter, such as AS400, Epicor, JD Edwards, Apparel 21, SAP Business One, QuickBooks Desktop through a file bridge, or a homegrown system. The merchant gets a scheduled flat-file exchange over SFTP, either a Barrow-hosted endpoint with per-merchant key or password credentials or a merchant-hosted server Barrow connects to. Each feed has separate import and export directories. **Import:** product/variant (style, color, size, UPC), price book (wholesale and MSRP), customer/location (company, bill-to, ship-to, terms, rep) and inventory/ATS files arrive in documented CSV/TXT layouts with a saved column mapping. NuORDER's standard integration templates are accepted as-is so an existing ERP job keeps working unchanged. Files are picked up on a configured interval, and each file has a stable identity, so a file replayed or dropped twice applies once. Valid rows apply; bad rows are quarantined with a per-file error report assigned to an owner under INT-014. A feed run is never a silent partial import. ATS files make the feed STK-002's inventory authority, with freshness shown. **Export:** approved orders are written as files in a configurable layout (CSV, TXT or an X12 850 file), one per order or batched. Order edits (ORD-011, ORD-016), cancellations and, inbound, shipment acknowledgments follow the same layouts. Each exported file carries STK-003's handoff identity and stays pending until the ERP's processed acknowledgment file, or the file's removal under a configured processed rule, closes it. An operator can resend an order, and the next pickup sees exactly one file per order. This clause inherits BAR-002’s agreed currency/line/terms and human-approval snapshots ; inventory handoffs retain one durable acknowledged identity and explicit shortfalls, and split invoices name only eligible allocated or shipped quantities. this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#int-020). The cutover bridge boundary is MOVE-008 under RL-101; configured bounded schedules authorize future delivery without a manual bridge action for each file. STK-002 and STK-003 govern stock freshness and order acknowledgment.

**Acceptance.**
1. Configure an SFTP feed with a column mapping and NuORDER template layout.
2. Drop product, customer and ATS files on a schedule, including one malformed row and one file replayed twice.
3. Valid rows apply once, the bad row appears in the file's error report with an owner, and ATS freshness shows in STK-002.
4. Approve two orders: exactly two order files appear in the export folder in the configured layout.
5. Remove one before the ERP acknowledges it and resend it: the next pickup sees one file per order, and a processed acknowledgment closes each handoff.
6. Edit one order and see one edit file.
7. Stop the schedule past the freshness limit and see STK-002 block on stale ATS.
8. INT-020 must use ORD-014's persisted named layout IDs and column ordering for per-line confirmation exports, retain the chosen layout and exact order/revision identities, and prove the same snapshot values through ERP file delivery.

**Evidence.** `tests/api/flat-file-feed.test.mjs` — “owner tests a pinned merchant SFTP destination through the Worker; wrong host trust, credentials and non-owner calls refuse”; `tests/api/move-rehearsal.test.mjs` — “owner rehearses and reconciles a source delta, signs scoped authority and exports only new orders; rollback preserves a dependent shipment”
**Gap.** Native owner-operated migration bridge only. Scheduled imports, unchanged NuORDER standard templates, live ATS authority/freshness and account warehouse enforcement, wider product/price/customer/location imports, order edit/cancellation/shipment exchange and the remaining inherited obligations are unproved. ORD-011/016 accepted-order edits need Pier’s missing edit command. MOVE-008 consent/authority default awaits ct.

### Reporting and commercial management

#### RPT-001 — Account and product sales reporting

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1

**Requirement.** Managers report booked, shipped, invoiced, paid, credited and outstanding amounts separately by account, SKU/style, season, channel, territory and period. Currency, tax/freight inclusion and source freshness are clear; drill-down matches document lines and account permissions. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rpt-001).

**Acceptance.**
1. Run a seasonal report containing a prebook, split shipment, credit and partial payment, filter a territory and drill to the documents.
2. Exported totals reconcile with the source lines and another rep territory is inaccessible.

**Evidence.** `tests/api/sales-report.test.mjs` — “RPT-001: booked, split-shipped, invoiced and outstanding sales by account, SKU, channel, territory and month, filtered by territory, drilled to documents and reconciled in CSV”; `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”; `tests/api/credit-payments.test.mjs` — “finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice”
**Gap.** Missing journey: reconcile a seasonal prebook, split shipment and general partial-payment report to all source lines. The cited sales/credit journeys prove native order, invoice, freight, verified allocation and credit totals.

#### RPT-002 — Quote conversion and promotion performance

Core · target · **done** · Cites BASE-AUDIT-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1

**Requirement.** Sales managers compare quote response/acceptance, abandoned carts, reorder rates, promotion results and line-sheet and presentation engagement (opens, views and items viewed per buyer) and CAT-011 campaign results (delivered, opened, viewed, ordered and order value per send) by cohort, rep and product. An order is attributed to a campaign only when it is placed from that campaign's link or form. Discounts, returns and attribution rules are visible so a click or generated quote does not become revenue. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rpt-002).

**Acceptance.**
1. Create accepted, expired and revised quotes plus a promoted order and return, then view conversion and net promotion performance; open a line sheet as two buyers and see each buyer's views.
2. Count each accepted order once and explain every denominator.

**Evidence.** `tests/api/pricing.test.mjs` — “promotion mix qualification, removal, exclusive precedence and source-priced partial returns reconcile once in the scoped conversion report”; `tests/api/pricing.test.mjs` — “fixed bundle requirements, dated account eligibility, ordered stacking and stale promotion drafts are enforced through public commands”; `tests/journeys/promotions.test.mjs` — “supplier publishes offers, previews removal and margin, and sees original return credits and net promotion attribution at desktop and phone”; `tests/api/quotes.test.mjs` — “RPT-002: quote response and acceptance, accepted value net of returns, abandoned carts and reorder rates by rep, cohort and product, with every denominator explained”; `tests/api/line-sheets.test.mjs` — “line-sheet buyer opens and visible-item views appear independently in the scoped quote conversion report”; `tests/journeys/line-sheets.test.mjs` — “supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone”
**Gap.** None.

#### RPT-003 — Fulfillment and backorder reporting

Core · target · **partial** · Cites BASE-AUDIT-001 · Rules D-6, D-1

**Requirement.** Operations report fill rate, on-time shipment/delivery, open commitments, aging backorders and promise changes by account and warehouse. Reports separate source-confirmed events from estimates and provide an action list for late lines. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rpt-003).

**Acceptance.**
1. Load an on-time, late and partially shipped order, inspect line-based fill and lateness measures and open the late-line queue.
2. Missing tracking stays unknown rather than counted as delivered.
3. INT-011 carrier: ingested Faire lines retain original order IDs, exact ordered quantities and account scope; shipped quantities, warehouse and delivery remain unknown when the source does not report them.
4. They never change Pier fill denominators.

**Evidence.** `tests/api/fulfillment.test.mjs` — “RPT-003: live Pier line fill, dispatch timeliness, open/aging backorders, warehouse evidence and late-line actions stay exact; missing tracking is unknown”
**Gap.** Missing journey in its old evidence set: the Faire order/count and unknown-fulfillment contribution. The cited fulfillment journey proves native fill/lateness; tests/api/faire.test.mjs covers the separate Faire slice but the old Evidence cell does not cite it.

#### RPT-004 — Finance and credit reporting

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-1

**Requirement.** Finance reports receivables aging, available credit/exposure, deposits, failed payments, disputed balances and refund status with ledger reconciliation. CSV exports retain currency and source IDs and support a US accountant working in USD and local business time zones. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rpt-004).

**Acceptance.**
1. Run aging on a stated date across net-30, disputed and partially paid invoices, export and compare every bucket with due dates and verified payments.
2. A rep sees only the permitted account summary.

**Evidence.** `tests/api/finance-report.test.mjs` — “RPT-004: invoice aging reconciles frozen source cents and due dates at every bucket boundary, keeps currencies separate and refuses unauthorized reports”; `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”; `tests/api/credit-payments.test.mjs` — “unpaid returned principal is applied before refundable cash; invalid returns, over-credit, stale applications and cross-company effects are refused”; `tests/journeys/credit-payments.test.mjs` — “merchant issues a linked return credit, applies it and reviews pending and failed refunds with exact buyer balances and unchanged commission reversals at desktop and phone”
**Gap.** Missing journey: disputed receivable classification and general deposit/payment exposure reconcile to the ledger. The cited finance/credit journeys prove native dated aging, verified principal and refund/credit sources.

#### RPT-005 — Rep performance and commission statements

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-MAIL-001 · Rules D-6, D-1

**Requirement.** Managers compare territory coverage, visits, quote conversion, new/repeat accounts and earned/reversed commissions; reps view their own targets and itemized statements. Attribution follows effective assignments and approved split rules, with export for the merchant payroll process. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#rpt-005). RL-102 keeps explicit dated count goals non-compensating: they cause no pay, notification or automatic effect. Native actor identity and frozen earned/reversed commission snapshots remain distinct. Reports label current workload against historical assignment and use current account and compensation entitlement for details, counts and exports; REP-004, ACC-006 and DATA-002 apply.

**Acceptance.**
1. Transfer an account between reps after one shipment and return part of it.
2. Both statements retain correct historical earnings, manager totals reconcile and reps cannot read each other private compensation.
3. Under RL-102, record dated source-backed count goals without pay or outreach effects; distinguish native identity, frozen commission attribution, current workload and historical assignment, applying current account and compensation entitlement to every detail, count and export.

**Evidence.** `tests/api/commissions.test.mjs` — “rep performance: real assignment transfer and return preserve both private statements, activity goals, source metrics and reconciled manager payroll”; `tests/journeys/rep-performance.test.mjs` — “owner sets activity goals, manager reconciles transferred shipment and return statements, and each rep sees only current private work at desktop and phone”
**Gap.** Territory, conversion, new/repeat and itemized statement proof remains incomplete. RL-102 resolves frozen attribution and explicit non-compensating goals; verified payment/credit/refund effects still depend on PAY-003/PAY-010.

#### RPT-006 — Operational order search

Core · target · **partial** · Cites BASE-ROLE-001, BASE-MAIL-001 · Rules D-6, D-1

**Requirement.** Authorized users search company, PO, external ID, SKU and tracking number with pagination and useful sorting. On a multi-season fixture of 3 seasons, 400 accounts and 20,000 orders, a PO, SKU or tracking search and a re-sort each return the first page within 2 seconds at p95. Historical rows retain original line, currency and revision snapshots; counts and duplicate-PO flags cover the visible collection beyond the current page. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#rpt-006) apply to this capability.

**Acceptance.**
1. Find a known PO, SKU and tracking number on the stated fixture and re-sort by ship window within the stated bar.
2. Page through authorized results and open their source details without exposing another account.

**Evidence.** `tests/api/order-search.test.mjs` — “RPT-006: scoped SQL search and ship-window pages stay under two-second p95 across 3 seasons, 400 accounts and 20000 orders”; `tests/api/order-search.test.mjs` — “RPT-006: original workspace, history and account drafts page the full authorized collection without losing stale drafts, duplicate POs or source actors”; `tests/api/order-search.test.mjs` — “RPT-006 / ACC-005 / ACC-006 / INT-015 / DATA-002: saved monthly reports freeze whole source-linked snapshots, email exact staff once, and revoke private downloads on recipient or authority changes”; `tests/api/order-search.test.mjs` — “RPT-006 / ACC-004: duplicate company review spans pages and server rechecks every exact revision, including matches beyond the account workspace”; `tests/journeys/installation.test.mjs` — “BASE-001 / RPT-006: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation”; `tests/journeys/installation.test.mjs` — “RPT-006: native account directory and selectors keep later-page accounts reachable without full-directory browser loads”
**Gap.** Account cards, selectors, workspace and exact reads now page the directory while retaining complete duplicate review and page-scoped draft revisions. Tracking-number source/search/performance, broader report types remain missing. c25 exercises exact functional finance/rep recipient coverage under the ACC-005 adopted policy; ACC-006 (c26) supplies delegated coverage. RPT-006 stays partial.

#### RPT-007 — Saved recipient-scoped scheduled reports

Core · target · **partial** · From RPT-006 · Cites BASE-ROLE-001, BASE-MAIL-001 · Rules D-6, D-1

**Requirement.** Authorized users save immutable sales and invoice-aging report filters and schedule source-linked snapshots for eligible exact recipient identities. Sending and download require current authority covering the whole saved filter, never a trimmed report. Recipient removal and authority changes revoke links and unsent delivery. Per-period snapshot, expiry, delivery, suppression and inert-restore rules remain in the commercial rules. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#rpt-006) apply to this capability.

**Acceptance.**
1. Save a monthly filtered report and deliver its matching snapshot to an entitled finance user.
2. Revoke a recipient and inspect refused download, cancelled queued delivery and the attributed reason.
3. Restore the archive: definitions and history survive while schedules and unsent delivery remain inert.

**Evidence.** `tests/api/order-search.test.mjs` — “RPT-006: scoped SQL search and ship-window pages stay under two-second p95 across 3 seasons, 400 accounts and 20000 orders”; `tests/api/order-search.test.mjs` — “RPT-006: original workspace, history and account drafts page the full authorized collection without losing stale drafts, duplicate POs or source actors”; `tests/api/order-search.test.mjs` — “RPT-006 / ACC-005 / ACC-006 / INT-015 / DATA-002: saved monthly reports freeze whole source-linked snapshots, email exact staff once, and revoke private downloads on recipient or authority changes”; `tests/api/order-search.test.mjs` — “RPT-006 / ACC-004: duplicate company review spans pages and server rechecks every exact revision, including matches beyond the account workspace”; `tests/journeys/installation.test.mjs` — “BASE-001 / RPT-006: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation”; `tests/journeys/installation.test.mjs` — “RPT-006: native account directory and selectors keep later-page accounts reachable without full-directory browser loads”
**Gap.** Account cards, selectors, workspace and exact reads now page the directory while retaining complete duplicate review and page-scoped draft revisions. Tracking-number source/search/performance, broader report types remain missing. c25 exercises exact functional finance/rep recipient coverage under the ACC-005 adopted policy; ACC-006 (c26) supplies delegated coverage. RPT-006 stays partial.

#### RPT-008 — Paged account selection and duplicate review

Core · target · **partial** · From RPT-006 · Cites BASE-ROLE-001, BASE-MAIL-001 · Rules D-6, D-1

**Requirement.** Accounts and every account selector search and page bounded authorized results independently, with stable identity ties and direct lookup for a selected account. Duplicate-company review scans beyond the visible page, binds matching current revisions, and never loses a matching identity. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#rpt-006) apply to this capability.

**Acceptance.**
1. Search and page accounts by company, ID, email and inventory customer identity, then open an authorized account outside the first page.
2. Review a duplicate outside the visible page; refuse a stale reviewed revision without merging identities.

**Evidence.** `tests/api/order-search.test.mjs` — “RPT-006: scoped SQL search and ship-window pages stay under two-second p95 across 3 seasons, 400 accounts and 20000 orders”; `tests/api/order-search.test.mjs` — “RPT-006: original workspace, history and account drafts page the full authorized collection without losing stale drafts, duplicate POs or source actors”; `tests/api/order-search.test.mjs` — “RPT-006 / ACC-005 / ACC-006 / INT-015 / DATA-002: saved monthly reports freeze whole source-linked snapshots, email exact staff once, and revoke private downloads on recipient or authority changes”; `tests/api/order-search.test.mjs` — “RPT-006 / ACC-004: duplicate company review spans pages and server rechecks every exact revision, including matches beyond the account workspace”; `tests/journeys/installation.test.mjs` — “BASE-001 / RPT-006: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation”; `tests/journeys/installation.test.mjs` — “RPT-006: native account directory and selectors keep later-page accounts reachable without full-directory browser loads”
**Gap.** Account cards, selectors, workspace and exact reads now page the directory while retaining complete duplicate review and page-scoped draft revisions. Tracking-number source/search/performance, broader report types remain missing. c25 exercises exact functional finance/rep recipient coverage under the ACC-005 adopted policy; ACC-006 (c26) supplies delegated coverage. RPT-006 stays partial.

### Follow-up and business automation

#### AUTO-001 — Trade application follow-up

Core · target · **done** · Cites BASE-AUDIT-001, BASE-INPUT-003, BASE-MAIL-001 · Rules D-6

**Requirement.** Conditional rules route applications by territory, requested terms and certificate completeness, assign review deadlines and send reviewed missing-information requests. Applicants receive status updates and staff escalation persists until a decision or explicit closure. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#auto-001).

**Acceptance.**
1. Apply without a required certificate, route to a territory owner, send the request and upload the document.
2. Escalation stops on the recorded decision, not merely because an email was queued.

**Evidence.** `tests/api/application-followup.test.mjs` — “AUTO-001: rules route verified applications by territory, requested terms and certificate to a reviewer with a deadline and a prepared request; applicants get generic status emails; escalation persists through requests, answers and emails until a decision or explicit closure”; `tests/journeys/application-routing.test.mjs` — “applications route by territory to a reviewer with a prepared request, the applicant gets generic status emails, and the escalated task stays on the board through the request until a decision at desktop and phone”
**Gap.** None.

#### AUTO-002 — Approval routing and escalation

Core · target · **partial** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001 · Rules D-6

**Requirement.** Order policies automatically apply price, quantity, buyer spend and credit checks, route to the correct purchasing or supplier approvers and notify delegates. Due tasks escalate with the exact blocking cause; retries and revisions do not send duplicate approvals. An approval that can expire releases its held stock through STK-004's acknowledged release before approval expiry. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#auto-002).

**Acceptance.**
1. Submit an order requiring buyer and finance approval, revise its price and run the scheduled escalation.
2. Old approval is invalid, current delegates are notified once and approval closes the correct tasks.

**Evidence.** `tests/api/company-approvals.test.mjs` — “AUTO-002: a $6,000 cart needing buyer and finance approval notifies current approvers and delegates once, a price revision invalidates the old approval, the scheduled escalation escalates with the exact blocking cause, and each approval closes the right notices and tasks”; `tests/api/flows.test.mjs` — “ACC-004: profile, hold and closure preserve buyer history and refuse new commitments or identity takeover”; `tests/api/case-packs.test.mjs` — “PRI-003: case packs and increments refuse invalid quantities at the order, agent, reorder and import doors with explicit corrections, never silently inflating”; `tests/journeys/approval-escalation.test.mjs` — “approvers, delegates and the escalation approver see the steps waiting for them, each approval closes its notices, and the supplier’s overdue approval task names its blocking cause until approval at desktop and phone”
**Gap.** Missing journey: an order requiring both buyer and finance approval completes its routed escalation and stock-safe expiry. The cited company/quantity journeys prove purchasing routes, delegates, revision invalidation and native notifications.

#### AUTO-003 — Quote activity notifications

Core · target · **done** · Cites BASE-ROLE-001, BASE-MAIL-001 · Rules D-6

**Requirement.** New quote messages, commercial revisions, impending expiry and acceptance notify the assigned buyer and rep with a direct authorized link. Internal notes reach only staff; delivery failure creates a follow-up rather than silently dropping the opportunity. this clause delivers ORD-005’s in-app quote notices (request, buyer-visible message, internal note, revision ready to accept, acceptance) to the same audiences by email, never an internal note to a buyer. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#auto-003).

**Acceptance.**
1. Revise a quote, add an internal note and simulate a buyer email bounce.
2. Buyer receives only visible changes, rep gets the note and a failed-contact task remains until resolved.

**Evidence.** `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / DATA-003: expiry withdrawal, missing buyers, same-key retry window and unused-account custody erasure stay explicit through restore”
**Gap.** None.

#### AUTO-004 — Order and fulfillment notifications

Core · target · **missing** · Cites BASE-ROLE-001, BASE-MAIL-001, BASE-OPS-003 · Rules D-6

**Requirement.** Accepted orders, buyer- and staff-initiated changes (ORD-011), canceled-style drops (ORD-016), holds, backorders, shipments, delivery exceptions and return decisions trigger account-appropriate in-app and email notices with preferences and delivery tracking. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#auto-004).

**Acceptance.**
1. Run an order through a split shipment and return with duplicate carrier events.
2. Inspect one notice per material change, the correct recipients, preferences and an owned bounce exception.

**Evidence.** None.
**Gap.** Implement order and fulfillment notifications and prove the stated journey.

#### AUTO-005 — Rep next-action queue

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-SECRET-001 · Rules D-6

**Requirement.** Reps receive a prioritized queue of unanswered quotes, abandoned carts, overdue approvals, dormant accounts and delivery/payment exceptions with source links, reason, next contact date and owner. Staff can snooze, reassign or close with a resolution; queues retain unanswered work. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#auto-005).

**Acceptance.**
1. Create one item of each type, assign and snooze them, resolve a quote through acceptance and record a failed contact.
2. The accepted quote closes while unanswered tasks remain and appear on the due date.
3. AUTO-003 adds failed quote contact tasks keyed by quote/recipient user, with active latest proposer or installation owner, New York contact date and attributed revision-guarded resolution.
4. Acceptance, refresh, later delivery and new revisions do not close them.

**Evidence.** `tests/api/followups.test.mjs` — “AUTO-005: source-linked next actions retain failed contacts, ownership and snoozes; acceptance resolves its quote once while unanswered work remains”; `tests/api/followups.test.mjs` — “AUTO-005: native archives restore durable tasks, contacts and resolutions while excluding installation credentials”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”
**Gap.** Missing journey: delivery and payment exceptions join the accountable rep queue and close only on their business resolution. The cited follow-up/quote journeys prove quote, stale draft, dormant account and failed-contact ownership.

#### AUTO-006 — Accounting invoice and payment automation

Core · target · **missing** · Cites BASE-INPUT-003 · Rules D-6

**Requirement.** An eligible fulfillment or approved on-account order automatically creates the intended accounting invoice once under the chosen billing policy, returns invoice/payment state and produces the buyer document. Mapping failure blocks success and stays assigned until repaired. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#auto-006).

**Acceptance.**
1. Set billing on shipment, ship two releases, lose one QBO/Xero response and rerun.
2. Each release has exactly one matched invoice, returned payment updates the balance and a bad mapping remains an open exception.

**Evidence.** None.
**Gap.** Implement accounting invoice and payment automation and prove the stated journey.

#### AUTO-007 — Payment reminders and promises to pay

Core · target · **missing** · Rules D-6

**Requirement.** Scheduled dunning uses actual due dates, provider settlement and ledger balances, excludes disputed or approved paused items and respects recipient/contact policies. A promise-to-pay creates a dated task; missed promises escalate and settled balances stop future reminders. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#auto-007).

**Acceptance.**
1. Run scheduled reminders for overdue, disputed and promised invoices, settle one between scheduling and sending and miss another promise date.
2. Only still-eligible messages send and finance sees the overdue promise task.

**Evidence.** None.
**Gap.** Implement payment reminders and promises to pay and prove the stated journey.

#### AUTO-008 — Scheduled synchronization and stock alerts

Core · target · **done** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-MAIL-001 · Rules D-6

**Requirement.** the owner or admin explicitly enables the hourly Pier consumer; atomic page effects precede ACK and pending acknowledgements survive interruption. The source limit bounds each page, retry-after rate limits defer subsequent work, and every order still checks live account-scoped Pier stock. Buyers explicitly request their own private in-app stock or prebook-window notice; current purchasing membership and assortment are checked at publication, each request fulfills once, and there is no email or external-channel effect. The supplier records prebook notice windows; ORD-008 purchasing and CAT-008 publication remain separate and inherit this notice boundary. Three failures retain an installation-owner task until reconciliation and an attributed resolution; a changed connection or native grant requires an attributed checkpoint restart. Restored synchronization and requests are disabled. Account and company-user erasure removes their requests and notices. Connectors run incremental syncs with checkpoints, rate limits and freshness checks; account users may request back-in-stock or prebook-window notices. Repeated failures escalate to an operator and replayed stock updates cannot duplicate notices or oversell a stale promise. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#auto-008).

**Acceptance.**
1. Interrupt a paginated sync, resume from its acknowledged checkpoint, restore a watched SKU and replay its event.
2. One notice sends, reconciliation completes and persistent failure stays assigned.

**Evidence.** `tests/api/stock-promise.test.mjs` — “STK-002 / PRI-007: Pier stock by warehouse and incoming promise dates, account warehouse rules and a stale-stock limit with refresh or recorded exception”; `tests/api/stock-promise.test.mjs` — “scheduled stock synchronization resumes an interrupted ACK, sends one requested private notice on replay, and retains an owned persistent exception”; `tests/journeys/stock-sync.test.mjs` — “real Pier development sync resumes ACK interruption, reconciles once and shows private stock notice and assigned recovery at desktop and phone”
**Gap.** None.

### Migration and cutover

#### MOVE-001 — NuORDER move-in

Core · target · **partial** · Cites BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-3

**Requirement.** Import NuORDER product XLS/CSV and brand-configured XLS Order Export Templates, preserving style/color/size/UPC keys, seasons, quantities, prices, PO references and ship windows. Preview source-specific columns and archived-product coverage. Companies, locations and buyers move through MOVE-009; price lists use an explicitly mapped supplied export or API, never an invented universal archive. Product images move: image files the merchant downloads from NuORDER, or image URLs where its export or API provides them, attach through CAT-010's naming rule to the right variant and slot, and only images that cannot be retrieved are listed in the migration report by style. Line sheets and presentations are rebuilt as CAT-003/CAT-004 documents from the imported assortment. The migration report states that orders placed through NuORDER's retailer network stop arriving at cutover and imports the open ones as open orders or labeled history. Source case packs and increments map onto PRI-003's casePack/increment rules. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-001).

**Acceptance.**
1. Upload real-shaped NuORDER product, image and order fixtures matching the documented formats, map variant/customer keys, preview and approve.
2. Reconcile line counts, open quantities, currencies and order value, see images attached to their variants and slots with one unretrievable image reported, label historical orders and refuse unmapped identities before activation.

**Evidence.** `tests/api/move-nuorder.test.mjs` — “NuORDER CSV and mapped XLSX reconcile history, open quantities, product keys and primary JPEGs with fingerprint approval and replay”; `tests/api/move-nuorder.test.mjs` — “NuORDER refuses unmapped identities, changed approval, invalid source quantities and unauthorized activation without writes”; `tests/journeys/move-nuorder.test.mjs` — “owner uploads mapped NuORDER sources, reviews exact reconciliation and applies retained history once”
**Gap.** Supplied CSV and XLSX adapter only; binary XLS needs conversion. Full CAT-010 naming rules, additional image slots, held unmatched files, URL retrieval and an unretrievable-image report by style remain unimplemented. CAT-003 line-sheet rebuilding and CAT-004 presentations from the imported assortment, independent source-versus-planned receivable reconciliation remain unproved. Product creation stays in Pier; separately supplied price-book activation remains unfinished. No full MOVE-001 completion claim.

#### MOVE-002 — Pepperi move-in

Core · target · **missing** · Cites BASE-DATA-001 · Rules D-6, D-3

**Requirement.** Import Pepperi item Excel exports with selectable IDs and parent-style rows and its outbound order XML files, including XML content delivered with a .txt extension. Map account/price exports supplied by the merchant separately; Pepperi history-import CSVs are not misrepresented as an outbound export. Preserve external transaction, item and customer keys. Source case packs and increments map onto PRI-003's casePack/increment rules. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-002).

**Acceptance.**
1. Preview real-shaped Pepperi Excel item and XML order fixtures matching the documented formats, identify a .txt XML file by content, map customer/variant references and reconcile quantities and values.
2. Replaying the source creates no second order.

**Evidence.** None.
**Gap.** Implement pepperi move-in and prove the stated journey.

#### MOVE-003 — Brandboom move-in

Core · target · **missing** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-3

**Requirement.** Import Brandboom product and customer .XLS exports and available CSV/Excel order templates, mapping style/variant SKUs, billing/ship-to addresses, order statuses, prices and line quantities. Required export permissions/template settings are explained; lookbook layouts and images missing from a source file are separately reported. Source case packs and increments map onto PRI-003's casePack/increment rules. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-003).

**Acceptance.**
1. Upload real-shaped Brandboom customer/product XLS and order CSV/Excel fixtures matching the documented formats, resolve duplicate company names by source ID and review address mapping.
2. Reconcile open order values and preserve the original file and field-level diagnostics.

**Evidence.** None.
**Gap.** Implement brandboom move-in and prove the stated journey.

#### MOVE-004 — SparkLayer move-in

Core · target · **done** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-3

**Requirement.** Import SparkLayer account and agent activity CSV in summary or detailed line form and shopping-list CSV. Preserve quote and order type, quantities, prices, shipping, tracking and custom fields present in the export; product and customer authority comes from an explicitly selected Shopify, WooCommerce or supplied export mapping. Filtered exports are identified as incomplete rather than full tenant archives. Source case packs and increments map onto PRI-003's casePack and increment rules. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-004). Any agent call carries the classes computed in the Agent surface; the company’s policy decides that call within its sponsor’s current role.

**Acceptance.**
1. Upload real-shaped detailed activity and shopping-list CSV fixtures matching the documented formats, compare the selected export date and filter range and join backing-store product and customer IDs.
2. Reconcile covered orders and flag omitted source scope before cutover.

**Evidence.** `tests/api/move-sparklayer.test.mjs` — “SparkLayer detailed activity reconciles original scoped order and quote history, maps source rules, applies once and exports private current-price lists”; `tests/api/move-sparklayer.test.mjs` — “SparkLayer refuses unmapped identities, malformed rows, conflicting replay and stale native approval; summary scope remains explicitly incomplete”; `tests/api/move-sparklayer.test.mjs` — “SparkLayer account erasure retires shared originals and history atomically and prevents closed-account source reactivation”; `tests/journeys/move-sparklayer.test.mjs` — “owner uses an imported SparkLayer list at current prices and explicitly shares it at desktop and phone”
**Gap.** None.

#### MOVE-005 — WizCommerce move-in

Core · target · **done** · Cites BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001 · Rules D-6, D-3

**Requirement.** Import WizCommerce order and quote Excel workbooks with header, line and combined master sheets, customer, contact and address workbooks, or FTP CSV header/item/customer files. Preserve UUID and reference relationships, document type, statuses, payments and units. Website-user exports are separate and lead to reviewed invitations rather than imported login authority. Source case packs and increments map onto PRI-003's casePack and increment rules. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-005).

**Acceptance.**
1. Upload a real-shaped workbook set and FTP CSV batch matching the documented formats, join order headers and lines, distinguish a quote from an accepted order and reconcile customer/address counts and financial totals.
2. Replaying either source cannot double-count history.

**Evidence.** `tests/api/move-wizcommerce.test.mjs` — “WizCommerce FTP UUID joins preserve separate order and quote facts, payments and units; workbook layouts replay without duplicate history”; `tests/api/move-wizcommerce.test.mjs` — “WizCommerce refuses orphan or ambiguous references, conflicting headers, unmapped customers and changed replay without losing original history”; `tests/api/move-wizcommerce.test.mjs` — “WizCommerce website users need an explicit replay-safe native invitation review and exact-email acceptance before purchasing access”; `tests/api/move-wizcommerce.test.mjs` — “WizCommerce activates reviewed native customers contacts and addresses atomically with write-free reconciliation, stable replay and inert restore”; `tests/journeys/move-wizcommerce.test.mjs` — “owner reviews a pending WizCommerce buyer and sees exact accepted purchasing rights at desktop and phone”; `tests/journeys/move-wizcommerce.test.mjs` — “owner previews workbook and FTP native activation, approves exact reconciliation and replays without duplicates at desktop and phone”
**Gap.** None.

#### MOVE-006 — Cin7 portal move-in

Core · target · **missing** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-INPUT-003 · Rules D-6, D-3

**Requirement.** A Cin7 Core portal buyer can bring customer, product/price and open sales-order data through its authorized API or actual CSV exports with documented source mappings. Preserve Cin7 identifiers and keep the existing inventory/ledger authority while buyer access and presentation move to Barrow. Source case packs and increments map onto PRI-003's casePack/increment rules. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-006).

**Acceptance.**
1. Connect a test Cin7 company and preview a real-shaped source export/API set, reconcile open quantities and prices, invite buyers and complete one new order without duplicating the existing Cin7 sales order.

**Evidence.** None.
**Gap.** Implement cin7 portal move-in and prove the stated journey.

#### MOVE-007 — Reconciled migration rehearsal

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-SECRET-001 · Rules D-6, D-3

**Requirement.** Every importer previews accounts, buyers, locations, catalogs, media references, prices, lists, quote/order lines, open releases, invoices and balances where the source supplies them. Counts, sums, rejected fields and missing source entities are explicit; unsupported or unavailable data requires a supplied export/mapping or labeled retained history before buyer sign-off. Credentials, tax approval and provider financing authority never migrate as approval. Source case packs and increments map onto PRI-003's casePack/increment rules. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-007). RL-7 records the adopted commercial semantics.

**Acceptance.**
1. Dry-run a populated account/price CSV that updates one account and adds two, compare source and planned counts and USD sums, correct one unknown SKU and apply with the owner's recorded fingerprint approval.
2. No invitation, account, order or Pier write occurs during preview, and with Pier unreachable the SKU check reports that it did not run and apply refuses.
3. The receivable-mismatch and by-status totals steps remain obligations of PAY-008/PAY-009 and MOVE-001 through MOVE-006.

**Evidence.** `tests/api/move-rehearsal.test.mjs` — “MOVE-007: a reconciled account/price rehearsal compares source and planned totals, refuses unknown SKUs and records the approved fingerprint, read-only until apply”
**Gap.** Missing journey: reconcile the source-supplied buyer, location, catalog, list, quote/release, invoice and balance entities together. The cited rehearsal proves account/price CSV counts, currency sums, SKU correction and inert preview/apply.

#### MOVE-008 — Cutover delta and safe rollback

Core · target · **partial** · Cites BASE-DATA-001 · Rules D-6, D-3

**Requirement.** Owners choose an order-entry cutoff, reconcile last changes, declare the system responsible for each open order/invoice and enable new activity only after sign-off. A brand whose ERP fed the incumbent by flat files repoints that job to Barrow's INT-020 feed. During rehearsal the feed's import files apply to the rehearsal only and its order export stays off. At cutoff, export starts with the first post-cutover order, so the ERP never receives an order twice from the incumbent and Barrow. Imported history cannot trigger reservations, payments or reminders. Rollback/undo preserves post-cutover native edits and commercial dependencies and gives an explicit disposition for records it cannot reverse. Source case packs and increments map onto PRI-003's casePack/increment rules. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-008). RL-101 adopts separate scoped owner consent for entry holds, cutoff and pack, each bridge delivery and native-only rollback, with pinned host trust and server-held credentials. Each open order, invoice and stock fact has a named authority; native undo never implies external rollback. Scheduled INT-020 imports and export remain owed.

**Acceptance.**
1. Run a rehearsal then a delta import with an order edited at source, sign off the cutoff and place one new order.
2. Attempt undo after a dependent shipment; preserve it, name the blocked records and prove historical imports initiated no financial effect.
3. Repoint a flat-file ERP job to the INT-020 feed in rehearsal: product and ATS files apply, no order file is written, and after cutoff only the new order is exported.
4. Under RL-101, read the separate scoped consents, pinned host trust and authority for each open order, invoice and stock fact; native rollback makes no claim of external rollback.

**Evidence.** `tests/api/move-rehearsal.test.mjs` — “owner rehearses and reconciles a source delta, signs scoped authority and exports only new orders; rollback preserves a dependent shipment”; `tests/journeys/delta-cutover.test.mjs` — “owner reviews delta citations and scoped feed rehearsal, signs cutoff, delivers a new order and preserves shipment dependencies on rollback at desktop and phone”; `tests/api/flat-file-feed.test.mjs` — “owner tests a pinned merchant SFTP destination through the Worker; wrong host trust, credentials and non-owner calls refuse”
**Gap.** The full INT-020 scheduled feed, unchanged NuORDER templates and live feed ATS authority are not implemented by this bridge; accepted-order edit exchange still needs ORD-011/016 and Pier’s missing edit command.

#### MOVE-009 — NuORDER companies and buyers move-in

Core · target · **partial** · Cites BASE-DATA-001, BASE-MAIL-001 · Rules D-6, D-3

**Requirement.** Import NuORDER's Company data and Buyer data templates (XLS/CSV) and the equivalent NuORDER API reads: customer name and code, currency, multiple bill-to and ship-to addresses, payment terms, credit status, assigned reps, price-list and catalog assignments and linked buyer contacts. Preview maps them to ACC-002 companies and users, ACC-003 locations, ACC-006 rep assignments and PAY-004 terms and credit status, and flags duplicate customer codes and unknown reps or price lists for resolution before apply. Login authority never migrates: after approval each buyer receives one reviewed pending invitation. Replay is idempotent by customer code and buyer email. Source case packs and increments map onto PRI-003's casePack/increment rules. any import this clause adds or feeds reports its entities in MOVE-007’s dry-run reconciliation (source against planned counts and sums by currency, rejected fields, missing entities) and records the approved fingerprint. any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. Buyer imports create reviewed pending ACC-002 invitations, never active memberships; exact-email collisions remain for supplier review, and no login authority migrates. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#move-009).

**Acceptance.**
1. Preview real-shaped NuORDER Company and Buyer data workbooks with two ship-tos per company, a duplicate customer code and an unknown rep; resolve them and apply.
2. Each company has its locations, terms, credit status, currency, rep and price list, each buyer has one pending invitation, and replaying the import adds no companies or invitations.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Reviewed account/price CSV preview, apply and replay ship; NuORDER Company/Buyer templates and API, locations, buyer invitations, rep and credit-status mapping are missing.

### Data security operations and product separation

#### DATA-001 — Business data portability

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-SECRET-001, BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Owner and properly scoped company users export readable CSV/JSON plus document/media manifests covering their authorized accounts, products, prices, quotes, orders, releases, invoices, payments, credits, statements and audit references. Open formats retain IDs, currency, source mappings and revisions so the merchant can leave without losing the commercial record. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#data-001). Any agent call carries the classes computed in the Agent surface; the company’s policy decides that call within its sponsor’s current role.

**Acceptance.**
1. Export an account fixture with orders in several statuses, including a reorder, a PO document and a legacy AUD record, and reconcile counts, line sums and per-currency totals; resolve each document reference to its bytes.
2. A company export contains only that company and no audit decisions, the company policy decides an agent’s scoped export, and an owner archive still excludes all installation credentials.
3. The 3-location, split-order, return and partial-payment steps remain obligations of ACC-003, ORD-009/013, SHIP-004 and PAY-003.
4. AUTO-003 adds supplier-only quotedeliveries JSON/CSV with stable delivery, quote/account/recipient IDs, exact provider ID, states, attempts and task references; buyer exports omit it. An agent export carries standard, adding sensitive for protected records or external for an outside recipient; the company’s policy decides it within the sponsor’s role.
5. RPT-005 activity goals join the owner/admin export as activity goals (exact Native user ID, period, frozen time zone, count goals, revision and attributed reason); buyer and functional-staff general exports omit them, while entitled reps/managers use their scoped performance CSV.

**Evidence.** `tests/api/data-export.test.mjs` — “DATA-001: owner and buyer export open JSON/CSV commercial records that reconcile, resolve documents and stay in scope”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”; `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”
**Gap.** Missing journey: export and reconcile the target split-release, return and general partial-payment records together with all document bytes. The cited exports prove existing account/order/quote, delivery, activity-goal and credit/refund records and scope.

#### DATA-002 — Commercial audit and decision history

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-SECRET-001, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Authorized staff search an append-only audit by account/order/person and see human/agent actor, source, time, revision and reason for price, permission, approval, credit, refund, import and connector changes. Buyer-visible histories omit internal notes and secrets; exporting the audit preserves attribution. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#data-002). Any agent call carries the classes computed in the Agent surface; the company’s policy decides that call within its sponsor’s current role.

**Acceptance.**
1. Approve the price/discount rule, prepare as an agent and review/submit/approve as people, revoke a grant, import/replay/undo accounts and erase an unused one; search by account/order/person and export the attributed audit, including more than one export page and old unrecorded events.
2. Editing/deleting history is refused and a buyer, or an agent acting for that buyer, cannot retrieve internal decisions.
3. Restore the archive and retain event IDs and attribution.
4. The future credit override, refund and connector decision acceptance steps remain obligations of PAY-004/005/006/009/010 and INT-002 through INT-020.
5. AUTO-003 records system-actor secret configure/rotate/revoke, verified delivery events and failed-contact task creation; existing attributed followup.update records assignment/contact/resolution.
6. No secret, fingerprint, message body or attachment enters these events.
7. RPT-007 records saved definitions and recipient identities, snapshot freeze/queue, unconfigured sender, submission claim and exact outcome, authenticated delivery event, recipient removal/identity revocation, download and refusal as append-only attributed report audit.
8. Records contain IDs and reasons, no snapshot figures, secret, token, message body or attachment. Acceptance searches and exports these events and retains them through the owner archive. RPT-005 a saved rep goal records the exact Native rep, period, frozen zone, goals, revision, actor and reason; it triggers no payout or outreach. INT-011 carrier: Faire owner configuration, page reconciliation and reviewed matching decisions retain actor, source, time, revision and reason through staff audit search and complete CSV; buyers and agents acting for buyers cannot read those internal decisions; audit mutation is outside the append-only model.

**Evidence.** `tests/api/audit.test.mjs` — “DATA-002: every current commercial mutation has searchable, attributed, append-only audit and complete safe CSV custody”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”; `tests/api/order-search.test.mjs` — “RPT-006 / ACC-005 / ACC-006 / INT-015 / DATA-002: saved monthly reports freeze whole source-linked snapshots, email exact staff once, and revoke private downloads on recipient or authority changes”; `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”; `tests/api/credit-payments.test.mjs` — “finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice”
**Gap.** Missing journey: query and export the whole target set of credit/finance and connected-provider decisions after their allowed/refused paths. The cited audit/quote/credit journeys prove existing commercial decisions, append-only behavior and private scope.

#### DATA-003 — Retention erasure and provider custody

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-SECRET-001, BASE-MAIL-001, BASE-ACCESS-002, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** Owners set retention policies for PO documents, media, messages and commercial history, with legal holds and reviewable erasure requests. Identity and credentials are removed or deidentified when appropriate while required invoice/order history remains attributable. Deletion reports name separate processor, accounting, mail and inventory custody and apply erasure journals to later restores. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#data-003). RL-8 records the adopted commercial semantics.

**Acceptance.**
1. Erase an unused imported account and a retention-expired PO attachment, process a held ordered-account request and inspect redaction, retained financial history and the provider-custody report.
2. Restore with a later erasure journal and refuse resurrection.
3. For an ordered-account erasure: verify and record the request, preview every class, revoke access under a hold without redacting, release it as owner, and explicitly execute the current revision with explicit erasure confirmation; inspect placeholders/removals, unchanged within-floor financial records, exact audit attribution, exclusions, transfer invalidation and custody.
4. Restore older data with the outside-D1 journal and inspect re-application before serving; missing or incomplete journals refuse service and restored mail never re-sends.

**Evidence.** `tests/api/retention.test.mjs` — “DATA-003 / DATA-001: owner review, legal holds, seven-year commercial floor, attributed PO erasure receipt and restore fence”; `tests/journeys/retention.test.mjs` — “owner verifies and holds an ordered account, previews its custody and floor, revokes access, releases the hold and erases personal data at desktop and phone”; `tests/journeys/installation.test.mjs` — “BASE-001 / RPT-006: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation”
**Gap.** None.

#### DATA-004 — Connection and document security

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-SECRET-001, BASE-ACCESS-002 · Rules D-6, D-4

**Requirement.** Connection rotation, revocation and scanner custody protect Barrow’s inventory and commercial documents. Public application documents stay quarantined without a configured scanner. Private PO and quote documents refuse unsafe active content, but do not claim malware screening without its verdict. Upload and download constraints, signed-provider intake and the bounded API capacity rules are in the commercial detail. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#data-004) apply.

**Acceptance.**
1. Rotate a connector token, replay an invalid signed webhook, upload a dangerous attachment and request a private file as another account.
2. Refuse each unsafe action and inspect logs that reveal no credential or document body.
3. AUTO-003 adds server-only webhook-secret custody, audited configure/rotate/revoke without value disclosure, Base signed Resend intake with exact tenant/message/address authorization, and refusal of invalid/foreign/changed-fingerprint events.
4. Identical valid replay is acknowledged with no duplicate effect; other connector and document-security gaps remain.

**Evidence.** `tests/api/validation.test.mjs` — “deployed Pier rotation and revocation are audited once, the replacement works and public evidence contains no credential”; `tests/api/validation.test.mjs` — “unsafe active or embedded documents are refused; public application documents remain quarantined until malware screening exists”; `tests/api/validation.test.mjs` — “all Barrow API doors enforce an atomic per-IP fixed-window limit without retaining addresses or request bodies”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”; `tests/journeys/application-routing.test.mjs` — “applications route by territory to a reviewer with a prepared request, the applicant gets generic status emails, and the escalated task stays on the board through the request until a decision at desktop and phone”
**Gap.** External dependency: the owner must name and provision a self-hosted or owner-contracted malware scanner processor per installation behind a Base adapter. No processor or scanner credential is held. Its secret stays server-side; configure/rotate/revoke must be audited and explicit recorded owner consent must name that processor. Only that endpoint receives bytes over TLS; bytes and request bodies are never logged, and scanning retains only hash, verdict, scanner id and time. Outages must quarantine with a named reason and retry, never silently pass. Public application uploads and existing application attachments are quarantined without a scanner, labelled not malware-screened and unavailable for download. PO and quote files retain the existing not-malware-screened label. Active-content refusal is not malware screening. Pier still supplies expiring owner/stock-operator sessions; a narrowly scoped service token depends on run-pier. DATA-004 stays partial under ct 22 October 15:46Z.

#### BASE-001 — Native installation and shared foundations

Core · target · **done** · Cites BASE-INPUT-003, BASE-ACCESS-002, BASE-INSTALL-001, BASE-OPS-002, BASE-BACKUP-001 · Rules D-6

**Requirement.** Barrow’s installation preserves its declared identities and migrations, opens its Lobby and wholesale app without requiring Pier, and shows which optional commercial connection needs configuring.

**Acceptance.**
1. Install a fresh checkout through the documented commands and open the Lobby and wholesale app with Pier unconfigured.
2. Inspect preserved identities and applied migrations.

**Evidence.** `tests/journeys/installation.test.mjs` — “BASE-001 / RPT-006: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation”
**Gap.** None.

#### OPS-001 — Actionable diagnostics and recovery

Core · target · **partial** · Cites BASE-DATA-001, BASE-SECRET-001, BASE-MAIL-001, BASE-ACCESS-002, BASE-OPS-004, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6

**Requirement.** The wholesale diagnostics view identifies pending inventory and accounting handoffs, source, age, owner and the action needed to recover them. Quote delivery failures link to the owned contact task; restoring an installation requires reconnecting its mail provider. Diagnostics disclose no connection credential or commercial document body. The [detailed commercial rules](docs/COMMERCIAL-RULES.md#ops-001) apply to this capability.

**Acceptance.**
1. Interrupt an inventory and accounting handoff, restart, open diagnostics and resume those orders.
2. Read acknowledged success or the remaining owned exception, and export redacted diagnostics.
3. Inspect each open quote delivery’s identity, state, age, owner and contact-task link.

**Evidence.** `tests/api/diagnostics.test.mjs` — “OPS-001: owner diagnostics show live Pier health and each interrupted handoff by correlation ID until the same order resumes; export holds no secrets”; `tests/api/quote-delivery.test.mjs` — “AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”
**Gap.** Missing journey: interrupt an accounting-provider handoff, restart and recover that same external invoice/payment. The cited diagnostics/quote journeys prove inventory recovery and visible mail/contact failures.

### Push further with account agents

#### AGT-001 — Turn inbound purchase orders into validated drafts

Core · push-further · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003, BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-5

**Requirement.** Calls carry standard, sensitive, external and commitment, computed from the commercial effect; the company’s policy decides each call. Under the held company policy, an account agent reads authorized buyer email, PDF, spreadsheet and photographed/handwritten PO images, maps buyer aliases to SKUs and extracts quantities, units, addresses, references and dates with source-page/region citations and confidence. It validates against current account catalogs, prices, stock and terms, asks for missing details through a human-reviewed draft message and prepares an order for buyer/rep approval. Documents are untrusted data and cannot grant tools or change policy. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#agt-001).

**Acceptance.**
1. Under the held company policy, submit email, PDF and photographed POs containing an ambiguous SKU and a hostile instruction.
2. Under the held company policy, review cited extraction and validation errors, correct the ambiguity and approve a draft.
3. Under the held company policy, nothing is ordered or sent before the authorized person approves.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Revocable agents prepare stock/price-validated drafts; document/mail intake, extraction citations and exception dialogue are missing.

#### AGT-002 — Resolve substitution and stock exceptions

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-5

**Requirement.** Calls carry standard, commitment, money and external, computed from the commercial effect; the company’s policy decides each call. Under the held company policy, using original PO lines, account assortment, approved substitutes, units, current ATP and commercial constraints, the agent proposes ranked substitutions or split windows with exact price/tax/freight differences. Buyer/rep approves the basket and a manager approves any commercial exception; changed stock or revisions invalidate the proposal. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#agt-002).

**Acceptance.**
1. Under the held company policy, send a PO for a discontinued style, inspect two grounded substitutes and delivery options, decline one and approve a revised basket.
2. Under the held company policy, change inventory before execution and require revalidation; no substitute ships without the required approval.

**Evidence.** `tests/api/substitutions.test.mjs` — “approval-bound agent proposals preserve provenance and refusals, then reauthorize a newly reviewed revision and execute its exact key once”; `tests/api/substitutions.test.mjs` — “inventory changes invalidate a proposed basket; a buyer declines one reviewed substitute and approves a fresh source-bound revision”; `tests/journeys/agent-proposals.test.mjs` — “owner scopes an external agent, manager and buyer review exact replacements, revoked execution is refused and a fresh revision completes once at desktop and phone”
**Gap.** Exact tax differences await TAX-001 or TAX-002 and an owner-provisioned Avalara AvaTax or TaxJar account. Tax remains explicitly unknown, never zero or verified. Quoted orders, historical currencies and orders/accounts with sales-terms acceptance/assignment are refused by this proposal door; material quote/terms revision coverage remains unproved. No requirement is narrowed.

#### AGT-003 — Prepare a credit-hold resolution

Core · push-further · **missing** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-5

**Requirement.** Calls carry standard, sensitive, money and commitment, computed from the commercial effect; the company’s policy decides each call. Under the held company policy, the agent joins the account balance, open invoices/orders, provider payment state, credit policy and buyer correspondence to explain a hold and propose payment allocation, deposit or finance review. Under the held company policy, finance decides the commitment override and the buyer decides the money mandate; the company’s policy decides those agent calls. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#agt-003).

**Acceptance.**
1. Under the held company policy, create a held order with an unsettled ACH payment and disputed invoice.
2. Under the held company policy, inspect a source-linked resolution plan, approve a deposit path and let finance release the hold only after verified events satisfy policy.

**Evidence.** None.
**Gap.** Implement prepare a credit-hold resolution and prove the stated journey.

#### AGT-004 — Explainable sell-through reorder plans

Core · push-further · **partial** · Cites BASE-ROLE-001, BASE-DATA-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-5

**Requirement.** Calls carry standard, external and commitment, computed from the commercial effect; the company’s policy decides each call. Under the held company policy, with buyer-authorized sell-through from Shopify POS or Lightspeed Retail (X-Series) exports or APIs, other POS exports or a connected inventory feed, purchase cadence, seasonality, stock-on-hand, open orders and budget, the agent proposes a timed replenishment basket and explains each quantity. Absent sell-through is labeled unknown rather than invented. In the held company policy, the buyer chooses quantities/date and the rep chooses contact cadence; purchase calls carry commitment and outreach carries external, which the company’s policy decides. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#agt-004).

**Acceptance.**
1. Under the held company policy, load a stockist sales/stock feed with an outage and open prebook, compare the proposed basket to actual demand and commitments, edit it and approve once.
2. Under the held company policy, show uncertainty for the outage and measure accepted, delivered and paid outcomes.

**Evidence.** `tests/api/reorder.test.mjs` — “buyer-authorized sell-through explains demand, outage uncertainty and open prebooks before an edited plan creates one human-reviewed draft”; `tests/journeys/reorder.test.mjs` — “a buyer edits and accepts one sell-through plan and a scoped rep reviews its contact date at desktop and phone”
**Gap.** Carrier-verified delivery measurement and direct Shopify/Lightspeed adapters are unproved. Normalized POS exports, purchase cadence and a buyer’s seasonality factor exist; agent commitment and outreach still need company-policy decisions. Carrier delivery is unknown when only Pier dispatch is present.

#### AGT-005 — Follow every order to delivery and payment

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-5

**Requirement.** Calls carry standard, external, commitment and money, computed from the commercial effect; the company’s policy decides each call. Under the held company policy, the account agent joins order/release acknowledgments, promised dates, inventory fulfillment, carrier events, invoices and provider settlements, opens owned exceptions and drafts appropriate follow-ups until both delivery and payment are verified or a human records resolution. Revised promises, cancellation, refunds and collection messages require human approval; a label, sent message or bank pending state never closes the job. this clause feeds AUTO-005 verified delivery/payment exceptions with source links, reasons, next contact dates and owners, and closes only on verified or attributed resolution. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#agt-005).

**Acceptance.**
1. Under the held company policy, lose an inventory acknowledgment, delay one parcel and return an ACH debit.
2. Under the held company policy, inspect a source-linked action queue, approve outreach and resolve each real event; closure requires the verified delivery/settlement or an explicit attributed human exception.

**Evidence.** `tests/api/flows.test.mjs` — “Barrow wholesale public HTTP journey with real Pier and D1”
**Gap.** Reservation retry and manual shortfall refresh exist; agent delivery/payment tracing, owned tasks and approved follow-through are missing.

#### AGT-006 — Reconcile a wholesale portal cutover

Core · push-further · **partial** · Cites BASE-DATA-001, BASE-INPUT-003, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-5

**Requirement.** Calls carry standard, commitment, live and destructive, computed from the commercial effect; the company’s policy decides each call. Under the held company policy, an agent compares retained incumbent exports with target accounts, variants, price books, locations, open orders, releases and receivables, proposes mappings and highlights count/value differences with source citations. The owner approves mappings and balances before activation; ledger authority stays explicit, and imported history remains inert under D-3. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#agt-006).

**Acceptance.**
1. Under the held company policy, give the agent a real-shaped incumbent workbook and ledger export with duplicated company names and a missing release.
2. Under the held company policy, inspect proposed mappings and reconciled totals, correct one mapping and sign off before applying.
3. Under the held company policy, native edits continue to fence undo.

**Evidence.** `tests/api/move-rehearsal.test.mjs` — “native cutover agent cites workbook and ledger mappings, reconciles missing releases, binds owner sign-off and preserves native edits”; `tests/journeys/cutover.test.mjs` — “owner corrects cited cutover mappings, reviews missing releases and ledger differences, activates once and sees native-edit undo refusal at desktop and phone”
**Gap.** Missing journey: the cutover operator’s calls are decided by two company policies. The cited native cutover journeys prove source mappings, reconciled balances, exact owner sign-off and guarded undo under the existing flow.

#### AGT-007 — Plan accountable account follow-up

Core · push-further · **partial** · Cites BASE-DATA-001, BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-5

**Requirement.** Calls carry standard and external, computed from the commercial effect; the company’s policy decides each call. Under the held company policy, the agent uses actual quote conversations, abandoned carts, order cadence, visits, buyer preferences and unresolved service/payment tasks to propose the next useful rep action and a grounded message. Reps review recipient/content/timing, can suppress outreach and see completion outcomes rather than treating generated text as closed work. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#agt-007).

**Acceptance.**
1. Under the held company policy, present an account with a delayed delivery and an unanswered quote.
2. Under the held company policy, review a plan that addresses the delivery before proposing more stock, approve one message and suppress another; unanswered work stays assigned until the buyer responds or a rep resolves it.

**Evidence.** `tests/api/followups.test.mjs` — “AGT-007: grounded account plan puts late fulfillment first, reviews exact outreach, sends once and retains ownership until a buyer response or human resolution”; `tests/journeys/approval-escalation.test.mjs` — “account follow-up reviews delayed fulfillment before stock, approves exact delivery outreach, suppresses a quote and records a buyer response at desktop and phone”
**Gap.** Missing journey: outside follow-up calls follow two company policies, including all-autonomous. The cited journeys prove grounded delivery-first plans, exact reviewed outreach, suppression and accountable response closure.

#### AGT-008 — Policy-decided agent execution and provenance

Core · push-further · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-SECRET-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-6, D-5

**Requirement.** Calls carry standard, commitment, money, external and access, computed from the commercial effect; the company’s policy decides each call. Under the held company policy, every agent proposal records source data, tool permissions, model/run identity, freshness, proposed effects and human approvals, with account-scoped revocation and cost/contact limits. External effects bind to the approved revision and idempotency key; stale data, revoked authority or prompt-injected documents stop execution and preserve an inspectable reason. The detailed commercial rules for this capability apply as recorded in [the commercial rules](docs/COMMERCIAL-RULES.md#agt-008).

**Acceptance.**
1. Under the held company policy, approve a substitution proposal, change its source price and revoke its grant before execution.
2. Under the held company policy, refuse the stale/revoked effect, show its provenance and approval in history and execute a newly reviewed revision once after reauthorization.

**Evidence.** `tests/api/substitutions.test.mjs` — “approval-bound agent proposals preserve provenance and refusals, then reauthorize a newly reviewed revision and execute its exact key once”; `tests/api/substitutions.test.mjs` — “scoped proposal authority refuses foreign doors, injected instructions and over-budget work without inventory effects”; `tests/api/substitutions.test.mjs` — “inventory changes invalidate a proposed basket; a buyer declines one reviewed substitute and approves a fresh source-bound revision”; `tests/api/substitutions.test.mjs` — “proposal effects require current functional manager limits and the approving buyer’s still-active purchasing authority”; `tests/api/substitutions.test.mjs` — “a changed replacement basket invalidates its agent approval before any original stock release”; `tests/journeys/agent-proposals.test.mjs` — “owner scopes an external agent, manager and buyer review exact replacements, revoked execution is refused and a fresh revision completes once at desktop and phone”
**Gap.** Missing journey: the proposal execution door computes risk classes and obeys company policy rather than fixed agent dispositions. The cited journeys prove provenance, exact reviewed revision, stale/revoked refusal and one native effect.

## Agent surface

### Agent surface

#### SURFACE-001 — Registry and the wholesale action table

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-006

**Requirement.** Registry and the wholesale action table is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. The registry’s action families and Core references equal this table and its non-tool reasons, including every split part.
2. A catalog draft, quote, order, credit and contact task run through the same wholesale action as the corresponding screen; the Base conformance harness passes those seed fixtures.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-002 — Account authority and regulated application facts

Agent surface · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-006

**Requirement.** Account authority and regulated application facts is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. An invitation, profile approval, staff grant and territory transfer compute access with the affected people and widening or narrowing direction.
2. Reading an application EIN or resale identity document adds sensitive with the application record count and data kind; an ordinary assortment read stays standard.
3. The company-user, rep and finance fixtures preserve their own account/profile scope while an out-of-scope commercial record remains inaccessible.
4. An invitation or application information request computes external from the outside recipient and the account or application record it exposes.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-003 — Catalog exposure and commercial prices

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006

**Requirement.** Catalog exposure and commercial prices is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. A private internal catalog change is standard, a buyer share or public sheet adds external with known, new or public audience and recipient count.
2. Changing a wholesale price, promotion or surcharge adds money with exact currency and amount; changing informational MSRP alone does not change an order total.
3. Publishing a storefront or changing the active season adds live with the affected service.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-004 — Order commitments and amendments

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-012

**Requirement.** Order commitments and amendments is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. Accepting a quote, submitting an order, signing sales terms or granting a commercial exception computes commitment with exact revision, counterparty and value.
2. An order edit that changes charges adds money; the resulting confirmation and stock acknowledgment retain the same agreed source and revision.
3. Repeating a source-bound amendment or cancellation yields one wholesale revision and the inventory outcome named by D-2.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-005 — Payment provider facts and personal handoffs

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-008

**Requirement.** Payment provider facts and personal handoffs is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. Stripe collection, freight purchase, credit application and refund compute money from their original commercial currency, amount and counterparty.
2. A bank mandate or protected card-related read adds sensitive with kind and record count.
3. Provider-mandated hosted card entry, merchant verification and account consent add gated with provider and step; an available provider company-credential route uses its ordinary computed classes.
4. Creating an outside merchant or carrier account adds accounts with that provider.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-006 — Connector and grant settings

Agent surface · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-006

**Requirement.** Connector and grant settings is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. Credential rotation and screening configuration compute security with the changed protective setting.
2. An external mailbox or provider-account creation carries accounts; its provider-required personal consent adds gated.
3. A grant change computes access from the affected people and direction; the Barrow fixture cannot widen the caller’s own authority.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-007 — Irreversible commercial work

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006

**Requirement.** Irreversible commercial work is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. Account erasure, irreversible credit voiding and destructive archive replacement compute destructive with exact affected-item count.
2. An undoable draft deletion stays standard; a retained legal hold still prevents erasure of protected commercial evidence.
3. A sensitive record in a destructive action adds sensitive from the stored record type.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-008 — Cutover and feed authority

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-008

**Requirement.** Cutover and feed authority is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. A source preview is standard; the exact cutover sign-off adds commitment and activation adds live for the feed or portal.
2. An outward order delivery adds external for the configured counterparty; native rollback adds destructive only for work the product cannot undo.
3. RL-101’s named authorities and inert imported history remain visible in the agent’s resulting cutover record.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-009 — Commercial attribution and review context

Agent surface · target · **missing** · From new · Cites BASE-AGENT-008, BASE-AGENT-009

**Requirement.** Commercial attribution and review context is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. A prepared quote, substitution, cutover or follow-up identifies the actual preparer separately from any subsequent person’s decision.
2. The source order, commercial revision, computed classes and policy revision accompany the resulting wholesale audit and exported commercial history.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-010 — Source-linked commercial events

Agent surface · target · **missing** · From new · Cites BASE-AGENT-010

**Requirement.** Source-linked commercial events is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. Quote acceptance, inventory shortfall, credit application, carrier exception and failed buyer contact each expose the resulting commercial source and revision.
2. The wholesale operator can follow one order’s changed shipment and balance through its permitted resource links without treating a transport acknowledgment as delivery or settlement.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-011 — Wholesale record resources

Agent surface · target · **missing** · From new · Cites BASE-AGENT-003

**Requirement.** Wholesale record resources is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. The account, application, catalog, quote, order, invoice, credit, visit, task, report and import fixtures each read through the named resource template.
2. After a quote conversion, credit application and task resolution, their returned resource links open the resulting commercial state in the sponsor’s account scope.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-012 — A stranger runs a seeded wholesale week

Agent surface · target · **missing** · From new · Cites BASE-AGENT-007, BASE-AGENT-013

**Requirement.** A stranger runs a seeded wholesale week is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. Given only the installation URL, a stranger agent reads an inbound PO, prepares a valid order, resolves a shortfall and follows a linked delivery and payment through MCP.
2. Under an all-autonomous company policy, every classed call runs without policy refusal or a person’s approval; provider-required personal steps are identified before that route is chosen.
3. Under the held company policy, the same seeded week runs the review and exact commercial approvals that policy asks for, and ends with matching orders, balances, tasks and audit sources.
4. An outside-contact-blocked variant refuses the outside message while internal reconciliation continues.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

#### SURFACE-013 — Seed client and specialist documentation

Agent surface · target · **missing** · From new · Cites BASE-AGENT-013 · Register R-4

**Requirement.** Seed client and specialist documentation is available to the wholesale account operator on Barrow’s own commercial records.

**Acceptance.**
1. The on-site agent guidance lists this wholesale specialist’s tools, class computations, resource types and commercial handoffs.
2. The stranger’s PO, substitution, credit-hold, replenishment, delivery, cutover and follow-up prompts reference the clauses listed above.

**Evidence.** None.
**Gap.** The risk-and-policy MCP action registry, seed fixtures and specialist journey are not delivered.

## Later

None.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader pass | BAR-006, CAT-005 | not run | | |
| R-2 | Published VPAT | BAR-006, CAT-005 | not run | | |
| R-3 | iOS App Store and Android store approval for native rep apps | REP-002 | not run | | |
| R-4 | Claude, ChatGPT, Codex and Copilot client compatibility receipts | SURFACE-013 | not run | | |
| R-5 | Merchant production enrollment and vendor-tenant certification receipts | PAY-001, PAY-002, PAY-006, INT-002, INT-003, INT-016 | not run | | |
