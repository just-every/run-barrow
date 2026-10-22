/** ct scope-review-56 §E: account erasure keeps the commercial account and
 * financial attribution. Only the current owner may review/authorize it. */
import type { Bindings } from '../auth.server'
import { digest } from './access'
import { fail, text, type Actor } from './model'
import { retireAccountImportCustody } from './imports/erasure'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { toD1Sql } from '@runeditrun/rer/modules/erasure/fence'
import { portabilityPolicy } from './portability-policy.mjs'
import { completeErasureIntent, writeErasureIntent, abandonErasureIntent, journalSource, historicalErasurePeople } from './erasure-journal'
import { commercialAuditEvent } from './audit-event'
export type Sql = {sql:string;params?:any[]}
type Exclusion={id:string;reason:string}
export type ErasureOperation={version:1;sourceIdentity:string;id:string;accountId:string;actorId:string;at:string;reason:string;mode:'erase'|'revoke';exclusions:Exclusion[];deleteOrderIds:string[];people:{id:string;email:string;name:string;subjects:string[]}[];accountEmail:string;receipt:any}
type Item={id:string;kind:string;action:string;reason:string;floorUntil:string|null}
const sql=(sql:string,...params:any[]):Sql=>({sql,params})
const tables=['bw_accounts','bw_orders','bw_order_documents','bw_quotes','bw_quote_entries','bw_quote_notices','bw_quote_mail','rer_mail_event_receipts','rer_mail_event_states','bw_locations','bw_lists','bw_followups','bw_audit','oa_operators','oa_external_identities','oa_auth_audit','bw_company_members','bw_company_invites','bw_retention_requests','bw_settings','bw_applications','bw_application_documents','bw_application_history','bw_confirmations','bw_order_commissions','bw_visits','bw_account_erasure_journal','rer_mail_development_outbox','oa_oidc_transactions']
function owner(actor:Actor){if(actor.agent||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may review account erasure.',403)}
export function financialFloor(order:any):string|null {
 if(['draft','superseded'].includes(order.status))return null
 const dates=[order.preparedAt,order.approvedAt,order.invoice?.issuedAt].filter(Boolean).map(value=>Date.parse(value))
 if(!dates.length||dates.some(value=>!Number.isFinite(value)))return '9999-12-31T23:59:59.999Z'
 const date=new Date(Math.max(...dates)),month=date.getUTCMonth();date.setUTCFullYear(date.getUTCFullYear()+7);if(date.getUTCMonth()!==month)date.setUTCDate(0)
 return date.toISOString()
}
async function snapshot(env:Bindings) {
 const rows:Record<string,any[]>={},guards:Sql[]=[]
 // Ordered, whole-table snapshots fence insertions as well as changed/deleted
 // rows. No concurrent message, new membership or financial event can escape.
 for(const table of tables) {
  const columns=(await env.DB.prepare(`PRAGMA table_info(${table})`).all<any>()).results.map(row=>row.name)
  const query=`SELECT json_group_array(json_array(${columns.join(',')})) AS value FROM (SELECT * FROM ${table} ORDER BY rowid)`
  const value=(await env.DB.prepare(query).first<{value:string}>())!.value
  rows[table]=JSON.parse(value).map((row:any[])=>Object.fromEntries(columns.map((key,index)=>[key,row[index]])))
  guards.push(sql(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${query.replace(' AS value','')})=? THEN 1 ELSE 0 END`,value))
 }
 return {rows,guards,reviewHash:await digest(JSON.stringify(rows))}
}
const placeholder=(id:string)=>`erased-${encodeURIComponent(id).replaceAll('%','-')}@erased.invalid`
async function facts(env:Bindings,accountId:string,restoringEmail?:string) {
 const state=await snapshot(env),r=state.rows,account=r.bw_accounts.find(row=>row.id===accountId)??(restoringEmail?{id:accountId,value_json:JSON.stringify({email:restoringEmail,name:'Erased account'}),revision:''}:undefined)
 if(!account)fail('NOT_FOUND','Trade account not found.',404)
 const value=JSON.parse(account.value_json),request=r.bw_retention_requests.find(row=>row.account_id===accountId),policy=r.bw_settings.find(row=>row.key==='retention')
 const ids=new Set(r.bw_company_members.filter(row=>row.account_id===accountId).map(row=>row.user_id))
 for(const row of r.oa_operators)if(row.role==='member'&&row.email===value.email)ids.add(row.id)
 const people=r.oa_operators.filter(row=>ids.has(row.id)&&row.role==='member').map(row=>({id:row.id,email:row.email,name:row.display_name,subjects:r.oa_external_identities.filter(link=>link.operator_id===row.id).map(link=>link.subject)}))
 for(const prior of await historicalErasurePeople(env,accountId)){const current=people.find(row=>row.id===prior.id&&row.email===prior.email&&row.name===prior.name);if(current)current.subjects=[...new Set([...current.subjects,...prior.subjects])];else people.push(prior)}
 const otherHold=r.bw_retention_requests.some(hold=>hold.held===1&&r.bw_company_members.some(member=>member.account_id===hold.account_id&&ids.has(member.user_id)))
 return {...state,account,value,request,policy,people,held:request?.held===1||otherHold}
}
function replaceText(value:string,people:ErasureOperation['people'],accountEmail:string) {
 let result=value
 for(const person of people)for(const original of [person.email,person.name,...person.subjects].filter(Boolean))result=result.replaceAll(original,original===person.name?'Erased buyer':placeholder(person.id))
 if(accountEmail)result=result.replaceAll(accountEmail,placeholder('account'))
 return result
}
function redactSnapshot(value:any,people:ErasureOperation['people'],email:string,key=''):any {
 if(/^(id|sku|reference|sha256|currency|unit|pierReference|customerName|name)$|Id$|By$|At$/.test(key))return value
 if(typeof value==='string')return replaceText(value,people,email)
 if(Array.isArray(value))return value.map(item=>redactSnapshot(item,people,email,key))
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['billTo','shipTo'].includes(key)).map(([key,item])=>[key,['instructions','note'].includes(key)?'[Erased personal details]':redactSnapshot(item,people,email,key)]))
 return value
}
async function plan(env:Bindings,op:ErasureOperation,state:Awaited<ReturnType<typeof facts>>,restoring=false) {
 const r=state.rows,accountId=op.accountId,at=op.at,items:Item[]=[],statements:Sql[]=[],excluded=new Map(op.exclusions.map(row=>[row.id,row.reason]))
 const people=[...op.people];for(const person of state.people)if(!people.some(p=>p.id===person.id))people.push(person)
 const userIds=people.map(person=>person.id),emails=[...new Set([op.accountEmail,state.value.email,...people.map(row=>row.email)].filter(email=>!email.endsWith('@erased.invalid')))]
 const marker=placeholder('account-'+accountId),pids=JSON.stringify(userIds)
 function add(kind:string,id:string,action:string,reason:string,operations:Sql[]=[],floorUntil:string|null=null) {
  const item={kind,id,action,reason,floorUntil};items.push(item)
  if(op.mode==='revoke'&&kind!=='access'){item.action='keep (access-only request)';item.reason='Access revocation does not redact held data';return}
  if(excluded.has(id)){item.action='keep by owner exclusion';item.reason=excluded.get(id)!;return}
  statements.push(...operations)
 }
 for(const row of r.rer_mail_development_outbox.filter(row=>emails.some(email=>row.message.includes(email)))) {
  const access=/\/auth\/(?:confirm|owner-signin)/.test(row.message)
  add(access?'access':'mail event payloads','outbox:'+row.id,'remove',access?'Remove local sign-in/invitation links; no secret is copied into the journal':'Local development mail is erased; external mailboxes remain separate custody',[sql('DELETE FROM rer_mail_development_outbox WHERE id=?',row.id)])
 }
 for(const row of r.oa_oidc_transactions.filter(row=>emails.some(email=>row.payload.includes(email))||people.some(person=>person.subjects.some(subject=>row.payload.includes(subject)))))add('access','oidc:'+row.state_hash,'revoke and remove','Pending sign-in transactions holding the exact erased identity are credentials',[sql('DELETE FROM oa_oidc_transactions WHERE state_hash=?',row.state_hash)])
 for(const person of people) {
  const uid=person.id
  add('access','access:'+uid,'revoke and remove','Access revocation is allowed even under a hold',[
   sql("DELETE FROM oa_dev_credentials WHERE (credential='oa_sessions' AND id IN (SELECT id FROM oa_sessions WHERE operator_id=?)) OR (credential='oa_tokens' AND id IN (SELECT id FROM oa_tokens WHERE operator_id=?)) OR (credential='oa_credentials' AND id IN (SELECT id FROM oa_credentials WHERE operator_id=?))",uid,uid,uid),
   ...['oa_provider_session_pins','oa_provider_sessions'].map(table=>sql(`DELETE FROM ${table} WHERE session_id IN (SELECT id FROM oa_sessions WHERE operator_id=?)`,uid)),
   ...['oa_sessions','oa_tokens','oa_credentials','oa_step_up_challenges','oa_external_identities','oa_owner_signins'].map(table=>sql(`DELETE FROM ${table} WHERE operator_id=?`,uid)),
   sql('DELETE FROM bw_agent_tokens WHERE actor_id=?',uid),
   sql("UPDATE oa_operators SET status='inactive' WHERE id=? AND role='member'",uid),
   sql("UPDATE bw_company_members SET state='removed',revision=?,updated_at=? WHERE user_id=?",op.id,at,uid),
   sql('DELETE FROM bw_usage_acceptances WHERE user_id=?',uid),
   sql('DELETE FROM bw_company_invites WHERE member_id IN (SELECT id FROM bw_company_members WHERE user_id=?) OR email_key=?',uid,person.email),
   sql("UPDATE bw_company_delegations SET state='ended' WHERE delegator_id=? OR delegate_id=?",uid,uid),
  ])
  add('identity','identity:'+uid,'deidentify','Keep the opaque operator ID; no routable address or sign-in remains',[
   sql("UPDATE oa_operators SET email=?,display_name='Erased buyer' WHERE id=? AND role='member'",placeholder(uid),uid),
   sql("UPDATE bw_company_members SET email=?,email_key=?,display_name='Erased buyer',erased_at=? WHERE user_id=?",placeholder(uid),placeholder(uid),at,uid),
  ])
 }
 add('identity','account:'+accountId,'close and deidentify email','Keep the company, terms, prices, Pier customer ID and account ID',[
  sql("UPDATE bw_accounts SET value_json=json_set(value_json,'$.email',?,'$.lifecycle','closed'),revision=? WHERE id=?",marker,op.id,accountId),
  sql('INSERT OR IGNORE INTO bw_company_legacy_accounts(account_id) SELECT id FROM bw_accounts WHERE id=?',accountId),
  sql('DELETE FROM bw_company_invites WHERE account_id=?',accountId),
 ])
 for(const [table,kind] of [['bw_locations','contacts and addresses'],['bw_lists','saved lists'],['bw_followups','follow-up tasks'],['bw_visits','contact visit records']] as const)
  for(const row of r[table].filter(row=>row.account_id===accountId))add(kind,({bw_locations:'location',bw_lists:'list',bw_followups:'followup',bw_visits:'visit'} as Record<string,string>)[table]+':'+row.id,'remove','Live and archived account contact data are outside the financial floor',[sql(`DELETE FROM ${table} WHERE id=?`,row.id)])
 const orders=r.bw_orders.filter(row=>row.account_id===accountId).map(row=>({...row,value:JSON.parse(row.value_json)})),orderFloors=new Map(orders.map(row=>[row.id,financialFloor(row.value)]))
 const retainedOrder=(id:string)=>{const floor=orderFloors.get(id);return Boolean(floor&&at<floor)}
 const converted=new Map(r.bw_quotes.filter(row=>row.account_id===accountId).map(row=>{const value=JSON.parse(row.value_json);return [row.id,value.accepted?.orderId] as [string,string|undefined]}))
 for(const row of r.bw_quote_entries.filter(row=>row.account_id===accountId)) {
  const person=people.find(person=>person.id===row.author_id)
  add('messages','message:'+row.id,'replace text','Entry, quote, kind, side, author ID, time and revision stay',[
   sql('UPDATE bw_quote_entries SET body=?,author_email=? WHERE id=?','[Erased message]',person?placeholder(person.id):row.author_email,row.id)
  ])
  if(row.attachment_sha256) {
   const oid=converted.get(row.quote_id),floor=oid?orderFloors.get(oid)??null:null,keep=Boolean(floor&&at<floor)
   add('attachments','attachment:'+row.id,keep?'keep under financial floor':'remove bytes and name',keep?'Attachment on a quote converted to a submitted order':'Keep only type, size and SHA-256',keep?[]:[sql('UPDATE bw_quote_entries SET attachment_name=NULL,attachment_base64=NULL WHERE id=?',row.id)],floor)
  }
 }
 for(const row of r.bw_order_commissions.filter(row=>orders.some(order=>order.id===row.order_id)))add('commissions and confirmations','commission:'+row.order_id,'keep financial attribution','Order commission values and opaque attribution remain; an explicitly deleted post-floor order records its totals',[],orderFloors.get(row.order_id)??null)
 for(const row of r.bw_confirmations.filter(row=>orders.some(order=>order.id===row.order_id)))add('commissions and confirmations','confirmation:'+row.order_id+':'+row.number,'keep within floor; redact personal details afterward','Confirmation numbers, amounts and opaque attribution stay with the order',[],orderFloors.get(row.order_id)??null)
 for(const row of orders) {
  const floor=orderFloors.get(row.id)??null,keep=retainedOrder(row.id),remove=op.deleteOrderIds.includes(row.id)
  if(remove&&keep)fail('RETENTION','A selected order is still inside its seven-year financial floor.')
  const value=redactSnapshot(row.value,people,op.accountEmail)
  add('commercial history','order:'+row.id,keep?'keep unchanged':remove?'delete order; retain reconcilable receipt':'redact personal snapshot details',keep?'Seven calendar years from the latest recorded financial event':'Default after the floor is personal redaction; deletion needs a separate explicit choice',keep?[]:remove?[
   ...['bw_order_documents','bw_terms_signatures','bw_order_commissions','bw_confirmations'].map(table=>sql(`DELETE FROM ${table} WHERE order_id=?`,row.id)),sql('DELETE FROM bw_orders WHERE id=?',row.id),
  ]:[sql('UPDATE bw_orders SET value_json=?,revision=? WHERE id=?',JSON.stringify(value),op.id,row.id),...r.bw_confirmations.filter(c=>c.order_id===row.id).map(c=>sql('UPDATE bw_confirmations SET value_json=? WHERE order_id=? AND number=?',JSON.stringify(redactSnapshot(JSON.parse(c.value_json),people,op.accountEmail)),row.id,c.number))],floor)
  if(row.value.document)add('PO files','po:'+row.id,keep?'keep under financial floor':'remove bytes and name',keep?'Submitted-order evidence stays until the latest financial-event floor':'Keep only document type, size and SHA-256 in the snapshot',keep?[]:[sql('DELETE FROM bw_order_documents WHERE order_id=?',row.id),sql("UPDATE bw_orders SET value_json=json_remove(value_json,'$.document.name') WHERE id=?",row.id)],floor)
 }
 for(const row of r.bw_quotes.filter(row=>row.account_id===accountId)) {
  const oid=converted.get(row.id),floor=oid?orderFloors.get(oid)??null:null,keep=Boolean(floor&&at<floor)
  add('quotes and acceptance','quote:'+row.id,keep?'keep unchanged':'redact personal snapshot details',keep?'Quote revisions and acceptance linked to a retained order':'Keep quote IDs, revisions, numbers and money',keep?[]:[sql('UPDATE bw_quotes SET value_json=?,revision=? WHERE id=?',JSON.stringify(redactSnapshot(JSON.parse(row.value_json),people,op.accountEmail)),op.id,row.id)],floor)
 }
 for(const row of r.bw_applications.filter(row=>row.account_id===accountId)) {
  add('application records','application:'+row.id,'deidentify personal fields','Commercial application documents follow their submitted-order floor',[sql('UPDATE bw_applications SET value_json=?,revision=? WHERE id=?',JSON.stringify(redactSnapshot(JSON.parse(row.value_json),people,op.accountEmail)),op.id,row.id),...['bw_application_codes','bw_application_sessions'].map(table=>sql(`DELETE FROM ${table} WHERE application_id=?`,row.id))])
  const floor=[...orderFloors.values()].filter((floor):floor is string=>!!floor).sort().at(-1)??null,keep=Boolean(floor&&at<floor)
  for(const doc of r.bw_application_documents.filter(doc=>doc.application_id===row.id))add('application documents','application-document:'+doc.id,keep?'keep under financial floor':'remove',keep?'Approved certificates remain submitted-order evidence':'Outside the financial floor',keep?[]:[sql('DELETE FROM bw_application_documents WHERE id=?',doc.id)],floor)
 }
 // Provider event bodies/states are discarded before neutralizing the ledger.
 for(const row of r.bw_quote_mail.filter(row=>row.account_id===accountId))add('mail ledger','mail:'+row.id,'remove personal fields; preserve custody IDs','Keep delivery ID, status, times and provider message ID',[
  sql("DELETE FROM rer_mail_event_receipts WHERE event_namespace='quotes' AND json_extract(event_json,'$.providerMessageId')=?",row.provider_message_id),
  sql("DELETE FROM rer_mail_event_states WHERE event_namespace='quotes' AND provider_message_id=?",row.provider_message_id),
  sql("UPDATE bw_quote_mail SET recipient=NULL,summary='[Erased notice]',submission_json=NULL,sender_result_json=NULL,reason='Personal fields erased by owner',restored=1,lease_until=0 WHERE id=?",row.id),
 ])
 for(const row of r.bw_quote_notices.filter(row=>row.account_id===accountId))add('notice summaries','notice:'+row.id,'neutralize','No personal details or restored outreach',[sql("UPDATE bw_quote_notices SET summary='[Erased notice]',mail_eligible=0 WHERE id=?",row.id)])
 for(const row of r.bw_audit) {
  if(!row.context_json)continue
  const context=JSON.parse(row.context_json),reason=typeof context.reason==='string'?replaceText(context.reason,people,op.accountEmail):context.reason
  if(reason!==context.reason)add('commercial audit','audit:'+row.id,'replace exact personal values in free text','Preserve ID, subject, actor, action, time and revision',[sql("UPDATE bw_audit SET context_json=json_set(context_json,'$.reason',?) WHERE id=?",reason,row.id)])
 }
 for(const row of r.oa_auth_audit) {
  const value=replaceText(row.value,people,op.accountEmail)
  if(value!==row.value)add('sign-in audit','auth-audit:'+row.id,'replace exact identity values','Keep every audit row and opaque attribution',[sql('UPDATE oa_auth_audit SET value=? WHERE id=?',value,row.id)])
 }
 // Pending invites may exist without a Native operator yet.
 add('access','account-invites:'+accountId,'revoke and remove','No pending account invitation survives',[sql('DELETE FROM bw_company_invites WHERE account_id=?',accountId)])
 // Commercial approval routing cannot retain operational authority for a closed account.
 if(op.mode==='erase')statements.push(sql('DELETE FROM bw_approval_notices WHERE account_id=?',accountId),sql("UPDATE bw_accounts SET value_json=json_set(value_json,'$.lifecycle','closed') WHERE id=?",accountId))
 statements.push(sql("UPDATE bw_company_delegations SET state='ended' WHERE account_id=?",accountId))
 for(const exclusion of op.exclusions){if(!restoring&&!items.some(item=>item.id===exclusion.id))fail('EXCLUSION','An excluded item is no longer in the current review.');if(items.some(item=>item.id===exclusion.id&&item.kind==='access'))fail('EXCLUSION','Access revocation cannot be excluded.')}
 for(const id of op.deleteOrderIds)if(!restoring&&!orders.some(row=>row.id===id))fail('INPUT','Choose a reviewed order for explicit deletion.',400)
 const classes=['access','identity','contacts and addresses','saved lists','follow-up tasks','contact visit records','messages','attachments','notice summaries','mail event payloads','mail ledger','commercial audit','sign-in audit','commercial history','quotes and acceptance','PO files','application records','application documents','import originals','exports','archives','platform backups','external copies','replay records','commissions and confirmations','product media']
 const custody={identity:'Local buyer sign-in identity is deidentified; the buyer sign-in provider has separate custody.',inventory:'Pier retains customer records and order commands; Barrow sends no deletion.',accounting:'Accounting and payment systems once connected retain their own copies; no deletion is claimed.',mail:'Provider message IDs remain in the custody ledger. Delivered mail and mailboxes cannot be recalled.',exports:'In-progress transfers are invalidated; later exports use placeholders. Already-downloaded files remain with their holders.',archives:'The independent later journal is required for restore; erased data is re-applied before serving. Incomplete journals refuse service. Restored mail never re-sends.',backups:'D1 Time Travel is always on: 30 days paid or 7 days free, destructive restore, no early purge. Keep the private R2 journal outside D1 and re-apply it before serving.',journal:'The private R2 replay journal retains only the identifiers and instructions needed to prevent resurrection; never delete it while an older copy can be restored. No legal adequacy is asserted.'}
 return {statements,items,classes:classes.map(kind=>({kind,count:items.filter(item=>item.kind===kind).length,action:kind==='product media'?'No product media is stored in this installation':kind==='import originals'?'retire matching import custody':kind==='exports'?'invalidate in-progress transfers':kind==='replay records'?'keep invitation-cancellation and logout replay rows':kind==='commissions and confirmations'?'preserve unchanged within floor':kind==='platform backups'?'disclose window; replay outside-D1 journal':kind==='external copies'?'disclose; no provider erasure':kind==='archives'?'replay journal or refuse restore':([...new Set(items.filter(item=>item.kind===kind).map(item=>item.action))].join('; ')||'no current records')})),custody,marker:excluded.has('account:'+accountId)?state.value.email:marker,emails,people,orders}
}
export async function previewAccountErasure(env:Bindings,actor:Actor,p:any) {
 owner(actor);const state=await facts(env,text(p.accountId,'Account ID'))
 const op:ErasureOperation={version:1,sourceIdentity:await journalSource(env),id:'preview',accountId:state.account.id,actorId:actor.id,at:new Date().toISOString(),reason:'Preview only',mode:'erase',exclusions:[],deleteOrderIds:[],people:state.people,accountEmail:state.value.email,receipt:null}
 const result=await plan(env,op,state)
 return {accountId:state.account.id,accountRevision:state.account.revision,requestRevision:state.request?.revision??null,policyRevision:state.policy?.revision??null,reviewHash:await digest(JSON.stringify([state.reviewHash,result.items])),held:state.held,request:state.request??null,items:result.items,classes:result.classes,custody:result.custody,platformBackupWindows:{paidUntil:new Date(Date.now()+30*86400000).toISOString(),freeUntil:new Date(Date.now()+7*86400000).toISOString()},outsideJournal:!!env.ERASURE_JOURNAL}
}
export async function applyAccountErasure(env:Bindings,operation:ErasureOperation,fingerprint:string,actor?:Actor,state?:Awaited<ReturnType<typeof facts>>) {
 state??=await facts(env,operation.accountId,operation.accountEmail)
 const result=await plan(env,operation,state,!actor)
 const native=[...(actor?[...state.guards]:[]),...result.statements,
  sql('INSERT INTO bw_account_erasure_journal VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING',operation.id,operation.accountId,fingerprint,JSON.stringify(operation.receipt)),
  sql('INSERT INTO bw_erasure_receipts VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',operation.id,operation.accountId,operation.accountId,'account',operation.actorId,operation.at,operation.reason),
  commercialAuditEvent(actor?operation.actorId:'system:erasure-journal',operation.accountId,!actor?'retention.erasure-reapplied':operation.mode==='revoke'?'retention.access-revoked':'retention.account-erased',{accountId:operation.accountId,revision:operation.id,source:actor?'retention.account-erasure':'retention.journal-reapply',reason:actor?operation.reason:'Re-applied the owner-authorized erasure receipt '+operation.id+' before serving restored data.'}),sql('DELETE FROM bw_guard')]
 if(actor) {
  // The kit batches native SQL and custody retirement atomically. Its owner
  // predicate is supplemented with the exact signed-in session admission.
  native.unshift(sql("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND o.version=? AND o.status='active' AND o.role='owner' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?) THEN 1 ELSE 0 END",actor.sessionId,actor.id,actor.version,Date.now()))
 }
 const portability=await createPortability({db:env.DB,policy:portabilityPolicy}),checkpoint=[...await portability.invalidateTransfersStatements(),...await portability.redactionStatements()].map(toD1Sql)
 const currentOwner=actor??await env.DB.prepare("SELECT id,'owner' AS role FROM oa_operators WHERE role='owner' AND status='active' ORDER BY id LIMIT 1").first<any>()
 if(!currentOwner)throw new Error('ERASURE_RESTORE_OWNER_REQUIRED')
 if(operation.mode==='revoke')await env.DB.batch([...native,...checkpoint].map(row=>env.DB.prepare(row.sql).bind(...(row.params??[]))))
 else await retireAccountImportCustody(env.DB,currentOwner,{accountId:operation.accountId,email:operation.accountEmail,emails:result.emails,retainedEmail:result.marker,nativeStatements:native,checkpoint})
}
export async function executeAccountErasure(env:Bindings,actor:Actor,p:any,mode:'erase'|'revoke') {
 owner(actor)
 if(p.confirm!=='ERASE')fail('CONFIRM','Type ERASE to authorize this reviewed action.',400)
 const reason=text(p.reason,'Erasure reason',1000),state=await facts(env,text(p.accountId,'Account ID'))
 if(!state.request)fail('REQUEST','Record and verify a current erasure request before execution.')
 if(state.value.email.endsWith('@erased.invalid')&&mode==='erase')fail('ERASED','This account is already erased.')
 if(p.accountRevision!==state.account.revision||p.requestRevision!==state.request.revision||p.policyRevision!==(state.policy?.revision??null))fail('CHANGED','Refresh the preview, request, account and retention policy before execution.')
 if(mode==='erase'&&state.held)fail('LEGAL_HOLD','A legal hold blocks redaction. Access may still be revoked.')
 const exclusions=p.exclusions??[],deleteOrderIds=p.deleteOrderIds??[]
 if(!Array.isArray(exclusions)||exclusions.some(row=>!row||typeof row.id!=='string'||!text(row.reason,'Exclusion reason',1000))||new Set(exclusions.map(row=>row.id)).size!==exclusions.length)fail('INPUT','Supply unique reviewed exclusions with reasons.',400)
 if(!Array.isArray(deleteOrderIds)||deleteOrderIds.some(id=>typeof id!=='string')||new Set(deleteOrderIds).size!==deleteOrderIds.length)fail('INPUT','Supply unique reviewed order IDs for explicit deletion.',400)
 const operation:ErasureOperation={version:1,sourceIdentity:await journalSource(env),id:crypto.randomUUID(),accountId:state.account.id,actorId:actor.id,at:new Date().toISOString(),reason,mode,exclusions,deleteOrderIds,people:state.people,accountEmail:state.value.email,receipt:null}
 const reviewPlan=await plan(env,{...operation,mode:'erase',exclusions:[],deleteOrderIds:[]},state)
 if(p.reviewHash!==await digest(JSON.stringify([state.reviewHash,reviewPlan.items])))fail('CHANGED','Refresh the erasure preview; its data or financial-floor decisions changed.')
 const result=await plan(env,operation,state)
 operation.receipt={id:operation.id,accountId:operation.accountId,actorId:actor.id,at:operation.at,reason,mode,request:{requester:state.request.requester,channel:state.request.channel,verificationNote:state.request.verification_note,revision:state.request.revision},policyRevision:state.policy?.revision??null,classes:result.classes,items:result.items,exclusions,custody:result.custody,backupWindows:{paidUntil:new Date(Date.parse(operation.at)+30*86400000).toISOString(),freeUntil:new Date(Date.parse(operation.at)+7*86400000).toISOString()},deletedOrders:result.orders.filter(row=>deleteOrderIds.includes(row.id)).map(row=>({id:row.id,currency:row.value.currency??'AUD',totalCents:row.value.totalCents,invoiceNumber:row.value.invoice?.number??null})),commercialHistory:'Preserved unchanged within the seven-year floor; no provider erasure or legal adequacy claimed'}
 const fingerprint=await writeErasureIntent(env,operation)
 try {await applyAccountErasure(env,operation,fingerprint,actor,state)}
 catch(error) {
  // A known rolled-back batch may remove its intent. If the acknowledgement was
  // lost after commit, leave the intent for the request fence to finalize.
  const applied=await env.DB.prepare('SELECT 1 FROM bw_account_erasure_journal WHERE id=?').bind(operation.id).first()
  if(!applied)await abandonErasureIntent(env,operation)
  throw error
 }
 await completeErasureIntent(env,operation.id,fingerprint)
 return operation.receipt
}
