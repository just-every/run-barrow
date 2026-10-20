export const portabilityPolicy = {
 product: 'wholesale/barrow',
 // Restored history must never initiate outreach. Native notice creation opts in explicitly.
 exportRow(table,row) {
  if(table==='bw_quote_notices')return {...row,mail_eligible:0};
  if(table==='bw_quote_mail')return {...row,status:'archived',lease_until:0};
  return row;
 },
 excludeTables: ['bw_agent_tokens','bw_guard'],
 requiredConfiguration: ['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
};
