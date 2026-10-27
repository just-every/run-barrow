import type { Bindings } from '../auth.server'
import { faireConnection, faireSourcePage, type SourceOrder } from './faire'
import { digest } from './digest'
import { fail } from './model'
import type { ConnectorIssue } from './pier-review'

/** A bounded live comparison. Source settlement stays at Faire; matching never collects money. */
export async function previewFaireBrand(env:Bindings,owner:string,brand:string,previous?:any) {
 const at=new Date().toISOString(),issues:ConnectorIssue[]=[]
 const attention=(record:string,kind:string,message:string)=>issues.push({record,kind,message,owner,action:'Review this original Faire order, preview source pages and repair its account and SKU mappings, then inspect again.'})
 const sync=await env.DB.prepare('SELECT * FROM bw_faire_sync WHERE brand=?').bind(brand).first<any>()
 const rows=(await env.DB.prepare('SELECT * FROM bw_faire_orders WHERE brand=? ORDER BY source_id').bind(brand).all<any>()).results
 const accounts=(await env.DB.prepare('SELECT id,revision,value_json FROM bw_accounts ORDER BY id').all<{id:string;revision:string;value_json:string}>()).results
 const guards=[
  env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_object('revision',revision,'enabled',enabled,'cursor',cursor,'complete',complete,'generation',generation) FROM bw_faire_sync WHERE brand=?)=? THEN 1 ELSE 0 END").bind(brand,JSON.stringify({revision:sync.revision,enabled:sync.enabled,cursor:sync.cursor,complete:sync.complete,generation:sync.generation})),
  env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(source_id,revision,source_json,matched_json,state)) FROM (SELECT * FROM bw_faire_orders WHERE brand=? ORDER BY source_id))=? THEN 1 ELSE 0 END').bind(brand,JSON.stringify(rows.map(row=>[row.source_id,row.revision,row.source_json,row.matched_json,row.state]))),
  env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(id,revision,value_json)) FROM (SELECT id,revision,value_json FROM bw_accounts ORDER BY id))=? THEN 1 ELSE 0 END').bind(JSON.stringify(accounts.map(row=>[row.id,row.revision,row.value_json]))),
 ]
 let result:any={brand,state:'unavailable',enabled:Boolean(sync?.enabled),checkedAt:at,lastSuccessfulAt:previous?.lastSuccessfulAt??null,lastSyncAt:sync?.completed_at??null,lagSeconds:sync?.completed_at?Math.max(0,Math.floor((Date.parse(at)-Date.parse(sync.completed_at))/1000)):null,samples:previous?.samples??[],totals:previous?.totals??[],duplicates:previous?.duplicates??[],authority:{orders:'Faire',prices:'Faire',settlement:'Faire',accounts:'Barrow',inventory:'Pier'},mapping:'Explicit source retailer to trade account; source SKU to reviewed account SKU.'}
 try {
  const config=faireConnection(env,brand)
  if(!sync||sync.revision!==await digest(JSON.stringify([config.origin,brand])))fail('FAIRE_DESTINATION','Reconnect the retained Faire destination.')
  const source:SourceOrder[]=[],cursors=new Set<string>();let cursor:string|null=null
  for(let page=0;page<20;page++) {
   const read=await faireSourcePage(env,brand,cursor);source.push(...read.orders)
   if(!read.next)break
   if(cursors.has(read.next)||page===19)fail('FAIRE_RECONCILIATION','The complete source preview was not available within the bounded read.')
   cursors.add(read.next);cursor=read.next
  }
  const ids=new Set<string>(),totals=new Map<string,{currency:string;sourceCount:number;nativeCount:number;sourceCents:number;nativeCents:number;differenceCents:number}>(),retailers=new Map<string,Set<string>>()
  for(const order of source) {
   if(ids.has(order.id))fail('FAIRE_RECONCILIATION','The source repeated an order across pages.')
   ids.add(order.id)
   const row=rows.find(row=>row.source_id===order.id),match=row?.matched_json?JSON.parse(row.matched_json):null
   const total=totals.get(order.currency)??{currency:order.currency,sourceCount:0,nativeCount:0,sourceCents:0,nativeCents:0,differenceCents:0}
   total.sourceCount++;total.sourceCents+=order.lines.reduce((sum,line)=>sum+line.quantity*line.unitCents,0)
   if(match&&match.currency===order.currency){total.nativeCount++;total.nativeCents+=match.lines.reduce((sum:number,line:any)=>sum+line.quantity*line.unitCents,0)}
   totals.set(order.currency,total)
   if(!match)attention(order.id,'unmapped-customer',`Retailer ${order.retailerId} needs an explicit trade account mapping.`)
   const account=accounts.find(account=>account.id===match?.accountId),value=account?JSON.parse(account.value_json):null
   if(match&&(!value||value.lifecycle==='closed'||(value.currency??'USD')!==order.currency))attention(order.id,'unmapped-customer','The mapped trade account is absent, closed or has a different currency.')
   for(const line of order.lines) {
    const mapped=match?.lines.find((item:any)=>item.id===line.id)
    if(!mapped||mapped.sourceSku!==line.sourceSku||!value?.prices.some((price:any)=>price.sku===mapped.sku))attention(`${order.id}:${line.id}`,'unmapped-item',`Source SKU ${line.sourceSku} needs a current reviewed account SKU.`)
   }
   if(match) {
    const expected=order.lines.map(line=>[line.id,line.sourceSku,line.quantity,line.unitCents]),actual=match.lines.map((line:any)=>[line.id,line.sourceSku,line.quantity,line.unitCents])
    if(row.state!=='ingested'||row.revision!==await digest(JSON.stringify(order))||JSON.stringify(expected)!==JSON.stringify(actual)||match.retailerId!==order.retailerId||match.currency!==order.currency)attention(order.id,'source-difference','Current source facts differ from the retained reviewed order; preserve both observations and review the current source revision.')
    const mappedAccounts=retailers.get(order.retailerId)??new Set<string>();mappedAccounts.add(match.accountId);retailers.set(order.retailerId,mappedAccounts)
   }
  }
  for(const row of rows)if(!ids.has(row.source_id))attention(row.source_id,'missing-order','The retained local order is absent from the complete current source read. History was preserved.')
  const duplicates=[...retailers].filter(([,accounts])=>accounts.size>1).map(([retailer,accounts])=>({retailer,accounts:[...accounts].sort()}))
  for(const duplicate of duplicates)attention(duplicate.retailer,'duplicate-customer',`Explicit reviewed mappings name multiple trade accounts: ${duplicate.accounts.join(', ')}. No account is merged automatically.`)
  for(const total of totals.values()) {
   if(!Number.isSafeInteger(total.sourceCents)||!Number.isSafeInteger(total.nativeCents))fail('FAIRE_RECONCILIATION','Source totals exceed exact integer limits.')
   total.differenceCents=total.sourceCents-total.nativeCents
   if(total.differenceCents||total.sourceCount!==total.nativeCount)attention(brand+':'+total.currency,'value-difference',`${total.currency}: source ${total.sourceCount} orders and ${total.sourceCents} minor units; native ${total.nativeCount} orders and ${total.nativeCents} minor units; difference ${total.differenceCents}.`)
  }
  result={...result,state:'answered',lastSuccessfulAt:at,samples:source.slice(0,20),totals:[...totals.values()],duplicates}
 } catch {
  issues.length=0
  attention(brand,'faire-connection','Faire could not be completely read with the current credential. Reconnect its authorized order-read credential and retry; retained local orders and prior samples remain available.')
 }
 return {...result,issues:issues as ConnectorIssue[],guards}
}
export async function previewFaire(env:Bindings,owner:string,previous:any[]=[]){
 const brands=(await env.DB.prepare('SELECT brand FROM bw_faire_sync ORDER BY brand').all<{brand:string}>()).results
 return Promise.all(brands.map(row=>previewFaireBrand(env,owner,row.brand,previous.find(item=>item.brand===row.brand))))
}
