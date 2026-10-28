import type { Bindings } from '../auth.server'
import { boundedJson } from '@runeditrun/rer/modules/portability/http'
import { account } from './accounts'
import { requireActiveAccount } from './account-profile'
import { digest } from './digest'
import { catalogue } from './pier'
import { catalogStore } from './catalog-maintenance-model'
import { variantAttributes } from './variant-attributes'
import { readLocations } from './locations'
import { readQuotes } from './quotes'
import { readOrder, orderCommand } from './orders'
import { companyOrderScope } from './company-access'
import { requireCompanyRight } from './company-policy'
import { resolveBuyingProfile } from './buying-profiles'
import { invoiceCsv } from './invoice'
import { fulfillmentReport } from './fulfillment'
import { staffRequestGate, staffCommandGate } from './staff-access'
import { requireUsageTerms } from './usage-terms'
import { now } from './clock'
import { effectiveBook } from './currency'
import { fail, Problem, type Actor } from './model'
import { createIntegrationGrant, integrationGrants, integrationId, revokeIntegrationGrant } from './integration-grants'

const prefix='/api/barrow/v1'
const json=(value:unknown)=>Response.json(value,{headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
const resources=['products','variants','accounts','locations','price-books','quotes','orders','invoices','fulfillment']
function scope(actor:Actor,accountId:string,permission:'catalog:read'|'order:prepare') {
 if(!actor.agent)return
 if(!actor.integration)fail('FORBIDDEN','Use an explicitly scoped integration grant for the versioned API.',403)
 if(actor.integration.accountId!==accountId)fail('FORBIDDEN','This integration grant covers one account only.',403)
 if(!actor.integration.scopes.includes(permission))fail('FORBIDDEN','This operation is outside the integration grant.',403)
}
/** Cursors bind the exact resource, account, profile and collection revision.
 * Changed collections restart explicitly rather than skipping or duplicating rows.
 */
async function page(rows:any[],url:URL,context:string) {
 const raw=url.searchParams.get('limit')??'50'
 if(!/^[1-9]\d{0,2}$/.test(raw)||Number(raw)>100)fail('INPUT','Use a page limit from one to 100.',400)
 const limit=Number(raw),ordered=rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)
 const snapshot=await digest(JSON.stringify(ordered)),cursor=url.searchParams.get('cursor')
 let after=''
 if(cursor!==null) {
  let decoded:any
  try{if(cursor.length>2000)throw Error();decoded=JSON.parse(atob(cursor.replaceAll('-','+').replaceAll('_','/')))}catch{fail('CURSOR','Use the returned pagination cursor.',400)}
  if(decoded?.context!==context||typeof decoded.after!=='string'||typeof decoded.snapshot!=='string')fail('CURSOR','This cursor belongs to another entity scope.',400)
  if(decoded.snapshot!==snapshot)fail('CHANGED','This collection changed. Restart pagination from its first page.')
  if(!ordered.some(row=>row.id===decoded.after))fail('CURSOR','The pagination position is unavailable.',400)
  after=decoded.after
 }
 const remaining=ordered.filter(row=>row.id>after),data=remaining.slice(0,limit)
 const nextCursor=remaining.length>limit?btoa(JSON.stringify({context,snapshot,after:data.at(-1).id})).replaceAll('+','-').replaceAll('/','_'):null
 return json({version:1,data,snapshot,nextCursor})
}
async function orderRows(env:Bindings,actor:Actor,accountId:string) {
 const visibility=companyOrderScope(actor,'account_id','value_json')
 const ids=(await env.DB.prepare('SELECT id FROM bw_orders WHERE account_id=?'+visibility.sql+' ORDER BY id').bind(accountId,...visibility.values).all<{id:string}>()).results
 return Promise.all(ids.map(row=>readOrder(env.DB,actor,row.id)))
}
async function prepare(request:Request,env:Bindings,actor:Actor) {
 const p=await boundedJson(request,100000) as any
 const accountId=integrationId(p?.accountId,'Account ID');scope(actor,accountId,'order:prepare')
 if(typeof p.accountRevision!=='string'||!p.accountRevision||p.accountRevision.length>100)fail('INPUT','Supply the current account revision.',400)
 if(!['USD','CAD','EUR','GBP'].includes(p.currency))fail('CURRENCY','Supply an explicit supported ISO currency.',400)
 for(const key of ['profileId','billToId','shipToId','replaces'])if(p[key]!==undefined)integrationId(p[key],key)
 await requireUsageTerms(env,actor,accountId)
 await staffCommandGate(env,actor,'order.prepare',p)
 return json({version:1,result:await orderCommand(env,actor,'order.prepare',p)})
}
/** Native exchange keeps the canonical door's current rights and validation. */
export async function integrationResponse(request:Request,env:Bindings,actor:Actor,forward:(request:Request)=>Promise<Response|null>) {
 const url=new URL(request.url),relative=url.pathname.slice(prefix.length)
 if(!['GET','HEAD'].includes(request.method)&&!actor.agent&&request.headers.get('origin')!==env.AUTH_ORIGIN)fail('ORIGIN','Use this installation’s own origin.',403)
 if(relative==='/grants') {
  if(request.method==='GET')return json(await integrationGrants(env,actor,url.searchParams.get('accountId')??''))
  if(request.method==='POST')return json(await createIntegrationGrant(env,actor,await boundedJson(request,10000)))
 }
 if(relative==='/grants/revoke'&&request.method==='POST')return json(await revokeIntegrationGrant(env,actor,await boundedJson(request,10000)))
 if(relative==='/orders/prepare'&&request.method==='POST')return prepare(request,env,actor)
 if(!actor.agent) {
  const aliases:Record<string,string>={
   '/commands':'/commands',
   '/imports/catalog/preview':'/catalog-maintenance/preview','/imports/catalog/apply':'/catalog-maintenance/apply',
   '/imports/companies/preview':'/imports/preview','/imports/companies/apply':'/imports/apply',
  }
  if(request.method==='POST'&&Object.hasOwn(aliases,relative)) {
   url.pathname='/api/barrow'+aliases[relative]
   const forwarded=await forward(new Request(url,request));if(forwarded)return forwarded
  }
 }
 if(request.method!=='GET'||!resources.includes(relative.slice(1)))fail('FORBIDDEN','This versioned API operation is not permitted.',403)
 const resource=relative.slice(1),accountId=integrationId(url.searchParams.get('accountId'),'Account ID'),profileId=url.searchParams.get('profileId')
 if(profileId!==null)integrationId(profileId,'Buying profile ID')
 if(actor.agent&&!['products','variants','price-books'].includes(resource))fail('PERSON_REQUIRED','A native person must read commercial records, invoices and fulfillment.',403)
 scope(actor,accountId,'catalog:read')
 await requireUsageTerms(env,actor,accountId)
 const nativeDoor:Record<string,string>={products:'catalogue',variants:'catalogue',accounts:'accounts',locations:'locations','price-books':'catalogue',quotes:'quotes',orders:'orders/history',invoices:'invoices/list.csv',fulfillment:'reports/fulfillment'}
 await staffRequestGate(env,actor,'/api/barrow/'+nativeDoor[resource],'GET')
 const base=await account(env.DB,actor,accountId)
 let rows:any[]=[]
 if(['products','variants','price-books'].includes(resource)) {
  await requireCompanyRight(env.DB,actor,accountId,'purchasing')
  const selected=(await resolveBuyingProfile(env.DB,actor,base,profileId)).selected
  requireActiveAccount(selected)
  const book=effectiveBook(selected,await now())
  if(resource==='price-books')rows=[{id:selected.buyingProfile?.id??accountId,accountId,revision:selected.buyingProfile?.revision??base.revision,currency:book.value.currency??'USD',prices:book.value.prices}]
  else {
   const offers=await catalogue(env,selected),attributes=await variantAttributes(env.DB),catalog=await catalogStore(env.DB)
   rows=offers.items.map(item=>{const listing=catalog.listings.find(row=>row.sku===item.sku);return {...item,...attributes.variants[item.sku],id:item.itemId,externalId:listing?.variantKey??item.sku,accountId,currency:offers.currency,revision:base.revision,attributesRevision:attributes.revision,catalogRevision:listing?.revision??null,attributes:listing?.attributes??{},categories:listing?.categories??[],assortments:listing?.assortments??[],listing:listing?.listing??'listed'}})
  }
 } else if(resource==='accounts')rows=[actor.staff&&!['sales-manager','rep'].includes(actor.staff.role)?{...base,value:{...base.value,prices:[]}}:base]
 else if(resource==='locations')rows=await readLocations(env.DB,actor,accountId)
 else if(resource==='quotes')rows=await readQuotes(env.DB,actor,accountId)
 else if(resource==='orders'||resource==='invoices') {
  if(resource==='invoices')await requireCompanyRight(env.DB,actor,accountId,'finance')
  const orders=await orderRows(env,actor,accountId)
  if(resource==='orders')rows=orders
  else {
   const credited=new Set((await env.DB.prepare('SELECT DISTINCT order_id FROM bw_credit_notes WHERE account_id=?').bind(accountId).all<{order_id:string}>()).results.map(row=>row.order_id))
   for(const order of orders) {
    // The JSON exchange uses the same eligibility rule as the canonical invoice export.
    try{invoiceCsv(order,credited.has(order.id))}catch(error){if(error instanceof Problem&&error.code==='NOT_RESERVED')continue;throw error}
    rows.push({id:order.invoice!.number,accountId,orderId:order.id,revision:order.revision,currency:order.currency??'AUD',totalCents:order.totalCents,invoice:order.invoice,lines:order.lines,delivery:order.delivery,buyingProfile:order.buyingProfile,invoiceStatus:order.status==='cancelled'?'withdrawn; original preserved with linked credit':'issued',sourceOrderId:order.pierOrderId,exportPath:`/api/barrow/invoices/${order.id}.csv`})
   }
  }
 } else if(resource==='fulfillment') {
  const report=await fulfillmentReport(env,actor,new URLSearchParams({accountId}))
  if(report.status!=='read'||report.exceptions.length)fail('SOURCE_UNAVAILABLE','Current source-confirmed fulfillment is unavailable; no quantities are inferred.',503)
  rows=report.lines.map(line=>({...line,id:line.orderId+':'+line.sku,source:report.source}))
 }
 // A credential can expire or be revoked while a source read is in flight.
 if(actor.integration) {
  const {integrationCredential}=await import('./integration-grants')
  if(!await integrationCredential(env,request.headers.get('authorization')!.slice(7)))fail('AUTH','Integration authority changed during this request.',401)
 }
 return page(rows,url,JSON.stringify([resource,accountId,profileId]))
}
