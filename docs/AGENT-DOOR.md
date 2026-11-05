# Company agents in Barrow

The installation has one shared agent door at `/mcp`, with discovery, OAuth resource metadata, signed company policy at `/api/rer/agent-policy`, and a person's review and Pause controls at `/agents`. It supports MCP 2026-07-28 and 2025-11-25. The copied runtime and published CLI are pinned to Base `940aba7afd04052fdb11f4c878e70781d7abda50` (runtime refresh after `rer-v0.2.91`; CLI remains 0.2.91).

The wholesale account operator can read an authorized account, its live catalogue, shared shopping lists and orders, validate a cart, download an order-form result and prepare a current-price draft or a structured substitution proposal under an existing owner-authorized account grant. It uses the same account, catalogue, cart and order services as the portal. Draft preparation changes reversible internal work and is classified `standard` from its actual line count; it neither reserves stock nor charges, submits, approves or contacts anyone. Its exact account, item quantities, native revision and agent/preparer identity accompany review and audit. Imported or customer text is untrusted and cannot choose policy or confer authority.

The authoritative registry is `agent-surface.json`. The native tools are `barrow.workspace.read`, `barrow.accounts.list`, `barrow.accounts.read`, `barrow.catalog.read`, `barrow.orders.read`, `barrow.lists.list`, `barrow.lists.read`, `barrow.cart.preview`, `barrow.cart.form` and `barrow.orders.prepare`, `barrow.proposals.grants`, `barrow.proposals.submit` and `barrow.proposals.read`. Every listed tool is `standard`. This CORE declaration exposes no events, resources, prompts or subscriptions. Those families return typed `capability_not_declared` refusals; resource and prompt catalogues are empty. Internal record visibility adapters remain for native authorization and retained audit, and tools return no public resource links. Use the corresponding read tool to inspect a prepared draft or proposal. Private lists remain unavailable to agents.

Business `owner_id` and team `id` bind to native operator ids through signed Business settings. An email is never a token-to-account lookup. Unknown, inactive, excluded or natively inadmissible sponsors are refused. Native bearer sponsorship is currently owner/admin only; a team member does not acquire commercial or policy administration from the roster. A Business owner is a policy owner, a Business team admin a policy editor, and a member has no policy role. Promoting somebody locally does not make them a Business editor. The native operator is reread for each call and again before an atomic mutation. Existing local seven-day draft credentials retain their scope; an account-scoped proposal credential retains its existing catalogue/order reads and structured proposal submission on MCP. A company agent must name an active native proposal grant authorized by its own sponsor; a grant id never substitutes for current native authorization. Manager/buyer decisions and proposal execution remain with people. Integration, import and provider credentials keep their existing purposes.

A person still submits and approves orders and decides native proposal, purchasing and finance approvals. The door cannot turn an agent's confirmation flag into that person's act. Device caches/scanners, connector transports, reviewed imports and installation commands stay in their own declared doors. Company tools for outreach, stock execution, refunds, role/grant changes, commercial acceptance, cutover activation and the wider proposed ct surface are not implemented by this adoption. No paid model, mail, payment or stock mutation is reachable from the declared tools. Pier is the only outbound read provider; a disconnected or refused Pier stays unavailable, without invented inventory.

The declared core covers tools, policy, Pause, audit and idempotency. The runtime and descriptor declare exactly `tools`, `policy`, `pause`, `audit` and `idempotency`. Principal authorization, owner binding, consent, current scopes and approval checks remain mandatory. Events, resources, prompts and subscriptions are undeclared; multi-sponsor, mail, resource-refresh and timed/queued lifecycle families remain unscoped and unproved. No provider `cost` is registered and the journey declares `spend: {none: true}`. Spend/byte reservations, Business issuance/delivery, provider mail and stranger completion remain separate gaps. No native Undo is offered for preparing a draft: the current native service has no exact deletion reversal. Native account fences prevent concurrent capture and restore of erased records. Owner-reviewed erasure removes native proposal content and scoped grants, and uses Base's `AgentArtifactMap` and `agentErasureStatements` in the same native transaction to redact identifier-linked calls, approvals, reviews, events, audit and usage facts. Non-personal receipt/tombstone fields and policy measures survive. Installation-private replay aliases expire at the original fixed 30-day call horizon and never enter an archive. Erasure does not reset policy usage or native lifetime caps. A peer's unrelated records stay unchanged; a shared agent is not retired merely for inspecting the account. DATA-003 remains partial: name-only free text without a native identifier or exact address is not safely selectable. External copies held by agents and their processors cannot be recalled.

For a stockist request, read the account, read its current catalogue, validate SKU quantities with `barrow.cart.preview`, and prepare exactly one draft with a stable idempotency key. Read the returned draft id with `barrow.orders.read` and tell the person that submission and supplier approval remain outstanding. A stale account revision refuses; repeat the same successful key only with identical arguments. Pause, policy changes, scope removal and sponsor/agent/consent revocation are checked before replay and before the next effect. Preserve uncertain provider outcomes for review rather than resending.

Disposable conformance uses the production signed owner-claim endpoint, first-run setup and ordinary account/list commands. Its exact-origin Pier test module validates the per-run session cookie and request Origin, returns realistic stock records. Its session-authenticated durable reservation endpoint is used only by the owner’s native fixture setup; declared tools make only Pier reads. It cannot contact other hosts. It is test tooling outside the production dependency graph and contains no production credential.

