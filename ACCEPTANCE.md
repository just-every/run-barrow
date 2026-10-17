# Acceptance journeys

Target edition: 17 October 2026. These numbered public-door journeys match every named clause in [CONTRACT.md](CONTRACT.md). Statuses are judged from the same code/test commit; a partial row names only its existing foundation, not completion of the journey. Execute journeys using realistic US wholesale accounts, USD and authorized provider sandboxes, with fakes only at paid/network edges. Every commercial effect is confirmed in its authoritative system. At 1440px and 390px inspect all changed screens and each final success, hold or exception state; native rep journeys run on iOS and Android and include disconnection/restart.

Existing release journeys remain BAR-001 through BAR-006. The earlier exclusions of checkout, tax, payment and shipping are superseded by the target clauses. Inventory, accounting, carriers and financing remain separate connected authorities, with Pier optional. Counts and the code-judgment commit are canonical in CONTRACT.md.

## Published guarantees carried forward

1. **BAR-001 — Accounts and access.** **Status:** done. Using the native sign-in and HTTP commands, read as two different buyers, attempt foreign account reads, cross-origin writes and supplier actions as a buyer, then revoke an agent grant. Unauthorized requests return no commercial data and perform no mutation. **Current evidence:** `src/barrow/access.ts`; `src/barrow/accounts.ts`; `src/barrow/api.ts`; `tests/api/flows.test.mjs`.

2. **BAR-002 — Orders and invoices.** **Status:** partial. Prepare and approve a USD order, lose the inventory response and repeat the command; inspect one external reservation, an explicit shortfall, and an invoice limited to eligible quantities. Change current prices afterward and download again: the issued snapshot and currency are unchanged. Repeat for a legacy AUD record. **Current evidence:** `src/barrow/orders.ts`; `src/barrow/invoice.ts`; `tests/api/flows.test.mjs`. **Remaining:** Existing exact-cent AUD snapshots and Pier idempotency ship; USD, other inventory authorities and invoiceable shipment splits are absent.

3. **BAR-003 — Agent preparation.** **Status:** done. Issue a grant through the owner door, use the documented catalogue and prepare-order commands, attempt each prohibited operation, revoke the grant and repeat the read. Inspect the recorded preparing, submitting and approving identities. **Current evidence:** `src/barrow/api.ts`; `src/barrow/access.ts`; `scripts/barrow.mjs`; `tests/api/flows.test.mjs`.

4. **BAR-004 — Account move-in.** **Status:** done. Upload the documented account/price CSV through Move in, preview without account writes, refuse a stale fingerprint, apply over several batches and replay it. Inspect originals and journal, then undo untouched accounts and refuse undo after a native edit or dependent order. **Current evidence:** `src/barrow/imports/service.ts`; `src/barrow/imports/targets.ts`; `tests/api/flows.test.mjs`.

5. **BAR-005 — Export, restore and erasure.** **Status:** done. Export a populated installation through its portability door, restore into an empty installation and compare commercial records. Confirm credentials are excluded. Erase an unused imported account, export again, and refuse the older archive when supplied with the later journal; refuse erasure of an account with orders. **Current evidence:** `src/barrow/accounts.ts`; `src/barrow/portability-policy.mjs`; `tests/api/flows.test.mjs`.

6. **BAR-006 — Run site.** **Status:** done. Build with rer build --site, serve the output and traverse the homepage, /run, guide navigation, local assets and a missing guide. Confirm the installed route keeps its Lobby and the site contains no private account data. **Current evidence:** `src/site/pages.ts`; `src/site/docs/pages.ts`; `tests/site.test.mjs`.


## Trade accounts and authority

7. **ACC-001 — Trade applications and approval.** **Status:** partial. Apply from the public trade form, request a missing certificate, approve and sign in, accepting the portal usage terms. The new buyer sees only its approved assortment; a declined or pending applicant cannot see prices, and publishing new usage terms requires acceptance at the next sign-in. **Current evidence:** `src/barrow/accounts.ts`; `src/barrow/ui/account-form.tsx`; `tests/api/flows.test.mjs`. **Remaining:** Supplier-created accounts and invitations exist; buyer application, review states and document collection do not.

8. **ACC-002 — Company buyers and purchasing rights.** **Status:** missing. Invite four company users, build a cart as a limited purchaser, approve it as the authorized approver, read its statement as finance and refuse finance ordering and cross-company administration. **Remaining:** Implement company buyers and purchasing rights and prove the stated journey.

9. **ACC-003 — Billing and delivery locations.** **Status:** missing. Save a headquarters and two stores, place an order to each store, change the default afterward and inspect unchanged order addresses and the correct tax jurisdictions. **Remaining:** Implement billing and delivery locations and prove the stated journey.

10. **ACC-004 — Account lifecycle and commercial profile.** **Status:** partial. Place an order, hold then close its account and attempt checkout. History remains readable to the same authorized buyer; new orders are refused and a duplicate email cannot take over the company. **Current evidence:** `src/barrow/accounts.ts`; `src/barrow/imports/validation.ts`; `tests/api/flows.test.mjs`. **Remaining:** Stable account identity and terms exist; lifecycle states, company profile and duplicate-company review are missing.

11. **ACC-005 — Supplier roles and separation of duties.** **Status:** partial. Invite each supplier role, attempt a credit override as a rep and a catalog edit as operations, allow the authorized finance and manager actions and inspect attributed audit events. **Current evidence:** `src/barrow/model.ts`; `src/barrow/api.ts`; `tests/api/flows.test.mjs`. **Remaining:** Owner/admin and customer separation exists; functional supplier roles, scoped rights and limits are missing.

12. **ACC-006 — Rep territories and delegated coverage.** **Status:** missing. Assign two reps disjoint accounts, give one temporary vacation coverage and expire it. Order and export access follows current assignments; historical commission attribution survives a transfer. **Remaining:** Implement rep territories and delegated coverage and prove the stated journey.

