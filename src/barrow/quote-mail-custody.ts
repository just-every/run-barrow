// DATA-003: join the account erasure transaction before deleting its ledger.
export function quoteMailErasureStatements(accountId:string) {
 return [
  ...['bw_stock_watches','bw_stock_notices'].map(table=>({sql:`DELETE FROM ${table} WHERE account_id=?`,params:[accountId]})),
  {sql:"DELETE FROM rer_mail_event_receipts WHERE provider='resend' AND event_namespace='quotes' AND json_extract(event_json,'$.providerMessageId') IN (SELECT provider_message_id FROM bw_quote_mail WHERE account_id=?)",params:[accountId]},
  {sql:"DELETE FROM rer_mail_event_states WHERE provider='resend' AND event_namespace='quotes' AND provider_message_id IN (SELECT provider_message_id FROM bw_quote_mail WHERE account_id=?)",params:[accountId]},
  {sql:'DELETE FROM bw_quote_mail WHERE account_id=?',params:[accountId]},
 ]
}
