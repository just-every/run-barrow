export const portabilityPolicy = {
 product: 'wholesale/barrow',
 // Restored history must never initiate outreach. Native notice creation opts in explicitly.
 exportRow(table,row) {
  if(table==='bw_company_members')return {...row,state:'removed'};
  if(table==='bw_report_schedules')return {...row,restored:1};
  if(table==='bw_report_deliveries' && ['queued','not configured','uncertain'].includes(row.status))return {...row,status:'cancelled',reason:'Restored history cannot initiate outreach'};
  if(table==='bw_quote_notices')return {...row,mail_eligible:0};
  if(table==='bw_quote_mail')return {...row,status:['queued','sending','rate_limited','uncertain'].includes(row.status)?'uncertain':row.status,restored:1,lease_until:0};
  return row;
 },
 excludeTables: ['bw_agent_tokens','bw_guard','bw_quote_mail_config','bw_company_invites','bw_application_intake','bw_application_codes','bw_application_sessions','bw_application_rates'],
 requiredConfiguration: ['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
};

export default portabilityPolicy;
