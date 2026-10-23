# Reviewed substitution proposals

An external agent can propose complete replacement baskets for an accepted,
unshipped USD order. Barrow validates the account assortment, owner-approved
original-to-replacement SKU mappings, units, quantities, current inventory,
minimums and configured delivery options. It ranks eligible baskets by total
price, lowest first, and records their merchandise and freight differences.
Tax is unknown until a tax provider exists. Quoted orders and orders carrying
sales-terms acceptance, and accounts with assigned sales terms, are refused by this proposal door; their acceptance
cannot be silently replaced.

In **Data → Approve an agent’s substitution scope**, the signed-in owner chooses
one account, approved replacements, reported-cost and contact limits, and an
explicit consent reason. The resulting private credential expires in seven
days. It can read only that account’s catalogue and orders, and submit proposals.
It cannot submit an order, offer a basket, accept, execute, export or erase.
The separate existing draft credential retains its draft-only permissions.

The grant binds the current account revision. Any account edit, owner authority
change, expiry or revocation requires a fresh grant. Barrow makes no model calls;
the model/run identifiers and external inference costs are self-reported. The
reported-cost admission cap cannot limit inference bought independently by the
external agent. Three contact allowances are reserved before an offer, covering
the review and potential confirmation emails. Reservation is conservative and
not refunded. It grants no automatic outreach or stock authority.

In **Orders → Agent substitution proposals**, a manager reviews one exact basket
and records a reason. Functional managers need the account, all warehouse rights,
and sufficient commercial and stock exception limits. The buyer then accepts or
declines through the normal substitution review. A signed-in manager separately
executes the accepted basket. Current grant, manager and buyer authority, source
prices, inventory, units and delivery are checked again. A direct substitution
execution or replacement approval cannot bypass the proposal’s guards.

Execution uses the approved proposal revision’s recorded key and the existing
durable Pier release and replacement identities. A lost acknowledgment remains
pending and offers **Retry approved replacement**. Repeating the key does not
reserve again, create another confirmation or send another email. Revocation
pauses any remaining handoff; it never pretends to undo a confirmed external
effect. Started handoffs must be recovered, not withdrawn.

For an unexecuted stale or declined offer, explicitly withdraw it with a reason.
Its approval history stays; only an unreserved replacement is superseded. The
agent may then submit the next numbered revision under a current grant. All
provenance, sources, approvals and safe refusal reasons remain inspectable.

Document bytes, prose instructions, prices and permissions are not agent tool
arguments. Strict typed fields and native source reads control effects. A PO
attachment contributes only its recorded SHA-256; the agent cannot make Barrow
read or execute document instructions. Barrow makes no model-provider call. The external agent can read the one
account the owner explicitly granted, and it and any inference processor have
separate custody. Scoped credentials cannot download PO bytes.

## HTTP doors

People use their ordinary same-origin sign-in. The owner creates a grant at
`POST /api/barrow/proposal-grants` with `accountId`, `costLimitCents`,
`contactLimit`, `approvedSubstitutes: [{fromSku, skus}]`, `consent: true` and
`reason`. The response includes the private token once. List its account’s
masked history with `GET /api/barrow/proposal-grants?accountId=…`; revoke with
`POST /api/barrow/proposal-grants/revoke` and `grantId`, `revision`, `reason`.

The scoped bearer sends `/api/barrow/commands` type `proposal.submit`:

```json
{
  "orderId": "B-00001",
  "model": "owner-configured-model",
  "runId": "external-run-42",
  "reportedCostCents": 0,
  "candidates": [
    {"lines": [{"fromSku": "ORIGINAL", "sku": "APPROVED-REPLACEMENT", "unit": "case", "quantity": 8}]}
  ]
}
```

Each candidate includes every original line, unchanged or replaced; specify
`fromUnit` when the original SKU has several selling units. Optional `methodId`
and `warehouse` select an eligible priced delivery. One to five candidates are
accepted. For a revision, also supply the withdrawn proposal’s `id`, `number`
and `revision`.

Signed-in managers use `proposal.offer` with `id`, `number`, `revision`, a
zero-based `candidate` and `reason`; `proposal.execute` with the same identity
and recorded `idempotencyKey`; or `proposal.withdraw` with a reason. Staff read
`GET /api/barrow/orders/<id>/agent-proposals` for source and approval history.
Buyers use the existing substitution accept/decline commands.

Grants and credentials never enter installation archives. Proposal history
restores as superseded and cannot execute or resend mail. Owner-reviewed account
erasure revokes scoped access even under a hold; released erasure removes the
proposal details, consent and diagnostics while retaining financial snapshots
and opaque commercial audit attribution. The independent journal re-applies
that disposition after an older restore.
