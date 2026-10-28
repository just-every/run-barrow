/** Campaign provider receipts are personal custody, outside commercial retention. */
export function campaignErasureStatements(column:'account_id'|'recipient_id',id:string){
 return [
  {sql:`DELETE FROM rer_mail_event_receipts WHERE provider='resend' AND event_namespace='campaigns' AND json_extract(event_json,'$.providerMessageId') IN (SELECT provider_message_id FROM bw_campaign_deliveries WHERE ${column}=?)`,params:[id]},
  {sql:`DELETE FROM rer_mail_event_states WHERE provider='resend' AND event_namespace='campaigns' AND provider_message_id IN (SELECT provider_message_id FROM bw_campaign_deliveries WHERE ${column}=?)`,params:[id]},
  {sql:`DELETE FROM bw_campaign_deliveries WHERE ${column}=?`,params:[id]},
 ]
}
