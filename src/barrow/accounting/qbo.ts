import type { Bindings } from '../../auth.server'
import { audit, changed, commit } from '../access'
import { digest } from '../digest'
import { now } from '../clock'
import { fail, text, type Actor } from '../model'
import { sealWebhookSecret, openWebhookSecret } from '../webhook-security'

export const qboKinds = ['Customer','Item','Account','TaxCode'] as const
export type QboKind = typeof qboKinds[number]
export type Connection = { realm:string; mode:string; state:string; secret_cipher:string; expires_at:number; revision:string; owner_id:string }
export function qboOwner(actor:Actor) { if(actor.agent||actor.staff||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may connect or review QuickBooks.',403) }
export const qboConnection = (db:D1Database) => db.prepare('SELECT * FROM bw_qbo_connection WHERE singleton=1').first<Connection>()
export function qboGuard(db:D1Database,c:Connection) { return db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_qbo_connection WHERE singleton=1 AND revision=? AND state=?) THEN 1 ELSE 0 END').bind(c.revision,c.state) }
const callbackPath='/api/barrow/qbo/callback'
function client(env:Bindings) {
 if(!env.QBO_CLIENT_ID||!env.QBO_CLIENT_SECRET)fail('QBO_CONFIGURATION','Configure the QBO client and registered callback in installation secrets.',409)
 if(!env.AUTH_ORIGIN.startsWith('https://')&&env.AUTH_LOCAL!=='true')fail('QBO_CONFIGURATION','QuickBooks requires the registered public HTTPS callback.',409)
 return {id:env.QBO_CLIENT_ID,secret:env.QBO_CLIENT_SECRET,redirect:new URL(callbackPath,env.AUTH_ORIGIN).href}
}
export async function qboNetwork(url:string,init:RequestInit={}) {
 let response:Response
 try { response=await fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)}) }
 catch { fail('QBO_UNAVAILABLE','QuickBooks did not acknowledge this read. Resume the same correlation after checking the connection.',502) }
 if(!response!.ok)fail('QBO_REFUSED',`QuickBooks refused the request (HTTP ${response!.status}); reconnect if authorization was revoked, then review and resume.`,409)
 const body=await response!.text()
 if(body.length>1000000)fail('QBO_RESPONSE','QuickBooks exceeded the bounded response size.',409)
 try { return JSON.parse(body) } catch { fail('QBO_RESPONSE','QuickBooks returned an unreadable response.',409) }
}
async function tokens(env:Bindings,fields:Record<string,string>) {
 const config=client(env)
 const result=await qboNetwork('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',{method:'POST',headers:{Authorization:'Basic '+btoa(config.id+':'+config.secret),'content-type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams(fields).toString()})
 if(typeof result.access_token!=='string'||typeof result.refresh_token!=='string'||!Number.isSafeInteger(result.expires_in)||result.expires_in<1||result.expires_in>86400)fail('QBO_RESPONSE','QuickBooks did not return a complete bounded credential.',409)
 return result
}
export async function qboBegin(env:Bindings,actor:Actor,p:any) {
 qboOwner(actor); const config=client(env),realm=text(p.realm,'QuickBooks company ID',100),reason=text(p.reason,'Connection reason',1000)
 if(!/^\d+$/.test(realm)||!['sandbox','production'].includes(p.mode))fail('INPUT','Enter the exact numeric company ID and select sandbox or production.',400)
 if(p.consent!==true)fail('CONSENT','Review separate QuickBooks custody and consent explicitly. The provider accounting scope is broad; Barrow only reads.',400)
 if(await qboConnection(env.DB))fail('QBO_CONNECTED','Disconnect the existing company before replacing it.',409)
 const state=crypto.randomUUID()+crypto.randomUUID(),at=(await now()).getTime()
 await commit(env.DB,actor,[env.DB.prepare('DELETE FROM bw_qbo_oauth WHERE owner_id=?').bind(actor.id),env.DB.prepare('INSERT INTO bw_qbo_oauth VALUES(?,?,?,?,?,?)').bind(await digest(state),actor.id,actor.sessionId!,realm,p.mode,at+600000),audit(env.DB,actor,'qbo','qbo.consent',{revision:crypto.randomUUID(),source:'qbo.begin',reason:`${reason} Explicit company-bound read consent; provider accounting scope permits more than this adapter uses.`})])
 const url=new URL('https://appcenter.intuit.com/connect/oauth2');url.search=new URLSearchParams({client_id:config.id,response_type:'code',scope:'com.intuit.quickbooks.accounting',redirect_uri:config.redirect,state}).toString()
 return {authorizationUrl:url.href}
}
export async function qboCallback(env:Bindings,actor:Actor,url:URL) {
 qboOwner(actor)
 const state=url.searchParams.get('state')??'',realm=url.searchParams.get('realmId')??'',code=url.searchParams.get('code')??''
 const key=await digest(state),pending=await env.DB.prepare('SELECT * FROM bw_qbo_oauth WHERE digest=?').bind(key).first<any>()
 if(!pending||pending.owner_id!==actor.id||pending.session_id!==actor.sessionId||pending.expires_at<=(await now()).getTime()||pending.realm!==realm||!code||code.length>2048||url.searchParams.has('error'))fail('QBO_CALLBACK','QuickBooks authorization was cancelled, expired or did not match the reviewed company and owner session.',403)
 // Consume before exchanging the one-use code. A lost exchange requires fresh explicit consent.
 await commit(env.DB,actor,[env.DB.prepare('DELETE FROM bw_qbo_oauth WHERE digest=? AND expires_at>?').bind(key,(await now()).getTime()),changed(env.DB)])
 if(await qboConnection(env.DB))fail('QBO_CONNECTED','A company is already connected.',409)
 const token=await tokens(env,{grant_type:'authorization_code',code,redirect_uri:client(env).redirect}),revision=crypto.randomUUID()
 const secret=await sealWebhookSecret(env,'qbo:'+realm,JSON.stringify({access:token.access_token,refresh:token.refresh_token}))
 await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_qbo_connection VALUES(1,?,?,?,?,?,?,?)').bind(realm,pending.mode,'connected',secret,(await now()).getTime()+token.expires_in*1000,revision,actor.id),audit(env.DB,actor,'qbo','qbo.connected',{revision,source:'qbo.callback',reason:'Owner completed company-bound OAuth; encrypted credentials stay server-side and outside archives.'})])
 return new Response(null,{status:303,headers:{location:'/app?qbo=connected','cache-control':'no-store','referrer-policy':'no-referrer'}})
}
export async function qboAccess(env:Bindings,actor:Actor) {
 qboOwner(actor);let connection=await qboConnection(env.DB)
 if(!connection||connection.state!=='connected'||!connection.secret_cipher)fail('QBO_DISCONNECTED','Reconnect QuickBooks with explicit owner consent.',409)
 let secret=JSON.parse(await openWebhookSecret(env,'qbo:'+connection.realm,connection.secret_cipher))
 if(connection.expires_at<=(await now()).getTime()+30000) {
  // Refresh uses a lease so rotating provider credentials are never consumed twice concurrently.
  await commit(env.DB,actor,[qboGuard(env.DB,connection),env.DB.prepare("UPDATE bw_qbo_connection SET state='refreshing' WHERE singleton=1"),changed(env.DB)])
  try {
   const token=await tokens(env,{grant_type:'refresh_token',refresh_token:secret.refresh})
   secret={access:token.access_token,refresh:token.refresh_token}
   const cipher=await sealWebhookSecret(env,'qbo:'+connection.realm,JSON.stringify(secret))
   await commit(env.DB,actor,[qboGuard(env.DB,{...connection,state:'refreshing'}),env.DB.prepare("UPDATE bw_qbo_connection SET state='connected',secret_cipher=?,expires_at=? WHERE singleton=1").bind(cipher,(await now()).getTime()+token.expires_in*1000)])
   connection={...connection,state:'connected',secret_cipher:cipher}
  }catch(error){await env.DB.prepare("UPDATE bw_qbo_connection SET state='reconnect',secret_cipher='' WHERE revision=? AND state='refreshing'").bind(connection.revision).run();throw error}
 }
 return {connection,access:secret.access as string}
}
export async function qboQuery(env:Bindings,actor:Actor,kind:string,position=1) {
 if(!['Invoice','CompanyInfo',...qboKinds].includes(kind)||!Number.isSafeInteger(position)||position<1||position>100001)fail('QBO_QUERY','Use a supported bounded read.',400)
 const {connection,access}=await qboAccess(env,actor),host=connection.mode==='sandbox'?'sandbox-quickbooks.api.intuit.com':'quickbooks.api.intuit.com'
 const query=`select * from ${kind} orderby Id startposition ${position} maxresults 50`
 try {
  const result=await qboNetwork(`https://${host}/v3/company/${connection.realm}/query?`+new URLSearchParams({query,minorversion:'75'}),{headers:{Authorization:'Bearer '+access,Accept:'application/json'}})
  const rows=result.QueryResponse?.[kind]??[]
  if(!Array.isArray(rows)||rows.length>50||rows.some((r:any)=>!r||typeof r.Id!=='string'))fail('QBO_RESPONSE','QuickBooks did not return the expected bounded entity page.',409)
  return {connection,rows}
 } catch(error) { throw error }
}
export async function qboDisconnect(env:Bindings,actor:Actor,p:any) {
 qboOwner(actor);const c=await qboConnection(env.DB),reason=text(p.reason,'Disconnect reason',1000)
 if(!c||c.revision!==p.revision)fail('CHANGED','Refresh the current QuickBooks connection.')
 let refresh:string|null=null
 if(c.secret_cipher)refresh=JSON.parse(await openWebhookSecret(env,'qbo:'+c.realm,c.secret_cipher)).refresh
 // Local access ends first, even when provider revocation is unavailable.
 await commit(env.DB,actor,[qboGuard(env.DB,c),env.DB.prepare('DELETE FROM bw_qbo_connection WHERE singleton=1'),env.DB.prepare('DELETE FROM bw_qbo_oauth'),env.DB.prepare("UPDATE bw_qbo_runs SET state='disconnected',error='Owner disconnected; reconnect and start a newly reviewed read.' WHERE state<>'complete'"),audit(env.DB,actor,'qbo','qbo.disconnected',{revision:crypto.randomUUID(),source:'qbo.disconnect',reason})])
 let providerRevoked=false
 if(refresh) {try {const config=client(env);const r=await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+btoa(config.id+':'+config.secret),'content-type':'application/json'},body:JSON.stringify({token:refresh})});providerRevoked=r.ok}catch{}}
 await commit(env.DB,actor,[audit(env.DB,actor,'qbo','qbo.revocation-result',{revision:crypto.randomUUID(),source:'qbo.disconnect',reason:providerRevoked?'Provider acknowledged token revocation. Separate provider records remain.':'Local credentials removed. Provider revocation unconfirmed; revoke the app in QuickBooks. Separate provider records remain.'})])
 return {configured:false,providerRevoked,note:providerRevoked?'QuickBooks acknowledged revocation.':'Local access ended; revoke the app in QuickBooks because provider revocation is unconfirmed.'}
}
