import { fail, integer, text, type Line } from './model'
import { decimal } from './pier'
import { convertQuantity, priceQuantity, quantityMicro, sellingUnits, type UnitDefinition } from './units'

type Offer = {sku:string;itemId:string;name:string;unit:string;unitCents:number;minQty:number;available:string;units?:UnitDefinition[]}
export function prepareLines(input:any[],offers:Offer[]):Line[] {
 const seen=new Set<string>(),totals=new Map<string,bigint>()
 const lines:Line[]=input.map(line=>{
  const sku=text(line?.sku,'SKU',100),offer=offers.find(offer=>offer.sku===sku)
  if(!offer) fail('PRICE','This item is not on this customer’s active price list.')
  const code=line.unit===undefined ? offer.unit : text(line.unit,'Selling unit',32)
  const unit=sellingUnits(offer).find(unit=>unit.code===code)
  if(!unit) fail('UNIT',`${sku}: ${code} has no defined conversion or price.`,400)
  const key=JSON.stringify([sku,code]);if(seen.has(key)) fail('LINES','Each SKU and selling unit may appear only once.',400);seen.add(key)
  const quantity=unit.quantityKind==='measured' && !['case','pallet'].includes(code.toLowerCase()) ? Number(line.quantity) : integer(line.quantity,'Quantity',1,1000000)
  quantityMicro(line.quantity)
  if(!Number.isFinite(quantity)) fail('INPUT','Use a valid positive quantity.',400)
  const baseQuantity=convertQuantity(line.quantity,unit.baseQuantity)
  const base=decimal(baseQuantity)
  totals.set(sku,(totals.get(sku)??0n)+base)
  const lineCents=line.unit===undefined || code===offer.unit ? quantity*unit.unitCents : priceQuantity(line.quantity,unit.unitCents)
  if(!Number.isSafeInteger(lineCents)) fail('MONEY','Line total is outside the supported exact-cent range.',400)
  return {sku,name:offer.name,itemId:offer.itemId,quantity,unitCents:unit.unitCents,minQty:offer.minQty,unit:code,baseUnit:offer.unit,conversion:unit.baseQuantity,baseQuantity,packContents:unit.packContents,lineCents}
 })
 for(const [sku,quantity] of totals) {
  const offer=offers.find(offer=>offer.sku===sku)!
  if(quantity<BigInt(offer.minQty)*1000000n) fail('MINIMUM',`${sku} has a minimum quantity of ${offer.minQty} ${offer.unit}.`)
  if(quantity>decimal(offer.available)) fail('STOCK',`${sku} no longer has enough promiseable stock across its selected units. Refresh the catalog.`)
 }
 return lines
}