13. **ACC-007 — Buyer purchasing approvals.** **Status:** partial. Submit a $6,000 cart above a purchaser limit, complete two approvals, revise quantities and require fresh approval. Delegate an absent approver and prove a lower-rights buyer cannot bypass the route. **Current evidence:** `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Human buyer submission and supplier approval exist; company approval policies, revisions and escalation do not.


## Catalogues and merchandising

14. **CAT-001 — Private account assortments.** **Status:** done. Sign in as two buyers with different price lists and request both catalogues and direct API paths; each sees only its own priced items and no upstream credentials. **Current evidence:** `src/barrow/accounts.ts`; `src/barrow/pier.ts`; `tests/api/flows.test.mjs`.

15. **CAT-002 — Product discovery and media.** **Status:** missing. Load a 10,000-variant wholesale assortment fixture, find a known SKU by barcode and attribute filters, view its images and spec sheet, and refuse the same private attachment from an unentitled buyer. **Remaining:** Implement product discovery and media and prove the stated journey.

16. **CAT-003 — Digital line sheets.** **Status:** missing. Publish a spring line sheet showing wholesale and MSRP to one account and a wholesale-only sheet to another account with different prices, order from each on a phone and export each account PDF. Each page and PDF shows exactly its configured price columns; a revoked share cannot expose the sheet or another account price. **Remaining:** Implement digital line sheets and prove the stated journey.

17. **CAT-004 — Shoppable lookbooks and presentations.** **Status:** missing. Create a lookbook with a video and three hotspots, share to an approved buyer, retire one SKU and order from the remaining two; the retired item is clearly unavailable and historical presentation does not bypass pricing. **Remaining:** Implement shoppable lookbooks and presentations and prove the stated journey.

18. **CAT-005 — Branded responsive storefront.** **Status:** partial. Configure a brand, sign in and complete a representative cart at 1440px and 390px. Logo, navigation, prices, validation and the final confirmation remain readable and operable. **Current evidence:** `src/barrow/ui/app.tsx`; `src/barrow/ui/catalogue.tsx`. **Remaining:** Responsive Barrow catalogue exists; merchant branding, domains and full checkout journey are missing.

19. **CAT-006 — Multiple brands and buying profiles.** **Status:** missing. Configure two brands and a buyer approved for one, refuse the other brand, then approve a second profile and switch. Each cart, invoice and export names the correct seller. **Remaining:** Implement multiple brands and buying profiles and prove the stated journey.

20. **CAT-007 — Style color size and assortment matrices.** **Status:** missing. Order a size run that includes a higher-priced extended size and a case assortment through a line-sheet matrix, inspect exact SKU quantities and per-size prices in the order and inventory handoff, and reject an unavailable size without silently reallocating it. **Remaining:** Implement style color size and assortment matrices and prove the stated journey.

21. **CAT-008 — Season and catalogue publishing.** **Status:** missing. Stage next-season products, preview as a named buyer, publish at its effective date and archive a prior style. New orders use the new assortment; prior orders keep their original SKU description. **Remaining:** Implement season and catalogue publishing and prove the stated journey.

22. **CAT-009 — Bulk product and catalogue maintenance.** **Status:** missing. Preview a product workbook containing a duplicate barcode and broken media reference, correct it, apply and export. A source-owned field edit is refused or explicitly routed to that source. **Remaining:** Implement bulk product and catalogue maintenance and prove the stated journey.

23. **CAT-010 — Bulk image upload and naming rules.** **Status:** missing. Configure a style_color_position rule and drag in a batch that includes a misspelled filename and an image for a style not yet imported, then import that style and re-upload one image. Matched files attach to the right variant and position, the misspelling is listed with its reason, the held file attaches after the import, and the re-upload replaces its slot without a duplicate. **Remaining:** Bulk image upload, filename naming rules, held unmatched files and in-place slot replacement are not implemented.


## Commercial pricing

24. **PRI-001 — Negotiated USD price books.** **Status:** partial. Assign different USD prices to two accounts, prepare orders and compare checkout, invoice and exported cents. Restore a legacy AUD order and show AUD unchanged. **Current evidence:** `src/barrow/imports/validation.ts`; `src/barrow/invoice.ts`; `src/barrow/ui/types.ts`; `tests/api/flows.test.mjs`. **Remaining:** Per-account exact-cent prices exist but currency and presentation are fixed to AUD.

25. **PRI-002 — Quantity breaks and account discounts.** **Status:** partial. Price quantities just below and above a volume break, combine an account discount and a negotiated override, and verify the displayed rule and exact total survive the order snapshot. **Current evidence:** `src/barrow/imports/validation.ts`; `src/barrow/orders.ts`. **Remaining:** One agreed price per account/SKU exists; tiers, discount rules and precedence do not.

26. **PRI-003 — Case packs minimums and increments.** **Status:** partial. Enter below-minimum and non-case quantities in the cart, CSV and API, then split a valid order. Each door enforces the configured rules and requires the buyer to accept any corrected quantities. **Current evidence:** `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** SKU and order-value minimums ship; case multiples, increments and per-split rules are missing.

27. **PRI-004 — Unit of measure pricing.** **Status:** partial. Order two cases of 12 and six each of one SKU, inspect 30 base units in the handoff and the correct separate invoice bases, and reject an undefined unit conversion. **Current evidence:** `src/barrow/pier.ts`; `src/barrow/model.ts`. **Remaining:** Pier supplies a unit label; selectable units, conversion and unit-specific prices are missing.

28. **PRI-005 — Bundles and wholesale promotions.** **Status:** missing. Combine eligible styles to qualify for a mix-and-match promotion, remove one, apply a nonstackable discount and return part of the bundle. Totals and credits follow the published rule once. **Remaining:** Implement bundles and wholesale promotions and prove the stated journey.

29. **PRI-006 — Effective prices and additional currencies.** **Status:** missing. Schedule a future USD revision, quote before and after it, then place a CAD order through a compatible payment sandbox. All documents keep the agreed currency and the report shows its dated USD conversion. **Remaining:** Implement effective prices and additional currencies and prove the stated journey.

