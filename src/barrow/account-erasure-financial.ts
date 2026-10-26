/** Financial evidence is retained independently of connector credentials. */
export type CardPaymentRow={id:string;account_id:string;order_id:string;value_json:string;revision:string}
export type CardEventRow={id:string;payment_id:string;created_at:string;value_json:string}
export const stripeCustody='Stripe retains its own payment, authentication and transaction records under the merchant’s Stripe account. Barrow preserves opaque payment and event IDs and financial history; disconnecting Stripe or erasing an account does not erase provider-held copies. No Stripe erasure is sent or claimed.'
const unknownFloor='9999-12-31T23:59:59.999Z'

export function financialFloor(order:any,payments:CardPaymentRow[]=[],events:CardEventRow[]=[]):string|null {
 const submitted=!['draft','superseded'].includes(order.status)
 if(!submitted&&!payments.length)return null
 const dates:any[]=submitted?[order.preparedAt,order.approvedAt,order.invoice?.issuedAt].filter(Boolean):[]
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
 const [payments,events,connection]=await Promise.all([
  db.prepare(evidenceQueries.payments).first<{value:string}>(),
  db.prepare(evidenceQueries.events).first<{value:string}>(),
  db.prepare('SELECT 1 FROM bw_card_connection LIMIT 1').first(),
 ])
 return {
  payments:JSON.parse(payments!.value).map(([id,account_id,order_id,value_json,revision]:string[])=>({id,account_id,order_id,value_json,revision})) as CardPaymentRow[],
  events:JSON.parse(events!.value).map(([id,payment_id,created_at,value_json]:string[])=>({id,payment_id,created_at,value_json})) as CardEventRow[],
  custody:!!connection||JSON.parse(payments!.value).length>0,
  guards:[['payments',payments!.value],['events',events!.value]].map(([kind,value])=>db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${evidenceQueries[kind as keyof typeof evidenceQueries].replace(' AS value','')})=? THEN 1 ELSE 0 END`).bind(value)),
 }
}
