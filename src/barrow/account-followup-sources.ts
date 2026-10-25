import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { digest } from './access'
import { bootstrapLegacyCompanyMembers, companyPurchasingRecipientSql } from './company-members'
import { fulfillmentLines } from './fulfillment-lines'
import { pierOrigin, pierState } from './pier'
import { calendarDate, reportZone } from './report-zone'
import { now } from './clock'
import { fail, type Actor, type Order } from './model'

export type PlanSource = { kind: string; path: string; summary: string }
export async function accountFollowupSources(env: Bindings, actor: Actor, accountId: string) {
 const selected = await account(env.DB, actor, accountId)
 if ((selected.value.lifecycle ?? 'active') !== 'active') fail('ACCOUNT_INACTIVE', 'Only active accounts can receive follow-up outreach.')
 await bootstrapLegacyCompanyMembers(env.DB)
 const read = async (table: string) => (await env.DB.prepare(`SELECT * FROM ${table} WHERE account_id=? ORDER BY rowid`).bind(accountId).all<any>()).results
 const [quotes, entries, orders, visits, tasks, recipients] = await Promise.all([
  read('bw_quotes'), read('bw_quote_entries'), read('bw_orders'), read('bw_visits'), read('bw_followups'),
  env.DB.prepare(`SELECT p.id,p.email,p.version FROM oa_operators p JOIN bw_accounts a ON a.id=? WHERE p.status='active' AND ${companyPurchasingRecipientSql('p','a.id')} ORDER BY p.id`).bind(accountId).all<{id:string;email:string;version:number}>(),
 ])
 const at = await now(), today = calendarDate(at, await reportZone(env.DB)), zone = await reportZone(env.DB)
 const sourceTasks = tasks.filter(row => !row.id.startsWith('plan:'))
 const sources: PlanSource[] = [{kind:'preferences',path:`/api/barrow/accounts/by-id/${accountId}`,summary:`Account ${selected.value.name}; recipient eligibility follows current purchasing membership. No contact preferences recorded; address suppression is checked before mail.`}]
 const quoteValues = quotes.map(row => JSON.parse(row.value_json))
 for (const quote of quoteValues) sources.push({kind:'quote',path:`/api/barrow/quotes/${quote.id}`,summary:`Quote ${quote.id}: ${quote.status}.`})
 for (const entry of entries) sources.push({kind:entry.kind==='internal'?'internal-note':'conversation',path:`/api/barrow/quotes/${entry.quote_id}`,summary:`${entry.side} at ${entry.created_at}: ${entry.body}`})
 const orderValues = orders.map(row => JSON.parse(row.value_json) as Order)
 for (const order of orderValues) sources.push({kind:order.status==='draft'?'cart':'cadence',path:`/api/barrow/orders/${order.id}`,summary:`${order.reference || order.id}: ${order.status}; prepared ${order.preparedAt}; submitted ${order.submittedBy ? 'yes' : 'no'}.`})
 for (const row of visits) {const visit=JSON.parse(row.value_json);sources.push({kind:'visit',path:`/api/barrow/visits?accountId=${accountId}`,summary:`${visit.date}: ${visit.status}; ${visit.agenda ?? ''}; ${visit.notes.map((note:any)=>note.text).join('; ')}`})}
 for (const row of sourceTasks) {const task=JSON.parse(row.value_json);if(task.status==='open')sources.push({kind:'task',path:task.sourcePath,summary:`${task.title}: ${task.reason}; owner ${task.ownerId}; next contact ${task.nextContactDate}.`})}
 let fulfillment: unknown = [], delayed: ReturnType<typeof fulfillmentLines> = [], unknown = false
 const approved = orderValues.filter(order => order.approvedAt && order.pierOrderId)
 if (approved.length) {
  try {
   const [state, origin] = await Promise.all([pierState(env), pierOrigin(env)])
   const confirmed = []
   for (const order of approved) {
    const upstream = (state.orders ?? []).find((row:any)=>row.id===order.pierOrderId)
    if(!upstream || order.pierOrigin!==origin) {unknown=true;continue}
    try {confirmed.push(...fulfillmentLines(order,upstream,state,today,zone))} catch {unknown=true}
   }
   fulfillment=confirmed;delayed=confirmed.filter(line=>line.overdue)
  } catch {unknown=true;fulfillment='unavailable'}
 }
 for(const line of delayed)sources.unshift({kind:'delivery',path:`/api/barrow/reports/fulfillment?accountId=${accountId}`,summary:`${line.reference || line.orderId}: ${line.sku}, ${line.outstanding} outstanding after promise ${line.promisedDate}. Carrier delivery remains unknown.`})
 if(unknown)sources.unshift({kind:'service-unknown',path:'/api/barrow/reports/fulfillment',summary:'Fulfillment could not be confirmed. Resolve the service uncertainty before offering stock.'})
 const fingerprint=await digest(JSON.stringify({account:selected,quotes,entries,orders,visits,tasks:sourceTasks,recipients:recipients.results,fulfillment,unknown}))
 return { selected, quotes:quoteValues, entries, recipients:recipients.results, sources, fingerprint, delayed, unknown, today, at:at.toISOString(), fences:[...quotes.map(row=>({table:'bw_quotes',id:row.id,revision:row.revision})),...orders.map(row=>({table:'bw_orders',id:row.id,revision:row.revision})),...visits.map(row=>({table:'bw_visits',id:row.id,revision:row.revision}))] }
}
