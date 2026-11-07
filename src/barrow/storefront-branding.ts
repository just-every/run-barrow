import { audit, commit } from './access'
import { fail, requirePerson, text, type Actor } from './model'
import { defaultStorefrontBranding, storefrontAccents, storefrontCanvases, type StorefrontBranding } from './storefront-branding-options'
import { displayMode } from './price-display'
import { variantAttributes } from './variant-attributes'
import { type ImageRef } from './product-images'

export async function storefrontBranding(db: D1Database): Promise<StorefrontBranding> {
 const row = await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='storefront-branding'").first<{value_json:string;revision:string}>()
 return row ? {...defaultStorefrontBranding,...JSON.parse(row.value_json), revision: row.revision} : {...defaultStorefrontBranding}
}

function owner(actor: Actor) {
 requirePerson(actor)
 if (actor.role !== 'owner' || actor.staff) fail('FORBIDDEN', 'Only the signed-in owner may publish the storefront identity.', 403)
}

/** Only the deliberately published logo is rendered; private collection membership stays out of global state. */
export async function storefrontAppearance(db: D1Database, actor: Actor) {
 const value = await storefrontBranding(db)
 const image = value.logo && await db.prepare('SELECT content_base64 FROM bw_product_images WHERE sha256=?').bind(value.logo.sha256).first<{content_base64:string}>()
 return {...value, collections: actor.role==='owner' && !actor.agent && !actor.staff ? value.collections : [], ...(image ? {logoSrc:'data:image/jpeg;base64,'+image.content_base64} : {})}
}

export async function storefrontSettings(db: D1Database, actor: Actor) {
 owner(actor)
 const attributes = await variantAttributes(db)
 const images = new Map<string, ImageRef>()
 for (const variant of Object.values(attributes.variants)) for (const ref of [variant.image,...Object.values(variant.imageSlots ?? {})]) if (ref) images.set(ref.sha256,ref)
 const branding = await storefrontBranding(db)
 if (branding.logo) images.set(branding.logo.sha256,branding.logo)
 return {branding, images:[...images.values()]}
}

/** Merchandising is an intersection of the current priced assortment, never another grant. */
export async function storefrontCatalogue(db: D1Database, skus: string[]) {
 const value = await storefrontBranding(db), eligible = new Set(skus)
 return {priceDisplay:value.priceDisplay, collections:value.collections.map(collection=>({...collection,skus:collection.skus.filter(sku=>eligible.has(sku))})).filter(collection=>collection.skus.length)}
}

/** Display settings never change legal sellers, buyer rights or recorded commercial facts. */
export async function saveStorefrontBranding(db: D1Database, actor: Actor, p: any) {
 owner(actor)
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
 const priceDisplay = displayMode(p.priceDisplay ?? prior.priceDisplay)
 const collectionInput = p.collections ?? prior.collections
 if (!Array.isArray(collectionInput) || collectionInput.length > 12) fail('INPUT', 'Configure at most twelve storefront collections.', 400)
 const ids = new Set<string>()
 const collections = collectionInput.map((entry:any) => {
  const id = text(entry?.id,'Collection ID',60), name = text(entry?.name,'Collection name',80)
  if (!/^[a-z0-9-]+$/.test(id) || ids.has(id)) fail('INPUT','Use distinct collection IDs containing lowercase letters, numbers and hyphens.',400)
  ids.add(id)
  if (!Array.isArray(entry.skus) || !entry.skus.length || entry.skus.length > 2000) fail('INPUT','Each collection needs between one and 2,000 exact SKUs.',400)
  const skus = entry.skus.map((sku:unknown)=>text(sku,'Collection SKU',100))
  if (new Set(skus).size !== skus.length) fail('INPUT','A collection cannot repeat a SKU.',400)
  return {id,name,skus}
 })
 const navigationInput = p.navigation ?? prior.navigation
 if (!Array.isArray(navigationInput) || navigationInput.length !== 3 || new Set(navigationInput.map((entry:any)=>entry?.page)).size !== 3) fail('INPUT','Keep Catalog, Line sheets and Orders in the storefront navigation.',400)
 const navigation = navigationInput.map((entry:any)=>{
  if (!['catalog','sheets','orders'].includes(entry?.page)) fail('INPUT','Choose an existing storefront page.',400)
  return {page:entry.page as StorefrontBranding['navigation'][number]['page'],label:text(entry.label,'Navigation label',30)}
 })
 if (new Set(navigation.map(entry=>entry.label.toLowerCase())).size !== navigation.length) fail('INPUT','Use a different label for each storefront page.',400)
 const logoSha = p.logoSha256 === undefined ? prior.logo?.sha256 : p.logoSha256
 const available = await storefrontSettings(db,actor)
 const logo = logoSha ? available.images.find(ref=>ref.sha256===logoSha) : undefined
 if (logoSha && !logo) fail('INPUT','Choose a currently stored, accepted product image for the logo.',400)
 if (logo && !await db.prepare('SELECT sha256 FROM bw_product_images WHERE sha256=?').bind(logo.sha256).first()) fail('CHANGED','The selected logo is no longer stored. Reload the available images.')
 const revision = crypto.randomUUID()
 const value = { displayName, supportUrl: contact.href, accent: p.accent, canvas: p.canvas, priceDisplay, collections, navigation, ...(logo?{logo}:{}) }
 await commit(db, actor, [
  db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='storefront-branding'),'')=? THEN 1 ELSE 0 END").bind(prior.revision ?? ''),
  ...(logo ? [db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_product_images WHERE sha256=?) THEN 1 ELSE 0 END').bind(logo.sha256)] : []),
  db.prepare("INSERT INTO bw_settings VALUES('storefront-branding',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(value), revision),
  audit(db, actor, 'storefront-branding', 'storefront.published', {revision, source:'storefront.save', reason}),
 ])
 return {...value, revision} as StorefrontBranding
}