30. **PRI-007 — Explainable commercial validation.** **Status:** partial. Alter client totals, change an account price and exhaust credit after drafting, then submit through the public API. The order blocks with the current reasons and only an authorized, recorded exception can release it. **Current evidence:** `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Server price, stock and minimum checks and stale account-revision rejection exist; credit, tax, units and shipping checks are missing.

31. **PRI-008 — Suggested retail prices and price display.** **Status:** missing. Import a price book with wholesale and MSRP columns in USD and CAD, publish one line sheet showing both prices and one showing wholesale only, and open each as its buyer on the page, PDF, order confirmation (ORD-014) and order CSV. Each shows exactly the configured columns, the displayed margin matches the two prices, and every order total equals the wholesale lines alone. **Remaining:** Price books hold one wholesale price per account/SKU; MSRP fields, per-document price display settings and margin display are not implemented.


## Buying quoting and order lifecycle

32. **ORD-001 — Quick order and CSV cart upload.** **Status:** partial. Upload a real-shaped 80-line CSV with a duplicate, unknown SKU and invalid case quantity; review and correct errors, choose merge, and compare every accepted line and total in checkout. **Current evidence:** `src/barrow/ui/catalogue.tsx`; `src/barrow/orders.ts`. **Remaining:** Multi-line quantity entry exists; SKU quick lookup, barcode entry and CSV cart import do not.

33. **ORD-002 — Saved shopping lists.** **Status:** missing. Save and share a store replenishment list, change one price and discontinue one SKU, then add it to a cart as another authorized buyer. Show current totals and explicit exceptions without exposing another company list. **Remaining:** Implement saved shopping lists and prove the stated journey.

34. **ORD-003 — Reorder from history.** **Status:** partial. Open a six-month-old order, select three lines, reorder after a price and SKU change and review the difference summary before checkout; the original order is unchanged. **Current evidence:** `src/barrow/api.ts`; `src/barrow/ui/orders.tsx`. **Remaining:** Account-scoped order history exists; search, selective repeat-order action and difference review are missing.

35. **ORD-004 — Negotiated wholesale quotes.** **Status:** missing. Request a quote, approve a rep discount, accept it twice through buyer and API doors and inspect one order with the accepted revision. Expire a second quote and refuse its acceptance. **Remaining:** Implement negotiated wholesale quotes and prove the stated journey.

36. **ORD-005 — Quote conversation revisions and notes.** **Status:** missing. Exchange a message, add an internal margin note and revise a quote while the buyer has its old version open. Notify participants, hide the internal note from buyer exports and refuse old-version acceptance. **Remaining:** Implement quote conversation revisions and notes and prove the stated journey.

37. **ORD-006 — Self-service checkout.** **Status:** partial. Complete one eligible card order and one net-terms order through the buyer storefront, then attempt a credit-held order. Receive clear confirmations for accepted orders and an actionable hold for the third. **Current evidence:** `src/barrow/orders.ts`; `src/barrow/ui/orders.tsx`; `tests/api/flows.test.mjs`. **Remaining:** Buyers submit drafts with terms; every order requires supplier approval and checkout tax, freight and payment are missing.

38. **ORD-007 — Purchase references and requested dates.** **Status:** partial. Submit the same company PO twice, refuse the accidental duplicate, authorize a numbered release and inspect date and attachment fields in the order and ERP handoff. **Current evidence:** `src/barrow/orders.ts`; `src/barrow/ui/catalogue.tsx`; `tests/api/flows.test.mjs`. **Remaining:** A PO/reference string ships; attachments, aliases, dates and duplicate-PO workflow are missing.

39. **ORD-008 — Seasonal prebooks and ship windows.** **Status:** missing. Place a spring prebook with two ship windows and a deposit, close the season, release the first window and backorder a delayed style. Buyer and operations see committed, released and outstanding quantities separately. **Remaining:** Implement seasonal prebooks and ship windows and prove the stated journey.

40. **ORD-009 — Backorders and shipment splits.** **Status:** partial. Accept ten cases with six available now and four next month, choose a split, ship six and cancel one remaining case. Order, invoices, freight and stock authority agree on six shipped and three outstanding. **Current evidence:** `src/barrow/orders.ts`; `src/barrow/ui/orders.tsx`; `tests/api/flows.test.mjs`. **Remaining:** Reservation shortfalls are visible; buyer backorder acceptance, release splits and shipment billing do not exist.

41. **ORD-010 — Immutable agreed order snapshots.** **Status:** done. Prepare, submit and approve through buyer/supplier HTTP doors, change the account price and terms, then download twice. Original prices, total, terms, reference and approval identities remain unchanged. **Current evidence:** `src/barrow/orders.ts`; `src/barrow/invoice.ts`; `tests/api/flows.test.mjs`.

42. **ORD-011 — Order changes and cancellation.** **Status:** missing. Request a quantity reduction after acceptance but before picking, approve it, release stock and adjust the charge once. Refuse cancellation of already shipped lines and offer a linked return request. **Remaining:** Implement order changes and cancellation and prove the stated journey.

43. **ORD-012 — Buyer order status and confirmations.** **Status:** partial. Follow a real-shaped order through acceptance, split shipment and delivery via connected events, open its timeline as the buyer and verify the confirmation, tracking and exception state. Another buyer cannot read it. **Current evidence:** `src/barrow/api.ts`; `src/barrow/ui/orders.tsx`; `tests/api/flows.test.mjs`. **Remaining:** Draft, submitted, reserving, shortfall and approved states exist; confirmations and fulfillment/payment lifecycle states are missing.

44. **ORD-013 — Multi-location orders and release groups.** **Status:** missing. Split one assortment across three stores and two delivery windows, fail one inventory handoff and retry. Inspect one accepted child per intended release with correct addresses, totals and group reference. **Remaining:** Implement multi-location orders and release groups and prove the stated journey.

45. **ORD-014 — Order confirmation documents.** **Status:** missing. Submit a matrix order with two ship windows, download its confirmation PDF and CSV as buyer and rep, revise one quantity and download again. Both revisions are retained and differ only in the changed line, each names its terms version and acceptance, and another buyer is refused. **Remaining:** Only the invoice CSV exists; numbered order confirmation PDF/CSV revisions with images, windows and terms are not implemented.

46. **ORD-015 — Versioned sales terms and buyer acceptance.** **Status:** missing. Assign terms version 1 to an account that requires acceptance, attempt submission without accepting (refused), accept as the buyer and submit, then submit a rep order with signature capture. Publish version 2: both orders keep version 1 and its acceptance record in their confirmation PDFs, and the next order requires version 2. **Remaining:** Accounts carry payment terms only; versioned sales terms, required acceptance and signature capture are not implemented.


## Stock promises and fulfillment handoff

47. **STK-001 — Live customer-visible availability.** **Status:** done. Read an account catalogue against real Pier stock, exhaust a SKU and attempt an over-order. Confirm the available quantity, server refusal and no stock effect from draft preparation. **Current evidence:** `src/barrow/pier.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs`.

48. **STK-002 — Available to promise by warehouse and date.** **Status:** partial. Connect two warehouses and an inbound receipt, compare immediate and future ship windows, interrupt sync and attempt checkout after the freshness limit. Show the stale source and require a valid refresh or explicit approved exception. **Current evidence:** `src/barrow/pier.ts`; `src/barrow/ui/catalogue.tsx`. **Remaining:** Live Pier availability and observation time exist; multiwarehouse selection, incoming ATP and freshness policies are missing.

49. **STK-003 — Durable order acknowledgement.** **Status:** partial. Drop an acknowledgement after the inventory system creates its order, retry, and reconcile by external key. Inspect one upstream order and the retained acknowledgement; change the configured destination and refuse the old-order handoff. **Current evidence:** `src/barrow/orders.ts`; `src/barrow/pier.ts`; `tests/api/flows.test.mjs`. **Remaining:** Pier command identity, destination binding and retries exist; general adapter acknowledgement and reconciliation are missing.

50. **STK-004 — Reservation release and stock exceptions.** **Status:** missing. Cancel an allocated unshipped order, lose the release response and repeat it. The authority releases once; Barrow clears the exception only after confirmation and shows the correct remaining promiseable stock. **Remaining:** Implement reservation release and stock exceptions and prove the stated journey.

51. **STK-005 — Buyer-approved substitutions.** **Status:** missing. Short a discontinued style, propose a differently priced replacement, decline once then accept a revised offer. Only the accepted quantity and price reach inventory, and the original shortfall remains traceable. **Remaining:** Implement buyer-approved substitutions and prove the stated journey.


## Field sales and mobile

52. **REP-001 — Assigned-account rep ordering.** **Status:** partial. Sign in as a rep, select an assigned account and prepare an order for buyer approval. Refuse another territory and show the rep plus buyer identities on the accepted order. **Current evidence:** `src/barrow/orders.ts`; `src/barrow/accounts.ts`; `tests/api/flows.test.mjs`. **Remaining:** Suppliers can prepare account orders with identity recorded; dedicated rep roles and assignment restrictions are missing.

53. **REP-002 — Offline native rep order writing.** **Status:** missing. On both supported mobile platforms, download an assigned account, disconnect, present its line sheet and write several drafts. Restart offline and recover them, then revoke the rep and reconnect to remove further access. **Remaining:** Implement offline native rep order writing and prove the stated journey.

54. **REP-003 — Offline synchronization and conflicts.** **Status:** missing. Write three offline orders, change one price and exhaust one SKU, reconnect with a dropped response and restart. One draft synchronizes once and two show specific conflicts; no stale draft auto-submits or duplicates. **Remaining:** Implement offline synchronization and conflicts and prove the stated journey.

55. **REP-004 — Rep commissions and attribution.** **Status:** missing. Assign a split commission, accept and ship an order, record partial payment then return a line. Each rep statement shows the correct earned and reversed cents and a transfer does not rewrite prior attribution. **Remaining:** Implement rep commissions and attribution and prove the stated journey.

56. **REP-005 — Visits samples and trade-show selling.** **Status:** missing. Schedule a showroom visit, record a sample request and buyer notes, prepare a quote, assign a follow-up and hand the sample to inventory. The rep sees the next action and completion acknowledgement. **Remaining:** Implement visits samples and trade-show selling and prove the stated journey.

57. **REP-006 — Barcode scanning in the rep app.** **Status:** missing. On iOS and Android offline, scan a hang-tag UPC with the camera and another with a paired HID scanner, scan one twice and one case-pack SKU, and scan an unknown code. Matched variants carry the right quantities in the open draft, the unknown code prompts search, and the draft synchronizes once on reconnection. **Remaining:** No native rep app or camera/HID barcode scanning exists.

58. **REP-007 — Trade-show prospect capture.** **Status:** missing. Offline, create a prospect, attach a certificate photo and write a draft from the show assortment, then reconnect. The prospect lands in the ACC-001 queue tagged with its show and any duplicate, the draft remains unsubmitted with no reservation, approval turns it into the new account's draft for buyer confirmation, and a declined prospect sees no prices. **Remaining:** Offline prospect capture, show assortments and routing into application review are not implemented.

59. **MOB-001 — Buyer mobile access and accessibility.** **Status:** partial. Use keyboard and a screen reader through a realistic cart and approval, then complete checkout and tracking on a 390px phone and 1440px desktop. Check focus after validation and the visible accepted-order end state. **Current evidence:** `src/barrow/ui/app.tsx`; `src/barrow/ui/catalogue.tsx`; `src/barrow/ui/orders.tsx`. **Remaining:** Responsive catalogue and order UI exists; full mobile buying/payment journeys and accessibility acceptance are unproven.


## Payments credit invoices and account finance

60. **PAY-001 — Stripe card checkout.** **Status:** missing. Use Stripe test checkout for successful and declined cards and an authentication challenge, replay an event and lose a capture response. The buyer sees one appropriate payment result and one reconciled charge; a configured surcharge appears for an eligible credit card and is refused for a debit card and a prohibiting state. **Remaining:** Implement stripe card checkout and prove the stated journey.

61. **PAY-002 — Stripe ACH collection.** **Status:** missing. Authorize a test bank account, submit a debit, inspect the pending statement then simulate settlement and a return. Order policy, balance and buyer notification reflect each verified provider event once. **Remaining:** Implement stripe ach collection and prove the stated journey.

62. **PAY-003 — Deposits partial payments and allocations.** **Status:** missing. Collect a 30% deposit on a seasonal prebook, invoice two releases, apply the deposit and a partial balance payment. Statement and provider references reconcile to the exact amount outstanding. **Remaining:** Implement deposits partial payments and allocations and prove the stated journey.

63. **PAY-004 — Approved net terms and credit limits.** **Status:** partial. Give an account net 30 and a $10,000 limit, place an $8,000 order with $3,000 already owed, and block or route it for approval. Record a payment and observe recalculated available credit. **Current evidence:** `src/barrow/model.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Agreed terms and due-date snapshots exist; credit exposure, balances and limit enforcement are missing.

