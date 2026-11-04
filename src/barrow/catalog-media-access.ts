import type { Actor } from './model'
import { audit, commit } from './access'
import { fail } from './model'

export const mediaMembershipKey = 'catalog-media-membership'
export type MediaCatalog = { id: string; name: string; skus: string[]; images: string[] }
export type MediaMembership = { catalogs: MediaCatalog[]; catalogRevision: string | null; variantRevision: string | null }
export async function mediaMembership(db: D1Database) {
 const row = await db.prepare('SELECT value_json,revision FROM bw_settings WHERE key=?').bind(mediaMembershipKey).first<{value_json:string;revision:string}>()
 return { revision: row?.revision ?? null, value: row ? JSON.parse(row.value_json) as MediaMembership : { catalogs: [], catalogRevision: null, variantRevision: null } }
}
export const catalogMediaOwner = (actor: Actor) => !actor.agent && actor.role === 'owner' && !actor.staff
export function catalogMediaAllowed(actor: Actor, ids: string[]) {
 if (catalogMediaOwner(actor)) return true
 const grant = actor.staff
 return !actor.agent && actor.role === 'member' && !!grant && grant.state === 'active' && grant.userId === actor.id
  && grant.nativeVersion === actor.version && grant.role === 'sales-manager' && !!grant.entitlements?.includes('catalog-media')
  && !!grant.catalogMedia?.length && ids.every(id => grant.catalogMedia!.includes(id))
}
export async function refuseCatalogMedia(db: D1Database, actor: Actor, source: string, reason: string, status = 403, code = 'FORBIDDEN'): Promise<never> {
 // A revoked grant is absent on the actor; Native session admission can still
 // attribute a refusal without conferring permission on the former grant.
 await commit(db, actor, [audit(db, actor, actor.id, 'staff.permission-refused', {
  revision: actor.staff?.revision ?? `native:${actor.version}`, source, reason,
 })])
 fail(code, reason, status)
}
export async function requireCatalogMedia(db: D1Database, actor: Actor, ids: string[], source: string) {
 if (catalogMediaAllowed(actor, ids)) return
 return refuseCatalogMedia(db, actor, source, 'Your current grant does not permit this catalog media action. No media changed.')
}
export const mediaRevisionGuard = (db: D1Database, key: string, revision: string | null) => db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key=?),'')=? THEN 1 ELSE 0 END").bind(key, revision ?? '')
