import { eraseReturnNarrative, eraseReturnAudit } from './return-claim-custody'
import { campaignErasureStatements } from './campaign-custody'
import { deltaErasure } from './imports/delta-custody'
import { cutoverErasure } from './imports/cutover-custody'
/** Outside-D1 protection for the erasure doors that predate account redaction. */
import type { Bindings } from '../auth.server'
import type { Actor } from './model'
import { fail } from './model'
import { writeErasureIntent, completeErasureIntent, abandonErasureIntent, journalSource } from './erasure-journal'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { toD1Sql } from '@runeditrun/rer/modules/erasure/fence'
import { portabilityPolicy } from './portability-policy.mjs'
export type LegacyErasure={version:1;kind:'unused-account'|'company-user'|'po-document'|'application';sourceIdentity:string;id:string;accountId:string;actorId:string;at:string;reason:string;payload:any;receipt:any}
export async function prepareLegacyErasure(env:Bindings,actor:Actor,kind:LegacyErasure['kind'],accountId:string,payload:any,receipt:any) {
 if(actor.agent||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may erase personal data.',403)
 const operation:LegacyErasure={version:1,kind,sourceIdentity:await journalSource(env),id:receipt.id??crypto.randomUUID(),accountId,actorId:actor.id,at:receipt.erasedAt??new Date().toISOString(),reason:payload.reason??'Owner confirmed erasure of an unused account.',payload,receipt}
 const fingerprint=await writeErasureIntent(env,operation),statement={sql:'INSERT INTO bw_account_erasure_journal VALUES(?,?,?,?)',params:[operation.id,accountId,fingerprint,JSON.stringify({...receipt,kind,accountId,actorId:actor.id,reason:operation.reason,at:operation.at})]}
 return {statement,async run<T>(apply:()=>Promise<T>) {
  try {const result=await apply();await completeErasureIntent(env,operation.id,fingerprint);return result}
  catch(error){const committed=await env.DB.prepare('SELECT 1 FROM bw_account_erasure_journal WHERE id=?').bind(operation.id).first();if(!committed)await abandonErasureIntent(env,operation);throw error}
 }}
}
export async function replayLegacyErasure(env:Bindings,operation:LegacyErasure,fingerprint:string) {
 const {accountId,payload:p,kind}=operation,statements:{sql:string;params?:any[]}[]=[],put=(sql:string,...params:any[])=>statements.push({sql,params})
 if(kind==='po-document')put('DELETE FROM bw_order_documents WHERE order_id=?',p.orderId)
 if(kind==='application') {
  for(const table of ['bw_application_documents','bw_application_history','bw_application_codes','bw_application_sessions'])put(`DELETE FROM ${table} WHERE application_id=?`,p.id)
  put('DELETE FROM bw_applications WHERE id=?',p.id)
 }
 if(kind==='company-user') {
  statements.push(...campaignErasureStatements('recipient_id',p.userId))
  const current=await env.DB.prepare('SELECT email,display_name FROM oa_operators WHERE id=?').bind(p.userId).first<any>(),membership=await env.DB.prepare('SELECT email,display_name FROM bw_company_members WHERE user_id=? LIMIT 1').bind(p.userId).first<any>(),subjects=(await env.DB.prepare('SELECT subject FROM oa_external_identities WHERE operator_id=?').bind(p.userId).all<any>()).results.map(row=>row.subject)
  const id=p.userId,email=`former-${id.replace(/[^A-Za-z0-9-]/g,'')}@invalid.invalid`
  for(const table of ['oa_provider_sessions','oa_provider_session_pins'])put(`DELETE FROM ${table} WHERE session_id IN (SELECT id FROM oa_sessions WHERE operator_id=?)`,id)
  put("DELETE FROM oa_dev_credentials WHERE (credential='oa_sessions' AND id IN (SELECT id FROM oa_sessions WHERE operator_id=?)) OR (credential='oa_tokens' AND id IN (SELECT id FROM oa_tokens WHERE operator_id=?)) OR (credential='oa_credentials' AND id IN (SELECT id FROM oa_credentials WHERE operator_id=?))",id,id,id)
  for(const table of ['oa_sessions','oa_tokens','oa_credentials','oa_step_up_challenges','oa_external_identities','oa_owner_signins'])put(`DELETE FROM ${table} WHERE operator_id=?`,id)
  put('DELETE FROM bw_agent_tokens WHERE actor_id=?',id)
  put('DELETE FROM bw_profile_approvals WHERE user_id=?',id)
  put("UPDATE oa_operators SET email=?,display_name='Former company user',status='inactive' WHERE id=? AND role='member'",email,id)
  put("UPDATE bw_company_members SET email=?,email_key=?,display_name='Former company user',state='removed',erased_at=?,revision=? WHERE user_id=?",email,email,operation.at,operation.id,id)
  put("DELETE FROM bw_company_invites WHERE member_id IN (SELECT id FROM bw_company_members WHERE user_id=?) OR email_key=?",id,p.email)
  put("DELETE FROM bw_lists WHERE created_by=? AND json_extract(value_json,'$.shared')=0",id)
  put('DELETE FROM bw_usage_acceptances WHERE user_id=?',id)
  put("UPDATE bw_company_delegations SET state='ended' WHERE delegator_id=? OR delegate_id=?",id,id)
  put('DELETE FROM bw_approval_notices WHERE recipient_id=? OR delegated_from=?',id,id)
  for(const table of ['bw_stock_watches','bw_stock_notices'])put(`DELETE FROM ${table} WHERE user_id=?`,id)
  put("DELETE FROM rer_mail_event_receipts WHERE event_namespace='quotes' AND json_extract(event_json,'$.providerMessageId') IN (SELECT provider_message_id FROM bw_quote_mail WHERE recipient_id=?)",id)
  put("DELETE FROM rer_mail_event_states WHERE event_namespace='quotes' AND provider_message_id IN (SELECT provider_message_id FROM bw_quote_mail WHERE recipient_id=?)",id)
  put("UPDATE bw_quote_mail SET recipient=NULL,summary='[Erased notice]',submission_json=NULL,sender_result_json=NULL,restored=1 WHERE recipient_id=?",id)
  const originals=[p.email,p.name,current?.email,current?.display_name,membership?.email,membership?.display_name,...p.subjects??[],...subjects].filter(Boolean)
  const redact=(value:any,key=''):any=>{
   if(/^(id|sku|reference|sha256|unit)$|Id$|By$/.test(key))return value
   if(typeof value==='string')return originals.reduce((v,original)=>original.includes('@')?v.replaceAll(original,email):v===original?'Former company user':v,value)
   if(Array.isArray(value))return value.map(item=>redact(item,key))
   return value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redact(item,key)])):value
  }
  for(const table of ['bw_orders','bw_quotes','bw_lists','bw_return_claims','bw_campaigns','bw_campaign_segments'])for(const row of (await env.DB.prepare(`SELECT * FROM ${table}`).all<any>()).results){const redacted=redact(JSON.parse(row.value_json));const value=JSON.stringify(table==='bw_return_claims'?eraseReturnNarrative(redacted,id):redacted);if(value!==row.value_json)put(`UPDATE ${table} SET value_json=?,revision=? WHERE id=?`,value,operation.id,row.id)}
  for(const row of (await env.DB.prepare('SELECT * FROM bw_confirmations').all<any>()).results){const value=JSON.stringify(redact(JSON.parse(row.value_json)));if(value!==row.value_json)put('UPDATE bw_confirmations SET value_json=? WHERE order_id=? AND number=?',value,row.order_id,row.number)}
  for(const [table,column] of [['bw_quote_notices','summary'],['bw_audit','context_json'],['oa_auth_audit','value']])for(const row of (await env.DB.prepare(`SELECT id,${column} AS value${table==='bw_audit'?',actor_id,action':''} FROM ${table}`).all<any>()).results){
   if(!row.value)continue
   const content=table==='bw_audit'&&row.actor_id===id?JSON.stringify(eraseReturnAudit(JSON.parse(row.value),row.action)):row.value
   const value=originals.reduce((v,original)=>v.replaceAll(original,original.includes('@')?email:'Former company user'),content)
   if(value!==row.value)put(`UPDATE ${table} SET ${column}=? WHERE id=?`,value,row.id)
  }
  put('UPDATE bw_quote_entries SET author_email=?,body=replace(body,?,?) WHERE author_id=?',email,p.email,email,id)
 }
 if(kind==='unused-account') {
  statements.push(...campaignErasureStatements('account_id',accountId))
  statements.push(...deltaErasure(accountId),cutoverErasure(accountId))
  // Retire the source originals and provenance as well as the native account.
  const {retireAccountImportCustody}=await import('./imports/erasure')
  put('DELETE FROM bw_agent_tokens WHERE id IN (SELECT token_id FROM bw_agent_proposal_grants WHERE account_id=?)',accountId)
  for(const table of ['bw_agent_proposals','bw_agent_proposal_attempts','bw_agent_proposal_grants','bw_retention_requests','bw_company_invites','bw_company_delegations','bw_approval_notices','bw_visits','bw_company_route_versions','bw_company_routes','bw_profile_approvals','bw_buying_profiles','bw_company_members','bw_company_legacy_accounts','bw_lists','bw_locations','bw_terms_assignments','bw_followups'])put(`DELETE FROM ${table} WHERE account_id=?`,accountId)
  const {applicationAccountErasure}=await import('./application-erasure-statements'),{quoteMailErasureStatements}=await import('./quote-mail-custody')
  statements.push(...applicationAccountErasure(accountId),...quoteMailErasureStatements(accountId));put('DELETE FROM bw_accounts WHERE id=?',accountId)
  statements.push(...replayReceipt(operation),journalRow(operation,fingerprint))
  const portability=await createPortability({db:env.DB,policy:portabilityPolicy}),checkpoint=[...await portability.invalidateTransfersStatements(),...await portability.redactionStatements()].map(toD1Sql)
  const actor=await env.DB.prepare("SELECT id,role FROM oa_operators WHERE role='owner' AND status='active' LIMIT 1").first<any>();if(!actor)throw new Error('ERASURE_RESTORE_OWNER_REQUIRED')
  const email=p.email??(await env.DB.prepare("SELECT json_extract(value_json,'$.email') AS email FROM bw_accounts WHERE id=?").bind(accountId).first<any>())?.email??'erased@erased.invalid'
  await retireAccountImportCustody(env.DB,actor,{accountId,email,nativeStatements:statements,checkpoint});return
 }
 const portability=await createPortability({db:env.DB,policy:portabilityPolicy}),checkpoint=[...await portability.invalidateTransfersStatements(),...await portability.redactionStatements()].map(toD1Sql)
 statements.push(...checkpoint,...replayReceipt(operation),journalRow(operation,fingerprint))
 await env.DB.batch(statements.map(row=>env.DB.prepare(row.sql).bind(...(row.params??[]))))
}
function journalRow(operation:LegacyErasure,fingerprint:string) {return {sql:'INSERT INTO bw_account_erasure_journal VALUES(?,?,?,?)',params:[operation.id,operation.accountId,fingerprint,JSON.stringify({...operation.receipt,kind:operation.kind,accountId:operation.accountId,actorId:operation.actorId,reason:operation.reason,at:operation.at})]}}

function replayReceipt(operation:LegacyErasure) {
 return [{sql:'INSERT OR IGNORE INTO bw_erasure_receipts VALUES(?,?,?,?,?,?,?)',params:[operation.id,operation.payload.orderId??operation.payload.id??operation.receipt.memberId??operation.accountId,operation.accountId,operation.kind==='po-document'?operation.payload.sha256:operation.kind,operation.actorId,operation.at,operation.reason]},
 {sql:'INSERT OR IGNORE INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json) VALUES(?,?,?,?,?,?)',params:[operation.id,operation.accountId,'system:erasure-journal','retention.erasure-reapplied',new Date().toISOString(),JSON.stringify({accountId:operation.accountId,revision:operation.id,source:'retention.journal-reapply',reason:'Re-applied the owner-authorized erasure receipt '+operation.id+' before serving restored data.'})]}]
}
