import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { digest } from './digest'
import { fail, integer, text, type Actor } from './model'

type SourceLine = { id:string; sourceSku:string; quantity:number; unitCents:number }
type SourceOrder = { id:string; retailerId:string; state:string; currency:string; lines:SourceLine[]; commissionBps:number|null; commissionFlatFee:unknown; payoutFee:unknown; shipments:unknown[] }
type Row = { brand:string; source_id:string; revision:string; source_json:string; account_id:string|null; matched_json:string|null; state:'review'|'ingested' }
function owner(actor:Actor) {if(actor.agent||actor.staff||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may operate Faire order intake.',403)}
function connection(env:Bindings,brand:string) {
 try {
  const connections=JSON.parse(env.FAIRE_CONNECTIONS??'{}'),config=connections[brand]
  if(Object.keys(connections).length>1&&!config?.appCredentials)throw Error()
  if(Object.entries(connections).some(([key,value])=>key!==brand&&JSON.stringify(value)===JSON.stringify(config)))throw Error()
  const origin=new URL(config.origin??'https://www.faire.com')
  if(origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||!['https://www.faire.com','https://www.staging.faire.dev'].includes(origin.origin)&&!(env.AUTH_LOCAL==='true'&&origin.protocol==='http:'&&origin.hostname==='127.0.0.1'))throw Error()
  if(typeof config.accessToken!=='string'||!config.accessToken||/[\r\n]/.test(config.accessToken))throw Error()
  if(config.appCredentials!==undefined&&(typeof config.appCredentials!=='string'||!config.appCredentials||/[\r\n]/.test(config.appCredentials)))throw Error()
  return {origin:origin.origin,token:config.accessToken as string,app:config.appCredentials as string|undefined}
 } catch {fail('FAIRE_CONFIGURATION','The server-held Faire connection is unavailable or invalid.',503)}
}
function sourceOrder(input:any):SourceOrder {
 const id=text(input?.id,'Faire order ID'),retailerId=text(input.retailer_id,'Faire retailer ID'),state=text(input.state,'Faire order state')
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>500)fail('FAIRE_SOURCE','Faire order items are missing or exceed the intake bound.',502)
 const currency=text(input.items[0]?.price?.currency??input.items[0]?.currency??input.currency,'Faire currency',3)
 if(!/^[A-Z]{3}$/.test(currency))fail('FAIRE_SOURCE','Faire currency is invalid.',502)
 const lines=input.items.map((item:any)=>{
  if((item.price?.currency??item.currency??input.currency)!==currency)fail('FAIRE_SOURCE','A source order cannot mix currencies.',502)
  return {id:text(item.id,'Faire line ID'),sourceSku:text(item.sku??item.product_variant_id,'Faire SKU'),quantity:integer(item.quantity,'Faire quantity',1,1000000),unitCents:integer(item.price?.amount_minor??item.price_cents,'Faire unit amount')}
 })
 if(new Set(lines.map((line:SourceLine)=>line.id)).size!==lines.length)fail('FAIRE_SOURCE','Faire line IDs must be unique.',502)
 // Retain only commercial facts. Addresses, contact fields and arbitrary source bodies never enter custody.
 const money=(value:any)=>value===undefined?null:{currency:text(value.currency,'Fee currency',3),amountMinor:integer(value.amount_minor,'Faire fee')}
 const shipments=(input.shipments??[]).map((shipment:any)=>({id:text(shipment.id,'Faire shipment ID'),carrier:typeof shipment.carrier==='string'?text(shipment.carrier,'Carrier'):null,trackingCode:typeof shipment.tracking_code==='string'?text(shipment.tracking_code,'Tracking'):null}))
 return {id,retailerId,state,currency,lines,commissionBps:input.payout_costs?.commission_bps===undefined?null:integer(input.payout_costs.commission_bps,'Commission basis points',0,10000),commissionFlatFee:money(input.payout_costs?.commission_flat_fee),payoutFee:money(input.payout_costs?.payout_fee),shipments}
}
export async function faireState(env:Bindings,actor:Actor) {
 owner(actor)
 const sync=(await env.DB.prepare('SELECT * FROM bw_faire_sync ORDER BY brand').all()).results
 const orders=(await env.DB.prepare('SELECT * FROM bw_faire_orders ORDER BY brand,source_id').all<Row>()).results.map(({source_json,matched_json,...row})=>({...row,source:JSON.parse(source_json) as SourceOrder,matched:matched_json?JSON.parse(matched_json):null,settlementOwner:'Faire',collection:'No Barrow collection'}))
 return {sync,orders}
}
export async function faireConfigure(env:Bindings,actor:Actor,input:any) {
 owner(actor)
 const brand=text(input.brand,'Configured Faire brand'),reason=text(input.reason,'Configuration reason',1000)
 if(typeof input.enabled!=='boolean')fail('INPUT','Choose whether intake is enabled.',400)
 const config=connection(env,brand),revision=await digest(JSON.stringify([config.origin,brand]))
 const prior=await env.DB.prepare('SELECT * FROM bw_faire_sync WHERE brand=?').bind(brand).first<any>()
 if(prior&&prior.revision!==revision)fail('FAIRE_DESTINATION','The brand is already bound to a different Faire destination.')
 await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_faire_sync(brand,revision,enabled) VALUES(?,?,?) ON CONFLICT(brand) DO UPDATE SET enabled=excluded.enabled').bind(brand,revision,input.enabled?1:0),audit(env.DB,actor,brand,'faire.configured',{revision,source:'faire.configure',reason})])
 return faireState(env,actor)
}
export async function fairePoll(env:Bindings,actor:Actor,input:any) {
 owner(actor)
 const brand=text(input.brand,'Configured Faire brand'),config=connection(env,brand)
 const sync=await env.DB.prepare('SELECT * FROM bw_faire_sync WHERE brand=? AND enabled=1').bind(brand).first<any>()
 if(!sync)fail('FAIRE_DISABLED','Explicitly enable this configured brand before reading its orders.')
 const cursor=input.restart===true?null:sync.cursor
 if(sync.complete&&!input.restart)return {...await faireState(env,actor),caughtUp:true}
 const url=new URL(config.origin+'/external-api/v2/orders');url.searchParams.set('limit','50');if(cursor)url.searchParams.set('cursor',cursor)
 let response:Response
 try {response=await fetch(url,{headers:config.app?{'X-FAIRE-OAUTH-ACCESS-TOKEN':config.token,'X-FAIRE-APP-CREDENTIALS':config.app}:{'X-FAIRE-ACCESS-TOKEN':config.token},redirect:'manual',signal:AbortSignal.timeout(15000)})}catch{fail('FAIRE_UNAVAILABLE','Faire did not answer; the durable checkpoint is unchanged.',503)}
 if(!response.ok)fail('FAIRE_UNAVAILABLE','Faire refused the read; the durable checkpoint is unchanged.',503)
 const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0
 if(!reader)fail('FAIRE_SOURCE','Faire returned an empty response.',502)
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2000000){await reader.cancel();fail('FAIRE_SOURCE','Faire page exceeds the intake bound.',502)}chunks.push(part.value)}
 const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}const bytes=new TextDecoder().decode(buffer)
 let page:any;try{page=JSON.parse(bytes)}catch{fail('FAIRE_SOURCE','Faire returned an invalid page.',502)}
 if(!Array.isArray(page.orders)||page.orders.length>50)fail('FAIRE_SOURCE','Faire returned an invalid order page.',502)
 const next=page.cursor===undefined||page.cursor===null?null:text(page.cursor,'Faire next cursor',2000)
 if(next===cursor&&next!==null)fail('FAIRE_SOURCE','Faire repeated its cursor; checkpoint retained.',502)
 const orders=page.orders.map(sourceOrder) as SourceOrder[],statements:D1PreparedStatement[]=[]
 if(new Set(orders.map(row=>row.id)).size!==orders.length)fail('FAIRE_SOURCE','Faire returned duplicate order IDs within a page.',502)
 statements.push(env.DB.prepare('UPDATE bw_faire_sync SET cursor=?,complete=?,observed_at=? WHERE brand=? AND enabled=1 AND revision=? AND cursor IS ? AND complete=?').bind(next,next?0:1,new Date().toISOString(),brand,sync.revision,sync.cursor,sync.complete),changed(env.DB))
 for(const order of orders) {
  const value=JSON.stringify(order),revision=await digest(value)
  statements.push(env.DB.prepare("INSERT INTO bw_faire_orders(brand,source_id,revision,source_json,state) VALUES(?,?,?,?,'review') ON CONFLICT(brand,source_id) DO UPDATE SET revision=excluded.revision,source_json=excluded.source_json,state='review' WHERE bw_faire_orders.revision<>excluded.revision").bind(brand,order.id,revision,value))
 }
 statements.push(audit(env.DB,actor,brand,'faire.page-reconciled',{revision:await digest(JSON.stringify([sync.revision,cursor,next,orders])),source:'faire.poll',reason:'Owner read and durably staged one source page; original Faire IDs deduplicate replay. No collection or inventory effect.'}))
 try{await commit(env.DB,actor,statements)}catch(error){if(String(error).includes('CHECK constraint'))fail('FAIRE_CHANGED','Intake changed during the read; resume the current checkpoint.');throw error}
 return faireState(env,actor)
}
export async function faireMatch(env:Bindings,actor:Actor,input:any) {
 owner(actor)
 const brand=text(input.brand,'Faire brand'),id=text(input.id,'Faire order ID'),revision=text(input.revision,'Reviewed source revision'),accountId=text(input.accountId,'Reviewed account ID'),reason=text(input.reason,'Matching reason',1000)
 const row=await env.DB.prepare('SELECT * FROM bw_faire_orders WHERE brand=? AND source_id=?').bind(brand,id).first<Row>()
 if(!row||row.revision!==revision)fail('FAIRE_CHANGED','Review the current source order before matching.')
 const account=await env.DB.prepare('SELECT value_json,revision FROM bw_accounts WHERE id=?').bind(accountId).first<{value_json:string;revision:string}>()
 if(!account||JSON.parse(account.value_json).lifecycle==='closed')fail('FAIRE_MATCH','Choose an active existing trade account.')
 if(row.account_id&&row.account_id!==accountId)fail('FAIRE_MATCH','An ingested source order cannot be reassigned to another customer.')
 const source=JSON.parse(row.source_json) as SourceOrder,value=JSON.parse(account.value_json)
 if((value.currency??'USD')!==source.currency)fail('FAIRE_MATCH','The reviewed account currency must match the Faire order.')
 const lines=source.lines.map(line=>{
  const sku=input.skuMap?.[line.sourceSku]
  if(typeof sku!=='string'||!value.prices.some((price:any)=>price.sku===sku))fail('FAIRE_MATCH','Every source SKU needs an explicit reviewed SKU from this account.')
  return {...line,sku}
 })
 const matched=JSON.stringify({accountId,retailerId:source.retailerId,currency:source.currency,sourceRevision:revision,lines,settlementOwner:'Faire',collection:'No Barrow collection'})
 if(row.state==='ingested') {if(row.matched_json!==matched)fail('FAIRE_MATCH','An ingested matching decision is immutable.');return {...await faireState(env,actor),replayed:true}}
 await commit(env.DB,actor,[env.DB.prepare("UPDATE bw_faire_orders SET account_id=?,matched_json=?,state='ingested' WHERE brand=? AND source_id=? AND revision=? AND state='review'").bind(accountId,matched,brand,id,revision),changed(env.DB),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(accountId,account.revision),audit(env.DB,actor,id,'faire.order-ingested',{accountId,orderId:id,revision,source:'faire.match',reason})])
 return faireState(env,actor)
}
export async function faireFulfillment(env:Bindings,accountId:string) {
 const rows=(await env.DB.prepare("SELECT * FROM bw_faire_orders WHERE matched_json IS NOT NULL AND (?='' OR account_id=?) ORDER BY brand,source_id").bind(accountId,accountId).all<Row>()).results
 return rows.flatMap(row=>{
  const source=JSON.parse(row.source_json) as SourceOrder,match=JSON.parse(row.matched_json!)
  return match.lines.map((line:SourceLine&{sku:string})=>({lineId:line.id,brand:row.brand,orderId:source.id,accountId:row.account_id!,sku:line.sku,sourceSku:line.sourceSku,ordered:String(line.quantity),shipped:'unknown',warehouse:'unknown',delivery:'unknown',tracking:source.shipments,source:'Faire',reviewRequired:row.state==='review',settlementOwner:'Faire'}))
 })
}
