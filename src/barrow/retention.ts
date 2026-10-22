import { prepareLegacyErasure } from './legacy-erasure-journal'
import { applicationRetention, eraseApplication } from './application-custody'
// DATA-003: expiry only nominates records; a current owner explicitly reviews erasure.
import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { fail, integer, text, type Actor, type Order } from './model'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { toD1Sql } from '@runeditrun/rer/modules/erasure/fence'
import { portabilityPolicy } from './portability-policy.mjs'
const kinds = ['poDocuments','media','messages','commercialHistory','applicationRecords'] as const
function owner(actor:Actor) {
 if(actor.agent || actor.role!=='owner') fail('FORBIDDEN','Only the signed-in owner may review retention and erasure.',403)
}
async function settings(db:D1Database) {
 const row=await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='retention'").first<any>()
 return row?{days:JSON.parse(row.value_json),revision:row.revision}:{days:Object.fromEntries(kinds.map(kind=>[kind,null])),revision:null}
}
const guard=(db:D1Database,revision:string|null)=>db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='retention'),'')=? THEN 1 ELSE 0 END").bind(revision??'')
// Seven calendar years, clamping leap day to February 28, measured from latest known financial evidence.
function sevenYears(at:string) {
 const date=new Date(at),month=date.getUTCMonth()
 date.setUTCFullYear(date.getUTCFullYear()+7)
 if(date.getUTCMonth()!==month) date.setUTCDate(0)
 return date.getTime()
}
async function review(env:Bindings) {
 const policy=await settings(env.DB),now=Date.now()
 const requests=(await env.DB.prepare('SELECT * FROM bw_retention_requests ORDER BY requested_at,id').all<any>()).results
 const receipts=(await env.DB.prepare('SELECT * FROM bw_erasure_receipts ORDER BY erased_at,id').all<any>()).results
 const rows=(await env.DB.prepare('SELECT o.value_json,o.revision,d.sha256 FROM bw_orders o JOIN bw_order_documents d ON d.order_id=o.id ORDER BY o.id').all<any>()).results
 const documents=rows.map(row=>{
  const order=JSON.parse(row.value_json) as Order,uploaded=Date.parse(order.document?.uploadedAt??'')
  const days=policy.days.poDocuments,expiry=typeof days==='number'&&Number.isFinite(uploaded)?uploaded+days*86400000:null
  const held=requests.some(request=>request.account_id===order.accountId&&request.held===1)
  // A PO on a submitted commercial order is conservatively retained as commercial evidence.
  const financial=[order.invoice?.issuedAt,order.approvedAt,order.preparedAt].filter((at):at is string=>!!at).map(at=>Date.parse(at))
  const floor=order.status!=='draft'&&order.status!=='superseded'?sevenYears(new Date(Math.max(...financial)).toISOString()):null
  const eligible=expiry!==null&&now>expiry&&!held&&(floor===null||now>=floor)
  return {orderId:order.id,accountId:order.accountId,revision:row.revision,sha256:row.sha256,expiresAt:expiry===null?null:new Date(expiry).toISOString(),commercialMinimumUntil:floor===null?null:new Date(floor).toISOString(),held,eligible,reason:held?'Legal hold':floor!==null&&now<floor?'Commercial evidence: seven-year minimum':expiry===null?'No recorded retention age':now<=expiry?'Within retention':'Owner review required'}
 })
 const accountReceipts=(await env.DB.prepare('SELECT receipt_json FROM bw_account_erasure_journal ORDER BY rowid').all<{receipt_json:string}>()).results.map(row=>JSON.parse(row.receipt_json))
 return {policy,documents,requests,receipts,accountReceipts,applications:await applicationRetention(env,policy.days.applicationRecords??null),quoteDeliveryRetention:{kind:'messages',days:policy.days.messages,scope:'Saved quote delivery addresses and ledger rows; owner review, holds and unused-account erasure only. No automatic deletion.'},custody:{barrow:'Explicit owner account review erases personal data; commercial snapshots remain unchanged within their financial floor.',identity:'Ordered-account erasure deidentifies local buyer identities and removes credentials. Sign-in providers retain separate custody.',inventory:'Pier retains its own inventory and order history; no erasure sent.',accounting:'External accounting copies are not erased by Barrow.',mail:'Delivered messages and provider copies are not recalled.',backups:'D1 Time Travel retains 30 days paid or 7 days free and cannot be purged early. The private R2 erasure journal must survive outside D1 and is re-applied before serving or mail.'},unsupportedKinds:['media','messages','commercialHistory']}
}
export async function readRetention(env:Bindings,actor:Actor) { owner(actor);return review(env) }
export async function retentionCommand(env:Bindings,actor:Actor,type:string,p:any) {
 owner(actor)
 const revision=crypto.randomUUID(),reason=text(p.reason,'Review reason',1000)
 if(type==='retention.settings') {
  const prior=await settings(env.DB)
  if(p.revision!==prior.revision) fail('CHANGED','Refresh the retention policy before saving.')
  if(!p.days||typeof p.days!=='object'||Object.keys(p.days).some(key=>!kinds.includes(key as any))) fail('INPUT','Use the declared retention record kinds.',400)
  const days=Object.fromEntries(kinds.map(kind=>[kind,p.days[kind]===null||p.days[kind]===undefined?null:integer(p.days[kind],kind+' retention days',1,36500)]))
  await commit(env.DB,actor,[guard(env.DB,prior.revision),env.DB.prepare("INSERT INTO bw_settings VALUES('retention',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(days),revision),audit(env.DB,actor,'retention','retention.settings',{revision,source:type,reason})])
  return {days,revision}
 }
 if(type==='retention.erase-application')return eraseApplication(env,actor,p,await settings(env.DB))
 if(type==='retention.request') {
  const account=await env.DB.prepare('SELECT id FROM bw_accounts WHERE id=?').bind(text(p.accountId,'Account ID')).first()
  if(!account) fail('NOT_FOUND','Trade account not found.',404)
  if(typeof p.held!=='boolean') fail('INPUT','Choose whether the request is held.',400)
  const prior=await env.DB.prepare('SELECT revision FROM bw_retention_requests WHERE id=?').bind(p.accountId).first<any>()
  if((p.revision??null)!==(prior?.revision??null)) fail('CHANGED','Refresh the erasure request before reviewing it.')
  await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=?) THEN 1 ELSE 0 END').bind(p.accountId),env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_retention_requests WHERE id=?),'')=? THEN 1 ELSE 0 END").bind(p.accountId,prior?.revision??''),env.DB.prepare('INSERT INTO bw_retention_requests(id,account_id,reason,held,revision,requested_by,requested_at,requester,channel,verification_note) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,held=excluded.held,revision=excluded.revision,requested_by=excluded.requested_by,requested_at=excluded.requested_at,requester=excluded.requester,channel=excluded.channel,verification_note=excluded.verification_note').bind(p.accountId,p.accountId,reason,p.held?1:0,revision,actor.id,new Date().toISOString(),text(p.requester??actor.id,'Requester',240),text(p.channel??'Owner review','Request channel',240),text(p.verificationNote??'Verified through the current owner session','Verification note',1000)),audit(env.DB,actor,p.accountId,'retention.request',{accountId:p.accountId,revision,source:type,reason})])
  return {id:p.accountId,revision,held:p.held,commercialHistory:'preserved'}
 }
 if(type==='retention.erase-document') {
  if(p.confirm!=='ERASE') fail('CONFIRM','Type ERASE to confirm the reviewed PO attachment.',400)
  const state=await review(env),document=state.documents.find(document=>document.orderId===p.orderId)
  if(!document) fail('NOT_FOUND','PO document not found.',404)
  if(!document.eligible) fail('RETENTION','This document is not eligible: '+document.reason)
  if(p.sha256!==document.sha256||p.revision!==document.revision||p.policyRevision!==state.policy.revision) fail('CHANGED','Refresh and review the current attachment and retention policy.')
  const portability=await createPortability({db:env.DB,policy:portabilityPolicy})
  const checkpoint=[...await portability.invalidateTransfersStatements(),...await portability.redactionStatements()].map(toD1Sql).map(statement=>env.DB.prepare(statement.sql).bind(...(statement.params??[])))
  const at=new Date().toISOString()
  const journal=await prepareLegacyErasure(env,actor,'po-document',document.accountId,{orderId:document.orderId,sha256:document.sha256,reason},{id:revision,orderId:document.orderId,sha256:document.sha256,erasedBy:actor.id,erasedAt:at,commercialHistory:'preserved'})
  await journal.run(()=>commit(env.DB,actor,[env.DB.prepare(journal.statement.sql).bind(...journal.statement.params!),guard(env.DB,state.policy.revision),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_retention_requests WHERE account_id=? AND held=1) THEN 1 ELSE 0 END').bind(document.accountId),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(document.orderId,document.revision),env.DB.prepare('DELETE FROM bw_order_documents WHERE order_id=? AND sha256=?').bind(document.orderId,document.sha256),changed(env.DB),...checkpoint,env.DB.prepare('INSERT INTO bw_erasure_receipts VALUES(?,?,?,?,?,?,?)').bind(revision,document.orderId,document.accountId,document.sha256,actor.id,at,reason),audit(env.DB,actor,document.orderId,'retention.document-erased',{accountId:document.accountId,orderId:document.orderId,revision,source:type,reason})]))
  return {id:revision,orderId:document.orderId,sha256:document.sha256,erasedBy:actor.id,erasedAt:at,commercialHistory:'preserved'}
 }
 fail('COMMAND','Unknown retention command.',404)
}