64. **PAY-005 — Credit holds and controlled release.** **Status:** missing. Hold an overdue account, attempt checkout as buyer and rep, collect a partial payment, then release within a finance limit. Refuse a rep override and invalidate a stale release if exposure changes. **Remaining:** Implement credit holds and controlled release and prove the stated journey.

65. **PAY-006 — B2B pay later through Resolve.** **Status:** missing. Connect a Resolve sandbox merchant, submit eligible and declined buyer applications, accept a provider-approved order and reconcile invoice funding and repayment events. A declined decision or insufficient provider credit cannot be overridden as provider approval. **Remaining:** Implement b2b pay later through resolve and prove the stated journey.

66. **PAY-007 — Customer account statements.** **Status:** missing. Open a statement spanning an opening balance, two invoices, deposit, partial payment and credit; compare the closing balance with the connected ledger and download it as the buyer. Another company is refused. **Remaining:** Implement customer account statements and prove the stated journey.

67. **PAY-008 — Invoice documents and delivery.** **Status:** partial. Invoice a split shipment through the connected accounting sandbox, deliver its PDF, download CSV and change the current price list. Both documents retain the issued revision, correct tax/freight and one accounting invoice ID. **Current evidence:** `src/barrow/invoice.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Stable fully reserved AUD invoice CSV and due dates exist; PDF, tax, freight, delivery and accounting authority sync are missing.

68. **PAY-009 — Receivables aging and collections.** **Status:** missing. Age three invoices, dispute one and record a promise-to-pay for another. Run scheduled reminders, settle the third via provider event and inspect aging, recipient delivery and the remaining owned tasks. **Remaining:** Implement receivables aging and collections and prove the stated journey.

69. **PAY-010 — Credit notes and refunds.** **Status:** missing. Credit a partial return, apply part to an unpaid invoice and refund the paid remainder through Stripe. Replay the refund callback and verify one credit, one refund and the exact statement balance. **Remaining:** Implement credit notes and refunds and prove the stated journey.

70. **PAY-011 — Payment disputes and reconciliation.** **Status:** missing. Receive a Stripe test dispute and ACH return, attach delivery evidence, reconcile a payout including fees and inspect a named owner for the open disputed balance. **Remaining:** Implement payment disputes and reconciliation and prove the stated journey.

71. **PAY-012 — Saved payment methods and consent.** **Status:** missing. Save a test payment method, authorize a later balance charge, remove consent and attempt another charge. Provider tokens stay private, the new charge is blocked and old receipts remain accessible. **Remaining:** Implement saved payment methods and consent and prove the stated journey.


## US sales tax and exemptions

72. **TAX-001 — Avalara AvaTax calculation.** **Status:** missing. Use an AvaTax sandbox with taxable interstate and exempt orders, change the delivery address, commit an invoice and credit one line. Checkout, invoice and provider transaction totals reconcile to the cent. **Remaining:** Implement avalara avatax calculation and prove the stated journey.

73. **TAX-002 — TaxJar alternative tax adapter.** **Status:** missing. Configure TaxJar, quote two destination jurisdictions, import a refund and interrupt the provider during checkout. Refuse an invented tax amount and preserve previous invoice provider references after a switch. **Remaining:** Implement taxjar alternative tax adapter and prove the stated journey.

74. **TAX-003 — Resale certificates and exemption review.** **Status:** missing. Upload a certificate for one state, approve it through staff review, order in covered and uncovered states and let it expire. Only the eligible transaction is exempt and the buyer receives a renewal action. **Remaining:** Implement resale certificates and exemption review and prove the stated journey.

75. **TAX-004 — Tax corrections and audit trail.** **Status:** missing. Correct an address after invoice issue and return a taxable item. Inspect the original plus linked correcting transaction in Barrow and the provider export; no silent mutation or duplicate refund tax occurs. **Remaining:** Implement tax corrections and audit trail and prove the stated journey.


## Shipping delivery returns and service

76. **SHIP-001 — Delivery methods and shipping charges.** **Status:** missing. Compare pickup, UPS parcel and freight-quote orders, cross a free-freight threshold and change the ship-to state. Buyer explicitly accepts the final method, cost and window before ordering. **Remaining:** Implement delivery methods and shipping charges and prove the stated journey.

77. **SHIP-002 — EasyPost carrier connection.** **Status:** missing. Rate and purchase a sandbox UPS label, a USPS shipment and a FedEx shipment, lose one response and retry, then void an unused label. Exactly one label charge occurs per purchase and the order retains tracking IDs. **Remaining:** Implement easypost carrier connection and prove the stated journey.

78. **SHIP-003 — Shipment tracking and delivery exceptions.** **Status:** missing. Ship two packages, send delayed and delivered carrier events out of order, then raise a missing-package report. Only the truly delivered package closes and the other has an assigned follow-up. **Remaining:** Implement shipment tracking and delivery exceptions and prove the stated journey.

79. **SHIP-004 — Return authorizations and claims.** **Status:** missing. Request a damaged-goods return with photos, approve two of three units, receive and inspect them in the connected system and issue the approved credit. Remaining disputed quantity stays open and stock changes only in the authority. **Remaining:** Implement return authorizations and claims and prove the stated journey.

80. **SHIP-005 — Exchanges and service resolution.** **Status:** missing. Report a short shipment, choose a replacement of different value, approve its price difference and follow the linked shipment to delivery. The original case closes only after the buyer-facing resolution is recorded. **Remaining:** Implement exchanges and service resolution and prove the stated journey.


## Connected systems and reliability

81. **INT-001 — Optional Pier inventory connection.** **Status:** partial. Configure Pier, place an approved order and revoke its credential. Show a failed handoff without lost orders, reconnect the same origin and reconcile it, then configure a different supported inventory authority without creating a Pier ledger. **Current evidence:** `src/barrow/pier.ts`; `scripts/connect-pier.mjs`; `tests/api/flows.test.mjs`. **Remaining:** Real Pier HTTP catalogue and reservations ship; it is currently mandatory for ordering and no alternate inventory adapter ships.

82. **INT-002 — QuickBooks Online accounting.** **Status:** missing. Connect a QBO sandbox, invoice an order, receive a partial payment and credit a return. Replay sync and inspect one invoice/credit in the correct company and an exact buyer balance; token revocation leaves actionable failures. **Remaining:** Implement quickbooks online accounting and prove the stated journey.

83. **INT-003 — Xero accounting.** **Status:** missing. Send a net-terms order to Xero sandbox, allocate a payment in Xero, sync back and compare the buyer statement. Edit an issued invoice upstream and inspect a reconciliation conflict rather than a duplicate. **Remaining:** Implement xero accounting and prove the stated journey.

84. **INT-004 — NetSuite ERP.** **Status:** missing. Map a sandbox subsidiary and warehouse, submit a prebook and split fulfillment, return invoice/payment states and revoke a role permission mid-sync. Inspect linked records, correct balances and resumable errors. **Remaining:** Implement netsuite erp and prove the stated journey.

85. **INT-005 — Shopify commerce connection.** **Status:** missing. Connect a development store, import variants and customer mapping, place a Barrow order and fulfill/refund it in Shopify. See one order on each side and correct buyer status after duplicate events. **Remaining:** Implement shopify commerce connection and prove the stated journey.

86. **INT-006 — WooCommerce commerce connection.** **Status:** missing. Connect a controlled WooCommerce store, import a variation, order with negotiated pricing, receive a fulfillment and refund and replay the webhook. Retail prices remain distinct and no duplicate order is created. **Remaining:** Implement woocommerce commerce connection and prove the stated journey.

87. **INT-007 — Cin7 Core inventory connection.** **Status:** missing. Connect a Cin7 test company, order mixed available/backordered lines, fulfill a release and reconcile the portal timeline and source quantities. Retry an acknowledgement failure without another sale. **Remaining:** Implement cin7 core inventory connection and prove the stated journey.

88. **INT-008 — Brightpearl inventory connection.** **Status:** missing. Map a Brightpearl sandbox account and warehouse, place an order and receive a partial shipment; inspect matched external IDs and a surfaced invalid-field error with no duplicate handoff. **Remaining:** Implement brightpearl inventory connection and prove the stated journey.

89. **INT-009 — Katana inventory connection.** **Status:** missing. Connect a Katana test account, map a made-to-order SKU, show its source-provided availability date, create one sales order and receive its completed fulfillment without inventing production progress. **Remaining:** Implement katana inventory connection and prove the stated journey.

90. **INT-010 — Unleashed inventory connection.** **Status:** missing. Connect a test organization, order cases with a mapped unit conversion, ship in Unleashed and compare base quantities and buyer status. Invalid unit mapping blocks the handoff with a repair action. **Remaining:** Implement unleashed inventory connection and prove the stated journey.

91. **INT-011 — Faire brand order ingest.** **Status:** missing. Authorize a brand sandbox or controlled API boundary, fetch multiple pages, interrupt and resume, match an unknown SKU for review and ingest a replay. Each Faire order appears once and no Stripe collection is initiated for Faire-owned settlement. **Remaining:** Implement faire brand order ingest and prove the stated journey.

92. **INT-012 — Documented wholesale API.** **Status:** partial. Create an integration grant, import a small real-shaped catalogue and company, place an order and read its invoice/fulfillment through documented API requests. Refuse cross-account scopes and stale revisions. **Current evidence:** `src/barrow/api.ts`; `scripts/barrow.mjs`; `tests/api/flows.test.mjs`. **Remaining:** Native state, catalogue and order commands exist; general integration scopes, entity coverage and versioned exchange are missing.

93. **INT-013 — Webhooks retry and failed-handoff queue.** **Status:** missing. Subscribe a test endpoint, reject several deliveries, replay a signed event and send out-of-order provider states. See one business effect, retained attempts and a queue item that clears only on acknowledged resolution. **Remaining:** Implement webhooks retry and failed-handoff queue and prove the stated journey.

94. **INT-014 — Connector setup and reconciliation.** **Status:** missing. Set up a connector with a missing item and mismatched balance, inspect preview, repair mappings and reconcile before go-live. Revoke credentials later; keep local history and show precisely which records need attention. **Remaining:** Implement connector setup and reconciliation and prove the stated journey.

95. **INT-015 — Operational email and connected mailboxes.** **Status:** partial. Deliver a confirmation and simulate a bounce at the provider edge, ingest a PO from each authorized mailbox and revoke a mailbox. Inspect account/thread matching, suppression and no further ingestion after revocation. **Current evidence:** `src/barrow/accounts.ts`; `src/mail.server.mjs`; `tests/api/flows.test.mjs`. **Remaining:** Base mail invitations exist; operational message workflows, delivery states and mailbox intake are missing.

96. **INT-016 — EDI wholesale order exchange.** **Status:** missing. In a partner sandbox ingest an 850, resolve a missing SKU, accept it once, send its 855 and linked 856/810 and inspect transport acknowledgement and exceptions without duplicate orders. **Remaining:** Implement edi wholesale order exchange and prove the stated journey.

97. **INT-017 — AIMS360 apparel ERP connection.** **Status:** missing. Connect an AIMS360 test company, import a style with a color/size matrix, images and ATS, place an order with rep attribution, drop its acknowledgement and retry. AIMS360 holds one sales order with the exact size quantities, its fulfillment and invoice references return to the buyer timeline, and no duplicate order exists. **Remaining:** No AIMS360 adapter exists.

98. **INT-018 — ApparelMagic apparel ERP connection.** **Status:** missing. Connect an ApparelMagic test company, import a style with a color/size matrix, images and ATS, place an order with rep attribution, drop its acknowledgement and retry. ApparelMagic holds one sales order with the exact size quantities, its fulfillment and invoice references return to the buyer timeline, and no duplicate order exists. **Remaining:** No ApparelMagic adapter exists.

99. **INT-019 — A2000 apparel ERP connection.** **Status:** missing. Connect an A2000 test company or its documented exchange boundary, import a size-matrix style with ATS, place an order with rep attribution and replay the exchange. A2000 holds one sales order with the exact size quantities and its shipment and invoice references return to the buyer timeline. **Remaining:** No A2000 adapter exists.


## Reporting and commercial management

100. **RPT-001 — Account and product sales reporting.** **Status:** missing. Run a seasonal report containing a prebook, split shipment, credit and partial payment, filter a territory and drill to the documents. Exported totals reconcile with the source lines and another rep territory is inaccessible. **Remaining:** Implement account and product sales reporting and prove the stated journey.

101. **RPT-002 — Quote conversion and promotion performance.** **Status:** missing. Create accepted, expired and revised quotes plus a promoted order and return, then view conversion and net promotion performance; open a line sheet as two buyers and see each buyer's views. Count each accepted order once and explain every denominator. **Remaining:** Implement quote conversion and promotion performance and prove the stated journey.

102. **RPT-003 — Fulfillment and backorder reporting.** **Status:** missing. Load an on-time, late and partially shipped order, inspect line-based fill and lateness measures and open the late-line queue. Missing tracking stays unknown rather than counted as delivered. **Remaining:** Implement fulfillment and backorder reporting and prove the stated journey.

103. **RPT-004 — Finance and credit reporting.** **Status:** missing. Run aging on a stated date across net-30, disputed and partially paid invoices, export and compare every bucket with due dates and verified payments. A rep sees only the permitted account summary. **Remaining:** Implement finance and credit reporting and prove the stated journey.

104. **RPT-005 — Rep performance and commission statements.** **Status:** missing. Transfer an account between reps after one shipment and return part of it. Both statements retain correct historical earnings, manager totals reconcile and reps cannot read each other private compensation. **Remaining:** Implement rep performance and commission statements and prove the stated journey.

105. **RPT-006 — Scheduled reports and operational search.** **Status:** missing. Find a known PO in a realistic multi-season dataset, save a monthly filtered report and deliver it to an authorized finance user. Revoked recipients receive no private report and the report links to matching source records. **Remaining:** Implement scheduled reports and operational search and prove the stated journey.


## Follow-up and business automation

106. **AUTO-001 — Trade application follow-up.** **Status:** missing. Apply without a required certificate, route to a territory owner, send the request and upload the document. Escalation stops on the recorded decision, not merely because an email was queued. **Remaining:** Implement trade application follow-up and prove the stated journey.

107. **AUTO-002 — Approval routing and escalation.** **Status:** partial. Submit an order requiring buyer and finance approval, revise its price and run the scheduled escalation. Old approval is invalid, current delegates are notified once and approval closes the correct tasks. **Current evidence:** `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Automatic minimum/price checks and human supplier approval exist; policy routing, notifications and timed escalation are missing.

