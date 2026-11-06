# Barrow QBO foundation — sx-barrow-c-f69

Product repository: just-every/run-barrow. Branch: cloud/sx-barrow-c-f69. Pushed and read back at **892803c0552e47aaf5c77d9e2f576a3db398d1f7**. No PR was needed: this repository starts Verify on branch pushes. Main was never changed.

INT-002 moves **MISSING → PARTIAL**. Counts change from **73 DONE / 43 PARTIAL / 38 MISSING** to **73 DONE / 44 PARTIAL / 37 MISSING**, total 154. Only INT-002's plan evidence and remaining-work row needs updating. No acceptance sentence, other clause status, homepage, logo, Base pin or workflow changed. All 154 parent Status rows remain in every product commit; pipe-row count remains 178. No test registration was added or removed; the existing cap remains 200.

## Completed plan

1. Read the target and inherited statement, finance, audit, diagnostics, exception and retention duties, plus the supplied rulings and DONE riders. The starting repository had no QBO adapter. Native issued invoices, financial sources and independent erasure journals supplied the foundation.
2. Add explicit signed-in-owner OAuth consent, expected company and environment selection, one-use session-bound callback state, encrypted server token custody, refresh, disconnect and independent revocation fencing. Deploy configuration declares optional client secret bindings; no real credential or provider account was used.
3. Read and review customer, item, account and tax-code source references. Bind native customer revisions and source versions, refuse stale mappings and prevent reassignment of recorded financial custody. Account and tax-code labels confer no tax or write authority.
4. Add bounded 50-invoice pages, stable correlations and resumable checkpoints. Failures preserve the prior checkpoint. Normalize opaque source IDs, exact money and dates; discard names, contacts and narratives. Unmapped customers refuse the page before retention. Complete observations are dated current balances, not historical reconstruction.
5. Link existing native invoices without overwriting them. Show source-linked conflicts for changed totals, currencies, dates, missing references and balances. Carry per-currency comparisons into buyer statements, CSV and PDF, and staff finance pages and CSV. Add attributed audit, actionable diagnostics and durable owned exceptions. A newer source revision creates fresh owned work; fresh matching evidence resolves earlier discrepancies.
6. Extend latest-event financial floors, explicit owner erasure review, legal holds, custody disclosures and independent-journal restore fencing. Portable archives exclude OAuth credentials. Independent R2 authority prevents a D1 credential rewind from restoring revoked read access.
7. Extend existing public-door statement and pricing sanity journeys, retaining their existing assertions. Inspect the changed screens at 1440 and 390. Run typecheck, relevant regressions, first-party checks, deployment-spec check, Base-copy integrity, contract generation and source-lock checks. Preserve a first real save, merge current main before the candidate, then push the named branch.
8. Publish actual non-secret reports, receipts and browser captures separately on the evidence ref. Leave publication scanning, generated-view commits and guarded landing to the Mac lander.

## Public-door proof and frozen native rubric

The API registration is `./tests/api/statements.test.mjs:6`, “PAY-007: a dated statement of invoices with opening and closing balances by currency, as JSON, CSV and PDF, for the buyer even after hold and close”. It invokes `qboAccounting` in `./tests/api/qbo-accounting.mjs`. The browser registration is `./tests/journeys/pricing.test.mjs:14`, “supplier schedules a complete book and dated USD basis, buyer keeps CAD documents, and reports show the recorded conversion without changing cents”. It invokes `qboBrowser` in `./tests/journeys/qbo-accounting.mjs:6`. Both pass on the exact pushed head. Only external Intuit authorization and API traffic are simulated; native identity, commands, invoices, Pier, reports, audit, erasure and archive transport are real.

