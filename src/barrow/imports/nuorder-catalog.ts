import type { Bindings } from '../../auth.server'
import { catalogContext, type CatalogListing } from '../catalog-maintenance-model'
import { catalogSource } from '../catalog-maintenance-preview'
import { storeImage } from '../product-images'
import type { NuorderCatalog } from './nuorder'

export async function planNuorderCatalog(env:Bindings,catalog:NuorderCatalog,errors:string[]) {
 const [context,items]=await Promise.all([catalogContext(env.DB),catalogSource(env)])
 if (!items) errors.push('Pier product check did not run; reconnect before applying')
 const listings=new Map(context.store.listings.map(row=>[row.sku,row])),variants={...context.attributes.variants}
 const refs=catalog.images.map(({sku,name,slot,image})=>({sku,name,slot,sha256:image.sha256,width:image.width,height:image.height,size:image.size}))
 for (const product of catalog.products) {
  const item=items?.find(item=>item.sku===product.sku)
  if (items&&(!item||item.archived&&!product.archived)) errors.push(`Mapped SKU ${product.sku} is absent or archived in Pier; correct the source mapping in Pier first`)
  if (item&&product.upc!==item.barcode) errors.push(`UPC for ${product.sku} differs from Pier; source-owned identifiers must be corrected there first`)
  const image=refs.find(ref=>ref.sku===product.sku&&ref.slot===1),prior=listings.get(product.sku)
  const row:CatalogListing={sku:product.sku,variantKey:product.id,style:product.style,color:product.color,size:product.size,attributes:{season:product.season,upc:product.upc},categories:prior?.categories??[],assortments:prior?.assortments??[],mediaSha256:product.archived?'':image?.sha256??prior?.mediaSha256??'',listing:product.archived?'removed':'listed',sourceItemId:item?.id??'',source:'Pier',revision:''}
  listings.set(product.sku,row)
  const slots=new Map((prior?.mediaSlots??[]).map(ref=>[ref.slot,ref]))
  for(const ref of refs.filter(ref=>ref.sku===product.sku))slots.set(ref.slot,ref)
  row.mediaSlots=[...slots.values()].sort((a,b)=>a.slot-b.slot)
  if (!product.archived) variants[product.sku]={style:product.style,color:product.color,size:product.size,...(image?{image:{sha256:image.sha256,width:image.width,height:image.height,size:image.size}}:variants[product.sku]?.image?{image:variants[product.sku].image}:{})}
 }
 const keys=new Set<string>()
 for (const row of listings.values()) if (row.listing==='listed') {if(keys.has(row.variantKey))errors.push(`Variant key ${row.variantKey} already belongs to another SKU`);keys.add(row.variantKey)}
 if(listings.size>20000||Object.keys(variants).length>20000)errors.push('Catalog exceeds the 20,000 variant limit')
 const counts={products:catalog.products.length,archivedProducts:catalog.products.filter(p=>p.archived).length,images:refs.length}
 const report={source:counts,planned:{...counts},images:refs,heldImages:catalog.heldImages.map(({name,image})=>({name,sha256:image.sha256,reason:'No variant matches the filename rule; held privately for a later product import'})),imageRule:catalog.imageRule,missingImages:catalog.missingImages,columns:catalog.columns,skuCheck:items?'Checked read-only in Pier':'Did not run: Pier unavailable'}
 return {report,context,listings:[...listings.values()].sort((a,b)=>a.sku.localeCompare(b.sku)),variants,items,catalog}
}
export function nuorderCatalogStatements(db:D1Database,plan:Awaited<ReturnType<typeof planNuorderCatalog>>,by:string,at:string,revision:string) {
 return [
  ...[['catalog-maintenance',plan.context.store.revision],['variant-attributes',plan.context.attributes.revision]].map(([key,prior])=>db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key=?),'')=? THEN 1 ELSE 0 END").bind(key,prior??'')),
  ...plan.catalog.images.map(({image})=>storeImage(db,{...image,bytes:Uint8Array.from(atob(image.base64),char=>char.charCodeAt(0))},by,at)),
  db.prepare("INSERT INTO bw_settings VALUES('catalog-maintenance',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(plan.listings.map(row=>({...row,revision}))),revision),
  db.prepare("INSERT INTO bw_settings VALUES('variant-attributes',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(plan.variants),revision),
 ]
}
