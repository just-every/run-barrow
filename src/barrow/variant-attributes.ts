// ORD-014 / CAT-007: explicit style, color and size for each variant SKU. Order preparation copies them onto its
// lines, so confirmations, matrix layouts and production totals read recorded values rather than parsing SKUs.
import { audit, commit } from './access'
import { fail, requirePerson, text, type Actor, type Line } from './model'

export type VariantAttributes = { style: string; color: string; size: string }
export async function variantAttributes(db: D1Database): Promise<{ variants: Record<string, VariantAttributes>; revision: string | null }> {
 const row = await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='variant-attributes'").first<{ value_json: string; revision: string }>()
 return row ? { variants: JSON.parse(row.value_json), revision: row.revision } : { variants: {}, revision: null }
}
function requireOwner(actor: Actor) {
 requirePerson(actor)
 if (!['owner', 'admin'].includes(actor.role) || actor.staff) fail('FORBIDDEN', 'Only the supplier owner or admin can set variant attributes.', 403)
}
export async function readVariantAttributes(db: D1Database, actor: Actor) { requireOwner(actor); return variantAttributes(db) }
/** Rows are merged by SKU; `remove` lists SKUs whose attributes are cleared. Existing order lines keep their copies. */
export async function saveVariantAttributes(db: D1Database, actor: Actor, p: any) {
 requireOwner(actor)
 const prior = await variantAttributes(db)
 if (p.revision !== prior.revision) fail('CHANGED', 'Refresh the variant attributes before saving.')
 const rows = p.variants ?? [], remove = p.remove ?? []
 if (!Array.isArray(rows) || !Array.isArray(remove) || rows.length + remove.length === 0 || rows.length > 2000 || remove.length > 2000) fail('INPUT', 'Send between 1 and 2,000 variant rows or removals.', 400)
 const variants = { ...prior.variants }
 for (const sku of remove) delete variants[text(sku, 'SKU', 100)]
 const seen = new Set<string>()
 for (const row of rows) {
  const sku = text(row?.sku, 'SKU', 100)
  if (seen.has(sku)) fail('INPUT', `${sku} appears more than once.`, 400)
  seen.add(sku)
  variants[sku] = { style: text(row.style, 'Style', 100), color: text(row.color, 'Color', 60), size: text(row.size, 'Size', 30) }
 }
 if (Object.keys(variants).length > 20000) fail('INPUT', 'Barrow records attributes for at most 20,000 variants.', 400)
 const revision = crypto.randomUUID()
 await commit(db, actor, [
  db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='variant-attributes'),'')=? THEN 1 ELSE 0 END").bind(prior.revision ?? ''),
  db.prepare("INSERT INTO bw_settings VALUES('variant-attributes',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(variants), revision),
  audit(db, actor, 'variant-attributes', 'variant.attributes-saved', { revision, source: 'variant.attributes', reason: `Recorded style, color and size for ${rows.length} variant(s) and cleared ${remove.length}; existing order lines keep their copies.` }),
 ])
 return { variants, revision }
}
export async function withVariantAttributes(db: D1Database, lines: Line[]): Promise<Line[]> {
 const { variants } = await variantAttributes(db)
 return lines.map(line => variants[line.sku] ? { ...line, ...variants[line.sku] } : line)
}
