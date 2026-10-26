import { applicationAccess } from './application-access'
import type { Bindings } from '../auth.server'
import { audit, commit } from './access'
import { fail, type Actor } from './model'
import { staffAccountAllowed, type StaffGrant } from './staff-policy'

const selling = ['sales-manager','rep']
const operating = ['sales-manager','operations']
export function staffScope(actor:Actor,column:string) {
 if(!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(column))throw new Error('Invalid scope column')
 return !actor.staff||actor.staff.accounts==='all'?{sql:'',values:[] as string[]}:{sql:` AND ${column} IN (SELECT value FROM json_each(?))`,values:[JSON.stringify(actor.staff.accounts)]}
}
export const staffSells=(actor:Actor)=>Boolean(actor.staff&&selling.includes(actor.staff.role))
export const staffFinances=(actor:Actor)=>Boolean(actor.staff&&actor.staff.role==='finance')
export function staffTaskAllowed(actor:Actor,task:{accountId:string;kind:string}) {
 const grant=actor.staff
 if(!grant)return true
 if(task.kind==='application')return applicationAccess(actor)==='review'
 if(!staffAccountAllowed(grant,task.accountId))return false
 return selling.includes(grant.role)||grant.role==='operations'&&['fulfillment','delivery','return','approval'].includes(task.kind)||grant.role==='finance'&&['payment','card-payment','reconciliation','credit','refund'].includes(task.kind)
}
async function denied(env:Bindings,actor:Actor,source:string):Promise<never> {
 await commit(env.DB,actor,[audit(env.DB,actor,actor.id,'staff.permission-refused',{revision:actor.staff!.revision,source,reason:'Current owner-granted functional role does not authorize this door; no commercial action or outreach performed.'})])
 fail('FORBIDDEN','Your current supplier role does not authorize this action.',403)
}
/** Unknown doors stay denied. A new product door must declare its staff authority. */
export async function staffRequestGate(env:Bindings,actor:Actor,path:string,method:string) {
 if(!actor.staff)return
 const relative=path.slice('/api/barrow/'.length),role=actor.staff.role
 if(relative==='commands')return
 if (relative === 'applications' || relative.startsWith('applications/')) {
  if (method === 'GET' && applicationAccess(actor) && (relative === 'applications' || /^applications\/[^/]+\/documents\/[^/]+$/.test(relative))) return
  return denied(env, actor, path)
 }
 if (relative === 'export/applications.csv' || relative === 'export/applicationdocuments.csv') {
  const access = applicationAccess(actor)
  if (method === 'GET' && (access === 'review' || access === 'documents' && relative === 'export/applicationdocuments.csv')) return
  return denied(env, actor, path)
 }
 if(method==='GET'&&['state','company/invitations','usage-terms','report-schedules','audit','audit.csv'].includes(relative))return
 if(method==='GET'&&/^report-runs\/[A-Za-z0-9_-]+\.json$/.test(relative))return
 if(method==='GET'&&/^reports\/(sales|finance|quotes|fulfillment|commissions|rep-performance)(\.csv)?$/.test(relative))return // report computes whole-filter entitlement before reading
 if(method==='GET'&&relative==='commissions'&&role==='sales-manager'&&actor.staff.accounts==='all')return
 if(method==='GET'&&relative==='price-book.csv'&&role==='sales-manager')return
 if(method==='GET'&&/^orders\/[-a-zA-Z0-9_]+\/agent-proposals$/.test(relative)&&role==='sales-manager')return
 if(role==='analyst')return denied(env,actor,path)
 if(method==='GET'&&(['accounts','orders/history','orders/search','followups'].includes(relative)||/^accounts\/by-id\/[^/]+$/.test(relative)))return
 if(method==='GET'&&/^orders\/[-A-Za-z0-9_]+(?:\/(timeline|document|terms-signature|confirmations(?:\/[1-9]\d*\.(csv|pdf))?))?$/.test(relative))return
 if(method==='POST'&&['confirmations/selection','confirmations/export.csv'].includes(relative))return
 if(method==='GET'&&/^payments(?:\/[-a-zA-Z0-9_]+)?$/.test(relative)&&(role==='finance'||selling.includes(role)))return
 if(method==='GET'&&/^(?:credits|refunds)(?:\/[-a-zA-Z0-9_]+)?$/.test(relative)&&role==='finance')return
 if(method==='GET'&&relative==='saved-cards'&&role==='finance')return
 if(method==='GET'&&relative==='locations')return
 if(method==='GET'&&relative==='visits'&&(selling.includes(role)||role==='operations'))return // REP-005: scoped per account by the read itself
 if(method==='GET'&&relative==='sales-terms')return
 if(selling.includes(role)&&method==='GET'&&/^statements\/[-a-zA-Z0-9._:]+?(?:\.(csv|pdf))?$/.test(relative))return // REP-001: balances of accounts held today; account() scopes the read
 if(method==='GET'&&/^sales-terms\/[^/]+\/[1-9]\d*\/document$/.test(relative))return
 if(method==='GET'&&(/^(invoices|statements)\//.test(relative)||/^export(?:\.json|\/[^/]+\.csv)$/.test(relative))&&(role==='finance'||selling.includes(role)&&relative==='export/followups.csv'))return
 if(selling.includes(role)&&method==='GET'&&(relative==='line-sheets'||/^line-sheets\/[a-f0-9-]+(\.(pdf|csv))?$/.test(relative)||relative==='catalogue'||relative==='buying-profiles'||relative==='lists'||relative==='rep-assignments'||/^quotes(?:\/|$)/.test(relative)||relative==='shipping/options'||relative==='confirmation-layouts'||relative==='accounts/duplicates'))return
 return denied(env,actor,path)
}

const commandRoles:Record<string,string[]>={
 'credit.issue':['finance'],'credit.apply':['finance'],'card.allocate':['finance'],'refund.request':['finance'],'refund.refresh':['finance'],
 'proposal.offer':['sales-manager'],'proposal.execute':['sales-manager'],'proposal.withdraw':['sales-manager'],
 'price-book.import':['sales-manager'],'sheet.publish':['sales-manager'],'sheet.revoke':['sales-manager'],
 'account.save':['sales-manager'], 'terms.assign':['sales-manager'], 'terms.publish':['sales-manager'], 'commission.settings':['sales-manager'],
 'order.prepare':selling,'order.reorder':selling,'order.reorder-preview':selling,'order.submit':selling,'order.attach':selling,
 'sheet.view':selling,'sheet.preview':selling,
 'cart.preview':selling,'cart.form':selling,'list.save':selling,'list.duplicate':selling,'list.delete':selling,
 'quote.request':selling,'quote.propose':selling,'quote.approve':['sales-manager'],'quote.message':selling,'quote.read':selling,
 'shipping.select':selling,'shipping.quote':['sales-manager'],
 'order.approve':operating,'order.refresh':operating,'order.cancel':operating,'order.stock-exception':['sales-manager'],
 'substitution.preview':['sales-manager'],'substitution.propose':['sales-manager'],'substitution.execute':operating,
 'location.save':['sales-manager'],'location.archive':['sales-manager'],
 'rep.assign':['sales-manager'],'rep.cover':['sales-manager'],'rep.end':['sales-manager'],'rep.transfer':['sales-manager'],
 'visit.schedule':selling,'visit.record':selling,'visit.samples':selling,'visit.basket':selling,'visit.handoff':operating,
 'followup.plan':selling,'followup.decide':selling,'followup.send':selling,
 'followup.refresh':['sales-manager','rep','operations','finance'],'followup.update':['sales-manager','rep','operations','finance'],
 'report.remove-recipient':['sales-manager','rep','operations','finance','analyst'],
}
/** Resource scope is checked before a leaf command, and again in its existing account door. */
export async function staffCommandGate(env:Bindings,actor:Actor,type:string,p:any) {
 if(!actor.staff)return
 const grant=actor.staff
 if(type.startsWith('application.')) {
  if(applicationAccess(actor)==='review' && ['application.request-information','application.approve','application.decline'].includes(type)) return
  return denied(env,actor,type)
 }
 if(!commandRoles[type]?.includes(grant.role))return denied(env,actor,type)
 if(['terms.publish','commission.settings','rep.assign','rep.cover','rep.end','rep.transfer'].includes(type)&&grant.accounts!=='all')return denied(env,actor,type)
 if(['order.approve','order.refresh','order.cancel','substitution.execute','visit.handoff'].includes(type)&&grant.warehouses!=='all')return denied(env,actor,type) // current Pier door may allocate across warehouses
 let accountId=typeof p.accountId==='string'?p.accountId:undefined
 for(const [key,table] of [['orderId','bw_orders'],['creditId','bw_credit_notes'],['refundId','bw_credit_refunds'],['paymentId','bw_card_payments'],['quoteId','bw_quotes'],['listId','bw_lists'],['sheetId','bw_line_sheets'],['id','bw_followups']] as const){
  if(typeof p[key]!=='string'||key==='id'&&!type.startsWith('followup.'))continue
  const row=await env.DB.prepare(`SELECT account_id FROM ${table} WHERE id=?`).bind(p[key]).first<{account_id:string}>()
  if(row){if(accountId&&accountId!==row.account_id)fail('NOT_FOUND','Resource not found.',404);accountId=row.account_id}
 }
 if(type==='account.save'&&typeof p.id==='string')accountId=p.id
 if(type==='followup.update'&&typeof p.id==='string') {
  const task=await env.DB.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(p.id).first<{value_json:string}>()
  if(task&&JSON.parse(task.value_json).kind==='application') {
   if(applicationAccess(actor)==='review')return
   return denied(env,actor,type)
  }
 }
 if(accountId&&!staffAccountAllowed(grant,accountId))fail('NOT_FOUND','Trade resource not found.',404)
 if(type==='account.save'&&!accountId&&grant.accounts!=='all')return denied(env,actor,type)
 if(type==='report.remove-recipient'&&p.operatorId!==undefined&&p.operatorId!==actor.id)return denied(env,actor,type)
 if(type==='quote.propose'&&p.freightQuote&&grant.role!=='sales-manager')return denied(env,actor,type)
 if(type==='order.stock-exception'){
  const row=await env.DB.prepare('SELECT value_json FROM bw_orders WHERE id=?').bind(p.orderId??'').first<{value_json:string}>(),order=row?JSON.parse(row.value_json):null
  if(grant.stockExceptionLimitCents===0||order&&(order.currency!=='USD'||order.totalCents>grant.stockExceptionLimitCents))return denied(env,actor,type)
 }
}

export function staffCanReadOrder(grant:StaffGrant,order:{accountId:string;invoice?:unknown}) {
 return staffAccountAllowed(grant,order.accountId)&&grant.role!=='analyst'&&(grant.role!=='finance'||Boolean(order.invoice))
}
