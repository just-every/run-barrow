import { prebookView } from './prebooks'
import { requireStaffReport } from './staff-policy'
import type { Bindings } from '../auth.server'
import { fail, requireSupplier, type Actor, type Order } from './model'
import { pierOrigin, pierState } from './pier'
import { reportZone, calendarDate } from './report-zone'
import { now } from './clock'
import { fulfillmentLines } from './fulfillment-lines'

/** RPT-003: a read-only report of live source-confirmed facts, with explicit unknowns. */
export async function fulfillmentReport(env: Bindings, actor: Actor, params: URLSearchParams) {
 requireStaffReport(actor, 'fulfillment', params); requireSupplier(actor)
 const checkedAt = (await now()).toISOString(), timeZone = await reportZone(env.DB), today = calendarDate(new Date(checkedAt), timeZone), origin = await pierOrigin(env)
 const accountId = params.get('accountId') ?? '', warehouse = params.get('warehouse') ?? ''
 const records = (await env.DB.prepare("SELECT value_json FROM bw_orders WHERE (?='' OR json_extract(value_json,'$.accountId')=?) ORDER BY rowid DESC").bind(accountId,accountId).all<{ value_json: string }>()).results.map(row => JSON.parse(row.value_json) as Order)
 const prebooks=await Promise.all(records.filter(order=>order.status==='prebook').map(async order=>({orderId:order.id,accountId:order.accountId,...await prebookView(env,order)})))
 if(actor.staff?.warehouses&&actor.staff.warehouses!=='all'&&prebooks.length)fail('FORBIDDEN','Incoming prebook commitments have no warehouse evidence for this report scope.',403)
 const orders = records.filter(order => order.approvedAt && (!accountId || order.accountId === accountId))
 const lines: ReturnType<typeof fulfillmentLines> = [], exceptions: { orderId: string; reason: string; owner: string }[] = []
 let state: any
 try { state = await pierState(env) } catch { return { checkedAt, today, timeZone, source: 'Pier', status: 'unavailable' as const, prebooks:warehouse?[]:prebooks, lines, lateLines: lines, exceptions, note: 'Pier did not answer. Fulfillment quantities and delivery are unknown.' } }
 for (const order of orders) {
  const upstream = order.pierOrigin === origin && (state.orders ?? []).find((row: any) => row.id === order.pierOrderId)
  if (!upstream) { exceptions.push({ orderId: order.id, reason: 'Recorded source order unavailable or connected destination differs.', owner: 'Supplier' }); continue }
  try { lines.push(...fulfillmentLines(order, upstream, state, today, timeZone)) }
  catch { exceptions.push({ orderId: order.id, reason: 'Source line quantities do not reconcile. Inspect the source order.', owner: 'Supplier' }) }
 }
 const selected = lines.filter(line => !warehouse || line.warehouses.some(row => row.warehouse === warehouse) || (warehouse === 'Unassigned backorder' && line.unassignedBackorder !== '0'))
 const warehouses = actor.staff?.warehouses
 if (warehouses && warehouses !== 'all' && (prebooks.length || exceptions.length || selected.some(line => line.warehouses.some(row => !warehouses.includes(row.warehouse)) || (line.unassignedBackorder !== '0' && !warehouses.includes('Unassigned backorder'))))) fail('FORBIDDEN','The whole fulfillment report cannot be confirmed within your warehouse scope.',403)
 return { checkedAt, today, timeZone, source: 'Pier', status: 'read' as const, prebooks:warehouse?[]:prebooks, lines: selected, lateLines: selected.filter(line => line.overdue || (line.dispatchedLate !== null && line.dispatchedLate !== '0')), exceptions,
  note: 'Quantities are per SKU in base units. Fill = shipped / (ordered − cancelled). Warehouse filters select whole order lines with confirmed warehouse activity; backorders are unassigned. Dispatch by requested date uses inclusive days in the stated installation reporting time zone; delivery and complete promise history are not recorded.' }
}
