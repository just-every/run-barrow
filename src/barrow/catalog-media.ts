import type { Bindings } from '../auth.server'
import { boundedJson } from '@runeditrun/rer/modules/portability/http'
import { audit, commit } from './access'
import { digest } from './digest'
import { fail, text, type Actor } from './model'
import { catalogContext, catalogSetting } from './catalog-maintenance-model'
import { catalogMediaAllowed, catalogMediaOwner, mediaMembership, mediaMembershipKey, mediaRevisionGuard, requireCatalogMedia, refuseCatalogMedia, type MediaCatalog } from './catalog-media-access'

const path = '/api/barrow/catalog-media'
const saveSetting = (db: D1Database, key: string, value: unknown, revision: string) => db.prepare('INSERT INTO bw_settings(key,value_json,revision) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(key, JSON.stringify(value), revision)
const exactKeys = (input: any, keys: string[]) => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) fail('INPUT', 'Use only the named media fields; uploads, URLs and importer actions are not supported.', 400) }
function exactList(value: unknown, label: string, max: number) {
 if (!Array.isArray(value) || !value.length || value.length > max || value.some(item => typeof item !== 'string' || !item.length || item !== item.trim() || item.length > 160 || /[\u0000-\u001f\u007f]/u.test(item)) || new Set(value).size !== value.length) fail('INPUT', `Choose distinct exact ${label}.`, 400)
 return (value as string[]).slice().sort()
}
async function context(db: D1Database) {
 const [catalog, membership] = await Promise.all([catalogContext(db), mediaMembership(db)])
 return { ...catalog, membership }
}
type Context = Awaited<ReturnType<typeof context>>
function currentMembership(c: Context) {
 if (c.membership.value.catalogRevision !== c.store.revision || c.membership.value.variantRevision !== c.attributes.revision) fail('CATALOG_MEDIA_CHANGED', 'The imported catalog or variants changed. The owner must review catalog membership against current source revisions.')
}
function exactVariant(c: Context, sku: string) {
 const rows = c.store.listings.filter(row => row.sku === sku)
 if (rows.length !== 1 || rows[0].listing !== 'listed' || !rows[0].sourceItemId || !rows[0].variantKey || !Object.hasOwn(c.attributes.variants, sku)
  || c.store.listings.filter(row => row.variantKey === rows[0].variantKey).length !== 1) fail('CATALOG_MEDIA_TARGET', 'Choose one unambiguous, already imported listed variant.', 409)
 return rows[0]
}
export async function readCatalogMedia(db: D1Database, actor: Actor) {
 await requireCatalogMedia(db, actor, [], 'catalog-media.read')
 const c = await context(db), owner = catalogMediaOwner(actor)
 const catalogs = c.membership.value.catalogs.filter(row => catalogMediaAllowed(actor, [row.id])).map(row => ({ ...row,
  variants: row.skus.map(sku => ({ sku, slots: c.attributes.variants[sku]?.imageSlots ?? {}, editable: c.membership.value.catalogs.filter(other => other.skus.includes(sku)).every(other => catalogMediaAllowed(actor, [other.id])) })),
 }))
 return { owner, revision: c.membership.revision, catalogRevision: c.store.revision, variantRevision: c.attributes.revision,
  current: c.membership.value.catalogRevision === c.store.revision && c.membership.value.variantRevision === c.attributes.revision, catalogs,
  ...(owner ? { imported: c.store.listings.filter(row => row.listing === 'listed').map(row => ({ sku: row.sku, variantKey: row.variantKey, revision: row.revision })), acceptedImages: c.media } : {}),
 }
}
async function saveMembership(db: D1Database, actor: Actor, input: any) {
 if (!catalogMediaOwner(actor)) { await requireCatalogMedia(db, actor, ['owner-membership-administration'], 'catalog-media.membership'); fail('FORBIDDEN', 'Only the owner reviews catalog membership.', 403) }
 exactKeys(input, ['revision', 'catalogRevision', 'variantRevision', 'catalogs', 'reason'])
 const c = await context(db), reason = text(input.reason, 'Membership review reason', 1000)
 if (input.revision !== c.membership.revision || input.catalogRevision !== c.store.revision || input.variantRevision !== c.attributes.revision) fail('CATALOG_MEDIA_CHANGED', 'Refresh source revisions before reviewing membership.')
 if (!Array.isArray(input.catalogs) || input.catalogs.length > 100) fail('INPUT', 'Review at most 100 named catalogs.', 400)
 const catalogs: MediaCatalog[] = input.catalogs.map((row: any) => {
  exactKeys(row, ['id', 'name', 'skus', 'images'])
  const id = text(row.id, 'Catalog ID', 100), name = text(row.name, 'Catalog name', 120)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail('INPUT', 'Use a stable catalog ID of letters, numbers, underscores and hyphens.', 400)
  const skus = exactList(row.skus, 'imported SKUs', 2000), images = exactList(row.images, 'accepted image references', 1000)
  skus.forEach(sku => exactVariant(c, sku))
  if (images.some(sha => !c.media.some(image => image.sha256 === sha))) fail('CATALOG_MEDIA_IMAGE', 'Choose already accepted sanitized JPEG references stored in this installation.', 400)
  return { id, name, skus, images }
 }).sort((a: MediaCatalog, b: MediaCatalog) => a.id.localeCompare(b.id))
 if (new Set(catalogs.map(row => row.id)).size !== catalogs.length) fail('INPUT', 'Review each catalog exactly once; ambiguous membership is refused.', 400)
 const revision = crypto.randomUUID()
 await commit(db, actor, [mediaRevisionGuard(db, mediaMembershipKey, c.membership.revision), mediaRevisionGuard(db, catalogSetting, c.store.revision), mediaRevisionGuard(db, 'variant-attributes', c.attributes.revision),
  ...[...new Set(catalogs.flatMap(row => row.images))].map(sha => db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_product_images WHERE sha256=?) THEN 1 ELSE 0 END').bind(sha)),
  saveSetting(db, mediaMembershipKey, { catalogs, catalogRevision: c.store.revision, variantRevision: c.attributes.revision }, revision),
  audit(db, actor, actor.id, 'catalog-media.membership-reviewed', { revision, source: 'catalog-media.membership', reason }),
 ])
 return readCatalogMedia(db, actor)
}
async function prepare(db: D1Database, actor: Actor, input: any) {
 exactKeys(input, ['catalogId', 'sku', 'slot', 'imageSha256', 'fingerprint', 'reason'])
 const catalogId = text(input.catalogId, 'Catalog ID', 100)
 await requireCatalogMedia(db, actor, [catalogId], 'catalog-media.prepare')
 const c = await context(db); currentMembership(c)
 const catalog = c.membership.value.catalogs.find(row => row.id === catalogId), sku = text(input.sku, 'Imported SKU', 100)
 if (!catalog || !catalog.skus.includes(sku)) fail('CATALOG_MEDIA_TARGET', 'The owner has not reviewed this variant as a member of the selected catalog.', 409)
 const listing = exactVariant(c, sku), affected = c.membership.value.catalogs.filter(row => row.skus.includes(sku))
 await requireCatalogMedia(db, actor, affected.map(row => row.id), 'catalog-media.prepare')
 if (!Number.isSafeInteger(input.slot) || input.slot < 1 || input.slot > 99) fail('INPUT', 'Choose a media slot from 1 to 99.', 400)
 const sha = text(input.imageSha256, 'Accepted image reference', 64)
 const image = c.media.find(row => row.sha256 === sha)
 if (!image || !/^[a-f0-9]{64}$/.test(sha) || affected.some(row => !row.images.includes(sha))) return refuseCatalogMedia(db, actor, 'catalog-media.prepare', 'The image must be stored here and owner-approved for every affected catalog.', 403, 'CATALOG_MEDIA_IMAGE')
 const stored = await db.prepare('SELECT * FROM bw_product_images WHERE sha256=?').bind(sha).first<{sha256:string;content_base64:string;width:number;height:number;size:number;components:number;created_by:string;created_at:string}>()
 if (!stored) fail('CATALOG_MEDIA_CHANGED', 'The accepted image changed; prepare again.')
 const imageRevision = await digest(JSON.stringify(stored)), grantRevision = actor.staff?.revision ?? `owner:${actor.version}`
 const effect = { catalogId, sku, slot: input.slot as number, imageSha256: sha, affectedCatalogs: affected.map(row => row.id).sort(), grantRevision, membershipRevision: c.membership.revision, catalogRevision: c.store.revision, variantRevision: c.attributes.revision, listingRevision: listing.revision, imageRevision }
 const fingerprint = await digest(JSON.stringify({ actor: actor.id, nativeVersion: actor.version, ...effect }))
 return { c, stored, image, listing, effect, fingerprint }
}
async function apply(db: D1Database, actor: Actor, input: any) {
 const prepared = await prepare(db, actor, input), { c, stored, image, listing, effect, fingerprint } = prepared
 if (input.fingerprint !== fingerprint) await refuseCatalogMedia(db, actor, 'catalog-media.apply', 'The grant, catalog, variant, image or reviewed match changed. Prepare and review again.', 409, 'CATALOG_MEDIA_CHANGED')
 const reason = text(input.reason, 'Media approval reason', 1000), revision = crypto.randomUUID()
 const imageSlots = { ...c.attributes.variants[effect.sku].imageSlots, [String(effect.slot)]: image }
 const variants = { ...c.attributes.variants, [effect.sku]: { ...c.attributes.variants[effect.sku], imageSlots, ...(effect.slot === 1 ? { image } : {}) } }
 const mediaSlots = [...(listing.mediaSlots ?? []).filter(row => row.slot !== effect.slot), { slot: effect.slot, name: `Reviewed slot ${effect.slot}`, ...image }].sort((a,b) => a.slot-b.slot)
 const listings = c.store.listings.map(row => row.sku === effect.sku ? { ...row, revision, mediaSlots, ...(effect.slot === 1 ? { mediaSha256: image.sha256 } : {}) } : row)
 await commit(db, actor, [mediaRevisionGuard(db, mediaMembershipKey, c.membership.revision), mediaRevisionGuard(db, catalogSetting, c.store.revision), mediaRevisionGuard(db, 'variant-attributes', c.attributes.revision),
  db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_product_images WHERE sha256=? AND content_base64=? AND width=? AND height=? AND size=? AND components=? AND created_by=? AND created_at=?) THEN 1 ELSE 0 END').bind(stored.sha256, stored.content_base64, stored.width, stored.height, stored.size, stored.components, stored.created_by, stored.created_at),
  saveSetting(db, 'variant-attributes', variants, revision), saveSetting(db, catalogSetting, listings, revision),
  saveSetting(db, mediaMembershipKey, { ...c.membership.value, catalogRevision: revision, variantRevision: revision }, revision),
  audit(db, actor, actor.id, 'catalog-media.applied', { revision, source: 'catalog-media.apply', reason: JSON.stringify({ ...effect, fingerprint, reason }) }),
 ])
 return { revision, fingerprint, ...effect }
}
/** This door accepts references only. It never uploads, fetches, imports or serves image bytes. */
export async function catalogMediaResponse(request: Request, env: Bindings, actor: Actor): Promise<Response | null> {
 const url = new URL(request.url)
 if (url.pathname !== path && !url.pathname.startsWith(path + '/')) return null
 const json = (value: unknown) => Response.json(value, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
 await requireCatalogMedia(env.DB, actor, [], 'catalog-media.access')
 if (request.method === 'GET' && url.pathname === path) return json(await readCatalogMedia(env.DB, actor))
 if (request.method === 'POST' && ['/membership', '/preview', '/apply'].some(suffix => url.pathname === path + suffix)) {
  if (request.headers.get('origin') !== env.AUTH_ORIGIN) fail('ORIGIN', 'Use this installation’s own origin.', 403)
  const input = await boundedJson(request, 500000)
  if (url.pathname.endsWith('/membership')) return json(await saveMembership(env.DB, actor, input))
  if (url.pathname.endsWith('/apply')) return json(await apply(env.DB, actor, input))
  const { effect, fingerprint } = await prepare(env.DB, actor, input)
  await commit(env.DB, actor, [audit(env.DB, actor, actor.id, 'catalog-media.prepared', { revision: effect.variantRevision!, source: 'catalog-media.preview', reason: JSON.stringify({ ...effect, fingerprint }) })])
  return json({ ...effect, fingerprint })
 }
 fail('NOT_FOUND', 'Unknown catalog media endpoint.', 404)
}
