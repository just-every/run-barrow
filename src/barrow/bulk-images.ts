import type { Actor } from './model'
import { fail, text } from './model'
import { audit, commit } from './access'
import { decodedImage, storeImage, type ImageRef } from './product-images'
import { requireCatalogOwner } from './catalog-maintenance-model'
import type { VariantAttributes } from './variant-attributes'
import { digest } from './digest'
import { now } from './clock'
import { imageArchive } from './image-archive'

type Rule = 'style_color_position' | 'sku_position'
type Held = { name: string; style?: string; color?: string; sku?: string; position?: string; image?: ImageRef; reason: string }
type Media = { rule: Rule; held: Held[] }
type Row = Held & { targets: string[] }
export const mediaKey = 'bulk-images'
export async function bulkMedia(db: D1Database) {
 const row = await db.prepare('SELECT value_json,revision FROM bw_settings WHERE key=?').bind(mediaKey).first<{ value_json: string; revision: string }>()
 return { value: row ? JSON.parse(row.value_json) as Media : { rule: 'style_color_position' as Rule, held: [] }, revision: row?.revision ?? null }
}
const guard = (db: D1Database, key: string, revision: string | null) => db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key=?),'')=? THEN 1 ELSE 0 END").bind(key, revision ?? '')
const setting = (db: D1Database, key: string, value: unknown, revision: string) => db.prepare('INSERT INTO bw_settings(key,value_json,revision) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(key, JSON.stringify(value), revision)
function targets(file: Held, variants: Record<string, VariantAttributes>) {
 return Object.keys(variants).sort().filter(sku => file.sku ? sku === file.sku : variants[sku].style === file.style && variants[sku].color === file.color)
}
function attach(variants: Record<string, VariantAttributes>, file: Held, skus: string[]) {
 for (const sku of skus) {
  const current = variants[sku], imageSlots = { ...current.imageSlots, [file.position!]: file.image! }
  variants[sku] = { ...current, imageSlots, ...(file.position === '1' ? { image: file.image } : {}) }
 }
}
/** Called inside each catalog mutation's atomic batch; reads never attach or mutate held files. */
export async function reconcileHeldImages(db: D1Database, variants: Record<string, VariantAttributes>, revision: string) {
 const prior = await bulkMedia(db), held: Held[] = []
 for (const file of prior.value.held) {
  const skus = file.image ? targets(file, variants) : []
  // An existing slot always wins over an older held upload.
  const vacant = skus.filter(sku => !variants[sku].imageSlots?.[file.position!] && !(file.position === '1' && variants[sku].image))
  if (vacant.length) attach(variants, file, vacant)
  if (!skus.length) held.push(file)
  else if (vacant.length !== skus.length) held.push({ ...file, reason: 'Matching slot already has an image: re-upload explicitly to replace it.' })
 }
 return prior.revision ? [guard(db, mediaKey, prior.revision), setting(db, mediaKey, { ...prior.value, held }, revision)] : []
}
export async function readBulkImages(db: D1Database, actor: Actor) {
 requireCatalogOwner(actor)
 const [media, attributes] = await Promise.all([bulkMedia(db), db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='variant-attributes'").first<{ value_json: string; revision: string }>()])
 const variants = JSON.parse(attributes?.value_json ?? '{}') as Record<string, VariantAttributes>
 return { rule: media.value.rule, revision: media.revision, held: media.value.held, slots: Object.entries(variants).flatMap(([sku, value]) => Object.entries(value.imageSlots ?? (value.image ? { '1': value.image } : {})).map(([position, image]) => ({ sku, position, ...image }))) }
}
export async function prepareBulkImages(db: D1Database, actor: Actor, input: any) {
 requireCatalogOwner(actor)
 const rule: Rule = input?.rule
 if (!['style_color_position', 'sku_position'].includes(rule)) fail('IMAGE_RULE', 'Choose style_color_position or sku_position.', 400)
 const files = input.archive ? imageArchive(input.archive.base64) : input.files
 if (!Array.isArray(files) || !files.length || files.length > 1000) fail('IMAGE_BATCH', 'Choose between 1 and 1,000 files.', 400)
 if (files.reduce((n: number, file: any) => n + (typeof file?.base64 === 'string' ? file.base64.length : 0), 0) > 42 * 1024 * 1024) fail('IMAGE_BATCH', 'Split batches larger than 30 MiB into separate uploads.', 400)
 const [prior, attributes] = await Promise.all([bulkMedia(db), db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='variant-attributes'").first<{ value_json: string; revision: string }>()])
 const variants = JSON.parse(attributes?.value_json ?? '{}') as Record<string, VariantAttributes>, rows: Row[] = [], images = new Map<string, Awaited<ReturnType<typeof decodedImage>>>()
 const occupied = new Set<string>(), names = new Set<string>()
 for (const file of files) {
  const name = text(file?.name, 'Image filename', 180)
  if (/[\\/\u0000-\u001f]/.test(name) || names.has(name)) fail('IMAGE_NAME', 'Use distinct plain filenames without directory paths.', 400)
  names.add(name)
  const row: Row = { name, targets: [], reason: '' }
  if (!/\.jpe?g$/i.test(name)) row.reason = 'Unsupported type: only JPEG product images are accepted.'
  else if (typeof file.base64 !== 'string' || file.base64.length > 279000) row.reason = 'Oversize: each JPEG must be at most 200 KiB.'
  else {
   const stem = name.replace(/\.jpe?g$/i, ''), parts = stem.split('_'), position = parts.pop()
   if (!position || !/^[1-9][0-9]?$/.test(position) || parts.length !== (rule === 'style_color_position' ? 2 : 1) || parts.some(part => !part)) row.reason = 'Malformed name: use the selected naming rule and a position from 1 to 99.'
   else {
    Object.assign(row, { position, ...(rule === 'style_color_position' ? { style: parts[0], color: parts[1] } : { sku: parts[0] }) })
    try {
     const image = await decodedImage(file.base64)
     row.image = { sha256: image.sha256, width: image.width, height: image.height, size: image.bytes.length }
     images.set(image.sha256, image)
     row.targets = targets(row, variants)
     row.reason = row.targets.length ? '' : 'Unknown style, color or variant: held until a matching product is imported.'
     if (row.targets.some(sku => occupied.has(JSON.stringify([sku, position])))) fail('IMAGE_SLOT', 'Two files in this batch select the same variant and position. Choose one.', 400)
     for (const sku of row.targets) occupied.add(JSON.stringify([sku, position]))
    } catch (error) {
     if (error instanceof Error && 'code' in error && error.code === 'IMAGE') row.reason = 'Unsupported type: JPEG content is invalid or exceeds the image limits.'
     else throw error
    }
   }
  }
  rows.push(row)
 }
 const fingerprint = await digest(JSON.stringify({ rule, rows, mediaRevision: prior.revision, attributesRevision: attributes?.revision ?? null }))
 return { prior, variants, attributesRevision: attributes?.revision ?? null, rows, images, fingerprint, rule }
}
export async function previewBulkImages(db: D1Database, actor: Actor, input: any) {
 const prepared = await prepareBulkImages(db, actor, input)
 return { fingerprint: prepared.fingerprint, rows: prepared.rows, matched: prepared.rows.filter(row => row.targets.length).length, held: prepared.rows.filter(row => !row.targets.length).length }
}
export async function applyBulkImages(db: D1Database, actor: Actor, input: any) {
 const prepared = await prepareBulkImages(db, actor, input)
 if (input.fingerprint !== prepared.fingerprint) fail('IMAGE_CHANGED', 'The batch or catalog changed. Preview again and approve the current fingerprint.')
 const revision = crypto.randomUUID(), at = (await now()).toISOString(), { variants, rows } = prepared
 const replacing = new Set(rows.map(row => row.name))
 const held = prepared.prior.value.held.filter(row => !replacing.has(row.name))
 for (const row of rows) {
  if (row.targets.length) attach(variants, row, row.targets)
  else { const { targets: _targets, ...file } = row; held.push(file) }
 }
 if (held.length > 10000) fail('IMAGE_HELD_LIMIT', 'Review held files before retaining more than 10,000 unmatched files.', 400)
 await commit(db, actor, [guard(db, mediaKey, prepared.prior.revision), guard(db, 'variant-attributes', prepared.attributesRevision),
  ...[...prepared.images.values()].map(image => storeImage(db, image, actor.id, at)),
  setting(db, mediaKey, { rule: prepared.rule, held }, revision), setting(db, 'variant-attributes', variants, revision),
  audit(db, actor, mediaKey, 'catalog.images-applied', { revision, source: 'bulk-images.apply', reason: `Approved fingerprint ${prepared.fingerprint}; ${rows.filter(row => row.targets.length).length} matched files and ${rows.filter(row => !row.targets.length).length} held files. JPEG metadata removed; no malware verdict.` }),
 ])
 return readBulkImages(db, actor)
}
