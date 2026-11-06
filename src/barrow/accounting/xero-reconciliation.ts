import type { Bindings } from '../../auth.server'
import { audit, changed, commit } from '../access'
import { account } from '../accounts'
import { requireCompanyRight } from '../company-policy'
import { creditRecords, invoiceOutstanding } from '../credit-ledger'
import { digest } from '../digest'
import { now } from '../clock'
import { fail, supplierDate, text, type Actor, type Order } from '../model'
import type { FollowupSource } from '../followup-sources'
import { xeroAuthority,xeroConnection,xeroOwner,xeroQuery,xeroGuard,xeroKinds,type Connection } from './xero'

type Mapping={tenant:string;kind:string;source_id:string;token:string;native_id:string;native_revision:string;revision:string}
export type XeroInvoice={provider:'xero';id:string;runId:string;tenant:string;sourceId:string;sourceToken:string;commercialToken:string;contactId:string;accountId:string;currency:string;status?:string;issuedAt:string;dueAt:string;amountCents:number;balanceCents:number;observedAt:string;latestFinancialAt:string;createdAt:string;refs:{kind:string;id:string}[]}
type Stored={id:string;account_id:string;order_id:string;value_json:string;revision:string}
const values=(db:D1Database)=>db.prepare('SELECT * FROM bw_xero_maps ORDER BY tenant,kind,source_id').all<Mapping>()
export const mappingHash=async(db:D1Database)=>digest(JSON.stringify((await values(db)).results))
async function mappingGuards(db:D1Database) {
 const query='SELECT json_group_array(json_array(tenant,kind,source_id,token,native_id,native_revision,revision)) AS value FROM (SELECT * FROM bw_xero_maps ORDER BY tenant,kind,source_id)'
 const value=await db.prepare(query).first<{value:string}>()
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${query.replace(' AS value','')})=? THEN 1 ELSE 0 END`).bind(value!.value)
}
const id=(value:unknown,name:string)=>{const result=text(value,name,160);if(/[\x00-\x1f\x7f]/.test(result))fail('INPUT',`Use a valid ${name}.`,400);return result}
export async function readReferences(env:Bindings,actor:Actor,p:any) {
 xeroOwner(actor);if(!xeroKinds.includes(p.kind))fail('INPUT','Choose a supported reference kind.',400)
 const position=p.position??1,{connection,rows}=await xeroQuery(env,actor,p.kind,position)
 const statements=rows.map((row:any)=>env.DB.prepare('INSERT INTO bw_xero_refs VALUES(?,?,?,?,?) ON CONFLICT(tenant,kind,source_id) DO UPDATE SET token=excluded.token,active=excluded.active').bind(connection.tenant,p.kind,id(row.Id,'source ID'),String(row.SyncToken??''),row.Active===false?0:1))
 await commit(env.DB,actor,[xeroGuard(env.DB,connection),...statements,audit(env.DB,actor,'xero','xero.references-read',{revision:crypto.randomUUID(),source:'xero.references',reason:`Reviewed reference read ${p.kind} from position ${position}; ${rows.length} opaque IDs retained without names or contact data.`})])
 return {kind:p.kind,position,nextPosition:rows.length===50?position+1:null,count:rows.length}
}
export async function saveMapping(env:Bindings,actor:Actor,p:any) {
 xeroOwner(actor);const connection=await xeroConnection(env.DB)
 if(!connection||connection.state!=='connected')fail('XERO_DISCONNECTED','Connect Xero first.')
 await xeroAuthority(env,connection.revision)
 const sourceId=id(p.sourceId,'source ID'),nativeId=text(p.nativeId,'Native reference',160),reason=text(p.reason,'Mapping review reason',1000),revision=crypto.randomUUID()
 if(!xeroKinds.includes(p.kind))fail('INPUT','Choose a supported reference kind.',400)
 const reference=await env.DB.prepare('SELECT * FROM bw_xero_refs WHERE tenant=? AND kind=? AND source_id=?').bind(connection.tenant,p.kind,sourceId).first<any>()
 if(!reference||!reference.active||reference.token!==p.sourceToken)fail('CHANGED','Read the current active Xero reference before reviewing the mapping.')
 const previous=await env.DB.prepare('SELECT * FROM bw_xero_maps WHERE tenant=? AND kind=? AND source_id=?').bind(connection.tenant,p.kind,sourceId).first<Mapping>()
 if((previous?.revision??null)!==(p.revision??null))fail('CHANGED','Refresh the mapping before reviewing it.')
 let nativeRevision='reviewed-label';const guards:D1PreparedStatement[]=[]
 if(p.kind==='Contact') {
  const selected=await account(env.DB,actor,nativeId)
  if(selected.revision!==p.nativeRevision)fail('CHANGED','Review the current native account revision.')
  if(selected.value.email?.endsWith('@erased.invalid')||await env.DB.prepare('SELECT 1 FROM bw_xero_erased WHERE tenant=? AND contact_id=?').bind(connection.tenant,sourceId).first())fail('XERO_ERASED','An erased customer cannot be connected again.',409)
  if(previous&&previous.native_id!==nativeId&&await env.DB.prepare("SELECT 1 FROM bw_xero_invoices WHERE json_extract(value_json,'$.tenant')=? AND json_extract(value_json,'$.contactId')=? LIMIT 1").bind(connection.tenant,sourceId).first())fail('XERO_CUSTODY','A customer with recorded financial history cannot be reassigned to another native account.')
  nativeRevision=selected.revision
  guards.push(env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM bw_xero_erased WHERE tenant=? AND contact_id=?) THEN 1 ELSE 0 END').bind(nativeId,nativeRevision,connection.tenant,sourceId))
 }else if(p.kind==='Item') {
  const exists=await env.DB.prepare("SELECT 1 FROM bw_accounts,json_each(bw_accounts.value_json,'$.prices') p WHERE json_extract(p.value,'$.sku')=? LIMIT 1").bind(nativeId).first()
  if(!exists)fail('INPUT','Choose an existing native price-book SKU.',400)
 }
 // Account and TaxCode targets are explicitly reviewed supplier reference labels, not tax approval or financial write authority.
 guards.push(env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_xero_refs WHERE tenant=? AND kind=? AND source_id=? AND token=? AND active=1) THEN 1 ELSE 0 END').bind(connection.tenant,p.kind,sourceId,reference.token))
 await commit(env.DB,actor,[xeroGuard(env.DB,connection),...guards,await mappingGuards(env.DB),env.DB.prepare('INSERT INTO bw_xero_maps VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant,kind,source_id) DO UPDATE SET token=excluded.token,native_id=excluded.native_id,native_revision=excluded.native_revision,revision=excluded.revision').bind(connection.tenant,p.kind,sourceId,reference.token,nativeId,nativeRevision,revision),audit(env.DB,actor,p.kind==='Contact'?nativeId:'xero','xero.mapping-reviewed',{accountId:p.kind==='Contact'?nativeId:undefined,revision,source:'xero.mapping',reason:`${reason} Tenant ${connection.tenant}; ${p.kind} source ${sourceId} revision ${reference.token}; native ${nativeId}.`})])
 return {revision}
}
function cents(value:unknown) {
 const raw=String(value??'')
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))fail('XERO_AMOUNT','Xero amounts require nonnegative exact minor units.',409)
 const [whole,fraction='']=raw.split('.'),result=Number(whole)*100+Number(fraction.padEnd(2,'0'))
 if(!Number.isSafeInteger(result))fail('XERO_AMOUNT','Xero amount is outside the exact integer range.',409)
 return result
}
function date(value:unknown) {const raw=String(value??'');if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||new Date(raw+'T12:00:00Z').toISOString().slice(0,10)!==raw)fail('XERO_DATE','Xero supplied an invalid financial date.',409);return raw}
export async function startRead(env:Bindings,actor:Actor,p:any) {
 xeroOwner(actor);const connection=await xeroConnection(env.DB)
 if(!connection||connection.state!=='connected')fail('XERO_DISCONNECTED','Connect Xero first.')
 await xeroAuthority(env,connection.revision)
 const reason=text(p.reason,'Read reason',1000),at=(await now()).toISOString(),runId=crypto.randomUUID(),revision=crypto.randomUUID(),hash=await mappingHash(env.DB)
 const maps=(await values(env.DB)).results.filter(row=>row.tenant===connection.tenant)
 if(xeroKinds.some(kind=>!maps.some(row=>row.kind===kind)))fail('XERO_MAPPING','Review customer, item, account and tax-code references before reading invoices.')
 if(p.asOf!==supplierDate(new Date(at)))fail('XERO_DATE','Xero invoice balances are current observations. Choose today in the supplier calendar; historical balances cannot be inferred.',400)
 await commit(env.DB,actor,[xeroGuard(env.DB,connection),await mappingGuards(env.DB),env.DB.prepare('INSERT INTO bw_xero_runs VALUES(?,?,?,?,?,1,?,?,?,?,?)').bind(runId,connection.tenant,connection.revision,hash,p.asOf,'reading','',actor.id,at,revision),audit(env.DB,actor,'xero','xero.read-started',{revision,source:'xero.start',reason:`${reason} Correlation ${runId}; bounded pages of 50, no financial writes.`})])
 return {id:runId,revision}
}
export async function resumeRead(env:Bindings,actor:Actor,p:any) {
 xeroOwner(actor);const run=await env.DB.prepare('SELECT * FROM bw_xero_runs WHERE id=?').bind(text(p.id,'Correlation ID',100)).first<any>()
 if(!run||run.revision!==p.revision)fail('CHANGED','Refresh the exact Xero correlation before resuming.')
 if(run.state==='complete')return {id:run.id,state:'complete',position:run.position,revision:run.revision}
 if(!['reading','failed'].includes(run.state))fail('XERO_INACTIVE','This restored or disconnected read is inactive; start a fresh reviewed read.')
 const connection=await xeroConnection(env.DB),hash=await mappingHash(env.DB)
 if(!connection||connection.state!=='connected'||run.connection_revision!==connection.revision||run.mapping_hash!==hash||run.tenant!==connection.tenant)fail('XERO_STALE','Connection or mappings changed. Start a fresh reviewed read.')
 if(run.as_of!==supplierDate(await now()))fail('XERO_DATE','The observation date changed. Start a fresh dated read.')
 const maps=(await values(env.DB)).results.filter(m=>m.tenant===run.tenant),accountGuards:D1PreparedStatement[]=[]
 const refs=(await env.DB.prepare('SELECT * FROM bw_xero_refs WHERE tenant=?').bind(run.tenant).all<{kind:string;source_id:string;token:string;active:number}>()).results
 accountGuards.push(...maps.map(m=>env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_xero_refs WHERE tenant=? AND kind=? AND source_id=? AND token=? AND active=1) THEN 1 ELSE 0 END').bind(m.tenant,m.kind,m.source_id,m.token)))
 if(maps.some(m=>!refs.some(r=>r.kind===m.kind&&r.source_id===m.source_id&&r.token===m.token&&r.active===1)))fail('XERO_STALE','A source reference changed; review its current mapping before another read.')
 for(const map of maps.filter(m=>m.kind==='Contact')) {
  const a=await account(env.DB,actor,map.native_id)
  if(a.revision!==map.native_revision||a.value.email?.endsWith('@erased.invalid'))fail('XERO_STALE','A mapped account changed; review its current revision before reading.')
  accountGuards.push(env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(a.id,a.revision))
 }
 const at=(await now()).toISOString(),revision=crypto.randomUUID()
 try {
  const {rows}=await xeroQuery(env,actor,'Invoice',run.position)
  const statements:D1PreparedStatement[]=[]
  const seen=new Set<string>()
  for(const raw of rows) {
   const sourceId=id(raw.Id,'invoice ID');if(seen.has(sourceId))fail('XERO_DUPLICATE','Xero repeated an invoice in a page. Resume requires a fresh source review.')
   seen.add(sourceId)
   const contactId=id(raw.ContactRef?.value,'customer ID'),mapping=maps.find(m=>m.kind==='Contact'&&m.source_id===contactId)
   if(await env.DB.prepare('SELECT 1 FROM bw_xero_erased WHERE tenant=? AND contact_id=?').bind(run.tenant,contactId).first())continue
   if(!mapping)fail('XERO_MAPPING',`Review Xero customer ${contactId} before retaining this page. No checkpoint advanced.`)
   const currency=raw.CurrencyRef?.value
   if(!['USD','CAD','AUD','EUR','GBP'].includes(currency))fail('XERO_CURRENCY','Xero did not supply an explicitly supported ISO currency.',409)
   const updated=raw.MetaData?.LastUpdatedTime
   if(typeof updated!=='string'||!Number.isFinite(Date.parse(updated)))fail('XERO_DATE','Xero did not supply a valid financial update instant.',409)
   const refs:{kind:string;id:string}[]=[{kind:'Contact',id:contactId}]
   for(const line of raw.Line??[])if(line.SalesItemLineDetail?.ItemRef?.value)refs.push({kind:'Item',id:id(line.SalesItemLineDetail.ItemRef.value,'item ID')})
   for(const line of raw.Line??[]){if(line.AccountRef?.value)refs.push({kind:'Account',id:id(line.AccountRef.value,'account code')});if(line.TaxCodeRef?.value)refs.push({kind:'TaxCode',id:id(line.TaxCodeRef.value,'tax code')})}
   if(raw.ARAccountRef?.value)refs.push({kind:'Account',id:id(raw.ARAccountRef.value,'account ID')})
   if(raw.TxnTaxDetail?.TxnTaxCodeRef?.value)refs.push({kind:'TaxCode',id:id(raw.TxnTaxDetail.TxnTaxCodeRef.value,'tax-code ID')})
   const value:XeroInvoice={provider:'xero',id:await digest('xero:'+run.tenant+':'+run.id+':'+sourceId),runId:run.id,tenant:run.tenant,sourceId,sourceToken:String(raw.SyncToken??''),commercialToken:String(raw.CommercialToken??''),contactId,accountId:mapping?.native_id??'',currency,status:raw.Status,issuedAt:date(raw.TxnDate),dueAt:date(raw.DueDate??raw.TxnDate),amountCents:cents(raw.TotalAmt),balanceCents:cents(raw.Balance),observedAt:at,createdAt:at,latestFinancialAt:new Date(Math.max(Date.parse(at),Date.parse(updated))).toISOString(),refs}
   if(value.balanceCents>value.amountCents)fail('XERO_AMOUNT','Xero balance exceeds its invoice amount; review the source conflict.')
   const prior=await env.DB.prepare('SELECT value_json FROM bw_xero_invoices WHERE id=?').bind(value.id).first<{value_json:string}>()
   if(prior) {if(JSON.parse(prior.value_json).sourceToken!==value.sourceToken)fail('XERO_EDITED','Xero changed an earlier page; start a fresh read.');continue}
   const link=await env.DB.prepare('SELECT order_id FROM bw_xero_links WHERE tenant=? AND source_id=? AND account_id=?').bind(run.tenant,sourceId,value.accountId).first<{order_id:string}>()
   statements.push(env.DB.prepare('INSERT INTO bw_xero_invoices VALUES(?,?,?,?,?)').bind(value.id,value.accountId,link?.order_id??'',JSON.stringify(value),revision))
  }
  const complete=rows.length<50
  await xeroAuthority(env,connection.revision)
  if(!complete&&run.position>=2001)fail('XERO_LIMIT','The read reached its 100000-record bound. Narrow the supported source before retrying.')
  await commit(env.DB,actor,[xeroGuard(env.DB,connection),await mappingGuards(env.DB),...accountGuards,...statements,env.DB.prepare('UPDATE bw_xero_runs SET position=?,state=?,error=?,updated_at=?,revision=? WHERE id=? AND revision=?').bind(run.position+(rows.length?1:0),complete?'complete':'reading','',at,revision,run.id,run.revision),changed(env.DB),audit(env.DB,actor,'xero','xero.read-page',{revision,source:'xero.resume',reason:`Correlation ${run.id}; position ${run.position}, ${rows.length} observations; ${complete?'complete':'resume required'}.`})])
  return {id:run.id,state:complete?'complete':'reading',position:run.position+(rows.length?1:0),revision}
 }catch(error:any) {
  const safe=typeof error?.code==='string'&&error.code.startsWith('XERO_')?error.message:'Read interrupted or source changed; refresh this correlation and resume without advancing its checkpoint.'
  await commit(env.DB,actor,[env.DB.prepare("UPDATE bw_xero_runs SET state='failed',error=?,updated_at=?,revision=? WHERE id=? AND revision=?").bind(safe,at,revision,run.id,run.revision),audit(env.DB,actor,'xero','xero.read-failed',{revision,source:'xero.resume',reason:`Correlation ${run.id}; ${safe}`})])
  fail('XERO_READ',safe,409)
 }
}
export async function linkInvoice(env:Bindings,actor:Actor,p:any) {
 xeroOwner(actor);const reason=text(p.reason,'Reconciliation review reason',1000),c=await xeroConnection(env.DB)
 const row=await env.DB.prepare('SELECT * FROM bw_xero_invoices WHERE id=?').bind(text(p.id,'Observation ID',100)).first<Stored>()
 if(!row||row.revision!==p.revision)fail('CHANGED','Review the current invoice observation.')
 const value=JSON.parse(row.value_json) as XeroInvoice
 if(!c||c.state!=='connected'||c.tenant!==value.tenant)fail('XERO_COMPANY','Reconnect the original Xero tenant before linking.')
 await xeroAuthority(env,c.revision)
 const a=await account(env.DB,actor,value.accountId),native=await env.DB.prepare('SELECT value_json,revision FROM bw_orders WHERE id=? AND account_id=?').bind(text(p.orderId,'Native order ID',100),a.id).first<{value_json:string;revision:string}>()
 if(!native||native.revision!==p.orderRevision)fail('CHANGED','Review the current native issued invoice.')
 const order=JSON.parse(native.value_json) as Order
 if(value.status==='VOIDED')fail('XERO_CONFLICT','The source invoice is voided. Resolve the owned conflict without linking or rewriting an issued document.')
 if(!order.invoice||order.currency!==value.currency||order.totalCents!==value.amountCents)fail('XERO_CONFLICT','Native invoice currency or total differs. Resolve the source conflict without overwriting the issued document.')
 const previous=await env.DB.prepare('SELECT order_id,commercial_token FROM bw_xero_links WHERE tenant=? AND source_id=?').bind(c.tenant,value.sourceId).first<{order_id:string;commercial_token:string}>()
 if(previous&&previous.order_id!==order.id)fail('XERO_DUPLICATE','This source invoice is already linked to another native invoice.')
 if(previous?.commercial_token&&previous.commercial_token!==value.commercialToken)fail('XERO_EDITED','The issued source invoice changed after its original review. Resolve the source conflict without replacing the reviewed basis.')
 const other=await env.DB.prepare('SELECT source_id FROM bw_xero_links WHERE tenant=? AND order_id=?').bind(c.tenant,order.id).first<{source_id:string}>()
 if(other&&other.source_id!==value.sourceId)fail('XERO_DUPLICATE','This native invoice already has a different source invoice in this tenant.')
 const revision=crypto.randomUUID()
 await commit(env.DB,actor,[xeroGuard(env.DB,c),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM bw_xero_invoices WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(order.id,native.revision,row.id,row.revision,a.id,a.revision),env.DB.prepare('INSERT INTO bw_xero_links VALUES(?,?,?,?,?,?) ON CONFLICT(tenant,source_id) DO UPDATE SET revision=excluded.revision,commercial_token=excluded.commercial_token WHERE bw_xero_links.order_id=excluded.order_id AND (bw_xero_links.commercial_token=\'\' OR bw_xero_links.commercial_token=excluded.commercial_token)').bind(c.tenant,value.sourceId,order.id,a.id,revision,value.commercialToken),changed(env.DB),env.DB.prepare('UPDATE bw_xero_invoices SET order_id=? WHERE id=?').bind(order.id,row.id),audit(env.DB,actor,order.id,'xero.invoice-linked',{accountId:a.id,orderId:order.id,revision,source:'xero.link',reason:`${reason} Tenant ${c.tenant}; source invoice ${value.sourceId} revision ${value.sourceToken}; observation ${value.id}.`})])
 return {orderId:order.id,sourceId:value.sourceId,revision}
}
export async function xeroComparisons(db:D1Database,accountId:string,asOf:string,native:Map<string,number>) {
 // A completed observation is usable only for its actual date, never extrapolated into history.
 const run=await db.prepare("SELECT * FROM bw_xero_runs WHERE state='complete' AND as_of=? ORDER BY updated_at DESC,rowid DESC LIMIT 1").bind(asOf).first<any>()
 if(!run)return []
 const rows=(await db.prepare('SELECT * FROM bw_xero_invoices WHERE account_id=? AND json_extract(value_json,\'$.runId\')=?').bind(accountId,run.id).all<Stored>()).results
 const maps=(await values(db)).results,financial=await creditRecords(db)
 const details=await Promise.all(rows.map(async row=>{
  const value=JSON.parse(row.value_json) as XeroInvoice
  const linked=await db.prepare('SELECT order_id,commercial_token FROM bw_xero_links WHERE tenant=? AND source_id=? AND account_id=?').bind(value.tenant,value.sourceId,accountId).first<{order_id:string;commercial_token:string}>()
  const record=linked?await db.prepare('SELECT value_json FROM bw_orders WHERE id=? AND account_id=?').bind(linked.order_id,accountId).first<{value_json:string}>():null
  const order=record?JSON.parse(record.value_json) as Order:null
  const refs=(await db.prepare('SELECT * FROM bw_xero_refs WHERE tenant=?').bind(value.tenant).all<{kind:string;source_id:string;token:string;active:number}>()).results
  const a=await db.prepare('SELECT revision FROM bw_accounts WHERE id=?').bind(accountId).first<{revision:string}>()
  const stale=value.refs.some(ref=>!maps.some(m=>m.tenant===value.tenant&&m.kind===ref.kind&&m.source_id===ref.id&&refs.some(r=>r.kind===m.kind&&r.source_id===m.source_id&&r.token===m.token&&r.active===1)&&(m.kind!=='Contact'||m.native_revision===a?.revision)))
  const nativeCents=order?.invoice&&order.currency===value.currency?invoiceOutstanding(order.id,order.totalCents,{...financial,allocations:financial.allocations.filter(r=>supplierDate(new Date(r.createdAt))<=asOf),applications:financial.applications.filter(r=>supplierDate(new Date(r.createdAt))<=asOf)}):null
  const conflict=value.status==='VOIDED'?'Upstream invoice voided':stale?'Reference mapping missing or stale':!order?'Unlinked ledger invoice':order.currency!==value.currency?'Currency mismatch':order.totalCents!==value.amountCents?'Upstream invoice total changed':order.invoice?.issuedAt!==value.issuedAt||order.invoice?.dueAt!==value.dueAt?'Invoice dates differ':!linked?.commercial_token||!value.commercialToken?'Reviewed source basis unavailable':linked.commercial_token!==value.commercialToken?'Upstream issued invoice changed':nativeCents!==value.balanceCents?'Balance differs':'Matched'
  return {id:value.id,sourceId:value.sourceId,sourceToken:value.sourceToken,tenant:value.tenant,accountId,currency:value.currency,amountCents:value.amountCents,ledgerCents:value.balanceCents,nativeCents,orderId:order?.id??'',status:conflict,path:`/api/barrow/xero/observations/${value.id}`}
 }))
 const currencies=[...new Set([...native.keys(),...details.map(row=>row.currency)])]
 return currencies.map(currency=>{const mine=details.filter(row=>row.currency===currency),ledgerCents=mine.reduce((sum,row)=>sum+row.ledgerCents,0),nativeCents=native.get(currency)??0;return {provider:'xero' as const,accountId,tenant:run.tenant,runId:run.id,asOf,observedAt:run.updated_at,currency,nativeCents,ledgerCents,differenceCents:nativeCents-ledgerCents,status:mine.some(row=>row.status!=='Matched')||nativeCents!==ledgerCents?'Conflict':'Matched',sources:mine}})
}
export async function xeroWorkspace(env:Bindings,actor:Actor) {
 xeroOwner(actor);const connection=await xeroConnection(env.DB)
 let authorityCurrent=true;if(connection)try{await xeroAuthority(env,connection.revision)}catch{authorityCurrent=false}
 const references=(await env.DB.prepare('SELECT * FROM bw_xero_refs ORDER BY tenant,kind,source_id').all()).results
 const mappings=(await values(env.DB)).results,runs=(await env.DB.prepare('SELECT * FROM bw_xero_runs ORDER BY updated_at DESC LIMIT 20').all()).results
 const observations=(await env.DB.prepare('SELECT * FROM bw_xero_invoices ORDER BY rowid DESC LIMIT 200').all<Stored>()).results.map(row=>({...JSON.parse(row.value_json),revision:row.revision,orderId:row.order_id}))
 return {configured:!!connection,connection:connection?{tenant:connection.tenant,mode:connection.mode,state:authorityCurrent?connection.state:'reconnect',revision:connection.revision}:null,references,mappings,runs,observations,today:supplierDate(await now()),note:'Read-only XERO observations. Current dated balances are comparisons, not verified native payments. Provider copies remain separate; no provider erasure or financial write is performed.'}
}
export async function xeroObservation(env:Bindings,actor:Actor,key:string) {
 const row=await env.DB.prepare('SELECT * FROM bw_xero_invoices WHERE id=?').bind(key).first<Stored>()
 if(!row||!row.account_id)fail('NOT_FOUND','Observation not found.',404)
 await account(env.DB,actor,row.account_id);await requireCompanyRight(env.DB,actor,row.account_id,'finance')
 return {...JSON.parse(row.value_json),orderId:row.order_id,revision:row.revision}
}
export async function xeroExceptionSources(env:Bindings) {
 const candidates:FollowupSource[]=[],resolved=new Map<string,string>()
 const run=await env.DB.prepare("SELECT as_of FROM bw_xero_runs WHERE state='complete' ORDER BY updated_at DESC,rowid DESC LIMIT 1").first<{as_of:string}>()
 if(!run)return {candidates,resolved}
 const existing=(await env.DB.prepare("SELECT id FROM bw_followups WHERE json_extract(value_json,'$.kind')='xero'").all<{id:string}>()).results
 const accounts=(await env.DB.prepare('SELECT DISTINCT account_id FROM bw_xero_invoices WHERE account_id<>?').bind('').all<{account_id:string}>()).results
 for(const a of accounts)for(const comparison of await xeroComparisons(env.DB,a.account_id,run.as_of,new Map()))for(const source of comparison.sources) {
  const prefix='xero:'+source.tenant+':'+source.sourceId+':',key=prefix+source.sourceToken
  if(source.status==='Matched'&&run.as_of===supplierDate(await now())) {for(const prior of existing.filter(row=>row.id.startsWith(prefix)))resolved.set(prior.id,'Source-linked Xero invoice '+source.sourceId+' revision '+source.sourceToken+' and native outstanding match in dated observation '+run.as_of+'.')}
  else candidates.push({id:key,kind:'xero',accountId:a.account_id,sourceId:source.sourceId,sourcePath:source.path,title:'Review Xero invoice '+source.sourceId,reason:`${run.as_of===supplierDate(await now())?source.status:'Dated ledger observation needs refresh'}; ${source.currency}, tenant ${source.tenant}, correlation ${comparison.runId}, observed ${comparison.observedAt}.`,priority:1})
 }
 return {candidates,resolved}
}
