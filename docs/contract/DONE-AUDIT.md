Old reference: `b8c30605789ead56f02fdba13574b18a0285110e`.
| Clause | Point | Outcome | Asserting test | Result |
| --- | --- | --- | --- | --- |
| BAR-006 | 1 | A missing guide serves the actual built 404 document. | `tests/site.test.mjs:65` | asserted |
| BAR-006 | 1 | Guide navigation reaches a rendered article. | `tests/site.test.mjs:61` | asserted |
| BAR-006 | 1 | Build with rer build --site. | none | none |
| BAR-006 | 1 | serve the output. | none | none |
| BAR-006 | 1 | traverse the homepage. | none | none |
| BAR-006 | 1 | /run. | none | none |
| BAR-006 | 1 | local assets. | none | none |
| BAR-006 | 2 | Confirm the installed route keeps its Lobby. | none | none |
| BAR-006 | 2 | the site contains no private account data. | none | none |
| ACC-002 | 1 | The released order records purchaser and approver identities. | `tests/api/flows.test.mjs:377` | asserted |
| ACC-002 | 1 | Finance reads the source invoice on its statement. | `tests/api/flows.test.mjs:380` | asserted |
| ACC-002 | 1 | Invite four company users. | none | none |
| ACC-002 | 1 | build a cart as a limited purchaser. | none | none |
| ACC-002 | 1 | approve it as the authorized approver. | none | none |
| ACC-002 | 1 | refuse finance ordering. | none | none |
| ACC-002 | 1 | cross-company administration. | none | none |
| ACC-002 | 2 | Quote notices reach current purchasing recipients and omit finance. | `tests/api/flows.test.mjs:395` | asserted |
| ACC-002 | 2 | Expiry delivery has the exact current recipient list and no replay. | `tests/api/flows.test.mjs:396` | asserted |
| ACC-002 | 2 | Before shipping. | none | none |
| ACC-002 | 2 | route AUTO-003 emails. | none | none |
| ACC-002 | 2 | expiry reminders to the company purchasers with current rights. | none | none |
| ACC-002 | 2 | retaining exact recipient identity/revocation. | none | none |
| ACC-002 | 2 | private internal notes. | none | none |
| ACC-003 | 1 | The headquarters bill-to is retained on both store orders. | `tests/api/locations.test.mjs:39` | asserted |
| ACC-003 | 1 | The first store’s address and US-NY jurisdiction are copied. | `tests/api/locations.test.mjs:39` | asserted |
| ACC-003 | 1 | The second store’s address and US-NJ jurisdiction are copied. | `tests/api/locations.test.mjs:40` | asserted |
| ACC-003 | 1 | Changing defaults leaves the first order’s delivery instructions, jurisdiction and revision unchanged. | `tests/api/locations.test.mjs:51` | asserted |
| ACC-003 | 1 | The second existing order retains US-NJ. | `tests/api/locations.test.mjs:52` | asserted |
| ACC-003 | 1 | A later order uses the new default store. | `tests/api/locations.test.mjs:54` | asserted |
| ACC-003 | 1 | Every copied bill-to and ship-to physical-address field remains unchanged after changing the default. | none | none |
| ACC-004 | 1 | Record the commercial profile. | none | none |
| ACC-004 | 1 | place an order. | none | none |
| ACC-004 | 1 | hold then close its account. | none | none |
| ACC-004 | 1 | attempt checkout through the buyer. | none | none |
| ACC-004 | 1 | agent HTTP doors. | none | none |
| ACC-004 | 1 | including submission. | none | none |
| ACC-004 | 1 | first approval of earlier drafts. | none | none |
| ACC-004 | 2 | Closed-account history preserves the original order. | `tests/api/flows.test.mjs:162` | asserted |
| ACC-004 | 2 | The buyer still reads an identical issued invoice. | `tests/api/flows.test.mjs:163` | asserted |
| ACC-004 | 2 | History. | none | none |
| ACC-004 | 2 | invoices remain readable to the same authorized buyer. | none | none |
| ACC-004 | 2 | new orders are refused. | none | none |
| ACC-004 | 2 | a duplicate email cannot take over the company. | none | none |
| ACC-004 | 3 | Recovery after closure leaves one inventory order. | `tests/api/flows.test.mjs:169` | asserted |
| ACC-004 | 3 | Recover an already-approved lost reservation response after closure without a second stock command. | none | none |
| ACC-004 | 4 | Refuse an unreviewed or stale duplicate-company save. | none | none |
| ACC-004 | 4 | review separate companies. | none | none |
| ACC-004 | 4 | import a duplicate-bearing CSV plan. | none | none |
| ACC-004 | 4 | inspect the attributed review through an owner export. | none | none |
| ACC-004 | 4 | original identities. | none | none |
| ACC-004 | 4 | native profile fields survive. | none | none |
| ACC-005 | 1 | Invite each supplier role. | none | none |
| ACC-005 | 1 | attempt a credit override as a rep. | none | none |
| ACC-005 | 1 | a catalog edit as operations. | none | none |
| ACC-005 | 1 | allow the authorized finance. | none | none |
| ACC-005 | 1 | manager actions. | none | none |
| ACC-005 | 1 | inspect attributed audit events. | none | none |
| ACC-005 | 2 | Before shipping. | none | none |
| ACC-005 | 2 | each new functional supplier role. | none | none |
| ACC-005 | 2 | including invited analyst/finance operators for outside accountants or buyer AP. | none | none |
| ACC-005 | 2 | becomes eligible for RPT-006 only for its entitled report types. | none | none |
| ACC-005 | 3 | Outside recipients are invited operators. | none | none |
| ACC-005 | 3 | never bare addresses. | none | none |
| ACC-005 | 4 | Using the native sign-in. | none | none |
| ACC-005 | 4 | HTTP commands. | none | none |
| ACC-005 | 4 | read as two different buyers. | none | none |
| ACC-005 | 4 | attempt foreign account reads. | none | none |
| ACC-005 | 4 | cross-origin writes. | none | none |
| ACC-005 | 4 | supplier actions as a buyer. | none | none |
| ACC-005 | 4 | then revoke an agent grant. | none | none |
| ACC-005 | 5 | Unauthorized requests return no commercial data. | none | none |
| ACC-005 | 5 | perform no mutation. | none | none |
| ACC-006 | 1 | Assign two reps disjoint accounts. | none | none |
| ACC-006 | 1 | give one temporary vacation coverage. | none | none |
| ACC-006 | 1 | expire it. | none | none |
| ACC-006 | 2 | Order. | none | none |
| ACC-006 | 2 | export access follows current assignments. | none | none |
| ACC-006 | 3 | a rep is an active Native member whose ACC-005 grant is the rep role. | none | none |
| ACC-006 | 4 | A rep holds an account on a calendar day in America/New_York (inclusive dates) only through a primary assignment of that exact account or of every account whose profile territory equals the named territory. | none | none |
| ACC-006 | 4 | temporary coverage of an account. | none | none |
| ACC-006 | 4 | a territory or everything another rep primarily holds (coverage requires an end date. | none | none |
| ACC-006 | 4 | never moves commission attribution). | none | none |
| ACC-006 | 4 | or an exact account the owner listed on the grant. | none | none |
| ACC-006 | 5 | Profile assigned-rep. | none | none |
| ACC-006 | 5 | territory text. | none | none |
| ACC-006 | 5 | rep labels. | none | none |
| ACC-006 | 5 | names grant nothing. | none | none |
| ACC-006 | 6 | Owner. | none | none |
| ACC-006 | 6 | admin. | none | none |
| ACC-006 | 6 | an all-account sales manager assign. | none | none |
| ACC-006 | 6 | cover. | none | none |
| ACC-006 | 6 | end. | none | none |
| ACC-006 | 6 | transfer with a reason. | none | none |
| ACC-006 | 6 | every change is revision-guarded. | none | none |
| ACC-006 | 6 | immediate. | none | none |
| ACC-006 | 6 | audited (assignment. | none | none |
| ACC-006 | 6 | coverage. | none | none |
| ACC-006 | 6 | ending. | none | none |
| ACC-006 | 6 | transfer events). | none | none |
| ACC-006 | 6 | at most one primary rep holds an account on any day. | none | none |
| ACC-006 | 6 | no earlier order. | none | none |
| ACC-006 | 6 | quote. | none | none |
| ACC-006 | 6 | notice. | none | none |
| ACC-006 | 6 | commission snapshot or audit event is rewritten. | none | none |
| ACC-006 | 7 | One current-scope definition feeds the staff account scope. | none | none |
| ACC-006 | 7 | so catalog. | none | none |
| ACC-006 | 7 | order. | none | none |
| ACC-006 | 7 | quote. | none | none |
| ACC-006 | 7 | invoice. | none | none |
| ACC-006 | 7 | export. | none | none |
| ACC-006 | 7 | report. | none | none |
| ACC-006 | 7 | task doors follow it with no second list. | none | none |
| ACC-006 | 7 | a write that read an older scope fails its guard. | none | none |
| ACC-006 | 8 | Archives restore assignments as ended (restored grants are already revoked). | none | none |
| ACC-006 | 8 | unused-account erasure removes that account’s assignments. | none | none |
| ACC-008 | 1 | Before shipping. | none | none |
| ACC-008 | 1 | route AUTO-003 emails. | none | none |
| ACC-008 | 1 | expiry reminders to the assigned or covering rep. | none | none |
| ACC-008 | 1 | scope failed-contact task ownership/reassignment to current coverage. | none | none |
| ACC-008 | 1 | rep profile metadata alone grants nothing. | none | none |
| ACC-008 | 2 | Buyers see the names of the account’s primary. | none | none |
| ACC-008 | 2 | covering reps. | none | none |
| ACC-008 | 2 | the coverage end date. | none | none |
| ACC-008 | 2 | never identities or contact details. | none | none |
| ACC-008 | 3 | Supplier-side quote notices (request. | none | none |
| ACC-008 | 3 | buyer message. | none | none |
| ACC-008 | 3 | internal note. | none | none |
| ACC-008 | 3 | acceptance) name the account’s current assigned. | none | none |
| ACC-008 | 3 | covering reps. | none | none |
| ACC-008 | 3 | excluding the actor. | none | none |
| ACC-008 | 3 | in-app. | none | none |
| ACC-008 | 3 | by AUTO-003 mail. | none | none |
| ACC-008 | 3 | a revision waiting for discount approval. | none | none |
| ACC-008 | 3 | an account with no current rep keep the owner/admin audience. | none | none |
| ACC-008 | 3 | an owner or admin marking a quote read clears only their own notices. | none | none |
| ACC-008 | 3 | a rep reads only quote threads of accounts they hold. | none | none |
| ACC-008 | 4 | Dispatch rechecks the rep’s current hold. | none | none |
| ACC-008 | 4 | withdraws a recipient who lost it without substitution. | none | none |
| ACC-008 | 4 | expiry reminders go to the buyer. | none | none |
| ACC-008 | 4 | the reps who hold the account that day (owner/admin only when none does). | none | none |
| ACC-008 | 5 | A failed-contact task starts with the proposing rep while they hold the account. | none | none |
| ACC-008 | 5 | only current holders (or owner/admin) can be assigned or read it. | none | none |
| ACC-008 | 5 | AUTO-005 next actions. | none | none |
| ACC-008 | 5 | source links. | none | none |
| ACC-008 | 5 | the follow-up export carry only held accounts. | none | none |
| ACC-009 | 1 | Before shipping. | none | none |
| ACC-009 | 1 | RPT-009 scheduled report sends. | none | none |
| ACC-009 | 1 | downloads require current assigned/covered-account access to the whole saved filter. | none | none |
| ACC-009 | 1 | narrower access is refused with an attributed reason. | none | none |
| ACC-009 | 1 | never trimmed. | none | none |
| ACC-009 | 2 | Assignment changes revoke existing links. | none | none |
| ACC-009 | 2 | cancel queued deliveries. | none | none |
| ACC-009 | 3 | Scheduled-report recipients must hold the one saved account when the report freezes. | none | none |
| ACC-009 | 3 | sends. | none | none |
| ACC-009 | 3 | is opened. | none | none |
| ACC-009 | 3 | an assignment ending cancels their queued sends at once. | none | none |
| ACC-009 | 3 | revokes links. | none | none |
| ACC-009 | 3 | records a system audit event. | none | none |
| ACC-009 | 3 | territory filters stay with all-account readers. | none | none |
| ACC-010 | 1 | Historical commission attribution survives a transfer. | none | none |
| ACC-010 | 2 | A rep’s sales. | none | none |
| ACC-010 | 2 | finance report names one held account or a territory held completely (page. | none | none |
| ACC-010 | 2 | CSV). | none | none |
| ACC-010 | 2 | any other account or territory. | none | none |
| ACC-010 | 2 | or an unfiltered report. | none | none |
| ACC-010 | 2 | is refused. | none | none |
| ACC-010 | 2 | never trimmed. | none | none |
| ACC-010 | 2 | a rep’s commission statement is bound to their fixed label. | none | none |
| ACC-010 | 2 | lists only accounts held today. | none | none |
| ACC-010 | 2 | while owner. | none | none |
| ACC-010 | 2 | admin. | none | none |
| ACC-010 | 2 | all-account managers still read every frozen statement. | none | none |
| ACC-010 | 3 | New first approvals freeze the fixed commission label of the single primary rep (else the account’s recorded assigned-rep text) so a transfer changes future attribution only. | none | none |
| ACC-010 | 3 | RPT-002 rep rows use the primary assignment. | none | none |
| ACC-010 | 3 | else the ACC-004 text. | none | none |
| ACC-007 | 1 | Submit a $6,000 cart above a purchaser limit. | none | none |
| ACC-007 | 1 | complete two approvals. | none | none |
| ACC-007 | 1 | revise quantities. | none | none |
| ACC-007 | 1 | require fresh approval. | none | none |
| ACC-007 | 2 | Delegate an absent approver. | none | none |
| ACC-007 | 2 | prove a lower-rights buyer cannot bypass the route. | none | none |
| CAT-001 | 1 | Sign in as two buyers with different price lists. | none | none |
| CAT-001 | 1 | request both catalogs. | none | none |
| CAT-001 | 1 | direct API paths. | none | none |
| CAT-001 | 1 | each sees only its own priced items. | none | none |
| CAT-001 | 1 | no upstream credentials. | none | none |
| CAT-003 | 1 | Publish a spring line sheet showing wholesale. | none | none |
| CAT-003 | 1 | MSRP to one account. | none | none |
| CAT-003 | 1 | a wholesale-only sheet to another account with different prices. | none | none |
| CAT-003 | 1 | order from each on a phone. | none | none |
| CAT-003 | 1 | export each account PDF. | none | none |
| CAT-003 | 2 | Each page. | none | none |
| CAT-003 | 2 | PDF shows exactly its configured price columns. | none | none |
| CAT-003 | 2 | a revoked share cannot expose the sheet or another account price. | none | none |
| CAT-006 | 1 | Configure two brands. | none | none |
| CAT-006 | 1 | a buyer approved for one. | none | none |
| CAT-006 | 1 | refuse the other brand. | none | none |
| CAT-006 | 1 | then approve a second profile. | none | none |
| CAT-006 | 1 | switch. | none | none |
| CAT-006 | 2 | Each cart. | none | none |
| CAT-006 | 2 | invoice. | none | none |
| CAT-006 | 2 | export names the correct seller. | none | none |
| CAT-006 | 2 | ISO currency. | none | none |
| CAT-006 | 2 | retaining exact integer minor units without conversion by relabeling. | none | none |
| CAT-007 | 1 | Order a size run that includes a higher-priced extended size. | none | none |
| CAT-007 | 1 | a case assortment through a line-sheet matrix. | none | none |
| CAT-007 | 1 | inspect exact SKU quantities. | none | none |
| CAT-007 | 1 | per-size prices in the order. | none | none |
| CAT-007 | 1 | inventory handoff. | none | none |
| CAT-007 | 1 | reject an unavailable size without silently reallocating it. | none | none |
| CAT-009 | 1 | Preview a product workbook containing a duplicate barcode. | none | none |
| CAT-009 | 1 | broken media reference. | none | none |
| CAT-009 | 1 | correct it. | none | none |
| CAT-009 | 1 | apply. | none | none |
| CAT-009 | 1 | export. | none | none |
| CAT-009 | 2 | A source-owned field edit is refused or explicitly routed to that source outcome. | none | none |
| PRI-001 | 1 | The two accounts expose their own exact USD unit prices. | `tests/api/order-guarantee.test.mjs:43` | asserted |
| PRI-001 | 1 | Prepared checkout totals equal each account’s agreed cents times quantity. | `tests/api/order-guarantee.test.mjs:50` | asserted |
| PRI-001 | 1 | The invoice preserves exact currency, quantity and unit cents. | `tests/api/order-guarantee.test.mjs:85` | asserted |
| PRI-001 | 1 | The invoice preserves line and total cents. | `tests/api/order-guarantee.test.mjs:86` | asserted |
| PRI-001 | 2 | The restored historical order retains AUD. | `tests/api/order-guarantee.test.mjs:127` | asserted |
| PRI-002 | 1 | Price quantities just below. | none | none |
| PRI-002 | 1 | above a volume break. | none | none |
| PRI-002 | 1 | combine an account discount. | none | none |
| PRI-002 | 1 | a negotiated override. | none | none |
| PRI-002 | 1 | verify the displayed rule. | none | none |
| PRI-002 | 1 | exact total survive the order snapshot. | none | none |
| PRI-003 | 1 | The API exposes the configured minimum and pack refusal. | `tests/api/case-packs.test.mjs:21` | asserted |
| PRI-003 | 1 | Enter below-minimum. | none | none |
| PRI-003 | 1 | non-case quantities in the cart. | none | none |
| PRI-003 | 1 | CSV. | none | none |
| PRI-003 | 1 | API. | none | none |
| PRI-003 | 1 | then split a valid order. | none | none |
| PRI-003 | 2 | A buyer-selected correction orders exactly the selected quantity. | `tests/api/case-packs.test.mjs:35` | asserted |
| PRI-003 | 2 | Each door enforces the configured rules. | none | none |
| PRI-003 | 2 | requires the buyer to accept any corrected quantities. | none | none |
| PRI-004 | 1 | Two cases and six each retain the exact separate line units, base quantities and prices. | `tests/api/units.test.mjs:36` | asserted |
| PRI-004 | 1 | The inventory handoff reserves exactly 30 base units. | `tests/api/units.test.mjs:40` | asserted |
| PRI-004 | 1 | Invoice rows retain separate case and each pricing bases. | `tests/api/units.test.mjs:43` | asserted |
| PRI-004 | 1 | An undefined unit conversion is refused with UNIT. | `tests/api/units.test.mjs:28` | asserted |
| PRI-005 | 1 | Combine eligible styles to qualify for a mix-and-match promotion. | none | none |
| PRI-005 | 1 | remove one. | none | none |
| PRI-005 | 1 | apply a nonstackable discount. | none | none |
| PRI-005 | 1 | return part of the bundle. | none | none |
| PRI-005 | 2 | Totals. | none | none |
| PRI-005 | 2 | credits follow the published rule once. | none | none |
| PRI-005 | 3 | supplier owners. | none | none |
| PRI-005 | 3 | admins publish dated offers for explicit accounts. | none | none |
| PRI-005 | 3 | SKU sets. | none | none |
| PRI-005 | 4 | Fixed bundles require every configured base-unit quantity. | none | none |
| PRI-005 | 4 | mix offers require a combined base-unit threshold. | none | none |
| PRI-005 | 5 | Each qualified offer redeems once per order against all eligible units. | none | none |
| PRI-005 | 6 | Highest priority wins. | none | none |
| PRI-005 | 6 | with offer ID breaking ties: an exclusive winner replaces account. | none | none |
| PRI-005 | 6 | group discounts. | none | none |
| PRI-005 | 6 | excludes other offers. | none | none |
| PRI-005 | 6 | otherwise stackable offers apply sequentially to remaining cents. | none | none |
| PRI-005 | 7 | Approved overrides. | none | none |
| PRI-005 | 7 | negotiated quotes are excluded. | none | none |
| PRI-005 | 8 | Preview shows the current account total. | none | none |
| PRI-005 | 8 | offer basis. | none | none |
| PRI-005 | 8 | discount. | none | none |
| PRI-005 | 8 | final cents. | none | none |
| PRI-005 | 8 | margin against an explicit supplier-entered scenario cost. | none | none |
| PRI-005 | 8 | never inferred inventory cost. | none | none |
| PRI-005 | 8 | Draft replacements. | none | none |
| PRI-005 | 8 | submitted quantity revisions requalify the whole basket. | none | none |
| PRI-005 | 8 | submission. | none | none |
| PRI-005 | 8 | supplier approval refuse stale promotion prices. | none | none |
| PRI-005 | 8 | Approved lines freeze offer IDs. | none | none |
| PRI-005 | 8 | names. | none | none |
| PRI-005 | 8 | original basis. | none | none |
| PRI-005 | 8 | discounts. | none | none |
| PRI-005 | 8 | net cents. | none | none |
| PRI-005 | 8 | PAY-010 credits only the original net line value against a real Pier receipt. | none | none |
| PRI-005 | 8 | once per receipt. | none | none |
| PRI-005 | 8 | without retroactive requalification. | none | none |
| PRI-005 | 8 | the final returned unit receives remaining rounding cents. | none | none |
| PRI-005 | 8 | RPT-002 counts placed. | none | none |
| PRI-005 | 8 | uncancelled promoted orders once by preparation date. | none | none |
| PRI-005 | 8 | account. | none | none |
| PRI-005 | 8 | currency. | none | none |
| PRI-005 | 8 | using frozen offer attribution. | none | none |
| PRI-005 | 8 | original net values less cumulative Pier returns. | none | none |
| PRI-005 | 8 | Per-offer rows overlap for stacked offers. | none | none |
| PRI-005 | 8 | summary totals count each order once. | none | none |
| PRI-005 | 8 | Product. | none | none |
| PRI-005 | 8 | rep. | none | none |
| PRI-005 | 8 | cohort comparisons use the same scope. | none | none |
| PRI-005 | 8 | Unavailable Pier returns show unknown. | none | none |
| PRI-005 | 8 | never zero. | none | none |
| PRI-007 | 1 | Alter client. | none | none |
| PRI-007 | 1 | agent totals. | none | none |
| PRI-007 | 1 | prices. | none | none |
| PRI-007 | 1 | refuse invalid units. | none | none |
| PRI-007 | 1 | packs. | none | none |
| PRI-007 | 1 | minimums. | none | none |
| PRI-007 | 1 | change a price after drafting. | none | none |
| PRI-007 | 1 | submit through the public API. | none | none |
| PRI-007 | 2 | Recheck live stock. | none | none |
| PRI-007 | 2 | refuse an unavailable/revoked source outcome. | none | none |
| PRI-007 | 2 | a supplier reservation shortfall stays visible. | none | none |
| PRI-007 | 2 | cannot invoice. | none | none |
| PRI-007 | 3 | Exercise freshness refusal. | none | none |
| PRI-007 | 3 | refresh. | none | none |
| PRI-007 | 3 | a supplier-only reasoned exception. | none | none |
| PRI-007 | 3 | inspect its audit. | none | none |
| PRI-007 | 4 (old) | The credit-exhaustion step is retained in PAY-004/PAY-005 before credit ships.. | none | moved |
| PRI-008 | 1 | Import a price book with wholesale. | none | none |
| PRI-008 | 1 | MSRP columns in USD. | none | none |
| PRI-008 | 1 | CAD. | none | none |
| PRI-008 | 1 | publish one line sheet showing both prices. | none | none |
| PRI-008 | 1 | one showing wholesale only. | none | none |
| PRI-008 | 1 | open each as its buyer on the page. | none | none |
| PRI-008 | 1 | PDF. | none | none |
| PRI-008 | 1 | order confirmation (ORD-014). | none | none |
| PRI-008 | 1 | order CSV. | none | none |
| PRI-008 | 2 | Each shows exactly the configured columns. | none | none |
| PRI-008 | 2 | ISO currency with exact integer minor units. | none | none |
| PRI-008 | 2 | the displayed margin matches the two prices. | none | none |
| PRI-008 | 2 | every order total equals the wholesale lines alone. | none | none |
| PRI-008 | 3 | Whole-unit quantities × integer cents require no rounding. | none | none |
| ORD-001 | 1 | Upload a real-shaped 80-line CSV with a duplicate. | none | none |
| ORD-001 | 1 | unknown SKU. | none | none |
| ORD-001 | 1 | invalid case quantity. | none | none |
| ORD-001 | 1 | review. | none | none |
| ORD-001 | 1 | correct errors. | none | none |
| ORD-001 | 1 | choose merge. | none | none |
| ORD-001 | 1 | compare every accepted line. | none | none |
| ORD-001 | 1 | total in the prepared draft. | none | none |
| ORD-001 | 2 | Add lines by SKU. | none | none |
| ORD-001 | 2 | by scanned barcode. | none | none |
| ORD-001 | 2 | see unknown. | none | none |
| ORD-001 | 2 | archived. | none | none |
| ORD-001 | 2 | unlisted SKUs refused alike. | none | none |
| ORD-001 | 3 | Download the cart's style-by-size order form. | none | none |
| ORD-001 | 3 | fill it offline. | none | none |
| ORD-001 | 3 | upload it: the preview shows exactly the filled quantities. | none | none |
| ORD-002 | 1 | Save. | none | none |
| ORD-002 | 1 | share a store replenishment list. | none | none |
| ORD-002 | 1 | change one price. | none | none |
| ORD-002 | 1 | discontinue one SKU. | none | none |
| ORD-002 | 1 | then add it to a cart as another authorized buyer. | none | none |
| ORD-002 | 2 | Show current totals. | none | none |
| ORD-002 | 2 | explicit exceptions without exposing another company list. | none | none |
| ORD-003 | 1 | Open a six-month-old order. | none | none |
| ORD-003 | 1 | select three lines. | none | none |
| ORD-003 | 1 | reorder after a price. | none | none |
| ORD-003 | 1 | SKU change. | none | none |
| ORD-003 | 1 | review the difference summary before checkout. | none | none |
| ORD-003 | 1 | the original order is unchanged. | none | none |
| ORD-004 | 1 | Request a quote. | none | none |
| ORD-004 | 1 | approve a rep discount. | none | none |
| ORD-004 | 1 | accept it twice through buyer. | none | none |
| ORD-004 | 1 | API doors. | none | none |
| ORD-004 | 1 | inspect one order with the accepted revision. | none | none |
| ORD-004 | 2 | Expire a second quote. | none | none |
| ORD-004 | 2 | refuse its acceptance. | none | none |
| ORD-005 | 1 | Exchange a message. | none | none |
| ORD-005 | 1 | add an internal margin note. | none | none |
| ORD-005 | 1 | revise a quote while the buyer has its old version open. | none | none |
| ORD-005 | 2 | Notify participants. | none | none |
| ORD-005 | 2 | hide the internal note from buyer exports. | none | none |
| ORD-005 | 2 | refuse old-version acceptance. | none | none |
| ORD-005 | 3 | AUTO-003 emails these notices to the same audiences. | none | none |
| ORD-005 | 3 | in-app notices are unchanged. | none | none |
| ORD-005 | 4 | Emails contain the notice summary. | none | none |
| ORD-005 | 4 | authorized quote link. | none | none |
| ORD-005 | 4 | never the message body. | none | none |
| ORD-005 | 4 | internal-note text or attachment. | none | none |
| ORD-007 | 1 | Submit the same company PO twice. | none | none |
| ORD-007 | 1 | refuse the accidental duplicate. | none | none |
| ORD-007 | 1 | authorize a numbered release. | none | none |
| ORD-007 | 1 | inspect date. | none | none |
| ORD-007 | 1 | attachment fields in the order. | none | none |
| ORD-007 | 1 | ERP handoff. | none | none |
| ORD-008 | 1 | Place a spring prebook with two ship windows. | none | none |
| ORD-008 | 1 | a deposit. | none | none |
| ORD-008 | 1 | close the season. | none | none |
| ORD-008 | 1 | release the first window. | none | none |
| ORD-008 | 1 | backorder a delayed style. | none | none |
| ORD-008 | 2 | Buyer. | none | none |
| ORD-008 | 2 | operations see committed. | none | none |
| ORD-008 | 2 | released. | none | none |
| ORD-008 | 2 | outstanding quantities separately. | none | none |
| ORD-010 | 1 | Native buyer submission and supplier approval retain the recorded people. | `tests/api/flows.test.mjs:55` | asserted |
| ORD-010 | 1 | After changing current prices, the second invoice equals the first. | `tests/api/flows.test.mjs:66` | asserted |
| ORD-010 | 2 | Original exact cents and customer reference appear in the issued invoice. | `tests/api/order-guarantee.test.mjs:115` | asserted |
| ORD-010 | 2 | The original agreed terms define the same 30-day due date. | `tests/api/order-guarantee.test.mjs:115` | asserted |
| ORD-010 | 2 | Repeated download retains the same commercial invoice. | `tests/api/order-guarantee.test.mjs:115` | asserted |
| ORD-010 | 3 | The order records exact USD totals and line price. | `tests/api/order-guarantee.test.mjs:50` | asserted |
| ORD-010 | 3 | The lost acknowledgment leaves the pending order without an invoice. | `tests/api/order-guarantee.test.mjs:66` | asserted |
| ORD-010 | 3 | The upstream system has one new order. | `tests/api/order-guarantee.test.mjs:72` | asserted |
| ORD-010 | 3 | Replay reserves the exact quantity once. | `tests/api/order-guarantee.test.mjs:83` | asserted |
| ORD-010 | 3 | A shortfall retains its requested and reserved quantities. | `tests/api/order-guarantee.test.mjs:98` | asserted |
| ORD-010 | 3 | The shortfall has no invoice and invoice download is refused. | `tests/api/order-guarantee.test.mjs:99` | asserted |
| ORD-010 | 3 | Eligible invoice quantities, currency and cents match the snapshot. | `tests/api/order-guarantee.test.mjs:85` | asserted |
| ORD-010 | 4 | Current-price changes preserve the complete original approved order. | `tests/api/order-guarantee.test.mjs:115` | asserted |
| ORD-010 | 4 | The issued invoice remains byte-identical. | `tests/api/order-guarantee.test.mjs:116` | asserted |
| ORD-010 | 5 | The legacy AUD invoice retains its historical currency. | `tests/api/order-guarantee.test.mjs:109` | asserted |
| ORD-010 | 5 | The restored historical order is identical. | `tests/api/order-guarantee.test.mjs:125` | asserted |
| ORD-010 | 5 | The restored AUD invoice is identical. | `tests/api/order-guarantee.test.mjs:126` | asserted |
| ORD-012 | 1 | The timeline contains both source-confirmed split shipments. | `tests/api/timeline.test.mjs:45` | asserted |
| ORD-012 | 1 | Follow a real-shaped order through acceptance. | none | none |
| ORD-012 | 1 | delivery via connected events. | none | none |
| ORD-012 | 1 | open its timeline as the buyer. | none | none |
| ORD-012 | 1 | verify the confirmation. | none | none |
| ORD-012 | 1 | tracking. | none | none |
| ORD-012 | 1 | exception state. | none | none |
| ORD-012 | 2 | Another buyer receives the exact not-found refusal. | `tests/api/timeline.test.mjs:56` | asserted |
| ORD-012 | 2 | Another buyer cannot read it. | none | none |
| ORD-014 | 1 | Submit a matrix order with two ship windows. | none | none |
| ORD-014 | 1 | download its confirmation PDF. | none | none |
| ORD-014 | 1 | CSV as buyer. | none | none |
| ORD-014 | 1 | rep. | none | none |
| ORD-014 | 1 | revise one quantity. | none | none |
| ORD-014 | 1 | download again. | none | none |
| ORD-014 | 2 | Both revisions are retained. | none | none |
| ORD-014 | 2 | differ only in the changed line. | none | none |
| ORD-014 | 2 | each names its terms version. | none | none |
| ORD-014 | 2 | acceptance. | none | none |
| ORD-014 | 2 | another buyer is refused. | none | none |
| ORD-017 | 1 | Save a second export layout. | none | none |
| ORD-017 | 1 | set it as default. | none | none |
| ORD-017 | 1 | download again: the CSV follows the new layout. | none | none |
| ORD-018 | 1 | Select 50 orders from one season. | none | none |
| ORD-018 | 1 | export them in one file per line. | none | none |
| ORD-018 | 1 | totaled by style. | none | none |
| ORD-018 | 1 | color. | none | none |
| ORD-018 | 1 | size: the totals equal the sum of the selected orders' lines. | none | none |
| ORD-015 | 1 | Assign terms version 1 to an account that requires acceptance. | none | none |
| ORD-015 | 1 | attempt submission without accepting (refused). | none | none |
| ORD-015 | 1 | accept as the buyer. | none | none |
| ORD-015 | 1 | submit. | none | none |
| ORD-015 | 1 | then submit a rep order with signature capture. | none | none |
| ORD-015 | 2 | Publish version 2: both orders keep version 1. | none | none |
| ORD-015 | 2 | its acceptance record in their confirmation PDFs. | none | none |
| ORD-015 | 2 | the next order requires version 2. | none | none |
| STK-001 | 1 | Read an account catalog against real Pier stock. | none | none |
| STK-001 | 1 | exhaust a SKU. | none | none |
| STK-001 | 1 | attempt an over-order. | none | none |
| STK-001 | 2 | Draft preparation leaves the inventory order list empty. | `tests/api/flows.test.mjs:30` | asserted |
| STK-001 | 2 | Confirm the available quantity. | none | none |
| STK-001 | 2 | server refusal. | none | none |
| STK-001 | 2 | no stock effect from draft preparation. | none | none |
| STK-002 | 1 | The two warehouse quantities match the source outcome. | `tests/api/stock-promise.test.mjs:30` | asserted |
| STK-002 | 1 | The future committed receipt keeps its promise date and quantity. | `tests/api/stock-promise.test.mjs:31` | asserted |
| STK-002 | 1 | Connect two Pier warehouses. | none | none |
| STK-002 | 1 | compare immediate stock by warehouse with incoming supply. | none | none |
| STK-002 | 1 | see an order beyond received stock refused. | none | none |
| STK-002 | 2 | Only the permitted warehouse is promiseable. | `tests/api/stock-promise.test.mjs:37` | asserted |
| STK-002 | 2 | Limit an account to one warehouse. | none | none |
| STK-002 | 2 | see only its stock promised. | none | none |
| STK-002 | 3 | The stale refusal reads back the merchant’s freshness limit. | `tests/api/stock-promise.test.mjs:55` | asserted |
| STK-002 | 3 | The supplier exception retains the entered reason. | `tests/api/stock-promise.test.mjs:64` | asserted |
| STK-002 | 3 | The exception reason is read back from audit. | `tests/api/stock-promise.test.mjs:67` | asserted |
| STK-002 | 3 | Set a 15-minute limit. | none | none |
| STK-002 | 3 | attempt to submit a draft observed 20 minutes ago: the stale source is shown. | none | none |
| STK-002 | 3 | only a valid refresh or a recorded supplier exception lets it submit. | none | none |
| STK-002 | 4 | With Pier unreachable. | none | none |
| STK-002 | 4 | nothing is promised. | none | none |
| STK-003 | 1 | Losing the response leaves the order pending without an invoice. | `tests/api/order-guarantee.test.mjs:66` | asserted |
| STK-003 | 1 | The upstream system contains one new order. | `tests/api/order-guarantee.test.mjs:72` | asserted |
| STK-003 | 1 | The retried acknowledgment names that same source order. | `tests/api/order-guarantee.test.mjs:76` | asserted |
| STK-003 | 1 | Further replay leaves the complete populated upstream order list unchanged. | `tests/api/order-guarantee.test.mjs:78` | asserted |
| STK-003 | 2 | The source quantity is reserved once under the durable identity. | `tests/api/order-guarantee.test.mjs:83` | asserted |
| STK-003 | 2 | A changed destination refuses the historical handoff with PIER_CHANGED. | `tests/api/order-guarantee.test.mjs:121` | asserted |
| STK-003 | 2 | That refusal leaves the populated source orders unchanged. | `tests/api/order-guarantee.test.mjs:122` | asserted |
| STK-003 | 2 | The original acknowledged source ID remains retained. | `tests/api/order-guarantee.test.mjs:123` | asserted |
| STK-004 | 1 | Cancel an allocated unshipped order. | none | none |
| STK-004 | 1 | lose the release response. | none | none |
| STK-004 | 1 | repeat it. | none | none |
| STK-004 | 2 | The authority releases once. | none | none |
| STK-004 | 2 | Barrow clears the exception only after confirmation. | none | none |
| STK-004 | 2 | shows the correct remaining promiseable stock. | none | none |
| STK-005 | 1 | Short a discontinued style. | none | none |
| STK-005 | 1 | propose a differently priced replacement. | none | none |
| STK-005 | 1 | decline once then accept a revised offer. | none | none |
| STK-005 | 2 | Only the accepted quantity. | none | none |
| STK-005 | 2 | price reach inventory. | none | none |
| STK-005 | 2 | the original shortfall remains traceable. | none | none |
| REP-001 | 1 | Sign in as a rep. | none | none |
| REP-001 | 1 | select an assigned account. | none | none |
| REP-001 | 1 | prepare an order for buyer approval. | none | none |
| REP-001 | 2 | Refuse another territory. | none | none |
| REP-001 | 2 | show the rep plus buyer identities on the accepted order. | none | none |
| REP-004 | 1 | Assign a split commission. | none | none |
| REP-004 | 1 | accept. | none | none |
| REP-004 | 1 | ship an order. | none | none |
| REP-004 | 1 | record partial payment then return a line. | none | none |
| REP-004 | 2 | Each rep statement shows the correct earned. | none | none |
| REP-004 | 2 | reversed cents. | none | none |
| REP-004 | 2 | a transfer does not rewrite prior attribution. | none | none |
| REP-005 | 1 | Schedule a showroom visit. | none | none |
| REP-005 | 1 | record a sample request. | none | none |
| REP-005 | 1 | buyer notes. | none | none |
| REP-005 | 1 | prepare a quote. | none | none |
| REP-005 | 1 | assign a follow-up. | none | none |
| REP-005 | 1 | hand the sample to inventory. | none | none |
| REP-005 | 2 | The rep sees the next action. | none | none |
| REP-005 | 2 | completion acknowledgment. | none | none |
| PAY-001 | 1 | Use Stripe test checkout for successful. | none | none |
| PAY-001 | 1 | declined cards. | none | none |
| PAY-001 | 1 | an authentication challenge. | none | none |
| PAY-001 | 1 | replay an event. | none | none |
| PAY-001 | 1 | lose a capture response. | none | none |
| PAY-001 | 2 | The buyer sees one appropriate payment result. | none | none |
| PAY-001 | 2 | one reconciled charge. | none | none |
| PAY-001 | 2 | a configured surcharge appears for an eligible credit card. | none | none |
| PAY-001 | 2 | is refused for a debit card. | none | none |
| PAY-001 | 2 | a prohibiting state. | none | none |
| PAY-007 | 1 | Open a statement spanning an opening balance. | none | none |
| PAY-007 | 1 | two invoices. | none | none |
| PAY-007 | 1 | deposit. | none | none |
| PAY-007 | 1 | partial payment. | none | none |
| PAY-007 | 1 | credit. | none | none |
| PAY-007 | 1 | compare the closing balance with the connected ledger. | none | none |
| PAY-007 | 1 | download it as the buyer. | none | none |
| PAY-007 | 2 | Another company is refused. | none | none |
| PAY-007 | 3 | Hold. | none | none |
| PAY-007 | 3 | then close the account. | none | none |
| PAY-007 | 3 | confirm that its authorized buyer can still read. | none | none |
| PAY-007 | 3 | download the statement. | none | none |
| SHIP-001 | 1 | Compare pickup. | none | none |
| SHIP-001 | 1 | UPS parcel. | none | none |
| SHIP-001 | 1 | freight-quote orders. | none | none |
| SHIP-001 | 1 | cross a free-freight threshold. | none | none |
| SHIP-001 | 1 | change the ship-to state. | none | none |
| SHIP-001 | 2 | Buyer explicitly accepts the final method. | none | none |
| SHIP-001 | 2 | cost. | none | none |
| SHIP-001 | 2 | window before ordering. | none | none |
| INT-011 | 1 | Authorize a brand sandbox or controlled API boundary. | none | none |
| INT-011 | 1 | fetch multiple pages. | none | none |
| INT-011 | 1 | interrupt. | none | none |
| INT-011 | 1 | resume. | none | none |
| INT-011 | 1 | match an unknown SKU for review. | none | none |
| INT-011 | 1 | ingest a replay. | none | none |
| INT-011 | 2 | Each Faire order appears once. | none | none |
| INT-011 | 2 | no Stripe collection is initiated for Faire-owned settlement. | none | none |
| INT-013 | 1 | Subscribe a test endpoint. | none | none |
| INT-013 | 1 | reject several deliveries. | none | none |
| INT-013 | 1 | replay a signed event. | none | none |
| INT-013 | 1 | send out-of-order provider states. | none | none |
| INT-013 | 2 | See one business effect. | none | none |
| INT-013 | 2 | retained attempts. | none | none |
| INT-013 | 2 | a queue item that clears only on acknowledged resolution. | none | none |
| INT-014 | 1 | Set up a connector with a missing item. | none | none |
| INT-014 | 1 | mismatched balance. | none | none |
| INT-014 | 1 | inspect preview. | none | none |
| INT-014 | 1 | repair mappings. | none | none |
| INT-014 | 1 | reconcile before go-live. | none | none |
| INT-014 | 2 | Revoke credentials later. | none | none |
| INT-014 | 2 | keep local history. | none | none |
| INT-014 | 2 | show precisely which records need attention. | none | none |
| INT-014 | 3 | Exercise inherited DATA-002 connector/configuration/reconciliation changes through the staff audit search. | none | none |
| INT-014 | 3 | complete export: actor/kind. | none | none |
| INT-014 | 3 | source outcome. | none | none |
| INT-014 | 3 | time. | none | none |
| INT-014 | 3 | revision. | none | none |
| INT-014 | 3 | reason. | none | none |
| INT-014 | 3 | append-only. | none | none |
| INT-014 | 3 | private from buyers/agents. | none | none |
| RPT-001 | 1 | Run a seasonal report containing a prebook. | none | none |
| RPT-001 | 1 | split shipment. | none | none |
| RPT-001 | 1 | credit. | none | none |
| RPT-001 | 1 | partial payment. | none | none |
| RPT-001 | 1 | filter a territory. | none | none |
| RPT-001 | 1 | drill to the documents. | none | none |
| RPT-001 | 2 | Exported totals reconcile with the source lines. | none | none |
| RPT-001 | 2 | another rep territory is inaccessible. | none | none |
| RPT-002 | 1 | Create accepted. | none | none |
| RPT-002 | 1 | expired. | none | none |
| RPT-002 | 1 | revised quotes plus a promoted order. | none | none |
| RPT-002 | 1 | return. | none | none |
| RPT-002 | 1 | then view conversion. | none | none |
| RPT-002 | 1 | net promotion performance. | none | none |
| RPT-002 | 1 | open a line sheet as two buyers. | none | none |
| RPT-002 | 1 | see each buyer's views. | none | none |
| RPT-002 | 2 | Count each accepted order once. | none | none |
| RPT-002 | 2 | explain every denominator. | none | none |
| RPT-003 | 1 | Load an on-time. | none | none |
| RPT-003 | 1 | late. | none | none |
| RPT-003 | 1 | partially shipped order. | none | none |
| RPT-003 | 1 | inspect line-based fill. | none | none |
| RPT-003 | 1 | lateness measures. | none | none |
| RPT-003 | 1 | open the late-line queue. | none | none |
| RPT-003 | 2 | Missing tracking stays unknown rather than counted as delivered. | none | none |
| RPT-003 | 3 | INT-011 carrier: ingested Faire lines retain original order IDs. | none | none |
| RPT-003 | 3 | exact ordered quantities. | none | none |
| RPT-003 | 3 | account scope. | none | none |
| RPT-003 | 3 | shipped quantities. | none | none |
| RPT-003 | 3 | warehouse. | none | none |
| RPT-003 | 3 | delivery remain unknown when the source does not report them. | none | none |
| RPT-003 | 4 | They never change Pier fill denominators. | none | none |
| RPT-003 | 5 (old) | See `tests/api/faire.test.mjs` and `tests/journeys/faire.test.mjs`.. | none | moved |
| RPT-004 | 1 | Run aging on a stated date across net-30. | none | none |
| RPT-004 | 1 | disputed. | none | none |
| RPT-004 | 1 | partially paid invoices. | none | none |
| RPT-004 | 1 | export. | none | none |
| RPT-004 | 1 | compare every bucket with due dates. | none | none |
| RPT-004 | 1 | verified payments. | none | none |
| RPT-004 | 2 | A rep sees only the permitted account summary. | none | none |
| AUTO-001 | 1 | Apply without a required certificate. | none | none |
| AUTO-001 | 1 | route to a territory owner. | none | none |
| AUTO-001 | 1 | send the request. | none | none |
| AUTO-001 | 1 | upload the document. | none | none |
| AUTO-001 | 2 | Escalation stops on the recorded decision. | none | none |
| AUTO-001 | 2 | not merely because an email was queued. | none | none |
| AUTO-002 | 1 | Submit an order requiring buyer. | none | none |
| AUTO-002 | 1 | finance approval. | none | none |
| AUTO-002 | 1 | revise its price. | none | none |
| AUTO-002 | 1 | run the scheduled escalation. | none | none |
| AUTO-002 | 2 | Old approval is invalid. | none | none |
| AUTO-002 | 2 | current delegates are notified once. | none | none |
| AUTO-002 | 2 | approval closes the correct tasks. | none | none |
| AUTO-003 | 1 | Revise a quote. | none | none |
| AUTO-003 | 1 | add an internal note. | none | none |
| AUTO-003 | 1 | simulate a buyer email bounce. | none | none |
| AUTO-003 | 2 | Buyer receives only visible changes. | none | none |
| AUTO-003 | 2 | rep gets the note. | none | none |
| AUTO-003 | 2 | a failed-contact task remains until resolved. | none | none |
| AUTO-003 | 3 | each existing ORD-005 notice atomically queues one durable ledger row per authorized recipient user ID. | none | none |
| AUTO-003 | 4 | Under ACC-002. | none | none |
| AUTO-003 | 4 | buyer means each active native company member with purchaser or approver rights. | none | none |
| AUTO-003 | 4 | rechecked at dispatch. | none | none |
| AUTO-003 | 4 | the former account-email authority is retired. | none | none |
| AUTO-003 | 4 | staff means active owner/admin except the actor. | none | none |
| AUTO-003 | 5 | Agents. | none | none |
| AUTO-003 | 5 | rep metadata. | none | none |
| AUTO-003 | 5 | names. | none | none |
| AUTO-003 | 5 | author emails. | none | none |
| AUTO-003 | 5 | guessed contacts. | none | none |
| AUTO-003 | 5 | CC/BCC. | none | none |
| AUTO-003 | 5 | new outreach grants never supply recipients. | none | none |
| AUTO-003 | 6 | An internal notice addressed to a buyer is a hard error. | none | none |
| AUTO-003 | 7 | Missing buyer authority creates a withdrawn row with reason "no authorized buyer recipient". | none | none |
| AUTO-003 | 7 | an owned failed-contact task. | none | none |
| AUTO-009 | 1 | Dispatch rechecks that exact user. | none | none |
| AUTO-009 | 1 | withdraws revoked/mismatched authority without substituting another person. | none | none |
| AUTO-009 | 1 | saves the exact current address used. | none | none |
| AUTO-009 | 2 | Email contains only the notice summary. | none | none |
| AUTO-009 | 2 | quote ID. | none | none |
| AUTO-009 | 2 | configured HTTPS app quote link. | none | none |
| AUTO-009 | 2 | ordinary sign-in. | none | none |
| AUTO-009 | 2 | existing quote authorization apply. | none | none |
| AUTO-009 | 2 | with no tokens. | none | none |
| AUTO-009 | 2 | message bodies. | none | none |
| AUTO-009 | 2 | attachments or tracking. | none | none |
| AUTO-009 | 3 | A stable delivery ID is the stable Resend request identity. | none | none |
| AUTO-009 | 3 | the exact provider ID or null. | none | none |
| AUTO-009 | 3 | exact sender result are retained. | none | none |
| AUTO-009 | 4 | Queued. | none | none |
| AUTO-009 | 4 | withdrawn. | none | none |
| AUTO-009 | 4 | accepted. | none | none |
| AUTO-009 | 4 | deferred. | none | none |
| AUTO-009 | 4 | delivered. | none | none |
| AUTO-009 | 4 | bounced. | none | none |
| AUTO-009 | 4 | failed. | none | none |
| AUTO-009 | 4 | rejected. | none | none |
| AUTO-009 | 4 | complained. | none | none |
| AUTO-009 | 4 | suppressed. | none | none |
| AUTO-009 | 4 | rate limited. | none | none |
| AUTO-009 | 4 | uncertain. | none | none |
| AUTO-009 | 4 | not configured stay distinct. | none | none |
| AUTO-009 | 5 | Delivered means delivered to the recipient mail server. | none | none |
| AUTO-009 | 5 | never read. | none | none |
| AUTO-009 | 5 | accepted with no provider ID is labelled accepted (uncorrelated). | none | none |
| AUTO-009 | 6 | Development is not sent (development). | none | none |
| AUTO-009 | 7 | Submission requires configured Resend. | none | none |
| AUTO-009 | 7 | API key. | none | none |
| AUTO-009 | 7 | HTTPS origin. | none | none |
| AUTO-009 | 7 | installation delivery tenant. | none | none |
| AUTO-009 | 7 | mail callback verification secret. | none | none |
| AUTO-009 | 8 | Terminal bounce. | none | none |
| AUTO-009 | 8 | complaint or rejection suppresses later sends to the saved address. | none | none |
| AUTO-010 | 1 | An hourly check nominates one email-only expiry row per quote/latest revision/user on its inclusive America/New_York last valid date. | none | none |
| AUTO-010 | 1 | only while proposed. | none | none |
| AUTO-010 | 1 | unaccepted. | none | none |
| AUTO-010 | 1 | replay cannot add another. | none | none |
| AUTO-010 | 1 | superseded. | none | none |
| AUTO-010 | 1 | awaiting-approval. | none | none |
| AUTO-010 | 1 | accepted or late reminders are withdrawn before submission. | none | none |
| AUTO-010 | 2 | Native walkthrough: request reaches staff. | none | none |
| AUTO-010 | 2 | internal note reaches staff only. | none | none |
| AUTO-010 | 2 | visible message. | none | none |
| AUTO-010 | 2 | ready revision reach buyer with a sign-in link. | none | none |
| AUTO-010 | 2 | another company gets not found. | none | none |
| AUTO-010 | 2 | one last-day reminder. | none | none |
| AUTO-010 | 2 | none for superseded/awaiting-approval. | none | none |
| AUTO-010 | 2 | no repeat on replay/restore. | none | none |
| AUTO-010 | 2 | signed delivered/bounce creates one owned failure task. | none | none |
| AUTO-010 | 2 | foreign or changed replay is refused. | none | none |
| AUTO-010 | 2 | identical replay has no new effect. | none | none |
| AUTO-010 | 2 | acceptance leaves work open. | none | none |
| AUTO-010 | 2 | an attributed resolution closes it. | none | none |
| AUTO-011 | 1 | The POST-only. | none | none |
| AUTO-011 | 1 | 1 MiB Resend callback uses unmodified Base signature/freshness verification (300 seconds). | none | none |
| AUTO-011 | 1 | server-configured tenant. | none | none |
| AUTO-011 | 1 | namespace. | none | none |
| AUTO-011 | 1 | verbatim Base D1 event schema. | none | none |
| AUTO-011 | 1 | read-only authorization of tenant. | none | none |
| AUTO-011 | 1 | exact saved provider ID. | none | none |
| AUTO-011 | 1 | every exact saved address. | none | none |
| AUTO-011 | 2 | Only stored Base results change the ledger. | none | none |
| AUTO-011 | 2 | idempotently by event ID. | none | none |
| AUTO-011 | 2 | open/click do not. | none | none |
| AUTO-011 | 3 | Invalid/foreign/changed-fingerprint events return redacted refusal. | none | none |
| AUTO-011 | 3 | identical replay is acknowledged without a second effect. | none | none |
| AUTO-011 | 4 | The webhook secret. | none | none |
| AUTO-011 | 4 | its private fingerprint never enter archive/export/diagnostics/log/audit. | none | none |
| AUTO-011 | 4 | configure. | none | none |
| AUTO-011 | 4 | rotate. | none | none |
| AUTO-011 | 4 | revoke record system audit events without their values. | none | none |
| AUTO-011 | 5 | Saved addresses use DATA-003's messages retention kind. | none | none |
| AUTO-011 | 5 | separate provider-mail custody. | none | none |
| AUTO-011 | 5 | unused-account erasure removes ledger. | none | none |
| AUTO-011 | 5 | tasks. | none | none |
| AUTO-011 | 5 | matching Base event rows in the existing restore-fenced erasure transaction. | none | none |
| AUTO-012 | 1 | Rate-limited/uncertain requests retry the same immutable request/key only within 24 hours. | none | none |
| AUTO-012 | 1 | afterward they are not resubmitted. | none | none |
| AUTO-012 | 1 | open contact work. | none | none |
| AUTO-012 | 2 | Failed-contact tasks are keyed by quote/recipient user. | none | none |
| AUTO-012 | 2 | append delivery facts. | none | none |
| AUTO-012 | 2 | open on bounce/failure/rejection/complaint/suppression. | none | none |
| AUTO-012 | 2 | uncertainty beyond 24 hours. | none | none |
| AUTO-012 | 2 | submission rejection or missing buyer. | none | none |
| AUTO-012 | 3 | Buyer tasks start with the active latest proposer. | none | none |
| AUTO-012 | 3 | otherwise installation owner. | none | none |
| AUTO-012 | 3 | staff tasks start with the owner. | none | none |
| AUTO-012 | 4 | Acceptance. | none | none |
| AUTO-012 | 4 | refresh. | none | none |
| AUTO-012 | 4 | later delivery or revision never closes a task: an attributed revision-guarded resolution does. | none | none |
| AUTO-012 | 5 | OPS-001 lists open non-success delivery ID/state/age/owner/task link. | none | none |
| AUTO-012 | 5 | the webhook-secret reconnect step. | none | none |
| AUTO-012 | 5 | other notification types remain not recorded. | none | none |
| AUTO-012 | 6 | ACC-002/ACC-006 inherit future purchaser/assigned-covering-rep routing. | none | none |
| AUTO-012 | 6 | task ownership before shipping. | none | none |
| AUTO-012 | 7 | Contact dates use New York. | none | none |
| AUTO-012 | 7 | only active owner/admin can be assigned. | none | none |
| AUTO-013 | 1 | DATA-001 exposes supplier-only quotedeliveries. | none | none |
| AUTO-013 | 1 | buyers omit it. | none | none |
| AUTO-013 | 2 | Owner archives retain ledger. | none | none |
| AUTO-013 | 2 | tasks. | none | none |
| AUTO-013 | 2 | Base event receipts/states without credentials. | none | none |
| AUTO-013 | 2 | restored queued/rate-limited/uncertain rows are uncertain. | none | none |
| AUTO-013 | 2 | never resubmit. | none | none |
| AUTO-014 | 1 | Live Resend. | none | none |
| AUTO-014 | 1 | hosted proof remain separately PENDING. | none | none |
| AUTO-014 | 1 | are not claimed by native signed-fixture tests. | none | none |
| AUTO-005 | 1 | Create one item of each type. | none | none |
| AUTO-005 | 1 | assign. | none | none |
| AUTO-005 | 1 | snooze them. | none | none |
| AUTO-005 | 1 | resolve a quote through acceptance. | none | none |
| AUTO-005 | 1 | record a failed contact. | none | none |
| AUTO-005 | 2 | The accepted quote closes while unanswered tasks remain. | none | none |
| AUTO-005 | 2 | appear on the due date. | none | none |
| AUTO-005 | 3 | AUTO-003 adds failed quote contact tasks keyed by quote/recipient user. | none | none |
| AUTO-005 | 3 | with active latest proposer or installation owner. | none | none |
| AUTO-005 | 3 | New York contact date. | none | none |
| AUTO-005 | 3 | attributed revision-guarded resolution. | none | none |
| AUTO-005 | 4 | Acceptance. | none | none |
| AUTO-005 | 4 | refresh. | none | none |
| AUTO-005 | 4 | later delivery. | none | none |
| AUTO-005 | 4 | new revisions do not close them. | none | none |
| AUTO-008 | 1 | Interrupt a paginated sync. | none | none |
| AUTO-008 | 1 | resume from its acknowledged checkpoint. | none | none |
| AUTO-008 | 1 | restore a watched SKU. | none | none |
| AUTO-008 | 1 | replay its event. | none | none |
| AUTO-008 | 2 | One notice sends. | none | none |
| AUTO-008 | 2 | reconciliation completes. | none | none |
| AUTO-008 | 2 | persistent failure stays assigned. | none | none |
| MOVE-004 | 1 | Upload real-shaped detailed activity. | none | none |
| MOVE-004 | 1 | shopping-list CSV fixtures matching the documented formats. | none | none |
| MOVE-004 | 1 | compare the selected export date. | none | none |
| MOVE-004 | 1 | filter range. | none | none |
| MOVE-004 | 1 | join backing-store product. | none | none |
| MOVE-004 | 1 | customer IDs. | none | none |
| MOVE-004 | 2 | Reconcile covered orders. | none | none |
| MOVE-004 | 2 | flag omitted source scope before cutover. | none | none |
| MOVE-005 | 1 | Upload a real-shaped workbook set. | none | none |
| MOVE-005 | 1 | FTP CSV batch matching the documented formats. | none | none |
| MOVE-005 | 1 | join order headers. | none | none |
| MOVE-005 | 1 | lines. | none | none |
| MOVE-005 | 1 | distinguish a quote from an accepted order. | none | none |
| MOVE-005 | 1 | reconcile customer/address counts. | none | none |
| MOVE-005 | 1 | financial totals. | none | none |
| MOVE-005 | 2 | Replaying either source cannot double-count history. | none | none |
| MOVE-007 | 1 | Dry-run a populated account/price CSV that updates one account. | none | none |
| MOVE-007 | 1 | adds two. | none | none |
| MOVE-007 | 1 | compare source outcome. | none | none |
| MOVE-007 | 1 | planned counts. | none | none |
| MOVE-007 | 1 | USD sums. | none | none |
| MOVE-007 | 1 | correct one unknown SKU. | none | none |
| MOVE-007 | 1 | apply with the owner's recorded fingerprint approval. | none | none |
| MOVE-007 | 2 | No invitation. | none | none |
| MOVE-007 | 2 | account. | none | none |
| MOVE-007 | 2 | order or Pier write occurs during preview. | none | none |
| MOVE-007 | 2 | with Pier unreachable the SKU check reports that it did not run. | none | none |
| MOVE-007 | 2 | apply refuses. | none | none |
| MOVE-007 | 3 | Upload the documented account/price CSV through Move in. | none | none |
| MOVE-007 | 3 | preview without account writes. | none | none |
| MOVE-007 | 3 | refuse a stale fingerprint. | none | none |
| MOVE-007 | 3 | apply over several batches. | none | none |
| MOVE-007 | 3 | replay it. | none | none |
| MOVE-007 | 3 (old) | The receivable-mismatch and by-status totals steps remain obligations of PAY-008/PAY-009 and MOVE-001 through MOVE-006 before those capabilities ship.. | none | moved |
| MOVE-007 | 4 | Inspect originals. | none | none |
| MOVE-007 | 4 | journal. | none | none |
| MOVE-007 | 4 | then undo untouched accounts. | none | none |
| MOVE-007 | 4 | refuse undo after a native edit or dependent order. | none | none |
| DATA-001 | 1 | Export an account fixture with orders in several statuses. | none | none |
| DATA-001 | 1 | including a reorder. | none | none |
| DATA-001 | 1 | a PO document. | none | none |
| DATA-001 | 1 | a legacy AUD record. | none | none |
| DATA-001 | 1 | reconcile counts. | none | none |
| DATA-001 | 1 | line sums. | none | none |
| DATA-001 | 1 | per-currency totals. | none | none |
| DATA-001 | 1 | resolve each document reference to its bytes. | none | none |
| DATA-001 | 2 | A company export contains only that company. | none | none |
| DATA-001 | 2 | no audit decisions. | none | none |
| DATA-001 | 2 | the held company policy refuses an export under the catalog-only agent grant. | none | none |
| DATA-001 | 2 | an owner archive still excludes all installation credentials. | none | none |
| DATA-001 | 3 | AUTO-003 adds supplier-only quotedeliveries JSON/CSV with stable delivery. | none | none |
| DATA-001 | 3 | quote/account/recipient IDs. | none | none |
| DATA-001 | 3 | exact provider ID. | none | none |
| DATA-001 | 3 | states. | none | none |
| DATA-001 | 3 | attempts. | none | none |
| DATA-001 | 3 | task references. | none | none |
| DATA-001 | 3 | buyer exports omit it. | none | none |
| DATA-001 | 3 | an agent call without that entitlement is refused. | none | none |
| DATA-001 | 3 (old) | The 3-location, split-order, return and partial-payment steps remain obligations of ACC-003, ORD-009/013, SHIP-004 and PAY-003 before those capabilities ship.. | none | moved |
| DATA-001 | 4 | RPT-005 activity goals join the owner/admin export as `reptargets` (exact Native user ID. | none | none |
| DATA-001 | 4 | period. | none | none |
| DATA-001 | 4 | frozen time zone. | none | none |
| DATA-001 | 4 | count goals. | none | none |
| DATA-001 | 4 | revision. | none | none |
| DATA-001 | 4 | attributed reason). | none | none |
| DATA-001 | 4 | buyer. | none | none |
| DATA-001 | 4 | functional-staff general exports omit them. | none | none |
| DATA-001 | 4 | while entitled reps/managers use their scoped performance CSV. | none | none |
| DATA-001 | 5 | Export a populated installation through its portability door. | none | none |
| DATA-001 | 5 | restore into an empty installation. | none | none |
| DATA-001 | 5 | compare commercial records. | none | none |
| DATA-001 | 6 | Confirm credentials are excluded. | none | none |
| DATA-001 | 7 | Erase an unused imported account. | none | none |
| DATA-001 | 7 | export again. | none | none |
| DATA-001 | 7 | refuse the older archive when supplied with the later journal. | none | none |
| DATA-001 | 7 | refuse erasure of an account with orders. | none | none |
| DATA-002 | 1 | Approve the price/discount rule. | none | none |
| DATA-002 | 1 | under the held company policy prepare as an agent. | none | none |
| DATA-002 | 1 | review/submit/approve as the policy names. | none | none |
| DATA-002 | 1 | revoke a grant. | none | none |
| DATA-002 | 1 | import/replay/undo accounts. | none | none |
| DATA-002 | 1 | erase an unused one. | none | none |
| DATA-002 | 1 | search by account/order/person. | none | none |
| DATA-002 | 1 | export the attributed audit. | none | none |
| DATA-002 | 1 | including more than one export page. | none | none |
| DATA-002 | 1 | old unrecorded events. | none | none |
| DATA-002 | 2 | Editing/deleting history is refused. | none | none |
| DATA-002 | 2 | a buyer or agent without internal-audit entitlement cannot retrieve internal decisions. | none | none |
| DATA-002 | 3 | Restore the archive. | none | none |
| DATA-002 | 3 | retain event IDs. | none | none |
| DATA-002 | 3 | attribution. | none | none |
| DATA-002 | 4 | AUTO-003 records system-actor secret configure/rotate/revoke. | none | none |
| DATA-002 | 4 | verified delivery events. | none | none |
| DATA-002 | 4 | failed-contact task creation. | none | none |
| DATA-002 | 4 | existing attributed followup.update records assignment/contact/resolution. | none | none |
| DATA-002 | 4 (old) | The future credit override, refund and connector decision acceptance steps remain obligations of PAY-004/005/006/009/010 and INT-002 through INT-020 before those capabilities ship.. | none | moved |
| DATA-002 | 5 | No secret. | none | none |
| DATA-002 | 5 | fingerprint. | none | none |
| DATA-002 | 5 | message body or attachment enters these events. | none | none |
| DATA-002 | 6 | RPT-006 records saved definitions. | none | none |
| DATA-002 | 6 | recipient identities. | none | none |
| DATA-002 | 6 | snapshot freeze/queue. | none | none |
| DATA-002 | 6 | unconfigured sender. | none | none |
| DATA-002 | 6 | submission claim. | none | none |
| DATA-002 | 6 | exact outcome. | none | none |
| DATA-002 | 6 | authenticated delivery event. | none | none |
| DATA-002 | 6 | recipient removal/identity revocation. | none | none |
| DATA-002 | 6 | download. | none | none |
| DATA-002 | 6 | refusal as append-only attributed report audit. | none | none |
| DATA-002 | 7 | Records contain IDs. | none | none |
| DATA-002 | 7 | reasons. | none | none |
| DATA-002 | 7 | no snapshot figures. | none | none |
| DATA-002 | 7 | secret. | none | none |
| DATA-002 | 7 | token. | none | none |
| DATA-002 | 7 | message body or attachment. | none | none |
| DATA-002 | 7 | Acceptance searches. | none | none |
| DATA-002 | 7 | exports these events. | none | none |
| DATA-002 | 7 | retains them through the owner archive. | none | none |
| DATA-002 | 7 | The RPT-005 goal-setting action records the exact Native rep. | none | none |
| DATA-002 | 7 | period. | none | none |
| DATA-002 | 7 | frozen zone. | none | none |
| DATA-002 | 7 | goals. | none | none |
| DATA-002 | 7 | revision. | none | none |
| DATA-002 | 7 | actor. | none | none |
| DATA-002 | 7 | reason. | none | none |
| DATA-002 | 7 | it triggers no payout or outreach. | none | none |
| DATA-002 | 7 | INT-011 carrier: Faire owner configuration. | none | none |
| DATA-002 | 7 | page reconciliation. | none | none |
| DATA-002 | 7 | reviewed matching decisions retain actor. | none | none |
| DATA-002 | 7 | source outcome. | none | none |
| DATA-002 | 7 | time. | none | none |
| DATA-002 | 7 | revision. | none | none |
| DATA-002 | 7 | reason through staff audit search. | none | none |
| DATA-002 | 7 | complete CSV. | none | none |
| DATA-002 | 7 | buyers. | none | none |
| DATA-002 | 7 | an agent call without that entitlement is refused. | none | none |
| DATA-002 | 7 | audit mutation doors remain absent. | none | none |
| DATA-003 | 1 | Erase an unused imported account. | none | none |
| DATA-003 | 1 | a retention-expired PO attachment. | none | none |
| DATA-003 | 1 | process a held ordered-account request. | none | none |
| DATA-003 | 1 | inspect redaction. | none | none |
| DATA-003 | 1 | retained financial history. | none | none |
| DATA-003 | 1 | the provider-custody report. | none | none |
| DATA-003 | 2 | Restore with a later erasure journal. | none | none |
| DATA-003 | 2 | refuse resurrection. | none | none |
| DATA-003 | 3 | For the ct scope-review-56 §E ordered-account journey: verify. | none | none |
| DATA-003 | 3 | record the request. | none | none |
| DATA-003 | 3 | preview every class. | none | none |
| DATA-003 | 3 | revoke access under a hold without redacting. | none | none |
| DATA-003 | 3 | release it as owner. | none | none |
| DATA-003 | 3 | explicitly execute the current revision with ERASE. | none | none |
| DATA-003 | 3 | inspect placeholders/removals. | none | none |
| DATA-003 | 3 | unchanged within-floor financial records. | none | none |
| DATA-003 | 3 | exact audit attribution. | none | none |
| DATA-003 | 3 | exclusions. | none | none |
| DATA-003 | 3 | transfer invalidation. | none | none |
| DATA-003 | 3 | custody. | none | none |
| DATA-003 | 4 | Restore older data with the outside-D1 journal. | none | none |
| DATA-003 | 4 | inspect re-application before serving. | none | none |
| DATA-003 | 4 | missing or incomplete journals refuse service. | none | none |
| DATA-003 | 4 | restored mail never re-sends. | none | none |
| BASE-001 | 1 | Install into a fresh checkout using documented rer commands. | none | none |
| BASE-001 | 1 | complete native setup/sign-in. | none | none |
| BASE-001 | 1 | open the Lobby/app. | none | none |
| BASE-001 | 1 | inspect a missing-connection state. | none | none |
| BASE-001 | 1 | then export/restore through the documented lifecycle. | none | none |
| BASE-001 | 2 | Verify preserved IDs. | none | none |
| BASE-001 | 2 | applied migrations. | none | none |
| OPS-001 | 1 | Interrupt an inventory. | none | none |
| OPS-001 | 1 | accounting handoff. | none | none |
| OPS-001 | 1 | restart. | none | none |
| OPS-001 | 1 | open diagnostics. | none | none |
| OPS-001 | 1 | resume the same orders. | none | none |
| OPS-001 | 2 | Export diagnostics without secrets. | none | none |
| OPS-001 | 2 | confirm each operation reaches acknowledged success or a visible owned exception. | none | none |
| OPS-001 | 3 | AUTO-003 exposes each open non-success quote delivery by delivery ID. | none | none |
| OPS-001 | 3 | state. | none | none |
| OPS-001 | 3 | age. | none | none |
| OPS-001 | 3 | owner. | none | none |
| OPS-001 | 3 | contact-task link. | none | none |
| OPS-001 | 3 | restoring requires reconnecting the configured Resend provider. | none | none |
| OPS-001 | 3 | re-entering the webhook secret. | none | none |
| OPS-001 | 4 | Other notification delivery remains not recorded. | none | none |
| AGT-001 | 1 | Under the held company policy. | none | none |
| AGT-001 | 1 | Submit email. | none | none |
| AGT-001 | 1 | PDF. | none | none |
| AGT-001 | 1 | photographed POs containing an ambiguous SKU. | none | none |
| AGT-001 | 1 | a hostile instruction. | none | none |
| AGT-001 | 2 | Under the held company policy. | none | none |
| AGT-001 | 2 | Review cited extraction. | none | none |
| AGT-001 | 2 | validation errors. | none | none |
| AGT-001 | 2 | correct the ambiguity. | none | none |
| AGT-001 | 2 | approve a draft. | none | none |
| AGT-001 | 3 | Under the held company policy. | none | none |
| AGT-001 | 3 | Nothing is ordered or sent before the authorized person approves. | none | none |
| AGT-001 | 4 | Under the held company policy. | none | none |
| AGT-001 | 4 | Issue a grant through the owner door. | none | none |
| AGT-001 | 4 | use the documented catalog. | none | none |
| AGT-001 | 4 | prepare-order commands. | none | none |
| AGT-001 | 4 | attempt each prohibited operation. | none | none |
| AGT-001 | 4 | revoke the grant. | none | none |
| AGT-001 | 4 | repeat the read. | none | none |
| AGT-001 | 5 | Under the held company policy. | none | none |
| AGT-001 | 5 | Inspect the recorded preparing. | none | none |
| AGT-001 | 5 | submitting. | none | none |
| AGT-001 | 5 | approving identities. | none | none |
| AGT-006 | 1 | Under the held company policy. | none | none |
| AGT-006 | 1 | Give the agent a real-shaped incumbent workbook. | none | none |
| AGT-006 | 1 | ledger export with duplicated company names. | none | none |
| AGT-006 | 1 | a missing release. | none | none |
| AGT-006 | 2 | Under the held company policy. | none | none |
| AGT-006 | 2 | Inspect proposed mappings. | none | none |
| AGT-006 | 2 | reconciled totals. | none | none |
| AGT-006 | 2 | correct one mapping. | none | none |
| AGT-006 | 2 | sign off before applying. | none | none |
| AGT-006 | 3 | Under the held company policy. | none | none |
| AGT-006 | 3 | Native edits continue to fence undo. | none | none |
| AGT-007 | 1 | Under the held company policy. | none | none |
| AGT-007 | 1 | Present an account with a delayed delivery. | none | none |
| AGT-007 | 1 | an unanswered quote. | none | none |
| AGT-007 | 2 | Under the held company policy. | none | none |
| AGT-007 | 2 | Review a plan that addresses the delivery before proposing more stock. | none | none |
| AGT-007 | 2 | approve one message. | none | none |
| AGT-007 | 2 | suppress another. | none | none |
| AGT-007 | 2 | unanswered work stays assigned until the buyer responds or a rep resolves it. | none | none |
| AGT-008 | 1 | Under the held company policy. | none | none |
| AGT-008 | 1 | Approve a substitution proposal. | none | none |
| AGT-008 | 1 | change its source price. | none | none |
| AGT-008 | 1 | revoke its grant before execution. | none | none |
| AGT-008 | 2 | Under the held company policy. | none | none |
| AGT-008 | 2 | Refuse the stale/revoked effect. | none | none |
| AGT-008 | 2 | show its provenance. | none | none |
| AGT-008 | 2 | approval in history. | none | none |
| AGT-008 | 2 | execute a newly reviewed revision once after reauthorization. | none | none |