Legacy bearer HTTP is a compatibility transport into that same MCP handler. Its catalogue, account, order and shared-list reads and cart/draft/proposal commands have no direct native-service dispatcher. Both transports require an answered policy, honor Pause and current scope/revocation, and retain the same decision audit. Mutations require an explicit stable `idempotency_key` in the payload; retry only the exact payload and key. Standalone owners set policy at `/agents`; Business-managed installations adopt the signed company policy. Invoice, document, export, human approval and undeclared HTTP routes remain unavailable to these credentials. Native account usage-term acceptance still gates commercial records.

Portability retains native attribution, door audit/events and account custody history. It excludes Business settings/bindings, adopted policy, live agent admission, idempotency replay and executable approval/review handles. Restoring commercial history never grants an old agent authority or revives queued approval execution; the destination owner establishes its own policy.

The conformance fixture also invites Avery through the native email-confirmation lifecycle. Avery retains native scoped commercial reads, receives no Business policy/audit administration from the local admin role, and loses the next agent call immediately after native deactivation. No shadow person or direct database writer prepares this proof.

The connector exclusion includes the current-main INT-021 quote and price-book exchange split. Its existing scoped integration credential remains a connector door with native person application; it does not grant a company agent additional tools.

This adoption continues the existing native draft boundary. The ct surface at `18a72bffdfc636401875040be5cddb6e4926b475` proposes 110 action families, eleven resource types, seven prompts and commercial events. Its wider commercial execution requires a separate native and contract adoption. The thirteen supported tools overlap eleven cited Core clauses; no ct action-family id or SURFACE clause is promoted. Device, screen, connector, import and installation exclusions stay explicit in the descriptor.

The released rer 0.2.96 CLI runs the CORE journey in the dedicated agent-door Verify shard through normal rer verify. Runtime agent-door and Business settings source is recorded at Base 8b925fa5ffaa577df9f2e4ebab6ede8af5155baa. The harness checks unknown subjects and changed token email; signed inactive/allow-list-excluded fixture states remain undeclared. Native deactivation and local credential revocation are covered by the specialist journey. Queued continuation, mail, timed history and multiple-sponsor jobs remain outside this CORE adoption.

The connected Business pulls bounded decision projections through the signed `/api/rer/agent-decisions` door. Those projections are external custody: erasure-aware tombstone pulls and the Business authority, stop and unreachable rules purge them. The relay holds value-free decision ids and the installation Business id. The adoption backfill covers existing consented MCP audits under the current Business; it cannot reconstruct older pairing authority, and Business drops pre-join history.

## Recovering native preparation writes

Both `barrow.orders.prepare` and `barrow.proposals.submit` require a stable
`idempotency_key`. Keep the complete arguments, including any `expected_revision`,
unchanged when retrying an uncertain response. A retry uses a new JSON-RPC id and
returns the recorded preparation outcome. Concurrent identical requests can
return `call_in_progress` while the first execution is active; retry that same
key and payload to recover its completed result. Never choose a fresh key just
because the response was lost. A changed payload or expected revision under a
successful key returns `idempotency_conflict` without another preparation.

For draft preparation, `expected_revision` names the account revision read from
`barrow.accounts.read`. For proposal submission it names the original order
revision from `barrow.orders.read`. With a fresh key, an outdated revision returns
`revision_conflict` with `current_revision` and no preparation. Read current
sources and review them before starting newly keyed work. Current policy, Pause,
sponsor, scope and native proposal-grant checks still apply before replay; a
saved result grants no new authority.

The native journey's `afterStep` hook runs
`tests/agent-door/write-recovery.mjs` under autonomous and held policies. It gets
credentials and proposal fixtures through the owner's existing HTTP doors,
discards completed MCP response bodies, and reconciles recovered results with
native state, proposal history and paginated preparation audit. Concurrent
requests must leave one draft or proposal revision and one native preparation
audit effect. Native person edits supply the stale account and original-order
revision cases. The additional retention journey below qualifies local
credential retention and expiry. Long-running job handles and status isolation,
complete wider tool and role coverage, and custody across coordinated clients
remain owed by BASE-AGENT-012.


### Retention and credential expiry

A completed preparation outcome is retained for thirty days from completion.
Identical retries do not extend that horizon. A credential is still checked on
every retry: the local draft and proposal credentials expire after seven days,
and revocation, Pause and current native authority can refuse access earlier.
Retained evidence never extends a credential or grants a new permission.

`tests/agent-door/write-retention.mjs` runs the built application through public
HTTP doors under autonomous and held policies. Its disposable Worker clock moves
past 24 hours and to the last millisecond of the credential lifetime, retaining
the database and independent journal across Worker restarts. It asserts equal
saved outcomes and unchanged native records and preparation audit effects for
owner drafts, admin drafts and owner proposals. Buyer credential issuance,
non-owner proposal grants and an admin credential's proposal call are refused
without preparation. Only the external stock and mail boundaries are isolated;
no retained call, identity, grant or native record is written by the test.

After seven days, the same credentials return HTTP 401 while the outcomes remain
retained. The real scheduled handler keeps the records just before thirty days
and removes them just after that horizon, preserving drafts, proposals and
preparation audit history. Existing credentials remain expired. The test reads
the replay expiry metadata to reconcile cleanup, and never edits that metadata.
This clock-qualified local proof does not establish renewed signed Business
admission after the thirty-day horizon. No long-running job or status tool is
introduced, and no provider retention or erasure is claimed.
