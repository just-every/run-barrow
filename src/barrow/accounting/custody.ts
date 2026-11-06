/** Retained provider money belongs to the erased company, never a reusable native ID. */
export type QboCustomerCustody={realm:string;source_id:string;kind:string}
export async function qboCustomerCustody(db:D1Database,accountId:string):Promise<QboCustomerCustody[]> {
 return (await db.prepare("SELECT realm,source_id,'Customer' AS kind FROM bw_qbo_maps WHERE kind='Customer' AND native_id=? UNION SELECT json_extract(value_json,'$.realm'),json_extract(value_json,'$.customerId'),'Customer' FROM bw_qbo_invoices WHERE account_id=?").bind(accountId,accountId).all<QboCustomerCustody>()).results
}
export function qboErasureStatements(accountId:string,customers:QboCustomerCustody[]) {
 const sql=(sql:string,...params:any[])=>({sql,params})
 return [
  ...customers.map(customer=>sql('INSERT OR IGNORE INTO bw_qbo_erased VALUES(?,?)',customer.realm,customer.source_id)),
  // Also capture rows present in the restored archive but absent from the original journal snapshot.
  sql("INSERT OR IGNORE INTO bw_qbo_erased SELECT realm,source_id FROM bw_qbo_maps WHERE kind='Customer' AND native_id=?",accountId),
  sql("INSERT OR IGNORE INTO bw_qbo_erased SELECT json_extract(value_json,'$.realm'),json_extract(value_json,'$.customerId') FROM bw_qbo_invoices WHERE account_id=?",accountId),
  sql("DELETE FROM bw_qbo_maps WHERE kind='Customer' AND native_id=?",accountId),
  sql('DELETE FROM bw_qbo_links WHERE account_id=?',accountId),
  // Preserve every exact financial observation and latest-event floor; remove only live account admission.
  sql("UPDATE bw_qbo_invoices SET account_id='' WHERE account_id=?",accountId),
 ]
}