108. **AUTO-003 — Quote activity notifications.** **Status:** missing. Revise a quote, add an internal note and simulate a buyer email bounce. Buyer receives only visible changes, rep gets the note and a failed-contact task remains until resolved. **Remaining:** Implement quote activity notifications and prove the stated journey.

109. **AUTO-004 — Order and fulfillment notifications.** **Status:** missing. Run an order through a split shipment and return with duplicate carrier events. Inspect one notice per material change, the correct recipients, preferences and an owned bounce exception. **Remaining:** Implement order and fulfillment notifications and prove the stated journey.

110. **AUTO-005 — Rep next-action queue.** **Status:** missing. Create one item of each type, assign and snooze them, resolve a quote through acceptance and record a failed contact. The accepted quote closes while unanswered tasks remain and appear on the due date. **Remaining:** Implement rep next-action queue and prove the stated journey.

111. **AUTO-006 — Accounting invoice and payment automation.** **Status:** missing. Set billing on shipment, ship two releases, lose one QBO/Xero response and rerun. Each release has exactly one matched invoice, returned payment updates the balance and a bad mapping remains an open exception. **Remaining:** Implement accounting invoice and payment automation and prove the stated journey.

112. **AUTO-007 — Payment reminders and promises to pay.** **Status:** missing. Run scheduled reminders for overdue, disputed and promised invoices, settle one between scheduling and sending and miss another promise date. Only still-eligible messages send and finance sees the overdue promise task. **Remaining:** Implement payment reminders and promises to pay and prove the stated journey.

