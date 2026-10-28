# Barrow target product contract

Barrow is a wholesale ordering portal for US brands and wholesalers replacing NuORDER by Lightspeed, Pepperi and Brandboom, with the storefront, field-sales and assisted-order depth buyers seek from SparkLayer and WizCommerce. Trade buyers, purchasing approvers, sales reps, operations and finance use it from private discovery through quote, order, delivery, return and payment.

## Product target

| | |
| --- | --- |
| Category | B2B wholesale ordering portal |
| Incumbents a buyer switches from | NuORDER by Lightspeed, Pepperi, Brandboom |
| Up-and-comers it must also beat | SparkLayer, WizCommerce |
| First buyer | A US sales or ecommerce manager at a brand or wholesaler, with trade purchasers, field reps, operations and finance, in USD and US business time zones |

The primary journey: approve a trade account, publish its assortment and prices, prepare and accept an exact order, reconcile inventory, deliver, collect payment and resolve any return.

## How to read this contract

- This follows the RER contract standard.
- Core, Agent surface and Later remain visible and are counted separately.
- Done means every acceptance outcome has recorded proof.
- Field proof is dated separately and does not block done.
- ACCEPTANCE.md and docs/CLAIMS.md are generated from this source.

## Door rules

- **D-1.** Preserve the agreed commercial snapshot: original currency, lines, prices, terms and attributed decisions. Inventory handoffs retain one durable acknowledged identity and explicit shortfalls; split invoices include only eligible allocated or shipped units.

- **D-2.** A new commercial entity joins DATA-001 JSON and per-kind CSV exports with stable identity, original currency, source mapping and revision in the same buyer and supplier scope.

- **D-3.** An added or extended importer joins MOVE-007 reconciliation of source against planned counts, status counts and currency sums, rejected fields and missing entities, bound to the approved source fingerprint.

- **D-4.** A new financial event extends the commercial record’s exact UTC seven-calendar-year retention floor; leap day clamps to February 28. DATA-003 applies the floor, legal holds, explicit erasure choices and the later-journal restore fence to that event’s own records.

## Shared duties (Base)

| Base duty | Duty | Delta clauses | Base journey |
| --- | --- | --- | --- |
| BASE-ACCESS-001 | Sign-in | none | not run |
| BASE-ACCESS-002 | Sessions | ACC-005 | not run |
| BASE-ACCESS-003 | Public endpoints | none | not run |
| BASE-ACCESS-004 | Server-side authorisation | ACC-005 | not run |
| BASE-INPUT-001 | Validation | none | not run |
| BASE-INPUT-002 | HTML | none | not run |
| BASE-INPUT-003 | Uploads | ACC-001, ACC-005, ACC-006, ACC-008, ACC-009, ACC-010, CAT-002, CAT-003, CAT-008, CAT-009, CAT-010, PRI-001, PRI-006, PRI-008, ORD-001, ORD-005, ORD-007, ORD-008, ORD-012, ORD-013, ORD-014, ORD-017, ORD-018, STK-002, STK-005, REP-002, REP-003, REP-007, PAY-005, PAY-007, PAY-008, PAY-010, TAX-003, INT-003, INT-008, INT-012, INT-013, INT-019, INT-020, RPT-001, RPT-006, RPT-007, RPT-008, RPT-009, RPT-010, RPT-011, RPT-012, RPT-013, RPT-014, RPT-015, AUTO-001, AUTO-003, AUTO-009, AUTO-010, AUTO-011, AUTO-012, AUTO-013, AUTO-014, AUTO-006, MOVE-001, MOVE-002, MOVE-003, MOVE-004, MOVE-005, MOVE-006, MOVE-007, DATA-001, DATA-002, DATA-003, DATA-004, BASE-001, AGT-001, AGT-008 | not run |
| BASE-SECRET-001 | No leakage | none | not run |
| BASE-SECRET-002 | Startup | none | not run |
| BASE-DATA-001 | Export and import | ACC-003, ACC-004, ACC-005, ACC-006, ACC-008, ACC-009, ACC-010, CAT-002, CAT-003, CAT-006, CAT-008, CAT-009, CAT-010, PRI-001, PRI-002, PRI-008, ORD-001, ORD-004, ORD-005, ORD-008, ORD-009, ORD-010, ORD-013, ORD-014, ORD-017, ORD-018, STK-005, REP-004, PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-006, PAY-007, PAY-009, PAY-010, PAY-011, PAY-012, TAX-004, SHIP-004, INT-002, INT-003, INT-004, INT-005, INT-006, INT-007, INT-008, INT-009, INT-010, INT-011, INT-012, INT-013, INT-014, INT-015, INT-016, INT-017, INT-018, INT-019, INT-020, RPT-001, RPT-004, RPT-005, RPT-006, RPT-007, RPT-008, RPT-009, RPT-010, RPT-011, RPT-012, RPT-013, RPT-014, RPT-015, AUTO-003, AUTO-009, AUTO-010, AUTO-011, AUTO-012, AUTO-013, AUTO-014, AUTO-008, MOVE-001, MOVE-002, MOVE-003, MOVE-004, MOVE-005, MOVE-006, MOVE-007, MOVE-008, MOVE-009, DATA-001, DATA-002, DATA-003, DATA-004, BASE-001, OPS-001, AGT-001, AGT-004, AGT-006 | not run |
| BASE-DATA-002 | Retention | none | not run |
| BASE-DATA-003 | Erasure | ACC-006, ACC-008, ACC-009, ACC-010, CAT-010, PAY-001, PAY-002, PAY-003, PAY-006, PAY-010, PAY-011, PAY-012, INT-002, INT-003, INT-013, INT-014, AUTO-003, AUTO-009, AUTO-010, AUTO-011, AUTO-012, AUTO-013, AUTO-014, AUTO-008, DATA-001, DATA-002, DATA-003, DATA-004, AGT-001 | not run |
| BASE-DATA-004 | Outbound flows | none | not run |
| BASE-DATA-005 | Independence | none | not run |
| BASE-PUBLIC-001 | Privacy | none | not run |
| BASE-PUBLIC-003 | Accessibility | none | not run |
| BASE-OPS-001 | Health | none | not run |
| BASE-OPS-002 | Migrations | none | not run |
| BASE-OPS-003 | Idempotency | none | not run |
| BASE-OPS-004 | Failure is visible | none | not run |
| BASE-OPS-005 | Audit | none | not run |
| BASE-ROLE-001 | Roles through every door | ACC-001, ACC-002, ACC-003, ACC-004, ACC-005, ACC-006, ACC-008, ACC-009, ACC-010, ACC-007, CAT-001, CAT-002, CAT-003, CAT-006, CAT-009, CAT-010, CAT-011, PRI-002, PRI-004, PRI-005, PRI-007, ORD-002, ORD-004, ORD-005, ORD-007, ORD-008, ORD-009, ORD-010, ORD-011, ORD-012, ORD-013, ORD-016, STK-001, STK-004, STK-005, REP-001, REP-002, REP-003, REP-004, REP-005, REP-006, REP-007, PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-007, PAY-008, PAY-010, PAY-012, TAX-002, SHIP-004, INT-001, INT-003, INT-004, INT-005, INT-006, INT-011, INT-012, INT-014, INT-015, INT-017, INT-018, INT-019, INT-020, RPT-003, RPT-006, RPT-007, RPT-008, RPT-009, RPT-010, RPT-011, RPT-012, RPT-013, RPT-014, RPT-015, AUTO-003, AUTO-009, AUTO-010, AUTO-011, AUTO-012, AUTO-013, AUTO-014, AUTO-004, AUTO-008, MOVE-004, MOVE-005, MOVE-006, MOVE-007, MOVE-009, DATA-001, DATA-002, DATA-003, DATA-004, AGT-001, AGT-004, AGT-006, AGT-008 | not run |
| BASE-AUDIT-001 | Searchable, durable audit | ACC-005, ACC-006, ACC-008, ACC-009, ACC-010, PRI-002, PRI-007, ORD-004, ORD-005, PAY-001, PAY-004, PAY-006, PAY-009, PAY-010, INT-002, INT-003, INT-004, INT-005, INT-006, INT-007, INT-008, INT-009, INT-010, INT-011, INT-012, INT-013, INT-014, INT-015, INT-016, INT-017, INT-018, INT-019, INT-020, RPT-001, RPT-002, RPT-003, RPT-004, RPT-005, RPT-006, RPT-007, RPT-008, RPT-009, RPT-010, RPT-011, RPT-012, RPT-013, RPT-014, RPT-015, AUTO-003, AUTO-009, AUTO-010, AUTO-011, AUTO-012, AUTO-013, AUTO-014, MOVE-001, MOVE-002, MOVE-003, MOVE-004, MOVE-005, MOVE-006, MOVE-007, MOVE-008, MOVE-009, DATA-001, DATA-002, DATA-003, DATA-004 | not run |
| BASE-BACKUP-001 | Independent backup, restore and rollback | none | not run |
| BASE-DATA-006 | Erasure respects retention and legal hold | ACC-006, ACC-008, ACC-009, ACC-010, CAT-010, PAY-001, PAY-002, PAY-003, PAY-006, PAY-010, PAY-011, PAY-012, INT-002, INT-003, INT-013, INT-014, AUTO-003, AUTO-009, AUTO-010, AUTO-011, AUTO-012, AUTO-013, AUTO-014, AUTO-008, DATA-001, DATA-002, DATA-003, DATA-004, AGT-001 | not run |
| BASE-SIGNIN-001 | Standards-based SSO and lifecycle | none | not run |
| BASE-SIGNIN-002 | Native multi-factor authentication | none | not run |
| BASE-INSTALL-001 | Free self-host and removal | BAR-006, BASE-001 | not run |
| BASE-MAIL-001 | Truthful mail outcomes | ACC-002, ACC-004, ACC-005, ACC-006, ACC-008, ACC-009, ACC-010, CAT-011, ORD-005, ORD-014, ORD-017, ORD-018, PAY-002, INT-015, RPT-006, RPT-007, RPT-008, RPT-009, RPT-010, RPT-011, RPT-012, RPT-013, RPT-014, RPT-015, AUTO-001, AUTO-002, AUTO-003, AUTO-009, AUTO-010, AUTO-011, AUTO-012, AUTO-013, AUTO-014, AUTO-004, AUTO-005, AUTO-006, AUTO-007, AUTO-008, MOVE-009, DATA-002, DATA-003, OPS-001, AGT-001 | not run |
| BASE-ACCESSIBILITY-001 | One accessibility bar | MOB-001 | not run |
| BASE-DOCS-001 | On-site docs from one contract | BAR-006, BASE-001 | not run |
| BASE-AGENT-001 | One MCP door per seed | none | not run |
| BASE-AGENT-002 | The seed's jobs are tools, through the UI's own actions | AGT-001, AGT-002, AGT-003, AGT-004, AGT-005, AGT-006, AGT-007, AGT-008, SURFACE-001, SURFACE-007, SURFACE-012 | not run |
| BASE-AGENT-003 | Records are resources | SURFACE-005 | not run |
| BASE-AGENT-004 | Business identity and short-lived, audience-bound tokens | none | not run |
| BASE-AGENT-005 | An agent acts as a person in a role, never more | AGT-001, AGT-002, AGT-003, AGT-004, AGT-005, AGT-006, AGT-007, AGT-008, SURFACE-008 | not run |
| BASE-AGENT-006 | Every action declares its risk class | AGT-001, AGT-002, AGT-003, AGT-004, AGT-005, AGT-006, AGT-007, AGT-008, SURFACE-001, SURFACE-002, SURFACE-003, SURFACE-004, SURFACE-008, SURFACE-009 | not run |
| BASE-AGENT-007 | The company's policy decides, at one chokepoint | AGT-001, AGT-002, AGT-003, AGT-004, AGT-005, AGT-006, AGT-007, AGT-008, SURFACE-007, SURFACE-008, SURFACE-009, SURFACE-010, SURFACE-011, SURFACE-012, SURFACE-013 | not run |
| BASE-AGENT-008 | Truthful attribution | AGT-001, AGT-002, AGT-003, AGT-004, AGT-005, AGT-006, AGT-007, AGT-008 | not run |
| BASE-AGENT-009 | Every agent action is audited with its class and decision | SURFACE-011 | not run |
| BASE-AGENT-010 | Agents can follow changes | SURFACE-006 | not run |
| BASE-AGENT-011 | Limits are policy, and Pause stops everything | none | not run |
| BASE-AGENT-012 | Writes are idempotent and conflict-safe | SURFACE-009, SURFACE-010 | not run |
| BASE-AGENT-013 | Manifest, docs and the conformance journey | SURFACE-001, SURFACE-013 | not run |

## Published clauses

- `BAR-006`: *Tier:* Core · *Cites:* BASE-DOCS-001, BASE-INSTALL-001

### Published guarantees carried forward

#### BAR-006 — Run site

**Requirement.** The separate public site introduces Barrow, links to /run and serves repository owner guides at /docs without reading installation data. Installed / remains the Lobby. The existing deployment gate controls publication. Target promises are distinct from the implementation status published by this contract.

**Acceptance.**
1. Build with rer build --site, serve the output and traverse the homepage, /run, guide navigation, local assets and a missing guide.
2. Confirm the installed route keeps its Lobby and the site contains no private account data.

## Target clauses

### Trade accounts and authority

#### ACC-001 — Trade applications and approval

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-ROLE-001

