import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, changed, commit } from './access'
import { accountFollowupSources, type PlanSource } from './account-followup-sources'
import { companyPurchasingRecipientSql } from './company-members'
import { now } from './clock'
import { readStaffGrant, staffAccountAllowed, staffGuard } from './staff-policy'
import { calendarDate, reportZone } from './report-zone'
import { fail, requirePerson, requireSupplier, text, type Actor } from './model'
import type { FollowupTask } from './followups'

export type FollowupPlan = {
 model: string; runId: string; generatedAt: string; sourceFingerprint: string; sources: PlanSource[]
 recipients: {id:string;email:string}[]; tools: string[]; costCents: number; contactLimit: number; restored?: boolean
 actions: {id:string;kind:'delivery'|'quote';quoteId:string;body:string;recipientId:string;sendOn:string;status:'proposed'|'approved'|'suppressed'|'sent';reason?:string;approvedBy?:string;approvedAt?:string;sentAt?:string;entryId?:string}[]
 history: {at:string;by:string;actionId:string;decision:string;reason:string;revision:string}[]
 previousRuns?: {runId:string;generatedAt:string;actions:FollowupPlan['actions'];history:FollowupPlan['history'];resolution?:string;ownerId:string}[]
}
const read = async (db:D1Database,id:string) => {
 const row=await db.prepare('SELECT value_json,revision FROM bw_followups WHERE id=?').bind(id).first<{value_json:string;revision:string}>()
 return row?{...JSON.parse(row.value_json),revision:row.revision} as FollowupTask:undefined
}
function day(value:unknown) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('INPUT','Use a valid YYYY-MM-DD send date.',400)
 return value
}
const guard=(db:D1Database,sql:string,args:(string|number)[])=>db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN ${sql} THEN 1 ELSE 0 END`).bind(...args)
export async function accountFollowupCommand(env:Bindings,actor:Actor,type:string,p:any) {
 requirePerson(actor);requireSupplier(actor)
 if(actor.staff&&!['rep','sales-manager'].includes(actor.staff.role))fail('FORBIDDEN','A current selling role is required.',403)
 const at=(await now()).toISOString()
 if(type==='followup.plan') {
  const accountId=text(p.accountId,'Account',100), source=await accountFollowupSources(env,actor,accountId), id=`plan:${accountId}`, before=await read(env.DB,id)
  if(before?.status==='open')fail('OPEN_PLAN','Resolve the existing account plan before preparing another.')
  const quote=source.quotes.find(quote=>!['accepted','expired','declined','withdrawn'].includes(quote.status))
  if(!quote)fail('QUOTE_REQUIRED','An open quote conversation is required for a grounded follow-up.')
  const recipientId=source.recipients[0]?.id??'', actions:FollowupPlan['actions']=[]
  if(source.delayed.length||source.unknown)actions.push({id:'delivery',kind:'delivery',quoteId:quote.id,recipientId,sendOn:source.today,status:'proposed',body:source.delayed.length?`Before discussing more stock, I am following up on ${source.delayed.map(line=>`${line.reference || line.orderId}: ${line.outstanding} ${line.unit} of ${line.sku} outstanding after ${line.promisedDate}`).join('; ')}. Carrier delivery is not confirmed. Please reply with any delivery information so we can agree the next action.`:'Before discussing more stock, I need to confirm the outstanding fulfillment status. Please reply with any delivery information.'})
  actions.push({id:'quote',kind:'quote',quoteId:quote.id,recipientId,sendOn:source.today,status:'proposed',body:actions.length?`I have kept quote ${quote.id} open. We will address the delivery issue before proposing additional stock. Please reply with your preferred next step.`:`I am following up on your unanswered quote ${quote.id}. Please reply with your preferred next step; no additional stock has been ordered.`})
  const revision=crypto.randomUUID(), plan:FollowupPlan={model:'native-grounded-v1',runId:crypto.randomUUID(),generatedAt:at,sourceFingerprint:source.fingerprint,sources:source.sources,recipients:source.recipients.map(({id,email})=>({id,email})),tools:['account.read','quote.read','order.read','visit.read','followup.read','fulfillment.read'],costCents:0,contactLimit:actions.length,actions,history:[],previousRuns:before?.plan?[...(before.plan.previousRuns??[]),{runId:before.plan.runId,generatedAt:before.plan.generatedAt,actions:before.plan.actions,history:before.plan.history,resolution:before.resolution,ownerId:before.ownerId}]:[]}
  const value={id,kind:'account-plan' as const,accountId,sourceId:quote.id,sourcePath:`/api/barrow/quotes/${quote.id}`,title:`Account follow-up: ${source.selected.value.name}`,reason:actions[0].kind==='delivery'?'Resolve the delayed or unconfirmed delivery before discussing stock.':'Review the unanswered quote and account history.',priority:actions[0].kind==='delivery'?0:2,createdAt:at,ownerId:actor.id,nextContactDate:source.today,status:'open' as const,contacts:[],plan}
  await commit(env.DB,actor,[guard(env.DB,'EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?)',[accountId,source.selected.revision]),before?env.DB.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,id,before.revision):env.DB.prepare('INSERT INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id,accountId,JSON.stringify(value),revision),changed(env.DB),audit(env.DB,actor,id,'followup.plan-prepared',{accountId,revision,source:type,reason:'Native read-only account planner; no paid inference, no outreach. Human review and explicit send required.'})])
  return {...value,revision}
 }
 const id=text(p.id,'Plan task',240),before=await read(env.DB,id)
 if(!before?.plan)fail('NOT_FOUND','Account plan not found.',404)
 await account(env.DB,actor,before.accountId)
 const action=before.plan.actions.find(action=>action.id===p.actionId)
 if(!action)fail('INPUT','Choose a recorded plan action.',400)
 if(type==='followup.send'&&action.status==='sent')return before
 if(before.revision!==p.revision)fail('REVISION','The account plan changed. Review its current revision.')
 if(before.status!=='open'||before.plan.restored)fail('INACTIVE','Resolve the restored or closed plan and prepare a fresh plan before outreach.')
 const {revision:previous,...value}=before, revision=crypto.randomUUID(), statements:D1PreparedStatement[]=[]
 let decision:string, reason:string
 if(type==='followup.decide') {
  if(!['approve','suppress'].includes(p.decision))fail('INPUT','Approve or suppress the action.',400)
  if(action.status!=='proposed'&&!(p.decision==='suppress'&&action.status==='approved'))fail('DECIDED','This exact action already has a human decision.')
  reason=text(p.reason,'Review reason',1000);decision=p.decision
  if(decision==='approve') {
   if(p.consent!==true)fail('CONSENT','Explicitly approve this recipient, message and timing.',400)
   const recipientId=text(p.recipientId,'Recipient',160)
   if(!before.plan.recipients.some(recipient=>recipient.id===recipientId))fail('RECIPIENT','Choose a recipient from this plan.',400)
   action.recipientId=recipientId;action.body=text(p.body,'Reviewed message',2000);action.sendOn=day(p.sendOn)
   action.approvedBy=actor.id;action.approvedAt=at;action.status='approved'
  } else action.status='suppressed'
  action.reason=reason
 } else if(type==='followup.send') {
  if(action.status!=='approved')fail('APPROVAL','Review this exact message before sending.')
  const approver=await env.DB.prepare("SELECT id,email,role,version,status FROM oa_operators WHERE id=? AND status='active'").bind(action.approvedBy!).first<any>()
  if(!approver)fail('APPROVAL_REVOKED','The approving person is no longer active.')
  if(!['owner','admin'].includes(approver.role)) {const grant=await readStaffGrant(env.DB,{...approver,agent:false});if(!grant||!['rep','sales-manager'].includes(grant.role)||!staffAccountAllowed(grant,before.accountId))fail('APPROVAL_REVOKED','The approving person no longer holds this account.');statements.push(staffGuard(env.DB,grant))}
  statements.push(guard(env.DB,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active')",[approver.id,approver.version]))
  const source=await accountFollowupSources(env,actor,before.accountId)
  if(source.fingerprint!==before.plan.sourceFingerprint)fail('STALE_PLAN','Account sources or authority changed. Resolve this plan and review a fresh one.')
  if(action.sendOn>source.today)fail('NOT_DUE','The reviewed send date has not arrived.')
  const recipient=source.recipients.find(person=>person.id===action.recipientId)
  if(!recipient)fail('RECIPIENT','The approved recipient no longer has purchasing access.')
  const quote=source.quotes.find(quote=>quote.id===action.quoteId)
  if(!quote)fail('STALE_PLAN','The source quote is no longer recorded.')
  if(action.kind==='quote'&&before.plan.actions.some(candidate=>candidate.kind==='delivery'&&candidate.status!=='sent'))fail('SERVICE_FIRST','Address delivery before sending the quote follow-up.')
  const entryId=`${before.plan.runId}:${action.id}`,noticeId=`followup:${entryId}`
  statements.push(guard(env.DB,'EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?)',[before.accountId,source.selected.revision]),guard(env.DB,`EXISTS(SELECT 1 FROM oa_operators p JOIN bw_accounts a ON a.id=? WHERE p.id=? AND p.version=? AND p.status='active' AND ${companyPurchasingRecipientSql('p','a.id')})`,[before.accountId,recipient.id,recipient.version]))
  for(const count of source.counts)statements.push(guard(env.DB,`(SELECT COUNT(*) FROM ${count.table} WHERE account_id=?${count.table==='bw_followups'?" AND id NOT LIKE 'plan:%'":''})=?`,[before.accountId,count.count]))
  for(const fence of source.fences)statements.push(guard(env.DB,`EXISTS(SELECT 1 FROM ${fence.table} WHERE id=? AND revision=?)`,[fence.id,fence.revision]))
  statements.push(env.DB.prepare("INSERT INTO bw_quote_entries(id,quote_id,account_id,kind,side,author_id,author_email,body,quote_revision,created_at) VALUES(?,?,?,'message','supplier',?,?,?,?,?)").bind(entryId,action.quoteId,before.accountId,actor.id,actor.email,action.body,quote.revisions.at(-1)?.number??0,at),env.DB.prepare("INSERT INTO bw_quote_notices(id,quote_id,account_id,audience,kind,summary,actor_id,created_at,mail_eligible) VALUES(?,?,?,'buyer','message',?,?,?,0)").bind(noticeId,action.quoteId,before.accountId,action.body,actor.id,at),env.DB.prepare("INSERT INTO bw_quote_mail(id,notice_id,quote_id,account_id,audience,recipient_id,recipient,summary,kind,actor_id,created_at,updated_at) VALUES(?,?,?,?,'buyer',?,?,?,'notice',?,?,?)").bind(noticeId,noticeId,action.quoteId,before.accountId,recipient.id,recipient.email,action.body,actor.id,at,at))
  action.status='sent';action.sentAt=at;action.entryId=entryId;decision='sent';reason='Exact human-approved message posted once; email delivery remains recorded separately. Work stays assigned.'
 } else fail('COMMAND','Unknown account follow-up command.',400)
 value.plan!.history.push({at,by:actor.id,actionId:action.id,decision,reason,revision})
 statements.unshift(env.DB.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,id,previous),changed(env.DB))
 statements.push(audit(env.DB,actor,id,`followup.plan-${decision}`,{accountId:before.accountId,revision,source:type,reason}))
 await commit(env.DB,actor,statements)
 return {...value,revision}
}

export async function planResponseResolution(db:D1Database,task:FollowupTask) {
 const sent=task.plan?.actions.filter(action=>action.sentAt)
 if(!sent?.length)return undefined
 for(const action of sent)if(await db.prepare("SELECT 1 FROM bw_quote_entries WHERE quote_id=? AND side='buyer' AND kind='message' AND rowid>(SELECT rowid FROM bw_quote_entries WHERE id=?)").bind(action.quoteId,action.entryId!).first())return 'Buyer replied after the approved account follow-up; the conversation remains the source of the next rep action.'
 return undefined
}
