import type { Bindings } from '../../auth.server'
import { audit, commit } from '../access'
import { fail, text, type Actor } from '../model'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { validateAccountValue } from './validation'
import { parseSparkLayer, type SparkInput, type PlatformSource } from './sparklayer'

const hash=(value:unknown)=>sha256(canonicalJson(value as any))
export function platformOwner(actor:Actor) {if(actor.agent||actor.staff||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may review incumbent source history.',403)}
const docKey=(source:PlatformSource,id:string,type:string)=>hash([source.system,source.tenant,id,type])
const snapshot=async(db:D1Database,query:string)=>(await db.prepare(query).all<any>()).results
async function prepare(env:Bindings,actor:Actor,input:SparkInput) {
 platformOwner(actor)
 const source=parseSparkLayer(input),db=env.DB
 const queries={accounts:'SELECT id,value_json,revision FROM bw_accounts ORDER BY id',lists:'SELECT * FROM bw_lists ORDER BY id',history:'SELECT * FROM bw_import_history ORDER BY id',links:'SELECT * FROM bw_import_lists ORDER BY system,tenant,source_id'}
 const native=Object.fromEntries(await Promise.all(Object.entries(queries).map(async([kind,query])=>[kind,await snapshot(db,query)]))) as Record<keyof typeof queries,any[]>
 const accounts=new Map(native.accounts.map(row=>[row.id,row])),scope=[...new Set([...source.documents,...source.lists].map(row=>row.accountId))].sort()
 const errors:string[]=[],updates=new Map<string,any>()
 for(const id of scope){const row=accounts.get(id);if(!row)errors.push(`Missing mapped account ${id}`);else if(JSON.parse(row.value_json).lifecycle==='closed')errors.push(`Mapped account ${id} is closed; do not restore retired source custody`)}
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
 for(const [id,value] of updates)updates.set(id,validateAccountValue(value))
 const documents=source.documents.map(doc=>{
  const id=docKey(source,doc.id,doc.type),contentHash=hash(doc),prior=native.history.find(row=>row.id===id)
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
 const totals=[...new Set(source.documents.map(doc=>doc.currency))].sort().map(currency=>{const docs=source.documents.filter(doc=>doc.currency===currency);return {currency,orders:docs.filter(doc=>doc.type==='order').length,quotes:docs.filter(doc=>doc.type==='quote').length,totalCents:docs.reduce((n,doc)=>n+doc.totalCents,0),shippingCents:docs.reduce((n,doc)=>n+doc.shippingCents,0),quantity:docs.reduce((n,doc)=>n+doc.lines.reduce((n,line)=>n+line.quantity,0),0)}})
 const counts={documents:documents.length,lines:source.documents.reduce((n,doc)=>n+doc.lines.length,0),lists:plannedLists.length,listLines:source.lists.reduce((n,list)=>n+list.lines.length,0)}
 const report={source:counts,planned:{...counts,newDocuments:documents.filter(doc=>!doc.exists).length,newLists:plannedLists.filter(list=>!list.exists).length},totals,plannedTotals:totals,matches:!errors.length,scope:source.scope,incomplete:source.incomplete,missing:source.missing,rejectedFields:[] as string[],errors,label:'Retained source history only; no stock reservation, invoice, payment, invitation or outreach'}
 const {fingerprint:ignoredFingerprint,reason:ignoredReason,...reviewInput}=input as SparkInput&{fingerprint?:string;reason?:string}
 const fingerprint=hash({input:reviewInput,native,source,report})
 return {source,native,queries,scope,documents,plannedLists,updates,report,fingerprint}
}
export async function previewPlatform(env:Bindings,actor:Actor,input:SparkInput) {const p=await prepare(env,actor,input);return {...p.report,fingerprint:p.fingerprint}}
export async function readPlatform(env:Bindings,actor:Actor) {
 platformOwner(actor)
 return {imports:await snapshot(env.DB,'SELECT * FROM bw_platform_imports ORDER BY created_at,id'),history:(await snapshot(env.DB,'SELECT * FROM bw_import_history ORDER BY id')).map(row=>({...row,value:JSON.parse(row.value_json),value_json:undefined}))}
}
export async function applyPlatform(env:Bindings,actor:Actor,input:SparkInput&{fingerprint:string;reason:string}) {
 platformOwner(actor)
 const fingerprint=text(input.fingerprint,'Reviewed fingerprint',64),reason=text(input.reason,'Approval reason',1000)
 if(!/^[a-f0-9]{64}$/.test(fingerprint))fail('IMPORT_APPROVAL','Supply the exact reviewed fingerprint.',400)
 const previous=await env.DB.prepare('SELECT id FROM bw_platform_imports WHERE fingerprint=?').bind(fingerprint).first()
 if(previous)return {replayed:true,fingerprint}
 const {fingerprint:actual,source,native,queries,scope,documents,plannedLists,updates,report}=await prepare(env,actor,input)
 if(actual!==fingerprint)fail('IMPORT_CHANGED','Source, mappings or native records changed. Preview and approve the new fingerprint.')
 if(report.errors.length)fail('IMPORT_UNRESOLVED','Resolve every reported source and target error before apply.')
 const db=env.DB,id=crypto.randomUUID(),at=new Date().toISOString(),statements:D1PreparedStatement[]=[]
 for(const [kind,query] of Object.entries(queries)) {
  const rows=native[kind as keyof typeof native],columns=Object.keys(rows[0]??({accounts:{id:0,value_json:0,revision:0},lists:{id:0,account_id:0,name:0,created_by:0,value_json:0,revision:0},history:{id:0,system:0,tenant:0,source_id:0,document_type:0,account_id:0,value_json:0,content_hash:0,import_id:0},links:{system:0,tenant:0,source_id:0,list_id:0,content_hash:0,account_id:0}}[kind as keyof typeof native]))
  statements.push(db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(${columns.join(',')})) FROM (${query}))=? THEN 1 ELSE 0 END`).bind(JSON.stringify(rows.map(row=>columns.map(c=>row[c])))))
 }
 for(const row of documents.filter(doc=>!doc.exists))statements.push(db.prepare('INSERT INTO bw_import_history VALUES(?,?,?,?,?,?,?,?,?)').bind(row.id,source.system,source.tenant,row.value.id,row.value.type,row.value.accountId,JSON.stringify({...row.value,label:'retained source history'}),row.contentHash,id))
 for(const row of plannedLists.filter(list=>!list.exists)) {
  const value={...row.value,createdAt:at,updatedAt:at}
  statements.push(db.prepare('INSERT INTO bw_lists VALUES(?,?,?,?,?,?)').bind(row.id,row.accountId,value.name,actor.id,JSON.stringify(value),fingerprint),db.prepare('INSERT INTO bw_import_lists VALUES(?,?,?,?,?,?)').bind(source.system,source.tenant,row.sourceId,row.id,row.contentHash,row.accountId))
 }
 for(const [accountId,value] of updates)if(JSON.stringify(value)!==accountsValue(native.accounts,accountId))statements.push(db.prepare('UPDATE bw_accounts SET value_json=?,revision=? WHERE id=?').bind(JSON.stringify(value),fingerprint,accountId))
 statements.push(db.prepare('INSERT INTO bw_platform_imports VALUES(?,?,?,?,?,?,?,?,?)').bind(id,fingerprint,source.system,source.tenant,JSON.stringify(scope),JSON.stringify(source),JSON.stringify(report),actor.id,at),audit(db,actor,id,'import.approved',{revision:fingerprint,source:'sparklayer.apply',reason}))
 try {await commit(db,actor,statements)}catch(error) {
  if((error as Error).message.includes('CHECK constraint'))fail('IMPORT_CHANGED','Native records changed during apply; preview again.')
  if((error as Error).message.includes('UNIQUE constraint')){const winner=await db.prepare('SELECT id FROM bw_platform_imports WHERE fingerprint=?').bind(fingerprint).first();if(winner)return {replayed:true,fingerprint}}
  throw error
 }
 return {id,fingerprint,...report}
}
const accountsValue=(rows:any[],id:string)=>rows.find(row=>row.id===id)?.value_json