| Rubric | Native outcome | Proof and result |
| --- | --- | --- |
| R1 | Explicit owner consent and company-bound OAuth | API helper lines 7–14: buyer refusal, foreign company refusal, correct callback, consumed-state replay refusal. Browser helper lines 8–18: actual Settings consent and public callback. MET. |
| R2 | Server custody, token refresh and revocation | API helper lines 12–14 and 63–69: expiring access token refreshes once; archive omits actual sealed credentials; disconnect reports provider acknowledgment; restoring the old D1 connection row causes public reference reads to refuse before any outbound request. MET. |
| R3 | Reviewed references and current native authority | API helper lines 14 and 51–53; browser helper lines 19–26: all four kinds mapped, stale account revision and stale source token refused. Other-company and agent reads refused. MET. |
| R4 | Bounded interrupted reads and safe replay | API helper lines 15–22: 50 observations, next position 51; provider 503 leaves 51; resume completes the same correlation without a second observation set. Incomplete reads produce no dated comparison. Browser helper lines 27–30 shows interruption and recovery. MET. |
| R5 | Source linkage and conflicts without native financial changes | API helper lines 23–45: exact existing invoice link; second source reuse refused; upstream total and currency changes remain conflicts; native order and issued invoice remain byte-equivalent through their public reader. MET. |
| R6 | Exact dated comparisons in every assigned format | API helper lines 27–45: native 13000 USD and ledger 13000 match; later 7500 ledger cents produce a 5500-cent difference; currencies stay separate; statement JSON, CSV and PDF and finance JSON and CSV carry source IDs. Browser helper lines 31–36 shows the actual statement, finance and balance-conflict screens. MET. |
| R7 | Audit, diagnostics and owned exception lifecycle | API helper lines 18–20, 39–50 and 70: safe resume diagnostics with owner and correlation; repeated refresh creates no duplicate for the same source revision; failed contact retains open work; human resolution retains attribution; a newer revision creates fresh work; fresh matching evidence resolves earlier discrepancies; audit search CSV contains mapping, link and disconnect events without credentials. MET. |
| R8 | Financial retention, custody, reviewed erasure and restore | API helper lines 54–62: QBO event extends native order floor to 2035-02-28T12:34:56.789Z from the leap-day source instant; legal hold refuses erasure; explicit owner release and typed erasure preserve required financial history; old archive plus later independent journal retains the erased-customer tombstone and does not restore credentials. Existing retention regressions preserve expiry, cutoff, hold and journal assertions. MET for this read-only slice. |

Full sandbox and financial-write outcomes are UNMET-EXTERNAL or future owed work, not claimed as native rubric completion or full INT-002 DONE.

PROBE INT-002 OAuth: owner consent for company 123456, wrong-company callback and buyer callback → 403; correct owner callback → 303; replay → 403.
PROBE INT-002 custody: expired access token → one server refresh; disconnect and old D1 credential rewind → 409 and zero new QBO requests.
PROBE INT-002 mappings: current Customer, Item, Account and TaxCode review → saved mappings; changed native revision or stale source token → refusal.
PROBE INT-002 resume: 50 invoices then HTTP 503 → checkpoint 51 retained; explicit same-correlation resume → complete, 50 observations, no duplicate set.
PROBE INT-002 reconciliation: source 100 linked to a 13000-cent native invoice → matched; second source or changed total → refused link; issued native invoice unchanged.
PROBE INT-002 comparisons: dated buyer statement and finance report → exact 13000-cent match, then 5500-cent difference; source IDs in page and downloads; CAD mismatch remains separate from USD.
PROBE INT-002 operations: public diagnostics and follow-up refresh → stable correlation, owned open exception after failed contact, attributed acknowledgment, fresh work on newer source revision and closure only after current matching evidence.
PROBE INT-002 erasure: held request → refusal; owner release and reviewed ERASE → attributed receipt, preserved financial floor; old archive with later journal → erased customer remains fenced and credentials absent.

## Verification and custody

Exact-head local commands passed:

