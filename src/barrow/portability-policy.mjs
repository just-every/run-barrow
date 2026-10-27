export const portabilityPolicy = {
 product: 'wholesale/barrow',
 // Restored history must never initiate outreach. Native notice creation opts in explicitly.
 exportRow(table,row) {
  if(table==='bw_settings'&&row.key.startsWith('credit-policy:'))return {...row,value_json:JSON.stringify({...JSON.parse(row.value_json),releases:[]})};
  if(table==='bw_stock_sync')return {...row,restored:1,enabled:0,checkpoint:null,pending:null,lease_until:0,next_at:0,rate_until:0,has_more:1};
  if(table==='bw_stock_watches')return {...row,active:0};
  if(table==='bw_credit_refunds')return {...row,value_json:JSON.stringify({...JSON.parse(row.value_json),restored:true})};
  if(table==='bw_card_payments')return {...row,value_json:JSON.stringify({...JSON.parse(row.value_json),restored:true,paymentMethodId:undefined,providerCustomerId:undefined,setupSessionId:undefined,checkoutUrl:undefined,actionUrl:undefined})};
  if(table==='bw_delta_cutovers')return {...row,...(['rehearsal','signedoff'].includes(row.state)?{state:'inactive'}:{}),io_token:null,io_until:0};
  if(table==='bw_cutover_imports'&&row.state==='active')return {...row,state:'undone'}; // Restored cutover evidence is retained history, never an activation.
  if(table==='bw_agent_proposals'){const value=JSON.parse(row.value_json);return {...row,state:'superseded',value_json:JSON.stringify({...value,state:'superseded'})}};
  if(table==='bw_webhook_deliveries')return {...row,lease_until:0,...(['queued','retrying','sending'].includes(row.state)?{state:'dead-letter',last_result:'Restored history is inactive; external acceptance not acknowledged'}:{})};
  if(table==='bw_line_sheets')return {...row,value_json:JSON.stringify({...JSON.parse(row.value_json),state:'revoked'})};
  if(table==='bw_staff_members')return {...row,state:'revoked'};
  if(table==='bw_rep_assignments'||table==='bw_company_delegations')return {...row,state:'ended'};
  if(table==='bw_profile_approvals')return {...row,restored:1};
  if(table==='bw_company_members')return {...row,state:'removed'};
  if(table==='bw_followups') {const value=JSON.parse(row.value_json);if(value.plan)return {...row,value_json:JSON.stringify({...value,plan:{...value.plan,restored:true}})}}
  if(table==='bw_report_schedules')return {...row,restored:1};
  if(table==='bw_report_deliveries' && ['queued','not configured','uncertain'].includes(row.status))return {...row,status:'cancelled',reason:'Restored history cannot initiate outreach'};
  if(table==='bw_quote_notices')return {...row,mail_eligible:0};
  if(table==='bw_quote_mail')return {...row,status:['queued','sending','rate_limited','uncertain'].includes(row.status)?'uncertain':row.status,restored:1,lease_until:0};
  return row;
 },
 // Catalog search rows are rebuildable observations, never the catalog or stock authority.
 excludeTables: ['bw_card_customers','bw_saved_cards','bw_card_connection','bw_import_invitations','bw_catalog_search','bw_catalog_indexes','bw_agent_proposal_grants','bw_webhook_subscriptions','bw_connector_config','bw_request_rates','bw_rep_epoch','bw_agent_tokens','bw_guard','bw_quote_mail_config','bw_company_invites','bw_application_intake','bw_application_codes','bw_application_sessions','bw_application_rates'],
 requiredConfiguration: ['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
};

export default portabilityPolicy;
