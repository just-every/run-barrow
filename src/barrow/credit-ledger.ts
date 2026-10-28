import type { CreditApplication,CreditNote,CreditRefund,PaymentAllocation } from './credit-model'
import { fail } from './model'
export async function creditRecords(db:D1Database) {
 const tables=['bw_credit_notes','bw_credit_applications','bw_card_allocations','bw_credit_refunds'] as const
 const rows=await Promise.all(tables.map(table=>db.prepare(`SELECT value_json,revision FROM ${table} ORDER BY id`).all<{value_json:string;revision:string}>()))
 const values=rows.map(result=>result.results.map(row=>({...JSON.parse(row.value_json),revision:row.revision})))
 return {credits:values[0] as CreditNote[],applications:values[1] as CreditApplication[],allocations:values[2] as PaymentAllocation[],refunds:values[3] as CreditRefund[]}
}
export async function storedCredit(db:D1Database,id:string):Promise<CreditNote> {
 const row=await db.prepare('SELECT value_json,revision FROM bw_credit_notes WHERE id=?').bind(id).first<{value_json:string;revision:string}>()
 if(!row)fail('NOT_FOUND','Credit note not found.',404)
 return {...JSON.parse(row.value_json),revision:row.revision}
}
export async function storedRefund(db:D1Database,id:string):Promise<CreditRefund> {
 const row=await db.prepare('SELECT value_json,revision FROM bw_credit_refunds WHERE id=?').bind(id).first<{value_json:string;revision:string}>()
 if(!row)fail('NOT_FOUND','Refund not found.',404)
 return {...JSON.parse(row.value_json),revision:row.revision}
}
export const publicCredit=(value:CreditNote)=>{const {commissionSnapshot,...result}=value;return result}
export function creditAvailable(credit:CreditNote,records:Awaited<ReturnType<typeof creditRecords>>) {
 return credit.amountCents-records.applications.filter(row=>row.creditId===credit.id).reduce((n,row)=>n+row.amountCents,0)-records.refunds.filter(row=>row.creditId===credit.id&&!['failed','cancelled'].includes(row.status)).reduce((n,row)=>n+row.amountCents,0)
}
export function invoiceOutstanding(orderId:string,totalCents:number,records:Awaited<ReturnType<typeof creditRecords>>) {
 return Math.max(0,totalCents-records.allocations.filter(row=>row.orderId===orderId).reduce((n,row)=>n+row.amountCents,0)-records.applications.filter(row=>row.orderId===orderId).reduce((n,row)=>n+row.amountCents,0))
}
/** Fence both existing rows and new financial decisions in a money-changing batch. */
export async function financialGuard(db:D1Database) {
 const tables=['bw_credit_notes','bw_credit_applications','bw_card_allocations','bw_credit_refunds','bw_card_payments'] as const
 return Promise.all(tables.map(async table=>{
  const query=`SELECT json_group_array(json_array(id,value_json,revision)) AS value FROM (SELECT id,value_json,revision FROM ${table} ORDER BY id)`
  const value=await db.prepare(query).first<{value:string}>()
  return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${query.replace(' AS value','')})=? THEN 1 ELSE 0 END`).bind(value!.value)
 }))
}
