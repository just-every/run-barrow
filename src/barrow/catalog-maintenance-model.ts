import { fail, type Actor } from './model'
import { variantAttributes } from './variant-attributes'

export type CatalogListing = {
 sku: string; variantKey: string; style: string; color: string; size: string
 attributes: Record<string, string>; categories: string[]; assortments: string[]
 mediaSha256: string; listing: 'listed' | 'removed'
 mediaSlots?:Array<{slot:number;name:string;sha256:string;width:number;height:number;size:number}>
 sourceItemId: string; source: 'Pier'; revision: string
}
export type CatalogStore = { listings: CatalogListing[]; revision: string | null }
export type CatalogWorkbook = { name: string; base64: string }
export type CatalogInput = { workbook: CatalogWorkbook }
export type CatalogIssue = { row: number; sku?: string; field: string; code: string; message: string; sourceRoute?: string }
export const catalogSetting = 'catalog-maintenance'
export function catalogSourceRoute(env: { PIER_ORIGIN?: string }): string | undefined {
 try { const url = new URL(env.PIER_ORIGIN ?? ''); return url.origin === env.PIER_ORIGIN && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin + '/app' : undefined } catch { return undefined }
}
export function requireCatalogOwner(actor: Actor) {
 if (actor.agent || actor.staff || !['owner', 'admin'].includes(actor.role)) fail('FORBIDDEN', 'Only the signed-in supplier owner or admin may maintain catalog workbooks.', 403)
}
export async function catalogStore(db: D1Database): Promise<CatalogStore> {
 const row = await db.prepare('SELECT value_json,revision FROM bw_settings WHERE key=?').bind(catalogSetting).first<{ value_json: string; revision: string }>()
 return row ? { listings: JSON.parse(row.value_json), revision: row.revision } : { listings: [], revision: null }
}
export async function catalogContext(db: D1Database) {
 const [store, attributes, media] = await Promise.all([
  catalogStore(db), variantAttributes(db),
  db.prepare('SELECT sha256,width,height,size FROM bw_product_images ORDER BY sha256').all<{ sha256: string; width: number; height: number; size: number }>(),
 ])
 return { store, attributes, media: media.results }
}
