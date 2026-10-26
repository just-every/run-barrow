// ORD-014 product images under the conservative default pending ct's CAT-002 product-media ruling: only the owner or
// admin uploads one baseline/progressive RGB or grayscale JPEG per variant; EXIF, XMP, ICC and comment segments are
// removed before hashing; bytes live only in this installation's D1 (and its archives), keyed by SHA-256. An image
// stays while any variant, order line or recorded confirmation names it, so retained documents never change.
import { fail } from './model'

export type ImageRef = { sha256: string; width: number; height: number; size: number }
export type StoredImage = { bytes: Uint8Array<ArrayBuffer>; width: number; height: number; components: 1 | 3 }
const maxBytes = 200 * 1024
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
const invalid = (message = 'Upload a baseline or progressive RGB or grayscale JPEG product image.') => fail('IMAGE', message, 400)

/** Keep coding segments, JFIF (APP0) and Adobe color (APP14); drop every other APPn and comment. */
export function jpegImage(bytes: Uint8Array): StoredImage {
 if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid()
 const kept: Uint8Array[] = [bytes.subarray(0, 2)]
 let at = 2, width = 0, height = 0, components = 0, scan = false
 while (at + 4 <= bytes.length) {
  if (bytes[at] !== 0xff) invalid('The JPEG structure is damaged.')
  const marker = bytes[at + 1]
  if (marker === 0xff) { at++; continue }
  if (marker === 0xda) { kept.push(bytes.subarray(at)); scan = true; break }
  if (marker === 0xd9) break
  const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3])
  if (end > bytes.length || end < at + 4) invalid('The JPEG structure is damaged.')
  if ([0xc0, 0xc1, 0xc2].includes(marker)) { height = (bytes[at + 5] << 8) | bytes[at + 6]; width = (bytes[at + 7] << 8) | bytes[at + 8]; components = bytes[at + 9] }
  else if (marker >= 0xc3 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) invalid()
  if (!(marker >= 0xe1 && marker <= 0xef && marker !== 0xee || marker === 0xfe)) kept.push(bytes.subarray(at, end))
  at = end
 }
 if (!scan || !width || !height || ![1, 3].includes(components)) invalid()
 if (width > 4000 || height > 4000) invalid('Product images are limited to 4000 by 4000 pixels.')
 const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0))
 let offset = 0
 for (const part of kept) { out.set(part, offset); offset += part.length }
 if (out[out.length - 2] !== 0xff || out[out.length - 1] !== 0xd9) invalid('The JPEG is truncated.')
 if (out.length > maxBytes) invalid('Product images are limited to 200 KiB after metadata removal.')
 return { bytes: out, width, height, components: components as 1 | 3 }
}
export async function decodedImage(value: unknown) {
 if (typeof value !== 'string' || !value || value.length > Math.ceil(maxBytes * 4 / 3) + 4096) invalid('Upload a JPEG product image of at most 200 KiB.')
 let binary: string
 try { binary = atob(value as string) } catch { return invalid() }
 const image = jpegImage(Uint8Array.from(binary, char => char.charCodeAt(0)))
 return { ...image, sha256: hex(await crypto.subtle.digest('SHA-256', image.bytes)) }
}
export function storeImage(db: D1Database, image: StoredImage & { sha256: string }, by: string, at: string) {
 let binary = ''
 for (let index = 0; index < image.bytes.length; index += 0x8000) binary += String.fromCharCode(...image.bytes.subarray(index, index + 0x8000))
 return db.prepare('INSERT INTO bw_product_images(sha256,width,height,components,size,content_base64,created_by,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(sha256) DO NOTHING').bind(image.sha256, image.width, image.height, image.components, image.bytes.length, btoa(binary), by, at)
}
/** Deletes the bytes only when no variant, order line or recorded confirmation still names them. */
export const releaseImage = (db: D1Database, sha256: string) => db.prepare(`DELETE FROM bw_product_images WHERE sha256=?
 AND NOT EXISTS(SELECT 1 FROM bw_settings s,json_each(s.value_json) v WHERE s.key='variant-attributes' AND json_extract(v.value,'$.image.sha256')=?)
 AND NOT EXISTS(SELECT 1 FROM bw_settings s,json_each(s.value_json) v WHERE s.key='catalog-maintenance' AND json_extract(v.value,'$.mediaSha256')=?)
 AND NOT EXISTS(SELECT 1 FROM bw_orders o,json_each(o.value_json,'$.lines') l WHERE json_extract(l.value,'$.image.sha256')=?)
 AND NOT EXISTS(SELECT 1 FROM bw_confirmations c,json_each(c.value_json,'$.lines') l WHERE json_extract(l.value,'$.image.sha256')=?)`).bind(sha256, sha256, sha256, sha256, sha256)
export async function readImages(db: D1Database, refs: (ImageRef | undefined)[]) {
 const keys = [...new Set(refs.flatMap(ref => ref ? [ref.sha256] : []))]
 if (!keys.length) return new Map<string, StoredImage>()
 const rows = (await db.prepare('SELECT sha256,width,height,components,content_base64 FROM bw_product_images WHERE sha256 IN (SELECT value FROM json_each(?))').bind(JSON.stringify(keys)).all<{ sha256: string; width: number; height: number; components: 1 | 3; content_base64: string }>()).results
 return new Map(rows.map(row => [row.sha256, { width: row.width, height: row.height, components: row.components, bytes: Uint8Array.from(atob(row.content_base64), char => char.charCodeAt(0)) }]))
}
