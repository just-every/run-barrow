import type { Bindings } from '../auth.server'
import { audit, commit } from './access'
import { fail, text, type Actor } from './model'
import { now } from './clock'
import { csvText } from './cart-csv'
import { catalogContext, catalogSetting, catalogSourceRoute, requireCatalogOwner, type CatalogInput, type CatalogListing } from './catalog-maintenance-model'
import { catalogSource, prepareCatalogMaintenance } from './catalog-maintenance-preview'
import { catalogColumns, catalogXlsx } from './catalog-maintenance-workbook'
export { previewCatalogMaintenance } from './catalog-maintenance-preview'
export type { CatalogInput, CatalogListing } from './catalog-maintenance-model'

export async function applyCatalogMaintenance(env: Bindings, actor: Actor, input: CatalogInput & { fingerprint: string; reason: string; approveRemoved: boolean }) {
 requireCatalogOwner(actor)
 const fingerprint = text(input?.fingerprint, 'Reviewed fingerprint', 64), reason = text(input.reason, 'Catalog approval reason', 1000)
 const prepared = await prepareCatalogMaintenance(env, actor, input), { report, context } = prepared
 if (fingerprint !== report.fingerprint) fail('CATALOG_CHANGED', 'The workbook, catalog, media or source changed. Preview again and approve the new fingerprint.')
 if (!report.canApply) fail('CATALOG_INVALID', 'Correct every workbook issue before applying; source-owned fields must be changed in Pier.', 400)
 if (report.reconciliation.removedListings.length && input.approveRemoved !== true) fail('CATALOG_REMOVAL_REVIEW', 'Explicitly approve the listed removals before applying.', 400)
 const revision = crypto.randomUUID(), at = (await now()).toISOString(), changedSkus = new Set(report.rows.map(row => row.sku))
 const listings = prepared.merged.map(row => changedSkus.has(row.sku) ? { ...row, revision } : row)
 const variants = Object.assign(Object.create(null) as typeof context.attributes.variants, context.attributes.variants)
 for (const row of report.rows) if (row.listing === 'listed') {
  const image = context.media.find(image => image.sha256 === row.mediaSha256)
  variants[row.sku] = { style: row.style, color: row.color, size: row.size, ...(image ? { image } : {}) }
 }
 if (Object.keys(variants).length > 20000) fail('CATALOG_LIMIT', 'Variant attributes are limited to 20,000 SKUs.', 400)
 const approval = { fingerprint, reconciliation: report.reconciliation, artifact: report.artifact, reason, approvedBy: actor.id, approvedAt: at }
 await commit(env.DB, actor, [
  env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key=?),\'\')=? THEN 1 ELSE 0 END').bind(catalogSetting, context.store.revision ?? ''),
  env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='variant-attributes'),'')=? THEN 1 ELSE 0 END").bind(context.attributes.revision ?? ''),
  // Fail the whole atomic batch if an approved image was concurrently removed.
  env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT count(*) FROM bw_product_images WHERE sha256 IN (SELECT value FROM json_each(?)))=? THEN 1 ELSE 0 END').bind(JSON.stringify([...new Set(report.rows.map(row => row.mediaSha256).filter(Boolean))]), new Set(report.rows.map(row => row.mediaSha256).filter(Boolean)).size),
  env.DB.prepare('INSERT INTO bw_settings(key,value_json,revision) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(catalogSetting, JSON.stringify(listings), revision),
  env.DB.prepare("INSERT INTO bw_settings(key,value_json,revision) VALUES('variant-attributes',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(variants), revision),
  audit(env.DB, actor, catalogSetting, 'import.approved', { revision, source: 'catalog-maintenance.apply', reason: JSON.stringify(approval) }),
 ])
 return { revision, fingerprint, listings, approval }
}

export async function readCatalogMaintenance(env: Bindings, actor: Actor) {
 requireCatalogOwner(actor)
 const [context, source] = await Promise.all([catalogContext(env.DB), catalogSource(env)])
 const items = new Map((source ?? []).map(item => [item.sku, item]))
 const mapped = new Map(context.store.listings.map(row => [row.sku, row]))
 // The first workbook includes every active Pier item, with recorded attributes where available.
 // Missing attributes stay blank and are an explicit preview issue until completed by the operator.
 const skus = new Set([...mapped.keys(), ...(source ?? []).filter(item => !item.archived).map(item => item.sku)])
 const listings: CatalogListing[] = [...skus].sort().map(sku => {
  const listing = mapped.get(sku), attributes = Object.hasOwn(context.attributes.variants, sku) ? context.attributes.variants[sku] : undefined
  return listing ?? { sku, variantKey: sku, style: attributes?.style ?? '', color: attributes?.color ?? '', size: attributes?.size ?? '', attributes: {}, categories: [], assortments: [], mediaSha256: attributes?.image?.sha256 ?? '', listing: 'listed', sourceItemId: items.get(sku)?.id ?? '', source: 'Pier', revision: context.store.revision ?? '' }
 })
 return { revision: context.store.revision, listings, sourceAvailable: source !== null, sourceRoute: catalogSourceRoute(env), media: context.media, sourceItems: source ?? [], currencySums: {}, assignmentNote: 'Assortment labels are maintained metadata; existing account price lists and buying-profile grants continue to control buyer access.' }
}
export async function catalogMaintenanceExport(env: Bindings, actor: Actor, format: 'json' | 'csv' | 'xlsx'): Promise<Response> {
 const data = await readCatalogMaintenance(env, actor)
 const items = new Map(data.sourceItems.map(item => [item.sku, item]))
 const headers = [...catalogColumns, 'name', 'barcode', 'itemId']
 const rows = data.listings.map(row => [row.sku, row.variantKey, row.style, row.color, row.size, JSON.stringify(row.attributes), row.categories.join('|'), row.assortments.join('|'), row.mediaSha256, row.listing, items.get(row.sku)?.name ?? '', items.get(row.sku)?.barcode ?? '', row.sourceItemId])
 const download = (body: BodyInit, type: string) => new Response(body, { headers: { 'content-type': type, 'content-disposition': `attachment; filename="barrow-catalog.${format}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
 if (format === 'json') return download(JSON.stringify({ ...data, manifest: { listings: data.listings.length, mediaReferences: data.listings.filter(row => row.mediaSha256).length, currencySums: {} } }), 'application/json; charset=utf-8')
 if (!data.sourceAvailable) fail('CATALOG_SOURCE_UNAVAILABLE', 'Reconnect Pier before exporting a workbook with its current source-owned identifiers.', 503)
 if (rows.length > 5000) fail('CATALOG_LIMIT', 'Workbook export is limited to 5,000 rows; use the complete JSON export for this catalog.', 400)
 return format === 'csv' ? download(csvText([headers, ...rows]), 'text/csv; charset=utf-8') : download(catalogXlsx([headers, ...rows]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}