113. **AUTO-008 — Scheduled synchronization and stock alerts.** **Status:** missing. Interrupt a paginated sync, resume from its acknowledged checkpoint, restore a watched SKU and replay its event. One notice sends, reconciliation completes and persistent failure stays assigned. **Remaining:** Implement scheduled synchronization and stock alerts and prove the stated journey.


## Migration and cutover

114. **MOVE-001 — NuORDER move-in.** **Status:** missing. Upload real-shaped NuORDER product, image and order fixtures matching the documented formats, map variant/customer keys, preview and approve. Reconcile line counts, open quantities, currencies and order value, see images attached to their variants and slots with one unretrievable image reported, label historical orders and refuse unmapped identities before activation. **Remaining:** Implement nuorder move-in and prove the stated journey.

115. **MOVE-002 — Pepperi move-in.** **Status:** missing. Preview real-shaped Pepperi Excel item and XML order fixtures matching the documented formats, identify a .txt XML file by content, map customer/variant references and reconcile quantities and values. Replaying the source creates no second order. **Remaining:** Implement pepperi move-in and prove the stated journey.

116. **MOVE-003 — Brandboom move-in.** **Status:** missing. Upload real-shaped Brandboom customer/product XLS and order CSV/Excel fixtures matching the documented formats, resolve duplicate company names by source ID and review address mapping. Reconcile open order values and preserve the original file and field-level diagnostics. **Remaining:** Implement brandboom move-in and prove the stated journey.

