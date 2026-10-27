# Card payments

The installation owner connects the merchant's Stripe account in Data → Payment settings. Select the mode that matches the key, record a reason and explicitly accept Stripe's separate custody. The server verifies the merchant and mode, creates the signed webhook endpoint and encrypts both secrets with the installation secret. Settings show configuration only. Disconnect revokes that endpoint and removes local connection credentials; archives omit connection credentials.

For a fully reserved, approved order with an issued invoice, its authorized company finance buyer opens Orders → Card payment. Stripe hosts card entry. On return, Refresh card and payment retrieves the card's verified funding and billing state. The buyer reviews the original order amount, surcharge and exact total before explicitly authorizing it. Bank authentication, authorization, capture, decline and cancellation have separate results. Only the supplier owner or admin captures or cancels; each decision requires a reason. Refresh and capture recovery keep the same payment and durable Stripe idempotency identities. No redirect parameter proves payment.

A surcharge requires a US merchant, USD, verified credit funding, a billing state matching the agreed destination, and an owner-reviewed state allowlist. Debit, prepaid, unknown funding and unresolved jurisdictions get zero surcharge. Connecticut, Maine, Massachusetts and Puerto Rico are refused. The merchant must review applicable state and network permission and actual processing cost before choosing a rate; the configured ceiling is three percent. Barrow never adds a surcharge to the original invoice snapshot.

Captured receipts remain unapplied to individual invoices. Statements show a dated surcharge assessment and full card receipt, with the same opening and closing balances in the page, CSV and PDF. Other payment types and allocations remain with their receiving clauses. Verified declines create an owned next action. Refresh, contact attempts and a typed resolution cannot close it without verified provider resolution.

Card financial events extend commercial retention by seven UTC calendar years, with February 29 clamped to February 28. Owner review, retention expiry, holds and the independent erasure journal still apply. Erasure removes masked card details and reusable payment references; required amounts, opaque provider IDs and events remain. Stripe holds separate copies; no provider erasure is claimed. Restored records cannot initiate provider operations.

The authorized local sandbox journey is `tests/journeys/card-stripe-sandbox.mjs`. Run it through the named secret injector and shared heavy slot after building the app. It uses real hosted Stripe checkout, bank authentication and signed events through a temporary tunnel, and removes its webhook endpoint when it finishes. Its screenshots belong outside this public repository. API tests fake only Stripe's network boundary. No live credential is used by the acceptance journey.

The credit-refund sandbox segment supports a held test merchant without a US surcharge policy: set `BARROW_SANDBOX_SURCHARGE_BPS=0`, `BARROW_SANDBOX_CASES=credit` and `BARROW_SANDBOX_CREDIT=true`. The default remains the reviewed 200 basis point surcharge. The journey requires a public webhook tunnel with a registered connection before it connects Stripe; a URL in a failed tunnel request does not establish readiness. A host without callback ingress leaves the live refund and signed replay proof pending.


## Account credit

A captured card receipt reduces credit exposure only after finance explicitly allocates its verified principal to the source invoice. Unapplied captures remain separate. Applied credit notes reduce the original debt once; an open commitment and its later invoice are never counted twice.

From an authenticated session, send `credit.policy` to `POST /api/barrow/commands` with `accountId`, the current account `revision`, `termsDays`, ISO `currency`, `limitCents` and a recorded `reason`. Zero days means due on receipt; a zero limit permits no unpaid exposure. The installation owner, admin or currently entitled finance person must authorize the amount. Existing accounts retain their prior terms until a policy is configured.

`GET /api/barrow/credit-exposure?accountId=ACCOUNT` returns current availability and source amounts. The optional `orderId` excludes that order while reviewing its admission. A USD 10,000 limit with USD 3,000 owed permits USD 7,000 more; an USD 8,000 draft stays blocked until a verified allocation reduces the debt or finance approves the exact excess.

Finance records an exception with `order.credit-exception`, the current `orderId` and `revision`, and a nonempty `reason`. Its authority and financial basis are rechecked at admission. A changed balance, policy or revoked grant requires fresh review. No exception collects funds or reserves stock by itself. The staff audit retains the decision; buyers and agents cannot read it.

Checkout shows credit before the reviewed order. The finance report and its CSV show current exposure and source orders at the read time, separately from historical invoice aging. Amounts stay in their original currency; unresolved debt in another currency blocks admission rather than inventing a conversion. Deposits remain PAY-003’s separate capability.
