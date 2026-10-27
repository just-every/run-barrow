import {parseNuorder,type NuorderInput} from './nuorder'
import {planNuorderCatalog,nuorderCatalogStatements} from './nuorder-catalog'
import {planWizNative} from './wizcommerce-native'
import {parseWizCommerce,type WizInput} from './wizcommerce'
import type { Bindings } from '../../auth.server'
import { audit, commit } from '../access'
import { fail, text, type Actor } from '../model'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { validateAccountValue } from './validation'
import { parseSparkLayer, type SparkInput, type PlatformSource, type HistoryDocument } from './sparklayer'

const hash=(value:unknown)=>sha256(canonicalJson(value as any))
export function platformOwner(actor:Actor) {if(actor.agent||actor.staff||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may review incumbent source history.',403)}
const docKey=(source:PlatformSource,id:string,type:string)=>hash([source.system,source.tenant,id,source.system==='wizcommerce'&&type!=='list'?'document':type])
function normalizedHistory(doc:HistoryDocument) {
 const {originals,...document}=doc
 return {...document,lines:document.lines.map(({original,row,...line})=>line)}
}
const snapshot=async(db:D1Database,query:string)=>(await db.prepare(query).all<any>()).results
async function prepare(env:Bindings,actor:Actor,input:SparkInput|WizInput|NuorderInput,system:'sparklayer'|'wizcommerce'|'nuorder'='sparklayer') {
 platformOwner(actor)
 const db=env.DB
 const retained=system==='nuorder'?(await db.prepare("SELECT source_json FROM bw_platform_imports WHERE system='nuorder' AND tenant=? ORDER BY created_at,id").bind(input.tenant).all<{source_json:string}>()).results.flatMap(row=>JSON.parse(row.source_json).catalog?.heldImages??[]):[]
 const source=system==='nuorder'?await parseNuorder(input as NuorderInput,retained):system==='wizcommerce'?await parseWizCommerce(input as WizInput):parseSparkLayer(input as SparkInput)
 const queries={...(system==='nuorder'?{settings:"SELECT key,value_json,revision FROM bw_settings WHERE key IN ('catalog-maintenance','variant-attributes') ORDER BY key"}:{}),accounts:'SELECT id,value_json,revision FROM bw_accounts ORDER BY id',lists:'SELECT * FROM bw_lists ORDER BY id',history:'SELECT * FROM bw_import_history ORDER BY id',links:'SELECT * FROM bw_import_lists ORDER BY system,tenant,source_id',locations:'SELECT * FROM bw_locations ORDER BY id',imports:'SELECT id,system,tenant,source_json FROM bw_platform_imports ORDER BY id'}
 const native=Object.fromEntries(await Promise.all(Object.entries(queries).map(async([kind,query])=>[kind,await snapshot(db,query)]))) as Record<keyof typeof queries,any[]>
 const errors:string[]=[],activation=source.activation?planWizNative(source.tenant,source.activation,{accounts:native.accounts,locations:native.locations,imports:native.imports},errors):undefined
 const accounts=activation?.accounts??new Map(native.accounts.map(row=>[row.id,row])),catalog=source.catalog?await planNuorderCatalog(env,source.catalog,errors):undefined,scope=[...new Set([...source.documents,...source.lists].map(row=>row.accountId).concat(source.relatedAccounts??[]))].sort()
 const updates=new Map<string,any>()
 for(const id of scope){const row=accounts.get(id);if(!row)errors.push(`Missing mapped account ${id}`);else if(JSON.parse(row.value_json).lifecycle==='closed')errors.push(`Mapped account ${id} is closed; do not restore retired source custody`)}
 for(const book of source.catalog?.priceBooks??[]) {
  const account=accounts.get(book.accountId);if(!account)continue
  const value=JSON.parse(account.value_json)
  if(value.prices.some((price:any)=>price.units?.length||price.pricing)){errors.push(`Account ${book.accountId} has configured selling units or pricing rules; review these through the native account door before replacing its book`);continue}
  value.currency=book.currency;value.prices=book.prices.map(price=>({...price}));updates.set(book.accountId,value)
 }
 for(const doc of source.documents) {
  const account=accounts.get(doc.accountId);if(!account)continue
  const value=updates.get(account.id)??JSON.parse(account.value_json)
  for(const line of doc.lines) {
   const price=value.prices.find((price:any)=>price.sku===line.sku)
   if(!price){errors.push(`Account ${account.id} has no mapped price SKU ${line.sku}`);continue}
   for(const key of ['casePack','increment'] as const)if(line[key]!==undefined) {
    const prior=updates.get(account.id)?.prices.find((p:any)=>p.sku===line.sku)?.[key]
    if(prior!==undefined&&prior!==line[key])errors.push(`Conflicting source ${key} for ${line.sku}`)
    price[key]=line[key];updates.set(account.id,value)
   }
  }
 }
 // Product-level pack rules also apply to entitled SKUs absent from order lines.
 // A source product never creates a price or widens an account's assortment.
 for(const accountId of scope)if(source.catalog) {
  const account=accounts.get(accountId);if(!account)continue
  const value=updates.get(accountId)??JSON.parse(account.value_json)
  for(const product of source.catalog.products) {
   const price=value.prices.find((price:any)=>price.sku===product.sku);if(!price)continue
   for(const key of ['casePack','increment'] as const)if(product[key]!==undefined){price[key]=product[key];updates.set(accountId,value)}
  }
 }
 for(const [id,value] of updates)updates.set(id,validateAccountValue(value))
 const documents=source.documents.map(doc=>{
  const id=docKey(source,doc.id,doc.type),contentHash=hash(source.system==='wizcommerce'?normalizedHistory(doc):doc),prior=native.history.find(row=>row.id===id)
  if(prior&&prior.content_hash!==contentHash)errors.push(`Source ${doc.type} ${doc.id} changed after import; preserve history and review a distinct source revision`)
  return {id,value:doc,contentHash,exists:Boolean(prior)}
 })
 const plannedLists=source.lists.map(list=>{
  const id=docKey(source,list.id,'list'),contentHash=hash(list),prior=native.links.find(row=>row.system===source.system&&row.tenant===source.tenant&&row.source_id===list.id)
  if(prior&&prior.content_hash!==contentHash)errors.push(`Source list ${list.id} changed after import; preserve native edits and use a distinct source ID`)
  if(!prior&&native.lists.some(row=>row.account_id===list.accountId&&row.created_by===actor.id&&row.name.toLowerCase()===list.name.toLowerCase()))errors.push(`A private list named ${list.name} already exists; choose another source name`)
  const value={name:list.name,shared:false,createdBy:actor.id,createdAt:'',updatedBy:actor.id,updatedAt:'',lines:list.lines}
  return {id,sourceId:list.id,accountId:list.accountId,contentHash,value,exists:Boolean(prior)}
 })
 for(const id of scope)if(native.lists.filter(row=>row.account_id===id&&row.created_by===actor.id).length+plannedLists.filter(list=>list.accountId===id&&!list.exists).length>50)errors.push(`Account ${id} exceeds the fifty private lists limit`)
 if(new Set(plannedLists.map(list=>list.accountId+':'+list.value.name.toLowerCase())).size!==plannedLists.length)errors.push('Source lists repeat a name on one account')
 const totals=[...new Set(source.documents.map(doc=>doc.currency))].sort().map(currency=>{const docs=source.documents.filter(doc=>doc.currency===currency);return {currency,orders:docs.filter(doc=>doc.type==='order').length,quotes:docs.filter(doc=>doc.type==='quote').length,totalCents:docs.reduce((n,doc)=>n+doc.totalCents,0),shippingCents:docs.reduce((n,doc)=>n+doc.shippingCents,0),quantity:docs.reduce((n,doc)=>n+doc.lines.reduce((n,line)=>n+line.quantity,0),0),...(system==='nuorder'?{openQuantity:docs.reduce((n,doc)=>n+doc.lines.reduce((n,line)=>n+(line.openQuantity??0),0),0)}:{})}})
 const counts={documents:documents.length,lines:source.documents.reduce((n,doc)=>n+doc.lines.length,0),lists:plannedLists.length,listLines:source.lists.reduce((n,list)=>n+list.lines.length,0)}
 const byStatus=[...new Set(source.documents.map(doc=>JSON.stringify([doc.currency,doc.type,doc.status])))].sort().map(key=>{const [currency,type,status]=JSON.parse(key),docs=source.documents.filter(doc=>doc.currency===currency&&doc.type===type&&doc.status===status);return {currency,type,status,count:docs.length,totalCents:docs.reduce((n,doc)=>n+doc.totalCents,0)}})
 const entityCounts=source.entities?{customers:source.entities.customers.length,addresses:source.entities.addresses.length,...(source.entities.contacts?.length?{contacts:source.entities.contacts.length}:{}),websiteUsers:source.entities.users.length}:undefined
 const quantityRules=[...updates].flatMap(([accountId,value])=>value.prices.flatMap((price:any)=>{const before=JSON.parse(accounts.get(accountId)!.value_json).prices.find((p:any)=>p.sku===price.sku);const previous={casePack:before?.casePack??null,increment:before?.increment??null},planned={casePack:price.casePack??null,increment:price.increment??null};return JSON.stringify(previous)===JSON.stringify(planned)?[]:[{accountId,sku:price.sku,previous,planned}]}))
 const priceBooks=source.catalog?.priceBooks.map(book=>{const planned=updates.get(book.accountId);return {accountId:book.accountId,currency:book.currency,sourceRows:book.prices.length,plannedRows:planned?.prices.length??0,sourceUnitCents:book.prices.reduce((sum,price)=>sum+price.unitCents,0),plannedUnitCents:planned?.prices.reduce((sum:number,price:any)=>sum+price.unitCents,0)??0}})
 const report={...(catalog?{catalog:catalog.report,priceBooks}:{}),...(activation?{nativeEntities:activation.report}:{}),quantityRules,...(source.invitationCandidates?{invitationCandidates:source.invitationCandidates}:{}),...(entityCounts?{entities:entityCounts}:{}),byStatus,source:counts,planned:{...counts,newDocuments:documents.filter(doc=>!doc.exists).length,newLists:plannedLists.filter(list=>!list.exists).length},totals,plannedTotals:totals,matches:!errors.length,scope:source.scope,incomplete:source.incomplete,missing:source.missing,rejectedFields:source.rejectedFields??[] as string[],errors,label:system==='nuorder'?'Reviewed native catalog metadata, supplied current price books and quantity rules; orders remain retained source history; no stock reservation, invoice, payment, invitation or outreach':activation?'Reviewed native customers and locations; retained document history; no stock reservation, invoice, payment, invitation or outreach':'Retained source history only; no stock reservation, invoice, payment, invitation or outreach'}
 const {fingerprint:ignoredFingerprint,reason:ignoredReason,...reviewInput}=input as SparkInput&{fingerprint?:string;reason?:string}
 const fingerprint=hash({input:reviewInput,native,source,report})
 return {source,native,queries,scope,documents,plannedLists,updates,activation,catalog,report,fingerprint}
}
export async function previewPlatform(env:Bindings,actor:Actor,input:SparkInput|WizInput|NuorderInput,system:'sparklayer'|'wizcommerce'|'nuorder'='sparklayer') {const p=await prepare(env,actor,input,system);return {...p.report,fingerprint:p.fingerprint}}
export async function readPlatform(env:Bindings,actor:Actor) {
 platformOwner(actor)
 return {imports:await snapshot(env.DB,'SELECT * FROM bw_platform_imports ORDER BY created_at,id'),history:(await snapshot(env.DB,'SELECT * FROM bw_import_history ORDER BY id')).map(row=>({...row,value:JSON.parse(row.value_json),value_json:undefined}))}
}
export async function applyPlatform(env:Bindings,actor:Actor,input:(SparkInput|WizInput|NuorderInput)&{fingerprint:string;reason:string},system:'sparklayer'|'wizcommerce'|'nuorder'='sparklayer') {
 platformOwner(actor)
 const fingerprint=text(input.fingerprint,'Reviewed fingerprint',64),reason=text(input.reason,'Approval reason',1000)
 if(!/^[a-f0-9]{64}$/.test(fingerprint))fail('IMPORT_APPROVAL','Supply the exact reviewed fingerprint.',400)
 const previous=await env.DB.prepare('SELECT id FROM bw_platform_imports WHERE fingerprint=?').bind(fingerprint).first()
 if(previous)return {replayed:true,fingerprint}
 const {fingerprint:actual,source,native,queries,scope,documents,plannedLists,updates,activation,catalog,report}=await prepare(env,actor,input,system)
 if(actual!==fingerprint)fail('IMPORT_CHANGED','Source, mappings or native records changed. Preview and approve the new fingerprint.')
 if(report.errors.length)fail('IMPORT_UNRESOLVED','Resolve every reported source and target error before apply.')
 const db=env.DB,id=crypto.randomUUID(),at=new Date().toISOString(),statements:D1PreparedStatement[]=[]
 for(const [kind,query] of Object.entries(queries)) {
  const rows=native[kind as keyof typeof native],columns=Object.keys(rows[0]??({settings:{key:0,value_json:0,revision:0},accounts:{id:0,value_json:0,revision:0},lists:{id:0,account_id:0,name:0,created_by:0,value_json:0,revision:0},history:{id:0,system:0,tenant:0,source_id:0,document_type:0,account_id:0,value_json:0,content_hash:0,import_id:0},links:{system:0,tenant:0,source_id:0,list_id:0,content_hash:0,account_id:0},locations:{id:0,account_id:0,kind:0,value_json:0,revision:0,is_default:0,archived:0},imports:{id:0,system:0,tenant:0,source_json:0}}[kind as keyof typeof native]))
  statements.push(db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(${columns.join(',')})) FROM (${query}))=? THEN 1 ELSE 0 END`).bind(JSON.stringify(rows.map(row=>columns.map(c=>row[c])))))
 }
 if(catalog)statements.push(...nuorderCatalogStatements(db,catalog,actor.id,at,fingerprint))
 for(const customer of activation?.creates??[]) {
  const value=updates.get(customer.accountId)??customer.value
  statements.push(db.prepare('INSERT INTO bw_accounts VALUES(?,?,?)').bind(customer.accountId,JSON.stringify(value),fingerprint),db.prepare('INSERT INTO bw_company_legacy_accounts VALUES(?)').bind(customer.accountId),audit(db,actor,customer.accountId,'account.saved',{accountId:customer.accountId,revision:fingerprint,source:'wizcommerce.apply',reason}))
 }
 const defaults=new Set(native.locations.filter(row=>row.is_default&&!row.archived).map(row=>row.account_id+':'+row.kind))
 for(const place of activation?.places.filter(row=>!row.exists)??[]) {
  const key=place.accountId+':'+place.kind,isDefault=place.kind!=='contact'&&!defaults.has(key)
  if(isDefault)defaults.add(key)
  statements.push(db.prepare('INSERT INTO bw_locations(id,account_id,kind,value_json,revision,is_default) VALUES(?,?,?,?,?,?)').bind(place.id,place.accountId,place.kind,JSON.stringify(place.value),fingerprint,isDefault?1:0),audit(db,actor,place.id,'location.added',{accountId:place.accountId,revision:fingerprint,source:'wizcommerce.apply',reason}))
 }
 for(const row of documents.filter(doc=>!doc.exists))statements.push(db.prepare('INSERT INTO bw_import_history VALUES(?,?,?,?,?,?,?,?,?)').bind(row.id,source.system,source.tenant,row.value.id,row.value.type,row.value.accountId,JSON.stringify({...row.value,label:'retained source history'}),row.contentHash,id))
 for(const row of plannedLists.filter(list=>!list.exists)) {
  const value={...row.value,createdAt:at,updatedAt:at}
  statements.push(db.prepare('INSERT INTO bw_lists VALUES(?,?,?,?,?,?)').bind(row.id,row.accountId,value.name,actor.id,JSON.stringify(value),fingerprint),db.prepare('INSERT INTO bw_import_lists VALUES(?,?,?,?,?,?)').bind(source.system,source.tenant,row.sourceId,row.id,row.contentHash,row.accountId))
 }
 for(const [accountId,value] of updates)if(native.accounts.some(row=>row.id===accountId)&&JSON.stringify(value)!==accountsValue(native.accounts,accountId))statements.push(db.prepare('UPDATE bw_accounts SET value_json=?,revision=? WHERE id=?').bind(JSON.stringify(value),fingerprint,accountId))
 statements.push(db.prepare('INSERT INTO bw_platform_imports VALUES(?,?,?,?,?,?,?,?,?)').bind(id,fingerprint,source.system,source.tenant,JSON.stringify(scope),JSON.stringify(source),JSON.stringify(report),actor.id,at),audit(db,actor,id,'import.approved',{revision:fingerprint,source:`${source.system}.apply`,reason}))
 try {await commit(db,actor,statements)}catch(error) {
  if((error as Error).message.includes('CHECK constraint'))fail('IMPORT_CHANGED','Native records changed during apply; preview again.')
  if((error as Error).message.includes('UNIQUE constraint')){const winner=await db.prepare('SELECT id FROM bw_platform_imports WHERE fingerprint=?').bind(fingerprint).first();if(winner)return {replayed:true,fingerprint}}
  throw error
 }
 return {id,fingerprint,...report}
}
const accountsValue=(rows:any[],id:string)=>rows.find(row=>row.id===id)?.value_json
