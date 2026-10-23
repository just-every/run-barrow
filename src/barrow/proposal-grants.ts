import type { Bindings } from '../auth.server'
import { audit, changed, commit, digest } from './access'
import { account } from './accounts'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { fail, integer, text, type Actor } from './model'

type ApprovedSubstitutes = { fromSku: string; skus: string[] }
export type ProposalGrant = {
 id: string
 tokenId: string
 authorizerId: string
 authorizerVersion: number
 accountId: string
 accountRevision: string
 allowedSubstitutes: ApprovedSubstitutes[]
 state: 'active' | 'revoked'
 revision: string
 expiresAt: number
 costLimitCents: number
 spentCostCents: number
 contactLimit: number
 spentContacts: number
 reason: string
 createdAt: string
 revokedAt: string | null
 revocationReason: string | null
}
type CreateProposalGrant = {
 accountId: string
 costLimitCents: number
 contactLimit: number
 approvedSubstitutes: ApprovedSubstitutes[]
 consent: true
 reason: string
}
const week = 7 * 86400000
const exact = (value: unknown, name: string) => {
 const result = text(value, name)
 if (result !== value || /[\u0000-\u001f\u007f]/u.test(result)) fail('INPUT', `Use an exact ${name.toLowerCase()} without surrounding whitespace or control characters.`, 400)
 return result
}
const owner = (actor: Actor) => {
 if (actor.agent || actor.role !== 'owner') fail('FORBIDDEN', 'Only the signed-in owner may grant or revoke agent proposal authority.', 403)
}
const counter = (value: unknown, name: string) => integer(value, name, 0, Number.MAX_SAFE_INTEGER)

/** Attribution remains readable after expiry, bearer revocation or account removal. */
export async function readProposalGrant(db: D1Database, grantId: string): Promise<ProposalGrant | null> {
 const row = await db.prepare('SELECT * FROM bw_agent_proposal_grants WHERE id=?').bind(grantId).first<any>()
 if (!row) return null
 return {
  id: row.id, tokenId: row.token_id, authorizerId: row.authorizer_id, authorizerVersion: row.authorizer_version,
  accountId: row.account_id, accountRevision: row.account_revision, allowedSubstitutes: JSON.parse(row.allowed_substitutes),
  state: row.state, revision: row.revision, expiresAt: row.expires_at,
  costLimitCents: row.cost_limit_cents, spentCostCents: row.spent_cost_cents,
  contactLimit: row.contact_limit, spentContacts: row.spent_contacts,
  reason: row.consent_reason, createdAt: new Date(row.created_at).toISOString(), revokedAt: row.revoked_at, revocationReason: row.revocation_reason,
 }
}

function approvedMap(input: unknown): ApprovedSubstitutes[] {
 if (!Array.isArray(input) || !input.length || input.length > 200) fail('INPUT', 'Approve between one and 200 original-SKU substitution rules.', 400)
 const seen = new Set<string>()
 return input.map(row => {
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['fromSku', 'skus'].includes(key))) fail('INPUT', 'Each substitution rule needs an exact original SKU and replacement SKU list.', 400)
  const fromSku = exact(row.fromSku, 'Original SKU')
  if (seen.has(fromSku) || !Array.isArray(row.skus) || !row.skus.length || row.skus.length > 200) fail('INPUT', 'Approve each original SKU once with between one and 200 replacement SKUs.', 400)
  seen.add(fromSku)
  const skus: string[] = row.skus.map((sku: unknown) => exact(sku, 'Replacement SKU'))
  if (new Set(skus).size !== skus.length || skus.includes(fromSku)) fail('INPUT', 'Replacement SKUs must be distinct and differ from the original SKU.', 400)
  return { fromSku, skus }
 })
}

/** A new credential grants proposal preparation only; people retain all effects. */
export async function createProposalGrant(env: Bindings, actor: Actor, p: CreateProposalGrant): Promise<{ grant: ProposalGrant; token: string; expiresAt: number }> {
 owner(actor)
 const fields = ['accountId', 'costLimitCents', 'contactLimit', 'approvedSubstitutes', 'consent', 'reason']
 if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(key => !fields.includes(key)) || p.consent !== true) fail('CONSENT', 'Explicitly consent to one account, an approved substitution map and cost/contact caps. This grants no automatic stock or outbound rights.', 400)
 const accountId = exact(p.accountId, 'Account ID'), costLimitCents = counter(p.costLimitCents, 'Self-reported external run cost limit'), contactLimit = counter(p.contactLimit, 'Contact limit')
 const allowedSubstitutes = approvedMap(p.approvedSubstitutes), reason = text(p.reason, 'Consent reason', 1000)
 const selected = await account(env.DB, actor, accountId)
 requireActiveAccount(selected)
 const assortment = new Set(selected.value.prices.map(price => price.sku))
 if (allowedSubstitutes.some(rule => rule.skus.some(sku => !assortment.has(sku)))) fail('ASSORTMENT', 'Approve only replacement SKUs in this account’s current assortment.', 400)
 const at = Date.now(), expiresAt = at + week, id = crypto.randomUUID(), revision = crypto.randomUUID()
 const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('')
 const grant: ProposalGrant = { id, tokenId: id, authorizerId: actor.id, authorizerVersion: actor.version, accountId, accountRevision: selected.revision,
  allowedSubstitutes, state: 'active', revision, expiresAt, costLimitCents, spentCostCents: 0, contactLimit, spentContacts: 0,
  reason, createdAt: new Date(at).toISOString(), revokedAt: null, revocationReason: null }
 await commit(env.DB, actor, [activeAccountGuard(env.DB, selected),
  env.DB.prepare("INSERT INTO bw_agent_tokens(id,digest,actor_id,actor_version,expires_at,scope_kind) VALUES(?,?,?,?,?,'proposal')").bind(id, await digest(token), actor.id, actor.version, expiresAt),
  env.DB.prepare(`INSERT INTO bw_agent_proposal_grants(id,token_id,authorizer_id,authorizer_version,account_id,account_revision,allowed_substitutes,state,revision,cost_limit_cents,contact_limit,consent_reason,created_at,expires_at)
   VALUES(?,?,?,?,?,?,?,'active',?,?,?,?,?,?)`).bind(id, id, actor.id, actor.version, accountId, selected.revision, JSON.stringify(allowedSubstitutes), revision, costLimitCents, contactLimit, reason, at, expiresAt),
  audit(env.DB, actor, id, 'agent.proposal-granted', { accountId, revision, source: 'agent-proposal.grant', reason: `${reason} Cost cap reserves self-reported external run costs; Barrow model-call cost is zero. No automatic stock or outbound rights.` }),
 ])
 return { grant, token, expiresAt }
}

