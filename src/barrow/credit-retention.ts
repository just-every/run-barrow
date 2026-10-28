export const creditFinancialTables=['bw_credit_notes','bw_credit_applications','bw_card_allocations','bw_credit_refunds'] as const
export type CreditFinancialRow={id:string;account_id:string;order_id:string;value_json:string;revision:string}
export function creditFinancialDates(orderId:string,rows:CreditFinancialRow[],events:{refund_id:string;created_at:string}[]=[]) {
 const byId=new Map(rows.map(row=>[row.id,row]))
 const related=new Set([orderId,...rows.filter(row=>JSON.parse(row.value_json).sourceOrderId===orderId).map(row=>row.order_id)])
 const selected=rows.filter(row=>related.has(row.order_id)||related.has(byId.get(JSON.parse(row.value_json).creditId)?.order_id??''))
 return selected.flatMap(row=>{const value=JSON.parse(row.value_json);return [value.createdAt??'unknown',value.latestFinancialAt,value.completedAt,...events.filter(event=>event.refund_id===row.id).map(event=>event.created_at)].filter(Boolean) as string[]})
}
export function creditHistoryItems(rows:Record<string,any[]>,accountId:string) {
 return creditFinancialTables.flatMap(table=>rows[table].filter(row=>row.account_id===accountId).map(row=>({table,row:row as CreditFinancialRow})))
}
