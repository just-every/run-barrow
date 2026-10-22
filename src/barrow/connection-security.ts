import type { Bindings } from '../auth.server'
import { commercialAuditEvent } from './audit-event'

/** Observe deployed custody; neither the secret nor its keyed fingerprint enters the audit. */
export async function observePierConfiguration(env: Bindings) {
 const configured = Boolean(env.PIER_ORIGIN && env.PIER_SESSION)
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), {name:'HMAC', hash:'SHA-256'}, false, ['sign'])
 const fingerprint = configured ? Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify([env.PIER_ORIGIN, env.PIER_SESSION])))), n => n.toString(16).padStart(2,'0')).join('') : 'revoked'
 const prior = await env.DB.prepare("SELECT fingerprint,revision FROM bw_connector_config WHERE id='pier'").first<{fingerprint:string;revision:string}>()
 if (prior?.fingerprint === fingerprint || !prior && !configured) return
 const revision = crypto.randomUUID(), action = configured ? prior && prior.fingerprint !== 'revoked' ? 'rotated' : 'configured' : 'revoked'
 const event = commercialAuditEvent('system:connectors', 'connector:pier', `pier.connection-${action}`, {revision,source:'pier.configuration',reason:`Deployed Pier credential ${action}; credential and fingerprint excluded. Revoke replaced credentials at Pier; Barrow cannot revoke another installation’s sign-in.`})
 await env.DB.batch([
  env.DB.prepare("INSERT INTO bw_connector_config(id,fingerprint,revision) VALUES('pier',?,?) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,revision=excluded.revision WHERE bw_connector_config.fingerprint<>excluded.fingerprint").bind(fingerprint,revision),
  env.DB.prepare(event.sql.replace('VALUES(?,?,?,?,?,?)','SELECT ?,?,?,?,?,? WHERE changes()=1')).bind(...event.params),
 ])
}
