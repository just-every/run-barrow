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
 if(!staffAccountAllowed(grant,task.accountId))return false
 return selling.includes(grant.role)||grant.role==='operations'&&['fulfillment','delivery','return','approval'].includes(task.kind)||grant.role==='finance'&&['payment','reconciliation','credit','refund'].includes(task.kind)
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
 if(method==='GET'&&['state','company/invitations','usage-terms','report-schedules','audit','audit.csv'].includes(relative))return
 if(method==='GET'&&/^report-runs\/[A-Za-z0-9_-]+\.json$/.test(relative))return
 if(method==='GET'&&/^reports\/(sales|finance|quotes|fulfillment|commissions)(\.csv)?$/.test(relative))return // report computes whole-filter entitlement before reading
 if(method==='GET'&&relative==='commissions'&&role==='sales-manager'&&actor.staff.accounts==='all')return
 if(role==='analyst')return denied(env,actor,path)
 if(method==='GET'&&(['accounts','orders/history','orders/search','followups'].includes(relative)||/^accounts\/by-id\/[^/]+$/.test(relative)))return
 if(method==='GET'&&/^orders\/[-A-Za-z0-9_]+(?:\/(timeline|document|terms-signature|confirmations(?:\/[1-9]\d*\.(csv|pdf))?))?$/.test(relative))return
 if(method==='POST'&&['confirmations/selection','confirmations/export.csv'].includes(relative))return
 if(method==='GET'&&relative==='locations')return
 if(method==='GET'&&relative==='sales-terms')return
 if(method==='GET'&&/^sales-terms\/[^/]+\/[1-9]\d*\/document$/.test(relative))return
 if(method==='GET'&&(/^(invoices|statements)\//.test(relative)||/^export(?:\.json|\/[^/]+\.csv)$/.test(relative))&&(role==='finance'||selling.includes(role)&&relative==='export/followups.csv'))return
 if(selling.includes(role)&&method==='GET'&&(relative==='catalogue'||relative==='lists'||relative==='rep-assignments'||/^quotes(?:\/|$)/.test(relative)||relative==='shipping/options'||relative==='confirmation-layouts'||relative==='accounts/duplicates'))return
 return denied(env,actor,path)
}

const commandRoles:Record<string,string[]>={
 'account.save':['sales-manager'], 'terms.assign':['sales-manager'], 'terms.publish':['sales-manager'], 'commission.settings':['sales-manager'],
 'order.prepare':selling,'order.reorder':selling,'order.reorder-preview':selling,'order.submit':selling,'order.attach':selling,
 'cart.preview':selling,'cart.form':selling,'list.save':selling,'list.duplicate':selling,'list.delete':selling,
 'quote.request':selling,'quote.propose':selling,'quote.approve':['sales-manager'],'quote.message':selling,'quote.read':selling,
 'shipping.select':selling,'shipping.quote':['sales-manager'],
 'order.approve':operating,'order.refresh':operating,'order.cancel':operating,'order.stock-exception':['sales-manager'],
 'substitution.preview':['sales-manager'],'substitution.propose':['sales-manager'],'substitution.execute':operating,
 'location.save':['sales-manager'],'location.archive':['sales-manager'],
 'rep.assign':['sales-manager'],'rep.cover':['sales-manager'],'rep.end':['sales-manager'],'rep.transfer':['sales-manager'],
 'followup.refresh':['sales-manager','rep','operations','finance'],'followup.update':['sales-manager','rep','operations','finance'],
 'report.remove-recipient':['sales-manager','rep','operations','finance','analyst'],
}
/** Resource scope is checked before a leaf command, and again in its existing account door. */
export async function staffCommandGate(env:Bindings,actor:Actor,type:string,p:any) {
 if(!actor.staff)return
 const grant=actor.staff
 if(!commandRoles[type]?.includes(grant.role))return denied(env,actor,type)
 if(['terms.publish','commission.settings','rep.assign','rep.cover','rep.end','rep.transfer'].includes(type)&&grant.accounts!=='all')return denied(env,actor,type)
 if(['order.approve','order.refresh','order.cancel','substitution.execute'].includes(type)&&grant.warehouses!=='all')return denied(env,actor,type) // current Pier door may allocate across warehouses
 let accountId=typeof p.accountId==='string'?p.accountId:undefined
 for(const [key,table] of [['orderId','bw_orders'],['quoteId','bw_quotes'],['listId','bw_lists'],['id','bw_followups']] as const){
  if(typeof p[key]!=='string'||key==='id'&&!type.startsWith('followup.'))continue
  const row=await env.DB.prepare(`SELECT account_id FROM ${table} WHERE id=?`).bind(p[key]).first<{account_id:string}>()
  if(row){if(accountId&&accountId!==row.account_id)fail('NOT_FOUND','Resource not found.',404);accountId=row.account_id}
 }
 if(type==='account.save'&&typeof p.id==='string')accountId=p.id
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