**Requirement.** A prospective US stockist submits company name, EIN or business identifier where needed, contact, resale documents, requested locations and expected volume. Staff review duplicates and approve, request information or decline with a reason before private prices or terms become accessible. Invitations and application status are visible to both parties. On first sign-in, and again when the merchant publishes a new version, a buyer accepts the current portal usage terms, recorded with version, person and time; ORD-015 governs the separate sales terms on orders. The detailed formats and commercial boundaries in [the ACC-001 reference](docs/COMMERCIAL-REFERENCE.md#acc-001) apply. RL-1 requires configured application-document screening and quarantine without downloads until it exists.

**Acceptance.**
1. Apply from the public trade form, request a missing certificate, approve and sign in, accepting the portal usage terms.
2. The new buyer sees only its approved assortment; a declined or pending applicant cannot see prices, and publishing new usage terms requires acceptance at the next sign-in.

#### ACC-002 — Company buyers and purchasing rights

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Each company has a company administrator who manages contacts and locations, purchasers who build carts, purchasing approvers who release allowed orders and finance viewers who read invoices/statements. Rights and spend limits are explicit per user and location. Company administrators cannot grant supplier powers or access another company.  Before it ships, this clause routes ORD-005’s buyer-side quote notices and thread to the company users with purchasing rights for the account. Before it ships, this clause inherits ORD-002's list sharing: a shared list is seen and edited by the company users who hold purchasing rights for that account, a private list only by its creator, and another company's lists read as not found. Before shipping, the approved ACC-001 account’s first buyer becomes its company administrator. The detailed formats and commercial boundaries in [the ACC-002 reference](docs/COMMERCIAL-REFERENCE.md#acc-002) apply.

**Acceptance.**
1. Invite four company users, build a cart as a limited purchaser, approve it as the authorized approver, read its statement as finance and refuse finance ordering and cross-company administration.
2. Before shipping, route AUTO-003 emails and expiry reminders to the company purchasers with current rights, retaining exact recipient identity/revocation and private internal notes.

#### ACC-003 — Billing and delivery locations

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** An account maintains separate bill-to, ship-to and contact records with US address validation, default delivery instructions and location-specific tax exemption references. Orders snapshot the chosen addresses; an address edit never rewrites an already accepted order.   The detailed formats and commercial boundaries in [the ACC-003 reference](docs/COMMERCIAL-REFERENCE.md#acc-003) apply.

**Acceptance.**
1. Save a headquarters and two stores, place an order to each store, change the default afterward and inspect unchanged order addresses and the correct tax jurisdictions.

#### ACC-004 — Account lifecycle and commercial profile

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Staff maintain account identifiers, active/on-hold/closed states, channel, territory, assigned rep, catalogs, negotiated terms and provider references. Deactivation blocks new orders while buyers retain permitted history and statements. Duplicate companies are reviewed without silently reassigning historical ownership. The detailed formats and commercial boundaries in [the ACC-004 reference](docs/COMMERCIAL-REFERENCE.md#acc-004) apply.

**Acceptance.**
1. Record the commercial profile, place an order, hold then close its account and attempt checkout through the buyer and agent HTTP doors, including submission and first approval of earlier drafts.
2. History and invoices remain readable to the same authorized buyer; new orders are refused and a duplicate email cannot take over the company.
3. Recover an already-approved lost reservation response after closure without a second stock command.
4. Refuse an unreviewed or stale duplicate-company save, review separate companies, import a duplicate-bearing CSV plan and inspect the attributed review through an owner export; original identities and native profile fields survive.

#### ACC-005 — Supplier roles and separation of duties

*Tier:* Core · *From:* ACC-005, BAR-001 · *Cites:* BASE-ACCESS-002, BASE-ACCESS-004, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Owner manages installation and grants; sales managers control catalogs, prices, assignments and exceptions; reps sell only assigned accounts; operations staff manage fulfillment and returns; finance controls credit, refunds and reconciliation; analysts read authorized reports. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for permission/role decisions, including actor/source/time/revision/reason, before its capability ships. Before shipping, operations-role access inherits RPT-003’s report and its account/warehouse scope obligations. Before shipping, this clause inherits PRI-007 scoped manager exception authority and limits, with attributed reasons and audit. Before it ships, this clause replaces ORD-004’s zero quote-discount limit (every discount needs a recorded owner/admin approval) with per-role amount limits for reps and sales managers. Before it ships, this clause gives the finance role its RPT-004 report access and refuses non-finance staff beyond their permitted summaries. Before it ships, this clause applies its role rights to AUTO-005 task reads, refresh, assignments, contacts, resolutions and staff exports. Before shipping, replace REP-004 owner/admin manager authority with the functional role limits while preserving private commission decisions and attributed policy audit. Before shipping, functional reviewer roles inherit ACC-001’s owner/admin review, document privacy and attributed decisions, and AUTO-001’s routes, review tasks and escalation. The detailed formats and commercial boundaries in [the ACC-005 reference](docs/COMMERCIAL-REFERENCE.md#acc-005) apply. Supplier actions require owner/admin; current customer access is bound to the exact account email. An email edit cannot transfer an existing account or its orders. Company and rep permissions added below must retain this server-side isolation.

**Acceptance.**
1. Invite each supplier role, attempt a credit override as a rep and a catalog edit as operations, allow the authorized finance and manager actions and inspect attributed audit events.
2. Before shipping, each new functional supplier role, including invited analyst/finance operators for outside accountants or buyer AP, becomes eligible for RPT-006 only for its entitled report types.
3. Outside recipients are invited operators, never bare addresses.
4. Using the native sign-in and HTTP commands, read as two different buyers, attempt foreign account reads, cross-origin writes and supplier actions as a buyer, then revoke an agent grant.
5. Unauthorized requests return no commercial data and perform no mutation.

#### ACC-006 — Rep territories and delegated coverage

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Managers assign reps to named accounts and territories with temporary coverage dates. Buyers see their current rep, and a transfer changes future access and attribution without rewriting previous orders or commissions. Before it ships, ORD-005’s supplier-side quote notices and internal notes reach the assigned or covering rep instead of every owner and admin, and a rep reads only their accounts’ quote threads. Before it ships, RPT-001’s sales report shows a rep only their assigned or covered territories, and another territory is refused. Before it ships, this clause limits each rep to their permitted RPT-004 account summaries and refuses another rep’s accounts through the page and CSV. Before it ships, this clause scopes AUTO-005 next actions and their source links to assigned or covered rep accounts, with current coverage dates and permitted reassignments. Before shipping, scope REP-004 manager/rep statements and exports to current permitted accounts without rewriting frozen historical rep/split attribution; rep labels alone grant no access.

**Acceptance.**
1. Assign two reps disjoint accounts, give one temporary vacation coverage and expire it.
2. Order and export access follows current assignments.
3. a rep is an active Native member whose ACC-005 grant is the rep role.
4. A rep holds an account on a calendar day in America/New_York (inclusive dates) only through a primary assignment of that exact account or of every account whose profile territory equals the named territory, temporary coverage of an account, a territory or everything another rep primarily holds (coverage requires an end date and never moves commission attribution), or an exact account the owner listed on the grant.
5. Profile assigned-rep and territory text, rep labels and names grant nothing.
6. Owner, admin and an all-account sales manager assign, cover, end and transfer with a reason; every change is revision-guarded, immediate and audited (assignment, coverage, ending and transfer events), at most one primary rep holds an account on any day, and no earlier order, quote, notice, commission snapshot or audit event is rewritten.
7. One current-scope definition feeds the staff account scope, so catalog, order, quote, invoice, export, report and task doors follow it with no second list, and a write that read an older scope fails its guard.
8. Archives restore assignments as ended (restored grants are already revoked) and unused-account erasure removes that account’s assignments.

#### ACC-008 — Rep quote notifications and contact ownership

*Tier:* Core · *From:* ACC-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Current assigned and covering reps receive only the account’s permitted quote notices, expiry reminders and failed-contact work. Contact ownership follows current coverage without changing economic attribution.

**Acceptance.**
1. Before shipping, route AUTO-003 emails and expiry reminders to the assigned or covering rep and scope failed-contact task ownership/reassignment to current coverage; rep profile metadata alone grants nothing.
2. Buyers see the names of the account’s primary and covering reps and the coverage end date, never identities or contact details.
3. Supplier-side quote notices (request, buyer message, internal note, acceptance) name the account’s current assigned and covering reps, excluding the actor, in-app and by AUTO-003 mail; a revision waiting for discount approval and an account with no current rep keep the owner/admin audience, an owner or admin marking a quote read clears only their own notices, and a rep reads only quote threads of accounts they hold.
4. Dispatch rechecks the rep’s current hold and withdraws a recipient who lost it without substitution; expiry reminders go to the buyer and the reps who hold the account that day (owner/admin only when none does).
5. A failed-contact task starts with the proposing rep while they hold the account, and only current holders (or owner/admin) can be assigned or read it; AUTO-005 next actions, source links and the follow-up export carry only held accounts.

#### ACC-009 — Rep report audience and saved deliveries

*Tier:* Core · *From:* ACC-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** A saved report requires current account scope over its whole filter at freeze, send and download; changed assignments revoke queued deliveries and links rather than trimming the report.

**Acceptance.**
1. Before shipping, RPT-009 scheduled report sends and downloads require current assigned/covered-account access to the whole saved filter; narrower access is refused with an attributed reason, never trimmed.
2. Assignment changes revoke existing links and cancel queued deliveries.
3. Scheduled-report recipients must hold the one saved account when the report freezes, sends and is opened; an assignment ending cancels their queued sends at once, revokes links and records a system audit event, and territory filters stay with all-account readers.

#### ACC-010 — Frozen rep assignment attribution

*Tier:* Core · *From:* ACC-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Assignment changes affect future attribution, preserving earlier commercial and commission snapshots and keeping fixed economic labels distinct from current Native authority.

**Acceptance.**
1. Historical commission attribution survives a transfer.
2. A rep’s sales and finance report names one held account or a territory held completely (page and CSV); any other account or territory, or an unfiltered report, is refused, never trimmed; a rep’s commission statement is bound to their fixed label and lists only accounts held today, while owner, admin and all-account managers still read every frozen statement.
3. New first approvals freeze the fixed commission label of the single primary rep (else the account’s recorded assigned-rep text) so a transfer changes future attribution only; RPT-002 rep rows use the primary assignment, else the ACC-004 text.

#### ACC-007 — Buyer purchasing approvals

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Company administrators set location or amount approval policies, multiple sequential approvers, delegation and escalation. A purchaser can revise or withdraw an unapproved request; a material price, quantity, address or credit change invalidates its approval. Supplier approval remains a separately attributable decision. ACC-002 supplies per-user/per-location limits and the distinct-person company release; this clause supplies the additional revision, delegation and escalation policy. The detailed formats and commercial boundaries in [the ACC-007 reference](docs/COMMERCIAL-REFERENCE.md#acc-007) apply.

**Acceptance.**
1. Submit a $6,000 cart above a purchaser limit, complete two approvals, revise quantities and require fresh approval.
2. Delegate an absent approver and prove a lower-rights buyer cannot bypass the route.

### Catalogs and merchandising

#### CAT-001 — Private account assortments

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Only active SKUs and agreed prices assigned to the signed-in account appear in its catalog or ordering responses. Another account cannot retrieve hidden SKUs, prices or the inventory authority credentials by guessing identifiers.

**Acceptance.**
1. Sign in as two buyers with different price lists and request both catalogs and direct API paths; each sees only its own priced items and no upstream credentials.

#### CAT-002 — Product discovery and media

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Buyers search SKU, barcode, product name and description, filter by category, season, availability and attributes, and inspect images, zoom, specifications and downloadable product attachments. Private media follows account permissions and search remains useful in a catalog of at least 10,000 variants: on that fixture a barcode or SKU lookup returns its variant, and a filtered search returns its first page, within 1 second at the 95th percentile. Price, variant-attribute or Pier-origin changes require a refresh. Responses name their observation time and neither reserve stock nor replace live commercial checks. Derived index tables are omitted from archives and explicitly rebuilt after restore.   Before shipping, classify its product-media bytes, metadata, holds and processor custody in DATA-003’s explicit review and deletion report. The detailed formats and commercial boundaries in [the CAT-002 reference](docs/COMMERCIAL-REFERENCE.md#cat-002) apply.

**Acceptance.**
1. Load a 10,000-variant wholesale assortment fixture, find a known SKU by barcode within 1 second and by attribute filters, view its images and spec sheet, and refuse the same private attachment from an unentitled buyer.

#### CAT-003 — Digital line sheets

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Merchandisers assemble seasonal visual line sheets with product variants, wholesale prices and, where the sheet is set to show them, suggested retail prices (PRI-008), packs, availability and ship windows. Each sheet chooses wholesale only, retail only or both. Buyers add lines directly to a cart; account-scoped sharing and PDF downloads retain the recipient price book, price display setting and revision. Sending a sheet to many buyers at once, with segments, suggested-products order forms and campaign tracking, is CAT-011. A sheet's downloadable order form inherits ORD-001's cart preview (aliases, duplicates, hidden SKUs, PRI-003 corrections, explicit merge or replace) before it ships. Before it ships, this clause adds line-sheet opens, views and items viewed per buyer to RPT-002’s report. The detailed formats and commercial boundaries in [the CAT-003 reference](docs/COMMERCIAL-REFERENCE.md#cat-003) apply.

**Acceptance.**
1. Publish a spring line sheet showing wholesale and MSRP to one account and a wholesale-only sheet to another account with different prices, order from each on a phone and export each account PDF.
2. Each page and PDF shows exactly its configured price columns; a revoked share cannot expose the sheet or another account price.

#### CAT-004 — Shoppable lookbooks and presentations

*Tier:* Core

**Requirement.** Staff combine editorial images, video, product hotspots and collections into branded lookbooks and rep presentations. Every hotspot opens an eligible live product and ordering respects current commercial rules even when the presentation is older. Before it ships, this clause adds lookbook and presentation opens, views and items viewed per buyer to RPT-002’s report. PRI-008’s per-surface wholesale/retail/both display, exact optional variant MSRP and margin semantics apply to this surface before it ships.

**Acceptance.**
1. Create a lookbook with a video and three hotspots, share to an approved buyer, retire one SKU and order from the remaining two; the retired item is clearly unavailable and historical presentation does not bypass pricing.

#### CAT-005 — Branded responsive storefront

*Tier:* Core

**Requirement.** A wholesaler configures its logo, colors, domain, collections and navigation for a trade storefront with sign-in, clear support contact and account-aware merchandising. Responsive layout preserves shopping and checkout on desktop and phone. PRI-008’s per-surface wholesale/retail/both display, exact optional variant MSRP and margin semantics apply to this surface before it ships.

**Acceptance.**
1. Configure a brand, sign in and complete a representative cart at 1440px and 390px.
2. Logo, navigation, prices, validation and the final confirmation remain readable and operable.

#### CAT-006 — Multiple brands and buying profiles

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-ROLE-001

**Requirement.** One installation can present separate branded storefronts, assortments and price books while an authorized buyer switches purchasing profiles deliberately. Legal seller, currency, permissions and order ownership remain visible and a cart cannot accidentally mix sellers. Additional brands inherit PRI-001: explicit ISO currency labels and exact integer minor units without conversion by relabeling; whole-unit quantities × integer cents need no rounding. The detailed formats and commercial boundaries in [the CAT-006 reference](docs/COMMERCIAL-REFERENCE.md#cat-006) apply.

**Acceptance.**
1. Configure two brands and a buyer approved for one, refuse the other brand, then approve a second profile and switch.
2. Each cart, invoice and export names the correct seller and ISO currency, retaining exact integer minor units without conversion by relabeling.

#### CAT-007 — Style color size and assortment matrices

*Tier:* Core

**Requirement.** Products support style/color/size variants, barcodes, images, size runs and fixed assortment packs. A matrix order resolves into exact variant SKUs, with variant-specific stock and minimum rules rather than a single ambiguous style quantity. Wholesale price and MSRP may differ per size within one style (for example extended sizes), and the matrix shows each size's price. The detailed formats and commercial boundaries in [the CAT-007 reference](docs/COMMERCIAL-REFERENCE.md#cat-007) apply.

**Acceptance.**
1. Order a size run that includes a higher-priced extended size and a case assortment through a line-sheet matrix, inspect exact SKU quantities and per-size prices in the order and inventory handoff, and reject an unavailable size without silently reallocating it.

#### CAT-008 — Season and catalog publishing

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003

**Requirement.** Merchandisers stage imports and edits, preview an account view, schedule effective seasons and retire products without losing historical lines. Retiring or canceling a product that still sits in open orders goes through the ORD-016 preview rather than leaving those orders unchanged. Published revisions and archived media references remain identifiable on orders and presentations. Before it ships, this clause adds the season dimension to RPT-001’s sales report.

**Acceptance.**
1. Stage next-season products, preview as a named buyer, publish at its effective date and archive a prior style.
2. New orders use the new assortment; prior orders keep their original SKU description.
3. Retiring a style with an open order opens the ORD-016 preview for it.

#### CAT-009 — Bulk product and catalog maintenance

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-3

**Requirement.** The supplier owner and admin authority used for variant attributes also controls catalog workbooks. Barrow maintains SKU-bound metadata, category and assortment labels, variant attributes and existing sanitized private JPEG references. Assortment labels grant no buyer access. Source SKU, name, barcode and stock stay owned by Pier; a proposed change is refused and routed to the connected Pier app. Per-currency sums are explicitly empty when the workbook supplies no financial columns. Authorized staff import and export catalog spreadsheets with SKU/variant keys, attributes, media references, categories and assortment assignments. Preview identifies invalid rows, duplicated variants and removed listings before explicit apply. The selected ERP may remain the product authority.

**Acceptance.**
1. Preview a product workbook containing a duplicate barcode and broken media reference, correct it, apply and export.
2. A source-owned field edit is refused or explicitly routed to that source.

#### CAT-010 — Bulk image upload and naming rules

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Authorized staff drag in batches of up to 1,000 product images, or a zip archive, at once. A configurable naming rule (for example style + color + position suffix, or barcode + position) links each file to its style, color or variant and image slot. Preview lists matched files with their target and position and unmatched files with the reason: unknown style, malformed name, unsupported type or oversize. Unmatched files are held and attach automatically when a matching product is imported later. Re-uploading a file for the same slot replaces it in place, one image per slot, and identical content is stored once. Images are private media under CAT-002 permissions and flow to line sheets, lookbooks, PDFs and the rep app's offline cache.

**Acceptance.**
1. Configure a style_color_position rule and drag in a batch that includes a misspelled filename and an image for a style not yet imported, then import that style and re-upload one image.
2. Matched files attach to the right variant and position, the misspelling is listed with its reason, the held file attaches after the import, and the re-upload replaces its slot without a duplicate.
3. Under RL-2’s image-custody boundary: owner or admin only; baseline or progressive RGB or grayscale JPEG only, at most 200 KiB; metadata removed before hashing; bytes stay in this installation’s D1 and archives, no independent media download and no external processor.
4. Unknown valid JPEGs retain bytes; malformed, unsupported and oversize files retain only filename and reason.
5. Later imports fill empty slots only; occupied slots require explicit re-upload.
6. Batches accept up to 1,000 files within 30 MiB, with ZIP input bounded to 20 MiB; larger aggregate batches remain unproved.
7. Broader CAT-002 buyer media entitlement, all-slot line-sheet and PDF delivery, CAT-004 lookbooks, REP-007 offline cache, DATA-001 complete media manifests and DATA-003 explicit media review, holds and erasure remain.
8. DATA-004 malware screening requires an owner-provisioned scanner and Base adapter; no malware verdict is claimed. No DONE claim.

#### CAT-011 — Line sheet group sends and campaigns

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-ROLE-001

**Requirement.** From a published line sheet, lookbook, custom product list or working order, an authorized user (within ACC-005 role rights and ACC-006 rep assignment) sends it to many buyers in one action. Recipients are individual approved buyers or a saved segment defined by ACC-004 and ACC-006 attributes: channel, territory, assigned rep, season activity, last-season order value or tag. A segment resolves at send time to approved buyers only; pending, declined, held and closed accounts are excluded and listed as excluded with the reason. The user writes a subject and message, can attach each recipient's own priced PDF or XLSX, and can choose to send a suggested-products order form: pre-filled lines and quantities the buyer adjusts and confirms through the normal cart under PRI-007 and ORD-015 rules. The user can send a test to themselves, save the send as a draft and schedule it. Each recipient gets a personal link delivered through INT-015 that is priced and scoped to their own account. Opening it requires that buyer's sign-in or a single-account signed token, so a forwarded link never shows another account's prices. Delivery, bounce and suppression state is kept per recipient. The send is kept as a campaign record with delivered, bounced, suppressed, opened, viewed and ordered counts and order value per recipient; orders are attributed to it under RPT-002's rules. Resending a campaign reaches only recipients who have not yet received it, and adding accounts to it sends only to the new ones. Reps do the same for their assigned accounts from the rep app (REP-001). Before it ships, this clause adds per-send delivered, opened, viewed, ordered and order value to RPT-002’s report, attributing an order only when it was placed from the campaign’s link or form.

**Acceptance.**
1. Build a segment of 30 accounts across two price books that includes one pending account, one closed account and one suppressed email address.
2. Send a spring line sheet to it as a suggested-products order form with a PDF attached, after a test send and a saved draft.
3. Exactly 28 sends go out, the pending and closed accounts are listed as excluded and the suppressed address is reported as suppressed.
4. Open the link as buyers from each price book: each sees only their own prices on the page and in the PDF.
5. Forward one link to a buyer at another account, who gets no access to the first account's prices.
6. Place two orders from the form: the campaign shows 28 delivered, the opens and views, and 2 orders with their value.
7. Resend the campaign: no new email reaches any of the 28 recipients.

### Commercial pricing

#### PRI-001 — Negotiated USD price books

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003

**Requirement.** US accounts receive negotiated price books in USD with exact integer minor units, visible currency and documented rounding. Integer-cent prices multiplied by whole-unit quantities require no rounding; screens label the ISO currency code. New orders record their price book’s ISO currency (USD by default, with explicit CAD books under PRI-008); orders without a currency field are legacy AUD and retain that label and their cents through restore. Existing AUD orders retain their original currency; currency is never inferred from a dollar symbol or converted by relabeling an amount. PRI-008 adds optional suggested retail prices (MSRP) per currency beside the wholesale price and inherits these exact-cent and visible-currency obligations before it ships. CAT-006 and PRI-006 inherit them for additional brands and currencies.

**Acceptance.**
1. Assign different USD prices to two accounts, prepare orders and compare checkout, invoice and exported cents.
2. Restore a legacy AUD order and show AUD unchanged.

#### PRI-002 — Quantity breaks and account discounts

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001

**Requirement.** Price books express volume or graduated breaks, account/group discounts and approved overrides with an explicit precedence and effective period. Cart and quote explain which rule won; changing quantity recomputes the full eligible total before approval. The detailed formats and commercial boundaries in [the PRI-002 reference](docs/COMMERCIAL-REFERENCE.md#pri-002) apply.

**Acceptance.**
1. Price quantities just below and above a volume break, combine an account discount and a negotiated override, and verify the displayed rule and exact total survive the order snapshot.

#### PRI-003 — Case packs minimums and increments

*Tier:* Core

**Requirement.** Merchants set SKU minimums, order-value minimums, case-pack multiples and allowed increments, including per-split minimum policies. Invalid quantities receive an explanation and an explicit suggested correction; no import silently inflates a buyer commitment. The detailed formats and commercial boundaries in [the PRI-003 reference](docs/COMMERCIAL-REFERENCE.md#pri-003) apply.

**Acceptance.**
1. Enter below-minimum and non-case quantities in the cart, CSV and API, then split a valid order.
2. Each door enforces the configured rules and requires the buyer to accept any corrected quantities.

#### PRI-004 — Unit of measure pricing

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Buyers select allowed each/case/pallet or measured units with exact conversions, price basis, pack contents and stock deductions. Mixed units cannot create fractional cases accidentally and invoice lines name both ordered units and base units. The current account price is per one Pier stock unit; optional, case-sensitive selling-unit definitions add a distinct code, exact base-quantity conversion, integer USD-cent price and pack contents. Counts, including case and pallet, are whole units. Explicit measured units accept positive quantities and conversions with up to six decimal places and at most 1,000,000; conversions requiring finer base precision or exceeding the inventory authority range are refused. Each measured line rounds once to the nearest cent, exact half cents up, and the order adds those integer line cents. Combined base quantities per SKU enforce minimums and stock and become one Pier reservation line per item. Orders and invoice CSV retain ordered unit, conversion, base unit/quantity, pack contents and line-price basis; old records leave unrecorded unit labels absent. Draft editing and ORD-003 reorders preserve separate SKU/unit lines and revalidate current conversions and prices; issued snapshots never change. Later order doors in ORD-001, ORD-002, ORD-004, ORD-008, ORD-009, ORD-013, ORD-014, REP-002 and INT-012 inherit these unit and price-basis obligations before shipping.

**Acceptance.**
1. Order two cases of 12 and six each of one SKU, inspect 30 base units in the handoff and the correct separate invoice bases, and reject an undefined unit conversion.

#### PRI-005 — Bundles and wholesale promotions

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Staff create fixed bundles, mix-and-match offers and time-limited promotions with eligible accounts, SKU groups, redemption rules and stacking precedence. Preview exposes the discount and margin impact; returns reverse only the original applicable discount. Before it ships, this clause adds promoted orders, their promotion discounts and results net of returns to RPT-002’s report, with the attribution rule shown.

**Acceptance.**
1. Combine eligible styles to qualify for a mix-and-match promotion, remove one, apply a nonstackable discount and return part of the bundle.
2. Totals and credits follow the published rule once.
3. supplier owners and admins publish dated offers for explicit accounts and SKU sets.
4. Fixed bundles require every configured base-unit quantity; mix offers require a combined base-unit threshold.
5. Each qualified offer redeems once per order against all eligible units.
6. Highest priority wins, with offer ID breaking ties: an exclusive winner replaces account and group discounts and excludes other offers; otherwise stackable offers apply sequentially to remaining cents.
7. Approved overrides and negotiated quotes are excluded.
8. Preview shows the current account total, offer basis, discount, final cents and margin against an explicit supplier-entered scenario cost, never inferred inventory cost. Draft replacements and submitted quantity revisions requalify the whole basket; submission and supplier approval refuse stale promotion prices. Approved lines freeze offer IDs, names, original basis, discounts and net cents. PAY-010 credits only the original net line value against a real Pier receipt, once per receipt, without retroactive requalification; the final returned unit receives remaining rounding cents. RPT-002 counts placed, uncancelled promoted orders once by preparation date, account and currency, using frozen offer attribution and original net values less cumulative Pier returns. Per-offer rows overlap for stacked offers; summary totals count each order once. Product, rep and cohort comparisons use the same scope. Unavailable Pier returns show unknown, never zero.

#### PRI-006 — Effective prices and additional currencies

*Tier:* Core · *Cites:* BASE-INPUT-003

**Requirement.** Merchants schedule price-book revisions and, after the USD default, offer explicit CAD/EUR/GBP books where enabled. One order has one explicitly labeled ISO currency; all prices and totals retain exact integer minor units (whole-unit quantity × integer cents requires no rounding), taxes and provider collections use it, and reports disclose their recorded USD conversion basis rather than rewriting transaction amounts.

**Acceptance.**
1. Schedule a future USD revision, quote before and after it, then place a CAD order through a compatible payment sandbox.
2. All documents keep the agreed ISO currency and original integer minor units and the report shows its dated USD conversion; whole-unit quantities × integer cents need no rounding.

#### PRI-007 — Explainable commercial validation

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-ROLE-001

**Requirement.** The server revalidates account entitlement, price revision, minimums, units, stock freshness, credit, tax and shipping before acceptance. Buyers see each blocking rule and whether a manager can approve an exception. Stale client totals and agent-provided prices cannot become authoritative. The detailed formats and commercial boundaries in [the PRI-007 reference](docs/COMMERCIAL-REFERENCE.md#pri-007) apply.

**Acceptance.**
1. Alter client and agent totals and prices, refuse invalid units, packs and minimums, change a price after drafting and submit through the public API.
2. Recheck live stock and refuse an unavailable/revoked source; a supplier reservation shortfall stays visible and cannot invoice.
3. Exercise freshness refusal, refresh and a supplier-only reasoned exception, and inspect its audit.

#### PRI-008 — Suggested retail prices and price display

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003

**Requirement.** Price books retain exact integer minor units and explicit ISO currency labels under PRI-001, and carry an optional suggested retail price (MSRP) per variant and currency next to the wholesale price; it is imported, edited and exported with the price book and may differ by size. Merchants choose for each line sheet, lookbook, storefront and document type whether buyers see wholesale, retail or both, and where both show, the buyer sees the margin between them. MSRP is informational only: it never feeds cart, quote, tax, invoice, payment or commission totals, and a missing MSRP shows as absent rather than derived from wholesale. The detailed formats and commercial boundaries in [the PRI-008 reference](docs/COMMERCIAL-REFERENCE.md#pri-008) apply.

**Acceptance.**
1. Import a price book with wholesale and MSRP columns in USD and CAD, publish one line sheet showing both prices and one showing wholesale only, and open each as its buyer on the page, PDF, order confirmation (ORD-014) and order CSV.
2. Each shows exactly the configured columns and ISO currency with exact integer minor units, the displayed margin matches the two prices, and every order total equals the wholesale lines alone.
3. Whole-unit quantities × integer cents require no rounding.

### Buying quoting and order lifecycle

#### ORD-001 — Quick order and CSV cart upload

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003

**Requirement.** Buyers and reps add lines by SKU or barcode, paste quantities and upload a CSV with SKU/barcode and quantity. A buyer can also download the working cart as a spreadsheet order form, fill it in offline and upload it back through the same preview. Preview resolves aliases, duplicates, packs, hidden SKUs and errors before replacing or merging a cart by explicit choice. Valid lines are not quietly lost. Uploaded and offline-form quantities inherit PRI-003's case-pack, increment and minimum refusal with explicit corrections. The detailed formats and commercial boundaries in [the ORD-001 reference](docs/COMMERCIAL-REFERENCE.md#ord-001) apply.

**Acceptance.**
1. Upload a real-shaped 80-line CSV with a duplicate, unknown SKU and invalid case quantity; review and correct errors, choose merge, and compare every accepted line and total in the prepared draft.
2. Add lines by SKU and by scanned barcode, and see unknown, archived and unlisted SKUs refused alike.
3. Download the cart's style-by-size order form, fill it offline and upload it: the preview shows exactly the filled quantities.

#### ORD-002 — Saved shopping lists

*Tier:* Core · *Cites:* BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Company buyers save, name, share and duplicate lists for stores, recurring assortments and projects. Lists store desired SKUs and quantities rather than frozen commercial promises; adding a list to a cart rechecks current price, stock and pack rules.  The detailed formats and commercial boundaries in [the ORD-002 reference](docs/COMMERCIAL-REFERENCE.md#ord-002) apply.

**Acceptance.**
1. Save and share a store replenishment list, change one price and discontinue one SKU, then add it to a cart as another authorized buyer.
2. Show current totals and explicit exceptions without exposing another company list.

#### ORD-003 — Reorder from history

*Tier:* Core

**Requirement.** Buyers find prior orders by PO, date, SKU and delivery location, then reorder all or selected lines. Current availability, replacement SKUs, prices and minimums are compared with the original and require acknowledgment of material differences. A delivery location is the order’s user-entered label and, where the account keeps ACC-003 locations, its copied ship-to (format checked, not USPS-verified); history search matches either, and a reorder keeps the original ship-to while it is active, otherwise the current default. Date search uses inclusive calendar-day bounds in America/New_York. Replacement SKUs are explicitly selected from the current account assortment, never guessed or silently substituted. Selected original quantities stay unchanged; insufficient stock or unmet current SKU/order minimums block the reorder rather than silently correcting quantities. The review shows original and current ISO currency, unit prices, SKU minimums, current availability, payment terms and the selected-line totals; its acknowledgment binds the original revision, current account revision and comparison fingerprint. Changed inputs require a fresh review. Acknowledgment prepares a new draft for ordinary human submission and records the original order and acknowledging person; it does not reserve stock.

**Acceptance.**
1. Open a six-month-old order, select three lines, reorder after a price and SKU change and review the difference summary before checkout; the original order is unchanged.

#### ORD-004 — Negotiated wholesale quotes

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Buyers request quotes from a cart; reps propose account-specific line prices, quantities, discounts, shipping, terms and validity dates subject to manager limits. An accepted quote converts to exactly one linked order after current stock and credit checks; expiry or revision invalidates stale acceptance. This clause inherits PRI-002 pricing precedence, date/rounding semantics, current-rule revalidation, explanations and frozen snapshots before shipping. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for discount and override approvals, including actor/source/time/revision/reason, before its capability ships. The detailed formats and commercial boundaries in [the ORD-004 reference](docs/COMMERCIAL-REFERENCE.md#ord-004) apply.

**Acceptance.**
1. Request a quote, approve a rep discount, accept it twice through buyer and API doors and inspect one order with the accepted revision.
2. Expire a second quote and refuse its acceptance.

#### ORD-005 — Quote conversation revisions and notes

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Quote threads distinguish buyer-visible messages from internal notes, retain attachments and every revision, identify who changed commercial terms, and notify the assigned buyer and rep. Approvals and acceptance bind to one version. This clause inherits PRI-002 pricing precedence, date/rounding semantics, current-rule revalidation, explanations and frozen snapshots before shipping. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for discount and override approvals, including actor/source/time/revision/reason, before its capability ships. The detailed formats and commercial boundaries in [the ORD-005 reference](docs/COMMERCIAL-REFERENCE.md#ord-005) apply.

**Acceptance.**
1. Exchange a message, add an internal margin note and revise a quote while the buyer has its old version open.
2. Notify participants, hide the internal note from buyer exports and refuse old-version acceptance.
3. AUTO-003 emails these notices to the same audiences; in-app notices are unchanged.
4. Emails contain the notice summary and authorized quote link, never the message body, internal-note text or attachment.

#### ORD-006 — Self-service checkout

*Tier:* Core

**Requirement.** Approved buyers review lines, addresses, delivery windows, freight, tax, discounts, payment choice and terms, then place an order without mandatory supplier intervention when policy permits. A held or approval-required order says what remains unresolved and never claims acceptance or payment prematurely.

**Acceptance.**
1. Complete one eligible card order and one net-terms order through the buyer storefront, then attempt a credit-held order.
2. Receive clear confirmations for accepted orders and an actionable hold for the third.

#### ORD-007 — Purchase references and requested dates

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Orders retain buyer PO number, buyer SKU aliases, requested delivery date, cancel-after date, instructions and supporting PO attachment. Duplicate PO detection is account-scoped, supports intentional releases and asks for confirmation instead of creating accidental repeat orders. The detailed formats and commercial boundaries in [the ORD-007 reference](docs/COMMERCIAL-REFERENCE.md#ord-007) apply.

**Acceptance.**
1. Submit the same company PO twice, refuse the accidental duplicate, authorize a numbered release and inspect date and attachment fields in the order and ERP handoff.

#### ORD-008 — Seasonal prebooks and ship windows

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Buyers order future seasons and preorder inventory against published opening/closing dates, minimums, deposits and promised ship/cancel windows. Prebook quantities and available-now stock are distinguished, capacity is checked with the inventory authority and later releases remain linked to the original commitment. Before it ships, this clause takes over ordering into future ship windows against STK-002’s incoming supply, which is distinguished from received stock. Before shipping, this clause adds its release-level commitments and recorded promise-change history to RPT-003. Before it ships, this clause shows prebooks as their own rows in RPT-001’s sales report. The detailed formats and commercial boundaries in [the ORD-008 reference](docs/COMMERCIAL-REFERENCE.md#ord-008) apply.

**Acceptance.**
1. Place a spring prebook with two ship windows and a deposit, close the season, release the first window and backorder a delayed style.
2. Buyer and operations see committed, released and outstanding quantities separately.

#### ORD-009 — Backorders and shipment splits

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-1, D-2

**Requirement.** Buyers choose ship-complete, partial shipment or permitted backorder policies with explicit freight and billing consequences. Accepted lines may split into dated releases; shipped, allocated, backordered and canceled quantities reconcile to the original and exceptions need a named owner. Canceling a remaining release inherits STK-004's acknowledged release and held-until-confirmed promise. Each split release inherits PRI-003's quantity rules, with any per-split minimum policy stated before splits ship.   Before it ships, this clause takes over ordering into future ship windows against STK-002’s incoming supply, which is distinguished from received stock. Before shipping, this clause adds its release-level commitments and recorded promise-change history to RPT-003. Before shipping, retain REP-004 original commission attribution on release splits and earn/reverse only the eligible quantity once.

**Acceptance.**
1. Accept ten cases with six available now and four next month, choose a split, ship six and cancel one remaining case.
2. Order, invoices, freight and stock authority agree on six shipped and three outstanding.

#### ORD-010 — Immutable agreed order snapshots

*Tier:* Core · *From:* ORD-010, BAR-002 · *Cites:* BASE-DATA-001, BASE-ROLE-001

**Requirement.** Prepared orders retain customer reference, exact line quantities and prices, terms and preparing identity; submitted and approved orders retain those people and dates. Editing current account prices cannot rewrite the agreed order or stable invoice export. Orders retain exact price, currency, terms and human approval snapshots, and send one durable idempotent command to the chosen inventory authority. Pier remains authoritative when selected. Shortfalls remain explicit and cannot become fully fulfilled invoices; invoicing a permitted split names only its allocated or shipped units. USD integer cents are the US default; legacy AUD records retain their currency. Tax, shipping and collection extend this order record through the clauses below rather than remaining exclusions. The detailed formats and commercial boundaries in [the ORD-010 reference](docs/COMMERCIAL-REFERENCE.md#ord-010) apply.

**Acceptance.**
1. Prepare, submit and approve through buyer/supplier HTTP doors, change the account price and terms, then download twice.
2. Original prices, total, terms, reference and approval identities remain unchanged.
3. Prepare and approve a USD order, lose the inventory response and repeat the command; inspect one external reservation, an explicit shortfall, and an invoice limited to eligible quantities.
4. Change current prices afterward and download again: the issued snapshot and currency are unchanged.
5. Repeat for a legacy AUD record.

#### ORD-011 — Order changes and cancellation

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Edits reach a submitted or accepted order from two doors until the disclosed fulfillment cutoff. Buyers request edits or cancellation themselves. Sales staff start edits on the buyer's behalf, for example after a phone call, within their ACC-005 role and amount limits. Either door can change line quantities, add or remove lines, move ship and cancel windows, and change ship-to and PO. Every edit shows a before/after diff and obtains any required commercial approval. It then coordinates the inventory release or reallocation (STK-004), tax recalculation, payment authorization and deposit adjustment (PAY-003), and sends one edit handoff to the inventory/ERP authority (STK-003, INT-020). The result is one new ORD-014 revision carrying exactly that diff. A staff edit notifies the buyer with the revision (AUTO-004). Where ORD-015 or account policy marks the change as material, the order is held until the buyer accepts the new revision. Shipped units cannot be canceled or edited. Before shipping, this clause adds its revision and promise-change history to RPT-003. Before shipping, retain REP-004 frozen attribution and original discount basis through revisions, applying exact commission differences once rather than earning the whole order again. The detailed formats and commercial boundaries in [the ORD-011 reference](docs/COMMERCIAL-REFERENCE.md#ord-011) apply.

**Acceptance.**
1. As a buyer, request a quantity reduction after acceptance but before picking, approve it, release stock and adjust the charge once.
2. Refuse cancellation of already shipped lines and offer a linked return request.
3. As a sales coordinator, move another accepted order's ship window and reduce one size.
4. Revision 2 shows only that diff, the inventory authority receives one edit, and the buyer gets one change notice.
5. On a terms-required account the edited order holds until the buyer re-accepts.
6. A rep without edit rights and an edit past the cutoff are refused.

#### ORD-012 — Buyer order status and confirmations

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-ROLE-001

**Requirement.** An account-scoped timeline shows submitted, approval pending, accepted, held, backordered, allocated, shipped, delivered, returned and closed states with source timestamps, documents and owner. Confirmations and change notices identify the exact order revision; unknown upstream state stays unknown. The detailed formats and commercial boundaries in [the ORD-012 reference](docs/COMMERCIAL-REFERENCE.md#ord-012) apply.

**Acceptance.**
1. Follow a real-shaped order through acceptance, split shipment and delivery via connected events, open its timeline as the buyer and verify the confirmation, tracking and exception state.
2. Another buyer cannot read it.

#### ORD-013 — Multi-location orders and release groups

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** A purchaser can allocate one buying session across authorized ship-to locations and delivery windows, seeing separate freight/tax and minimums before confirming a linked group of orders. Partial failure reports which releases were accepted; retry cannot duplicate accepted children. This clause owns ORD-001's multi-delivery order form: per-delivery ship window, PO and ship-to columns, uploaded through ORD-001's preview and shown as one release per delivery with its quantities, PO and location before confirming.   Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before shipping, preserve REP-004 frozen commission attribution across locations/releases and assert exact eligible earning quantities without duplication.

**Acceptance.**
1. Split one assortment across three stores and two delivery windows, fail one inventory handoff and retry.
2. Inspect one accepted child per intended release with correct addresses, totals and group reference.
3. Download a matrix order form, fill sizes for two deliveries with different POs and ship-tos, and upload it: the preview shows two releases with the right quantities, POs and locations.

#### ORD-014 — Order confirmation documents

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Every submitted, accepted and revised order produces a numbered order confirmation PDF and CSV with seller and buyer identity, PO, bill-to and ship-to, product images, style/color/size quantities, wholesale prices and, where configured, MSRP (PRI-008), ship and cancel windows, payment terms, the attached sales-terms version and its acceptance or signature record (ORD-015). Each revision is a separate document; earlier revisions stay downloadable, and the confirmation email links or attaches the exact revision. ORD-017 governs named export layouts and ORD-018 governs combined production exports. Each confirmation revision appears on ORD-012's order timeline. The detailed formats and commercial boundaries in [the ORD-014 reference](docs/COMMERCIAL-REFERENCE.md#ord-014) apply.

**Acceptance.**
1. Submit a matrix order with two ship windows, download its confirmation PDF and CSV as buyer and rep, revise one quantity and download again.
2. Both revisions are retained and differ only in the changed line, each names its terms version and acceptance, and another buyer is refused.

#### ORD-017 — Named confirmation export layouts

*Tier:* Core · *From:* ORD-014 · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Brand admins keep several named export layouts with ordered columns and per-variant or matrix shape, choose the default and let staff select a layout. INT-020 uses the same persisted layout identity and order for ERP files. The layout and currency rules in the [ORD-017 reference](docs/COMMERCIAL-REFERENCE.md#ord-014) apply.

**Acceptance.**
1. Save a second export layout, set it as default and download again: the CSV follows the new layout.

#### ORD-018 — Bulk confirmation and production exports

*Tier:* Core · *From:* ORD-014 · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Staff select orders by filter or individually, choose an exact retained confirmation revision for each, and export one spreadsheet per line or totaled by style, color and size for production and cutting plans. Every row names its source order and revision; amounts never mix currencies. The selection and total rules in the [ORD-014 reference](docs/COMMERCIAL-REFERENCE.md#ord-014) apply.

**Acceptance.**
1. Select 50 orders from one season and export them in one file per line and totaled by style, color and size: the totals equal the sum of the selected orders' lines.

#### ORD-015 — Versioned sales terms and buyer acceptance

*Tier:* Core

**Requirement.** Merchants publish versioned sales terms and conditions (cancellation, returns, chargebacks, minimums and deposits) as text or PDF and assign a version per account, brand or season, separately from payment terms and portal usage terms. Where an account requires acceptance, checkout refuses submission until the buyer accepts the current version, and a rep order captures the buyer's on-device signature and printed name, offline included. Each order records who accepted which version, how and when. A later version never changes an accepted order; it applies to new orders and to material revisions, which require fresh acceptance. The detailed formats and commercial boundaries in [the ORD-015 reference](docs/COMMERCIAL-REFERENCE.md#ord-015) apply.

**Acceptance.**
1. Assign terms version 1 to an account that requires acceptance, attempt submission without accepting (refused), accept as the buyer and submit, then submit a rep order with signature capture.
2. Publish version 2: both orders keep version 1 and its acceptance record in their confirmation PDFs, and the next order requires version 2.

#### ORD-016 — Canceled styles across open orders

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** When production drops a style, color or size, an authorized sales manager marks it canceled for a season or delivery window. Barrow then flags every open order and prebook that contains it, unshipped units only. The Orders page shows a preview with the affected units and wholesale value per order and per account, and totals across them. From the preview, staff choose Drop All, drop from selected orders, or offer a STK-005 substitute on selected orders. Each affected order then gets exactly one ORD-011 revision, one stock release or reallocation request (STK-004) and one deposit, credit or payment-authorization adjustment (PAY-003, PAY-010). It also gets one buyer notice (AUTO-004) naming the dropped lines and any substitute offer. Shipped and invoiced units are never touched; minimums broken by the drop are flagged for review rather than silently enforced. The drop runs under one idempotency key, so replaying or resuming it changes nothing already applied, and a partial failure lists exactly which orders are still pending. CAT-008 retirement of a product that still sits in open orders routes through this preview. Before shipping, reverse REP-004 only the cancelled original merchandise commission under its frozen splits and retain attributed source adjustments without duplicate reversals.

**Acceptance.**
1. Cancel a style that sits in 25 open prebooks across 20 accounts, one of them partly shipped.
2. The preview lists all 25 orders with units and value.
3. Drop All creates 25 revisions, each with one stock release request; the shipped units stay on the partly shipped order.
4. Deposits are adjusted once, and each of the 20 buyers gets one notice.
5. Interrupt the run after 10 orders and resume, then replay the drop: no order gets a second revision, release or notice.
6. Offer a substitute on two other orders instead and see each buyer's accept/decline under STK-005.

### Stock promises and fulfillment handoff

#### STK-001 — Live customer-visible availability

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** The catalog reads current promiseable quantities from Pier and validates them when preparing a draft. It exposes observation time and account-priced items without leaking the upstream business state. Missing or revoked connection authority prevents a fabricated stock promise.

**Acceptance.**
1. Read an account catalog against real Pier stock, exhaust a SKU and attempt an over-order.
2. Confirm the available quantity, server refusal and no stock effect from draft preparation.

#### STK-002 — Available to promise by warehouse and date

*Tier:* Core · *Cites:* BASE-INPUT-003

**Requirement.** Connected inventory adapters, or scheduled ATS files through the INT-020 flat-file feed, provide warehouse-specific sellable stock, reserved quantities, incoming receipts and available-to-promise dates where the source supports them. The portal labels source, freshness and unknown dates, respects account warehouse rules and blocks acceptance on stale promises under merchant policy. Incoming supply is shown against the requested delivery date but never counted as promiseable, since Pier holds hard reservations against received stock; ordering into a future window is ORD-008's prebooks and ORD-009's backorders. Merchant policy: an owner/admin sets a stock freshness limit in whole minutes (1 to 10,080; unset = no limit, the default). When Pier cannot be reached nothing is promised and no draft can be prepared. Allocation by warehouse at reservation belongs to the inventory adapters that support it (INT-001, INT-004 through INT-010, INT-020), each inheriting these labels, the account warehouse rule and the freshness policy before it ships. The detailed formats and commercial boundaries in [the STK-002 reference](docs/COMMERCIAL-REFERENCE.md#stk-002) apply.

**Acceptance.**
1. Connect two Pier warehouses and a committed PO with a later promise date, compare immediate stock by warehouse with incoming supply, and see an order beyond received stock refused.
2. Limit an account to one warehouse and see only its stock promised.
3. Set a 15-minute limit and attempt to submit a draft observed 20 minutes ago: the stale source is shown, and only a valid refresh or a recorded supplier exception lets it submit.
4. With Pier unreachable, nothing is promised.

#### STK-003 — Durable order acknowledgment

*Tier:* Core

**Requirement.** Each accepted order has one external handoff identity, an acknowledged source order ID and reconciliation state. Timeouts remain pending rather than successful, retries reuse the same identity, and a changed destination cannot accept an old order accidentally. This applies to every inventory adapter and to INT-020 order files, whose processed acknowledgment closes the handoff. The detailed formats and commercial boundaries in [the STK-003 reference](docs/COMMERCIAL-REFERENCE.md#stk-003) apply.

**Acceptance.**
1. Drop an acknowledgment after the inventory system creates its order, retry, and reconcile by external key.
2. Inspect one upstream order and the retained acknowledgment; change the configured destination and refuse the old-order handoff.

#### STK-004 — Reservation release and stock exceptions

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Inventory remains authoritative for reserving, expiring, releasing and reallocating stock. Barrow requests these effects for cancellations, approval expiry and substitutions, tracks acknowledgments and prevents an unconfirmed release from appearing available to other buyers. The detailed formats and commercial boundaries in [the STK-004 reference](docs/COMMERCIAL-REFERENCE.md#stk-004) apply.

**Acceptance.**
1. Cancel an allocated unshipped order, lose the release response and repeat it.
2. The authority releases once; Barrow clears the exception only after confirmation and shows the correct remaining promiseable stock.

#### STK-005 — Buyer-approved substitutions

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Staff propose substitute SKUs or sizes with price, unit, delivery and tax differences. The buyer accepts the exact proposed revision unless a documented account policy already grants that authority; original and substitute lines remain linked for fulfillment and credits. Any release or reallocation a substitution triggers inherits STK-004's durable release identity, held-until-acknowledged promise and shipped-unit refusal before it ships. The detailed formats and commercial boundaries in [the STK-005 reference](docs/COMMERCIAL-REFERENCE.md#stk-005) apply.

**Acceptance.**
1. Short a discontinued style, propose a differently priced replacement, decline once then accept a revised offer.
2. Only the accepted quantity and price reach inventory, and the original shortfall remains traceable.

### Field sales and mobile

#### REP-001 — Assigned-account rep ordering

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Reps switch only among assigned accounts, see their negotiated prices, stock, history and balances and create quotes or orders on behalf of the buyer with clear acting-as attribution. Buyer approval policies still apply; a rep cannot impersonate the purchasing approver. Reps send line sheets and suggested-products order forms to their assigned accounts through CAT-011. The detailed formats and commercial boundaries in [the REP-001 reference](docs/COMMERCIAL-REFERENCE.md#rep-001) apply.

**Acceptance.**
1. Sign in as a rep, select an assigned account and prepare an order for buyer approval.
2. Refuse another territory and show the rep plus buyer identities on the accepted order.

#### REP-002 — Offline native rep order writing

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-ROLE-001 · *Register:* R-3, R-4

**Requirement.** iOS and Android rep apps download explicitly authorized customer catalogs, media, prices and history for trade shows and travel, protect cached data with device sign-in and revoke access on the next connection. Offline drafts show their stock/price age and never claim a live reservation or settled payment. Reps scan products into drafts (REP-006), capture walk-up prospects (REP-007) and collect buyer signatures on sales terms (ORD-015) without a connection. Phone and tablet layouts are both supported; on an iPad or Android tablet in landscape the rep sees the line sheet beside the size matrix of the selected style.

**Acceptance.**
1. On both supported mobile platforms, including an iPad in landscape showing the line sheet beside the size matrix, download an assigned account, disconnect, present its line sheet and write several drafts.
2. Restart offline and recover them, then revoke the rep and reconnect to remove further access.

#### REP-003 — Offline synchronization and conflicts

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Reconnection automatically uploads each offline draft exactly once, revalidates changed prices, assortment, stock and credit and presents conflicts for rep/buyer resolution. The app shows queued, syncing, blocked and acknowledged states and retains unsent work through a crash.

**Acceptance.**
1. Write three offline orders, change one price and exhaust one SKU, reconnect with a dropped response and restart.
2. One draft synchronizes once and two show specific conflicts; no stale draft auto-submits or duplicates.

#### REP-004 — Rep commissions and attribution

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-ROLE-001

**Requirement.** Managers configure commission rules by rep, account, product and effective period, including splits, approved discounts and whether earning occurs at acceptance, shipment or payment. Returns and credits reverse the correct earned amount; statements explain each source line and export to payroll/accounting. The detailed formats and commercial boundaries in [the REP-004 reference](docs/COMMERCIAL-REFERENCE.md#rep-004) apply.

**Acceptance.**
1. Assign a split commission, accept and ship an order, record partial payment then return a line.
2. Each rep statement shows the correct earned and reversed cents and a transfer does not rewrite prior attribution.

#### REP-005 — Visits samples and trade-show selling

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Reps plan account visits and appointments, record notes and sample requests, present collections and turn a show basket into a follow-up quote or order. Tasks link to the account and owner; sample fulfillment is handed to the inventory system without maintaining another stock ledger. The detailed formats and commercial boundaries in [the REP-005 reference](docs/COMMERCIAL-REFERENCE.md#rep-005) apply.

**Acceptance.**
1. Schedule a showroom visit, record a sample request and buyer notes, prepare a quote, assign a follow-up and hand the sample to inventory.
2. The rep sees the next action and completion acknowledgment.

#### REP-006 — Barcode scanning in the rep app

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** On iOS and Android, online and offline, reps scan UPC, EAN/GTIN or merchant barcodes with the device camera or a paired Bluetooth HID scanner. Each scan resolves to the exact variant in the selected account's assortment and adds or increments its quantity in the open draft, honoring case packs (PRI-003). An unknown or out-of-assortment code shows "not found, search instead" and never adds a guessed product. The buyer web portal offers camera scanning on supported phones through the same resolution.

**Acceptance.**
1. On iOS and Android offline, scan a hang-tag UPC with the camera and another with a paired HID scanner, scan one twice and one case-pack SKU, and scan an unknown code.
2. Matched variants carry the right quantities in the open draft, the unknown code prompts search, and the draft synchronizes once on reconnection.

#### REP-007 — Trade-show prospect capture

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-ROLE-001

**Requirement.** At a show or appointment, offline included, a rep captures a walk-up prospect's company, contact, addresses, business identifier, resale certificate photo and source show, and writes a draft for it from a show assortment that exposes only the show price book. On sync the prospect enters ACC-001 review with duplicate detection against existing companies. The draft stays unsubmitted and reserves no stock until approval, then becomes the approved account's draft for buyer confirmation. A declined prospect gains no price access. Before shipping, prospects enter ACC-001’s verified application queue; certificate photos are private application documents under ACC-001’s byte, scope and custody rules.

**Acceptance.**
1. Offline, create a prospect, attach a certificate photo and write a draft from the show assortment, then reconnect.
2. The prospect lands in the ACC-001 queue tagged with its show and any duplicate, the draft remains unsubmitted with no reservation, approval turns it into the new account's draft for buyer confirmation, and a declined prospect sees no prices.

#### MOB-001 — Buyer mobile access and accessibility

*Tier:* Core · *Cites:* BASE-ACCESSIBILITY-001 · *Register:* R-1, R-2

**Requirement.** Buyers complete catalog discovery, quick orders, approval, payment and shipment tracking through the same responsive portal. A 40-line cart with a size matrix, error recovery and usable touch controls covers the same buyer journey; offline status never disguises a failed order.

**Acceptance.**
1. Use keyboard and accessibility-tree assertions through a 40-line cart with a size matrix and approval, then complete checkout and tracking on a 390px phone and 1440px desktop.
2. Check focus after validation and the visible accepted-order end state.

### Payments credit invoices and account finance

#### PAY-001 — Stripe card checkout

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-ROLE-001 · *Rules:* D-1, D-4

**Requirement.** Merchants connect their own Stripe account and collect card payments with hosted/tokenized entry, supported authentication and exact order/currency references. Authorization, capture, decline and cancellation are distinct; signed provider events and idempotency reconcile money state and never expose full card data. A merchant may add a disclosed card surcharge only where card-network rules and the buyer's state permit it, shown before payment and never applied to debit cards or ACH.  Before it ships, this clause adds unapplied card payments to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. Before it ships, this clause adds verified card-payment exceptions to AUTO-005 with source links, owner and positive resolution evidence.  Before shipping, add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed. Exact implemented semantics: the owner explicitly consents to a merchant-owned Stripe connection in the selected verified mode; encrypted connection credentials are omitted from archives. Hosted setup binds a card to one installation, account and merchant customer; a company finance buyer explicitly approves the recorded amount and disclosed surcharge before manual authorization. Only the supplier owner or admin captures or cancels with an audited reason. Provider reads and signed events bind installation, merchant, customer, order, exact amount and currency; browser return parameters never prove payment. Durable identities survive transport loss, duplicate events and inert archive restore. Only a verified US merchant, USD credit card and matching permitted billing state receive the owner-reviewed surcharge; debit, prepaid, unknown funding and prohibited jurisdictions receive none.

**Acceptance.**
1. Use Stripe test checkout for successful and declined cards and an authentication challenge, replay an event and lose a capture response.
2. The buyer sees one appropriate payment result and one reconciled charge; a configured surcharge appears for an eligible credit card and is refused for a debit card and a prohibiting state.

#### PAY-002 — Stripe ACH collection

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-MAIL-001, BASE-ROLE-001 · *Rules:* D-1, D-4

**Requirement.** US buyers authorize ACH debit with the provider mandate and bank verification flow. Pending, processing, settled, failed and returned states remain distinct; staff set fulfillment policy for unsettled funds and later returns reopen the balance without inventing settlement.  Before it ships, this clause adds unapplied ACH cash to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. Before it ships, this clause adds verified ACH-payment exceptions to AUTO-005 with source links, owner and positive resolution evidence.  Before shipping, add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed.

**Acceptance.**
1. Authorize a test bank account, submit a debit, inspect the pending statement then simulate settlement and a return.
2. Order policy, balance and buyer notification reflect each verified provider event once.

#### PAY-003 — Deposits partial payments and allocations

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-ROLE-001 · *Rules:* D-1, D-2, D-4

**Requirement.** Orders can require percentage or fixed deposits, scheduled remaining payments and partial invoice payments. Payments allocate to named invoices/releases with unapplied cash shown separately, so a deposit is neither a second sale nor a full-paid statement.   Before it ships, this clause adds deposits and partial payments with their allocations to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. Before it ships, this clause adds paid amounts, including partial payments, to RPT-001’s sales report and reduces its outstanding amounts. Before it ships, this clause adds deposits and verified partial payments to RPT-004 aging, reducing the correct invoice balances and buckets in the page and CSV with provider source IDs. Before it ships, this clause adds unresolved deposit/allocation/payment exceptions to AUTO-005 with source links, owner and positive resolution evidence.  Before shipping, add REP-004 verified partial-payment allocations to the original immutable commission lines, assert earning on payment and exact remaining/reversed cents, and export the provider source references. Before shipping, add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed.

**Acceptance.**
1. Collect a 30% deposit on a seasonal prebook, invoice two releases, apply the deposit and a partial balance payment.
2. Statement and provider references reconcile to the exact amount outstanding.

#### PAY-004 — Approved net terms and credit limits

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** Finance sets due-on-receipt or net terms, credit limit, credit currency and exposure policy covering open orders, unpaid invoices and permitted deposits. Checkout uses the connected receivables balance, shows available credit and requests approval when exposure exceeds policy.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for credit overrides, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause inherits PRI-007 credit-exposure revalidation, including exhaustion after drafting, with current blocking reasons and authorized recorded exceptions. Before it ships, ORD-004 quote acceptance runs this credit-exposure check before converting a quote into an order. Before it ships, this clause adds available credit and exposure to RPT-004 with source-linked currency amounts in the page and CSV.

**Acceptance.**
1. Give an account net 30 and a $10,000 limit, place an $8,000 order with $3,000 already owed, and block or route it for approval.
2. Record a payment and observe recalculated available credit.

#### PAY-005 — Credit holds and controlled release

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** Finance can impose overdue, manual or provider credit holds with reason, expiry and named owner. Reps and buyers see a suitable explanation and remediation request. Only authorized finance can release or override within limits, recording the decision and rechecking current exposure before acceptance.  This clause inherits DATA-002 append-only, searchable and exportable attributed credit hold/release and override decisions, with actor/source/time/revision/reason, before shipping. A hold and its release add entries to ORD-012's order timeline. Before shipping, this clause inherits PRI-007 current credit-exposure revalidation and recorded exception authority, including refusal when credit is exhausted after drafting. Before it ships, a credit hold also refuses ORD-004 quote acceptance with its explanation.

**Acceptance.**
1. Hold an overdue account, attempt checkout as buyer and rep, collect a partial payment, then release within a finance limit.
2. Refuse a rep override and invalidate a stale release if exposure changes.

#### PAY-006 — B2B pay later through Resolve

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-1, D-4

**Requirement.** Eligible merchants offer Resolve-backed B2B net terms using provider enrollment, US business verification, credit decision, available-credit and invoice/charge states. Buyer sees financing terms, fees and lender identity before consent; Barrow never grants credit or treats an application as approval.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for refund/financial adjustment decisions, including actor/source/time/revision/reason, before its capability ships. Before it ships, this clause adds verified financing/payment exceptions to AUTO-005 with source links, owner and positive resolution evidence.  Before shipping, add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed.

**Acceptance.**
1. Connect a Resolve sandbox merchant, submit eligible and declined buyer applications, accept a provider-approved order and reconcile invoice funding and repayment events.
2. A declined decision or insufficient provider credit cannot be overridden as provider approval.

#### PAY-007 — Customer account statements

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-1, D-2

**Requirement.** Buyers and authorized staff see dated opening balance, invoices, deposits, payments, returns, credit notes, unapplied cash and closing balance by currency, with source document links and downloadable PDF/CSV. Account history explains partial settlement and disputed balances. PAY-007 inherits ACC-004: holding or closing an account never removes its authorized access to existing statements.   The detailed formats and commercial boundaries in [the PAY-007 reference](docs/COMMERCIAL-REFERENCE.md#pay-007) apply.

**Acceptance.**
1. Open a statement spanning an opening balance, two invoices, deposit, partial payment and credit; compare the closing balance with the connected ledger and download it as the buyer.
2. Another company is refused.
3. Hold and then close the account and confirm that its authorized buyer can still read and download the statement.

#### PAY-008 — Invoice documents and delivery

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-1, D-3

**Requirement.** Eligible accepted releases produce stable numbered invoice records with seller/buyer identity, PO, line quantities, currency, tax, freight, terms and due dates. Buyers download PDF and CSV; the configured accounting authority controls legal issue/void state, and delivery is tracked without duplicate invoice creation.

**Acceptance.**
1. Invoice a split shipment through the connected accounting sandbox, deliver its PDF, download CSV and change the current price list.
2. Both documents retain the issued revision, correct tax/freight and one accounting invoice ID.

#### PAY-009 — Receivables aging and collections

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001 · *Rules:* D-1, D-3

**Requirement.** Finance sees current and aged receivables by due date, account, rep and disputed status, assigns collection follow-ups and schedules policy-based reminders with contact consent and stopping rules. Verified settlement, dispute or promise-to-pay changes the next action; a sent reminder alone does not close collection.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for refund/financial adjustment decisions, including actor/source/time/revision/reason, before its capability ships.

**Acceptance.**
1. Age three invoices, dispute one and record a promise-to-pay for another.
2. Run scheduled reminders, settle the third via provider event and inspect aging, recipient delivery and the remaining owned tasks.

#### PAY-010 — Credit notes and refunds

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-1, D-2, D-4

**Requirement.** Authorized finance issues linked line-level credit notes for returns, price corrections and cancellations, applies them to an invoice or initiates provider refunds under role limits. Tax and freight adjustments use the original commercial basis; failed or pending refunds remain visible and do not count as returned funds. The detailed formats and commercial boundaries in [the PAY-010 reference](docs/COMMERCIAL-REFERENCE.md#pay-010) apply.

**Acceptance.**
1. Credit a partial return, apply part to an unpaid invoice and refund the paid remainder through Stripe.
2. Replay the refund callback and verify one credit, one refund and the exact statement balance.

#### PAY-011 — Payment disputes and reconciliation

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-1, D-4

**Requirement.** Staff see card disputes, ACH returns, chargebacks and provider fees alongside the original order/invoice, submit permitted evidence through the provider and reconcile gross, fees, net and timing differences to accounting. Disputes remain distinct from product returns and do not delete the sale.  Before it ships, this clause adds disputed balances to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. Before it ships, this clause adds failed payments and disputed invoice balances to RPT-004 in the page and CSV without deleting the invoice. Before it ships, this clause adds verified payment disputes, ACH returns and reconciliation exceptions to AUTO-005 with source links and owner; reminders alone never close them.  Before shipping, add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed.

**Acceptance.**
1. Receive a Stripe test dispute and ACH return, attach delivery evidence, reconcile a payout including fees and inspect a named owner for the open disputed balance.

#### PAY-012 — Saved payment methods and consent

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** Buyers manage provider-tokenized cards and bank mandates with explicit company and location permission and consent for later charges. Staff see masked brand and last four digits and status only; removing consent blocks new off-session collections without erasing historical receipts. Card semantics: an active company finance buyer explicitly consents after Stripe-hosted card verification for the source company and exact delivery location. Each later approved invoice needs a fresh exact-amount and surcharge authorization; no schedule or automatic collection is added. Current company finance and location permission is rechecked at use. Supplier finance staff see masked records only; supplier owner or admin may withdraw consent but cannot grant buyer consent. Withdrawal fences every new saved-card authorization, including already-prepared attempts, and preserves earlier receipts. Reusable card and customer references never appear in public payment reads, commercial exports or owner archives; saved consent is excluded from restore. PAY-002 retains the bank collection dependency, and PAY-012 retains its bank-mandate obligation.

**Acceptance.**
1. Save a test payment method, authorize a later balance charge, remove consent and attempt another charge.
2. Provider tokens stay private, the new charge is blocked and old receipts remain accessible.

### US sales tax and exemptions

#### TAX-001 — Avalara AvaTax calculation

*Tier:* Core · *Rules:* D-1

**Requirement.** An Avalara AvaTax adapter calculates US state/local sales tax from seller nexus settings, product tax codes, ship-from/to, freight and account exemptions. Checkout quotes, committed invoice transactions, voids and credits retain provider IDs and explain any recalculation before buyer acceptance.  Before shipping, this clause inherits PRI-007 tax validation with current blocking reasons before acceptance. Before shipping, STK-005 substitution offers and acceptance show the source-verified tax difference on the original commercial basis; a tax unknown cannot be presented as verified.

**Acceptance.**
1. Use an AvaTax sandbox with taxable interstate and exempt orders, change the delivery address, commit an invoice and credit one line.
2. Checkout, invoice and provider transaction totals reconcile to the cent.

#### TAX-002 — TaxJar alternative tax adapter

*Tier:* Core · *Cites:* BASE-ROLE-001 · *Rules:* D-1

**Requirement.** Merchants can choose TaxJar instead of AvaTax for configured US tax calculation and transaction/refund reporting. Provider authority and jurisdiction setup are explicit, unavailable calculation blocks acceptance or requires a disclosed authorized policy, and switching providers does not rewrite issued tax.  Before shipping, this clause inherits PRI-007 tax validation with current blocking reasons before acceptance. Before shipping, STK-005 substitution offers and acceptance show the source-verified tax difference on the original commercial basis; a tax unknown cannot be presented as verified.

**Acceptance.**
1. Configure TaxJar, quote two destination jurisdictions, import a refund and interrupt the provider during checkout.
2. Refuse an invented tax amount and preserve previous invoice provider references after a switch.

#### TAX-003 — Resale certificates and exemption review

*Tier:* Core · *Cites:* BASE-INPUT-003 · *Rules:* D-1

**Requirement.** Buyers upload resale certificates with company, state, effective/expiry dates and covered locations. Staff review them, and Avalara ECM can collect and validate certificate custody. Only applicable approved exemptions affect tax; expiry requests renewal and exposes the order impact.  Before shipping, this clause inherits PRI-007 exemption validation with current blocking reasons before acceptance. Before shipping, STK-005 substitution offers preserve the original exemption basis and disclose how its verified change affects tax. Before shipping, validate and review ACC-001 application certificates; the application’s format check is not exemption validation.

**Acceptance.**
1. Upload a certificate for one state, approve it through staff review, order in covered and uncovered states and let it expire.
2. Only the eligible transaction is exempt and the buyer receives a renewal action.

#### TAX-004 — Tax corrections and audit trail

*Tier:* Core · *Cites:* BASE-DATA-001 · *Rules:* D-1

**Requirement.** Tax-relevant address, certificate, refund and line changes create linked adjustments using the selected tax provider. Issued transactions remain immutable with correction references, and finance exports the tax basis and provider response for reconciliation and advisor filing.  Before shipping, STK-005 substitution tax corrections preserve original-line linkage and disclose the verified original-to-replacement difference.

**Acceptance.**
1. Correct an address after invoice issue and return a taxable item.
2. Inspect the original plus linked correcting transaction in Barrow and the provider export; no silent mutation or duplicate refund tax occurs.

### Shipping delivery returns and service

#### SHIP-001 — Delivery methods and shipping charges

*Tier:* Core · *Rules:* D-1

**Requirement.** Merchants offer configured parcel, freight/LTL, local pickup and own-carrier-account choices by account, warehouse and order size, with handling fees, free-freight thresholds and delivery windows. Checkout shows the binding quote or marks a freight quote as approval-required before acceptance.  Before shipping, this clause inherits PRI-007 shipping validation with current blocking reasons before acceptance. Before it ships, ORD-004 quotes carry quoted shipping amounts into these charges; until then a quote records shipping as a note only. The detailed formats and commercial boundaries in [the SHIP-001 reference](docs/COMMERCIAL-REFERENCE.md#ship-001) apply.

**Acceptance.**
1. Compare pickup, UPS parcel and freight-quote orders, cross a free-freight threshold and change the ship-to state.
2. Buyer explicitly accepts the final method, cost and window before ordering.

#### SHIP-002 — EasyPost carrier connection

*Tier:* Core · *Rules:* D-1

**Requirement.** EasyPost connects USPS, UPS and FedEx accounts for eligible rates, address validation, labels and tracking; operations choose packages and service using fulfillment data from the inventory/WMS. Rate quotes are time-bound and label purchase/void requests are idempotent with provider references.  Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before shipping, STK-005 substitution offers and acceptance disclose verified carrier charge and delivery differences, retaining the exact accepted revision.

**Acceptance.**
1. Rate and purchase a sandbox UPS label, a USPS shipment and a FedEx shipment, lose one response and retry, then void an unused label.
2. Exactly one label charge occurs per purchase and the order retains tracking IDs.

#### SHIP-003 — Shipment tracking and delivery exceptions

*Tier:* Core · *Rules:* D-1

**Requirement.** Buyer timelines show each package, carrier, tracking link, shipped quantities, expected delivery and verified carrier events. Delays, failed delivery and missing tracking create owned exceptions; a label or estimated date never counts as delivery. Buyer delivery disputes remain open until resolved.  Carrier tracking and delivery events add their entries to ORD-012's order timeline with source and time before they ship. Before shipping, this clause adds verified tracking, delivery and on-time-delivery measures to RPT-003 without treating dispatch or a label as delivery. Before it ships, this clause adds source-linked delivery exceptions to AUTO-005 and closes them only on verified carrier resolution or an attributed human resolution, never a label. Before shipping, STK-005 substitution offers and timelines disclose source-confirmed delivery differences without inferring delivery from estimates.

**Acceptance.**
1. Ship two packages, send delayed and delivered carrier events out of order, then raise a missing-package report.
2. Only the truly delivered package closes and the other has an assigned follow-up.

#### SHIP-004 — Return authorizations and claims

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-1, D-2

**Requirement.** Buyers request an RMA for eligible order lines with reason, condition, photos and quantity; staff approve instructions and labels, track receipt/inspection in the WMS and decide restock, replacement or credit under policy. Neither request nor carrier receipt alone grants a credit.   Before it ships, this clause adds return credits to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. Before it ships, this clause adds source-linked unresolved return/delivery claims to AUTO-005, preserving ownership until verified or attributed resolution. Before shipping, claims and returns for STK-005 replacements retain each line’s original order/line linkage and exact accepted replacement basis. Before shipping, link REP-004 return commission reversals to the original line and frozen split, preserving the physical receipt source and avoiding a second reversal when PAY-010 credits the same return.

**Acceptance.**
1. Request a damaged-goods return with photos, approve two of three units, receive and inspect them in the connected system and issue the approved credit.
2. Remaining disputed quantity stays open and stock changes only in the authority.

#### SHIP-005 — Exchanges and service resolution

*Tier:* Core · *Rules:* D-1

**Requirement.** Buyers and staff manage shortages, defects, exchanges and replacement shipments linked to the original order and RMA. The case has an owner, response deadline and buyer-visible resolution; price differences, tax and freight are approved before the exchange order is accepted.

**Acceptance.**
1. Report a short shipment, choose a replacement of different value, approve its price difference and follow the linked shipment to delivery.
2. The original case closes only after the buyer-facing resolution is recorded.

### Connected systems and reliability

#### INT-001 — Optional Pier inventory connection

*Tier:* Core · *Cites:* BASE-ROLE-001 · *Rules:* D-1

**Requirement.** Pier is an optional stock/order authority alongside the adapters below. Its authenticated connection supplies catalog/stock and receives durable reservation commands without exposing supplier credentials to buyers. Revocation and destination mismatch remain actionable; adopting Barrow does not require adopting Pier. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report.

**Acceptance.**
1. Configure Pier, place an approved order and revoke its credential.
2. Show a failed handoff without lost orders, reconnect the same origin and reconcile it, then configure a different supported inventory authority without creating a Pier ledger.

#### INT-002 — QuickBooks Online accounting

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-4

**Requirement.** OAuth connects the merchant QuickBooks Online company, maps customers/items/tax/accounts and creates or links invoices and credit memos at the chosen billing event. Payments and balances return to Barrow; currency, periods, external IDs and duplicate prevention are visible in a reconciliation queue. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Its accounting handoffs and failures appear in OPS-001 diagnostics with a correlation ID and resume action before it ships. Before it ships, this clause adds the comparison of the closing balance with the QuickBooks ledger to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. Before it ships, this clause adds RPT-004 reconciliation of aged balances against the connected QuickBooks ledger, with differences, currency and source IDs in the page and CSV. Before it ships, this clause adds source-confirmed QuickBooks payment/reconciliation exceptions to AUTO-005 and retains ownership until acknowledged or attributed resolution.  Before shipping, add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed.

**Acceptance.**
1. Connect a QBO sandbox, invoice an order, receive a partial payment and credit a return.
2. Replay sync and inspect one invoice/credit in the correct company and an exact buyer balance; token revocation leaves actionable failures.

#### INT-003 — Xero accounting

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-4

**Requirement.** A Xero tenant connection maps contacts, items, invoices, credits and tax codes and returns payment/receivable status. Source-owned edits surface as conflicts rather than silently overwriting issued documents; account statements identify the ledger authority. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Its accounting handoffs and failures appear in OPS-001 diagnostics with a correlation ID and resume action before it ships. Before it ships, this clause adds the comparison of the closing balance with the Xero ledger to PAY-007's statement as dated rows in its view, CSV and PDF, changing the opening and closing balances and the note accordingly. Before it ships, this clause adds RPT-004 reconciliation of aged balances against the connected Xero ledger, with differences, currency and source IDs in the page and CSV. Before it ships, this clause adds source-confirmed Xero payment/reconciliation exceptions to AUTO-005 and retains ownership until acknowledged or attributed resolution.  Before shipping, add its separate provider-held copies to DATA-003’s custody report; no provider erasure is claimed.

**Acceptance.**
1. Send a net-terms order to Xero sandbox, allocate a payment in Xero, sync back and compare the buyer statement.
2. Edit an issued invoice upstream and inspect a reconciliation conflict rather than a duplicate.

#### INT-004 — NetSuite ERP

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** NetSuite connects customers, subsidiary/location, items/variants, price levels, stock/ATP, sales orders, fulfillment, invoices and payments using explicit field ownership. External IDs link every release and retry; mapping and permission failures appear with a named owner. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it.

**Acceptance.**
1. Map a sandbox subsidiary and warehouse, submit a prebook and split fulfillment, return invoice/payment states and revoke a role permission mid-sync.
2. Inspect linked records, correct balances and resumable errors.

#### INT-005 — Shopify commerce connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** A Shopify connection maps products/variants, customers/company identifiers, stock locations and wholesale orders without replacing the merchant consumer store. Existing storefront pricing/fulfillment authority is explicit; correlated orders, fulfillments and refunds synchronize without feedback loops. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it.

**Acceptance.**
1. Connect a development store, import variants and customer mapping, place a Barrow order and fulfill/refund it in Shopify.
2. See one order on each side and correct buyer status after duplicate events.

#### INT-006 — WooCommerce commerce connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** A WooCommerce connection exchanges products/variations, customers, inventory and orders through authorized REST/webhook interfaces with stable external IDs. Wholesale account pricing stays protected and returned fulfillment/refund states update the linked order without changing retail customer prices. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it.

**Acceptance.**
1. Connect a controlled WooCommerce store, import a variation, order with negotiated pricing, receive a fulfillment and refund and replay the webhook.
2. Retail prices remain distinct and no duplicate order is created.

#### INT-007 — Cin7 Core inventory connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001 · *Rules:* D-1

**Requirement.** Cin7 Core supplies product, stock, customer and price mappings and receives sales orders/releases; fulfillment, invoice and payment references return under chosen ownership. Warehouse allocations and backorders remain in Cin7 rather than a Barrow stock ledger. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it.

**Acceptance.**
1. Connect a Cin7 test company, order mixed available/backordered lines, fulfill a release and reconcile the portal timeline and source quantities.
2. Retry an acknowledgment failure without another sale.

#### INT-008 — Brightpearl inventory connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003 · *Rules:* D-1

**Requirement.** A Brightpearl adapter maps accounts, products, warehouses, price lists and sales orders and returns allocation, shipment and financial document references. Setup names ownership and shows gaps in unsupported custom fields before live ordering. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it.

**Acceptance.**
1. Map a Brightpearl sandbox account and warehouse, place an order and receive a partial shipment; inspect matched external IDs and a surfaced invalid-field error with no duplicate handoff.

#### INT-009 — Katana inventory connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001 · *Rules:* D-1

**Requirement.** A Katana adapter reads sellable product/variant availability and expected production supply where exposed, sends approved sales orders and returns fulfillment references. Manufacturing scheduling and stock postings remain in Katana. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it.

**Acceptance.**
1. Connect a Katana test account, map a made-to-order SKU, show its source-provided availability date, create one sales order and receive its completed fulfillment without inventing production progress.

#### INT-010 — Unleashed inventory connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001 · *Rules:* D-1

**Requirement.** An Unleashed adapter maps customers, products, units, price/stock data, warehouses and sales orders and returns shipment/invoice references. Sync preserves source identities, units and tax basis and reports refused mappings before accepting an order. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it.

**Acceptance.**
1. Connect a test organization, order cases with a mapped unit conversion, ship in Unleashed and compare base quantities and buyer status.
2. Invalid unit mapping blocks the handoff with a repair action.

#### INT-011 — Faire brand order ingest

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001

**Requirement.** Brands authorize Faire External API V2 order reads, with OAuth for multi-brand integrations, and ingest paginated orders under their original Faire IDs. Customer/product matching, fees, fulfillment and payment ownership are explicit; channel settlement is not charged again. Polling checkpoints and deduplication recover gaps without assuming a webhook exists. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report.

**Acceptance.**
1. Authorize a brand sandbox or controlled API boundary, fetch multiple pages, interrupt and resume, match an unknown SKU for review and ingest a replay.
2. Each Faire order appears once and no Stripe collection is initiated for Faire-owned settlement.

#### INT-012 — Documented wholesale API

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** A versioned authenticated API exchanges products, variants, accounts, locations, price books, quotes, orders, invoices and fulfillment state with pagination, scopes, validation and stable external IDs. Public documentation and sample requests expose the same business rules as the screens; no direct database access is needed. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report.

**Acceptance.**
1. Create an integration grant, import a small real-shaped catalog and company, place an order and read its invoice/fulfillment through documented API requests.
2. Refuse cross-account scopes and stale revisions.

#### INT-013 — Webhooks retry and failed-handoff queue

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003

**Requirement.** Signed outbound events and authenticated incoming provider callbacks retain event identity, timestamp and delivery result. Backoff, rate limits, dead-letter state, replay and duplicate/out-of-order handling are visible to operators. A successful local enqueue is distinct from external acceptance. The detailed formats and commercial boundaries in [the INT-013 reference](docs/COMMERCIAL-REFERENCE.md#int-013) apply.

**Acceptance.**
1. Subscribe a test endpoint, reject several deliveries, replay a signed event and send out-of-order provider states.
2. See one business effect, retained attempts and a queue item that clears only on acknowledged resolution.

#### INT-014 — Connector setup and reconciliation

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-ROLE-001

**Requirement.** Owners choose record authority and field mappings, preview source samples and test permissions before enabling each connector. A health view reports last successful sync, lag, unmapped records, duplicates and count/value differences, with repair, retry and a responsible owner. For INT-020 flat-file feeds it also lists each file picked up or written, its row counts, quarantined rows with their error report, and unacknowledged order files. Disconnection does not erase orders. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships.

**Acceptance.**
1. Set up a connector with a missing item and mismatched balance, inspect preview, repair mappings and reconcile before go-live.
2. Revoke credentials later; keep local history and show precisely which records need attention.
3. Exercise inherited DATA-002 connector/configuration/reconciliation changes through the staff audit search and complete export: actor/kind, source, time, revision, reason; append-only and private from buyers/agents.

#### INT-015 — Operational email and connected mailboxes

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Resend delivers branded invitations, confirmations, quote messages, reminders and CAT-011 line-sheet and suggested-order sends with delivery/bounce state and suppression. Authorized Google Workspace Gmail or Microsoft 365 Outlook mailboxes can supply inbound POs and attach reviewed replies to the right account/order under revocable scopes. Internal notes never leak into buyer mail. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Delivery failures appear in OPS-001 diagnostics before delivery states ship.

**Acceptance.**
1. Deliver a confirmation and simulate a bounce at the provider edge, ingest a PO from each authorized mailbox and revoke a mailbox.
2. Inspect account/thread matching, suppression and no further ingestion after revocation.
3. Current quote delivery uses AUTO-003's durable Resend states, terminal-address suppression and tenant/message/address-authorized signed intake.
4. Mailbox intake and other message types remain missing; those additions inherit this delivery honesty and custody before shipping.
5. RPT-008, RPT-009 and RPT-015 adds signed Resend report-delivery receipts and permanent address bounce/complaint/rejection suppression via the report download door; a report or quote suppression blocks both report sends and downloads.
6. Acceptance records authenticated bounce/replay, refuses a forged event, blocks later notifications and refuses an existing report link.
7. Mailbox intake remains missing.

#### INT-016 — EDI wholesale order exchange

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001

**Requirement.** Wholesalers connect SPS Commerce or Orderful for partner-mapped X12 850 purchase orders, 855 acknowledgments, 856 advance ship notices and 810 invoices. Partner identifiers, acknowledgments, validation and duplicates are explicit; Barrow owns the order experience while the partner operates EDI transport. This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report.

**Acceptance.**
1. In a partner sandbox ingest an 850, resolve a missing SKU, accept it once, send its 855 and linked 856/810 and inspect transport acknowledgment and exceptions without duplicate orders.

#### INT-017 — AIMS360 apparel ERP connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** An AIMS360 adapter imports styles with color/size matrices, UPCs, wholesale and retail prices, images, available-to-sell by warehouse, and customers with terms and reps, and sends approved Barrow orders as AIMS360 sales orders with exact size quantities, ship and cancel windows, PO and rep attribution. Pick ticket, shipment, invoice and payment references return to the order timeline; AIMS360 stays the inventory and invoicing authority.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report.

**Acceptance.**
1. Connect an AIMS360 test company, import a style with a color/size matrix, images and ATS, place an order with rep attribution, drop its acknowledgment and retry.
2. AIMS360 holds one sales order with the exact size quantities, its fulfillment and invoice references return to the buyer timeline, and no duplicate order exists.

#### INT-018 — ApparelMagic apparel ERP connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** An ApparelMagic adapter imports styles with color/size matrices, UPCs, prices, images, available-to-sell and customers with terms and reps, and sends approved Barrow orders as ApparelMagic sales orders with exact size quantities, ship and cancel windows, PO and rep attribution. Pick ticket, shipment, invoice and payment references return to the order timeline; ApparelMagic stays the inventory and invoicing authority.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report.

**Acceptance.**
1. Connect an ApparelMagic test company, import a style with a color/size matrix, images and ATS, place an order with rep attribution, drop its acknowledgment and retry.
2. ApparelMagic holds one sales order with the exact size quantities, its fulfillment and invoice references return to the buyer timeline, and no duplicate order exists.

#### INT-019 — A2000 apparel ERP connection

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** An A2000 adapter exchanges styles with color/size matrices, UPCs, prices, available-to-sell and customers, and sends approved orders as A2000 sales orders with exact size quantities, windows, PO and rep attribution through A2000's supported file or API exchange, returning shipment and invoice references. A2000 stays the inventory and invoicing authority.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report.

**Acceptance.**
1. Connect an A2000 test company or its documented exchange boundary, import a size-matrix style with ATS, place an order with rep attribution and replay the exchange.
2. A2000 holds one sales order with the exact size quantities and its shipment and invoice references return to the buyer timeline.

#### INT-020 — Scheduled flat-file SFTP data feed

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-1

**Requirement.** This feed is for a merchant whose ERP has no built-in adapter, such as AS400, Epicor, JD Edwards, Apparel 21, SAP Business One, QuickBooks Desktop through a file bridge, or a homegrown system. The merchant gets a scheduled flat-file exchange over SFTP, either a Barrow-hosted endpoint with per-merchant key or password credentials or a merchant-hosted server Barrow connects to. Each feed has separate import and export directories. **Import:** product/variant (style, color, size, UPC), price book (wholesale and MSRP), customer/location (company, bill-to, ship-to, terms, rep) and inventory/ATS files arrive in documented CSV/TXT layouts with a saved column mapping. NuORDER's standard integration templates are accepted as-is so an existing ERP job keeps working unchanged. Files are picked up on a configured interval, and each file has a stable identity, so a file replayed or dropped twice applies once. Valid rows apply; bad rows are quarantined with a per-file error report assigned to an owner under INT-014. A feed run is never a silent partial import. ATS files make the feed STK-002's inventory authority, with freshness shown. **Export:** approved orders are written as files in a configurable layout (CSV, TXT or an X12 850 file), one per order or batched. Order edits (ORD-011, ORD-016), cancellations and, inbound, shipment acknowledgments follow the same layouts. Each exported file carries STK-003's handoff identity and stays pending until the ERP's processed acknowledgment file, or the file's removal under a configured processed rule, closes it. An operator can resend an order, and the next pickup sees exactly one file per order. Any inventory order handoff added by this clause inherits STK-003: one durable identity, timeout pending until acknowledgment/reconciliation, idempotent retry and destination binding before shipping.  This clause inherits DATA-002 append-only, searchable and exportable attributed audit events for connector/configuration/reconciliation changes, including actor/source/time/revision/reason, before its capability ships. Before it ships, this clause inherits STK-002’s stock labels (source, observation time, warehouse, incoming promise dates or "date unknown"), the account warehouse rule and the stock freshness policy, and allocates by the account’s warehouses where its source supports it. Before shipping, this clause brings any fulfillment records it adds into RPT-003 with exact source-confirmed quantities, warehouse attribution and explicit unknowns for facts its source does not report. MOVE-008 states RL-101's bridge consent, trust and authority boundary. Explicit feed configuration authorizes a bounded future schedule; a manual bridge delivery does not complete this scheduled-feed target.

**Acceptance.**
1. Configure an SFTP feed with a column mapping and NuORDER template layout, authorizing its bounded future schedule under RL-101 and citing MOVE-008 for bridge consent, trust and authority.
2. Drop product, customer and ATS files on a schedule, including one malformed row and one file replayed twice.
3. Valid rows apply once, the bad row appears in the file's error report with an owner, and ATS freshness shows in STK-002.
4. Approve two orders: exactly two order files appear in the export folder in the configured layout.
5. Remove one before the ERP acknowledges it and resend it: the next pickup sees one file per order, and a processed acknowledgment closes each handoff.
6. Edit one order and see one edit file.
7. Stop the schedule past the freshness limit and see STK-002 block on stale ATS.
8. Before shipping, INT-020 must use ORD-017's persisted named layout IDs and column ordering for per-line confirmation exports, retain the chosen layout and exact order/revision identities, and prove the same snapshot values through ERP file delivery.

### Reporting and commercial management

#### RPT-001 — Account and product sales reporting

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003

**Requirement.** Managers report booked, shipped, invoiced, paid, credited and outstanding amounts separately by account, SKU/style, season, channel, territory and period. Currency, tax/freight inclusion and source freshness are clear; drill-down matches document lines and account permissions. The detailed formats and commercial boundaries in [the RPT-001 reference](docs/COMMERCIAL-REFERENCE.md#rpt-001) apply.

**Acceptance.**
1. Run a seasonal report containing a prebook, split shipment, credit and partial payment, filter a territory and drill to the documents.
2. Exported totals reconcile with the source lines and another rep territory is inaccessible.

#### RPT-002 — Quote conversion and promotion performance

*Tier:* Core · *Cites:* BASE-AUDIT-001

**Requirement.** Sales managers compare quote response/acceptance, abandoned carts, reorder rates, promotion results and line-sheet and presentation engagement (opens, views and items viewed per buyer) and CAT-011 campaign results (delivered, opened, viewed, ordered and order value per send) by cohort, rep and product. An order is attributed to a campaign only when it is placed from that campaign's link or form. Discounts, returns and attribution rules are visible so a click or generated quote does not become revenue. The detailed formats and commercial boundaries in [the RPT-002 reference](docs/COMMERCIAL-REFERENCE.md#rpt-002) apply.

**Acceptance.**
1. Create accepted, expired and revised quotes plus a promoted order and return, then view conversion and net promotion performance; open a line sheet as two buyers and see each buyer's views.
2. Count each accepted order once and explain every denominator.

#### RPT-003 — Fulfillment and backorder reporting

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-ROLE-001

**Requirement.** Operations report fill rate, on-time shipment/delivery, open commitments, aging backorders and promise changes by account and warehouse. Reports separate source-confirmed events from estimates and provide an action list for late lines. The detailed formats and commercial boundaries in [the RPT-003 reference](docs/COMMERCIAL-REFERENCE.md#rpt-003) apply. Related source-specific proof is retained in the commercial reference.

**Acceptance.**
1. Load an on-time, late and partially shipped order, inspect line-based fill and lateness measures and open the late-line queue.
2. Missing tracking stays unknown rather than counted as delivered.
3. INT-011 carrier: ingested Faire lines retain original order IDs, exact ordered quantities and account scope; shipped quantities, warehouse and delivery remain unknown when the source does not report them.
4. They never change Pier fill denominators.

#### RPT-004 — Finance and credit reporting

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001

**Requirement.** Finance reports receivables aging, available credit/exposure, deposits, failed payments, disputed balances and refund status with ledger reconciliation. CSV exports retain currency and source IDs and support a US accountant working in USD and local business time zones. The detailed formats and commercial boundaries in [the RPT-004 reference](docs/COMMERCIAL-REFERENCE.md#rpt-004) apply.

**Acceptance.**
1. Run aging on a stated date across net-30, disputed and partially paid invoices, export and compare every bucket with due dates and verified payments.
2. A rep sees only the permitted account summary.

#### RPT-005 — Rep performance and commission statements

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001

**Requirement.** Managers compare territory coverage, visits, quote conversion, new/repeat accounts and earned/reversed commissions; reps view their own targets and itemized statements. Attribution follows effective assignments and approved split rules, with export for the merchant payroll process. The detailed formats and commercial boundaries in [the RPT-005 reference](docs/COMMERCIAL-REFERENCE.md#rpt-005) apply. Under RL-102, source-backed performance and explicit count goals do not change compensation. Native actor identity, frozen REP-004 earned and reversed commission snapshots, historical assignment and current workload remain distinct. Current report, ACC-006 account and compensation entitlement governs every detail, count and export; DATA-002 retains the decisions.

**Acceptance.**
1. Transfer an account between reps after one shipment and return part of it.
2. Both statements retain correct historical earnings, manager totals reconcile and reps cannot read each other private compensation.
3. Under RL-102, compare dated source-backed activity and explicit count goals without changing frozen REP-004 compensation; distinguish native people from frozen labels and current workload from historical assignments, and enforce current report, account and compensation entitlement on details, counts and exports.

#### RPT-006 — Operational order search

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Authorized users search account orders by company, PO, external source identity and SKU, with paginated sorting rather than loading the whole business into the browser. On a 20,000-order fixture, PO and SKU search and re-sorting return the first page within 2 seconds at the 95th percentile. RPT-013 governs the corresponding carrier-tracking search.

**Acceptance.**
1. Find a known PO within 2 seconds in a multi-season fixture of 3 seasons, 400 accounts and 20,000 orders and re-sort by ship window.
2. Operational search: The order-search door filters in D1 and returns at most 25 authorized order summaries per page, with on-demand source details in Orders.
3. It searches recorded/current company name, literal PO, recorded Pier order ID/reference or invoice number, and recorded line SKU using ASCII case-insensitive substrings; fields combine with AND.
4. Sorts use preparation time or the requested delivery date, with missing delivery dates last and order ID ties; pages read current data and concurrent edits may move rows.
5. Recorded ISO currency and cents are unchanged.

#### RPT-007 — Bounded workspace and order-history pages

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** The workspace and history keep every authorized order and draft reachable through bounded pages, preserving commercial snapshots and full-scope counts.

**Acceptance.**
1. The workspace and order-history doors return at most 25 full orders, with page number, page size and next-page state.
2. History keeps descending insertion order, Unicode en-US case-insensitive literal PO/SKU/location filters, inclusive America/New_York preparation-date bounds and original line/currency/revision snapshots.
3. `status` (all, draft, review, submitted, reserving, shortfall, approved, releasing, cancelled) and exact `accountId` combine with those filters without granting access; review includes submitted/reserving/shortfall/releasing.
4. History excludes superseded drafts; the bounded state page retains them for API history.
5. Text fields accept at most 160 characters; page numbers are 1–999999; current-data pages can move after concurrent writes.
6. History reads at most 100 stored bodies per database batch and keeps only one page; its original Unicode/date filtering can scan batches and makes no separate latency claim.

#### RPT-008 — Monthly saved report definitions

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Authorized users save immutable report filters and schedule one source-linked snapshot per completed month, with exact period and report-zone semantics. Broader report types remain in scope.

**Acceptance.**
1. Save a monthly filtered report for an authorized finance user.
2. Scheduled delivery uses the recorded audience boundary: exact eligible Native operator identities and their current roles, not typed addresses or credentials.
3. Monthly runs execute on the first day at 09:00 UTC for the previous complete calendar month; an explicit run-now uses that same period and never creates a second run.
4. Sales applies inclusive report-zone date bounds; invoice aging is as of the period's last day.
5. Each saved immutable sales or invoice-aging definition records exact filters, recipient operator version and role.

#### RPT-009 — Recipient-bound report delivery

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Report delivery and download require the exact selected Native user and current entitlement to the whole saved filter; changed authority refuses the whole report and revokes future delivery. ACC-005 supplies functional report entitlements, ACC-009 supplies whole-filter assignment coverage and INT-015 retains suppression custody.

**Acceptance.**
1. Revoked recipients receive no private report and its source links match the selected records.
2. Both sending and report downloads recheck exact selected identity, active account, unchanged operator version, entitled role, removal, permanent address suppression and access covering the whole saved filter.
3. Staff recipients remove themselves while signed in; owner/admin can also remove selected recipients.
4. Removal, role/status/version changes cancel queued deliveries and existing links return 403.
5. Narrower access is refused and recorded, never trimmed.

#### RPT-010 — Report snapshot custody and restoration

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Report snapshots retain their exact source period, expiry and audit while restored schedules remain inert.

**Acceptance.**
1. One whole source-linked JSON snapshot freezes per schedule/period at its first run and expires exactly 90 elapsed days later.
2. Owner archives preserve definitions/snapshots/audit but mark restored schedules inert and cancel unsent notifications; save a new native definition to resume, without rebinding historical recipient IDs.

#### RPT-011 — Bounded account directory pages

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Account cards and selectors search, sort and page their current authorized directory independently and resolve a chosen account by exact identity.

**Acceptance.**
1. Account-list pagination uses the corresponding account read door: at most 25 current authorized full accounts, `page` 1–999999, literal ASCII case-insensitive `q` across company name, account ID, email or Pier customer ID (at most 160 characters), and `sort` id/name-asc/name-desc with exact ID ties.
2. The workspace includes only the first account page plus `accountPage` metadata; cards and all account selectors search/page independently and load the selected account by exact ID at the corresponding account read door.
3. Pages read current data and concurrent writes may move rows.
4. Original supplier/buyer/agent read scope is unchanged.

#### RPT-012 — Complete duplicate-company review

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Duplicate-company review searches the full authorized identity scope in bounded pages and binds every matching current revision, even outside the workspace’s current page.

**Acceptance.**
1. Duplicate-company review scans bounded batches with ACC-004’s original Unicode-normalized name/exact Pier-ID matching, returns 25 identity-only candidates per page, and requires each matching current revision at save; no match outside the workspace page is lost.
2. History returns only its page’s account revision map so stale-draft warnings do not depend on the account page.

#### RPT-013 — Carrier tracking search

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** The same 3-season, 400-account, 20,000-order search fixture supports known carrier tracking references with a first page within 2 seconds at the 95th percentile.

**Acceptance.**
1. Find a known tracking number through the order search and re-sort its results within the declared statistical bar.

#### RPT-014 — Workspace waiting drafts and full-scope indicators

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** The workspace surfaces the most relevant waiting draft without loading all orders, and counts and action links cover the authorized collection beyond its current page.

**Acceptance.**
1. The workspace adds a separate initial waiting draft, selected from all authorized drafts (newest stale account revision first, then newest draft).
2. Status counts cover the full visible active collection, and duplicate-PO flags and completed substitution links are checked outside the current page.
3. People names belong to the returned page.
4. Account draft pages and direct authorized draft reads keep every draft reachable in the order pad.

#### RPT-015 — Report notification outcomes and suppression

*Tier:* Core · *From:* RPT-006 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** A report notification binds one exact source period and recipient to its durable mail identity. Provider acknowledgment, ambiguity, delivery and permanent address suppression remain distinct.

**Acceptance.**
1. Each notification contains only report name, schedule, period, as-of date and one token-free link to the signed-in report page requiring the recipient's own sign-in; no figures, account names, POs or attachments.
2. Each recipient/run has one durable notification identity and one submission claim across restarts; provider acceptance is not delivery, and ambiguous or refused submissions remain recorded without automatic resubmission.
3. Unconfigured or development installs send no report notification.
4. Signed report delivery events use unmodified Base intake; bounce/complaint/rejection receipts permanently suppress that address.
5. DATA-002 records every step.

### Follow-up and business automation

#### AUTO-001 — Trade application follow-up

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Conditional rules route applications by territory, requested terms and certificate completeness, assign review deadlines and send reviewed missing-information requests. Applicants receive status updates and staff escalation persists until a decision or explicit closure. The detailed formats and commercial boundaries in [the AUTO-001 reference](docs/COMMERCIAL-REFERENCE.md#auto-001) apply.

**Acceptance.**
1. Apply without a required certificate, route to a territory owner, send the request and upload the document.
2. Escalation stops on the recorded decision, not merely because an email was queued.

#### AUTO-002 — Approval routing and escalation

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Order policies automatically apply price, quantity, buyer spend and credit checks, route to the correct purchasing or supplier approvers and notify delegates. Due tasks escalate with the exact blocking cause; retries and revisions do not send duplicate approvals. An approval that can expire releases its held stock through STK-004's acknowledged release before expiry ships. The detailed formats and commercial boundaries in [the AUTO-002 reference](docs/COMMERCIAL-REFERENCE.md#auto-002) apply.

**Acceptance.**
1. Submit an order requiring buyer and finance approval, revise its price and run the scheduled escalation.
2. Old approval is invalid, current delegates are notified once and approval closes the correct tasks.

#### AUTO-003 — Quote activity notifications

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · *Register:* R-9

**Requirement.** New quote messages, commercial revisions, impending expiry and acceptance notify the assigned buyer and rep with a direct authorized link. Internal notes reach only staff; delivery failure creates a follow-up rather than silently dropping the opportunity. Before it ships, this clause delivers ORD-005’s in-app quote notices (request, buyer-visible message, internal note, revision ready to accept, acceptance) to the same audiences by email, never an internal note to a buyer.

**Acceptance.**
1. Revise a quote, add an internal note and simulate a buyer email bounce.
2. Buyer receives only visible changes, rep gets the note and a failed-contact task remains until resolved.
3. each existing ORD-005 notice atomically queues one durable ledger row per authorized recipient user ID.
4. Under ACC-002, buyer means each active native company member with purchaser or approver rights, rechecked at dispatch; the former account-email authority is retired; staff means active owner/admin except the actor.
5. An agent's identity, rep metadata, names, author emails, guessed contacts, CC/BCC and a new outreach grant do not establish recipient entitlement; recipient facts come from current purchasing contacts.
6. An internal notice addressed to a buyer is a hard error.
7. Missing buyer authority creates a withdrawn row with reason "no authorized buyer recipient" and an owned failed-contact task.

#### AUTO-009 — Immutable notification submission and retry

*Tier:* Core · *From:* AUTO-003 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · *Register:* R-9

**Requirement.** Quote mail submission preserves the exact sender request, provider outcome and one stable delivery identity; ambiguous retries cannot invent delivery. The detailed formats and commercial boundaries in the [AUTO-003 reference](docs/COMMERCIAL-REFERENCE.md#auto-003) apply.

**Acceptance.**
1. Dispatch rechecks that exact user, withdraws revoked/mismatched authority without substituting another person, and saves the exact current address used.
2. Email contains only the notice summary, quote ID and configured HTTPS app quote link; ordinary sign-in and existing quote authorization apply, with no tokens, message bodies, attachments or tracking.
3. A stable delivery ID is the stable Resend request identity; the exact provider ID or null and exact sender result are retained.
4. Queued, withdrawn, accepted, deferred, delivered, bounced, failed, rejected, complained, suppressed, rate limited, uncertain and not configured stay distinct.
5. Delivered means delivered to the recipient mail server, never read; accepted with no provider ID is labelled accepted (uncorrelated).
6. Development is not sent (development).
7. Submission requires configured Resend, API key, HTTPS origin, installation delivery tenant and mail callback verification secret.
8. Terminal bounce, complaint or rejection suppresses later sends to the saved address.

#### AUTO-010 — Quote expiry reminder delivery

*Tier:* Core · *From:* AUTO-003 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · *Register:* R-9

**Requirement.** Quote expiry reminders follow the exact latest commercial revision and current authorized audience on the account’s last valid day. The detailed formats and commercial boundaries in the [AUTO-003 reference](docs/COMMERCIAL-REFERENCE.md#auto-003) apply.

**Acceptance.**
1. An hourly check nominates one email-only expiry row per quote/latest revision/user on its inclusive America/New_York last valid date, only while proposed and unaccepted; replay cannot add another, and superseded, awaiting-approval, accepted or late reminders are withdrawn before submission.
2. Native walkthrough: request reaches staff; internal note reaches staff only; visible message and ready revision reach buyer with a sign-in link and another company gets not found; one last-day reminder, none for superseded/awaiting-approval and no repeat on replay/restore; signed delivered/bounce creates one owned failure task, foreign or changed replay is refused, identical replay has no new effect; acceptance leaves work open and an attributed resolution closes it.

#### AUTO-011 — Verified quote delivery callbacks

*Tier:* Core · *From:* AUTO-003 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · *Register:* R-9

**Requirement.** Only authenticated provider evidence for the exact saved tenant, provider identity and recipients changes quote-mail delivery state. The detailed formats and commercial boundaries in the [AUTO-003 reference](docs/COMMERCIAL-REFERENCE.md#auto-003) apply.

**Acceptance.**
1. The POST-only, 1 MiB Resend callback uses unmodified Base signature/freshness verification (300 seconds), server-configured tenant and namespace, verbatim Base D1 event schema, and read-only authorization of tenant, exact saved provider ID and every exact saved address.
2. Only stored Base results change the ledger, idempotently by event ID; open/click do not.
3. Invalid/foreign/changed-fingerprint events return redacted refusal; identical replay is acknowledged without a second effect.
4. The webhook secret and its private fingerprint never enter archive/export/diagnostics/log/audit; configure, rotate and revoke record system audit events without their values.
5. Saved addresses use DATA-003's messages retention kind and separate provider-mail custody; unused-account erasure removes ledger, tasks and matching Base event rows in the existing restore-fenced erasure transaction.

#### AUTO-012 — Failed quote contact ownership

*Tier:* Core · *From:* AUTO-003 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · *Register:* R-9

**Requirement.** Failed quote contact remains source-linked owned work until an entitled person records its exact resolution. The detailed formats and commercial boundaries in the [AUTO-003 reference](docs/COMMERCIAL-REFERENCE.md#auto-003) apply.

**Acceptance.**
1. Rate-limited/uncertain requests retry the same immutable request/key only within 24 hours; afterward they are not resubmitted and open contact work.
2. Failed-contact tasks are keyed by quote/recipient user, append delivery facts, and open on bounce/failure/rejection/complaint/suppression, uncertainty beyond 24 hours, submission rejection or missing buyer.
3. Buyer tasks start with the active latest proposer, otherwise installation owner; staff tasks start with the owner.
4. Acceptance, refresh, later delivery or revision never closes a task: an attributed revision-guarded resolution does.
5. OPS-001 lists open non-success delivery ID/state/age/owner/task link and the webhook-secret reconnect step; other notification types remain not recorded.
6. ACC-002/ACC-006 inherit future purchaser/assigned-covering-rep routing and task ownership before shipping.
7. Contact dates use New York; only active owner/admin can be assigned.

#### AUTO-013 — Notification custody and inert restoration

*Tier:* Core · *From:* AUTO-003 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · *Register:* R-9

**Requirement.** Quote-mail delivery history, recipient custody and failed-contact work survive archives without resending restored work or leaking credentials. The detailed formats and commercial boundaries in the [AUTO-003 reference](docs/COMMERCIAL-REFERENCE.md#auto-003) apply.

**Acceptance.**
1. DATA-001 exposes supplier-only quotedeliveries; buyers omit it.
2. Owner archives retain ledger, tasks and Base event receipts/states without credentials; restored queued/rate-limited/uncertain rows are uncertain and never resubmit.

#### AUTO-014 — Quote notification handoffs and diagnostics

*Tier:* Core · *From:* AUTO-003 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · *Register:* R-9

**Requirement.** Quote-mail diagnostics and downstream buyer and rep routing preserve their named source and audience obligations. The detailed formats and commercial boundaries in the [AUTO-003 reference](docs/COMMERCIAL-REFERENCE.md#auto-003) apply.

**Acceptance.**
1. Live Resend and hosted proof remain separately PENDING and are not claimed by native signed-fixture tests.

#### AUTO-004 — Order and fulfillment notifications

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Accepted orders, buyer- and staff-initiated changes (ORD-011), canceled-style drops (ORD-016), holds, backorders, shipments, delivery exceptions and return decisions trigger account-appropriate in-app and email notices with preferences and delivery tracking. Event replay cannot send duplicate confirmations and sensitive finance details are role-scoped.

**Acceptance.**
1. Run an order through a split shipment and return with duplicate carrier events.
2. Inspect one notice per material change, the correct recipients, preferences and an owned bounce exception.

#### AUTO-005 — Rep next-action queue

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Reps receive a prioritized queue of unanswered quotes, abandoned carts, overdue approvals, dormant accounts and delivery/payment exceptions with source links, reason, next contact date and owner. Staff can snooze, reassign or close with a resolution; queues retain unanswered work. The detailed formats and commercial boundaries in [the AUTO-005 reference](docs/COMMERCIAL-REFERENCE.md#auto-005) apply.

**Acceptance.**
1. Create one item of each type, assign and snooze them, resolve a quote through acceptance and record a failed contact.
2. The accepted quote closes while unanswered tasks remain and appear on the due date.
3. AUTO-003 adds failed quote contact tasks keyed by quote/recipient user, with active latest proposer or installation owner, New York contact date and attributed revision-guarded resolution.
4. Acceptance, refresh, later delivery and new revisions do not close them.

#### AUTO-006 — Accounting invoice and payment automation

*Tier:* Core · *Cites:* BASE-INPUT-003, BASE-MAIL-001

**Requirement.** An eligible fulfillment or approved on-account order automatically creates the intended accounting invoice once under the chosen billing policy, returns invoice/payment state and produces the buyer document. Mapping failure blocks success and stays assigned until repaired.

**Acceptance.**
1. Set billing on shipment, ship two releases, lose one QBO/Xero response and rerun.
2. Each release has exactly one matched invoice, returned payment updates the balance and a bad mapping remains an open exception.

#### AUTO-007 — Payment reminders and promises to pay

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Scheduled dunning uses actual due dates, provider settlement and ledger balances, excludes disputed or approved paused items and respects recipient/contact policies. A promise-to-pay creates a dated task; missed promises escalate and settled balances stop future reminders.

**Acceptance.**
1. Run scheduled reminders for overdue, disputed and promised invoices, settle one between scheduling and sending and miss another promise date.
2. Only still-eligible messages send and finance sees the overdue promise task.

#### AUTO-008 — Scheduled synchronization and stock alerts

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Exact semantics today: the owner or admin explicitly enables the hourly Pier consumer; atomic page effects precede ACK and pending acknowledgements survive interruption. The source limit bounds each page, retry-after rate limits defer subsequent work, and every order still checks live account-scoped Pier stock. Buyers explicitly request their own private in-app stock or prebook-window notice; current purchasing membership and assortment are checked at publication, each request fulfills once, and there is no email or external-channel effect. The supplier records prebook notice windows; ORD-008 purchasing and CAT-008 publication remain separate and inherit this notice boundary. Three failures retain an installation-owner task until reconciliation and an attributed resolution; a changed connection or native grant requires an attributed checkpoint restart. Restored synchronization and requests are disabled. Account and company-user erasure removes their requests and notices. Connectors run incremental syncs with checkpoints, rate limits and freshness checks; account users may request back-in-stock or prebook-window notices. Repeated failures escalate to an operator and replayed stock updates cannot duplicate notices or oversell a stale promise.

**Acceptance.**
1. Interrupt a paginated sync, resume from its acknowledged checkpoint, restore a watched SKU and replay its event.
2. One notice sends, reconciliation completes and persistent failure stays assigned.

### Migration and cutover

#### MOVE-001 — NuORDER move-in

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003 · *Rules:* D-3

**Requirement.** Import NuORDER product XLS/CSV and brand-configured XLS Order Export Templates, preserving style/color/size/UPC keys, seasons, quantities, prices, PO references and ship windows. Preview source-specific columns and archived-product coverage. Companies, locations and buyers move through MOVE-009; price lists use an explicitly mapped supplied export or API, never an invented universal archive. Product images move: image files the merchant downloads from NuORDER, or image URLs where its export or API provides them, attach through CAT-010's naming rule to the right variant and slot, and only images that cannot be retrieved are listed in the migration report by style. Line sheets and presentations are rebuilt as CAT-003/CAT-004 documents from the imported assortment. The migration report states that orders placed through NuORDER's retailer network stop arriving at cutover and imports the open ones as open orders or labeled history. Source case packs and increments map onto PRI-003's casePack/increment rules.  Before it ships, any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export.

**Acceptance.**
1. Upload real-shaped NuORDER product, image and order fixtures matching the documented formats, map variant/customer keys, preview and approve.
2. Reconcile line counts, open quantities, currencies and order value, see images attached to their variants and slots with one unretrievable image reported, label historical orders and refuse unmapped identities before activation.

#### MOVE-002 — Pepperi move-in

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003 · *Rules:* D-3

**Requirement.** Import Pepperi item Excel exports with selectable IDs and parent-style rows and its outbound order XML files, including XML content delivered with a .txt extension. Map account/price exports supplied by the merchant separately; Pepperi history-import CSVs are not misrepresented as an outbound export. Preserve external transaction, item and customer keys. Source case packs and increments map onto PRI-003's casePack/increment rules.  Before it ships, any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export.

**Acceptance.**
1. Preview real-shaped Pepperi Excel item and XML order fixtures matching the documented formats, identify a .txt XML file by content, map customer/variant references and reconcile quantities and values.
2. Replaying the source creates no second order.

#### MOVE-003 — Brandboom move-in

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003 · *Rules:* D-3

**Requirement.** Import Brandboom product and customer .XLS exports and available CSV/Excel order templates, mapping style/variant SKUs, billing/ship-to addresses, order statuses, prices and line quantities. Required export permissions/template settings are explained; lookbook layouts and images missing from a source file are separately reported. Source case packs and increments map onto PRI-003's casePack/increment rules.  Before it ships, any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export.

**Acceptance.**
1. Upload real-shaped Brandboom customer/product XLS and order CSV/Excel fixtures matching the documented formats, resolve duplicate company names by source ID and review address mapping.
2. Reconcile open order values and preserve the original file and field-level diagnostics.

#### MOVE-004 — SparkLayer move-in

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Import SparkLayer account and agent activity CSV in summary or detailed line form and shopping-list CSV. Preserve quote and order type, quantities, prices, shipping, tracking and custom fields present in the export; product and customer authority comes from an explicitly selected Shopify, WooCommerce or supplied export mapping. Filtered exports are identified as incomplete rather than full tenant archives. Source case packs and increments map onto PRI-003's casePack and increment rules.  Before it ships, any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. The detailed formats and commercial boundaries in [the MOVE-004 reference](docs/COMMERCIAL-REFERENCE.md#move-004) apply.

**Acceptance.**
1. Upload real-shaped detailed activity and shopping-list CSV fixtures matching the documented formats, compare the selected export date and filter range and join backing-store product and customer IDs.
2. Reconcile covered orders and flag omitted source scope before cutover.

#### MOVE-005 — WizCommerce move-in

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Import WizCommerce order and quote Excel workbooks with header, line and combined master sheets, customer, contact and address workbooks, or FTP CSV header/item/customer files. Preserve UUID and reference relationships, document type, statuses, payments and units. Website-user exports are separate and lead to reviewed invitations rather than imported login authority. Source case packs and increments map onto PRI-003's casePack and increment rules.  Before it ships, any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. The detailed formats and commercial boundaries in [the MOVE-005 reference](docs/COMMERCIAL-REFERENCE.md#move-005) apply.

**Acceptance.**
1. Upload a real-shaped workbook set and FTP CSV batch matching the documented formats, join order headers and lines, distinguish a quote from an accepted order and reconcile customer/address counts and financial totals.
2. Replaying either source cannot double-count history.

#### MOVE-006 — Cin7 portal move-in

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001 · *Rules:* D-3

**Requirement.** A Cin7 Core portal buyer can bring customer, product/price and open sales-order data through its authorized API or actual CSV exports with documented source mappings. Preserve Cin7 identifiers and keep the existing inventory/ledger authority while buyer access and presentation move to Barrow. Source case packs and increments map onto PRI-003's casePack/increment rules.  Before it ships, any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export.

**Acceptance.**
1. Connect a test Cin7 company and preview a real-shaped source export/API set, reconcile open quantities and prices, invite buyers and complete one new order without duplicating the existing Cin7 sales order.

#### MOVE-007 — Reconciled migration rehearsal

*Tier:* Core · *From:* MOVE-007, BAR-004 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Every importer previews accounts, buyers, locations, catalogs, media references, prices, lists, quote/order lines, open releases, invoices and balances where the source supplies them. Counts, sums, rejected fields and missing source entities are explicit; unsupported or unavailable data requires a supplied export/mapping or labeled retained history before buyer sign-off. Credentials, tax approval and provider financing authority never migrate as approval. Source case packs and increments map onto PRI-003's casePack/increment rules. The detailed formats and commercial boundaries in [the MOVE-007 reference](docs/COMMERCIAL-REFERENCE.md#move-007) apply.

**Acceptance.**
1. Dry-run a populated account/price CSV that updates one account and adds two, compare source and planned counts and USD sums, correct one unknown SKU and apply with the owner's recorded fingerprint approval.
2. No invitation, account, order or Pier write occurs during preview, and with Pier unreachable the SKU check reports that it did not run and apply refuses.
3. Upload the documented account/price CSV through Move in, preview without account writes, refuse a stale fingerprint, apply over several batches and replay it.
4. Inspect originals and journal, then undo untouched accounts and refuse undo after a native edit or dependent order.

#### MOVE-008 — Cutover delta and safe rollback

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001

**Requirement.** Owners choose an order-entry cutoff, reconcile last changes, declare the system responsible for each open order/invoice and enable new activity only after sign-off. A brand whose ERP fed the incumbent by flat files repoints that job to Barrow's INT-020 feed. During rehearsal the feed's import files apply to the rehearsal only and its order export stays off. At cutoff, export starts with the first post-cutover order, so the ERP never receives an order twice from the incumbent and Barrow. Imported history cannot trigger reservations, payments or reminders. Rollback/undo preserves post-cutover native edits and commercial dependencies and gives an explicit disposition for records it cannot reverse. Source case packs and increments map onto PRI-003's casePack/increment rules. Under RL-101, the owner-operated cutover bridge uses separate reviewed scope for holds, cutoff and pack, each delivery and native-only rollback, pinned host trust and server-held credentials. Every open order, invoice and stock fact names its authoritative system. Native undo never claims external rollback; restored history does not replay.

**Acceptance.**
1. Run a rehearsal then a delta import with an order edited at source, sign off the cutoff and place one new order.
2. Attempt undo after a dependent shipment; preserve it, name the blocked records and prove historical imports initiated no financial effect.
3. Repoint a flat-file ERP job to the INT-020 feed in rehearsal: product and ATS files apply, no order file is written, and after cutoff only the new order is exported.
4. Under RL-101, identify the authoritative system for every open order, invoice and stock fact, review each bridge delivery and native-only rollback separately, and retain inert history without inferring an external rollback.

#### MOVE-009 — NuORDER companies and buyers move-in

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-MAIL-001, BASE-ROLE-001 · *Rules:* D-3

**Requirement.** Import NuORDER's Company data and Buyer data templates (XLS/CSV) and the equivalent NuORDER API reads: customer name and code, currency, multiple bill-to and ship-to addresses, payment terms, credit status, assigned reps, price-list and catalog assignments and linked buyer contacts. Preview maps them to ACC-002 companies and users, ACC-003 locations, ACC-006 rep assignments and PAY-004 terms and credit status, and flags duplicate customer codes and unknown reps or price lists for resolution before apply. Login authority never migrates: after approval each buyer receives one reviewed pending invitation. Replay is idempotent by customer code and buyer email. Source case packs and increments map onto PRI-003's casePack/increment rules.  Before it ships, any saved lists this importer brings in become ORD-002 lists under its visibility rules (desired SKUs and quantities only), reported in MOVE-007's dry-run reconciliation and included in DATA-001's export. Buyer imports create reviewed pending ACC-002 invitations, never active memberships; exact-email collisions remain for supplier review, and no login authority migrates.

**Acceptance.**
1. Preview real-shaped NuORDER Company and Buyer data workbooks with two ship-tos per company, a duplicate customer code and an unknown rep; resolve them and apply.
2. Each company has its locations, terms, credit status, currency, rep and price list, each buyer has one pending invitation, and replaying the import adds no companies or invitations.

### Data security operations and product separation

#### DATA-001 — Business data portability

*Tier:* Core · *From:* DATA-001, BAR-005 · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Owner and properly scoped company users export readable CSV/JSON plus document/media manifests covering their authorized accounts, products, prices, quotes, orders, releases, invoices, payments, credits, statements and audit references. Open formats retain IDs, currency, source mappings and revisions so the merchant can leave without losing the commercial record. The detailed formats and commercial boundaries in [the DATA-001 reference](docs/COMMERCIAL-REFERENCE.md#data-001) apply. Erasing an unused account retires import custody and atomically commits the portability redaction checkpoint. A later erasure journal fences an older archive. Ordered accounts retain commercial history; identity, inventory and provider custody remain separate and are disclosed. The 3-location, split-order, return and partial-payment steps remain obligations of ACC-003, ORD-009/013, SHIP-004 and PAY-003 before those capabilities ship.

**Acceptance.**
1. Export an account fixture with orders in several statuses, including a reorder, a PO document and a legacy AUD record, and reconcile counts, line sums and per-currency totals; resolve each document reference to its bytes.
2. A company export contains only that company and no audit decisions, the held company policy refuses an export under the catalog-only agent grant, and an owner archive still excludes all installation credentials.
3. AUTO-003 adds supplier-only quotedeliveries JSON/CSV with stable delivery, quote/account/recipient IDs, exact provider ID, states, attempts and task references; buyer exports omit it and an agent call without that entitlement is refused.
4. RPT-005 activity goals join the owner/admin export as `reptargets` (exact Native user ID, period, frozen time zone, count goals, revision and attributed reason); buyer and functional-staff general exports omit them, while entitled reps/managers use their scoped performance CSV.
5. Export a populated installation through its portability door, restore into an empty installation and compare commercial records.
6. Confirm credentials are excluded.
7. Erase an unused imported account, export again, and refuse the older archive when supplied with the later journal; refuse erasure of an account with orders.

#### DATA-002 — Commercial audit and decision history

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Authorized staff search an append-only audit by account/order/person and see human/agent actor, source, time, revision and reason for price, permission, approval, credit, refund, import and connector changes. Buyer-visible histories omit internal notes and secrets; exporting the audit preserves attribution. The detailed formats and commercial boundaries in [the DATA-002 reference](docs/COMMERCIAL-REFERENCE.md#data-002) apply.

**Acceptance.**
1. Approve the price/discount rule, under the held company policy prepare as an agent and review/submit/approve as the policy names, revoke a grant, import/replay/undo accounts and erase an unused one; search by account/order/person and export the attributed audit, including more than one export page and old unrecorded events.
2. Editing/deleting history is refused and a buyer or agent without internal-audit entitlement cannot retrieve internal decisions.
3. Restore the archive and retain event IDs and attribution.
4. AUTO-003 records system-actor secret configure/rotate/revoke, verified delivery events and failed-contact task creation; existing attributed followup.update records assignment/contact/resolution.
5. No secret, fingerprint, message body or attachment enters these events.
6. RPT-006 records saved definitions and recipient identities, snapshot freeze/queue, unconfigured sender, submission claim and exact outcome, authenticated delivery event, recipient removal/identity revocation, download and refusal as append-only attributed report audit.
7. Records contain IDs and reasons, no snapshot figures, secret, token, message body or attachment. Acceptance searches and exports these events and retains them through the owner archive. The RPT-005 goal-setting action records the exact Native rep, period, frozen zone, goals, revision, actor and reason; it triggers no payout or outreach. INT-011 carrier: Faire owner configuration, page reconciliation and reviewed matching decisions retain actor, source, time, revision and reason through staff audit search and complete CSV; buyers and an agent call without that entitlement is refused and audit mutation doors remain absent.

#### DATA-003 — Retention erasure and provider custody

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Owners set retention policies for PO documents, media, messages and commercial history, with legal holds and reviewable erasure requests. Identity and credentials are removed or deidentified when appropriate while required invoice/order history remains attributable. Deletion reports name separate processor, accounting, mail and inventory custody and apply erasure journals to later restores. The detailed formats and commercial boundaries in [the DATA-003 reference](docs/COMMERCIAL-REFERENCE.md#data-003) apply.

**Acceptance.**
1. Erase an unused imported account and a retention-expired PO attachment, process a held ordered-account request and inspect redaction, retained financial history and the provider-custody report.
2. Restore with a later erasure journal and refuse resurrection.
3. For the ct scope-review-56 §E ordered-account journey: verify and record the request, preview every class, revoke access under a hold without redacting, release it as owner, and explicitly execute the current revision with ERASE; inspect placeholders/removals, unchanged within-floor financial records, exact audit attribution, exclusions, transfer invalidation and custody.
4. Restore older data with the outside-D1 journal and inspect re-application before serving; missing or incomplete journals refuse service and restored mail never re-sends.

#### DATA-004 — Connection and document security

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Provider tokens stay server-side with minimum scopes, encrypted custody, rotation/revocation and secret-free diagnostics. Private attachments are bounded, malware-screened and authorized on download; webhook signatures, cross-origin controls, rate limits and current role checks protect every public door. Before shipping, malware-screen ACC-001 application documents; current attachments remain labelled not malware-screened. Under ct 22 October 15:46Z, public application documents are held in quarantine without an owner-configured scanner and cannot be downloaded. No third party receives document bytes by default. A scanner requires the owner-named processor, a Base adapter, server-held secret, audited configure/rotate/revoke and recorded owner consent; only that endpoint receives bytes over TLS, never logged, retaining only hash, verdict, scanner id and time. An outage quarantines with a named reason and retry. The current static screen refuses recognized PDF actions (including escaped names), embedded/encrypted/object-stream content and HTML/SVG/archive/executable payloads before any PO, quote or application bytes are stored; it is not a malware verdict. Deployed Pier secret binding changes are observed once as system configure/rotate/revoke audit without credential or keyed fingerprint; replaced sessions are revoked in Pier. The private connection helper validates the stock role and writes owner-only settings atomically. Every `/api/barrow/` door shares an atomic 600-request/minute fixed-window limit per trusted platform IP, HMACed with the installation secret, including anonymous forms, signed callbacks, transfers and unknown routes; missing platform IPs share one bucket, expired rows are removed, 429 supplies Retry-After, and Base authentication/application-specific stricter limits remain. Raw addresses, request bodies and credentials never enter these rate rows, audit or diagnostics; the configuration observer and rate rows are excluded from archives.

**Acceptance.**
1. Rotate a connector token, replay an invalid signed webhook, upload a dangerous attachment and request a private file as another account.
2. Refuse each unsafe action and inspect logs that reveal no credential or document body.
3. AUTO-003 adds server-only webhook-secret custody, audited configure/rotate/revoke without value disclosure, Base signed Resend intake with exact tenant/message/address authorization, and refusal of invalid/foreign/changed-fingerprint events.
4. Identical valid replay is acknowledged with no duplicate effect; other connector and document-security gaps remain.

#### BASE-001 — Native installation and shared foundations

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DOCS-001, BASE-INPUT-003, BASE-INSTALL-001

**Requirement.** Hono owns health/product API and TanStack Start serves application documents. Base supplies native sign-in, first-run setup, theme, command lifecycle and portability; Barrow preserves migration history, deployment identities and command effects. Authentication, setup and installed Lobby remain usable with a missing inventory connection and do not claim a configured provider.

**Acceptance.**
1. Install into a fresh checkout using documented rer commands, complete native setup/sign-in, open the Lobby/app and inspect a missing-connection state, then export/restore through the documented lifecycle.
2. Verify preserved IDs and applied migrations.

#### OPS-001 — Actionable diagnostics and recovery

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-MAIL-001

**Requirement.** Owners see health, connector lag, outstanding handoffs and notification failures with stable correlation IDs and safe diagnostic export. Backup/restore instructions identify reconnect steps; operators can resume interrupted work without fabricated success, secret dumps or a second stock ledger. The detailed formats and commercial boundaries in [the OPS-001 reference](docs/COMMERCIAL-REFERENCE.md#ops-001) apply.

**Acceptance.**
1. Interrupt an inventory and accounting handoff, restart, open diagnostics and resume the same orders.
2. Export diagnostics without secrets and confirm each operation reaches acknowledged success or a visible owned exception.
3. AUTO-003 exposes each open non-success quote delivery by delivery ID, state, age, owner and contact-task link; restoring requires reconnecting the configured Resend provider and re-entering the webhook secret.
4. Other notification delivery remains not recorded.

### Agent surface

**Specialist: wholesale operations clerk.** It turns trade demand into exact account-priced orders, reconciles stock and payment evidence, follows delivery exceptions and prepares source-backed portal cutovers.

Inherits BASE-AGENT-001 to BASE-AGENT-013. The company's policy decides every call.

**How Barrow computes each class.**

- **standard:** an internal reversible cart, mapping, catalog or task change; affected items are counted.

- **external:** an outside line sheet, quote, confirmation or follow-up; current account contacts determine recipients and known, new or public exposure.

- **money:** a changed charge, deposit, payment, refund or commission effect; exact original-currency amount and counterparty come from the commercial records.

- **commitment:** an accepted order, quote, sales terms, promise or cutover; exact revision, value and counterparty identify what binds.

- **accounts:** an outside merchant account or paid provider resource; the provider is named.

- **gated:** the provider keeps hosted card entry, consent or identity verification for a person; provider and step come from its response or documented route.

- **access:** a buyer, rep, functional role, device or agent grant changes; current people and widening or narrowing direction are recorded.

- **security:** a credential or protective setting changes; its provider and setting are identified.

- **destructive:** an eligible account or attachment is irreversibly erased; affected records and attachments are counted.

- **sensitive:** full personal tax identifiers, bank, card or regulated payment data are touched; records and data kind are counted.

- **live:** an active feed schedule or connector routing changes; the running service is identified.

| Tool | Does | Core clauses | Risk class | Today |

| --- | --- | --- | --- | --- |

| `barrow.acc.trade_applications_and_approval` | Trade applications and approval | ACC-001 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.acc.company_buyers_and_purchasing_rights` | Company buyers and purchasing rights | ACC-002 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.acc.billing_and_delivery_locations` | Billing and delivery locations | ACC-003 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.acc.account_lifecycle_and_commercial_profile` | Account lifecycle and commercial profile | ACC-004 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.acc.supplier_roles_and_separation_of_duties` | Supplier roles and separation of duties | ACC-005 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.acc.rep_territories_and_delegated_coverage` | Rep territories and delegated coverage | ACC-006 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.acc.buyer_purchasing_approvals` | Buyer purchasing approvals | ACC-007 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.cat.private_account_assortments` | Private account assortments | CAT-001 | standard or external | not exposed over MCP |

| `barrow.cat.product_discovery_and_media` | Product discovery and media | CAT-002 | standard or external | not exposed over MCP |

| `barrow.cat.digital_line_sheets` | Digital line sheets | CAT-003 | standard or external | not exposed over MCP |

| `barrow.cat.shoppable_lookbooks_and_presentations` | Shoppable lookbooks and presentations | CAT-004 | standard or external | not exposed over MCP |

| `barrow.cat.branded_responsive_storefront` | Branded responsive storefront | CAT-005 | standard or external | not exposed over MCP |

| `barrow.cat.multiple_brands_and_buying_profiles` | Multiple brands and buying profiles | CAT-006 | standard or external | not exposed over MCP |

| `barrow.cat.style_color_size_and_assortment_matrices` | Style color size and assortment matrices | CAT-007 | standard or external | not exposed over MCP |

| `barrow.cat.season_and_catalog_publishing` | Season and catalog publishing | CAT-008 | standard or external | not exposed over MCP |

| `barrow.cat.bulk_product_and_catalog_maintenance` | Bulk product and catalog maintenance | CAT-009 | standard or external | not exposed over MCP |

| `barrow.cat.bulk_image_upload_and_naming_rules` | Bulk image upload and naming rules | CAT-010 | standard or external | not exposed over MCP |

| `barrow.cat.line_sheet_group_sends_and_campaigns` | Line sheet group sends and campaigns | CAT-011 | standard or external | not exposed over MCP |

| `barrow.pri.negotiated_usd_price_books` | Negotiated USD price books | PRI-001 | standard or money | not exposed over MCP |

| `barrow.pri.quantity_breaks_and_account_discounts` | Quantity breaks and account discounts | PRI-002 | standard or money | not exposed over MCP |

| `barrow.pri.case_packs_minimums_and_increments` | Case packs minimums and increments | PRI-003 | standard or money | not exposed over MCP |

| `barrow.pri.unit_of_measure_pricing` | Unit of measure pricing | PRI-004 | standard or money | not exposed over MCP |

| `barrow.pri.bundles_and_wholesale_promotions` | Bundles and wholesale promotions | PRI-005 | standard or money | not exposed over MCP |

| `barrow.pri.effective_prices_and_additional_currencies` | Effective prices and additional currencies | PRI-006 | standard or money | not exposed over MCP |

| `barrow.pri.explainable_commercial_validation` | Explainable commercial validation | PRI-007 | standard or money | not exposed over MCP |

| `barrow.pri.suggested_retail_prices_and_price_display` | Suggested retail prices and price display | PRI-008 | standard or money | not exposed over MCP |

| `barrow.ord.quick_order_and_csv_cart_upload` | Quick order and CSV cart upload | ORD-001 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.saved_shopping_lists` | Saved shopping lists | ORD-002 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.reorder_from_history` | Reorder from history | ORD-003 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.negotiated_wholesale_quotes` | Negotiated wholesale quotes | ORD-004 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.quote_conversation_revisions_and_notes` | Quote conversation revisions and notes | ORD-005 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.self_service_checkout` | Self-service checkout | ORD-006 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.purchase_references_and_requested_dates` | Purchase references and requested dates | ORD-007 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.seasonal_prebooks_and_ship_windows` | Seasonal prebooks and ship windows | ORD-008 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.backorders_and_shipment_splits` | Backorders and shipment splits | ORD-009 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.immutable_agreed_order_snapshots` | Immutable agreed order snapshots | ORD-010 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.order_changes_and_cancellation` | Order changes and cancellation | ORD-011 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.buyer_order_status_and_confirmations` | Buyer order status and confirmations | ORD-012 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.multi_location_orders_and_release_groups` | Multi-location orders and release groups | ORD-013 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.order_confirmation_documents` | Order confirmation documents | ORD-014 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.versioned_sales_terms_and_buyer_acceptance` | Versioned sales terms and buyer acceptance | ORD-015 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.canceled_styles_across_open_orders` | Canceled styles across open orders | ORD-016 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.stk.live_customer_visible_availability` | Live customer-visible availability | STK-001 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.stk.available_to_promise_by_warehouse_and_date` | Available to promise by warehouse and date | STK-002 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.stk.durable_order_acknowledgment` | Durable order acknowledgment | STK-003 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.stk.reservation_release_and_stock_exceptions` | Reservation release and stock exceptions | STK-004 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.stk.buyer_approved_substitutions` | Buyer-approved substitutions | STK-005 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.rep.assigned_account_rep_ordering` | Assigned-account rep ordering | REP-001 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.rep.rep_commissions_and_attribution` | Rep commissions and attribution | REP-004 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.rep.visits_samples_and_trade_show_selling` | Visits samples and trade-show selling | REP-005 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.pay.stripe_card_checkout` | Stripe card checkout | PAY-001 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.stripe_ach_collection` | Stripe ACH collection | PAY-002 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.deposits_partial_payments_and_allocations` | Deposits partial payments and allocations | PAY-003 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.approved_net_terms_and_credit_limits` | Approved net terms and credit limits | PAY-004 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.credit_holds_and_controlled_release` | Credit holds and controlled release | PAY-005 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.b2b_pay_later_through_resolve` | B2B pay later through Resolve | PAY-006 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.customer_account_statements` | Customer account statements | PAY-007 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.invoice_documents_and_delivery` | Invoice documents and delivery | PAY-008 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.receivables_aging_and_collections` | Receivables aging and collections | PAY-009 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.credit_notes_and_refunds` | Credit notes and refunds | PAY-010 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.payment_disputes_and_reconciliation` | Payment disputes and reconciliation | PAY-011 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.pay.saved_payment_methods_and_consent` | Saved payment methods and consent | PAY-012 | money (+ sensitive) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.tax.avalara_avatax_calculation` | Avalara AvaTax calculation | TAX-001 | standard or money (+ sensitive) | not exposed over MCP |

| `barrow.tax.taxjar_alternative_tax_adapter` | TaxJar alternative tax adapter | TAX-002 | standard or money (+ sensitive) | not exposed over MCP |

| `barrow.tax.resale_certificates_and_exemption_review` | Resale certificates and exemption review | TAX-003 | standard or money (+ sensitive) | not exposed over MCP |

| `barrow.tax.tax_corrections_and_audit_trail` | Tax corrections and audit trail | TAX-004 | standard or money (+ sensitive) | not exposed over MCP |

| `barrow.ship.delivery_methods_and_shipping_charges` | Delivery methods and shipping charges | SHIP-001 | standard or external (+ money) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.ship.easypost_carrier_connection` | EasyPost carrier connection | SHIP-002 | standard or external (+ money) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.ship.shipment_tracking_and_delivery_exceptions` | Shipment tracking and delivery exceptions | SHIP-003 | standard or external (+ money) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.ship.return_authorizations_and_claims` | Return authorizations and claims | SHIP-004 | standard or external (+ money) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.ship.exchanges_and_service_resolution` | Exchanges and service resolution | SHIP-005 | standard or external (+ money) (+ accounts) (+ gated) | not exposed over MCP |

| `barrow.int.optional_pier_inventory_connection` | Optional Pier inventory connection | INT-001 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.quickbooks_online_accounting` | QuickBooks Online accounting | INT-002 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.xero_accounting` | Xero accounting | INT-003 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.netsuite_erp` | NetSuite ERP | INT-004 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.shopify_commerce_connection` | Shopify commerce connection | INT-005 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.woocommerce_commerce_connection` | WooCommerce commerce connection | INT-006 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.cin7_core_inventory_connection` | Cin7 Core inventory connection | INT-007 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.brightpearl_inventory_connection` | Brightpearl inventory connection | INT-008 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.katana_inventory_connection` | Katana inventory connection | INT-009 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.unleashed_inventory_connection` | Unleashed inventory connection | INT-010 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.faire_brand_order_ingest` | Faire brand order ingest | INT-011 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.documented_wholesale_api` | Documented wholesale API | INT-012 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.webhooks_retry_and_failed_handoff_queue` | Webhooks retry and failed-handoff queue | INT-013 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.connector_setup_and_reconciliation` | Connector setup and reconciliation | INT-014 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.operational_email_and_connected_mailboxes` | Operational email and connected mailboxes | INT-015 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.edi_wholesale_order_exchange` | EDI wholesale order exchange | INT-016 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.aims360_apparel_erp_connection` | AIMS360 apparel ERP connection | INT-017 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.apparelmagic_apparel_erp_connection` | ApparelMagic apparel ERP connection | INT-018 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.a2000_apparel_erp_connection` | A2000 apparel ERP connection | INT-019 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.int.scheduled_flat_file_sftp_data_feed` | Scheduled flat-file SFTP data feed | INT-020 | standard or external (+ security) (+ accounts) (+ gated) (+ live) | not exposed over MCP |

| `barrow.rpt.account_and_product_sales_reporting` | Account and product sales reporting | RPT-001 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.quote_conversion_and_promotion_performance` | Quote conversion and promotion performance | RPT-002 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.fulfillment_and_backorder_reporting` | Fulfillment and backorder reporting | RPT-003 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.finance_and_credit_reporting` | Finance and credit reporting | RPT-004 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.rep_performance_and_commission_statements` | Rep performance and commission statements | RPT-005 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.operational_order_search` | Operational order search | RPT-006 | standard (+ sensitive) | not exposed over MCP |

| `barrow.auto.trade_application_follow_up` | Trade application follow-up | AUTO-001 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.approval_routing_and_escalation` | Approval routing and escalation | AUTO-002 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.quote_activity_notifications` | Quote activity notifications | AUTO-003 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.order_and_fulfillment_notifications` | Order and fulfillment notifications | AUTO-004 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.rep_next_action_queue` | Rep next-action queue | AUTO-005 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.accounting_invoice_and_payment_automation` | Accounting invoice and payment automation | AUTO-006 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.payment_reminders_and_promises_to_pay` | Payment reminders and promises to pay | AUTO-007 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.scheduled_synchronization_and_stock_alerts` | Scheduled synchronization and stock alerts | AUTO-008 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.data.business_data_portability` | Business data portability | DATA-001 | standard or destructive (+ sensitive) (+ security) | not exposed over MCP |

| `barrow.data.commercial_audit_and_decision_history` | Commercial audit and decision history | DATA-002 | standard or destructive (+ sensitive) (+ security) | not exposed over MCP |

| `barrow.data.retention_erasure_and_provider_custody` | Retention erasure and provider custody | DATA-003 | standard or destructive (+ sensitive) (+ security) | not exposed over MCP |

| `barrow.data.connection_and_document_security` | Connection and document security | DATA-004 | standard or destructive (+ sensitive) (+ security) | not exposed over MCP |

| `barrow.ops.actionable_diagnostics_and_recovery` | Actionable diagnostics and recovery | OPS-001 | standard (+ security) (+ live) | not exposed over MCP |

| `barrow.agt.turn_inbound_purchase_orders_into_validated_drafts` | Turn inbound purchase orders into validated drafts | AGT-001 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.agt.resolve_substitution_and_stock_exceptions` | Resolve substitution and stock exceptions | AGT-002 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.agt.prepare_a_credit_hold_resolution` | Prepare a credit-hold resolution | AGT-003 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.agt.explainable_sell_through_reorder_plans` | Explainable sell-through reorder plans | AGT-004 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.agt.follow_every_order_to_delivery_and_payment` | Follow every order to delivery and payment | AGT-005 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.agt.reconcile_a_wholesale_portal_cutover` | Reconcile a wholesale portal cutover | AGT-006 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.agt.plan_accountable_account_follow_up` | Plan accountable account follow-up | AGT-007 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.agt.agent_execution_and_proposal_provenance` | Agent execution and proposal provenance | AGT-008 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.ord.named_confirmation_export_layouts` | Named confirmation export layouts | ORD-017 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.ord.bulk_confirmation_and_production_exports` | Bulk confirmation and production exports | ORD-018 | standard or commitment (+ money) | not exposed over MCP |

| `barrow.auto.immutable_notification_submission_and_retry` | Immutable notification submission and retry | AUTO-009 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.quote_expiry_reminder_delivery` | Quote expiry reminder delivery | AUTO-010 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.verified_quote_delivery_callbacks` | Verified quote delivery callbacks | AUTO-011 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.failed_quote_contact_ownership` | Failed quote contact ownership | AUTO-012 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.notification_custody_and_inert_restoration` | Notification custody and inert restoration | AUTO-013 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.auto.quote_notification_handoffs_and_diagnostics` | Quote notification handoffs and diagnostics | AUTO-014 | standard or external (+ money) (+ commitment) | not exposed over MCP |

| `barrow.acc.rep_quote_notifications_and_contact_ownership` | Rep quote notifications and contact ownership | ACC-008 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.acc.rep_report_audience_and_saved_deliveries` | Rep report audience and saved deliveries | ACC-009 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.acc.frozen_rep_assignment_attribution` | Frozen rep assignment attribution | ACC-010 | standard or access (+ sensitive) | not exposed over MCP |

| `barrow.rpt.bounded_workspace_and_order_history_pages` | Bounded workspace and order-history pages | RPT-007 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.monthly_saved_report_definitions` | Monthly saved report definitions | RPT-008 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.recipient_bound_report_delivery` | Recipient-bound report delivery | RPT-009 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.report_snapshot_custody_and_restoration` | Report snapshot custody and restoration | RPT-010 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.bounded_account_directory_pages` | Bounded account directory pages | RPT-011 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.complete_duplicate_company_review` | Complete duplicate-company review | RPT-012 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.carrier_tracking_search` | Carrier tracking search | RPT-013 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.workspace_waiting_drafts_and_full_scope_indicators` | Workspace waiting drafts and full-scope indicators | RPT-014 | standard (+ sensitive) | not exposed over MCP |

| `barrow.rpt.report_notification_outcomes_and_suppression` | Report notification outcomes and suppression | RPT-015 | standard (+ sensitive) | not exposed over MCP |

**Resources.** `barrow://accounts/{id}`, `barrow://catalog/{id}`, `barrow://quotes/{id}`, `barrow://orders/{id}/revisions/{revision}`, `barrow://statements/{id}`, `barrow://releases/{id}`, `barrow://tasks/{id}`, `barrow://cutovers/{id}`.

**Events.** Account, quote, order, payment, fulfillment, task and cutover changes retain commercial record and provider source identities. **Prompts.** Price a wholesale order (SURFACE-007), read a PO (SURFACE-008), resolve a basket exception (SURFACE-009), reconcile a cutover (SURFACE-010), and follow delivery and payment (SURFACE-011).

**Not tools, and why.** BAR-006: installation fact: the separate public run site; BASE-001: installation fact: install, setup and the native lifecycle; MOB-001: a person's interactive responsive screen; REP-002: device-only iOS and Android offline storage and presentation; REP-003: device-only reconnection and offline synchronization; REP-006: device-only camera and Bluetooth scanner input; REP-007: device-only offline prospect capture; its synchronized application uses ACC-001; MOVE-001: the import door; cutover review and activation remain the specialist job under SURFACE-010; MOVE-002: the import door; cutover review and activation remain the specialist job under SURFACE-010; MOVE-003: the import door; cutover review and activation remain the specialist job under SURFACE-010; MOVE-004: the import door; cutover review and activation remain the specialist job under SURFACE-010; MOVE-005: the import door; cutover review and activation remain the specialist job under SURFACE-010; MOVE-006: the import door; cutover review and activation remain the specialist job under SURFACE-010; MOVE-007: the import door; cutover review and activation remain the specialist job under SURFACE-010; MOVE-008: the import door; cutover review and activation remain the specialist job under SURFACE-010; MOVE-009: the import door; cutover review and activation remain the specialist job under SURFACE-010.

**Limits.** The upload, body, page and format capacities in the [commercial reference](docs/COMMERCIAL-REFERENCE.md) protect the installation. Business thresholds and provider spend caps are the company's policy.

**Handoffs.** Listens for inventory acknowledgments, shipments, returns, provider payments and accounting reconciliation; emits account, order, exception and cutover events for the inventory, accounting and records specialists.

#### SURFACE-001 — Registry of wholesale jobs

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-013

**Requirement.** The wholesale tool registry covers the Core jobs in the table below and the installation, import and device exceptions stated here.

**Acceptance.**
1. Compare the declared Barrow tools, Core clause links and not-tool reasons with this contract on a populated wholesale installation.
2. For one buyer order, supplier decision, finance action and assigned-rep action, compare the tool result with the same native UI action on equivalent commercial records.

#### SURFACE-002 — Commercial and outside classes

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Barrow computes ordinary, outside, financial and binding effects from the current commercial records.

**Acceptance.**
1. An internal reversible cart or mapping edit carries standard with the affected item count.
2. A line-sheet share, quote notice or follow-up that exposes information outside the merchant carries external with the exact authorized recipient count and known, new or public counterparty.
3. A charge, refund, commission adjustment, changed charge or deposit carries money with the exact amount, original ISO currency and counterparty.
4. An accepted quote, order, sales terms, cutover activation or binding promise change carries commitment with its exact commercial revision, value and counterparty.

#### SURFACE-003 — Provider and authority classes

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Provider facts and current merchant authority determine Barrow account, gated, access and security calls.

**Acceptance.**
1. Creating a merchant account or paid resource at Stripe, Resolve or a shipping provider carries accounts with that provider.
2. A hosted card entry, merchant identity check or provider consent step that the outside provider keeps for a person carries gated with the provider and named step; the provider's agent route uses the company's policy.
3. A change to buyer membership, rep territory, functional role, device or agent grant carries access with the affected people and widening or narrowing direction.
4. A connector credential rotation, scanner credential change or protective-setting change carries security with the exact setting and provider.

#### SURFACE-004 — Irreversible, regulated and live classes

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Barrow separates irreversible commercial custody changes, regulated records and running connector behavior.

**Acceptance.**
1. An irreversible account or document erasure carries destructive with its affected record and attachment counts, after the commercial retention and hold rules select eligible data.
2. Reading or changing full personal tax identifiers, bank details, card data or regulated payment records carries sensitive with record count and data kind; an ordinary redacted catalog read does not.
3. Changing a running stock-feed schedule or active connector routing carries live with the affected installation service.
4. For each computed class above, changing an agent-supplied claim about confirmation, recipient or classification leaves the class and its source facts unchanged.

#### SURFACE-005 — Wholesale record resources

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-003

**Requirement.** Accounts, catalog items, quotes, orders and revisions, statements, fulfillment releases, tasks and cutover plans are the Barrow resource types.

**Acceptance.**
1. Read each declared resource type on the same account fixtures used by its Core clause and reconcile its commercial revision and source references.
2. Follow the resource returned by an order or cutover write and read that exact new revision.

#### SURFACE-006 — Wholesale change events

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-010

**Requirement.** Order, quote, payment, fulfillment, task and cutover changes retain their native commercial source identities in Barrow events.

**Acceptance.**
1. An accepted order, verified payment, source-confirmed shipment, task resolution and cutover activation each expose the affected record revision and source reference.
2. A replayed inventory or provider event preserves its one commercial effect and stable event identity on the corresponding order timeline.

#### SURFACE-007 — Catalog to exact wholesale order

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** The specialist completes the account-priced order journey with the merchant's actual assortment, selling units and minimums.

**Acceptance.**
1. Select an authorized account, inspect its line sheet and prices, build a size-matrix order, resolve one quantity exception and retain the exact commercial snapshot.
2. Under each company policy, submit the same fixture and reconcile the inventory acknowledgment, shortfall and eligible invoice quantities without treating an unknown source as success.

#### SURFACE-008 — PO intake with citations

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007

**Requirement.** The specialist uses AGT-001 to turn buyer source material into a validated wholesale draft.

**Acceptance.**
1. Process an email, spreadsheet, PDF and photographed PO with an ambiguous alias and show the cited source region for each extracted field.
2. Correct the ambiguity and complete the standard, external and commitment steps according to the company policy in force.

#### SURFACE-009 — Source-bound replacement basket

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-012

**Requirement.** The specialist uses AGT-002 and AGT-008 for one exact substitution basket.

**Acceptance.**
1. Compare replacement baskets with original lines, units, ATP and exact price, freight and tax differences.
2. Change the source stock or commercial revision and prove the obsolete basket has no effect; the refreshed basket follows the current money, commitment and external rules.

#### SURFACE-010 — Reconciled migration cutover

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-007, BASE-AGENT-012

**Requirement.** The specialist uses MOVE-007, MOVE-008 and AGT-006 without changing the authority of imported commercial history.

**Acceptance.**
1. Reconcile duplicated company names and a missing release to retained workbook and ledger citations, correct a mapping and activate the exact cutover under the company policy.
2. Identify every open order, invoice and stock authority and preserve native edits and inert restored history under RL-101.

#### SURFACE-011 — Owned delivery and collection follow-up

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-007, BASE-AGENT-009

**Requirement.** The specialist follows AGT-005 and AGT-007 through verified commercial outcomes.

**Acceptance.**
1. Prioritize a delayed shipment over a stock suggestion, retain a source-linked next contact date and route the outside message under the company policy.
2. Keep unanswered work assigned until verified delivery and payment or an attributed exception resolution, with mail acceptance distinct from a buyer response.

#### SURFACE-012 — Embedded wholesale agents share commercial decisions

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Barrow's PO, substitution, cutover and follow-up planners use the same commercial actions as outside specialists.

**Acceptance.**
1. Run one replacement basket and one follow-up through an embedded agent and through MCP under the same company policy; compare exact revisions, decisions and commercial effects.
2. A change in account authority or source records changes both routes consistently before the next effect.

#### SURFACE-013 — One seeded wholesale week

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-007, BASE-AGENT-013 · *Register:* R-5, R-6, R-7, R-8

**Requirement.** A stranger wholesale operations specialist completes one seeded business week through MCP with only the installation URL.

**Acceptance.**
1. Under the all-autonomous company policy, onboard a permitted account, price its matrix order, reconcile its inventory acknowledgment, handle one replacement, follow payment and delivery, and prepare one reconciled cutover without a policy hold.
2. Repeat the week under the held company policy: standard calls enter review and every other declared class follows that policy's approval rule; the named person completes those steps in the product.
3. Reconcile the resulting order quantities, original-currency amounts, provider sources, cutover authority and still-open follow-up ownership with the same seeded records.
4. Before policy setup is complete, the first Barrow call has no commercial effect and leads to the unanswered class questions.

## Push further

### Push further with account agents

#### AGT-001 — Turn inbound purchase orders into validated drafts

*Tier:* Core · *From:* AGT-001, BAR-003 · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** An account agent reads authorized buyer email, PDF, spreadsheet and photographed or handwritten PO images, maps buyer aliases to SKUs and extracts quantities, units, addresses, references and dates with source-page or region citations and confidence. It validates current account catalogs, prices, stock and terms and requests missing details. Draft preparation carries standard, contacting a buyer carries external, and accepting an order carries commitment; the company's policy decides each step. Revocable credentials offer catalog reads and validated draft preparation for a trade account. Preparation is standard; submission and acceptance carry commitment, invoice delivery carries external, erasure carries destructive, and changing grants carries access. The company's policy decides these calls; the recorded commercial identities distinguish preparation, submission and acceptance.

**Acceptance.**
1. Under the held company policy, Submit email, PDF and photographed POs containing an ambiguous SKU and a hostile instruction.
2. Under the held company policy, Review cited extraction and validation errors, correct the ambiguity and approve a draft.
3. Under the held company policy, Nothing is ordered or sent before the authorized person approves.
4. Under the held company policy, Issue a grant through the owner door, use the documented catalog and prepare-order commands, attempt each prohibited operation, revoke the grant and repeat the read.
5. Under the held company policy, Inspect the recorded preparing, submitting and approving identities.

#### AGT-002 — Resolve substitution and stock exceptions

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008

**Requirement.** Using original PO lines, account assortment, approved substitutes, units, current ATP and commercial constraints, the agent ranks substitutions or split windows with exact price, tax and freight differences. Changed stock or revisions invalidate the proposed basket. Changing charges carries money, releasing an accepted basket carries commitment, and contacting the buyer carries external; the company's policy decides the steps. The detailed commercial boundaries in [the AGT-002 reference](docs/COMMERCIAL-REFERENCE.md#agt-002) apply.

**Acceptance.**
1. Under the held company policy, Send a PO for a discontinued style, inspect two grounded substitutes and delivery options, decline one and approve a revised basket.
2. Under the held company policy, Change inventory before execution and require revalidation; no substitute ships without the required approval.

#### AGT-003 — Prepare a credit-hold resolution

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008

**Requirement.** The agent joins account balance, open invoices and orders, provider payment state, credit policy and buyer correspondence to explain a hold and prepare payment allocation, deposit or finance options. Moving or forgiving money carries money; a binding override or mandate carries commitment; changing purchasing authority carries access; a provider's own hosted-person step carries gated. The company's policy decides calls in these classes, and an agent cannot invent lender approval or settled funds.

**Acceptance.**
1. Under the held company policy, Create a held order with an unsettled ACH payment and disputed invoice.
2. Under the held company policy, Inspect a source-linked resolution plan, approve a deposit path and let finance release the hold only after verified events satisfy policy.

#### AGT-004 — Explainable sell-through reorder plans

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-001, BASE-ROLE-001

**Requirement.** With buyer-authorized sell-through from Shopify POS or Lightspeed Retail (X-Series) exports or APIs, other POS exports or a connected inventory feed, purchase cadence, seasonality, stock on hand, open orders and budget, the agent prepares a timed replenishment basket and explains each quantity. Absent sell-through is labelled unknown. Basket edits carry standard, purchase commitments carry commitment and money, and outside contact carries external; the company's policy decides each call.

**Acceptance.**
1. Under the held company policy, Load a stockist sales/stock feed with an outage and open prebook, compare the proposed basket to actual demand and commitments, edit it and approve once.
2. Under the held company policy, Show uncertainty for the outage and measure accepted, delivered and paid outcomes.

#### AGT-005 — Follow every order to delivery and payment

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008

**Requirement.** The account agent joins order and release acknowledgments, promised dates, inventory fulfillment, carrier events, invoices and provider settlements. It opens source-linked owned exceptions with reasons and next contact dates until delivery and payment are verified or a person records resolution. A label, sent message or pending bank state does not close the job. Promise changes carry commitment, refunds and collection carry money, and outside messages carry external; the company's policy decides each step. Verified service and payment exceptions feed AUTO-005.

**Acceptance.**
1. Under the held company policy, Lose an inventory acknowledgment, delay one parcel and return an ACH debit.
2. Under the held company policy, Inspect a source-linked action queue, approve outreach and resolve each real event; closure requires the verified delivery/settlement or an explicit attributed human exception.

#### AGT-006 — Reconcile a wholesale portal cutover

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-001, BASE-ROLE-001

**Requirement.** An agent compares retained incumbent exports with target accounts, variants, price books, locations, open orders, releases and receivables, proposes mappings and highlights count and value differences with source citations. Mapping edits carry standard and activating an exact cutover carries commitment; the company's policy decides each step. Source ledger authority stays explicit, retained history is inert, and native edits fence undo. The detailed commercial boundaries in [the AGT-006 reference](docs/COMMERCIAL-REFERENCE.md#agt-006) apply.

**Acceptance.**
1. Under the held company policy, Give the agent a real-shaped incumbent workbook and ledger export with duplicated company names and a missing release.
2. Under the held company policy, Inspect proposed mappings and reconciled totals, correct one mapping and sign off before applying.
3. Under the held company policy, Native edits continue to fence undo.

#### AGT-007 — Plan accountable account follow-up

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008

**Requirement.** The agent uses actual quote conversations, abandoned carts, order cadence, visits, buyer preferences and unresolved service and payment tasks to prepare the next useful rep action and a grounded message. Service uncertainty precedes stock discussion; work stays assigned until a buyer responds or a rep records resolution. Planning carries standard and sending outside carries external; the company's policy decides each step, including review of recipient, content and timing and suppression. The detailed commercial boundaries in [the AGT-007 reference](docs/COMMERCIAL-REFERENCE.md#agt-007) apply.

**Acceptance.**
1. Under the held company policy, Present an account with a delayed delivery and an unanswered quote.
2. Under the held company policy, Review a plan that addresses the delivery before proposing more stock, approve one message and suppress another; unanswered work stays assigned until the buyer responds or a rep resolves it.

#### AGT-008 — Agent execution and proposal provenance

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Every agent proposal retains source data, tool permissions, model and run identity, freshness, exact proposed effects and the company's policy decision, with account-scoped revocation and company-set cost and contact limits. A commercial commitment carries commitment, a charge or refund carries money, and outside communication carries external. The company's policy decides each call. Stale data, revoked authority and prompt-injected documents cannot change the authorized commercial basis; history retains the reason. The detailed commercial boundaries in [the AGT-008 reference](docs/COMMERCIAL-REFERENCE.md#agt-008) apply.

**Acceptance.**
1. Under the held company policy, Approve a substitution proposal, change its source price and revoke its grant before execution.
2. Under the held company policy, Refuse the stale/revoked effect, show its provenance and approval in history and execute a newly reviewed revision once after reauthorization.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader pass | MOB-001 | not run | | |
| R-2 | VPAT assessment | MOB-001 | not run | | |
| R-3 | iOS App Store approval | REP-002 | not run | | |
| R-4 | Android store approval | REP-002 | not run | | |
| R-5 | Claude client interoperability receipt | SURFACE-013 | not run | | |
| R-6 | ChatGPT client interoperability receipt | SURFACE-013 | not run | | |
| R-7 | Codex client interoperability receipt | SURFACE-013 | not run | | |
| R-8 | Copilot client interoperability receipt | SURFACE-013 | not run | | |
| R-9 | Live Resend merchant-tenant delivery receipt | AUTO-003, AUTO-009, AUTO-010, AUTO-011, AUTO-012, AUTO-013, AUTO-014 | not run | | |

## Boundaries

- Barrow owns wholesale buying, rep work and commercial follow-through. Pier or the selected inventory adapter owns stock; Pantry or the connected accounting system owns the general ledger. Nectar owns subscription and usage billing; Orbit owns general CRM.
- A sandbox, official-schema fixture or seeded run does not claim live merchant enrollment, vendor certification, store approval or carrier execution.
- Historical AUD orders retain their original currency and cents; new US orders default to USD.
- Public application documents remain quarantined without the configured scanner required by RL-1. Static format checks are not malware screening.
- The run site is distinct from an installed Lobby and exposes no installation data.

## Homepage claims

| # | Claim | Clauses |
| --- | --- | --- |
| 1 | Wholesale orders, shipped and paid. | ORD-006, SHIP-003, PAY-001, PAY-002 |
| 2 | Each stockist gets its own prices and line sheets. | CAT-001, CAT-003, PRI-001 |
| 3 | Orders arrive online, from reps and at trade shows. | ORD-006, REP-001, REP-002, REP-005 |
| 4 | Every order is followed to delivery and payment. | AGT-005 |
| 5 | Off NuORDER, line sheets and all. | MOVE-001, MOVE-009, CAT-003 |
| 6 | Preview everything that moves, invite buyers, then take orders in Barrow. | MOVE-001, MOVE-007, ACC-001, ORD-006 |
| 7 | One line sheet, each stockist’s own prices. | CAT-003, PRI-008 |
| 8 | Send a spring line sheet to many boutiques in one go. | CAT-011 |
| 9 | Each stockist opens its own prices and orders from the page. | CAT-003, CAT-007, ORD-006 |
| 10 | Attach one priced PDF per stockist. | CAT-003, CAT-011 |
| 11 | Show wholesale and MSRP, margin or wholesale only by account. | PRI-008, CAT-003 |
| 12 | Measure line-sheet delivery, views and orders from the link. | CAT-011, RPT-002 |
| 13 | Written at the booth, size by size. | REP-001, REP-005, CAT-007 |
| 14 | Scan a hang tag and fill the size run beside the line sheet. | REP-006, REP-002, CAT-007 |
| 15 | Capture the buyer’s signature on an iPad. | REP-002, ORD-015 |
| 16 | Keep every order through a lost show connection. | REP-002, REP-003 |
| 17 | Upload each offline draft once and return changed prices to the buyer. | REP-003 |
| 18 | Prebooked in October, shipped in two windows. | ORD-008, ORD-009 |
| 19 | Book spring in one sitting with two windows and a 30% deposit. | ORD-008, PAY-003 |
| 20 | Show incoming supply separately from available-now stock. | STK-002, ORD-008 |
| 21 | Allocate deposits to the correct later releases. | PAY-003 |
| 22 | Walk-up Wednesday, stockist by Monday. | REP-007, ACC-001 |
| 23 | Keep a prospect draft unsubmitted until its account is approved. | REP-007 |
| 24 | A photographed PO, a checked order. | AGT-001 |
| 25 | Extract grounded PO quantities and correct ambiguous products. | AGT-001, PRI-007 |
| 26 | To the door, and to the bank. | AGT-005, SHIP-003, PAY-002 |
| 27 | Draft the note when carrier delivery or bank payment slips. | AGT-005, AGT-007 |
| 28 | A label, sent email or pending ACH never closes an order. | AGT-005, PAY-002, SHIP-003 |
| 29 | Every open order has an owner. | AUTO-005, AGT-005 |
| 30 | Show exact invoices, net terms, payments and closing balance. | PAY-007, PAY-008 |
| 31 | Your systems stay in charge. | INT-001, INT-002, INT-004, STK-003 |
| 32 | Connected ERP orders reconcile to their source. | INT-004, INT-020, STK-003 |
| 33 | Four weeks, line sheet to paid. | CAT-003, ORD-006, SHIP-003, PAY-001, PAY-002 |
| 34 | Monday after market. Orders out, money in. | STK-003, SHIP-003, PAY-001, PAY-002 |
| 35 | 100% free and open source. MIT licensed. | BASE-001 |

## Retired clauses

| ID | Now | Reason |
| --- | --- | --- |
| BAR-001 | merged into ACC-005 | The published snapshot restated this capability; its distinct acceptance and custody outcomes are retained there. |
| BAR-002 | merged into ORD-010 | The published snapshot restated this capability; its distinct acceptance and custody outcomes are retained there. |
| BAR-003 | merged into AGT-001 | The published snapshot restated this capability; its distinct acceptance and custody outcomes are retained there. |
| BAR-004 | merged into MOVE-007 | The published snapshot restated this capability; its distinct acceptance and custody outcomes are retained there. |
| BAR-005 | merged into DATA-001 | The published snapshot restated this capability; its distinct acceptance and custody outcomes are retained there. |

## Status

Judged from the code and tests at commit `8d652780a7f6bc1f7cbdbf2230f9d5e61b370dba` (28 October 2026). INT-014 candidate evidence is the code and tests in this tree, subject to exact-candidate Verify and guarded landing; its broader scheduled-feed duties remain with INT-020. ORD-015 conforms to today’s per-account assignment, order submission and confirmation doors. REP-004 conforms to today’s acceptance, shipment and physical-return records; verified partial-payment and credit events remain receiving obligations of PAY-003, PAY-010 and SHIP-004. DATA-003 conforms to the ct scope-review-56 §E owner-erasure and independent restore-journal boundary; ORD-014 is complete under ct’s 22 October 2026 22:15Z approval of its landed product-image custody, with the separate DATA-001 media-manifest and DATA-004 malware-screening obligations for CAT-002 unchanged. CAT-010 is a partial implementation with current public-door evidence below; its candidate SHA and run receipts accompany the branch handoff.

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 0 | 1 | 0 | 1 |
| Target and push further | 4 | 105 | 57 | 166 |
| All | 4 | 106 | 57 | 167 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `BAR-006` | Run site | published | partial | `src/site/pages.ts`; `src/site/docs/pages.ts`; `tests/site.test.mjs` | The cited evidence exercises run site. Traced assertions cover A missing guide serves the actual built 404 document; Guide navigation reaches a rendered article. The outcome-level assertion trace is incomplete for: Build with rer build --site; serve the output; traverse the homepage; /run; guide navigation; local assets; a missing guide; Confirm the installed route keeps its Lobby; the site contains no private account data.  |
| `ACC-001` | Trade applications and approval | target | partial | `tests/api/flows.test.mjs` — “trade applicant verification, duplicate-reviewed decisions, quarantined certificates, usage reacceptance and owner custody through HTTP”: public form fields and email verification; duplicate-reviewed request/approve/decline, quarantined document uploads and existing certificates; both parties’ status and native invitation; unknown-person price exclusion; usage person/version/hash/time and reacceptance; scoped exports, retention nomination/erasure and restore fence. `tests/journeys/applications.test.mjs` — “native trade application, review, private status, usage acceptance and retention screens at desktop and phone”: UI journey at 1440/390. | Public application certificate screening and downloadable review await the owner-configured scanner processor and Base adapter required by ct 22 October 15:46Z. Without it uploads and existing documents remain quarantined; no malware verdict is claimed. |
| `ACC-002` | Company buyers and purchasing rights | target | partial | `tests/api/flows.test.mjs` — “company buyers: native invitations, scoped purchasing approval, finance, shared lists, exact recipients and one-user erasure”: legacy administrator and native seven-day exact-email invitations/collision review; explicit user/location limits, no supplier powers, last-administrator and cross-company refusals; within-limit submission, distinct-person company release with current rights/limits/prices/stock and both identities; finance invoice/statement/export and ordering refusal; purchasing-only shared lists/thread, private lists/internal notes hidden; exact quote/expiry recipients, dispatch revocation, supplier-owned transfer and owner-reviewed one-user erasure/hold/restore fence with commercial attribution retained. The same file’s “trade applicant verification, duplicate-reviewed decisions, quarantined certificates, usage reacceptance and owner custody through HTTP” proves the approved first buyer becomes company administrator. `tests/journeys/company.test.mjs` — “company administrator invites four native users, limited purchaser waits for another approver, finance reads invoices, shared lists and removal at desktop and phone”: real built Worker/Pier screens, approvals, downloads, collision review, removal and erasure at 1440/390. | The cited evidence exercises company buyers and purchasing rights. Traced assertions cover The released order records purchaser and approver identities; Finance reads the source invoice on its statement; Quote notices reach current purchasing recipients and omit finance; Expiry delivery has the exact current recipient list and no replay. The outcome-level assertion trace is incomplete for: Invite four company users; build a cart as a limited purchaser; approve it as the authorized approver; read its statement as finance; refuse finance ordering; cross-company administration; Before shipping; route AUTO-003 emails; expiry reminders to the company purchasers with current rights; retaining exact recipient identity/revocation; private internal notes.  |
| `ACC-003` | Billing and delivery locations | target | partial | `src/barrow/locations.ts`; `src/barrow/us-address.ts`; `src/barrow/ui/locations.tsx`; `src/barrow/orders.ts`; `src/barrow/export.ts`; `tests/api/locations.test.mjs` | The cited address test asserts both store jurisdictions, names, the original delivery instructions and source revision after a default change. It does not compare every copied bill-to and ship-to address field after that change; full address immutability remains unasserted. |
| `ACC-004` | Account lifecycle and commercial profile | target | partial | `src/barrow/accounts.ts`; `src/barrow/account-profile.ts`; `src/barrow/imports/service.ts`; `src/barrow/orders.ts`; `src/barrow/ui/account-form.tsx`; `tests/api/flows.test.mjs`; `tests/api/order-guarantee.test.mjs` | The cited evidence exercises account lifecycle and commercial profile. Traced assertions cover Closed-account history preserves the original order; The buyer still reads an identical issued invoice; Recovery after closure leaves one inventory order. The outcome-level assertion trace is incomplete for: Record the commercial profile; place an order; hold then close its account; attempt checkout through the buyer; agent HTTP doors; including submission; first approval of earlier drafts; History; invoices remain readable to the same authorized buyer; new orders are refused; a duplicate email cannot take over the company; Recover an already-approved lost reservation response after closure without a second stock command; Refuse an unreviewed or stale duplicate-company save; review separate companies; import a duplicate-bearing CSV plan; inspect the attributed review through an owner export; original identities; native profile fields survive.  |
| `ACC-005` | Supplier roles and separation of duties | target | partial | `tests/api/application-followup.test.mjs`; `tests/journeys/application-routing.test.mjs`; `tests/api/staff.test.mjs`; `tests/journeys/staff.test.mjs`; `tests/journeys/applications.test.mjs`; `tests/journeys/credit-payments.test.mjs`; `src/barrow/access.ts`; `src/barrow/accounts.ts`; `src/barrow/api.ts`; `tests/api/flows.test.mjs` | The cited evidence exercises supplier roles and separation of duties. The outcome-level assertion trace is incomplete for: Invite each supplier role; attempt a credit override as a rep; a catalog edit as operations; allow the authorized finance; manager actions; inspect attributed audit events; Before shipping; each new functional supplier role; including invited analyst/finance operators for outside accountants or buyer AP; becomes eligible for RPT-006 only for its entitled report types; Outside recipients are invited operators; never bare addresses; Using the native sign-in; HTTP commands; read as two different buyers; attempt foreign account reads; cross-origin writes; supplier actions as a buyer; then revoke an agent grant; Unauthorized requests return no commercial data; perform no mutation. Functional application review and AUTO-001 routing/tasks/escalation are proven for current all-account sales-manager `applications` grants, with finance certificate-only and other-role refusals. PAY-010 credit and refund decisions now have explicit account-scoped finance allowances and current grant admission. PAY-004/005 credit override and hold doors, INT-002/003 and SHIP-004 still inherit source-backed role and amount admission; ACC-005 stays partial under ct’s 21 October ruling until the finance doors ship. ACC-006 coverage is implemented. |
| `ACC-006` | Rep territories and delegated coverage | target | partial | `src/barrow/rep-scope.ts`; `src/barrow/rep-assignments.ts`; `src/barrow/quote-routing.ts`; `migrations/core/0035_rep_assignments.sql`; `tests/api/rep-territories.test.mjs` — “ACC-006 / ACC-008 / ACC-009 / ACC-010: managers assign reps to territories and accounts with dated coverage; access, quote routing, reports, tasks, commissions and sends follow the current assignment and no history is rewritten”: assign/cover/end/transfer authority and refusals, overlap and past-date refusals, disjoint reps (assignment and coverage), vacation coverage then expiry through the stored dates, buyer-visible current rep names, ORD-005 notices/thread/AUTO-003 mail and expiry reminders to the holding reps, discount approvals to owner/admin, failed-contact task ownership and reassignment, AUTO-005 queue/source links/export, RPT-001 and RPT-004 account/territory/partial-territory refusals through page and CSV, REP-004 statements and CSV with frozen attribution across a transfer, RPT-006 saved-filter refusals, cancelled queued send, revoked link and system audit, order access, RPT-002 rep rows retained by the assignment name. `tests/journeys/territories.test.mjs` — “manager assigns, covers and transfers rep territories; the rep, the buyer and the manager each see only the current assignment at desktop and phone”: owner/manager assignment, coverage and transfer forms, the rep’s own-assignments card, the buyer’s current rep and the ended assignment at 1440/390. | The cited evidence exercises rep territories and delegated coverage. The outcome-level assertion trace is incomplete for: Assign two reps disjoint accounts; give one temporary vacation coverage; expire it; Order; export access follows current assignments; a rep is an active Native member whose ACC-005 grant is the rep role; A rep holds an account on a calendar day in America/New_York (inclusive dates) only through a primary assignment of that exact account or of every account whose profile territory equals the named territory; temporary coverage of an account; a territory or everything another rep primarily holds (coverage requires an end date; never moves commission attribution); or an exact account the owner listed on the grant; Profile assigned-rep; territory text; rep labels; names grant nothing; Owner; admin; an all-account sales manager assign; cover; end; transfer with a reason; every change is revision-guarded; immediate; audited (assignment; coverage; ending; transfer events); at most one primary rep holds an account on any day; no earlier order; quote; notice; commission snapshot or audit event is rewritten; One current-scope definition feeds the staff account scope; so catalog; order; invoice; export; report; task doors follow it with no second list; a write that read an older scope fails its guard; Archives restore assignments as ended (restored grants are already revoked); unused-account erasure removes that account’s assignments.  |
| `ACC-008` | Rep quote notifications and contact ownership | target | partial | `src/barrow/rep-scope.ts`; `src/barrow/rep-assignments.ts`; `src/barrow/quote-routing.ts`; `migrations/core/0035_rep_assignments.sql`; `tests/api/rep-territories.test.mjs` — “ACC-006 / ACC-008 / ACC-009 / ACC-010: managers assign reps to territories and accounts with dated coverage; access, quote routing, reports, tasks, commissions and sends follow the current assignment and no history is rewritten”: assign/cover/end/transfer authority and refusals, overlap and past-date refusals, disjoint reps (assignment and coverage), vacation coverage then expiry through the stored dates, buyer-visible current rep names, ORD-005 notices/thread/AUTO-003 mail and expiry reminders to the holding reps, discount approvals to owner/admin, failed-contact task ownership and reassignment, AUTO-005 queue/source links/export, RPT-001 and RPT-004 account/territory/partial-territory refusals through page and CSV, REP-004 statements and CSV with frozen attribution across a transfer, RPT-006 saved-filter refusals, cancelled queued send, revoked link and system audit, order access, RPT-002 rep rows retained by the assignment name. `tests/journeys/territories.test.mjs` — “manager assigns, covers and transfers rep territories; the rep, the buyer and the manager each see only the current assignment at desktop and phone”: owner/manager assignment, coverage and transfer forms, the rep’s own-assignments card, the buyer’s current rep and the ended assignment at 1440/390. | The cited evidence exercises rep quote notifications and contact ownership. The outcome-level assertion trace is incomplete for: Before shipping; route AUTO-003 emails; expiry reminders to the assigned or covering rep; scope failed-contact task ownership/reassignment to current coverage; rep profile metadata alone grants nothing; Buyers see the names of the account’s primary; covering reps; the coverage end date; never identities or contact details; Supplier-side quote notices (request; buyer message; internal note; acceptance) name the account’s current assigned; excluding the actor; in-app; by AUTO-003 mail; a revision waiting for discount approval; an account with no current rep keep the owner/admin audience; an owner or admin marking a quote read clears only their own notices; a rep reads only quote threads of accounts they hold; Dispatch rechecks the rep’s current hold; withdraws a recipient who lost it without substitution; expiry reminders go to the buyer; the reps who hold the account that day (owner/admin only when none does); A failed-contact task starts with the proposing rep while they hold the account; only current holders (or owner/admin) can be assigned or read it; AUTO-005 next actions; source links; the follow-up export carry only held accounts.  |
| `ACC-009` | Rep report audience and saved deliveries | target | partial | `src/barrow/rep-scope.ts`; `src/barrow/rep-assignments.ts`; `src/barrow/quote-routing.ts`; `migrations/core/0035_rep_assignments.sql`; `tests/api/rep-territories.test.mjs` — “ACC-006 / ACC-008 / ACC-009 / ACC-010: managers assign reps to territories and accounts with dated coverage; access, quote routing, reports, tasks, commissions and sends follow the current assignment and no history is rewritten”: assign/cover/end/transfer authority and refusals, overlap and past-date refusals, disjoint reps (assignment and coverage), vacation coverage then expiry through the stored dates, buyer-visible current rep names, ORD-005 notices/thread/AUTO-003 mail and expiry reminders to the holding reps, discount approvals to owner/admin, failed-contact task ownership and reassignment, AUTO-005 queue/source links/export, RPT-001 and RPT-004 account/territory/partial-territory refusals through page and CSV, REP-004 statements and CSV with frozen attribution across a transfer, RPT-006 saved-filter refusals, cancelled queued send, revoked link and system audit, order access, RPT-002 rep rows retained by the assignment name. `tests/journeys/territories.test.mjs` — “manager assigns, covers and transfers rep territories; the rep, the buyer and the manager each see only the current assignment at desktop and phone”: owner/manager assignment, coverage and transfer forms, the rep’s own-assignments card, the buyer’s current rep and the ended assignment at 1440/390. | The cited evidence exercises rep report audience and saved deliveries. The outcome-level assertion trace is incomplete for: Before shipping; RPT-009 scheduled report sends; downloads require current assigned/covered-account access to the whole saved filter; narrower access is refused with an attributed reason; never trimmed; Assignment changes revoke existing links; cancel queued deliveries; Scheduled-report recipients must hold the one saved account when the report freezes; sends; is opened; an assignment ending cancels their queued sends at once; revokes links; records a system audit event; territory filters stay with all-account readers.  |
| `ACC-010` | Frozen rep assignment attribution | target | partial | `src/barrow/rep-scope.ts`; `src/barrow/rep-assignments.ts`; `src/barrow/quote-routing.ts`; `migrations/core/0035_rep_assignments.sql`; `tests/api/rep-territories.test.mjs` — “ACC-006 / ACC-008 / ACC-009 / ACC-010: managers assign reps to territories and accounts with dated coverage; access, quote routing, reports, tasks, commissions and sends follow the current assignment and no history is rewritten”: assign/cover/end/transfer authority and refusals, overlap and past-date refusals, disjoint reps (assignment and coverage), vacation coverage then expiry through the stored dates, buyer-visible current rep names, ORD-005 notices/thread/AUTO-003 mail and expiry reminders to the holding reps, discount approvals to owner/admin, failed-contact task ownership and reassignment, AUTO-005 queue/source links/export, RPT-001 and RPT-004 account/territory/partial-territory refusals through page and CSV, REP-004 statements and CSV with frozen attribution across a transfer, RPT-006 saved-filter refusals, cancelled queued send, revoked link and system audit, order access, RPT-002 rep rows retained by the assignment name. `tests/journeys/territories.test.mjs` — “manager assigns, covers and transfers rep territories; the rep, the buyer and the manager each see only the current assignment at desktop and phone”: owner/manager assignment, coverage and transfer forms, the rep’s own-assignments card, the buyer’s current rep and the ended assignment at 1440/390. | The cited evidence exercises frozen rep assignment attribution. The outcome-level assertion trace is incomplete for: Historical commission attribution survives a transfer; A rep’s sales; finance report names one held account or a territory held completely (page; CSV); any other account or territory; or an unfiltered report; is refused; never trimmed; a rep’s commission statement is bound to their fixed label; lists only accounts held today; while owner; admin; all-account managers still read every frozen statement; New first approvals freeze the fixed commission label of the single primary rep (else the account’s recorded assigned-rep text) so a transfer changes future attribution only; RPT-002 rep rows use the primary assignment; else the ACC-004 text.  |
| `ACC-007` | Buyer purchasing approvals | target | partial | `src/barrow/company-routes.ts`; `src/barrow/company-approval.ts`; `src/barrow/company-purchase.ts`; `src/barrow/orders.ts`; `migrations/core/0036_company_approval.sql`; `tests/api/company-approvals.test.mjs` — “ACC-007: amount and location routes run sequential approvers with delegation, escalation, withdrawal and fresh approval after any material change”: administrator-only route saves with approver, escalation and location validation and kept revisions; a $6,000 cart above the purchaser limit frozen on a two-step route; refusal of a lower-rights buyer, an unnamed approver, an administrator, step skipping, the preparer, an agent and the supplier; delegation to a current approver only, with the delegate deciding step 1 and a different person step 2 before supplier approval; ended delegation; revised quantities needing fresh approval at every step; withdrawal by submitter or administrator and refusal for others; escalation after the recorded time with audit; price, address and account terms changes voiding approvals; a location rule; unchanged ACC-002 below every rule; protected route references. `tests/journeys/approvals.test.mjs` — “a company administrator sets a two-step route and delegation; a $6,000 cart waits, is approved in order by a delegate and finance, then released at desktop and phone”: the Company-page route and delegation forms, the waiting step, the delegate’s and finance’s approvals and release at 1440/390. | The cited evidence exercises buyer purchasing approvals. The outcome-level assertion trace is incomplete for: Submit a $6,000 cart above a purchaser limit; complete two approvals; revise quantities; require fresh approval; Delegate an absent approver; prove a lower-rights buyer cannot bypass the route. |
| `CAT-001` | Private account assortments | target | partial | `src/barrow/accounts.ts`; `src/barrow/pier.ts`; `tests/api/flows.test.mjs` | The cited evidence exercises private account assortments. The outcome-level assertion trace is incomplete for: Sign in as two buyers with different price lists; request both catalogs; direct API paths; each sees only its own priced items; no upstream credentials.  |
| `CAT-002` | Product discovery and media | target | partial | `tests/api/catalog-search.test.mjs` — “catalog search finds entitled SKU, barcode and text with stable pages and observed-stock variant filters” proves SKU/barcode/name lookup, stable 25-row pages, style/color/size and observed availability filters, retirement refresh and failure preserving the prior observation; “catalog search enforces current account authority and invalidates observations after price, attribute or connection changes” proves buyer isolation, anonymous/agent refusal, supplier-only refresh and invalidation. `tests/journeys/catalog-search-scale.test.mjs` — “10,000-variant public catalog SKU, barcode and filtered first-page searches have p95 at most one second” is the committed journey outside push Verify; exact-candidate receipt: sx-barrow-c39-scale-1 (reported by the lane; completion requires its passing receipt). | Search API foundation only. Private images/zoom/specifications/attachments and their entitlement, category/season/description search and buyer search UI remain unbuilt. DATA-001 product/media JSON/CSV manifests, MOVE-007 catalog/media reconciliation and fingerprint approval, and DATA-003 broader media custody/holds/review/erasure remain unproved. DATA-004 malware screening needs the owner-provisioned scanner and Base adapter. Search stock is a dated supplier-refreshed observation; ordering retains live Pier checks. |
| `CAT-003` | Digital line sheets | target | partial | `tests/api/line-sheets.test.mjs` — “recipient seasonal sheets retain exact variants, columns, ship windows and revision, and revocation closes every sheet door”: seasonal recipient snapshot, variants/barcodes/packs/availability/window/revision, scoped sales-manager publication/import/revocation, rep/operations refusals, cross-account page/PDF/form/preview refusal and revoked page/PDF/form/activity/preparation refusal. `tests/api/line-sheets.test.mjs` — “line-sheet size runs and fixed assortments preview exact extended-size prices, preserve Pier SKU quantities, and refuse unavailable sizes without redistribution”: exact size-run plus fixed-case quantities, higher-priced extended size, per-size wholesale/MSRP snapshots, real pinned Pier handoff, exhausted-size refusal without reallocation, uploaded matrix merge/replace and explicit PRI-003 corrections. `tests/api/pricing.test.mjs` — “MSRP books import and edit exact USD/CAD cents and preserve configured sheet, PDF and order document prices without changing wholesale totals”: import/edit/export of USD and CAD variant MSRP; missing MSRP; wholesale/both/retail sheet page and PDF; independently configured immutable confirmation PDF and order CSV columns; exact ISO minor units and 50.00%/59.98% margin; wholesale-only order totals, exact CAD cart-form CSV round-trip, USD-rate refusal for CAD quotes and stale-book refusal. `tests/api/line-sheets.test.mjs` — “line-sheet buyer opens and visible-item views appear independently in the scoped quote conversion report”: distinct buyer opens/views/SKU counts, account/period scoping and supplier-preview exclusion. `tests/journeys/line-sheets.test.mjs` — “supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone”: built Worker and native sessions; account retail controls, price-book import, seasonal publication, both recipient pages/PDF/CSV, phone preparation/submission, CAD catalog/quotes/reorder, per-buyer report and revoked open-page request at 1440/390. | The cited evidence exercises digital line sheets. The outcome-level assertion trace is incomplete for: Publish a spring line sheet showing wholesale; MSRP to one account; a wholesale-only sheet to another account with different prices; order from each on a phone; export each account PDF; Each page; PDF shows exactly its configured price columns; a revoked share cannot expose the sheet or another account price.  |
| `CAT-004` | Shoppable lookbooks and presentations | target | missing |  | Implement shoppable lookbooks and presentations and prove the stated journey. |
| `CAT-005` | Branded responsive storefront | target | partial | `src/barrow/ui/app.tsx`; `src/barrow/ui/order-pad.tsx` | Responsive Barrow catalog exists; merchant branding, domains and full checkout journey are missing. |
| `CAT-006` | Multiple brands and buying profiles | target | partial | `tests/api/pricing.test.mjs` — “CAT-006: one company buyer deliberately selects approved brand price books; exact currencies, sellers and accepted terms survive orders, invoices and later seller edits”: two independent USD and CAD brands and books, first-only approval and second-profile refusal, explicit second approval, exact current-profile carts despite forged currency and price input, cross-seller cart refusal, brand terms and newest-version acceptance, exact seller and ISO currency on invoice CSV and exports, historical seller preservation, quote conversion, revoked approval refusal, inactive restored grants and account erasure. `tests/journeys/line-sheets.test.mjs` — “owner approves two brand price books and one company buyer deliberately switches between their sellers, currencies and sales terms at desktop and phone”: built Worker settings, first profile selection and purchase, seller and terms review, native second-profile approval, deliberate switch and second purchase, both accepted invoice end states and downloads at 1440 and 390. Controls have visible words. Inherited legacy currency preservation remains proved by `tests/api/data-export.test.mjs` — “DATA-001: owner and buyer export open JSON/CSV commercial records that reconcile, resolve documents and stay in scope”. | The cited evidence exercises multiple brands and buying profiles. The outcome-level assertion trace is incomplete for: Configure two brands; a buyer approved for one; refuse the other brand; then approve a second profile; switch; Each cart; invoice; export names the correct seller; ISO currency; retaining exact integer minor units without conversion by relabeling.  |
| `CAT-007` | Style color size and assortment matrices | target | partial | `tests/api/line-sheets.test.mjs` — “line-sheet size runs and fixed assortments preview exact extended-size prices, preserve Pier SKU quantities, and refuse unavailable sizes without redistribution”: exact size-run plus fixed-case quantities, higher-priced extended size, per-size wholesale/MSRP snapshots, real pinned Pier handoff, exhausted-size refusal without reallocation, uploaded matrix merge/replace and explicit PRI-003 corrections. `tests/journeys/line-sheets.test.mjs` — “supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone”: built Worker and native sessions; account retail controls, price-book import, seasonal publication, both recipient pages/PDF/CSV, phone preparation/submission, CAD catalog/quotes/reorder, per-buyer report and revoked open-page request at 1440/390. | The cited evidence exercises style color size and assortment matrices. The outcome-level assertion trace is incomplete for: Order a size run that includes a higher-priced extended size; a case assortment through a line-sheet matrix; inspect exact SKU quantities; per-size prices in the order; inventory handoff; reject an unavailable size without silently reallocating it.  |
| `CAT-008` | Season and catalog publishing | target | missing |  | Implement season and catalog publishing and prove the stated journey. |
| `CAT-009` | Bulk product and catalog maintenance | target | partial | `tests/api/move-rehearsal.test.mjs` — “CAT-009: owner previews a real catalog workbook, corrects duplicate barcodes and broken media, applies the approved fingerprint and exports stable source identities”: invalid workbook, corrected apply and open exports, Pier-owned field refusal, duplicate variants, explicit removals, read-only source against planned counts, absent financial sums, rejected fields and missing entities, exact attributed import.approved fingerprint, private image reference custody and buyer and agent refusal. Runs in Verify (4/4). `tests/journeys/catalog-maintenance.test.mjs` — “owner previews duplicate-barcode and broken-media XLSX, corrects the workbook, approves its fingerprint and downloads applied metadata at desktop and phone”: built Worker upload, preview, approval, applied end state and real downloads at 1440 and 390, run through heavy-slot outside push Verify. Every control has visible words. | The cited evidence exercises bulk product and catalog maintenance. The outcome-level assertion trace is incomplete for: Preview a product workbook containing a duplicate barcode; broken media reference; correct it; apply; export; A source-owned field edit is refused or explicitly routed to that source.  |
| `CAT-010` | Bulk image upload and naming rules | target | partial | `tests/api/move-rehearsal.test.mjs` — “CAT-010: private batch preview, held style import and same-slot replacement preserve positions and deduplicate sanitized bytes” proves exact style and color targets and positions, misspelling reasons, read-only preview and stale approval refusal, automatic held-file attachment, changed-byte replacement with one slot on replay, metadata stripping and one stored copy, ZIP extraction and 1,000 matched files, archive restoration and current private-door refusals. `tests/journeys/catalog-maintenance.test.mjs` — “owner previews duplicate-barcode and broken-media XLSX, corrects the workbook, approves its fingerprint and downloads applied metadata at desktop and phone” proves built-screen batch preview, reasons, later workbook attachment and replacement at 1440 and 390; Verify shard 4 invokes this journey. | Conservative default pending ct approval: owner or admin only; baseline or progressive RGB or grayscale JPEG only, at most 200 KiB; metadata removed before hashing; bytes stay in this installation’s D1 and archives, no independent media download and no external processor. Unknown valid JPEGs retain bytes; malformed, unsupported and oversize files retain only filename and reason. Later imports fill empty slots only; occupied slots require explicit re-upload. Batches accept up to 1,000 files within 30 MiB, with ZIP input bounded to 20 MiB; larger aggregate batches remain unproved. Broader CAT-002 buyer media entitlement, all-slot line-sheet and PDF delivery, CAT-004 lookbooks, REP-007 offline cache, DATA-001 complete media manifests and DATA-003 explicit media review, holds and erasure remain. DATA-004 malware screening requires an owner-provisioned scanner and Base adapter; no malware verdict is claimed. No DONE claim. |
| `CAT-011` | Line sheet group sends and campaigns | target | missing |  | Group sends, saved segments, suggested-products order forms, per-recipient priced links and campaign tracking are not implemented. |
| `PRI-001` | Negotiated USD price books | target | done | `src/barrow/imports/validation.ts`; `src/barrow/invoice.ts`; `src/barrow/ui/types.ts`; `tests/api/order-guarantee.test.mjs` |  |
| `PRI-002` | Quantity breaks and account discounts | target | partial | `src/barrow/pricing.ts`; `src/barrow/imports/validation.ts`; `src/barrow/orders.ts`; `src/barrow/ui/order-pad.tsx`; `tests/api/pricing.test.mjs` | The cited evidence exercises quantity breaks and account discounts. The outcome-level assertion trace is incomplete for: Price quantities just below; above a volume break; combine an account discount; a negotiated override; verify the displayed rule; exact total survive the order snapshot.  |
| `PRI-003` | Case packs minimums and increments | target | partial | `src/barrow/quantity-rules.ts`; `src/barrow/unit-lines.ts`; `src/barrow/imports/validation.ts`; `src/barrow/imports/csv.ts`; `src/barrow/ui/order-pad.tsx`; `src/barrow/ui/style-matrix.tsx`; `src/barrow/ui/account-form.tsx`; `tests/api/case-packs.test.mjs` | The cited evidence exercises case packs minimums and increments. Traced assertions cover The API exposes the configured minimum and pack refusal; A buyer-selected correction orders exactly the selected quantity. The outcome-level assertion trace is incomplete for: Enter below-minimum; non-case quantities in the cart; CSV; API; then split a valid order; Each door enforces the configured rules; requires the buyer to accept any corrected quantities.  |
| `PRI-004` | Unit of measure pricing | target | done | `src/barrow/units.ts`; `src/barrow/unit-lines.ts`; `src/barrow/orders.ts`; `src/barrow/pier.ts`; `src/barrow/invoice.ts`; `src/barrow/ui/unit-order.tsx`; `tests/api/units.test.mjs` |  |
| `PRI-005` | Bundles and wholesale promotions | target | partial | `tests/api/pricing.test.mjs` — “promotion mix qualification, removal, exclusive precedence and source-priced partial returns reconcile once in the scoped conversion report”: mix qualification, replaced draft removal, exact discount and scenario margin, exclusive precedence, real Pier shipment and partial return, original source-priced credit and replay, frozen order and export, exact report totals and offer attribution, account and currency exclusion. “fixed bundle requirements, dated account eligibility, ordered stacking and stale promotion drafts are enforced through public commands”: fixed quantities, missing quantity refusal, account and date exclusion, sequential stacking, stale submission refusal, submitted quantity requalification, owner authority and malformed or stale settings refusal. `tests/journeys/promotions.test.mjs` — “supplier publishes offers, previews removal and margin, and sees original return credits and net promotion attribution at desktop and phone”: built supplier settings, publication, qualified and removed-line preview, margin, report attribution and original credit history at 1440 and 390; visible text controls. Pricing API assertions run in Verify shard 3; the promotion browser journey runs in shard 2. | The cited evidence exercises bundles and wholesale promotions. The outcome-level assertion trace is incomplete for: Combine eligible styles to qualify for a mix-and-match promotion; remove one; apply a nonstackable discount; return part of the bundle; Totals; credits follow the published rule once; supplier owners; admins publish dated offers for explicit accounts; SKU sets; Fixed bundles require every configured base-unit quantity; mix offers require a combined base-unit threshold; Each qualified offer redeems once per order against all eligible units; Highest priority wins; with offer ID breaking ties: an exclusive winner replaces account; group discounts; excludes other offers; otherwise stackable offers apply sequentially to remaining cents; Approved overrides; negotiated quotes are excluded; Preview shows the current account total; offer basis; discount; final cents; margin against an explicit supplier-entered scenario cost; never inferred inventory cost; Draft replacements; submitted quantity revisions requalify the whole basket; submission; supplier approval refuse stale promotion prices; Approved lines freeze offer IDs; names; original basis; discounts; net cents; PAY-010 credits only the original net line value against a real Pier receipt; once per receipt; without retroactive requalification; the final returned unit receives remaining rounding cents; RPT-002 counts placed; uncancelled promoted orders once by preparation date; account; currency; using frozen offer attribution; original net values less cumulative Pier returns; Per-offer rows overlap for stacked offers; summary totals count each order once; Product; rep; cohort comparisons use the same scope; Unavailable Pier returns show unknown; never zero.  |
| `PRI-006` | Effective prices and additional currencies | target | partial | `tests/api/pricing.test.mjs` — “scheduled book revisions quote exact USD prices on either side of midnight Eastern and refuse stale cart and quote acceptance” proves before and after USD quotes, unchanged prior quote, stale submission and acceptance refusal, stale line-sheet refusal, current book CSV, input refusal, legacy CSV preservation of scheduled revisions and conversion basis, and archive preservation; “explicit foreign currency books preserve exact cents in every commercial document and disclose a frozen dated USD reporting basis” proves explicit CAD, EUR and GBP books, exact whole-unit totals and unchanged invoice, confirmation, statement and export amounts, plus dated frozen USD conversion in finance and sales JSON and CSV, absent-basis handling, and non-USD legacy CSV refusal. `tests/api/catalog-search.test.mjs` — “catalog search enforces current account authority and invalidates observations after price, attribute or connection changes” proves scheduled activation refuses stale search observations, refreshed prices equal the live catalog, and removed SKUs disappear. `tests/journeys/pricing.test.mjs` — “supplier schedules a complete book and dated USD basis, buyer keeps CAD documents, and reports show the recorded conversion without changing cents” proves native settings, CAD catalog, paid network-edge presentment and both report screens. The journey runs in Verify shard 4; pricing API tests run in shard 3. See `docs/PRICING.md`. | CAD Stripe sandbox receipt pending: the held-key harness requires a public HTTPS callback ingress unavailable in this cloud environment. Local network-edge payment assertions do not prove this live-provider acceptance point. |
| `PRI-007` | Explainable commercial validation | target | partial | `src/barrow/orders.ts`; `src/barrow/unit-lines.ts`; `src/barrow/freshness.ts`; `tests/api/validation.test.mjs`; `tests/api/pricing.test.mjs`; `tests/api/stock-promise.test.mjs` | The cited evidence exercises explainable commercial validation. The outcome-level assertion trace is incomplete for: Alter client; agent totals; prices; refuse invalid units; packs; minimums; change a price after drafting; submit through the public API; Recheck live stock; refuse an unavailable/revoked source; a supplier reservation shortfall stays visible; cannot invoice; Exercise freshness refusal; refresh; a supplier-only reasoned exception; inspect its audit.  |
| `PRI-008` | Suggested retail prices and price display | target | partial | `tests/api/pricing.test.mjs` — “MSRP books import and edit exact USD/CAD cents and preserve configured sheet, PDF and order document prices without changing wholesale totals”: import/edit/export of USD and CAD variant MSRP; missing MSRP; wholesale/both/retail sheet page and PDF; independently configured immutable confirmation PDF and order CSV columns; exact ISO minor units and 50.00%/59.98% margin; wholesale-only order totals, exact CAD cart-form CSV round-trip, USD-rate refusal for CAD quotes and stale-book refusal. `tests/journeys/line-sheets.test.mjs` — “supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone”: built Worker and native sessions; account retail controls, price-book import, seasonal publication, both recipient pages/PDF/CSV, phone preparation/submission, CAD catalog/quotes/reorder, per-buyer report and revoked open-page request at 1440/390. | The cited evidence exercises suggested retail prices and price display. The outcome-level assertion trace is incomplete for: Import a price book with wholesale; MSRP columns in USD; CAD; publish one line sheet showing both prices; one showing wholesale only; open each as its buyer on the page; PDF; order confirmation (ORD-014); order CSV; Each shows exactly the configured columns; ISO currency with exact integer minor units; the displayed margin matches the two prices; every order total equals the wholesale lines alone; Whole-unit quantities × integer cents require no rounding.  |
| `ORD-001` | Quick order and CSV cart upload | target | partial | `src/barrow/cart-import.ts`; `src/barrow/cart-csv.ts`; `src/barrow/ui/cart-import.tsx`; `src/barrow/ui/order-pad.tsx`; `src/barrow/pier.ts`; `tests/api/cart-import.test.mjs` | The cited evidence exercises quick order and csv cart upload. The outcome-level assertion trace is incomplete for: Upload a real-shaped 80-line CSV with a duplicate; unknown SKU; invalid case quantity; review; correct errors; choose merge; compare every accepted line; total in the prepared draft; Add lines by SKU; by scanned barcode; see unknown; archived; unlisted SKUs refused alike; Download the cart's style-by-size order form; fill it offline; upload it: the preview shows exactly the filled quantities.  |
| `ORD-002` | Saved shopping lists | target | partial | `src/barrow/lists.ts`; `src/barrow/cart-import.ts`; `src/barrow/ui/saved-lists.tsx`; `src/barrow/ui/cart-import.tsx`; `tests/api/saved-lists.test.mjs` | The cited evidence exercises saved shopping lists. The outcome-level assertion trace is incomplete for: Save; share a store replenishment list; change one price; discontinue one SKU; then add it to a cart as another authorized buyer; Show current totals; explicit exceptions without exposing another company list.  |
| `ORD-003` | Reorder from history | target | partial | `src/barrow/reorders.ts`; `src/barrow/orders.ts`; `src/barrow/ui/reorder.tsx`; `src/barrow/ui/orders.tsx`; `tests/api/reorder.test.mjs` | The cited evidence exercises reorder from history. The outcome-level assertion trace is incomplete for: Open a six-month-old order; select three lines; reorder after a price; SKU change; review the difference summary before checkout; the original order is unchanged.  |
| `ORD-004` | Negotiated wholesale quotes | target | partial | `src/barrow/quotes.ts`; `src/barrow/ui/quotes.tsx`; `src/barrow/export.ts`; `tests/api/quotes.test.mjs` | The cited evidence exercises negotiated wholesale quotes. The outcome-level assertion trace is incomplete for: Request a quote; approve a rep discount; accept it twice through buyer; API doors; inspect one order with the accepted revision; Expire a second quote; refuse its acceptance.  |
| `ORD-005` | Quote conversation revisions and notes | target | partial | `src/barrow/quote-thread.ts`; `src/barrow/quotes.ts`; `src/barrow/ui/quote-thread.tsx`; `src/barrow/export.ts`; `tests/api/quotes.test.mjs` ; `tests/api/quote-delivery.test.mjs` | The cited evidence exercises quote conversation revisions and notes. The outcome-level assertion trace is incomplete for: Exchange a message; add an internal margin note; revise a quote while the buyer has its old version open; Notify participants; hide the internal note from buyer exports; refuse old-version acceptance; AUTO-003 emails these notices to the same audiences; in-app notices are unchanged; Emails contain the notice summary; authorized quote link; never the message body; internal-note text or attachment.  |
| `ORD-006` | Self-service checkout | target | partial | `src/barrow/orders.ts`; `src/barrow/ui/orders.tsx`; `tests/api/flows.test.mjs` | Buyers submit drafts with terms; every order requires supplier approval and checkout tax, freight and payment are missing. |
| `ORD-007` | Purchase references and requested dates | target | partial | `src/barrow/purchase.ts`; `src/barrow/documents.ts`; `src/barrow/orders.ts`; `src/barrow/pier.ts`; `src/barrow/ui/orders.tsx`; `src/barrow/ui/order-pad.tsx`; `tests/api/purchase.test.mjs` | The cited evidence exercises purchase references and requested dates. The outcome-level assertion trace is incomplete for: Submit the same company PO twice; refuse the accidental duplicate; authorize a numbered release; inspect date; attachment fields in the order; ERP handoff.  |
| `ORD-008` | Seasonal prebooks and ship windows | target | partial | `tests/api/stock-promise.test.mjs` — “seasonal prebooks bind published windows, live incoming capacity and exact deposits; closing, release and delayed commitments reconcile without booking twice”: two dated windows, exact deposit and frozen confirmations, real Pier incoming supply and routing, linked release and original commissions, quantity reconciliation, promise history, booked sales and attributed searchable audit with CSV. “seasonal admissions refuse closed dates, insufficient or changed source capacity, wrong currency and warehouses, stale observations and invalid windows”: admission refusals. “seasonal authority, deposit gates, promise bounds and restore fences preserve original commitments and refuse replayed effects”: current authority, captured-deposit gate, replay, erasure and inert restoration. `tests/api/pricing.test.mjs` — “seasonal brand profile requires current approval and keeps the exact CAD seller, deposit and linked invoice without mixing currencies”: brand approval, integer CAD cents, deposit rounding and linked invoice. `tests/journeys/confirmations.test.mjs` — “buyer books a spring season with a deposit and two windows; supplier closes intake, releases once and records a delayed style visible to buyer and operations”: settings, buyer order, captured deposit, closing and buyer and operations quantity screens at 1440 and 390; invoked by Verify shard 1. | The cited evidence exercises seasonal prebooks and ship windows. The outcome-level assertion trace is incomplete for: Place a spring prebook with two ship windows; a deposit; close the season; release the first window; backorder a delayed style; Buyer; operations see committed; released; outstanding quantities separately.  |
| `ORD-009` | Backorders and shipment splits | target | partial | `src/barrow/orders.ts`; `src/barrow/ui/orders.tsx`; `tests/api/flows.test.mjs` | Reservation shortfalls are visible; buyer backorder acceptance, release splits and shipment billing do not exist. |
| `ORD-010` | Immutable agreed order snapshots | target | done | `src/barrow/orders.ts`; `src/barrow/invoice.ts`; `tests/api/flows.test.mjs`; `tests/api/order-guarantee.test.mjs` |  |
| `ORD-011` | Order changes and cancellation | target | partial | `tests/api/confirmations.test.mjs` — “ORD-014: a seasonal matrix order with two ship windows is confirmed with seller identity and variants, revised once by its buyer, emailed per exact revision and kept for buyer and rep”: the account buyer reduces one line of a submitted order before acceptance with current terms acceptance and gets one revised confirmation carrying only that diff; supplier, stale, unaccepted-terms, unchanged and accepted-order revisions are refused. | Supplier-started edits within ACC-005 role and amount limits, accepted-order edits with STK-004 release or reallocation and one edit handoff to Pier (the pinned Pier has no order-edit command), adding or removing lines, moving windows, ship-to and PO, the disclosed cutoff, AUTO-004 change notices, material-change holds, RPT-003 revision history, REP-004 commission differences, refusing shipped lines with a linked return and the acceptance journey remain. |
| `ORD-012` | Buyer order status and confirmations | target | partial | `src/barrow/timeline.ts`; `src/barrow/api.ts`; `src/barrow/ui/order-timeline.tsx`; `src/barrow/ui/orders.tsx`; `tests/api/timeline.test.mjs` | The cited evidence exercises buyer order status and confirmations. Traced assertions cover The timeline contains both source-confirmed split shipments; Another buyer receives the exact not-found refusal. The outcome-level assertion trace is incomplete for: Follow a real-shaped order through acceptance; split shipment; delivery via connected events; open its timeline as the buyer; verify the confirmation; tracking; exception state; Another buyer cannot read it.  |
| `ORD-013` | Multi-location orders and release groups | target | missing |  | Implement multi-location orders and release groups and prove the stated journey. |
| `ORD-014` | Order confirmation documents | target | partial | `tests/api/confirmations.test.mjs` — “ORD-014: a seasonal matrix order with two ship windows is confirmed with seller identity and variants, revised once by its buyer, emailed per exact revision and kept for buyer and rep”: a line-sheet matrix order with two per-line ship windows, seller identity, explicit style/color/size, a metadata-stripped embedded product image and accepted terms; buyer and rep download identical PDF and CSV for C1 and the revised C2; C2 differs from C1 only in the changed line (quantity, base quantity, line cents) apart from its own identity and total; both PDFs name the terms version and buyer acceptance; another buyer is refused; supplier, stale, unaccepted-terms, unchanged and post-acceptance revisions are refused; size-matrix layout rows per window; Pier promise date is the earliest window; one email per revision links that exact revision without commercial values and the link downloads it; later identity and image edits and archive restore leave both revisions byte-identical and send nothing. “ORD-017: named per-line export layouts set default and selected column ordering without rewriting immutable confirmation values, and survive archive restore”: a second layout set as default changes the downloaded CSV. “ORD-014: fifty recorded orders of one season export per line and as style, color and size production totals equal to their lines”: season filter selects exactly the 50 recorded orders of that season (other-season and draft orders excluded, another buyer refused), the per-line file has every line and source, and the totals equal the sum of the selected lines and name all 50 confirmations. “ORD-014: bulk CSV combines 50 explicitly selected immutable revisions with named layouts, source identities and unchanged selling-unit bases” and “ORD-014: numbered submitted and accepted confirmations retain exact commercial snapshots through edits, retry and cancellation” keep the hand-selected and base snapshot proofs. `tests/journeys/confirmations.test.mjs` — “owner records seller and variant details, a buyer revises a two-window seasonal order before acceptance, and the owner exports that season as style, color and size totals at desktop and phone” covers seller/variant/JPEG settings, buyer revision, confirmation list, season totals and saved/default size-matrix layout screens at 1440/390. External 50-order production journey on candidate 26bd6fb877221b593b237fb317f723b245b6734e: [workflow run 39847713165](https://github.com/just-every/run-barrow/actions/runs/39847713165). ct approved the landed product-image custody on 22 October 2026 at 22:15Z. ORD-014 closes neither DATA-001's media manifest nor DATA-004's malware screening for CAT-002. | The cited evidence exercises order confirmation documents. The outcome-level assertion trace is incomplete for: Submit a matrix order with two ship windows; download its confirmation PDF; CSV as buyer; rep; revise one quantity; download again; Both revisions are retained; differ only in the changed line; each names its terms version; acceptance; another buyer is refused.  |
| `ORD-017` | Named confirmation export layouts | target | partial | `tests/api/confirmations.test.mjs` — “ORD-014: a seasonal matrix order with two ship windows is confirmed with seller identity and variants, revised once by its buyer, emailed per exact revision and kept for buyer and rep”: a line-sheet matrix order with two per-line ship windows, seller identity, explicit style/color/size, a metadata-stripped embedded product image and accepted terms; buyer and rep download identical PDF and CSV for C1 and the revised C2; C2 differs from C1 only in the changed line (quantity, base quantity, line cents) apart from its own identity and total; both PDFs name the terms version and buyer acceptance; another buyer is refused; supplier, stale, unaccepted-terms, unchanged and post-acceptance revisions are refused; size-matrix layout rows per window; Pier promise date is the earliest window; one email per revision links that exact revision without commercial values and the link downloads it; later identity and image edits and archive restore leave both revisions byte-identical and send nothing. “ORD-017: named per-line export layouts set default and selected column ordering without rewriting immutable confirmation values, and survive archive restore”: a second layout set as default changes the downloaded CSV. “ORD-014: fifty recorded orders of one season export per line and as style, color and size production totals equal to their lines”: season filter selects exactly the 50 recorded orders of that season (other-season and draft orders excluded, another buyer refused), the per-line file has every line and source, and the totals equal the sum of the selected lines and name all 50 confirmations. “ORD-014: bulk CSV combines 50 explicitly selected immutable revisions with named layouts, source identities and unchanged selling-unit bases” and “ORD-014: numbered submitted and accepted confirmations retain exact commercial snapshots through edits, retry and cancellation” keep the hand-selected and base snapshot proofs. `tests/journeys/confirmations.test.mjs` — “owner records seller and variant details, a buyer revises a two-window seasonal order before acceptance, and the owner exports that season as style, color and size totals at desktop and phone” covers seller/variant/JPEG settings, buyer revision, confirmation list, season totals and saved/default size-matrix layout screens at 1440/390. External 50-order production journey on candidate 26bd6fb877221b593b237fb317f723b245b6734e: [workflow run 39847713165](https://github.com/just-every/run-barrow/actions/runs/39847713165). ct approved the landed product-image custody on 22 October 2026 at 22:15Z. ORD-014 closes neither DATA-001's media manifest nor DATA-004's malware screening for CAT-002. | The cited evidence exercises named confirmation export layouts. The outcome-level assertion trace is incomplete for: Save a second export layout; set it as default; download again: the CSV follows the new layout.  |
| `ORD-018` | Bulk confirmation and production exports | target | partial | `tests/api/confirmations.test.mjs` — “ORD-014: a seasonal matrix order with two ship windows is confirmed with seller identity and variants, revised once by its buyer, emailed per exact revision and kept for buyer and rep”: a line-sheet matrix order with two per-line ship windows, seller identity, explicit style/color/size, a metadata-stripped embedded product image and accepted terms; buyer and rep download identical PDF and CSV for C1 and the revised C2; C2 differs from C1 only in the changed line (quantity, base quantity, line cents) apart from its own identity and total; both PDFs name the terms version and buyer acceptance; another buyer is refused; supplier, stale, unaccepted-terms, unchanged and post-acceptance revisions are refused; size-matrix layout rows per window; Pier promise date is the earliest window; one email per revision links that exact revision without commercial values and the link downloads it; later identity and image edits and archive restore leave both revisions byte-identical and send nothing. “ORD-017: named per-line export layouts set default and selected column ordering without rewriting immutable confirmation values, and survive archive restore”: a second layout set as default changes the downloaded CSV. “ORD-014: fifty recorded orders of one season export per line and as style, color and size production totals equal to their lines”: season filter selects exactly the 50 recorded orders of that season (other-season and draft orders excluded, another buyer refused), the per-line file has every line and source, and the totals equal the sum of the selected lines and name all 50 confirmations. “ORD-014: bulk CSV combines 50 explicitly selected immutable revisions with named layouts, source identities and unchanged selling-unit bases” and “ORD-014: numbered submitted and accepted confirmations retain exact commercial snapshots through edits, retry and cancellation” keep the hand-selected and base snapshot proofs. `tests/journeys/confirmations.test.mjs` — “owner records seller and variant details, a buyer revises a two-window seasonal order before acceptance, and the owner exports that season as style, color and size totals at desktop and phone” covers seller/variant/JPEG settings, buyer revision, confirmation list, season totals and saved/default size-matrix layout screens at 1440/390. External 50-order production journey on candidate 26bd6fb877221b593b237fb317f723b245b6734e: [workflow run 39847713165](https://github.com/just-every/run-barrow/actions/runs/39847713165). ct approved the landed product-image custody on 22 October 2026 at 22:15Z. ORD-014 closes neither DATA-001's media manifest nor DATA-004's malware screening for CAT-002. | The cited evidence exercises bulk confirmation and production exports. The outcome-level assertion trace is incomplete for: Select 50 orders from one season; export them in one file per line; totaled by style; color; size: the totals equal the sum of the selected orders' lines.  |
| `ORD-015` | Versioned sales terms and buyer acceptance | target | partial | `src/barrow/sales-terms.ts`; `migrations/core/0031_sales_terms.sql`; `src/barrow/orders.ts`; `src/barrow/confirmations.ts`; `src/barrow/export.ts`; `src/barrow/api.ts`; `src/barrow/ui/sales-terms.tsx`; `src/barrow/ui/orders.tsx`; `tests/api/sales-terms.test.mjs`; `docs/SALES-TERMS.md` | The cited evidence exercises versioned sales terms and buyer acceptance. The outcome-level assertion trace is incomplete for: Assign terms version 1 to an account that requires acceptance; attempt submission without accepting (refused); accept as the buyer; submit; then submit a rep order with signature capture; Publish version 2: both orders keep version 1; its acceptance record in their confirmation PDFs; the next order requires version 2. |
| `ORD-016` | Canceled styles across open orders | target | missing |  | External dependency: the pinned run-pier revision has no partial order-edit command; its whole-order cancellation cannot reduce one style or preserve another open line. Native prebooks, financial adjustments, notices and the following door also remain: no style cancellation, open-order impact preview, bulk drop or per-order revision, release, deposit adjustment and buyer notice exist. |
| `STK-001` | Live customer-visible availability | target | partial | `src/barrow/pier.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs` | The cited evidence exercises live customer-visible availability. Traced assertions cover Draft preparation leaves the inventory order list empty. The outcome-level assertion trace is incomplete for: Read an account catalog against real Pier stock; exhaust a SKU; attempt an over-order; Confirm the available quantity; server refusal; no stock effect from draft preparation.  |
| `STK-002` | Available to promise by warehouse and date | target | partial | `src/barrow/pier.ts`; `src/barrow/freshness.ts`; `src/barrow/orders.ts`; `src/barrow/imports/validation.ts`; `src/barrow/ui/style-card.tsx`; `src/barrow/ui/freshness.tsx`; `src/barrow/ui/account-form.tsx`; `tests/api/stock-promise.test.mjs` | The cited evidence exercises available to promise by warehouse and date. Traced assertions cover The two warehouse quantities match the source; The future committed receipt keeps its promise date and quantity; Only the permitted warehouse is promiseable; The stale refusal reads back the merchant’s freshness limit; The supplier exception retains the entered reason; The exception reason is read back from audit. The outcome-level assertion trace is incomplete for: Connect two Pier warehouses; a committed PO with a later promise date; compare immediate stock by warehouse with incoming supply; see an order beyond received stock refused; Limit an account to one warehouse; see only its stock promised; Set a 15-minute limit; attempt to submit a draft observed 20 minutes ago: the stale source is shown; only a valid refresh or a recorded supplier exception lets it submit; With Pier unreachable; nothing is promised.  |
| `STK-003` | Durable order acknowledgment | target | done | `src/barrow/orders.ts`; `src/barrow/pier.ts`; `tests/api/order-guarantee.test.mjs` |  |
| `STK-004` | Reservation release and stock exceptions | target | partial | `src/barrow/orders.ts`; `src/barrow/pier.ts`; `src/barrow/ui/orders.tsx`; `src/barrow/ui/cancel-order.tsx`; `tests/api/release.test.mjs` | The cited evidence exercises reservation release and stock exceptions. The outcome-level assertion trace is incomplete for: Cancel an allocated unshipped order; lose the release response; repeat it; The authority releases once; Barrow clears the exception only after confirmation; shows the correct remaining promiseable stock.  |
| `STK-005` | Buyer-approved substitutions | target | partial | `src/barrow/substitutions.ts`; `src/barrow/substitution-preview.ts`; `src/barrow/orders.ts`; `src/barrow/ui/orders.tsx`; `tests/api/substitutions.test.mjs`; `docs/SUBSTITUTIONS.md` PAY-010 extension: `tests/api/substitutions.test.mjs` — “STK-005: buyer declines then accepts a current-price split substitution; only execution replaces the real stock reservation and exports both links”: real accepted replacement, physical receipt, original order and line linkage, exact accepted replacement basis and linked JSON and CSV credit export. | The cited evidence exercises buyer-approved substitutions. The outcome-level assertion trace is incomplete for: Short a discontinued style; propose a differently priced replacement; decline once then accept a revised offer; Only the accepted quantity; price reach inventory; the original shortfall remains traceable.  |
| `REP-001` | Assigned-account rep ordering | target | partial | `src/barrow/orders.ts`; `src/barrow/company-policy.ts`; `src/barrow/staff-access.ts`; `src/barrow/rep-scope.ts`; `tests/api/rep-ordering.test.mjs` — “REP-001: a rep switches only among assigned accounts, sees prices, stock, history and balances, prepares for the buyer, and the accepted order names rep and buyer”: assigned-only accounts, prices, live stock, history and statement/CSV balances, another territory refused for account, catalog, order, quote and statement, acting-as draft and quote attribution, refused rep submission and company approval, buyer review/submission and supplier approval naming rep and buyer, supplier-assisted submission, assignment end. `tests/journeys/rep-ordering.test.mjs` — “a rep prepares an order for an assigned account, the buyer submits it, and the accepted order names rep and buyer at desktop and phone”: the rep’s order pad lists only the assigned account, prepares the draft, is refused submission, the buyer submits and the accepted order names both at 1440/390. | The cited evidence exercises assigned-account rep ordering. The outcome-level assertion trace is incomplete for: Sign in as a rep; select an assigned account; prepare an order for buyer approval; Refuse another territory; show the rep plus buyer identities on the accepted order.  |
| `REP-002` | Offline native rep order writing | target | missing |  | Implement offline native rep order writing and prove the stated journey. |
| `REP-003` | Offline synchronization and conflicts | target | missing |  | Implement offline synchronization and conflicts and prove the stated journey. |
| `REP-004` | Rep commissions and attribution | target | partial | `src/barrow/commission-rules.ts`; `src/barrow/commission-source.ts`; `src/barrow/commission-report.ts`; `src/barrow/orders.ts`; `src/barrow/ui/commissions.tsx`; `src/barrow/ui/commission-settings.tsx`; `migrations/core/0028_commissions.sql`; `tests/api/commissions.test.mjs` PAY-010 extension: `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”: original approved currency and line price, one physical return credit, explicit verified principal allocation, part applied to the unpaid invoice, lost refund response, one stable refund request and signed replay, exact dated statement opening and closing plus CSV and PDF, scoped source-linked JSON and per-kind CSV counts and currency totals, attributed actor kind, source, time, revision and reason through source-order audit search and complete CSV, buyer and agent refusals and append-only audit, original order and stock preservation, original frozen commission links and no second physical-return reversal, and restored refund history refusing provider effects. “finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice”: Native finance activation and explicit per-decision USD allowances, source-order own-audit search and CSV, amount refusals and immediate allowance withdrawal, original price and delivery snapshots despite later rate edits, unverified-tax refusal, original cancellation invoice plus linked correcting credit, capped original split reversals, and verified refund-creation refusal with unused credit released. | The cited evidence exercises rep commissions and attribution. The outcome-level assertion trace is incomplete for: Assign a split commission; accept; ship an order; record partial payment then return a line; Each rep statement shows the correct earned; reversed cents; a transfer does not rewrite prior attribution.  |
| `REP-005` | Visits samples and trade-show selling | target | partial | `src/barrow/visits.ts`; `src/barrow/pier.ts`; `migrations/core/0038_visits.sql`; `src/barrow/ui/visits.tsx`; `tests/api/rep-ordering.test.mjs` — “REP-005: a rep plans a showroom visit for a held account, records buyer notes and a sample request, turns the show basket into a quote, assigns the follow-up, and sees Pier’s acknowledgment once the samples reach inventory”: planning only for a held account (another territory not found; buyers, agents and operations refused; invalid time refused); the visit and its next-action task readable only by holders; buyer notes; a sample request limited to the account’s collection with stale revisions refused; the show basket as a rep-requested quote, once; completion; follow-up dating and refused reassignment to a non-holder; the rep refused and operations allowed to hand samples to Pier once under one durable identity, with promiseable stock falling by the reserved units; the acknowledgment on the visit and its next action; audited steps. `tests/journeys/rep-ordering.test.mjs` — “a rep plans a showroom visit, records buyer notes and samples, turns the show basket into a quote, and sees the follow-up and Pier’s sample acknowledgment at desktop and phone”: the plan form, the planned visit, notes and sample request, basket quote and completion, operations’ sample queue and handoff, and the acknowledgment on the visit and in the rep’s Follow-ups at 1440/390. | The cited evidence exercises visits samples and trade-show selling. The outcome-level assertion trace is incomplete for: Schedule a showroom visit; record a sample request; buyer notes; prepare a quote; assign a follow-up; hand the sample to inventory; The rep sees the next action; completion acknowledgment.  |
| `REP-006` | Barcode scanning in the rep app | target | missing |  | No native rep app or camera/HID barcode scanning exists. |
| `REP-007` | Trade-show prospect capture | target | missing |  | Offline prospect capture, show assortments and routing into application review are not implemented. |
| `MOB-001` | Buyer mobile access and accessibility | target | partial | `src/barrow/ui/app.tsx`; `src/barrow/ui/order-pad.tsx`; `src/barrow/ui/orders.tsx` | Responsive catalog and order UI exists; full mobile buying/payment journeys and accessibility acceptance are unproven. |
| `PAY-001` | Stripe card checkout | target | partial | `tests/api/card-payments.test.mjs` — “hosted card review preserves the approved order, exact surcharge and authorization; lost capture and signed replay reconcile one receipt in every statement format” proves approved-order admission, unchanged agreed snapshots and Pier reservation, exact currency and cents, explicit amount consent, distinct authorization and capture, one recovered receipt, signed replay, scoped source exports and dated statement opening, surcharge, receipt and closing in JSON, CSV and PDF. “verified decline stays owned until provider cancellation and an authentication challenge stays unpaid” proves unpaid challenge, verified failure, owned source-linked work, manual-close refusal and positive cancellation resolution. “card surcharge is calculated only for verified credit funding and an explicitly permitted matching state” proves credit fees and debit, prepaid, unknown-funding and prohibited-state refusal. “hosted verification failure creates an unpaid owned exception and owner cancellation cannot later authorize it” proves mode and owner admission and terminal cancellation. “two installations under one Stripe merchant keep customer, checkout, idempotency and signed event effects separate” proves installation and customer binding. `tests/api/retention.test.mjs` — “DATA-003 / DATA-001: owner review, legal holds, seven-year commercial floor, attributed PO erasure receipt and restore fence”, “ordered-account owner erasure revokes access, redacts personal classes, preserves financial evidence and returns attributed custody”, “independent erasure journal reapplies after D1 rewind and old archive import; missing or incomplete journal refuses data and auth” and “post-floor review defaults to personal redaction; explicit order deletion leaves reconciliable totals and exclusions have recorded reasons” prove exact UTC leap-day cutoff, pre-cutoff and expiry refusal, holds and attributed release, owner review and receipt, Stripe custody, financial preservation, reusable-reference removal and no resurrection. `tests/journeys/card-stripe-sandbox.mjs` — authorized local held-key run sx-barrow-c-i816 on 26 October 2026: real merchant connection form, hosted successful and declined cards, completed bank authentication, credit surcharge, verified debit and prohibiting-state exclusion, merchant capture and cancellation, one real lost capture response and signed provider-event replay; payment, owner exception, statement and custody screens at 1440 and 390. All sandbox result flags and endpoint removal were true. | The cited evidence exercises stripe card checkout. The outcome-level assertion trace is incomplete for: Use Stripe test checkout for successful; declined cards; an authentication challenge; replay an event; lose a capture response; The buyer sees one appropriate payment result; one reconciled charge; a configured surcharge appears for an eligible credit card; is refused for a debit card; a prohibiting state.  |
| `PAY-002` | Stripe ACH collection | target | missing |  | Implement stripe ach collection and prove the stated journey. |
| `PAY-003` | Deposits partial payments and allocations | target | missing |  | Implement deposits partial payments and allocations and prove the stated journey. |
| `PAY-004` | Approved net terms and credit limits | target | partial | `src/barrow/model.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs` | Agreed terms and due-date snapshots exist; credit exposure, balances and limit enforcement are missing. |
| `PAY-005` | Credit holds and controlled release | target | missing |  | Implement credit holds and controlled release and prove the stated journey. |
| `PAY-006` | B2B pay later through Resolve | target | missing |  | Implement b2b pay later through resolve and prove the stated journey. |
| `PAY-007` | Customer account statements | target | partial | `src/barrow/statements.ts`; `src/barrow/pdf.ts`; `src/barrow/ui/statement.tsx`; `tests/api/statements.test.mjs` PAY-010 extension: `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”: original approved currency and line price, one physical return credit, explicit verified principal allocation, part applied to the unpaid invoice, lost refund response, one stable refund request and signed replay, exact dated statement opening and closing plus CSV and PDF, scoped source-linked JSON and per-kind CSV counts and currency totals, attributed actor kind, source, time, revision and reason through source-order audit search and complete CSV, buyer and agent refusals and append-only audit, original order and stock preservation, original frozen commission links and no second physical-return reversal, and restored refund history refusing provider effects. `tests/journeys/credit-payments.test.mjs` — “merchant issues a linked return credit, applies it and reviews pending and failed refunds with exact buyer balances and unchanged commission reversals at desktop and phone”: merchant allocation, return credit, application, exact refund approval, pending and failed statuses, finance and sales reports, frozen commission sources, buyer statement and read-only credit history, price correction, cancellation and explicit finance allowance fields at 1440 and 390; visible controls have text or a tooltip. | The cited evidence exercises customer account statements. The outcome-level assertion trace is incomplete for: Open a statement spanning an opening balance; two invoices; deposit; partial payment; credit; compare the closing balance with the connected ledger; download it as the buyer; Another company is refused; Hold; then close the account; confirm that its authorized buyer can still read; download the statement.  |
| `PAY-008` | Invoice documents and delivery | target | partial | `src/barrow/invoice.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs` | Stable fully reserved USD/legacy AUD invoice CSV and due dates exist; PDF, tax, freight, delivery and accounting authority sync are missing. |
| `PAY-009` | Receivables aging and collections | target | missing |  | Implement receivables aging and collections and prove the stated journey. |
| `PAY-010` | Credit notes and refunds | target | partial | `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”: original approved currency and line price, one physical return credit, explicit verified principal allocation, part applied to the unpaid invoice, lost refund response, one stable refund request and signed replay, exact dated statement opening and closing plus CSV and PDF, scoped source-linked JSON and per-kind CSV counts and currency totals, attributed actor kind, source, time, revision and reason through source-order audit search and complete CSV, buyer and agent refusals and append-only audit, original order and stock preservation, original frozen commission links and no second physical-return reversal, and restored refund history refusing provider effects. “unpaid returned principal is applied before refundable cash; invalid returns, over-credit, stale applications and cross-company effects are refused”: unpaid original principal first, physical quantity and unused-credit caps, currency and account admission, exact-amount refund approval, pending and failed refunds excluded from cash effects and aged balances, and foreign-company refusal. “finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice”: Native finance activation and explicit per-decision USD allowances, source-order own-audit search and CSV, amount refusals and immediate allowance withdrawal, original price and delivery snapshots despite later rate edits, unverified-tax refusal, original cancellation invoice plus linked correcting credit, capped original split reversals, and verified refund-creation refusal with unused credit released. `tests/api/retention.test.mjs` — “DATA-003 / DATA-001: owner review, legal holds, seven-year commercial floor, attributed PO erasure receipt and restore fence”, “ordered-account owner erasure revokes access, redacts personal classes, preserves financial evidence and returns attributed custody”, “independent erasure journal reapplies after D1 rewind and old archive import; missing or incomplete journal refuses data and auth” and “post-floor review defaults to personal redaction; explicit order deletion leaves reconciliable totals and exclusions have recorded reasons”: every introduced credit, application, allocation, refund and provider-event time extends the exact UTC seven-calendar-year floor, leap day clamps, pre-floor and configured-expiry refusal, hold and attributed release, explicit owner review, attributed erasure, required financial preservation, inactive restored refund requests, Stripe separate custody and later-journal replay without resurrection. `tests/api/substitutions.test.mjs` — “STK-005: buyer declines then accepts a current-price split substitution; only execution replaces the real stock reservation and exports both links”: real accepted replacement, physical receipt, original order and line linkage, exact accepted replacement basis and linked JSON and CSV credit export. `tests/journeys/credit-payments.test.mjs` — “merchant issues a linked return credit, applies it and reviews pending and failed refunds with exact buyer balances and unchanged commission reversals at desktop and phone”: merchant allocation, return credit, application, exact refund approval, pending and failed statuses, finance and sales reports, frozen commission sources, buyer statement and read-only credit history, price correction, cancellation and explicit finance allowance fields at 1440 and 390; visible controls have text or a tooltip.  The same journey activates a Native finance member and asserts the saved USD 10.00 credit and USD 5.00 refund allowances and the exact 1000 and 500 cent edit values, with both states captured at 1440 and 390; Verify shard 1 invokes it. | Live Stripe test credit, invoice application, original-card refund, signed callback replay and exact statement receipt remain unproved. The held cloud test merchant completes checkout and capture with surcharges disabled, but this execution environment cannot establish the public webhook tunnel needed for signed provider delivery. Complete the held-key credit journey on a host with reachable callback ingress. The activated Native finance roster and saved allowance edit fields are proven at 1440 and 390 by the credit journey in Verify shard 1. PAY-012 retains its separate bank-mandate gap. |
| `PAY-011` | Payment disputes and reconciliation | target | missing |  | Implement payment disputes and reconciliation and prove the stated journey. |
| `PAY-012` | Saved payment methods and consent | target | partial | `tests/api/card-payments.test.mjs` — “saved company card needs separate exact-amount authorization, withdrawal fences later charges and keeps receipts without exposing reusable tokens” proves explicit company consent, later exact cents and surcharge authorization, revoked preparation and authorization refusal with no provider collection request, private reusable tokens through payment reads and commercial exports, unchanged approved order and stock snapshots, retained receipts and inactive restore. “saved consent is bound to company delivery location and current company finance authority” proves location binding and live finance permission. `tests/journeys/card-stripe-sandbox.mjs` — held-key saved-card segment sx-barrow-c-i818, 26 October 2026, BARROW_SANDBOX_SAVED=true: buyer saves a real Stripe-hosted test card, authorizes and captures a later order, withdraws consent and sees a previously prepared new charge refused; masked consent, review, receipt, withdrawal and refusal screens at 1440 and 390. No new inventory handoff or invoice snapshot is introduced. | Card acceptance is proven. Bank mandates remain unimplemented and blocked on enabling Stripe ACH Direct Debit on the held test merchant (PAY-002); no bank-mandate or bank-collection completion is claimed. |
| `TAX-001` | Avalara AvaTax calculation | target | missing |  | Implement avalara avatax calculation and prove the stated journey. |
| `TAX-002` | TaxJar alternative tax adapter | target | missing |  | Implement taxjar alternative tax adapter and prove the stated journey. |
| `TAX-003` | Resale certificates and exemption review | target | missing |  | Implement resale certificates and exemption review and prove the stated journey. |
| `TAX-004` | Tax corrections and audit trail | target | missing |  | Implement tax corrections and audit trail and prove the stated journey. |
| `SHIP-001` | Delivery methods and shipping charges | target | partial | `src/barrow/shipping.ts`; `src/barrow/shipping-rules.ts`; `src/barrow/ui/shipping-settings.tsx`; `src/barrow/ui/order-shipping.tsx`; `src/barrow/ui/quote-shipping.tsx`; `src/barrow/orders.ts`; `src/barrow/quotes.ts`; `src/barrow/invoice.ts`; `src/barrow/sales-report.ts`; `tests/api/shipping.test.mjs` | The cited evidence exercises delivery methods and shipping charges. The outcome-level assertion trace is incomplete for: Compare pickup; UPS parcel; freight-quote orders; cross a free-freight threshold; change the ship-to state; Buyer explicitly accepts the final method; cost; window before ordering.  |
| `SHIP-002` | EasyPost carrier connection | target | missing |  | Implement easypost carrier connection and prove the stated journey. |
| `SHIP-003` | Shipment tracking and delivery exceptions | target | missing |  | Implement shipment tracking and delivery exceptions and prove the stated journey. |
| `SHIP-004` | Return authorizations and claims | target | missing |  | Implement return authorizations and claims and prove the stated journey. |
| `SHIP-005` | Exchanges and service resolution | target | missing |  | Implement exchanges and service resolution and prove the stated journey. |
| `INT-001` | Optional Pier inventory connection | target | partial | `src/barrow/pier.ts`; `scripts/connect-pier.mjs`; `tests/api/flows.test.mjs` | Real Pier HTTP catalog and reservations ship; it is currently mandatory for ordering and no alternate inventory adapter ships. |
| `INT-002` | QuickBooks Online accounting | target | missing |  | Implement quickbooks online accounting and prove the stated journey. |
| `INT-003` | Xero accounting | target | missing |  | Implement xero accounting and prove the stated journey. |
| `INT-004` | NetSuite ERP | target | missing |  | Implement netsuite erp and prove the stated journey. |
| `INT-005` | Shopify commerce connection | target | missing |  | Implement shopify commerce connection and prove the stated journey. |
| `INT-006` | WooCommerce commerce connection | target | missing |  | Implement woocommerce commerce connection and prove the stated journey. |
| `INT-007` | Cin7 Core inventory connection | target | missing |  | Implement cin7 core inventory connection and prove the stated journey. |
| `INT-008` | Brightpearl inventory connection | target | missing |  | Implement brightpearl inventory connection and prove the stated journey. |
| `INT-009` | Katana inventory connection | target | missing |  | Implement katana inventory connection and prove the stated journey. |
| `INT-010` | Unleashed inventory connection | target | missing |  | Implement unleashed inventory connection and prove the stated journey. |
| `INT-011` | Faire brand order ingest | target | partial | `tests/api/faire.test.mjs` — “Faire HTTP intake resumes paged reads, holds unknown SKUs for owner review and deduplicates source orders without collection” proves authorized paged HTTP, checkpoint recovery, explicit account and unknown-SKU review, original IDs, exact prices, fees and quantities, replay and no collection; “Faire owner decisions are private, attributed, append-only and fully exported; restored reads require fresh consent” proves audit search and complete export, owner-only authority and inactive restore; “Faire refuses invalid credentials, foreign destinations and malformed source pages without advancing a checkpoint” proves authenticated token and OAuth boundaries and safe refusals. `tests/journeys/faire.test.mjs` — “Faire source quantities and unknown fulfillment facts remain visible without a Pier connection” proves exact line quantities and explicit shipped, warehouse and delivery unknowns through the built report at 1440, with browser captures at 1440 and 390. The journey runs in Verify shard 3; the API file is selected by the standard filename shard allocator. “Faire refuses an older overlapping page after a newer complete poll returns to the same checkpoint” proves HTTP 409 for an obsolete response after quantity 8 is committed, preservation of that quantity and checkpoint, and in-flight refusal after consent changes. Consent audit checks assert four distinct revisions and explicit enable or disable sources through search and complete CSV. Reordered identical OAuth grants are refused before another source identity can be created. The built report asserts unknown-warehouse inclusion and unassigned-warehouse exclusion, with both states captured at 1440 and 390. The paged intake test places and partially dispatches a real Pier order before Faire ingestion, then asserts its ordered, shipped, allocated, outstanding, warehouse and fill values are unchanged. The owner-decision test independently hashes explicit source fixtures for both reviewed matching revisions and both page revisions, asserts exact matching and reconciliation sources and distinct supplied reasons, and bounds every decision time to its own HTTP request. Every CSV record repeats these independent checks, including actor ID and human kind; eight explicit decisions, including the initial disabled preview consent, cross the requested two-row page size. | The cited evidence exercises faire brand order ingest. The outcome-level assertion trace is incomplete for: Authorize a brand sandbox or controlled API boundary; fetch multiple pages; interrupt; resume; match an unknown SKU for review; ingest a replay; Each Faire order appears once; no Stripe collection is initiated for Faire-owned settlement.  |
| `INT-012` | Documented wholesale API | target | partial | `src/barrow/api.ts`; `scripts/barrow.mjs`; `tests/api/flows.test.mjs` | Native state, catalog and order commands exist; general integration scopes, entity coverage and versioned exchange are missing. |
| `INT-013` | Webhooks retry and failed-handoff queue | target | partial | `tests/api/webhooks.test.mjs` — “INT-013: signed immutable events retain failed attempts, endpoint backoff/rate limits and dead letters until acknowledged replay with one receiver effect”: endpoint subscription, exact signed immutable bytes, rejected deliveries, endpoint backoff/rate limit, retained attempts/dead letter, identity-preserving replay, one receiver effect and queue clearance only on HTTP 2xx; redirects and revoked sends refused. “INT-013 / DATA-002 / DATA-003: owner consent, masked encrypted secret rotation and revocation, private doors and inert restored history preserve custody”: explicit owner consent, private role/origin doors, encrypted masked custody, audited rotation/revocation, complete secret-free history export, inert archive restore and DATA-003 processor disclosure. `tests/api/quote-delivery.test.mjs` — “AUTO-003 / AUTO-009 / AUTO-010 / AUTO-011 / AUTO-012 / AUTO-013 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”: authenticated duplicate and older out-of-order callback receipts remain visible, terminal bounce persists and one owned failed-contact task survives. `tests/api/audit.test.mjs` — “DATA-002: every current commercial mutation has searchable, attributed, append-only audit and complete safe CSV custody” proves the inherited append-only private audit door; both webhook tests assert source/time/revision/reason and human/system attribution in search/CSV. `tests/journeys/webhooks.test.mjs` — “owner subscribes a trusted endpoint, inspects failed attempts and dead letter, replays one signed event until acknowledged and revokes custody at desktop and phone”: subscription consent, local queue, six failed attempts, dead letter, replay pending acknowledgment, acknowledged zero-unresolved state, rotation/revocation, diagnostics and erasure custody at 1440/390. | The cited evidence exercises webhooks retry and failed-handoff queue. The outcome-level assertion trace is incomplete for: Subscribe a test endpoint; reject several deliveries; replay a signed event; send out-of-order provider states; See one business effect; retained attempts; a queue item that clears only on acknowledged resolution.  |
| `INT-014` | Connector setup and reconciliation | target | partial | `tests/api/diagnostics.test.mjs` — “owner inspects connector samples, repairs missing mappings, retains exact source differences and private audit after credential revocation”: live Pier samples, missing item and customer mappings, reviewed duplicate relationships, exact base-quantity differences, activation refusal and repaired enablement, acknowledged-sync lag, revoked and read-only credentials, retained local orders and samples, owner-only admission and attributed append-only audit search and complete CSV. `tests/api/move-rehearsal.test.mjs` — “owner rehearses and reconciles a source delta, signs scoped authority and exports only new orders; rollback preserves a dependent shipment”: custom source columns, source and native USD and CAD values, permission refusal and repaired read, write and removal receipts before sign-off, current quarantine after old-file replay, owned persistent failures, exact unacknowledged and processed order files, revoked feed credentials and inactive retained history. `tests/api/stock-promise.test.mjs` — “scheduled stock synchronization resumes an interrupted ACK, sends one requested private notice on replay, and retains an owned persistent exception”: only the final acknowledged page advances successful sync time. `tests/journeys/connector-review.test.mjs` — “owner inspects and repairs a missing connector item, then sees retained source history after revocation at desktop and phone” and `tests/journeys/delta-cutover.test.mjs` — “owner reviews delta citations and scoped feed rehearsal, signs cutoff, delivers a new order and preserves shipment dependencies on rollback at desktop and phone”: changed screens at 1440 and 390, with visible control labels. `tests/api/faire.test.mjs` — “Faire HTTP intake resumes paged reads, holds unknown SKUs for owner review and deduplicates source orders without collection” proves disabled source preview, explicit account and SKU mappings, live permission and reconciliation refusal before activation, exact source counts and per-currency minor-unit differences, reviewed repair, successful completion time and lag, retained samples and orders after credential revocation, and attributed connector review search and complete CSV. “Faire refuses invalid credentials, foreign destinations and malformed source pages without advancing a checkpoint” proves unsafe credentials and pages are refused and reviewed duplicate customer mappings remain explicit. “Faire owner decisions are private, attributed, append-only and fully exported; restored reads require fresh consent” proves owner-only preview and reconciliation, private append-only audit and inactive restored history. `tests/journeys/faire.test.mjs` — “Faire source quantities and unknown fulfillment facts remain visible without a Pier connection” also proves the shared Faire preview, missing SKU and exact value difference, activation refusal, repaired reconciliation and retained revoked-credential history in the built screen, with captures at 1440 and 390. The Faire journey runs in Verify shard 3; connector and delta journeys run in shard 4. See `docs/CONNECTORS.md`. Exact file-count assertions in that rehearsal cover every picked-up filename, accepted and quarantined counts, retained corrected-file history, and each written filename with one data row in both sent and processed states; the delta browser journey asserts the same exact visible counts. | The cited evidence exercises connector setup and reconciliation. The outcome-level assertion trace is incomplete for: Set up a connector with a missing item; mismatched balance; inspect preview; repair mappings; reconcile before go-live; Revoke credentials later; keep local history; show precisely which records need attention; Exercise inherited DATA-002 connector/configuration/reconciliation changes through the staff audit search; complete export: actor/kind; source; time; revision; reason; append-only; private from buyers/agents.  |
| `INT-015` | Operational email and connected mailboxes | target | partial | `src/barrow/accounts.ts`; `src/mail.server.mjs`; `tests/api/flows.test.mjs` ; `src/barrow/quote-mail.ts`; `src/barrow/quote-mail-events.ts`; `tests/api/quote-delivery.test.mjs`; `src/barrow/report-mail-events.ts`; `tests/api/order-search.test.mjs` | Quote delivery states, suppression and signed intake exist; report delivery and suppression now also ship; mailbox intake and remaining operational messages are missing. |
| `INT-016` | EDI wholesale order exchange | target | missing |  | Implement edi wholesale order exchange and prove the stated journey. |
| `INT-017` | AIMS360 apparel ERP connection | target | missing |  | No AIMS360 adapter exists. |
| `INT-018` | ApparelMagic apparel ERP connection | target | missing |  | No ApparelMagic adapter exists. |
| `INT-019` | A2000 apparel ERP connection | target | missing |  | No A2000 adapter exists. |
| `INT-020` | Scheduled flat-file SFTP data feed | target | partial | Native merchant-hosted SFTP trust/refusal: `tests/api/flat-file-feed.test.mjs` — “owner tests a pinned merchant SFTP destination through the Worker; wrong host trust, credentials and non-owner calls refuse”; isolated mapped product/customer/ATS rows, owned quarantine, stable replay, frozen named-layout new-order files and exact acknowledgment: `tests/api/move-rehearsal.test.mjs` — “owner rehearses and reconciles a source delta, signs scoped authority and exports only new orders; rollback preserves a dependent shipment”. | Native owner-operated migration bridge only. Scheduled imports, unchanged NuORDER standard templates, live ATS authority/freshness and account warehouse enforcement, wider product/price/customer/location imports, order edit/cancellation/shipment exchange and the remaining inherited obligations are unproved. ORD-011/016 accepted-order edits need Pier’s missing edit command. MOVE-008 consent/authority default awaits ct. |
| `RPT-001` | Account and product sales reporting | target | partial | `src/barrow/sales-report.ts`; `src/barrow/ui/sales-report.tsx`; `src/barrow/api.ts`; `tests/api/sales-report.test.mjs` PAY-010 extension: `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”: original approved currency and line price, one physical return credit, explicit verified principal allocation, part applied to the unpaid invoice, lost refund response, one stable refund request and signed replay, exact dated statement opening and closing plus CSV and PDF, scoped source-linked JSON and per-kind CSV counts and currency totals, attributed actor kind, source, time, revision and reason through source-order audit search and complete CSV, buyer and agent refusals and append-only audit, original order and stock preservation, original frozen commission links and no second physical-return reversal, and restored refund history refusing provider effects. “finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice”: Native finance activation and explicit per-decision USD allowances, source-order own-audit search and CSV, amount refusals and immediate allowance withdrawal, original price and delivery snapshots despite later rate edits, unverified-tax refusal, original cancellation invoice plus linked correcting credit, capped original split reversals, and verified refund-creation refusal with unused credit released. | The cited evidence exercises account and product sales reporting. The outcome-level assertion trace is incomplete for: Run a seasonal report containing a prebook; split shipment; credit; partial payment; filter a territory; drill to the documents; Exported totals reconcile with the source lines; another rep territory is inaccessible.  |
| `RPT-002` | Quote conversion and promotion performance | target | partial | `tests/api/pricing.test.mjs` — “promotion mix qualification, removal, exclusive precedence and source-priced partial returns reconcile once in the scoped conversion report”: mix qualification, replaced draft removal, exact discount and scenario margin, exclusive precedence, real Pier shipment and partial return, original source-priced credit and replay, frozen order and export, exact report totals and offer attribution, account and currency exclusion. “fixed bundle requirements, dated account eligibility, ordered stacking and stale promotion drafts are enforced through public commands”: fixed quantities, missing quantity refusal, account and date exclusion, sequential stacking, stale submission refusal, submitted quantity requalification, owner authority and malformed or stale settings refusal. `tests/journeys/promotions.test.mjs` — “supplier publishes offers, previews removal and margin, and sees original return credits and net promotion attribution at desktop and phone”: built supplier settings, publication, qualified and removed-line preview, margin, report attribution and original credit history at 1440 and 390; visible text controls. Pricing API assertions run in Verify shard 3; the promotion browser journey runs in shard 2.  `src/barrow/quote-report.ts`; `src/barrow/ui/quote-report.tsx`; `tests/api/quotes.test.mjs`  `tests/api/line-sheets.test.mjs` — “line-sheet buyer opens and visible-item views appear independently in the scoped quote conversion report”: distinct buyer opens/views/SKU counts, account/period scoping and supplier-preview exclusion. `tests/journeys/line-sheets.test.mjs` — “supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone”: built Worker and native sessions; account retail controls, price-book import, seasonal publication, both recipient pages/PDF/CSV, phone preparation/submission, CAD catalog/quotes/reorder, per-buyer report and revoked open-page request at 1440/390. | The cited evidence exercises quote conversion and promotion performance. The outcome-level assertion trace is incomplete for: Create accepted; expired; revised quotes plus a promoted order; return; then view conversion; net promotion performance; open a line sheet as two buyers; see each buyer's views; Count each accepted order once; explain every denominator.  |
| `RPT-003` | Fulfillment and backorder reporting | target | partial | `src/barrow/fulfillment.ts`; `src/barrow/fulfillment-lines.ts`; `src/barrow/report-zone.ts`; `src/barrow/ui/fulfillment.tsx`; `tests/api/fulfillment.test.mjs` | The cited evidence exercises fulfillment and backorder reporting. The outcome-level assertion trace is incomplete for: Load an on-time; late; partially shipped order; inspect line-based fill; lateness measures; open the late-line queue; Missing tracking stays unknown rather than counted as delivered; INT-011 carrier: ingested Faire lines retain original order IDs; exact ordered quantities; account scope; shipped quantities; warehouse; delivery remain unknown when the source does not report them; They never change Pier fill denominators.  |
| `RPT-004` | Finance and credit reporting | target | partial | `src/barrow/finance-report.ts`; `src/barrow/ui/finance-report.tsx`; `src/barrow/api.ts`; `tests/api/finance-report.test.mjs` PAY-010 extension: `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”: original approved currency and line price, one physical return credit, explicit verified principal allocation, part applied to the unpaid invoice, lost refund response, one stable refund request and signed replay, exact dated statement opening and closing plus CSV and PDF, scoped source-linked JSON and per-kind CSV counts and currency totals, attributed actor kind, source, time, revision and reason through source-order audit search and complete CSV, buyer and agent refusals and append-only audit, original order and stock preservation, original frozen commission links and no second physical-return reversal, and restored refund history refusing provider effects. “unpaid returned principal is applied before refundable cash; invalid returns, over-credit, stale applications and cross-company effects are refused”: unpaid original principal first, physical quantity and unused-credit caps, currency and account admission, exact-amount refund approval, pending and failed refunds excluded from cash effects and aged balances, and foreign-company refusal. `tests/journeys/credit-payments.test.mjs` — “merchant issues a linked return credit, applies it and reviews pending and failed refunds with exact buyer balances and unchanged commission reversals at desktop and phone”: merchant allocation, return credit, application, exact refund approval, pending and failed statuses, finance and sales reports, frozen commission sources, buyer statement and read-only credit history, price correction, cancellation and explicit finance allowance fields at 1440 and 390; visible controls have text or a tooltip. | The cited evidence exercises finance and credit reporting. The outcome-level assertion trace is incomplete for: Run aging on a stated date across net-30; disputed; partially paid invoices; export; compare every bucket with due dates; verified payments; A rep sees only the permitted account summary.  |
| `RPT-005` | Rep performance and commission statements | target | partial | `tests/api/commissions.test.mjs` — “rep performance: real assignment transfer and return preserve both private statements, activity goals, source metrics and reconciled manager payroll”: real Pier shipment followed by native assignment transfer, new-rep shipment and original linked partial return; frozen A/B earnings/reversals and source IDs, both manager-visible statements and CSV, manager sums equal itemized payroll, own-label/current-account privacy and revocation; immutable-planner visit, source-linked quote conversion and new-account counts, owner/admin-only reasoned/revision-guarded goals, own goals after transfer, performance CSV, audit and archive/restore/export. `tests/journeys/rep-performance.test.mjs` — “owner sets activity goals, manager reconciles transferred shipment and return statements, and each rep sees only current private work at desktop and phone”: owner goal form/save, rep own progress, manager performance/private statements after transfer and real return, CSV download, old-rep source exclusion and current-rep privacy at 1440/390. | ct approval pending for the adopted activity-goal policy and exact performance attribution semantics: owner/admin-only count goals with no compensation or automatic effect; Native identity and frozen labels remain separate, current held-account privacy never widens. Implementation and named public-door/browser evidence cover the current source-backed flow; RPT-005 remains partial until ct approves. Verified payment/credit effects remain inherited by PAY-003/PAY-010. |
| `RPT-006` | Operational order search | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native operational order search workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `RPT-007` | Bounded workspace and order-history pages | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native bounded workspace and order-history pages workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `RPT-008` | Monthly saved report definitions | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native monthly saved report definitions workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `RPT-009` | Recipient-bound report delivery | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native recipient-bound report delivery workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `RPT-010` | Report snapshot custody and restoration | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native report snapshot custody and restoration workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `RPT-011` | Bounded account directory pages | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native bounded account directory pages workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `RPT-012` | Complete duplicate-company review | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native complete duplicate-company review workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `RPT-013` | Carrier tracking search | target | missing |  | Carrier tracking source, search and performance are explicitly absent in the source Gap. |
| `RPT-014` | Workspace waiting drafts and full-scope indicators | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native workspace waiting drafts and full-scope indicators workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `RPT-015` | Report notification outcomes and suppression | target | partial | `src/barrow/order-search.ts`; `src/barrow/ui/order-search.tsx`; `migrations/core/0029_order_search.sql`; `tests/api/order-search.test.mjs`; `docs/ORDER-SEARCH.md`; `src/barrow/workspace-orders.ts`; `src/barrow/ui/draft-workspace.tsx` ; `src/barrow/report-schedules.ts`; `src/barrow/report-runs.ts`; `src/barrow/report-delivery.ts`; `src/barrow/report-access.ts`; `src/barrow/report-mail-events.ts`; `src/barrow/ui/scheduled-reports.tsx`; `migrations/core/0030_scheduled_reports.sql`; `tests/journeys/installation.test.mjs`; `docs/SCHEDULED-REPORTS.md` ; `src/barrow/account-directory.ts`; `src/barrow/ui/account-pages.tsx` | The source delivers the native report notification outcomes and suppression workflow. Complete assertion and mutation proof for this part is not established on the exact candidate. Carrier tracking remains RPT-013; broader report-type scheduling remains RPT-008. |
| `AUTO-001` | Trade application follow-up | target | partial | `src/barrow/application-rules.ts`; `src/barrow/application-followup.ts`; `src/barrow/application-mail.ts`; `src/barrow/followups.ts`; `src/barrow/followup-sources.ts`; `src/barrow/ui/application-rules.tsx`; `src/barrow/ui/application-review.tsx`; `tests/api/application-followup.test.mjs` — “AUTO-001: rules route verified applications by territory, requested terms and certificate to a reviewer with a deadline and a prepared request; applicants get generic status emails; escalation persists through requests, answers and emails until a decision or explicit closure”: owner/admin-managed routing with current entitled functional reviewer selection, state, terms, deadline and stale-revision validation; territory (state) with missing certificate, requested-terms, volume and default routing; the review task available only to current application reviewers and linked to its application; route, people, deadline and prepared request in the staff review; escalation after the deadline surviving refresh, the sent request, a next-contact change and the applicant’s upload; one generic status email per staff decision with no reason or request text and none for the applicant’s own changes; approve, decline, withdrawal and explicit closure ending it. `tests/journeys/application-routing.test.mjs` — “applications route by territory to a reviewer with a prepared request, the applicant gets generic status emails, and the escalated task stays on the board through the request until a decision at desktop and phone”: the routing form with a prepared request, the public form’s requested terms, the routed and escalated task, the review panel sending the prepared request, the task still escalated after the request and the upload, and its closing decision at 1440/390. | The cited evidence exercises trade application follow-up. The outcome-level assertion trace is incomplete for: Apply without a required certificate; route to a territory owner; send the request; upload the document; Escalation stops on the recorded decision; not merely because an email was queued. |
| `AUTO-002` | Approval routing and escalation | target | partial | `src/barrow/approval-notices.ts`; `src/barrow/approval-escalation.ts`; `src/barrow/followup-sources.ts`; `src/barrow/followups.ts`; `src/barrow/orders.ts`; `src/server.ts`; `migrations/core/0037_approval_notices.sql`; `src/barrow/ui/approval-notices.tsx`; `tests/api/company-approvals.test.mjs` — “AUTO-002: a $6,000 cart needing buyer and finance approval notifies current approvers and delegates once, a price revision invalidates the old approval, the scheduled escalation escalates with the exact blocking cause, and each approval closes the right notices and tasks”: a cart over the purchaser’s spend limit on a buyer-then-finance route; step-1 approver and delegate notified once across reruns and audited once; a delegation dated after submission notified on the next run and closed when it ends; notices only for company approvers and the escalation only for owner/admin; step approval moving the notice to Finance; a price revision voiding the approval, closing its notices and the revised request notified afresh; escalation approvers notified once after the step’s escalation time with the exact cause; a retried approval refused and exactly two decisions; the overdue supplier approval task opened once for the owner with its blocking cause, closed by supplier approval and never reopened; reassignment refused to the rep and allowed to an approving sales manager; the cause escalating when the account is put on hold. `tests/api/company-approvals.test.mjs` — “ACC-007: amount and location routes run sequential approvers with delegation, escalation, withdrawal and fresh approval after any material change”: route, quantity-revision, price, address and account terms checks. `tests/api/flows.test.mjs` — “ACC-004: profile, hold and closure preserve buyer history and refuse new commitments or identity takeover”: hold and closure refuse submission and first approval. `tests/api/case-packs.test.mjs` — “PRI-003: case packs and increments refuse invalid quantities at the order, agent, reorder and import doors with explicit corrections, never silently inflating”: quantity rules. `tests/journeys/approval-escalation.test.mjs` — “approvers, delegates and the escalation approver see the steps waiting for them, each approval closes its notices, and the supplier’s overdue approval task names its blocking cause until approval at desktop and phone”: approver, delegate, escalation-after-cron and Finance notices, notices closed by step approval, and the overdue approval task with its cause closed by approval at 1440/390, the escalation triggered by the Worker’s own hourly cron. | The cited evidence exercises approval routing and escalation. The outcome-level assertion trace is incomplete for: Submit an order requiring buyer; finance approval; revise its price; run the scheduled escalation; Old approval is invalid; current delegates are notified once; approval closes the correct tasks. |
| `AUTO-003` | Quote activity notifications | target | partial | `src/barrow/quote-mail.ts`; `src/barrow/quote-mail-events.ts`; `src/barrow/quote-mail-tasks.ts`; `src/barrow/quote-mail-custody.ts`; `src/barrow/quote-mail-config.ts`; `src/barrow/ui/diagnostics.tsx`; `migrations/core/0027_quote_delivery.sql`; `tests/api/quote-delivery.test.mjs`; `docs/QUOTE-NOTIFICATIONS.md` | The cited evidence exercises quote activity notifications. The outcome-level assertion trace is incomplete for: Revise a quote; add an internal note; simulate a buyer email bounce; Buyer receives only visible changes; rep gets the note; a failed-contact task remains until resolved; each existing ORD-005 notice atomically queues one durable ledger row per authorized recipient user ID; Under ACC-002; buyer means each active native company member with purchaser or approver rights; rechecked at dispatch; the former account-email authority is retired; staff means active owner/admin except the actor; Agents; rep metadata; names; author emails; guessed contacts; CC/BCC; new outreach grants never supply recipients; An internal notice addressed to a buyer is a hard error; Missing buyer authority creates a withdrawn row with reason "no authorized buyer recipient"; an owned failed-contact task. |
| `AUTO-009` | Immutable notification submission and retry | target | partial | `src/barrow/quote-mail.ts`; `src/barrow/quote-mail-events.ts`; `src/barrow/quote-mail-tasks.ts`; `src/barrow/quote-mail-custody.ts`; `src/barrow/quote-mail-config.ts`; `src/barrow/ui/diagnostics.tsx`; `migrations/core/0027_quote_delivery.sql`; `tests/api/quote-delivery.test.mjs`; `docs/QUOTE-NOTIFICATIONS.md` | The cited evidence exercises immutable notification submission and retry. The outcome-level assertion trace is incomplete for: Dispatch rechecks that exact user; withdraws revoked/mismatched authority without substituting another person; saves the exact current address used; Email contains only the notice summary; quote ID; configured HTTPS app quote link; ordinary sign-in; existing quote authorization apply; with no tokens; message bodies; attachments or tracking; A stable delivery ID is the stable Resend request identity; the exact provider ID or null; exact sender result are retained; Queued; withdrawn; accepted; deferred; delivered; bounced; failed; rejected; complained; suppressed; rate limited; uncertain; not configured stay distinct; Delivered means delivered to the recipient mail server; never read; accepted with no provider ID is labelled accepted (uncorrelated); Development is not sent (development); Submission requires configured Resend; API key; HTTPS origin; installation delivery tenant; mail callback verification secret; Terminal bounce; complaint or rejection suppresses later sends to the saved address. |
| `AUTO-010` | Quote expiry reminder delivery | target | partial | `src/barrow/quote-mail.ts`; `src/barrow/quote-mail-events.ts`; `src/barrow/quote-mail-tasks.ts`; `src/barrow/quote-mail-custody.ts`; `src/barrow/quote-mail-config.ts`; `src/barrow/ui/diagnostics.tsx`; `migrations/core/0027_quote_delivery.sql`; `tests/api/quote-delivery.test.mjs`; `docs/QUOTE-NOTIFICATIONS.md` | The cited evidence exercises quote expiry reminder delivery. The outcome-level assertion trace is incomplete for: An hourly check nominates one email-only expiry row per quote/latest revision/user on its inclusive America/New_York last valid date; only while proposed; unaccepted; replay cannot add another; superseded; awaiting-approval; accepted or late reminders are withdrawn before submission; Native walkthrough: request reaches staff; internal note reaches staff only; visible message; ready revision reach buyer with a sign-in link; another company gets not found; one last-day reminder; none for superseded/awaiting-approval; no repeat on replay/restore; signed delivered/bounce creates one owned failure task; foreign or changed replay is refused; identical replay has no new effect; acceptance leaves work open; an attributed resolution closes it. |
| `AUTO-011` | Verified quote delivery callbacks | target | partial | `src/barrow/quote-mail.ts`; `src/barrow/quote-mail-events.ts`; `src/barrow/quote-mail-tasks.ts`; `src/barrow/quote-mail-custody.ts`; `src/barrow/quote-mail-config.ts`; `src/barrow/ui/diagnostics.tsx`; `migrations/core/0027_quote_delivery.sql`; `tests/api/quote-delivery.test.mjs`; `docs/QUOTE-NOTIFICATIONS.md` | The cited evidence exercises verified quote delivery callbacks. The outcome-level assertion trace is incomplete for: The POST-only; 1 MiB Resend callback uses unmodified Base signature/freshness verification (300 seconds); server-configured tenant; namespace; verbatim Base D1 event schema; read-only authorization of tenant; exact saved provider ID; every exact saved address; Only stored Base results change the ledger; idempotently by event ID; open/click do not; Invalid/foreign/changed-fingerprint events return redacted refusal; identical replay is acknowledged without a second effect; The webhook secret; its private fingerprint never enter archive/export/diagnostics/log/audit; configure; rotate; revoke record system audit events without their values; Saved addresses use DATA-003's messages retention kind; separate provider-mail custody; unused-account erasure removes ledger; tasks; matching Base event rows in the existing restore-fenced erasure transaction. |
| `AUTO-012` | Failed quote contact ownership | target | partial | `src/barrow/quote-mail.ts`; `src/barrow/quote-mail-events.ts`; `src/barrow/quote-mail-tasks.ts`; `src/barrow/quote-mail-custody.ts`; `src/barrow/quote-mail-config.ts`; `src/barrow/ui/diagnostics.tsx`; `migrations/core/0027_quote_delivery.sql`; `tests/api/quote-delivery.test.mjs`; `docs/QUOTE-NOTIFICATIONS.md` | The cited evidence exercises failed quote contact ownership. The outcome-level assertion trace is incomplete for: Rate-limited/uncertain requests retry the same immutable request/key only within 24 hours; afterward they are not resubmitted; open contact work; Failed-contact tasks are keyed by quote/recipient user; append delivery facts; open on bounce/failure/rejection/complaint/suppression; uncertainty beyond 24 hours; submission rejection or missing buyer; Buyer tasks start with the active latest proposer; otherwise installation owner; staff tasks start with the owner; Acceptance; refresh; later delivery or revision never closes a task: an attributed revision-guarded resolution does; OPS-001 lists open non-success delivery ID/state/age/owner/task link; the webhook-secret reconnect step; other notification types remain not recorded; ACC-002/ACC-006 inherit future purchaser/assigned-covering-rep routing; task ownership before shipping; Contact dates use New York; only active owner/admin can be assigned. |
| `AUTO-013` | Notification custody and inert restoration | target | partial | `src/barrow/quote-mail.ts`; `src/barrow/quote-mail-events.ts`; `src/barrow/quote-mail-tasks.ts`; `src/barrow/quote-mail-custody.ts`; `src/barrow/quote-mail-config.ts`; `src/barrow/ui/diagnostics.tsx`; `migrations/core/0027_quote_delivery.sql`; `tests/api/quote-delivery.test.mjs`; `docs/QUOTE-NOTIFICATIONS.md` | The cited evidence exercises notification custody and inert restoration. The outcome-level assertion trace is incomplete for: DATA-001 exposes supplier-only quotedeliveries; buyers omit it; Owner archives retain ledger; tasks; Base event receipts/states without credentials; restored queued/rate-limited/uncertain rows are uncertain; never resubmit. |
| `AUTO-014` | Quote notification handoffs and diagnostics | target | partial | `src/barrow/quote-mail.ts`; `src/barrow/quote-mail-events.ts`; `src/barrow/quote-mail-tasks.ts`; `src/barrow/quote-mail-custody.ts`; `src/barrow/quote-mail-config.ts`; `src/barrow/ui/diagnostics.tsx`; `migrations/core/0027_quote_delivery.sql`; `tests/api/quote-delivery.test.mjs`; `docs/QUOTE-NOTIFICATIONS.md` | The cited evidence exercises quote notification handoffs and diagnostics. The outcome-level assertion trace is incomplete for: Live Resend; hosted proof remain separately PENDING; are not claimed by native signed-fixture tests. |
| `AUTO-004` | Order and fulfillment notifications | target | missing |  | Implement order and fulfillment notifications and prove the stated journey. |
| `AUTO-005` | Rep next-action queue | target | partial | `src/barrow/followups.ts`; `src/barrow/followup-sources.ts`; `src/barrow/ui/followups.tsx`; `tests/api/followups.test.mjs` ; `tests/api/quote-delivery.test.mjs` | The cited evidence exercises rep next-action queue. The outcome-level assertion trace is incomplete for: Create one item of each type; assign; snooze them; resolve a quote through acceptance; record a failed contact; The accepted quote closes while unanswered tasks remain; appear on the due date; AUTO-003 adds failed quote contact tasks keyed by quote/recipient user; with active latest proposer or installation owner; New York contact date; attributed revision-guarded resolution; Acceptance; refresh; later delivery; new revisions do not close them.  |
| `AUTO-006` | Accounting invoice and payment automation | target | missing |  | Implement accounting invoice and payment automation and prove the stated journey. |
| `AUTO-007` | Payment reminders and promises to pay | target | missing |  | Implement payment reminders and promises to pay and prove the stated journey. |
| `AUTO-008` | Scheduled synchronization and stock alerts | target | partial | `tests/api/stock-promise.test.mjs` — “scheduled stock synchronization resumes an interrupted ACK, sends one requested private notice on replay, and retains an owned persistent exception”: source pagination and acknowledged resume, stable event replay, one private requested notice, completed reconciliation, prebook-window eligibility and replay, current buyer scope, persistent installation-owner assignment, attributed resolution and deliberate checkpoint restart. The existing “STK-002 / PRI-007: Pier stock by warehouse and incoming promise dates, account warehouse rules and a stale-stock limit with refresh or recorded exception” proves account warehouse scope and stale promise refusal. Both run in Verify (4/4). `tests/journeys/stock-sync.test.mjs` — “real Pier development sync resumes ACK interruption, reconciles once and shows private stock notice and assigned recovery at desktop and phone”: Pier 60fde60ffa1f44c2ae6a3ef47225117f36cf546a started through rer dev, built Barrow, native sessions, interrupted transport with real source replay, one stock and one requested prebook notice, completed reconciliation and visible assigned failure and attributed closure at 1440 and 390. Runs through heavy-slot outside push Verify; no Pier response is faked. | The cited evidence exercises scheduled synchronization and stock alerts. The outcome-level assertion trace is incomplete for: Interrupt a paginated sync; resume from its acknowledged checkpoint; restore a watched SKU; replay its event; One notice sends; reconciliation completes; persistent failure stays assigned.  |
| `MOVE-001` | NuORDER move-in | target | partial | `tests/api/move-nuorder.test.mjs` — “NuORDER CSV and mapped XLSX reconcile history, open quantities, product keys and primary JPEGs with fingerprint approval and replay” proves explicit brand columns and normalized padded source identities, write-free preview, exact currency totals and open quantities, retained PO and ship windows, primary sanitized JPEG attachment, case and increment mapping including an unordered archived product, private current-price lists, native export and inert restore. “NuORDER refuses unmapped identities, changed approval, invalid source quantities and unauthorized activation without writes” proves owner-only custody and fail-closed source checks. `tests/journeys/move-nuorder.test.mjs` — “owner uploads mapped NuORDER sources, reviews exact reconciliation and applies retained history once” proves manifest upload, approval, completion, replay and unresolved identity through the built Move in screen; Verify shard 4. | Supplied CSV and XLSX adapter only; binary XLS needs conversion. Full CAT-010 naming rules, additional image slots, held unmatched files, URL retrieval and an unretrievable-image report by style remain unimplemented. CAT-003 line-sheet rebuilding and CAT-004 presentations from the imported assortment, independent source-versus-planned receivable reconciliation remain unproved. Product creation stays in Pier; separately supplied price-book activation remains unfinished. No full MOVE-001 completion claim. |
| `MOVE-002` | Pepperi move-in | target | missing |  | Implement pepperi move-in and prove the stated journey. |
| `MOVE-003` | Brandboom move-in | target | missing |  | Implement brandboom move-in and prove the stated journey. |
| `MOVE-004` | SparkLayer move-in | target | partial | `tests/api/move-sparklayer.test.mjs` — “SparkLayer detailed activity reconciles original scoped order and quote history, maps source rules, applies once and exports private current-price lists”: detailed source IDs, order and quote types, original shipping, tracking and custom fields, selected export dates and filters, incomplete scope and absent exports, source against planned counts and per-currency and by-status totals, write-free preview, fingerprint approval, replay, PRI-003 mapping, owner-only source custody, DATA-001 list and history exports, current repricing and inert archive restore. “SparkLayer refuses unmapped identities, malformed rows, conflicting replay and stale native approval; summary scope remains explicitly incomplete”: summary coverage, unmapped products and customers, date and header mapping refusals, changed native snapshots and immutable history. “SparkLayer account erasure retires shared originals and history atomically and prevents closed-account source reactivation”: owner erasure retires custody. `tests/journeys/move-sparklayer.test.mjs` — “owner uses an imported SparkLayer list at current prices and explicitly shares it at desktop and phone”: private imported list, explicit sharing and current USD preview at 1440 and 390; every dialog control has visible words. | The cited evidence exercises sparklayer move-in. The outcome-level assertion trace is incomplete for: Upload real-shaped detailed activity; shopping-list CSV fixtures matching the documented formats; compare the selected export date; filter range; join backing-store product; customer IDs; Reconcile covered orders; flag omitted source scope before cutover.  |
| `MOVE-005` | WizCommerce move-in | target | partial | `tests/api/move-wizcommerce.test.mjs` — “WizCommerce FTP UUID joins preserve separate order and quote facts, payments and units; workbook layouts replay without duplicate history”: genuine split and master XLSX plus separate FTP header, item and customer CSV, UUID and visible-reference joins, distinct document types, original source status, payment and selling units, PRI-003 rule mapping, per-currency and by-status reconciliation, retained entity counts and cross-format replay. “WizCommerce refuses orphan or ambiguous references, conflicting headers, unmapped customers and changed replay without losing original history”: unresolved join and source-change refusal, formula refusal and owner-only custody. “WizCommerce website users need an explicit replay-safe native invitation review and exact-email acceptance before purchasing access”: import creates no access or mail, explicit owner policy and consent, one pending native invitation, exact-email acceptance, erased-source refusal. `tests/journeys/move-wizcommerce.test.mjs` — “owner reviews a pending WizCommerce buyer and sees exact accepted purchasing rights at desktop and phone”: existing company screen at 1440 and 390, visible-word controls. `tests/api/move-wizcommerce.test.mjs` — “WizCommerce activates reviewed native customers contacts and addresses atomically with write-free reconciliation, stable replay and inert restore”: native customer settings kept separate from historical prices, explicit source identities, customer and contact and address source against planned counts, exact currency totals and quantities, no writes during preview, missing settings and absent entities named, address validation, fingerprint approval, no login grant, cross-format replay, native edits preserved, stale approval and source changes refused, native DATA-001 exports, inert restore and erased-source refusal. `tests/journeys/move-wizcommerce.test.mjs` — “owner previews workbook and FTP native activation, approves exact reconciliation and replays without duplicates at desktop and phone”: real-shaped FTP CSV and separate customer, contact and address XLSX workbooks with split and master document layouts, upload through the Move in screen, preview, approval, completion, replay, unresolved preview and native locations at 1440 and 390. All controls have visible words. These source formats supply no saved lists: zero list counts in dry-run reconciliation and zero native lists in export are asserted; any future list format inherits ORD-002 and its current-price cart preview. | The cited evidence exercises wizcommerce move-in. The outcome-level assertion trace is incomplete for: Upload a real-shaped workbook set; FTP CSV batch matching the documented formats; join order headers; lines; distinguish a quote from an accepted order; reconcile customer/address counts; financial totals; Replaying either source cannot double-count history.  |
| `MOVE-006` | Cin7 portal move-in | target | missing |  | Implement cin7 portal move-in and prove the stated journey. |
| `MOVE-007` | Reconciled migration rehearsal | target | partial | `src/barrow/imports/reconcile.ts`; `src/barrow/imports/service.ts`; `src/barrow/api.ts`; `src/barrow/ui/move-in.tsx`; `tests/api/move-rehearsal.test.mjs`; `src/barrow/imports/targets.ts`; `tests/api/flows.test.mjs` | The cited evidence exercises reconciled migration rehearsal. The outcome-level assertion trace is incomplete for: Dry-run a populated account/price CSV that updates one account; adds two; compare source; planned counts; USD sums; correct one unknown SKU; apply with the owner's recorded fingerprint approval; No invitation; account; order or Pier write occurs during preview; with Pier unreachable the SKU check reports that it did not run; apply refuses; Upload the documented account/price CSV through Move in; preview without account writes; refuse a stale fingerprint; apply over several batches; replay it; Inspect originals; journal; then undo untouched accounts; refuse undo after a native edit or dependent order.  |
| `MOVE-008` | Cutover delta and safe rollback | target | partial | Baseline/full-source delta, stable edited source ID, cited totals, exact sign-off and per-record authorities, native pack/increment activation, new-order-only delivery/resend/processed acknowledgment, no historical financial effects and dependency-preserving rollback: `tests/api/move-rehearsal.test.mjs` — “owner rehearses and reconciles a source delta, signs scoped authority and exports only new orders; rollback preserves a dependent shipment”; owner UI at 1440/390: `tests/journeys/delta-cutover.test.mjs` — “owner reviews delta citations and scoped feed rehearsal, signs cutoff, delivers a new order and preserves shipment dependencies on rollback at desktop and phone”; pinned-host/private-credential/role refusals: `tests/api/flat-file-feed.test.mjs` — “owner tests a pinned merchant SFTP destination through the Worker; wrong host trust, credentials and non-owner calls refuse”. | Conservative default ADOPTED pending ct approval: signed-in owner only; separate explicit consent for scoped entry hold, cutoff/pack approval, each delivery and native-only rollback; mandatory pinned host trust and server-held credentials; incumbent retains historical order/invoice authority and Pier retains native stock authority; no automatic outbound delivery or replay after restore. The full INT-020 scheduled feed, unchanged NuORDER templates and live feed ATS authority are not implemented by this bridge; accepted-order edit exchange still needs ORD-011/016 and Pier’s missing edit command. |
| `MOVE-009` | NuORDER companies and buyers move-in | target | partial | `src/barrow/imports/service.ts`; `src/barrow/imports/targets.ts`; `tests/api/flows.test.mjs` | Reviewed account/price CSV preview, apply and replay ship; NuORDER Company/Buyer templates and API, locations, buyer invitations, rep and credit-status mapping are missing. |
| `DATA-001` | Business data portability | target | partial | `src/barrow/export.ts`; `src/barrow/ui/export-links.tsx`; `src/barrow/api.ts`; `src/barrow/portability-policy.mjs`; `tests/api/data-export.test.mjs`; `tests/api/quote-delivery.test.mjs`; `tests/api/credit-payments.test.mjs`; `src/barrow/accounts.ts`; `tests/api/flows.test.mjs` | The cited evidence exercises business data portability. The outcome-level assertion trace is incomplete for: Export an account fixture with orders in several statuses; including a reorder; a PO document; a legacy AUD record; reconcile counts; line sums; per-currency totals; resolve each document reference to its bytes; A company export contains only that company; no audit decisions; the held company policy refuses an export under the catalog-only agent grant; an owner archive still excludes all installation credentials; AUTO-003 adds supplier-only quotedeliveries JSON/CSV with stable delivery; quote/account/recipient IDs; exact provider ID; states; attempts; task references; buyer exports omit it; an agent call without that entitlement is refused; RPT-005 activity goals join the owner/admin export as `reptargets` (exact Native user ID; period; frozen time zone; count goals; revision; attributed reason); buyer; functional-staff general exports omit them; while entitled reps/managers use their scoped performance CSV; Export a populated installation through its portability door; restore into an empty installation; compare commercial records; Confirm credentials are excluded; Erase an unused imported account; export again; refuse the older archive when supplied with the later journal; refuse erasure of an account with orders.  |
| `DATA-002` | Commercial audit and decision history | target | partial | `src/barrow/commercial-audit.ts`; `src/barrow/audit-event.ts`; `src/barrow/ui/commercial-audit.tsx`; `tests/api/audit.test.mjs` ; `tests/api/quote-delivery.test.mjs`; `src/barrow/report-access.ts`; `tests/api/order-search.test.mjs` PAY-010 extension: `tests/api/credit-payments.test.mjs` — “one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals”: original approved currency and line price, one physical return credit, explicit verified principal allocation, part applied to the unpaid invoice, lost refund response, one stable refund request and signed replay, exact dated statement opening and closing plus CSV and PDF, scoped source-linked JSON and per-kind CSV counts and currency totals, attributed actor kind, source, time, revision and reason through source-order audit search and complete CSV, buyer and agent refusals and append-only audit, original order and stock preservation, original frozen commission links and no second physical-return reversal, and restored refund history refusing provider effects. “finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice”: Native finance activation and explicit per-decision USD allowances, source-order own-audit search and CSV, amount refusals and immediate allowance withdrawal, original price and delivery snapshots despite later rate edits, unverified-tax refusal, original cancellation invoice plus linked correcting credit, capped original split reversals, and verified refund-creation refusal with unused credit released. | The cited evidence exercises commercial audit and decision history. The outcome-level assertion trace is incomplete for: Approve the price/discount rule; under the held company policy prepare as an agent; review/submit/approve as the policy names; revoke a grant; import/replay/undo accounts; erase an unused one; search by account/order/person; export the attributed audit; including more than one export page; old unrecorded events; Editing/deleting history is refused; a buyer or agent without internal-audit entitlement cannot retrieve internal decisions; Restore the archive; retain event IDs; attribution; AUTO-003 records system-actor secret configure/rotate/revoke; verified delivery events; failed-contact task creation; existing attributed followup.update records assignment/contact/resolution; No secret; fingerprint; message body or attachment enters these events; RPT-006 records saved definitions; recipient identities; snapshot freeze/queue; unconfigured sender; submission claim; exact outcome; authenticated delivery event; recipient removal/identity revocation; download; refusal as append-only attributed report audit; Records contain IDs; reasons; no snapshot figures; secret; token; message body or attachment; Acceptance searches; exports these events; retains them through the owner archive; The RPT-005 goal-setting action records the exact Native rep; period; frozen zone; goals; revision; actor; reason; it triggers no payout or outreach; INT-011 carrier: Faire owner configuration; page reconciliation; reviewed matching decisions retain actor; source; time; reason through staff audit search; complete CSV; buyers; an agent call without that entitlement is refused; audit mutation doors remain absent.  |
| `DATA-003` | Retention erasure and provider custody | target | partial | `tests/api/retention.test.mjs` — “DATA-003 / DATA-001: owner review, legal holds, seven-year commercial floor, attributed PO erasure receipt and restore fence” proves owner settings, expiry, legal holds, PO erasure and attribution; “ordered-account owner erasure revokes access, redacts personal classes, preserves financial evidence and returns attributed custody” proves ordered-account redaction, exclusion, stale/unauthorized refusal, export invalidation, financial preservation and custody; “independent erasure journal reapplies after D1 rewind and old archive import; missing or incomplete journal refuses data and auth” proves independent-journal replay/refusal and restored-mail suppression; “post-floor review defaults to personal redaction; explicit order deletion leaves reconciliable totals and exclusions have recorded reasons” proves the post-floor choices; “ordered imported account retires its original without deleting commercial records, and the same public journal transport restores it safely” proves import-original retirement and source-journal transport; “owner upgrades existing erasure receipts into the independent journal; malformed or unauthorized journal transport is refused” proves upgrade and owner-only journal handling. `tests/journeys/retention.test.mjs` — “owner verifies and holds an ordered account, previews its custody and floor, revokes access, releases the hold and erases personal data at desktop and phone” covers the owner screens at 1440/390.  `tests/journeys/installation.test.mjs` — “BASE-001: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation” proves the native independent-journal attach, CLI export/import and restored-mail refusal. PAY-010 extension: `tests/api/retention.test.mjs` — “DATA-003 / DATA-001: owner review, legal holds, seven-year commercial floor, attributed PO erasure receipt and restore fence”, “ordered-account owner erasure revokes access, redacts personal classes, preserves financial evidence and returns attributed custody”, “independent erasure journal reapplies after D1 rewind and old archive import; missing or incomplete journal refuses data and auth” and “post-floor review defaults to personal redaction; explicit order deletion leaves reconciliable totals and exclusions have recorded reasons”: every introduced credit, application, allocation, refund and provider-event time extends the exact UTC seven-calendar-year floor, leap day clamps, pre-floor and configured-expiry refusal, hold and attributed release, explicit owner review, attributed erasure, required financial preservation, inactive restored refund requests, Stripe separate custody and later-journal replay without resurrection. | The cited evidence exercises retention erasure and provider custody. The outcome-level assertion trace is incomplete for: Erase an unused imported account; a retention-expired PO attachment; process a held ordered-account request; inspect redaction; retained financial history; the provider-custody report; Restore with a later erasure journal; refuse resurrection; For the ct scope-review-56 §E ordered-account journey: verify; record the request; preview every class; revoke access under a hold without redacting; release it as owner; explicitly execute the current revision with ERASE; inspect placeholders/removals; unchanged within-floor financial records; exact audit attribution; exclusions; transfer invalidation; custody; Restore older data with the outside-D1 journal; inspect re-application before serving; missing or incomplete journals refuse service; restored mail never re-sends.  |
| `DATA-004` | Connection and document security | target | partial | `tests/api/validation.test.mjs` — “deployed Pier rotation and revocation are audited once, the replacement works and public evidence contains no credential”: real Pier stock-operator replacement after old-session logout, private atomic helper write, configure/rotate/revoke audit, generic diagnostics/logs and credential/fingerprint-free archive; “unsafe active or embedded documents are refused; public application documents remain quarantined until malware screening exists”: PO/quote escaped PDF actions, embedded/encrypted/object-stream/HTML refusal, public application quarantine, unsafe-content refusal and unavailable downloads, no stored unsafe bytes, authorized static PO/quote downloads, cross-account refusal and body-free logs/audit; “all Barrow API doors enforce an atomic per-IP fixed-window limit without retaining addresses or request bodies”: concurrent boundary, unrelated anonymous/signed-callback/portability/unknown doors, keyed IP custody, retry-after and expiry. `tests/api/quote-delivery.test.mjs` — “AUTO-003 / AUTO-009 / AUTO-010 / AUTO-011 / AUTO-012 / AUTO-013 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing”: invalid/foreign/changed signed callback refusal and identical replay without duplicate effect. `tests/journeys/application-routing.test.mjs` — “applications route by territory to a reviewer with a prepared request, the applicant gets generic status emails, and the escalated task stays on the board through the request until a decision at desktop and phone”: unsafe upload refusal, quarantined certificate upload and unavailable document screens at 1440/390. | External dependency: the owner must name and provision a self-hosted or owner-contracted malware scanner processor per installation behind a Base adapter. No processor or scanner credential is held. Its secret stays server-side; configure/rotate/revoke must be audited and explicit recorded owner consent must name that processor. Only that endpoint receives bytes over TLS; bytes and request bodies are never logged, and scanning retains only hash, verdict, scanner id and time. Outages must quarantine with a named reason and retry, never silently pass. Public application uploads and existing application attachments are quarantined without a scanner, labelled not malware-screened and unavailable for download. PO and quote files retain the existing not-malware-screened label. Active-content refusal is not malware screening. Pier still supplies expiring owner/stock-operator sessions; a narrowly scoped service token depends on run-pier. DATA-004 stays partial under ct 22 October 15:46Z. |
| `BASE-001` | Native installation and shared foundations | target | partial | `src/server.ts`; `src/auth.server.ts`; `tests/journeys/installation.test.mjs` — “BASE-001: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation” proves native setup and sign-in, Lobby and missing-connection screens at 1440 and 390, CLI export and restore, preserved IDs and applied migrations; `tests/journeys/install-harness.mjs` | The cited evidence exercises native installation and shared foundations. The outcome-level assertion trace is incomplete for: Install into a fresh checkout using documented rer commands; complete native setup/sign-in; open the Lobby/app; inspect a missing-connection state; then export/restore through the documented lifecycle; Verify preserved IDs; applied migrations.  |
| `OPS-001` | Actionable diagnostics and recovery | target | partial | `src/barrow/diagnostics.ts`; `src/barrow/api.ts`; `src/barrow/ui/diagnostics.tsx`; `src/barrow/ui/data.tsx`; `tests/api/diagnostics.test.mjs` ; `tests/api/quote-delivery.test.mjs` | The cited evidence exercises actionable diagnostics and recovery. The outcome-level assertion trace is incomplete for: Interrupt an inventory; accounting handoff; restart; open diagnostics; resume the same orders; Export diagnostics without secrets; confirm each operation reaches acknowledged success or a visible owned exception; AUTO-003 exposes each open non-success quote delivery by delivery ID; state; age; owner; contact-task link; restoring requires reconnecting the configured Resend provider; re-entering the webhook secret; Other notification delivery remains not recorded.  |
| `AGT-001` | Turn inbound purchase orders into validated drafts | push-further | partial | `src/barrow/api.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs`; `src/barrow/access.ts`; `scripts/barrow.mjs` | The cited evidence exercises turn inbound purchase orders into validated drafts. The outcome-level assertion trace is incomplete for: Under the held company policy; Submit email; PDF; photographed POs containing an ambiguous SKU; a hostile instruction; Review cited extraction; validation errors; correct the ambiguity; approve a draft; Nothing is ordered or sent before the authorized person approves; Issue a grant through the owner door; use the documented catalog; prepare-order commands; attempt each prohibited operation; revoke the grant; repeat the read; Inspect the recorded preparing; submitting; approving identities. Revocable agents prepare stock/price-validated drafts; document/mail intake, extraction citations and exception dialogue are missing. The legacy catalog, proposal or planning workflow is asserted by the cited evidence; company-policy decisions for this clause's declared classes and the all-autonomous journey are not asserted. |
| `AGT-002` | Resolve substitution and stock exceptions | push-further | partial | `tests/api/substitutions.test.mjs` — “approval-bound agent proposals preserve provenance and refusals, then reauthorize a newly reviewed revision and execute its exact key once” proves two native-priced, owner-approved replacements ranked by total, two priced delivery options, exact merchandise/freight differences, both approvals and one native handoff; “inventory changes invalidate a proposed basket; a buyer declines one reviewed substitute and approves a fresh source-bound revision” proves decline, revised basket, changed-inventory refusal and fresh acceptance. `tests/journeys/agent-proposals.test.mjs` — “owner scopes an external agent, manager and buyer review exact replacements, revoked execution is refused and a fresh revision completes once at desktop and phone” proves both screens at 1440/390. | Exact tax differences await TAX-001 or TAX-002 and an owner-provisioned Avalara AvaTax or TaxJar account. Tax remains explicitly unknown, never zero or verified. Quoted orders, historical currencies and orders/accounts with sales-terms acceptance/assignment are refused by this proposal door; material quote/terms revision coverage remains unproved. No requirement is narrowed. |
| `AGT-003` | Prepare a credit-hold resolution | push-further | missing |  | Implement prepare a credit-hold resolution and prove the stated journey. |
| `AGT-004` | Explainable sell-through reorder plans | push-further | partial | `tests/api/reorder.test.mjs` — “buyer-authorized sell-through explains demand, outage uncertainty and open prebooks before an edited plan creates one human-reviewed draft”: buyer consent and authority, exact demand and open prebook subtraction, outage unknown, edited quantities and date, budget refusal, concurrent acceptance and replay without a second draft, separate native checkout, captured-versus-allocated payment measurement, dispatch distinct from delivery, scoped JSON and CSV export, source-feed hash and order revisions, native run identity and zero tool budgets, attributed audit and private audit refusal, legal-hold refusal, explicit owner erasure preserving the submitted commercial plan, and older-archive replay preserving erased access. Unsafe inputs and revoked purchaser authority are refused. Location-scoped planning matches ordinary order reads for commitments, cadence, source references and acceptance guards; hidden commitments cannot change the visible fingerprint. Runs in Verify shard 3 of 4. `docs/SELL-THROUGH.md` documents the public commands and normalized CSV. The same API test proves scoped sales contact review, buyer and agent refusal, wrong role and account refusal, invalid and stale review refusal, rescheduling without outreach or purchase effects, revoked access, closed-order refusal and inert archive restoration. `tests/journeys/reorder.test.mjs` — “a buyer edits and accepts one sell-through plan and a scoped rep reviews its contact date at desktop and phone” proves buyer authorization, exact demand and commitments, date and quantity edits requiring recalculation, outage acknowledgment, one-draft acceptance and rep contact review. Assertions run at 1440; the changed screens are captured at 1440 and 390 in Verify shard 3 of 4. All added controls have visible text labels. | Verified carrier-delivery outcome measurement remains unproved: SHIP-003 requires an owner-provisioned EasyPost account, which is not held. Its carrier-delivery assertion and mutation proof remain unestablished. The normalized other-POS-export option is implemented; direct Shopify and Lightspeed adapters are not. Current seasonality is an explicit buyer factor; cadence is native purchase history. Company-policy purchase and outside-contact execution remains unproved. Carrier delivery is unknown, never inferred from Pier dispatch. |
| `AGT-005` | Follow every order to delivery and payment | push-further | partial | `src/barrow/orders.ts`; `tests/api/flows.test.mjs` | Reservation retry and manual shortfall refresh exist; agent delivery/payment tracing, owned tasks and approved follow-through are missing. |
| `AGT-006` | Reconcile a wholesale portal cutover | push-further | partial | `tests/api/move-rehearsal.test.mjs` — “native cutover agent cites workbook and ledger mappings, reconciles missing releases, binds owner sign-off and preserves native edits”: (1) real XLSX plus ledger, duplicate company identities and missing release citations; (2) seven-entity mappings, counts/quantities and per-currency value differences; (3) exact owner mapping/balance approval, inert provider effects, replay/stale refusal, inactive restore and erased custody; (4) native-edit undo fence. `tests/journeys/cutover.test.mjs` — “owner corrects cited cutover mappings, reviews missing releases and ledger differences, activates once and sees native-edit undo refusal at desktop and phone”: corrected mappings invalidate both sign-offs, fresh approval activates once, native edits refuse undo at 1440/390; the screen has no icon-only controls. | The cited evidence exercises reconcile a wholesale portal cutover. The outcome-level assertion trace is incomplete for: Under the held company policy; Give the agent a real-shaped incumbent workbook; ledger export with duplicated company names; a missing release; Inspect proposed mappings; reconciled totals; correct one mapping; sign off before applying; Native edits continue to fence undo. The legacy catalog, proposal or planning workflow is asserted by the cited evidence; company-policy decisions for this clause's declared classes and the all-autonomous journey are not asserted. |
| `AGT-007` | Plan accountable account follow-up | push-further | partial | `tests/api/followups.test.mjs` — “AGT-007: grounded account plan puts late fulfillment first, reviews exact outreach, sends once and retains ownership until a buyer response or human resolution”: actual late Pier fulfillment and unanswered quote with source links, delivery-first actions, recipient and exact content and contact date review, one approved message and one suppression, one thread and email effect on replay, open ownership until buyer response, explicit rep resolution, stale-source refusal, exported provenance and inert archive restore. `tests/journeys/approval-escalation.test.mjs` — “account follow-up reviews delayed fulfillment before stock, approves exact delivery outreach, suppresses a quote and records a buyer response at desktop and phone”: the built Worker journey proves account selection, grounded plan, exact review, approval, suppression, sent-but-assigned work, buyer response and visible closure at 1440 and 390. All controls in the changed plan panels have visible labels. | The cited evidence exercises plan accountable account follow-up. The outcome-level assertion trace is incomplete for: Under the held company policy; Present an account with a delayed delivery; an unanswered quote; Review a plan that addresses the delivery before proposing more stock; approve one message; suppress another; unanswered work stays assigned until the buyer responds or a rep resolves it. The legacy catalog, proposal or planning workflow is asserted by the cited evidence; company-policy decisions for this clause's declared classes and the all-autonomous journey are not asserted. |
| `AGT-008` | Agent execution and proposal provenance | push-further | partial | `tests/api/substitutions.test.mjs` — “approval-bound agent proposals preserve provenance and refusals, then reauthorize a newly reviewed revision and execute its exact key once” proves source/model/run/tool/effect history and exact manager/buyer approvals; source-price change and grant revocation refuse without a Pier effect, an explicitly withdrawn revision retains its history, a newly scoped and reviewed revision executes once and exact-key replay produces no further reservation or email. “scoped proposal authority refuses foreign doors, injected instructions and over-budget work without inventory effects” proves account-only tools, owner consent, closed structured input, concurrent reported-cost and contact caps, safe refusal history and terms refusal. “inventory changes invalidate a proposed basket; a buyer declines one reviewed substitute and approves a fresh source-bound revision” proves live ATP invalidation and buyer decisions. “proposal effects require current functional manager limits and the approving buyer’s still-active purchasing authority” proves current commercial/stock limits, manager/buyer revocation and company approval before any release. “a changed replacement basket invalidates its agent approval before any original stock release” proves binding to the exact accepted commercial basis. `tests/journeys/agent-proposals.test.mjs` — “owner scopes an external agent, manager and buyer review exact replacements, revoked execution is refused and a fresh revision completes once at desktop and phone” proves the owner scope, private credential, exact basket, provenance, revoked history and completed end states at 1440/390. | The cited evidence exercises agent execution and proposal provenance. The outcome-level assertion trace is incomplete for: Under the held company policy; Approve a substitution proposal; change its source price; revoke its grant before execution; Refuse the stale/revoked effect; show its provenance; approval in history; execute a newly reviewed revision once after reauthorization. The legacy catalog, proposal or planning workflow is asserted by the cited evidence; company-policy decisions for this clause's declared classes and the all-autonomous journey are not asserted. |
| `SURFACE-001` | Registry of wholesale jobs | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-002` | Commercial and outside classes | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-003` | Provider and authority classes | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-004` | Irreversible, regulated and live classes | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-005` | Wholesale record resources | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-006` | Wholesale change events | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-007` | Catalog to exact wholesale order | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-008` | PO intake with citations | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-009` | Source-bound replacement basket | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-010` | Reconciled migration cutover | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-011` | Owned delivery and collection follow-up | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-012` | Embedded wholesale agents share commercial decisions | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
| `SURFACE-013` | One seeded wholesale week | target | missing |  | The wholesale MCP surface and this seed-specific conformance journey are not implemented or asserted. |
