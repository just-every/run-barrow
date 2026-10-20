import type { Bindings } from '../auth.server'
import { commercialAuditEvent } from './audit-event'
// Deployment owns the secret. This observer records configure/rotate/revoke without retaining the secret or publishing its digest.
export async function observeMailConfiguration(env:Bindings) {
 const key=env.MAIL_WEBHOOK_SECRET??'',tenantId=env.MAIL_EVENT_TENANT??''
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),n=>n.toString(16).padStart(2,'0')).join('')
 const fingerprint=key?digest:'revoked',prior=await env.DB.prepare('SELECT fingerprint,revision FROM bw_quote_mail_config WHERE singleton=1').first<{fingerprint:string;revision:string}>()
 if(prior?.fingerprint!==fingerprint) {
  const revision=crypto.randomUUID(),action=key?(prior&&prior.fingerprint!=='revoked'?'rotated':'configured'):'revoked'
  const event=commercialAuditEvent('system:quote-mail','quote-mail-configuration',`quote-mail.secret-${action}`,{revision,source:'quote-mail.configuration',reason:`Installation quote delivery webhook secret ${action}; value and fingerprint excluded from audit.`})
  await env.DB.batch([env.DB.prepare('INSERT INTO bw_quote_mail_config VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET fingerprint=excluded.fingerprint,revision=excluded.revision WHERE bw_quote_mail_config.fingerprint<>excluded.fingerprint').bind(fingerprint,revision),env.DB.prepare(event.sql.replace('VALUES(?,?,?,?,?,?)','SELECT ?,?,?,?,?,? WHERE changes()=1')).bind(...event.params)])
 }
 let usableSecret=false
 try {const bytes=atob(key.startsWith('whsec_')?key.slice(6):'');usableSecret=key.startsWith('whsec_')&&bytes.length>=16&&bytes.length<=64}catch{}
 return {configured:env.MAIL_PROVIDER==='resend'&&!!env.MAIL_API_KEY&&usableSecret&&!!tenantId,tenantId}
}
