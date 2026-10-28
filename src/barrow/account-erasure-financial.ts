import { creditFinancialDates,creditFinancialTables,type CreditFinancialRow } from './credit-retention'
/** Financial evidence is retained independently of connector credentials. */
export type CardPaymentRow={id:string;account_id:string;order_id:string;value_json:string;revision:string}
export type CardEventRow={id:string;payment_id:string;created_at:string;value_json:string}
export const stripeCustody='Stripe retains its own payment, authentication and transaction records under the merchant’s Stripe account. Barrow preserves opaque payment and event IDs and financial history; disconnecting Stripe or erasing an account does not erase provider-held copies. No Stripe erasure is sent or claimed.'
const unknownFloor='9999-12-31T23:59:59.999Z'

export function financialFloor(order:any,payments:CardPaymentRow[]=[],events:CardEventRow[]=[],financialDates:string[]=[]):string|null {
 const submitted=!['draft','superseded'].includes(order.status)
 if(!submitted&&!payments.length&&!financialDates.length)return null
 const dates:any[]=[...financialDates,...(submitted?[order.preparedAt,order.approvedAt,order.invoice?.issuedAt].filter(Boolean):[])]
 for(const row of payments) {
  const payment=JSON.parse(row.value_json),recorded=events.filter(event=>event.payment_id===row.id)
  dates.push(...[payment.latestFinancialAt,payment.capturedAt].filter(Boolean),...recorded.map(event=>event.created_at))
  if(!['prepared','requires_action'].includes(payment.state)&&!payment.latestFinancialAt&&!payment.capturedAt&&!recorded.length)return unknownFloor
 }
 if(!dates.length)return submitted?unknownFloor:null
 const timestamps=dates.map(value=>Date.parse(value))
 if(timestamps.some(value=>!Number.isFinite(value)))return unknownFloor
 const date=new Date(Math.max(...timestamps)),month=date.getUTCMonth()
 date.setUTCFullYear(date.getUTCFullYear()+7)
 if(date.getUTCMonth()!==month)date.setUTCDate(0)
 return Number.isFinite(date.getTime())?date.toISOString():unknownFloor
}

const evidenceQueries={
 payments:'SELECT json_group_array(json_array(id,account_id,order_id,value_json,revision)) AS value FROM (SELECT * FROM bw_card_payments ORDER BY id)',
 events:'SELECT json_group_array(json_array(id,payment_id,created_at,value_json)) AS value FROM (SELECT * FROM bw_card_events ORDER BY id)',
}
export async function cardFinancialEvidence(db:D1Database) {
 const financialResults=await Promise.all([...creditFinancialTables,'bw_refund_events'].map(async table=>{const columns=(await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>()).results.map(row=>row.name);const query=`SELECT json_group_array(json_array(${columns.join(',')})) AS value FROM (SELECT * FROM ${table} ORDER BY id)`,result=await db.prepare(query).first<{value:string}>();return {table,columns,query,value:result!.value}}))
 const financial=financialResults.filter(result=>result.table!=='bw_refund_events').flatMap(result=>JSON.parse(result.value).map((row:any[])=>Object.fromEntries(result.columns.map((name,index)=>[name,row[index]])))) as CreditFinancialRow[]
 const refundEvents=financialResults.filter(result=>result.table==='bw_refund_events').flatMap(result=>JSON.parse(result.value).map((row:any[])=>Object.fromEntries(result.columns.map((name,index)=>[name,row[index]])))) as {refund_id:string;created_at:string}[]
 const [payments,events,connection]=await Promise.all([
  db.prepare(evidenceQueries.payments).first<{value:string}>(),
  db.prepare(evidenceQueries.events).first<{value:string}>(),
  db.prepare('SELECT 1 FROM bw_card_connection LIMIT 1').first(),
 ])
 return {
  financialDates:(orderId:string)=>{
   const linked=new Set(financial.filter(row=>row.order_id===orderId).map(row=>JSON.parse(row.value_json).paymentId).filter(Boolean))
   const sources=JSON.parse(payments!.value).filter((row:string[])=>linked.has(row[0])).flatMap((row:string[])=>{const value=JSON.parse(row[3]);return [value.latestFinancialAt,value.capturedAt,...JSON.parse(events!.value).filter((event:string[])=>event[1]===row[0]).map((event:string[])=>event[2])].filter(Boolean)})
   return [...creditFinancialDates(orderId,financial,refundEvents),...sources]
  },
  payments:JSON.parse(payments!.value).map(([id,account_id,order_id,value_json,revision]:string[])=>({id,account_id,order_id,value_json,revision})) as CardPaymentRow[],
  events:JSON.parse(events!.value).map(([id,payment_id,created_at,value_json]:string[])=>({id,payment_id,created_at,value_json})) as CardEventRow[],
  custody:!!connection||JSON.parse(payments!.value).length>0,
  guards:[...financialResults.map(result=>db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${result.query.replace(' AS value','')})=? THEN 1 ELSE 0 END`).bind(result.value)),...([['payments',payments!.value],['events',events!.value]].map(([kind,value])=>db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${evidenceQueries[kind as keyof typeof evidenceQueries].replace(' AS value','')})=? THEN 1 ELSE 0 END`).bind(value)))],
 }
}