117. **MOVE-004 — SparkLayer move-in.** **Status:** missing. Upload real-shaped detailed activity and shopping-list CSV fixtures matching the documented formats, compare the selected export date/filter range and join backing-store product/customer IDs. Reconcile covered orders and flag omitted source scope before cutover. **Remaining:** Implement sparklayer move-in and prove the stated journey.

118. **MOVE-005 — WizCommerce move-in.** **Status:** missing. Upload a real-shaped workbook set and FTP CSV batch matching the documented formats, join order headers and lines, distinguish a quote from an accepted order and reconcile customer/address counts and financial totals. Replaying either source cannot double-count history. **Remaining:** Implement wizcommerce move-in and prove the stated journey.

119. **MOVE-006 — Cin7 portal move-in.** **Status:** missing. Connect a test Cin7 company and preview a real-shaped source export/API set, reconcile open quantities and prices, invite buyers and complete one new order without duplicating the existing Cin7 sales order. **Remaining:** Implement cin7 portal move-in and prove the stated journey.

120. **MOVE-007 — Reconciled migration rehearsal.** **Status:** partial. Rehearse a populated cutover, compare independent source totals by currency/status, correct one unknown SKU and one receivable mismatch and obtain recorded owner approval. No buyer invitation or external order/payment effect occurs during preview. **Current evidence:** `src/barrow/imports/service.ts`; `tests/api/flows.test.mjs`. **Remaining:** Reviewed account/price previews and source custody exist; broader entity mapping and cross-system count/value reconciliation are missing.

121. **MOVE-008 — Cutover delta and safe rollback.** **Status:** partial. Run a rehearsal then a delta import with an order edited at source, sign off the cutoff and place one new order. Attempt undo after a dependent shipment; preserve it, name the blocked records and prove historical imports initiated no financial effect. **Current evidence:** `src/barrow/imports/service.ts`; `src/barrow/imports/targets.ts`; `tests/api/flows.test.mjs`. **Remaining:** Resumable account imports and dependency/native-edit guards exist; multi-entity delta cutover, authority handoff and rollback planning are missing.

122. **MOVE-009 — NuORDER companies and buyers move-in.** **Status:** partial. Preview real-shaped NuORDER Company and Buyer data workbooks with two ship-tos per company, a duplicate customer code and an unknown rep; resolve them and apply. Each company has its locations, terms, credit status, currency, rep and price list, each buyer has one pending invitation, and replaying the import adds no companies or invitations. **Current evidence:** `src/barrow/imports/service.ts`; `src/barrow/imports/targets.ts`; `tests/api/flows.test.mjs`. **Remaining:** Reviewed account/price CSV preview, apply and replay ship; NuORDER Company/Buyer templates and API, locations, buyer invitations, rep and credit-status mapping are missing.


