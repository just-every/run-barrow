import type { Bindings } from '../auth.server'
import { priceLine } from './pricing'
import { now } from './clock'
import { account } from './accounts'
import { readOrder } from './orders'
import { catalogue } from './pier'
import { prepareLines } from './unit-lines'
import { convertQuantity, sellingUnits } from './units'
import { digest } from './access'
import { fail, text, supplierDate, type Actor, type Order } from './model'
import { activeShipTo } from './locations'
import { requireActiveAccount } from './account-profile'

export type ReorderSelection = { sku: string; unit?: string; replacementSku?: string; replacementUnit?: string }
export type ReorderReview = {
 orderId: string; accountId: string; sourceRevision: string; accountRevision: string
 selections: ReorderSelection[]; deliveryLocation: string; shipToId?: string; currency: 'USD'|'CAD'; originalCurrency: 'USD'|'AUD'|'CAD'
 termsDays: number; originalTermsDays: number; minimumCents: number; totalCents: number
 lines: { originalSku: string; originalUnit?: string; originalBaseQuantity:string; originalConversion:string; baseUnit?:string; unit?: string; baseQuantity?: string; conversion?: string; sku: string; quantity: number; originalUnitCents: number; originalLineCents:number; lineCents:number|null; unitCents: number|null; originalMinQty: number; minQty: number|null; available: string|null; differences: string[]; pricing?:import('./pricing').PricingSnapshot }[]
 blockers: string[]; blockingCodes:string[]; fingerprint: string
}

/** Build the comparison from current authority, never caller-supplied prices or quantities. */
export async function reviewReorder(env: Bindings, actor: Actor, payload: any) {
 const original = await readOrder(env.DB, actor, text(payload.orderId,'Original order'))
 if (!['submitted','reserving','shortfall','approved'].includes(original.status)) fail('REORDER','Choose an order that was submitted, rather than a draft.')
 const selected = await account(env.DB, actor, original.accountId)
 requireActiveAccount(selected)
 const available = await catalogue(env, selected)
 if (!Array.isArray(payload.selections) || !payload.selections.length || payload.selections.length > 100) fail('LINES','Select between one and 100 original lines.',400)
 const seen = new Set<string>(), targets = new Set<string>()
 const selections:ReorderSelection[] = payload.selections.map((line:any) => {
  const sku=text(line?.sku,'Original SKU',100), unit=line.unit===undefined ? undefined : text(line.unit,'Original unit',32)
  const candidates=original.lines.filter(line=>line.sku===sku && (unit===undefined || line.unit===unit))
  if(candidates.length!==1) fail('LINES','Select one original SKU and unit unambiguously.',400)
  const before=candidates[0], key=JSON.stringify([sku,before.unit??''])
  if(seen.has(key)) fail('LINES','Select each original SKU and unit at most once.',400)
  seen.add(key)
  const replacementSku=line.replacementSku ? text(line.replacementSku,'Replacement SKU',100) : undefined
  const replacementUnit=line.replacementUnit ? text(line.replacementUnit,'Replacement unit',32) : undefined
  return {sku,...(before.unit ? {unit:before.unit} : {}),...(replacementSku && replacementSku!==sku ? {replacementSku} : {}),...(replacementUnit ? {replacementUnit} : {})}
 }).sort((a:ReorderSelection,b:ReorderSelection)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
 const blockers:string[] = [],blockingCodes:string[] = []
 const date=supplierDate(await now())
 const lines = selections.map(selection => {
  const before=original.lines.find(line=>line.sku===selection.sku && line.unit===selection.unit)!, sku=selection.replacementSku??selection.sku
  const offer=available.items.find(item=>item.sku===sku)
  const code=selection.replacementUnit ?? selection.unit ?? offer?.unit
  const unit=offer ? sellingUnits(offer).find(unit=>unit.code===code) : undefined
  const key=JSON.stringify([sku,code]);if(targets.has(key)) fail('LINES','Choose distinct target SKU/unit pairs; quantities are never silently merged.',400);targets.add(key)
  const differences:string[]=[]
  if(sku!==before.sku) differences.push(`Replacement: ${before.sku} → ${sku}`)
  if(!offer || !unit) {differences.push('SKU or selling unit unavailable on the current account assortment');blockers.push(`${sku}: choose an available replacement or selling unit, or deselect this line.`);blockingCodes.push(offer?'UNIT':'SKU')}
  if(unit && (unit.unitCents!==before.unitCents || (original.currency??'AUD')!==available.currency)) differences.push('Unit price or currency changed')
  if(offer && offer.minQty!==before.minQty) differences.push('Minimum quantity changed')
  if(unit && (code!==before.unit || unit.baseQuantity!==(before.conversion??'1'))) differences.push('Selling unit or conversion changed')
  const baseQuantity=unit ? convertQuantity(before.quantity,unit.baseQuantity) : undefined
  const priced=unit ? priceLine(before.quantity,unit.unitCents,unit.pricing,date) : undefined
  const lineCents=priced?.lineCents??null
  if(priced && (lineCents!==(before.lineCents??before.quantity*before.unitCents)||JSON.stringify(priced.pricing)!==JSON.stringify(before.pricing))) differences.push('Pricing rule or line total changed')
  return {originalSku:before.sku,originalUnit:before.unit,originalBaseQuantity:before.baseQuantity??String(before.quantity),originalConversion:before.conversion??'1',baseUnit:offer?.unit,unit:code,baseQuantity,conversion:unit?.baseQuantity,sku,quantity:before.quantity,originalUnitCents:before.unitCents,originalLineCents:before.lineCents??before.quantity*before.unitCents,lineCents,unitCents:priced?.unitCents??null,pricing:priced?.pricing,originalMinQty:before.minQty,minQty:offer?.minQty??null,available:offer?.available??null,differences}
 })
 if(!blockers.length) {
  try {prepareLines(lines.map(line=>({sku:line.sku,unit:line.unit,quantity:line.quantity})),available.items)}
  catch(error) {if(error instanceof Error && 'code' in error) {blockers.push(error.message);blockingCodes.push(String(error.code))}else throw error}
 }
 const totalCents=lines.reduce((sum,line)=>sum+(line.lineCents??0),0)
 if(!Number.isSafeInteger(totalCents)) fail('MONEY','Order total is outside the supported exact-cent range.',400)
 if(totalCents<selected.value.minimumCents) {blockers.push(`Selected lines do not meet the current order minimum of ${selected.value.minimumCents} ${available.currency} cents.`);blockingCodes.push('ORDER_MINIMUM')}
 const review = {orderId:original.id,accountId:selected.id,sourceRevision:original.revision,accountRevision:selected.revision,selections,deliveryLocation:original.deliveryLocation ?? '',...(await activeShipTo(env.DB,selected.id,original.shipTo?.id)?{shipToId:original.shipTo!.id}:{}),currency:available.currency,originalCurrency:original.currency ?? 'AUD',termsDays:selected.value.termsDays,originalTermsDays:original.termsDays,minimumCents:selected.value.minimumCents,totalCents,lines,blockers,blockingCodes}
 return {review:{...review,fingerprint:await digest(JSON.stringify(review))} as ReorderReview,selected,available}
}
