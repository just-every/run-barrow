# Get started

Run Barrow on your computer, connect your existing Pier stock desk, then invite one stockist.

## Open Barrow

Open a terminal and run the two lines from the [Run page](https://run-barrow.com/run). The first installs `rer`, the Run Edit Run command, for you alone, with its own Node if you have no Node 22 or later:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
```

If the installer ends with a line to run, run it before the next step: it puts `rer` on your PATH. Then get Barrow, install everything and start it:

```sh
rer dev just-every/run-barrow
```

Already have Node 22 or later? This one line does both steps:

```sh
npx -y @runeditrun/rer dev just-every/run-barrow
```

To start it again later, run `cd run-barrow && rer dev`. Allow several minutes for the first start. The command installs the locked dependencies, selects Node 22.20.0, applies the local database migrations and prepares a local owner. Open the private `RER_OPEN` link it prints, confirm the first-run owner and open `/app` in that installation.

Keep `RER_OPEN` and sign-in links private. The local development outbox sends no external email. Stop this checkout's server with `rer dev --stop`.

For an installation with your real owner identity, run `npx -y @runeditrun/rer install just-every/run-barrow`, then from the checkout:

```sh
rer setup --owner-email you@example.com
rer dev
```

The installed root is the Lobby. Its action opens sign-in, or first-run setup until the owner is confirmed. These public guides and the Run page belong to the separate run site.

## Connect Pier

Pier needs items, sellable stock in bins and a customer party for the stockist. Receive stock through Pier's purchase order and receipt workflow. Barrow does not maintain another stock ledger.

1. Sign in to Pier as an owner or stock operator. Inspect `/api/pier/state` in that installation for the exact customer IDs and SKUs.
2. In browser developer tools, save that signed-in request's Cookie header to a private file outside the checkout. Restrict it to your user with `chmod 600 /absolute/path/pier-session.txt`. It is an expiring credential: do not commit it or paste it into a command argument.
3. Stop Barrow and run the connection helper, replacing the origin and file path with your own:

```sh
rer dev --stop
node scripts/connect-pier.mjs --origin http://127.0.0.1:PIER_PORT \
  --session-file /absolute/path/pier-session.txt
rer dev
```

Use Pier's actual port. Hosted Pier requires HTTPS. The helper checks the Pier role and saves the connection in ignored `.dev.vars`; keep that file private. Pier currently uses an operator session rather than a dedicated service credential. If it expires or is revoked, reconnect with a current session. Approved requests remain available for recovery.

## Invite a stockist

In Accounts, choose **Add trade account**. Use the exact Pier customer ID, agreed SKU prices, minimums and terms. Then choose **Send invitation**. Follow the [accounts guide](ACCOUNTS.md), then [take the first order](ORDERS.md).

To exercise invitations locally, first sign the supplier in through the ordinary email flow: start with `rer dev --login`, open `/signin` in the installation and read the newest message from the private outbox printed by `rer outbox`. Open the customer's invitation in a separate browser profile. Invitations sent from the automatic development identity also need the local key gate in the recipient profile; the ordinary email session exercises the usual flow. Hosted invitations use the configured mail provider.