- `node --test --test-concurrency=1 tests/api/statements.test.mjs`: 1 registration, includes the full QBO API scenario.
- `node --test --test-concurrency=1 tests/journeys/pricing.test.mjs`: 1 registration, includes the QBO browser scenario and captures at 1440 and 390.
- Typecheck, `rer check --profile first-party`, deployment specification check, edition lock freshness and offline Base-copy verification passed.
- Existing finance, diagnostics and follow-up tests were rerun on this head; their actual result is in the attached regression receipt. Existing retention tests were exercised during the build: six passed in the touched run; one exposed an accidentally replaced payment-custody disclosure, which was restored without altering any assertion, and that test then passed. The new QBO API scenario separately exercises current retention and independent-journal integration on this exact head.

MECHANICAL lock=`node scripts/edition-authoring/cli.mjs lock` then `check` exit=0; views=`node scripts/contract-docs.mjs write` then `check` exit=0; ledger=`python3 check-migration-ledger.py` exit=0. The ledger check compares every parent migration's actual bytes and proves 76 unchanged migrations plus appended 0077. Real native archive and restore tests apply the new schema. Source lock SHA-256: 5b5407e01ee220194dda42675a4c46682c6aa42734958826bb532abe9f63f791.

Generated ACCEPTANCE.md and docs/CLAIMS.md were restored whole from origin/main and never committed. Their exact-head check is intentionally stale. Verify **42206469379**, event push, exact head 892803c0552e47aaf5c77d9e2f576a3db398d1f7, completed **failure** at the first contract-docs command. The inspected agent-door job **127854330419** and pricing-bearing barrow-3 job **127854330401** both report `Error: ACCEPTANCE.md is stale; run node scripts/contract-docs.mjs write.` All eight shard source-lock steps succeeded; all begin with that same generator check. Remaining tests in those jobs did not run. The aggregate failure follows the shard failures. This is the brief's expressly permitted generated-view exception, not a green full-suite claim. No workflow was edited, dispatched or rerun.

Current main ea7da76336fa80405ed3f57d2e93fe19417fa08e has successful Verify 42123930211 and successful Run site 42033729505. Main is not the candidate. Candidate publication scan and candidate Run site are NOT RUN here; the cloud brief assigns them to the guarded Mac lander. No COMPLETE scan or landed-main receipt is invented.

## DONE riders and remaining boundary

No DONE claim is made. Riders 1 and 3 remain unmet for the complete sandbox and financial-write clause; native slice outcomes have the public-door proof above, while branch jobs stop at the permitted generated-view check. Riders 2, 4 and 8 have seeded allowed and refused cases and exact-head native proof. Rider 5's receiving duties remain written in the original clause. Rider 6 retains an honest PARTIAL Gap and locally proven generation; generated views are intentionally left to the lander. Rider 7 has no acceptance rewrite. Rider 9 retains all provider and legal boundaries. Rider 10 uses the standing conservative owner-only floor and counts no DONE. Rider 11 remains the Mac lander's publication, exact-main and Run site receipt.

Pre-ready check: no existing assertion was removed, narrowed or hidden; revoked credentials and erased account authority are fenced; repeated reads and source exceptions do not fabricate financial effects; changed controls have text labels, no icon-only actions, and minimum text checks at desktop, with desktop and phone captures. Settings holds connection configuration. Current source lock and local checks pass. Public scanning and landing remain unestablished in cloud.

The full QBO sandbox consent and invoice, partial-payment, return-credit, replay and revocation receipt require the local held-key run. Client credentials being HELD is not company authority, redirect registration, consent or a live provider receipt. Creating invoices at chosen billing events, credit-memo writes, verified payment and credit synchronization into native balances, full functional finance reconciliation delegation and complete receiving duties remain owed. Provider erasure is not claimed. PAY-003, PAY-004, PAY-005, PAY-010 and all tax and provider holds retain their own judgments.

Product commits and evidence publication are separate custody. This packet belongs only on evidence/sx-barrow-c-f69. The product branch contains implementation, migration, tests, contract status and product documentation, not these execution receipts.
