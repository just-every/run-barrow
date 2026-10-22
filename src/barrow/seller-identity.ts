// ORD-014: the seller's legal identity. Each confirmation copies it as it stood when that revision was recorded;
// a later edit never rewrites an earlier document.
import { audit, commit } from './access'
import { fail, requirePerson, text, type Actor } from './model'

export type SellerIdentity = { legalName: string; address: string; registration?: string }
export async function sellerIdentity(db: D1Database): Promise<{ identity: SellerIdentity | null; revision: string | null }> {
 const row = await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='seller-identity'").first<{ value_json: string; revision: string }>()
 return row ? { identity: JSON.parse(row.value_json), revision: row.revision } : { identity: null, revision: null }
}
function requireOwner(actor: Actor) {
 requirePerson(actor)
 if (!['owner', 'admin'].includes(actor.role) || actor.staff) fail('FORBIDDEN', 'Only the supplier owner or admin can set the seller legal identity.', 403)
}
export async function readSellerIdentity(db: D1Database, actor: Actor) { requireOwner(actor); return sellerIdentity(db) }
export async function saveSellerIdentity(db: D1Database, actor: Actor, p: any) {
 requireOwner(actor)
 const prior = await sellerIdentity(db)
 if (p.revision !== prior.revision) fail('CHANGED', 'Refresh the seller identity before saving.')
 const identity: SellerIdentity = { legalName: text(p.legalName, 'Seller legal name', 160), address: text(p.address, 'Seller registered address', 400), ...(p.registration ? { registration: text(p.registration, 'Registration or tax ID', 80) } : {}) }
 const revision = crypto.randomUUID()
 await commit(db, actor, [
  db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='seller-identity'),'')=? THEN 1 ELSE 0 END").bind(prior.revision ?? ''),
  db.prepare("INSERT INTO bw_settings VALUES('seller-identity',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(identity), revision),
  audit(db, actor, 'seller-identity', 'seller.identity-saved', { revision, source: 'seller.identity', reason: 'Set the seller legal identity for confirmations recorded from now on; earlier confirmations keep theirs.' }),
 ])
 return { identity, revision }
}
export const sellerLine = (identity?: SellerIdentity | null) => identity ? [identity.legalName, identity.address, identity.registration].filter(Boolean).join(' | ') : 'Seller legal identity not recorded'
