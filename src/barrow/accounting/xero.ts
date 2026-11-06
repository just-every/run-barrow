import type { Bindings } from '../../auth.server'
import { audit, changed, commit } from '../access'
import { digest } from '../digest'
import { now } from '../clock'
import { fail, text, type Actor } from '../model'
import { sealWebhookSecret, openWebhookSecret } from '../webhook-security'

export const xeroKinds=['Contact','Item','Account','TaxCode'] as const
export type Connection={tenant:string;mode:string;state:string;secret_cipher:string;expires_at:number;revision:string;owner_id:string}
const scopes=['offline_access','accounting.invoices.read','accounting.contacts.read','accounting.settings.read']
const legacyInvoiceScope='accounting.transactions.read'
const authorityKey='barrow-xero/authority.json',callbackPath='/api/barrow/xero/callback'
export function xeroOwner(actor:Actor){if(actor.agent||actor.staff||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may connect or review Xero.',403)}
export async function xeroAuthority(env:Bindings,revision:string){
 if(!env.ERASURE_JOURNAL)fail('XERO_CUSTODY','Configure the independent custody journal before connecting Xero.')
 const record=await env.ERASURE_JOURNAL.get(authorityKey),value=record?await record.json<{revision:string;state:string}>():null
 if(value?.state!=='active'||value.revision!==revision)fail('XERO_REVOKED','This connection was revoked or restored without current independent authority. Disconnect and consent again.')
}
async function writeAuthority(env:Bindings,revision:string,state:string){
 if(!env.ERASURE_JOURNAL)fail('XERO_CUSTODY','Configure the independent custody journal before connecting Xero.')
 await env.ERASURE_JOURNAL.put(authorityKey,JSON.stringify({revision,state}))
}
export const xeroConnection=(db:D1Database)=>db.prepare('SELECT * FROM bw_xero_connection WHERE singleton=1').first<Connection>()
export function xeroGuard(db:D1Database,c:Connection){return db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_xero_connection WHERE singleton=1 AND revision=? AND state=?) THEN 1 ELSE 0 END').bind(c.revision,c.state)}
function client(env:Bindings){
 if(!env.XERO_CLIENT_ID||!env.XERO_CLIENT_SECRET)fail('XERO_CONFIGURATION','Configure the Xero client and registered callback in installation secrets.',409)
 if(!env.AUTH_ORIGIN.startsWith('https://')&&env.AUTH_LOCAL!=='true')fail('XERO_CONFIGURATION','Xero requires the registered public HTTPS callback.',409)
 return {id:env.XERO_CLIENT_ID,secret:env.XERO_CLIENT_SECRET,redirect:new URL(callbackPath,env.AUTH_ORIGIN).href}
}
export async function xeroNetwork(url:string,init:RequestInit={}){
 let response:Response
 try{response=await fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)})}catch{fail('XERO_UNAVAILABLE','Xero did not acknowledge this read. Resume the same correlation after checking the connection.',502)}
 if(!response!.ok)fail('XERO_REFUSED',`Xero refused the request (HTTP ${response!.status}); reconnect if authorization was revoked, then review and resume.`,409)
 const body=await response!.text();if(body.length>1000000)fail('XERO_RESPONSE','Xero exceeded the bounded response size.',409)
 try{return JSON.parse(body)}catch{fail('XERO_RESPONSE','Xero returned an unreadable response.',409)}
}
async function tokens(env:Bindings,fields:Record<string,string>){
 const config=client(env),result=await xeroNetwork('https://identity.xero.com/connect/token',{method:'POST',headers:{Authorization:'Basic '+btoa(config.id+':'+config.secret),'content-type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams(fields).toString()})
 if(typeof result.access_token!=='string'||!result.access_token||typeof result.refresh_token!=='string'||!result.refresh_token||!Number.isSafeInteger(result.expires_in)||result.expires_in<1||result.expires_in>86400)fail('XERO_RESPONSE','Xero did not return a complete bounded credential.',409)
 const granted=typeof result.scope==='string'?result.scope.trim().split(/\s+/):[]
 // Existing grants may retain the legacy read permission while tenants migrate.
 if(scopes.filter(scope=>scope!=='accounting.invoices.read').some(scope=>!granted.includes(scope))||!granted.some((scope:string)=>scope==='accounting.invoices.read'||scope===legacyInvoiceScope)||granted.some((scope:string)=>![...scopes,legacyInvoiceScope].includes(scope)))fail('XERO_SCOPE','Xero did not return the required reviewed read-only permissions.',409)
 return result
}
export async function xeroBegin(env:Bindings,actor:Actor,p:any){
 xeroOwner(actor);if(!env.ERASURE_JOURNAL)fail('XERO_CUSTODY','Configure the independent custody journal before connecting Xero.')
 const config=client(env),tenant=text(p.tenant,'Xero tenant ID',100).toLowerCase(),reason=text(p.reason,'Connection reason',1000)
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(tenant))fail('INPUT','Enter the exact Xero organisation tenant UUID.',400)
 if(p.consent!==true)fail('CONSENT','Review separate Xero custody and consent explicitly to this tenant and read-only scopes.',400)
 if(await xeroConnection(env.DB))fail('XERO_CONNECTED','Disconnect the existing tenant before replacing it.',409)
 const state=crypto.randomUUID()+crypto.randomUUID(),at=(await now()).getTime()
 await commit(env.DB,actor,[env.DB.prepare('DELETE FROM bw_xero_oauth WHERE owner_id=?').bind(actor.id),env.DB.prepare('INSERT INTO bw_xero_oauth VALUES(?,?,?,?,?,?)').bind(await digest(state),actor.id,actor.sessionId!,tenant,'read-only',at+600000),audit(env.DB,actor,'xero','xero.consent',{revision:crypto.randomUUID(),source:'xero.begin',reason:`${reason} Explicit tenant-bound consent to read-only scopes and separate provider custody.`})])
 const url=new URL('https://login.xero.com/identity/connect/authorize');url.search=new URLSearchParams({client_id:config.id,response_type:'code',scope:scopes.join(' '),redirect_uri:config.redirect,state}).toString();return {authorizationUrl:url.href}
}
export async function xeroCallback(env:Bindings,actor:Actor,url:URL){
 xeroOwner(actor)
 const pending=await env.DB.prepare('SELECT * FROM bw_xero_oauth WHERE digest=?').bind(await digest(url.searchParams.get('state')??'')).first<any>(),code=url.searchParams.get('code')??''
 if(!pending||pending.owner_id!==actor.id||pending.session_id!==actor.sessionId||pending.expires_at<=(await now()).getTime()||!code||code.length>2048||url.searchParams.has('error'))fail('XERO_CALLBACK','Xero authorization was cancelled, expired or did not match the reviewed owner session.',403)
 await commit(env.DB,actor,[env.DB.prepare('DELETE FROM bw_xero_oauth WHERE digest=? AND expires_at>?').bind(pending.digest,(await now()).getTime()),changed(env.DB)])
 if(await xeroConnection(env.DB))fail('XERO_CONNECTED','A tenant is already connected.',409)
 const token=await tokens(env,{grant_type:'authorization_code',code,redirect_uri:client(env).redirect})
 const connections=await xeroNetwork('https://api.xero.com/connections',{headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'}})
 if(!Array.isArray(connections)||connections.length>100)fail('XERO_RESPONSE','Xero returned an invalid connection list.',409)
 const matches=connections.filter((c:any)=>c.tenantId===pending.tenant&&c.tenantType==='ORGANISATION'&&typeof c.id==='string'&&/^[a-f0-9-]{36}$/i.test(c.id))
 if(matches.length!==1)fail('XERO_TENANT','Consent did not grant exactly the reviewed organisation tenant. Review the Xero app connections and consent again.',403)
 const revision=crypto.randomUUID(),secret=await sealWebhookSecret(env,'xero:'+pending.tenant,JSON.stringify({access:token.access_token,refresh:token.refresh_token,connectionId:matches[0].id}))
 await writeAuthority(env,revision,'active')
 await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_xero_connection VALUES(1,?,?,?,?,?,?,?)').bind(pending.tenant,'read-only','connected',secret,(await now()).getTime()+token.expires_in*1000,revision,actor.id),audit(env.DB,actor,'xero','xero.connected',{revision,source:'xero.callback',reason:'Owner completed OAuth and the provider connection list confirmed the reviewed tenant. Encrypted credentials stay outside archives.'})])
 return new Response(null,{status:303,headers:{location:'/app?xero=connected','cache-control':'no-store','referrer-policy':'no-referrer'}})
}
export async function xeroAccess(env:Bindings,actor:Actor){
 xeroOwner(actor);let connection=await xeroConnection(env.DB)
 if(!connection||connection.state!=='connected'||!connection.secret_cipher)fail('XERO_DISCONNECTED','Reconnect Xero with explicit owner consent.',409)
 await xeroAuthority(env,connection.revision)
 let secret=JSON.parse(await openWebhookSecret(env,'xero:'+connection.tenant,connection.secret_cipher))
 if(connection.expires_at<=(await now()).getTime()+30000){
  await commit(env.DB,actor,[xeroGuard(env.DB,connection),env.DB.prepare("UPDATE bw_xero_connection SET state='refreshing' WHERE singleton=1"),changed(env.DB)])
  try{
   const token=await tokens(env,{grant_type:'refresh_token',refresh_token:secret.refresh});secret={...secret,access:token.access_token,refresh:token.refresh_token}
   const cipher=await sealWebhookSecret(env,'xero:'+connection.tenant,JSON.stringify(secret))
   await xeroAuthority(env,connection.revision)
   await commit(env.DB,actor,[xeroGuard(env.DB,{...connection,state:'refreshing'}),env.DB.prepare("UPDATE bw_xero_connection SET state='connected',secret_cipher=?,expires_at=? WHERE singleton=1").bind(cipher,(await now()).getTime()+token.expires_in*1000),audit(env.DB,actor,'xero','xero.credential-rotated',{revision:connection.revision,source:'xero.refresh',reason:'Rotated encrypted server-only read credentials under the original tenant consent.'})]);connection={...connection,state:'connected',secret_cipher:cipher}
  }catch(error){await env.DB.prepare("UPDATE bw_xero_connection SET state='reconnect',secret_cipher='' WHERE revision=? AND state='refreshing'").bind(connection.revision).run();throw error}
 }
 return {connection,access:secret.access as string}
}
function instant(value:unknown){
 const raw=String(value??''),match=/^\/Date\((\d+)(?:[+-]\d{4})?\)\/$/.exec(raw),at=match?Number(match[1]):Date.parse(raw)
 if(!Number.isFinite(at)||!Number.isFinite(new Date(at).getTime()))fail('XERO_DATE','Xero did not supply a valid financial instant.',409)
 return new Date(at).toISOString()
}
function day(value:unknown){return instant(value).slice(0,10)}
export async function xeroQuery(env:Bindings,actor:Actor,kind:string,position=1){
 if(!['Invoice',...xeroKinds].includes(kind as any)||!Number.isSafeInteger(position)||position<1||position>2001)fail('XERO_QUERY','Use a supported bounded read.',400)
 const {connection,access}=await xeroAccess(env,actor)
 const resource=({Contact:'Contacts',Item:'Items',Account:'Accounts',TaxCode:'TaxRates',Invoice:'Invoices'} as Record<string,string>)[kind]
 const params=new URLSearchParams()
 if(kind==='Invoice'||kind==='Contact'){params.set('page',String(position));params.set('pageSize','50');params.set('order',kind==='Invoice'?'InvoiceID':'ContactID')}
 if(kind==='Invoice'){params.set('where','Type=="ACCREC" AND (Status=="AUTHORISED" OR Status=="PAID" OR Status=="VOIDED")');params.set('summaryOnly','false')}
 const result=await xeroNetwork('https://api.xero.com/api.xro/2.0/'+resource+(params.size?'?'+params:''),{headers:{Authorization:'Bearer '+access,'xero-tenant-id':connection.tenant,Accept:'application/json'}})
 let raw=result[resource]
 if(!Array.isArray(raw)||raw.length>((kind==='Invoice'||kind==='Contact')?50:1000))fail('XERO_RESPONSE','Xero did not return the expected bounded entity page.',409)
 // Items, accounts and tax rates are bounded reference snapshots, then locally paged.
 if(kind!=='Invoice'&&kind!=='Contact')raw=raw.slice((position-1)*50,position*50)
 const rows=await Promise.all(raw.map(async(r:any)=>{
  if(!r||typeof r!=='object')fail('XERO_RESPONSE','Xero returned an invalid entity.',409)
  if(kind==='Invoice'){
   if(r.Type!=='ACCREC'||!['AUTHORISED','PAID','VOIDED'].includes(r.Status))fail('XERO_RESPONSE','Only issued or voided receivable invoices are supported.',409)
   const canonical={Id:r.InvoiceID,ContactRef:{value:r.Contact?.ContactID},CurrencyRef:{value:r.CurrencyCode},TxnDate:day(r.Date),DueDate:day(r.DueDate??r.Date),TotalAmt:r.Total,Balance:r.AmountDue,Line:(r.LineItems??[]).map((l:any)=>({SalesItemLineDetail:{ItemRef:{value:l.ItemCode}},AccountRef:{value:l.AccountCode},TaxCodeRef:{value:l.TaxType}})),MetaData:{LastUpdatedTime:instant(r.UpdatedDateUTC)},Status:r.Status}
   const financialLines=(r.LineItems??[]).map((l:any)=>({item:l.ItemCode??null,account:l.AccountCode??null,taxType:l.TaxType??null,quantity:l.Quantity??null,unitAmount:l.UnitAmount??null,lineAmount:l.LineAmount??null,taxAmount:l.TaxAmount??null,discountRate:l.DiscountRate??null,discountAmount:l.DiscountAmount??null}))
   const narrativeToken=await digest(JSON.stringify({reference:r.Reference??null,number:r.InvoiceNumber??null,descriptions:(r.LineItems??[]).map((l:any)=>l.Description??null)}))
   const commercial={narrativeToken,contact:canonical.ContactRef.value,currency:r.CurrencyCode,date:canonical.TxnDate,due:canonical.DueDate,total:r.Total,subTotal:r.SubTotal??null,totalTax:r.TotalTax??null,lineAmountTypes:r.LineAmountTypes??null,lines:financialLines}
   return {...canonical,CommercialToken:await digest(JSON.stringify(commercial)),SyncToken:await digest(JSON.stringify({...canonical,financialLines}))}
  }
  const Id=kind==='Contact'?r.ContactID:kind==='Item'?r.Code:kind==='Account'?(r.Code||r.AccountID):r.TaxType
  const active=kind==='Contact'?r.ContactStatus==='ACTIVE':kind==='Account'?r.Status==='ACTIVE':kind==='TaxCode'?r.Status==='ACTIVE':true
  // Fingerprint only reviewed reference facts; never retain provider contact text.
  return {Id,Active:active,SyncToken:await digest(JSON.stringify({Id,active,updated:r.UpdatedDateUTC??null,account:r.AccountID??null,rate:r.EffectiveRate??null,type:r.Type??null,details:kind==='Item'?r.SalesDetails??null:null}))}
 }))
 if(rows.some(r=>typeof r.Id!=='string'||!r.Id))fail('XERO_RESPONSE','Xero omitted a required source identity.',409)
 await xeroAuthority(env,connection.revision)
 return {connection,rows}
}
export async function xeroDisconnect(env:Bindings,actor:Actor,p:any){
 xeroOwner(actor);const c=await xeroConnection(env.DB),reason=text(p.reason,'Disconnect reason',1000)
 if(!c||c.revision!==p.revision)fail('CHANGED','Refresh the current Xero connection.')
 const secret=c.secret_cipher?JSON.parse(await openWebhookSecret(env,'xero:'+c.tenant,c.secret_cipher)):null
 await writeAuthority(env,crypto.randomUUID(),'revoked')
 await commit(env.DB,actor,[xeroGuard(env.DB,c),env.DB.prepare('DELETE FROM bw_xero_connection WHERE singleton=1'),env.DB.prepare('DELETE FROM bw_xero_oauth'),env.DB.prepare("UPDATE bw_xero_runs SET state='disconnected',error='Owner disconnected; reconnect and start a newly reviewed read.' WHERE state<>'complete'"),audit(env.DB,actor,'xero','xero.disconnected',{revision:crypto.randomUUID(),source:'xero.disconnect',reason})])
 let providerRevoked=false
 if(secret)try{const response=await fetch('https://api.xero.com/connections/'+encodeURIComponent(secret.connectionId),{method:'DELETE',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+secret.access}});providerRevoked=response.ok}catch{}
 await commit(env.DB,actor,[audit(env.DB,actor,'xero','xero.revocation-result',{revision:crypto.randomUUID(),source:'xero.disconnect',reason:providerRevoked?'Provider acknowledged tenant disconnection. Separate provider records remain.':'Local credentials removed. Provider disconnection unconfirmed; revoke the app in Xero. Separate provider records remain.'})])
 return {configured:false,providerRevoked,note:providerRevoked?'Xero acknowledged revocation.':'Local access ended; revoke the app in Xero because provider disconnection is unconfirmed.'}
}
