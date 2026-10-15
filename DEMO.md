# Barrow Demo

`rer demo` starts a fresh, signed-in supplier workspace. Open its private `RER_OPEN`
link; `rer demo --stop` deletes that session's data. Normal `.wrangler/state` is
unchanged. The nav and title say **Barrow Demo**, with no bar or outbox.

The idempotent `src/demo.ts` hook inserts twelve Australian trade accounts and
24 orders with agreed SKU prices, payment terms and invoice history. It builds
on the Cedar Street Pantry fixture; dates are relative to the start time.

Base's demo guard permits public reads, while effects reaching people or accounts
return success without sending. Barrow's private Pier integration uses
`demoEffect(real, providerSuccess)` for stock observations and reservations.
Its fixed supplier response is in `src/barrow/demo-pier.ts`; it creates no stock
ledger and never connects to a real Pier account. Preparing, submitting,
approving and downloading an invoice still use Barrow's real records and routes.
Invitations and sign-in links use Base's development mail sender under `RER_DEMO`,
so they complete without credentials or delivery. Outside demo mode mail uses
the configured provider.

The runtime modules under `src/modules` are exact copies recorded by Base's
`record-base` in `base-copies.json`, all from `rer-v0.2.24`. Historical applied
migrations retain their original provenance in `composition.lock.json`.
The CLI remains the exact npm package pin in `package.json` and `pnpm-lock.yaml`.

`deploy-demo.json` declares the hosted name and required plain MAIL_FROM and MAIL_PROVIDER settings.
Run the **Run demo** workflow by hand in the `run-demo` GitHub environment:
`test_only=true` uses `demo.test.run-barrow.com` with published Turnstile test
keys; `remove=true` removes that selected host and reads its resources back.
The ordinary dispatch uses real Turnstile keys for `demo.run-barrow.com`.
Each visitor gets its own container, ended after 60 minutes or 15 minutes idle.
Production uses Base's signed `/auth/owner-claim`, with per-container keys.

Test-host deployments observe admissions for 15 minutes and upload a
`demo-observation` artifact. Start a timing cohort only when that observation
contains no unrelated visitors. Production deployments do not run this observation.
