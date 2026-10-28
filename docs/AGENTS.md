# Company agents in Barrow

Barrow's shared agent door currently supports **reading authorized trade
accounts, wholesale orders and shared shopping lists**. It does not expose
commercial mutations, personal approvals or queued sends through MCP.

Connect an MCP client to this installation's `/mcp` endpoint. Discovery uses
`/.well-known/oauth-protected-resource/mcp`; the native `/agents` page shows the
adopted company policy, agent activity, reviews and Pause. Business access tokens
are short lived, audience bound and consent bound. The Business subject maps to
a current native operator ID through signed Business settings; an email address
never selects a sponsor. The installation uses its existing owner-claim trust.
Business owner maps to the installation owner; team admin maps to native admin;
team member maps to native member. Existing native role restrictions remain in
force. A local admin does not acquire Business policy editing authority.

The tools are `barrow.accounts.list`, `barrow.accounts.read`,
`barrow.orders.list`, `barrow.orders.read`, `barrow.lists.list`,
`barrow.lists.read` and `barrow.events.list`. The static declaration and its
public-door journey are in `agent-surface.json`. Account and shared-list records
are resources at `barrow://accounts/{id}` and `barrow://lists/{id}`. Imported
record text is untrusted. Missing and restricted resource reads have the same
response. Every read passes through the shared policy and audit machinery.

Existing local seven-day draft and account-scoped proposal credentials keep
their documented HTTP jobs. Their MCP scope permits only the existing native
order read. A proposal credential still reads only its granted account. Native
revocation or expiry stops its next read. A failed recognizable Business token
never becomes a local token. A person uses their native session and same-origin
controls for policy, review and approval decisions.

Device, connector, import and installation doors remain separate native jobs.
No provider cost is registered, and the journey uses the shared no-spend policy.
No native mutation, reversal, access escalation or commercial completion is
claimed by this initial registry. The specialist prompt asks for native source
citations and a person handoff for changes.

## Remaining adoption dependency

The selected Base runtime does not give `ToolContext` the authorizing consent
or an execution identifier. Barrow's quote mail and scheduled report workers
must retain that exact authorization and recheck sponsor, agent, consent and
Pause before a later provider effect. A caller cannot supply that authority.
Those tools remain absent until Base provides a supported execution-context
and queued-effect admission hook. The current read journey does not prove
queued revocation, native mutation replay, self-escalation or native Undo.

The setup manifest retains its actual setup-token owner lifecycle at
`/auth/bootstrap`. Verification drives native owner bootstrap, first-run setup,
account save, shared-list save and draft preparation through production HTTP.
Only the inventory provider edge is replaced by the contained test module; its
exact origin and synthetic request are checked there. It has no production
credential or application bindings. No production mock or test route is used.

The pinned conformance network bridge also refuses the native Pier read before
the declared edge module runs: the isolated worker answers HTTP 403 `Invalid
Origin header` to the native GET carrying its supplier Origin and Cookie. That
prevents the production owner initializer from preparing its real source-priced
draft. The request validation remains enabled; no alternate native code path or
fake order is used to make verification pass.

## Runtime and command pins

Runtime source is recorded in `base-copies.json` at Base
`d555e789cffb744a9f83d76ebe42a2e3bdd7a055`. Apply the three new additive migrations
through the ordinary installation migration runner; never replace applied SQL.
The published command dependency is `@runeditrun/rer@0.2.85`, which understands the
Business manifest. That release does not contain this agent verifier.

Until the matching CLI is released, CI reads the exact Base source archive and
runs its `bin/rer.mjs verify --no-queue`. `bin/rer.mjs` is the direct CLI entry:
the global launcher delegates to the checkout's installed package pin. The
complete native verification target remains in that command; a failed agent
journey retains its normal failure exit. For touched local iteration after a
production build, the same CLI's `cli/agent-door.mjs` runs just the agent stage.
The read registry remains an incomplete adoption even if that stage passes.