export async function revokeProposalGrant(env: Bindings, actor: Actor, p: { grantId: string; revision: string; reason: string }): Promise<ProposalGrant> {
 owner(actor)
 const id = exact(p?.grantId, 'Proposal grant ID'), previous = exact(p?.revision, 'Grant revision'), reason = text(p?.reason, 'Revocation reason', 1000)
 const grant = await readProposalGrant(env.DB, id)
 if (!grant) fail('NOT_FOUND', 'Agent proposal grant not found.', 404)
 if (grant.revision !== previous || grant.state !== 'active') fail('CHANGED', 'Refresh the current active proposal grant before revoking it.')
 const revision = crypto.randomUUID(), revokedAt = new Date().toISOString()
 await commit(env.DB, actor, [
  env.DB.prepare("UPDATE bw_agent_proposal_grants SET state='revoked',revision=?,revoked_at=?,revocation_reason=? WHERE id=? AND revision=? AND state='active'").bind(revision, revokedAt, reason, id, previous), changed(env.DB),
  env.DB.prepare('DELETE FROM bw_agent_tokens WHERE id=?').bind(grant.tokenId),
  audit(env.DB, actor, id, 'agent.proposal-revoked', { accountId: grant.accountId, revision, source: 'agent-proposal.revoke', reason }),
 ])
 // A reservation may have committed after the initial read and before revocation.
 const revoked = await readProposalGrant(env.DB, id)
 if (!revoked) fail('NOT_FOUND', 'Agent proposal grant not found.', 404)
 return revoked
}

// Recheck current counters, rather than the read snapshot, so concurrent
// reservations cannot exceed either cap. All authority comes from live rows.
const authorized = `g.id=? AND g.revision=? AND g.state='active' AND g.expires_at>?
 AND g.account_id=? AND g.account_revision=? AND g.token_id=? AND g.authorizer_id=? AND g.authorizer_version=?
 AND EXISTS(SELECT 1 FROM bw_agent_tokens t JOIN oa_operators o ON o.id=t.actor_id
  WHERE t.id=g.token_id AND t.actor_id=g.authorizer_id AND t.actor_version=g.authorizer_version
  AND t.expires_at>? AND o.status='active' AND o.role='owner' AND o.version=t.actor_version)
 AND EXISTS(SELECT 1 FROM bw_accounts a WHERE a.id=g.account_id AND a.revision=g.account_revision
  AND COALESCE(json_extract(a.value_json,'$.lifecycle'),'active')='active')
 AND g.spent_cost_cents<=g.cost_limit_cents-? AND g.spent_contacts<=g.contact_limit-?`
function guardValues(grant: ProposalGrant, costCents: number, contacts: number) {
 const at = Date.now()
 return [grant.id, grant.revision, at, grant.accountId, grant.accountRevision, grant.tokenId, grant.authorizerId, grant.authorizerVersion, at,
  counter(costCents, 'Self-reported external run cost'), counter(contacts, 'Reserved contacts')]
}

/** Validation only. A read guard must run in a batch that clears bw_guard. */
export function grantGuard(db: D1Database, grant: ProposalGrant, costCents = 0, contacts = 0): D1PreparedStatement {
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_agent_proposal_grants g WHERE ${authorized}) THEN 1 ELSE 0 END`)
  .bind(...guardValues(grant, costCents, contacts))
}

/** Reserve self-reported external cost / contacts in the same commit as work.
 * One contact belongs to a reviewed buyer offer; two belong to execution's
 * existing confirmation emails. Reservation never authorizes those effects.
 * Barrow model calls cost zero; independently purchased inference is not capped.
 * Even a zero reservation updates one live row, so changed() proves admission.
 */
export function grantSpendStatements(db: D1Database, grant: ProposalGrant, costCents = 0, contacts = 0): D1PreparedStatement[] {
 const values = guardValues(grant, costCents, contacts)
 return [db.prepare(`UPDATE bw_agent_proposal_grants AS g SET spent_cost_cents=spent_cost_cents+?,spent_contacts=spent_contacts+? WHERE ${authorized}`)
  .bind(costCents, contacts, ...values), changed(db)]
}