## Data security operations and product separation

123. **DATA-001 — Business data portability.** **Status:** partial. Export a realistic account with a split order, return and partial payment, reconcile totals and resolve document references. A company export contains only that company and an owner archive still excludes all installation credentials. **Current evidence:** `src/barrow/api.ts`; `src/barrow/invoice.ts`; `src/barrow/portability-policy.mjs`; `tests/api/flows.test.mjs`. **Remaining:** Owner archive and account-scoped invoice CSV ship; full open commercial exports and document manifests are missing.

124. **DATA-002 — Commercial audit and decision history.** **Status:** partial. Approve a discount, override credit, issue a refund and import an account, then inspect and export the audit through a staff door. Editing/deleting history is refused and a buyer cannot retrieve internal decisions. **Current evidence:** `src/barrow/access.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Product writes record actor/action audit rows and order identities; searchable audit door and expanded commercial decision fields are missing.

125. **DATA-003 — Retention erasure and provider custody.** **Status:** partial. Erase an unused imported account and a retention-expired PO attachment, process a held ordered-account request and inspect redaction, retained financial history and the provider-custody report. Restore with a later erasure journal and refuse resurrection. **Current evidence:** `src/barrow/accounts.ts`; `src/barrow/imports/erasure.ts`; `tests/api/flows.test.mjs`. **Remaining:** Unused-account erasure, import-custody retirement and restore fencing ship; policy retention, held-request workflows and broader provider custody reporting are missing.

126. **DATA-004 — Connection and document security.** **Status:** partial. Rotate a connector token, replay an invalid signed webhook, upload a dangerous attachment and request a private file as another account. Refuse each unsafe action and inspect logs that reveal no credential or document body. **Current evidence:** `src/barrow/access.ts`; `src/barrow/api.ts`; `src/barrow/pier.ts`; `tests/api/flows.test.mjs`. **Remaining:** Session/grant, same-origin and server-only Pier authority checks exist; new provider secret lifecycle and secure document intake are missing.

127. **BASE-001 — Native installation and shared foundations.** **Status:** partial. Install into a fresh checkout using documented rer commands, complete native setup/sign-in, open the Lobby/app and inspect a missing-connection state, then export/restore through the documented lifecycle. Verify preserved IDs and applied migrations. **Current evidence:** `src/server.ts`; `src/auth.server.ts`; `src/barrow/ui/app.tsx`; `tests/api/flows.test.mjs`. **Remaining:** Native foundations and API/portability checks exist; the complete fresh-install owner journey and all target connectors are not yet evidenced.

128. **OPS-001 — Actionable diagnostics and recovery.** **Status:** partial. Interrupt an inventory and accounting handoff, restart, open diagnostics and resume the same orders. Export diagnostics without secrets and confirm each operation reaches acknowledged success or a visible owned exception. **Current evidence:** `src/barrow/orders.ts`; `src/barrow/ui/app.tsx`; `tests/api/flows.test.mjs`. **Remaining:** Visible Pier failures, retry/refresh and load errors exist; cross-provider diagnostics and operational exception management are missing.


## Push further with account agents

129. **AGT-001 — Turn inbound purchase orders into validated drafts.** **Status:** partial. Submit email, PDF and photographed POs containing an ambiguous SKU and a hostile instruction. Review cited extraction and validation errors, correct the ambiguity and approve a draft. Nothing is ordered or sent before the authorized person approves. **Current evidence:** `src/barrow/api.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Revocable agents prepare stock/price-validated drafts; document/mail intake, extraction citations and exception dialogue are missing.

130. **AGT-002 — Resolve substitution and stock exceptions.** **Status:** missing. Send a PO for a discontinued style, inspect two grounded substitutes and delivery options, decline one and approve a revised basket. Change inventory before execution and require revalidation; no substitute ships without the required approval. **Remaining:** Implement resolve substitution and stock exceptions and prove the stated journey.

131. **AGT-003 — Prepare a credit-hold resolution.** **Status:** missing. Create a held order with an unsettled ACH payment and disputed invoice. Inspect a source-linked resolution plan, approve a deposit path and let finance release the hold only after verified events satisfy policy. **Remaining:** Implement prepare a credit-hold resolution and prove the stated journey.

132. **AGT-004 — Explainable sell-through reorder plans.** **Status:** missing. Load a stockist sales/stock feed with an outage and open prebook, compare the proposed basket to actual demand and commitments, edit it and approve once. Show uncertainty for the outage and measure accepted, delivered and paid outcomes. **Remaining:** Implement explainable sell-through reorder plans and prove the stated journey.

133. **AGT-005 — Follow every order to delivery and payment.** **Status:** partial. Lose an inventory acknowledgement, delay one parcel and return an ACH debit. Inspect a source-linked action queue, approve outreach and resolve each real event; closure requires the verified delivery/settlement or an explicit attributed human exception. **Current evidence:** `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Reservation retry and manual shortfall refresh exist; agent delivery/payment tracing, owned tasks and approved follow-through are missing.

134. **AGT-006 — Reconcile a wholesale portal cutover.** **Status:** partial. Give the agent a real-shaped incumbent workbook and ledger export with duplicated company names and a missing release. Inspect proposed mappings and reconciled totals, correct one mapping and sign off before applying. Native edits continue to fence undo. **Current evidence:** `src/barrow/imports/service.ts`; `tests/api/flows.test.mjs`. **Remaining:** Reviewed account/price move-in and guarded undo exist; agent source mappings and multi-entity/balance reconciliation are missing.

135. **AGT-007 — Plan accountable account follow-up.** **Status:** missing. Present an account with a delayed delivery and an unanswered quote. Review a plan that addresses the delivery before proposing more stock, approve one message and suppress another; unanswered work stays assigned until the buyer responds or a rep resolves it. **Remaining:** Implement plan accountable account follow-up and prove the stated journey.

136. **AGT-008 — Approval-bound agent execution and provenance.** **Status:** partial. Approve a substitution proposal, change its source price and revoke its grant before execution. Refuse the stale/revoked effect, show its provenance and approval in history and execute a newly reviewed revision once after reauthorization. **Current evidence:** `src/barrow/access.ts`; `src/barrow/api.ts`; `src/barrow/orders.ts`; `tests/api/flows.test.mjs`. **Remaining:** Revocable draft-only credentials, actor attribution and account revision guards ship; proposal provenance, scoped budgets and approval-bound broader actions are missing.
