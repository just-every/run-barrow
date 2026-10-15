# Barrow

A wholesale ordering portal for an Australian maker or wholesaler. Trade customers see their own prices and minimums. A supplier reviews an order, **Pier reserves the stock**, and Barrow exports an invoice CSV on the customer's terms. MIT licensed.

## Run locally

```sh
git clone https://github.com/just-every/run-barrow.git
cd run-barrow
rer dev
```

Without `rer`, install the CLI once with `npx -y @runeditrun/rer@0.2.21 cli install` and add `$HOME/.local/bin` to PATH. `rer dev` installs the locked dependencies, selects Node 22.20.0, applies D1 migrations and prepares a local owner. Allow several minutes. Open its private `RER_OPEN` link, complete first-run setup and open `/app`. Local development suppresses external email. Use `rer demo` for a fresh, populated workspace. Keep sign-in links private. `rer dev --stop` stops this checkout's server.

For a real owner installation, run `rer install`, then `rer setup --owner-email you@example.com`, then `rer dev`. Local review uses the private automatic sign-in link.

## Public site and guides

The separate run site is built with `rer build --site` into `dist/site`. It introduces Barrow at `/`, provides the install-and-run instructions at `/run`, and renders the [owner guides](docs/README.md) from repository Markdown at `/docs`. An installed checkout keeps the Lobby at `/`. Site publishing is disabled until the run-site gate sets `RUN_SITE_DEPLOY=true`.

## Connect the stock desk

You need an existing [Pier](https://github.com/just-every/run-pier) installation with items, sellable stock in bins and a customer party. Barrow does not create a second stock ledger. Pier compatibility is exercised against commit `dcd4c5916a96b3237eafbec6abd6591df5c75dcd`.

1. In Pier, sign in as an owner or stock operator. Open `/api/pier/state` to find exact customer IDs and SKUs. Use Pier's normal purchase order / receipt workflow to receive stock.
2. Save that signed-in request's **Cookie header** from browser developer tools in a private file outside the checkout. It is an expiring credential; give it mode `0600` with `chmod 600 PATH`. Never commit it or paste it into a command argument.
3. Stop Barrow, then connect it:

```sh
rer dev --stop
node scripts/connect-pier.mjs --origin http://127.0.0.1:PIER_PORT --session-file /absolute/path/pier-session.txt
rer dev
```

Use Pier's actual origin and port. Hosted Pier requires HTTPS. The helper checks Pier's current role and stores the connection only in ignored `.dev.vars`. Keep that file private. If Pier expires or revokes the session, reconnect with a current session; Barrow reports the failure and retains approved requests for recovery. Pier does not yet offer a dedicated service credential. Customers never receive the Pier session or its full business state.

## Do the first jobs

- **Accounts:** add a name, lowercase customer email, exact Pier customer ID, terms, minimum order cents, and SKU prices. Prices are integer AUD cents; quantities are whole sell units. Use **Send invitation**. Local demo invitations complete without delivery. Hosted installations deliver invitations through the configured mail provider.
- **Customer Catalogue:** enter quantities and a PO reference, prepare a draft, then review and submit it in **Orders**. Other accounts and prices are inaccessible to the customer.
- **Supplier Orders:** review the fixed prices and terms, then approve. Pier makes the reservation. A fully reserved order offers an invoice CSV. A shortfall needs attention in Pier; reserve the remainder there, then **Refresh stock status** in Barrow. A lost response offers **Retry stock reservation**, using the same durable Pier command ID. Never create another order to recover the first one.
- **Move in:** upload [the documented-shape fixture](fixtures/trade-accounts.csv), run a dry run, review the plan, apply it and inspect its journal. Repeated requests resume the same job. Undo preserves native edits and refuses accounts used by orders. Replace the fixture's Pier IDs before placing orders. Details: [move-in format](docs/MOVE-IN.md).
- **Data:** issue a seven-day agent credential for [catalogue and prepare-order commands](docs/AGENTS-API.md), revoke it, or erase an unused trade account. Agents cannot submit, approve, import, erase or export invoices. Approval identities remain on orders and in the audit table.

No tax is computed or added. The CSV is a handoff to the existing accounting system, with SKU amounts, issue/due dates, stable invoice number and exact cents. Review its tax treatment there. CSV downloads do not collect money or mark an invoice paid. A backup restored for continued operation must reconnect to the same Pier origin; existing orders refuse a different one.

## Back up and restore

Stop the running app before these local operations:

```sh
rer dev --stop
rer export --output exports/barrow.rer
```

Restore into a new empty checkout with `rer import --input /absolute/path/barrow.rer --yes`, then `rer setup` and `rer dev`. Archives include accounts, prices, orders, approval history, move-in custody and erasure journals. They exclude login identities/sessions, agent credentials, local mail and private connection settings. Invite users and reconnect Pier in the destination. Export/import/export equality is tested through the same Base portability service used by the CLI.

After erasure, make a newer export. When restoring an older archive into a fresh store, pass it as `rer import --input OLD.rer --journal NEWER.rer --yes`. The later journal refuses the whole pre-erasure archive. Protect and retire old backups according to your retention policy. An account with orders cannot be erased in this release; Base sign-in identities and Pier records have separate custody. `rer reset --yes` destroys this checkout's local state and settings.

## Deploy to your Cloudflare account

Run `rer deploy --dry-run` to validate and build without provider calls, then `rer deploy` for the actual owner-account deployment. Tests are separate from build and deploy. [deploy.json](deploy.json) declares the Worker and D1 resources and the required environment inputs.

Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for your account, and provide the secret sources named in `deploy.json`: `OWNER_EMAIL`, `SESSION_SECRET`, `SETUP_TOKEN`, `MAIL_API_KEY`, `PIER_ORIGIN`, `PIER_SESSION`. Use private environment storage, never source control. Set `MAIL_FROM` in `deploy.json` to a verified sender for the declared Resend provider before deployment. The deploy kit creates resources, applies migrations, sets the actual `AUTH_ORIGIN` and checks health. It does not require a Barrow domain. This round makes no live provider call or production deployment claim.

## Development

`rer check --profile first-party` checks the command contract. Before running Verify locally, install the pinned browser with `pnpm exec playwright install chromium` (Linux may also need `--with-deps`). `rer verify` builds, typechecks, runs the small HTTP/D1 integration suite including email-link confirmation at the mail provider network boundary, and checks hosted assets. The tests obtain pinned public Pier source under `.cache/pier-source`; this is test infrastructure, never a production stock fallback. CI runs one Verify workflow per push. See [ACCEPTANCE.md](ACCEPTANCE.md), [source lineage](docs/SOURCES.md) and [command contract](SEED-COMMAND-CONTRACT.md).
