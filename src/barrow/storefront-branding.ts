import { audit, commit } from './access'
import { fail, requirePerson, text, type Actor } from './model'
import { defaultStorefrontBranding, storefrontAccents, storefrontCanvases, type StorefrontBranding } from './storefront-branding-options'

export async function storefrontBranding(db: D1Database): Promise<StorefrontBranding> {
 const row = await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='storefront-branding'").first<{value_json:string;revision:string}>()
 return row ? {...JSON.parse(row.value_json), revision: row.revision} : {...defaultStorefrontBranding}
}

/** Display settings never change legal sellers, buyer rights or recorded commercial facts. */
export async function saveStorefrontBranding(db: D1Database, actor: Actor, p: any) {
 requirePerson(actor)
 if (actor.role !== 'owner' || actor.staff) fail('FORBIDDEN', 'Only the signed-in owner may publish the storefront identity.', 403)
 const prior = await storefrontBranding(db)
 if (p.revision !== prior.revision) fail('CHANGED', 'Storefront settings changed. Reload and review the current identity before saving.')
 if (p.reviewed !== true) fail('REVIEW', 'Review the merchant display name, colors and support contact before publishing.', 400)
 const displayName = text(p.displayName, 'Merchant display name', 80)
 const supportUrl = text(p.supportUrl, 'Support contact URL', 400)
 let contact: URL
 try { contact = new URL(supportUrl) } catch { fail('INPUT', 'Support contact must be a complete HTTPS address.', 400) }
 if (contact.protocol !== 'https:' || contact.username || contact.password) fail('INPUT', 'Support contact must be an HTTPS address without embedded credentials.', 400)
 if (typeof p.accent !== 'string' || !Object.hasOwn(storefrontAccents, p.accent) || typeof p.canvas !== 'string' || !Object.hasOwn(storefrontCanvases, p.canvas)) fail('INPUT', 'Choose one of the supported accessible color combinations.', 400)
 const reason = text(p.reason, 'Publication reason', 500)
 const revision = crypto.randomUUID()
 const value = { displayName, supportUrl: contact.href, accent: p.accent, canvas: p.canvas }
 await commit(db, actor, [
  db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='storefront-branding'),'')=? THEN 1 ELSE 0 END").bind(prior.revision ?? ''),
  db.prepare("INSERT INTO bw_settings VALUES('storefront-branding',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(value), revision),
  audit(db, actor, 'storefront-branding', 'storefront.published', {revision, source:'storefront.save', reason}),
 ])
 return {...value, revision} as StorefrontBranding
}
