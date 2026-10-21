import type { Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'
import { digest } from './access'
import { applicationRow } from './application-records'
import { fail } from './model'
const encoder=new TextEncoder()
async function signature(env:Bindings,value:string) {
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('')
}
export async function formToken(env:Bindings) {
 const value=`${Date.now()}.${crypto.randomUUID()}`
 return value+'.'+await signature(env,value)
}
export async function spamCheck(request:Request,env:Bindings,p:any) {
 const [at,nonce,mac]=String(p.formToken??'').split('.'),value=`${at}.${nonce}`,age=Date.now()-Number(at)
 if(p.website||!nonce||!Number.isFinite(age)||age<3000||age>86400000||mac!==await signature(env,value))fail('SPAM_CHECK','Spam checks refused the form. Wait three seconds after opening it and try again.',400)
 if(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET) {
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:typeof p.turnstileToken==='string'?p.turnstileToken:''})})
  const result=await response.json() as any
  if(!response.ok||result.success!==true||result.hostname!==new URL(env.AUTH_ORIGIN).hostname)fail('SPAM_CHECK','Complete the spam check and try again.',400)
 }
 if(p.consent!==true)fail('CONSENT','Consent to application review is required.',400)
 const digest=await signature(env,`intake:${Math.floor(Date.now()/3600000)}:${request.headers.get('CF-Connecting-IP')??'unknown'}`)
 const rate=await env.DB.prepare('SELECT count FROM bw_application_rates WHERE digest=? AND expires_at>?').bind(digest,Date.now()).first<{count:number}>()
 if((rate?.count??0)>=5)fail('SPAM_CHECK','Spam checks limit applications to five per hour. Try later.',429)
 return env.DB.prepare('INSERT INTO bw_application_rates VALUES(?,1,?) ON CONFLICT(digest) DO UPDATE SET count=count+1').bind(digest,Date.now()+3600000)
}
export const applicationsOpen=(env:Bindings)=>!!env.MAIL_FROM&&((env.MAIL_PROVIDER==='development'&&env.AUTH_LOCAL==='true')||(env.MAIL_PROVIDER==='resend'&&!!env.MAIL_API_KEY))
export async function sendApplicationCode(env:Bindings,id:string,email:string) {
 const number=new Uint32Array(1);crypto.getRandomValues(number)
 let code=String(number[0]%1000000).padStart(6,'0'),hash=await digest(`${id}:${code}`)
 const prior=await env.DB.prepare('SELECT code_hash FROM bw_application_codes WHERE application_id=?').bind(id).first<{code_hash:string}>()
 if(prior?.code_hash===hash){code=String((Number(code)+1)%1000000).padStart(6,'0');hash=await digest(`${id}:${code}`)}
 await env.DB.prepare('INSERT INTO bw_application_codes VALUES(?,?,?,0) ON CONFLICT(application_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0').bind(id,hash,Date.now()+600000).run()
 let status='uncertain',providerMessageId:string|null=null
 try {
  const result=await operatorMail(env)?.send({deliveryId:crypto.randomUUID(),from:env.MAIL_FROM!,to:[email],subject:'Verify your trade application',html:'<p>Use the one-use code in the plain-text message to verify your trade application.</p>',text:`Your one-use application code is ${code}. It expires in 10 minutes. Open ${env.AUTH_ORIGIN}/apply?application=${id} to verify or check your application.`,headers:{}})
  status=result?.status??'not configured';providerMessageId=result?.providerMessageId??null
 }catch{status='failed'}
 await env.DB.prepare('INSERT INTO bw_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'application','application.code-send-result',new Date().toISOString(),JSON.stringify({revision:id,source:'application.code',reason:`Code send result: ${env.MAIL_PROVIDER==='development'?'development, not delivered':status}; provider ID ${providerMessageId??'not recorded'}.`})).run()
 return {status:env.MAIL_PROVIDER==='development'?'development, not delivered':status}
}
export async function applicant(request:Request,env:Bindings,id?:string) {
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)barrow_application=([^;]+)/)?.[1]
 const session=token?await env.DB.prepare('SELECT application_id FROM bw_application_sessions WHERE digest=? AND expires_at>?').bind(await digest(token),Date.now()).first<{application_id:string}>():null
 if(!session||(id&&session.application_id!==id))fail('APPLICATION_AUTH','Verify your email to read this application.',401)
 return applicationRow(env.DB,session.application_id)
}
export async function verifyApplication(env:Bindings,id:string,code:unknown) {
 const row=await applicationRow(env.DB,id)
 const saved=await env.DB.prepare('SELECT * FROM bw_application_codes WHERE application_id=?').bind(id).first<any>()
 if(!saved||saved.expires_at<=Date.now()||saved.attempts>=5)fail('APPLICATION_CODE','Request a new application code.',401)
 if(!/^\d{6}$/.test(String(code))||await digest(`${id}:${code}`)!==saved.code_hash) {
  await env.DB.prepare('UPDATE bw_application_codes SET attempts=attempts+1 WHERE application_id=? AND code_hash=?').bind(id,saved.code_hash).run()
  fail('APPLICATION_CODE','Incorrect application code.',401)
 }
 const token=crypto.randomUUID()+crypto.randomUUID(),at=new Date().toISOString(),revision=crypto.randomUUID()
 await env.DB.batch([
  env.DB.prepare('DELETE FROM bw_application_codes WHERE application_id=? AND code_hash=? AND expires_at>? AND attempts<5').bind(id,saved.code_hash,Date.now()),env.DB.prepare('INSERT INTO bw_guard VALUES(changes())'),
  env.DB.prepare('INSERT INTO bw_application_sessions VALUES(?,?,?)').bind(await digest(token),id,Date.now()+86400000),
  ...(row.state==='unverified'?[env.DB.prepare("INSERT INTO bw_applications VALUES(?,?,?,'submitted',NULL,?,?)").bind(id,JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(row.value_json)).filter(([key])=>key!=='documents'))),revision,row.created_at,at),...((JSON.parse(row.value_json).documents??[]) as any[]).map(doc=>env.DB.prepare('INSERT INTO bw_application_documents VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,doc.name,doc.type,doc.size,doc.sha256,doc.contentBase64,at)),...((JSON.parse(row.value_json).documents??[]) as any[]).map(doc=>env.DB.prepare('INSERT INTO bw_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'applicant','application.document-added',at,JSON.stringify({revision,source:'application.verify',reason:`Verified application document SHA-256 ${doc.sha256}.`}))),env.DB.prepare('DELETE FROM bw_application_intake WHERE id=?').bind(id),env.DB.prepare('INSERT INTO bw_application_history VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'submitted','Email verified; application submitted.','applicant',at)]:[]),
  env.DB.prepare('INSERT INTO bw_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'application','application.verified',at,JSON.stringify({revision,source:'application.verify',reason:'Applicant verified the contact email; no membership or account granted.'})),env.DB.prepare('DELETE FROM bw_guard')])
 return `barrow_application=${token}; Path=/api/barrow/applications; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
}
