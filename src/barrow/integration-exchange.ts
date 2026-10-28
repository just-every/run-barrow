import type { Bindings } from '../auth.server'
import { account, accountCommand } from './accounts'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { audit, commit } from './access'
import { now } from './clock'
import { validateAccountValue } from './imports'
import { buildCatalogMaintenance } from './catalog-maintenance-preview'
import { applyCatalogMaintenance } from './catalog-maintenance'
import { catalogWorkbook } from './catalog-maintenance-workbook'
import { saveVariantAttributes, variantAttributes } from './variant-attributes'
import { locationCommand, locationValue, type LocationKind } from './locations'
import { importPriceBook, priceBookValue } from './price-books'
import { quoteCommand } from './quotes'
import { dispatchQuoteMail } from './quote-mail'
import { catalogue } from './pier'
import { prepareLines } from './unit-lines'
import { requireUsageTerms } from './usage-terms'
import { integrationAdmission, integrationGrantActor, integrationId, type IntegrationScope } from './integration-grants'
import { fail, supplierDate, text, type Actor } from './model'

const entities=['products','variants','accounts','locations','price-books','quotes'] as const
type Entity=typeof entities[number]
type Proposal={version:1;entity:Entity;accountId:string;accountRevision:string;currency:string;grantId:string;grantRevision:string;expiresAt:number;preparedBy:string;payload:any;basis:unknown}
export type ExchangeAdmission={credential:Actor;accountRevision:string;fingerprint:string;entity:Entity;reason:string}
const canonical=(value:any):string=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(item=>JSON.parse(canonical(item))):Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,JSON.parse(canonical(value[key]))])):value)
async function fingerprint(env:Bindings,proposal:Proposal) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(canonical(proposal)))),byte=>byte.toString(16).padStart(2,'0')).join('')
}
function fields(value:any,allowed:string[]) {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('INPUT','Use only the documented fields for this entity preparation.',400)
}
/** No entity writes: a scoped credential can prepare an exact, reviewable intent only. */
async function prepare(env:Bindings,credential:Actor,p:any) {
 const grant=credential.integration
 if(!grant||!credential.agent)fail('FORBIDDEN','Use an explicit integration grant to prepare an exchange.',403)
 fields(p,['entity','accountId','accountRevision','currency','payload'])
 if(!entities.includes(p.entity))fail('INPUT','Choose a documented entity preparation.',400)
 const entity=p.entity as Entity,accountId=integrationId(p.accountId,'Account ID')
 if(accountId!==grant.accountId||!grant.scopes.includes((entity+':prepare') as IntegrationScope))fail('FORBIDDEN','This entity or account is outside the integration grant.',403)
 const selected=await account(env.DB,credential,accountId);requireActiveAccount(selected)
 if(p.accountRevision!==selected.revision)fail('CHANGED','Refresh the account revision before preparing this exchange.')
 if(p.currency!==(selected.value.currency??'USD'))fail('CURRENCY','Use the account’s current explicit ISO currency.',400)
 await requireUsageTerms(env,credential,accountId)
 let payload=p.payload,basis:unknown=selected.revision
 if(entity==='accounts') {
  fields(payload,['id','revision','value','duplicateReviews'])
  if(payload.id!==accountId)fail('FORBIDDEN','A company change must name the grant’s existing account.',403)
  if(payload.revision!==selected.revision)fail('CHANGED','Refresh the company before preparing a change.')
  const value=validateAccountValue(payload.value)
  if(value.email!==selected.value.email)fail('ACCOUNT_EMAIL','An integration cannot reassign company identity.',400)
  payload={...payload,value}
 } else if(entity==='products'||entity==='variants') {
  const allowed=new Set(selected.value.prices.map(row=>row.sku))
  const sku=(value:unknown)=>{const result=text(value,'SKU',100);if(!allowed.has(result))fail('FORBIDDEN','Catalog preparation is limited to the account’s existing assortment.',403);return result}
  if(entity==='products') {
   fields(payload,['workbook'])
   const workbook=await catalogWorkbook(payload.workbook)
   for(const row of workbook.rows)sku(row.values.sku)
   const {report}=await buildCatalogMaintenance(env,payload)
   if(!report.canApply)fail('CATALOG_INVALID','Correct the scoped workbook before review; source-owned edits must be made in Pier.',400)
   // The full native report may name other suppliers' listings; only its opaque basis leaves this door.
   basis=report.fingerprint
  } else {
   fields(payload,['revision','variants'])
   const prior=await variantAttributes(env.DB)
   if(payload.revision!==prior.revision)fail('CHANGED','Refresh the variant revision before preparing changes.')
   if(!Array.isArray(payload.variants)||!payload.variants.length||payload.variants.length>200)fail('INPUT','Prepare one to 200 variant rows.',400)
   const seen=new Set<string>()
   payload={revision:prior.revision,variants:payload.variants.map((row:any)=>{
    fields(row,['sku','style','color','size']);const key=sku(row.sku)
    if(seen.has(key))fail('INPUT','Each variant SKU must be distinct.',400);seen.add(key)
    return {sku:key,style:text(row.style,'Style',100),color:text(row.color,'Color',60),size:text(row.size,'Size',30)}
   })}
   basis=prior.revision
  }
 } else if(entity==='locations') {
  fields(payload,['accountId','id','revision','kind','value','makeDefault'])
  if(payload.accountId!==accountId)fail('FORBIDDEN','The location must belong to the grant’s account.',403)
  let kind=payload.kind as LocationKind
  if(payload.id!==undefined) {
   integrationId(payload.id,'Location ID')
   const prior=await env.DB.prepare('SELECT kind,revision,archived FROM bw_locations WHERE id=? AND account_id=?').bind(payload.id,accountId).first<any>()
   if(!prior)fail('NOT_FOUND','Location not found.',404)
   if(prior.archived||payload.revision!==prior.revision)fail('CHANGED','Refresh the active location before preparing changes.')
   kind=prior.kind;basis=prior.revision
  }
  if(!['bill-to','ship-to','contact'].includes(kind))fail('INPUT','Choose bill-to, ship-to or contact.',400)
  payload={...payload,kind,value:locationValue(kind,payload.value)}
 } else if(entity==='price-books') {
  fields(payload,['accountId','revision','csv'])
  if(payload.accountId!==accountId)fail('FORBIDDEN','The price book must belong to the grant’s account.',403)
  await priceBookValue(selected,payload)
 } else {
  fields(payload,['type','accountId','quoteId','revision','lines','note','termsDays','shipping','validUntil'])
  if(!['quote.request','quote.propose'].includes(payload.type)||payload.accountId!==accountId)fail('FORBIDDEN','Prepare a request or revision for the grant’s account only.',403)
  if(payload.type==='quote.propose') {
   integrationId(payload.quoteId,'Quote ID')
   const prior=await env.DB.prepare('SELECT revision FROM bw_quotes WHERE id=? AND account_id=?').bind(payload.quoteId,accountId).first<{revision:string}>()
   if(!prior)fail('NOT_FOUND','Quote not found.',404)
   if(payload.revision!==prior.revision)fail('CHANGED','Refresh the quote before preparing a revision.')
   basis=prior.revision
  }
  if(!Array.isArray(payload.lines)||!payload.lines.length||payload.lines.length>100)fail('LINES','Choose one to 100 quote lines.',400)
  const offers=await catalogue(env,selected)
  const lines=prepareLines(payload.lines,offers.items,supplierDate(await now()),false)
  basis={revision:basis,lines}
 }
 const proposal:Proposal={version:1,entity,accountId,accountRevision:selected.revision,currency:p.currency,grantId:grant.id,grantRevision:grant.revision,expiresAt:grant.expiresAt,preparedBy:'agent:'+grant.id,payload,basis}
 return {proposal,fingerprint:await fingerprint(env,proposal)}
}
export async function prepareIntegrationExchange(env:Bindings,actor:Actor,p:any) {
 const result=await prepare(env,actor,p),g=actor.integration!
 await commit(env.DB,actor,[activeAccountGuard(env.DB,await account(env.DB,actor,g.accountId)),audit(env.DB,actor,g.id,'integration.prepared',{accountId:g.accountId,revision:result.fingerprint,source:'integration.exchange.'+result.proposal.entity,reason:'Prepared an exact entity change for a person’s review; no entity changed.'})])
 return {version:1,...result,requiresPerson:true}
}
export async function applyIntegrationExchange(request:Request,env:Bindings,actor:Actor,p:any,apply=true) {
 if(actor.agent||actor.role!=='owner'||actor.staff)fail('PERSON_REQUIRED','Only the signed-in owner may review and apply a prepared exchange.',403)
 const supplied=p?.proposal
 if(!supplied||supplied.version!==1)fail('INPUT','Supply the complete prepared proposal.',400)
 const credential=await integrationGrantActor(env,supplied.grantId)
 if(!credential)fail('AUTH','The preparing grant or its issuer is no longer authorized.',401)
 const prepared=await prepare(env,credential,{entity:supplied.entity,accountId:supplied.accountId,accountRevision:supplied.accountRevision,currency:supplied.currency,payload:supplied.payload})
 if(canonical(supplied)!==canonical(prepared.proposal)||p.fingerprint!==prepared.fingerprint)fail('CHANGED','The proposal, grant or source changed. Prepare and review it again.')
 if(!apply)return {version:1,...prepared,requiresPerson:true}
 if(p.confirm!==true)fail('CONSENT','Explicitly confirm the exact reviewed proposal.',400)
 const reason=text(p.reason,'Exchange approval reason',1000)
 if(await env.DB.prepare('SELECT 1 FROM bw_audit WHERE id=?').bind(prepared.fingerprint).first())fail('ALREADY_APPLIED','This exact proposal was already applied; no second change is made.')
 const {entity,payload,accountRevision}=prepared.proposal
 const person:Actor={...actor,exchange:{credential,accountRevision,fingerprint:prepared.fingerprint,entity,reason}}
 await requireUsageTerms(env,person,prepared.proposal.accountId)
 let result:unknown
 if(entity==='accounts')result=await accountCommand(request,env,person,'account.save',{...payload,reason})
 else if(entity==='products')result=await applyCatalogMaintenance(env,person,{...payload,fingerprint:prepared.proposal.basis,reason,approveRemoved:true})
 else if(entity==='variants')result=await saveVariantAttributes(env.DB,person,payload)
 else if(entity==='locations')result=await locationCommand(env.DB,person,'location.save',payload)
 else if(entity==='price-books')result=await importPriceBook(env,person,payload)
 else {result=await quoteCommand(env,person,payload.type,payload);await dispatchQuoteMail(env)}
 return {version:1,result,receipt:{id:prepared.fingerprint,grantId:credential.grantId,preparedBy:prepared.proposal.preparedBy,appliedBy:actor.id,entity}}
}
/** Grant, account, replay receipt and native effect share the native command's atomic batch. */
export async function exchangeAdmission(db:D1Database,actor:Actor,exchange:ExchangeAdmission) {
 const {credential,fingerprint,entity,reason,accountRevision}=exchange,grant=credential.integration!
 credential.integrationAt=(await now()).getTime()
 return [integrationAdmission(db,credential),
  db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(grant.accountId,accountRevision),
  db.prepare('INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json) VALUES(?,?,?,?,?,?)').bind(fingerprint,grant.id,actor.id,'integration.applied',(await now()).toISOString(),JSON.stringify({accountId:grant.accountId,revision:fingerprint,source:'integration.exchange.'+entity,reason:JSON.stringify({reason,preparedBy:'agent:'+grant.id,appliedBy:actor.id,grantRevision:grant.revision})})),
 ]
}
