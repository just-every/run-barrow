import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { account } from './accounts'
import { catalogue } from './pier'
import { fail, integer, requirePerson, supplierDate, text, type Actor, type Line } from './model'
import { now } from './clock'
import { prepareLines } from './unit-lines'
import { priceLine } from './pricing'
export type Promotion = { id:string; name:string; kind:'fixed'|'mix'; accounts:string[]; skus:string[]; quantities:Record<string,number>; minimumUnits:number; from:string; to:string; bps:number; priority:number; stackable:boolean }
export type PromotionLine = { basisCents:number; discountCents:number; offers:{id:string;name:string;discountCents:number}[] }
export const promotionRule='Automatic once per placed order, attributed to its frozen offer IDs. Highest priority qualifies first (ID breaks ties); an exclusive winner replaces account and group discounts and excludes other offers. Otherwise only stackable offers apply in priority order to remaining cents. Approved overrides and negotiated quotes are excluded. Fixed bundles require every listed base-unit quantity; mix offers count eligible base units. Half-up cents per line; returns credit only original net cents with the final return receiving rounding residue. No retroactive requalification.'
export function promotionAdmin(actor:Actor) { requirePerson(actor);if(actor.staff||!['owner','admin'].includes(actor.role))fail('FORBIDDEN','Only supplier owners and admins configure promotions.',403) }
export async function promotionSettings(db:D1Database) {
 const row=await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='promotions'").first<{value_json:string;revision:string}>()
 return {offers:row?JSON.parse(row.value_json) as Promotion[]:[],revision:row?.revision??null,rule:promotionRule}
}
export async function savePromotions(env:Bindings,actor:Actor,p:any) {
 promotionAdmin(actor)
 if(!Array.isArray(p.offers)||p.offers.length>50)fail('PROMOTION','Use at most 50 offers.',400)
 const seen=new Set<string>(),offers:Promotion[]=p.offers.map((v:any)=>{
  if(!v||typeof v!=='object'||Array.isArray(v))fail('PROMOTION','Each offer must be an object.',400)
  const id=text(v.id,'Offer ID',80);if(seen.has(id))fail('PROMOTION','Offer IDs must be unique.',400);seen.add(id)
  if(!['fixed','mix'].includes(v.kind)||typeof v.stackable!=='boolean')fail('PROMOTION','Choose fixed or mix and explicit stacking.',400)
  for(const d of [v.from,v.to])if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)fail('PROMOTION','Use valid inclusive calendar dates.',400)
  if(v.from>v.to)fail('PROMOTION','Offer dates are reversed.',400)
  const strings=(a:any,label:string)=>{if(!Array.isArray(a)||!a.length||a.length>100||new Set(a).size!==a.length)fail('PROMOTION',`Choose distinct ${label}.`,400);return a.map(x=>text(x,label,100))}
  const skus=strings(v.skus,'SKUs'),accounts=strings(v.accounts,'accounts'),quantities:Record<string,number>={}
  if(v.kind==='fixed')for(const sku of skus)quantities[sku]=integer(v.quantities?.[sku],'Bundle base units',1,1000000)
  return {id,name:text(v.name,'Offer name',100),kind:v.kind,accounts,skus,quantities,minimumUnits:integer(v.minimumUnits??1,'Minimum base units',1,1000000),from:v.from,to:v.to,bps:integer(v.bps,'Discount basis points',1,10000),priority:integer(v.priority??0,'Priority',0,1000000),stackable:v.stackable}
 })
 for(const offer of offers)for(const id of offer.accounts)await account(env.DB,actor,id)
 const revision=crypto.randomUUID(),current=await promotionSettings(env.DB)
 if(p.revision!==current.revision)fail('CHANGED','Reload promotion settings before saving.',409)
 await commit(env.DB,actor,[env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='promotions'),'')=? THEN 1 ELSE 0 END").bind(current.revision??''),env.DB.prepare("INSERT INTO bw_settings VALUES('promotions',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(offers),revision),changed(env.DB),audit(env.DB,actor,'settings:promotions','promotions.saved',{revision,source:'promotion.save',reason:'Supplier published explicit dated account offers and stacking precedence.'})])
 return {offers,revision,rule:promotionRule}
}
export function applyPromotions(lines:Line[],offers:Promotion[],accountId:string,date:string):Line[] {
 const eligible=(offer:Promotion)=>lines.filter(line=>offer.skus.includes(line.sku)&&!line.quote&&!line.pricing?.reason.startsWith('Approved override:'))
 const candidates=offers.filter(o=>o.accounts.includes(accountId)&&date>=o.from&&date<=o.to).filter(o=>{const rows=eligible(o);return o.kind==='fixed'?o.skus.every(sku=>rows.filter(l=>l.sku===sku).reduce((s,l)=>s+Number(l.baseQuantity??l.quantity),0)>=o.quantities[sku]):rows.reduce((s,l)=>s+Number(l.baseQuantity??l.quantity),0)>=o.minimumUnits}).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))
 const chosen=candidates[0]?.stackable?candidates.filter(o=>o.stackable):candidates.slice(0,1)
 return lines.map(line=>{
  const applicable=chosen.filter(o=>eligible(o).includes(line));if(!applicable.length)return line
  let basis=line.lineCents!,net=basis
  if(!applicable[0].stackable&&line.pricing){const rule={...line.pricing.rule,accountDiscountBps:undefined,groupDiscount:undefined};basis=net=priceLine(line.quantity,line.unitCents,rule,date).lineCents}
  const applied=applicable.map(o=>{const next=Number((BigInt(net)*BigInt(10000-o.bps)+5000n)/10000n),discountCents=net-next;net=next;return {id:o.id,name:o.name,discountCents}})
  return {...line,lineCents:net,promotion:{basisCents:basis,discountCents:basis-net,offers:applied}}
 })
}
export async function promotionPreview(env:Bindings,actor:Actor,p:any) {
 promotionAdmin(actor);const selected=await account(env.DB,actor,text(p.accountId,'Account')),catalog=await catalogue(env,selected)
 if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>100)fail('LINES','Choose one to 100 lines.',400)
 const date=supplierDate(await now()),before=prepareLines(p.lines,catalog.items,date),settings=await promotionSettings(env.DB),lines=applyPromotions(before,settings.offers,selected.id,date)
 const currentTotalCents=before.reduce((s,l)=>s+l.lineCents!,0)
 const totalCents=lines.reduce((s,l)=>s+l.lineCents!,0),basisCents=lines.reduce((s,l)=>s+(l.promotion?.basisCents??l.lineCents!),0)
 // Cost is an explicit supplier scenario, never a claim about unrecorded inventory cost.
 const costCents=p.costCents===undefined?null:integer(p.costCents,'Scenario cost cents',0,1000000000)
 return {lines,currentTotalCents,totalCents,basisCents,discountCents:basisCents-totalCents,currency:catalog.currency,costCents,beforeMarginCents:costCents===null?null:currentTotalCents-costCents,marginCents:costCents===null?null:totalCents-costCents,marginImpactCents:costCents===null?null:totalCents-currentTotalCents,marginBps:costCents===null||!totalCents?null:Math.round((totalCents-costCents)*10000/totalCents),rule:promotionRule}
}
