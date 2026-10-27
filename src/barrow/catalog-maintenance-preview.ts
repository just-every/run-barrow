import type { Bindings } from '../auth.server'
import { pierReadOnlyState } from './pier'
import { Problem } from './model'
import { digest } from './digest'
import { catalogContext, requireCatalogOwner, catalogSourceRoute, type CatalogInput, type CatalogIssue, type CatalogListing } from './catalog-maintenance-model'
import { catalogWorkbook } from './catalog-maintenance-workbook'
import type { Actor } from './model'

export type CatalogSourceItem = { id: string; sku: string; name: string; barcode: string; archived: boolean }
export async function catalogSource(env: Bindings): Promise<CatalogSourceItem[] | null> {
 try {
  const state = await pierReadOnlyState(env)
  if (!Array.isArray(state?.items)) return null
  if (state.items.some((item: any) => typeof item.id !== 'string' || typeof item.sku !== 'string' || typeof item.name !== 'string')) return null
  const items: CatalogSourceItem[] = state.items.map((item: any) => ({ id: item.id, sku: item.sku, name: item.name, barcode: typeof item.barcode === 'string' ? item.barcode : '', archived: Boolean(item.archived) }))
  if (new Set(items.map(item => item.sku)).size !== items.length) return null
  return items.sort((a, b) => a.sku.localeCompare(b.sku))
 } catch (error) { if (error instanceof Problem) return null; throw error }
}
const missingEntities = ['accounts', 'buyers', 'locations', 'prices', 'lists', 'quoteLines', 'orderLines', 'openReleases', 'invoices', 'balances']
/** Only reads D1 and Pier; there is deliberately no preview persistence or refresh operation. */
export async function prepareCatalogMaintenance(env: Bindings, actor: Actor, input: CatalogInput) {
 requireCatalogOwner(actor)
 const sourceRoute = catalogSourceRoute(env)
 const [workbook, context, source] = await Promise.all([catalogWorkbook(input?.workbook), catalogContext(env.DB), catalogSource(env)])
 const issues: CatalogIssue[] = []
 const issue = (row: number, field: string, code: string, message: string, sku?: string, route?: string) => issues.push({ row, field, code, message, ...(sku ? { sku } : {}), ...(route ? { sourceRoute: route } : {}) })
 for (const field of workbook.rejectedFields) issue(1, field, 'REJECTED_FIELD', `Column ${field || '(blank)'} is unsupported; no field is silently discarded.`)
 for (const field of workbook.missingColumns) issue(1, field, 'MISSING_FIELD', `Required column ${field} is absent.`)
 if (!workbook.rows.length) issue(1, 'sku', 'EMPTY', 'Supply at least one catalog row.')
 if (!source) issue(0, 'sku', 'SOURCE_UNAVAILABLE', 'The SKU check did not run: Pier is unavailable. Apply is blocked.', undefined, sourceRoute)
 const items = new Map((source ?? []).map(item => [item.sku, item]))
 const media = new Set(context.media.map(image => image.sha256))
 const planned: CatalogListing[] = [], skus = new Set<string>(), keys = new Map<string, number>(), barcodes = new Map<string, number>()
 for (const { row, values } of workbook.rows) {
  const string = (field: string, max: number, required = false) => {
   const value = values[field] ?? ''
   if ((required && !value) || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) issue(row, field, 'INVALID_FIELD', `${field} must be trimmed plain text${required ? ' and present' : ''}, at most ${max} characters.`, values.sku)
   return value
  }
  const sku = string('sku', 100, true), variantKey = string('variantKey', 100, true)
  const style = string('style', 100), color = string('color', 60), size = string('size', 30), mediaSha256 = string('mediaSha256', 64)
  const listing = string('listing', 10, true), item = items.get(sku)
  if (!['listed', 'removed'].includes(listing)) issue(row, 'listing', 'INVALID_LISTING', 'listing must be listed or removed; omitted rows are never deleted.', sku)
  if (skus.has(sku)) issue(row, 'sku', 'DUPLICATE_VARIANT', 'This SKU appears more than once in the workbook.', sku)
  skus.add(sku)
  if (source && (!item || item.archived && listing !== 'removed')) issue(row, 'sku', 'SOURCE_OWNED', 'SKU must identify an existing active Pier item. Create, rename or reactivate it in Pier first.', sku, sourceRoute)
  const sourceFields: Record<string, string> = { sourceSku: item?.sku ?? '', itemId: item?.id ?? '', name: item?.name ?? '', barcode: item?.barcode ?? '' }
  for (const [field, actual] of Object.entries(sourceFields)) if (values[field] && values[field] !== actual) issue(row, field, 'SOURCE_OWNED', `${field} is owned by Pier; make this change in Pier and export again.`, sku, sourceRoute)
  if (values.stock) issue(row, 'stock', 'SOURCE_OWNED', 'Stock is owned by Pier. Use its stock workflow; catalog imports cannot change quantities.', sku, sourceRoute)
  const barcode = values.barcode || item?.barcode
  if (listing === 'listed' && barcode) {
   const prior = barcodes.get(barcode)
   if (prior !== undefined) issue(row, 'barcode', 'DUPLICATE_BARCODE', `Barcode ${barcode} duplicates workbook row ${prior}. Correct it in Pier or correct the workbook's source value.`, sku, sourceRoute)
   else barcodes.set(barcode, row)
  }
  if (listing === 'listed' && variantKey) {
   const prior = keys.get(variantKey)
   if (prior !== undefined) issue(row, 'variantKey', 'DUPLICATE_VARIANT', `Variant key ${variantKey} duplicates workbook row ${prior}.`, sku)
   else keys.set(variantKey, row)
  }
  let attributes: Record<string, string> = {}
  try {
   const parsed = JSON.parse(values.attributes || '{}')
   if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.keys(parsed).length > 50 || Object.entries(parsed).some(([key, value]) => !key || key.length > 60 || ['__proto__', 'constructor', 'prototype'].includes(key) || typeof value !== 'string' || value.length > 500 || /[\u0000-\u001f\u007f]/u.test(key + value))) throw new Error()
   attributes = Object.fromEntries(Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b))) as Record<string, string>
  } catch { issue(row, 'attributes', 'INVALID_ATTRIBUTES', 'attributes must be a JSON object with at most 50 plain text keys and text values.', sku) }
  const list = (field: string) => {
   const values = string(field, 4000).split('|').filter(Boolean)
   if (values.length > 40 || new Set(values).size !== values.length || values.some(value => value !== value.trim() || value.length > 100)) issue(row, field, 'INVALID_ASSIGNMENTS', `${field} requires at most 40 distinct labels, separated by |.`, sku)
   return values.sort()
  }
  if (listing === 'removed' && mediaSha256) issue(row, 'mediaSha256', 'REMOVED_MEDIA', 'Clear mediaSha256 on an explicitly removed listing; retained order images stay unchanged.', sku)
  if (mediaSha256 && (!/^[a-f0-9]{64}$/.test(mediaSha256) || !media.has(mediaSha256))) issue(row, 'mediaSha256', 'BROKEN_MEDIA', 'Media reference must name an existing sanitized JPEG SHA-256 in this installation. External URLs are not fetched.', sku)
  if (listing === 'listed' && (!style || !color || !size)) issue(row, 'style', 'INVALID_ATTRIBUTES', 'Listed rows require style, color and size before assigning product media.', sku)
  const mediaSlots=context.store.listings.find(prior=>prior.sku===sku)?.mediaSlots
  planned.push({ sku, variantKey, style, color, size, attributes, categories: list('categories'), assortments: list('assortments'), mediaSha256: listing === 'removed' ? '' : mediaSha256, ...(mediaSlots?{mediaSlots}:{}), listing: listing === 'removed' ? 'removed' : 'listed', sourceItemId: item?.id ?? '', source: 'Pier', revision: '' })
 }
 const merged = new Map(context.store.listings.map(listing => [listing.sku, listing]))
 for (const listing of planned) merged.set(listing.sku, listing)
 const allKeys = new Map<string, string>()
 for (const listing of merged.values()) if (listing.listing === 'listed') {
  const prior = allKeys.get(listing.variantKey)
  if (prior && prior !== listing.sku) issue(0, 'variantKey', 'DUPLICATE_VARIANT', `Variant key ${listing.variantKey} is already assigned to ${prior}. Remove that listing explicitly or choose another key.`, listing.sku)
  allKeys.set(listing.variantKey, listing.sku)
 }
 if (merged.size > 20000) issue(0, 'sku', 'LIMIT', 'Catalog metadata is limited to 20,000 retained listings.')
 const totals = (rows: CatalogListing[]) => ({ listings: rows.length, listed: rows.filter(row => row.listing === 'listed').length, removed: rows.filter(row => row.listing === 'removed').length, mediaReferences: rows.filter(row => row.mediaSha256).length, attributes: rows.reduce((n, row) => n + Object.keys(row.attributes).length, 0), categories: rows.reduce((n, row) => n + row.categories.length, 0), assortmentAssignments: rows.reduce((n, row) => n + row.assortments.length, 0), sumsByCurrency: {} })
 const sourceCounts = {
  listings: workbook.rows.length,
  listed: workbook.rows.filter(row => row.values.listing === 'listed').length,
  removed: workbook.rows.filter(row => row.values.listing === 'removed').length,
  mediaReferences: workbook.rows.filter(row => row.values.mediaSha256).length,
  attributes: workbook.rows.reduce((n, row) => { try { const value = JSON.parse(row.values.attributes || '{}'); return n + (value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0) } catch { return n } }, 0),
  categories: workbook.rows.reduce((n, row) => n + (row.values.categories || '').split('|').filter(Boolean).length, 0),
  assortmentAssignments: workbook.rows.reduce((n, row) => n + (row.values.assortments || '').split('|').filter(Boolean).length, 0),
  sumsByCurrency: {},
 }
 const plannedCounts = totals(planned)
 const reconciliation = {
  source: sourceCounts, planned: plannedCounts, matches: issues.length === 0 && JSON.stringify(sourceCounts) === JSON.stringify(plannedCounts),
  rejectedFields: workbook.rejectedFields, missingSourceEntities: missingEntities.map(kind => ({ kind, disposition: 'Not supplied by this catalog workbook; no records changed and no financial authority imported.' })),
  skuCheck: source ? 'Checked read-only against connected Pier catalog' : 'Did not run: Pier unavailable',
  removedListings: planned.filter(row => row.listing === 'removed').map(row => row.sku),
  unchangedOmittedListings: context.store.listings.filter(row => !skus.has(row.sku)).map(row => row.sku),
  financialNote: 'No price, balance or currency columns are supported. Per-currency sums are empty, not migrated zero balances.',
 }
 const basis = { artifact: workbook.artifact, priorRevision: context.store.revision, attributesRevision: context.attributes.revision, source, planned, reconciliation, issues }
 const fingerprint = await digest(JSON.stringify(basis))
 const report = { fingerprint, canApply: issues.length === 0 && reconciliation.matches, issues, reconciliation, artifact: workbook.artifact, rows: planned, revision: context.store.revision, sourceRoute, policy: 'Supplier owner or admin only; existing sanitized JPEG references only. Assortment labels are metadata and grant no buyer access.' }
 return { report, context, merged: [...merged.values()].sort((a, b) => a.sku.localeCompare(b.sku)) }
}
export async function previewCatalogMaintenance(env: Bindings, actor: Actor, input: CatalogInput) { return (await prepareCatalogMaintenance(env, actor, input)).report }
