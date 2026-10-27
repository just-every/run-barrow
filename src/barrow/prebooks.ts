import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { audit, changed, commit } from './access'
import { resolveBuyingProfile, orderBuyingProfile, type BuyingProfileSnapshot } from './buying-profiles'
import { companyPurchaserLimit, companyRightsGuard, requireCompanyRight } from './company-policy'
import { now } from './clock'
import { freshnessLimit } from './freshness'
import { fail, integer, requirePerson, supplierDate, text, type Actor, type Line } from './model'
import { catalogue, decimal, pierOrigin, pierState } from './pier'
import { purchaseDetails } from './purchase'
import { prepareLines } from './unit-lines'
import { termsAtSubmission, type TermsAcceptance } from './sales-terms'

type Season={id:string;name:string;opensAt:string;closesAt:string;depositBps:number;restored?:boolean;closed?:{by:string;at:string;reason:string};revision:string}
type Prebook={id:string;accountId:string;accountRevision:string;buyingProfile?:BuyingProfileSnapshot;season:Season;warehouses?:string[];lines:Line[];totalCents:number;currency:'USD'|'AUD'|'CAD';termsDays:number;deposit:{requiredCents:number;currency:string;collectedCents:null};state:'draft'|'committed';preparedBy:string;preparedAt:string;committedBy?:string;committedAt?:string;pierOrigin:string;termsAcceptance?:TermsAcceptance;revision:string}
type Row={value_json:string;revision:string}
const seasonRow=(db:D1Database,id:string)=>db.prepare('SELECT value_json,revision FROM bw_prebook_seasons WHERE id=?').bind(id).first<Row>()
const parse=<T>(row:Row):T=>({...JSON.parse(row.value_json),revision:row.revision})
function owner(actor:Actor){requirePerson(actor);if(!['owner','admin'].includes(actor.role)||actor.staff)fail('FORBIDDEN','Only the supplier owner or admin publishes or closes intake.',403)}
function instant(value:unknown){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail('INPUT','Publish a complete instant with timezone.',400);return new Date(value).toISOString()}
function open(season:Season,at:Date){const stamp=at.toISOString();if(season.restored||season.closed||stamp<season.opensAt||stamp>=season.closesAt)fail('PREBOOK_CLOSED','This season is outside its published intake window.')}
const seasonGuard=(db:D1Database,season:Season)=>db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_prebook_seasons WHERE id=? AND revision=? AND json_extract(value_json,'$.closed') IS NULL AND json_extract(value_json,'$.opensAt')<=? AND json_extract(value_json,'$.closesAt')>?) THEN 1 ELSE 0 END").bind(season.id,season.revision,new Date().toISOString(),new Date().toISOString())
export async function readPrebook(env:Bindings,actor:Actor,id:string){
 requirePerson(actor)
 const row=await env.DB.prepare('SELECT value_json,revision FROM bw_prebooks WHERE id=?').bind(id).first<Row>()
 if(!row)fail('NOT_FOUND','Prebook not found.',404)
 const value=parse<Prebook>(row);await account(env.DB,actor,value.accountId)
 const member=await requireCompanyRight(env.DB,actor,value.accountId,'purchasing');if(member&&member.locations!=='all')fail('FORBIDDEN','Prebook intake currently requires company-wide location authority.',403)
 return value
}
/** Demand commitments are not stock reservations. Pier's dated incoming supply remains authoritative. */
async function capacity(env:Bindings,selected:Awaited<ReturnType<typeof account>>,lines:Line[],exclude?:string){
 const frontier=(await env.DB.prepare('SELECT revision FROM bw_prebook_frontier WHERE singleton=1').first<{revision:number}>())!.revision
 const held=(await env.DB.prepare("SELECT value_json,revision FROM bw_prebooks WHERE id<>? AND json_extract(value_json,'$.state')='committed'").bind(exclude??'').all<Row>()).results.map(row=>parse<Prebook>(row))
 const state=await pierState(env),warehouses=new Set<string>((state.locations??[]).filter((location:any)=>location.kind==='bin').map((location:any)=>location.warehouse)),allowed=selected.value.warehouses
 const origin=(await pierOrigin(env))!
 // Allocate every earlier obligation first, across accounts and seasons, then this candidate.
 const demand=[...held.filter(row=>row.pierOrigin===origin).flatMap(row=>row.lines),...lines].sort((a,b)=>a.requestedDate!.localeCompare(b.requestedDate!))
 const supplies=(state.purchaseOrders??[]).filter((po:any)=>po.status==='committed'&&po.promiseDate&&warehouses.has(po.destinationWarehouse)).flatMap((po:any)=>(po.lines??[]).map((line:any)=>({itemId:line.itemId,date:po.promiseDate,warehouse:po.destinationWarehouse,remaining:decimal(line.quantity)-decimal(line.received??'0')}))).sort((a:any,b:any)=>a.date.localeCompare(b.date))
 // Existing commitments retain their own warehouse restrictions, never the new buyer's scope.
 const restrictions=new Map<Line,string[]|undefined>()
 for(const row of held)for(const line of row.lines)restrictions.set(line,row.warehouses)
 for(const line of demand){
  let remaining=decimal(line.baseQuantity!),scope=restrictions.has(line)?restrictions.get(line):allowed
  for(const source of supplies)if(source.itemId===line.itemId&&source.date<=line.requestedDate!&&(!scope?.length||scope.includes(source.warehouse))&&source.remaining>0n){const used=remaining<source.remaining?remaining:source.remaining;remaining-=used;source.remaining-=used;if(remaining===0n)break}
  if(remaining>0n)fail('PREBOOK_CAPACITY',`${line.sku}: dated incoming supply in permitted known receiving warehouses cannot cover all existing commitments and this request.`)
 }
 return {guard:env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN revision=? THEN 1 ELSE 0 END FROM bw_prebook_frontier WHERE singleton=1').bind(frontier),origin}
}
export async function prebookCommand(env:Bindings,actor:Actor,type:string,p:any){
 requirePerson(actor)
 if(type==='prebook.season'||type==='prebook.close'){
  owner(actor);const id=text(p.id,'Season ID',100),before=await seasonRow(env.DB,id),previous=before?parse<Season>(before):undefined
  if((previous?.revision??null)!==(p.revision??null))fail('CHANGED','Refresh this season before changing intake.')
  const revision=crypto.randomUUID(),at=(await now()).toISOString(),reason=text(p.reason,'Intake reason',1000)
  let season:Season
  if(type==='prebook.close'){if(!previous)fail('NOT_FOUND','Season not found.',404);season={...previous,closed:{by:actor.id,at,reason},revision}}
  else{if(previous)fail('PREBOOK_IMMUTABLE','Published seasons are immutable; close intake or publish a new season.');const opensAt=instant(p.opensAt),closesAt=instant(p.closesAt);if(opensAt>=closesAt)fail('INPUT','Closing must follow opening.',400);season={id,name:text(p.name,'Season name'),opensAt,closesAt,depositBps:integer(p.depositBps,'Deposit basis points',0,10000),revision}}
  await commit(env.DB,actor,[previous?env.DB.prepare('UPDATE bw_prebook_seasons SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(season),revision,id,previous.revision):env.DB.prepare('INSERT INTO bw_prebook_seasons VALUES(?,?,?)').bind(id,JSON.stringify(season),revision),changed(env.DB),audit(env.DB,actor,id,type,{revision,source:type,reason})]);return season
 }
 if(type==='prebook.prepare'){
  const base=await account(env.DB,actor,text(p.accountId,'Account')),profile=await resolveBuyingProfile(env.DB,actor,base,p.profileId),selected=profile.selected
  requireActiveAccount(selected);const member=await requireCompanyRight(env.DB,actor,selected.id,'purchaser');if(member&&member.locations!=='all')fail('FORBIDDEN','Prebook intake currently requires company-wide location authority.',403)
  const row=await seasonRow(env.DB,text(p.seasonId,'Season'));if(!row)fail('NOT_FOUND','Season not found.',404)
  const season=parse<Season>(row),at=await now();open(season,at)
  if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>100)fail('LINES','Choose between one and 100 lines.',400)
  if(p.lines.some((line:any)=>line.profileId!==undefined&&line.profileId!==selected.buyingProfile?.id||line.brandId!==undefined&&line.brandId!==selected.buyingProfile?.brandId))fail('SELLER_MIX','Every line must belong to the selected buying profile.')
  const offers=await catalogue(env,selected),today=supplierDate(at)
  const lines=prepareLines(p.lines,offers.items,today,false).map((line,index)=>{const dates=purchaseDetails(p.lines[index],today);if(!dates.requestedDate||!dates.cancelAfter||dates.requestedDate<=today)fail('PREBOOK_DATES','Each prebook line needs a future ship date and its cancel-after date.',400);return {...line,requestedDate:dates.requestedDate,cancelAfter:dates.cancelAfter}})
  const totalCents=lines.reduce((sum,line)=>sum+line.lineCents!,0);if(!Number.isSafeInteger(totalCents))fail('MONEY','Total exceeds the exact-cent range.',400)
  if(totalCents<selected.value.minimumCents)fail('MINIMUM','Prebook does not meet the current account minimum.')
  const checked=await capacity(env,selected,lines),id='PB-'+crypto.randomUUID(),revision=crypto.randomUUID()
  const value:Prebook={id,accountId:selected.id,accountRevision:selected.revision,...(selected.buyingProfile?{buyingProfile:selected.buyingProfile}:{}),season,...(selected.value.warehouses?{warehouses:[...selected.value.warehouses]}:{}),lines,totalCents,currency:offers.currency,termsDays:selected.value.termsDays,deposit:{requiredCents:Number((BigInt(totalCents)*BigInt(season.depositBps)+5000n)/10000n),currency:offers.currency,collectedCents:null},state:'draft',preparedBy:actor.id,preparedAt:at.toISOString(),pierOrigin:checked.origin,revision}
  await commit(env.DB,actor,[profile.guard,activeAccountGuard(env.DB,selected),companyRightsGuard(env.DB,member),seasonGuard(env.DB,season),env.DB.prepare('INSERT INTO bw_prebooks VALUES(?,?,?,?)').bind(id,selected.id,JSON.stringify(value),revision),audit(env.DB,actor,id,type,{accountId:selected.id,revision,source:type,reason:'Prepared future demand at current prices; no stock reservation, invoice or payment.'})]);return value
 }
 if(type==='prebook.commit'){
  if(actor.staff||['owner','admin'].includes(actor.role))fail('BUYER_REQUIRED','The company purchaser must review and commit this prebook.',403)
  const before=await readPrebook(env,actor,text(p.prebookId,'Prebook'))
  if(before.state==='committed')return before
  if(before.revision!==p.revision)fail('CHANGED','Review the current prebook revision.')
  const profile=await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,before.accountId),before),selected=profile.selected
  requireActiveAccount(selected);const member=await requireCompanyRight(env.DB,actor,selected.id,'purchaser');if(member&&member.locations!=='all')fail('FORBIDDEN','Prebook intake currently requires company-wide location authority.',403)
  if(selected.revision!==before.accountRevision)fail('PRICE_CHANGED','Account prices or terms changed. Prepare a new prebook.')
  const limit=member?companyPurchaserLimit(member):null
  if(limit!==null&&(before.currency!=='USD'||before.totalCents>limit))fail('COMPANY_APPROVAL','This commitment needs company approval; prebook approval routing is not available yet.')
  if((await env.DB.prepare("SELECT 1 FROM bw_company_routes WHERE account_id=? AND json_array_length(policy_json,'$.rules')>0 LIMIT 1").bind(selected.id).first()))fail('COMPANY_APPROVAL','Company approval routing must be completed before commitment.')
  const row=await seasonRow(env.DB,before.season.id);if(!row)fail('NOT_FOUND','Season not found.',404);const season=parse<Season>(row),at=await now();open(season,at)
  const minutes=await freshnessLimit(env.DB);if(minutes!==undefined&&at.getTime()-Date.parse(before.preparedAt)>minutes*60000)fail('STOCK_STALE','Prepare again at current incoming supply before commitment.')
  const offers=await catalogue(env,selected),current=prepareLines(before.lines,offers.items,supplierDate(at),false)
  if(JSON.stringify(current)!==JSON.stringify(before.lines.map(({requestedDate,cancelAfter,...line})=>line)))fail('PRICE_CHANGED','Current units or prices changed. Prepare a new prebook.')
  for(const line of before.lines)if(line.requestedDate!<=supplierDate(at))fail('PREBOOK_DATES','The ship date is no longer future. Prepare a new prebook.')
  const checked=await capacity(env,selected,before.lines,before.id);if(checked.origin!==before.pierOrigin)fail('PIER_CHANGED','Reconnect the original stock authority before committing.')
  const terms=await termsAtSubmission(env,actor,selected,before.id,p.termsAcceptance,at.toISOString()),revision=crypto.randomUUID(),value:Prebook={...before,state:'committed',committedBy:actor.id,committedAt:at.toISOString(),...(terms.acceptance?{termsAcceptance:terms.acceptance}:{}),revision}
  await commit(env.DB,actor,[profile.guard,activeAccountGuard(env.DB,selected),companyRightsGuard(env.DB,member),env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_company_routes WHERE account_id=? AND json_array_length(policy_json,'$.rules')>0) THEN 1 ELSE 0 END").bind(selected.id),seasonGuard(env.DB,season),checked.guard,terms.guard,...terms.statements,env.DB.prepare('UPDATE bw_prebooks SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,value.id,before.revision),changed(env.DB),env.DB.prepare('UPDATE bw_prebook_frontier SET revision=revision+1 WHERE singleton=1'),audit(env.DB,actor,value.id,type,{accountId:value.accountId,revision,source:type,reason:'Buyer committed future demand against dated incoming supply; deposit is a requirement only, not a recorded collection.'})]);return value
 }
 fail('COMMAND','Unknown prebook command.',400)
}
