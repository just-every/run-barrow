# Agent prepares; person approves

In the supplier Data page, create a seven-day agent credential. Save it in a private `0600` file outside the checkout. It is shown once, stored only as a SHA-256 digest and revoked when its issuing operator loses authority or when that operator revokes agent credentials.

```sh
node scripts/barrow.mjs catalogue --origin http://127.0.0.1:BARROW_PORT --token-file /private/barrow-token.txt --account cedar
node scripts/barrow.mjs prepare-order --origin http://127.0.0.1:BARROW_PORT --token-file /private/barrow-token.txt --input /private/order.json
```

`order.json` contains an existing account ID, an optional customer reference and SKU quantities:

```json
{"accountId":"cedar","reference":"PO-October","lines":[{"sku":"OAT-1","quantity":2}]}
```

Prices, minimums, terms and Pier IDs come from current server records. The agent may read supplier-visible accounts and stock and prepare a draft. There is no agent approval command. A customer or supplier reviews and submits the draft in Orders; a supplier then approves. The server records `preparedBy`, `submittedBy`, `approvedBy`, `approvedAt`, the commercial snapshot and the returned Pier reservation.

The HTTP doors are `GET /api/barrow/catalogue?accountId=ID` and `POST /api/barrow/commands` with `{type:"order.prepare",payload:...}` and a Bearer credential. Browser mutations require a current Base session and same-origin request. Unknown commands and unauthorized cross-account reads fail closed.
