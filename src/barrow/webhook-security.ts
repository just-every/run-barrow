import type { Bindings } from '../auth.server'
import { fail } from './model'
const encoder=new TextEncoder()
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes))
const bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0))
async function custodyKey(env:Bindings) {
 const material=await crypto.subtle.digest('SHA-256',encoder.encode(`barrow.webhook.custody.v1:${env.SESSION_SECRET}`))
 return crypto.subtle.importKey('raw',material,'AES-GCM',false,['encrypt','decrypt'])
}
export async function sealWebhookSecret(env:Bindings,id:string,secret:string) {
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await custodyKey(env)
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(id)},key,encoder.encode(secret))
 return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`
}
export async function openWebhookSecret(env:Bindings,id:string,sealed:string) {
 const [iv,ciphertext]=sealed.split('.'),key=await custodyKey(env)
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(id)},key,bytes(ciphertext)))
}
export async function signWebhook(secret:string,id:string,timestamp:string,body:string) {
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return `v1,${base64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${id}.${timestamp}.${body}`))))}`
}
function publicHost(host:string) {
 return host.length<=253&&host.includes('.')&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)
  &&!host.split('.').some(label=>!label||label.length>63||label.startsWith('-')||label.endsWith('-'))
  &&!/^\d+(?:\.\d+)*$/.test(host)&&!/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|home|lan|arpa|localdomain)$/.test(host)
}
/** URL-level SSRF restrictions only. Native fetch follows no redirects; this does not
 * claim exhaustive DNS rebinding protection and adds no public DNS processor. */
export function webhookEndpoint(value:unknown) {
 let url:URL
 try {url=new URL(typeof value==='string'?value:'')}catch{fail('INPUT','Use a public HTTPS endpoint URL.',400)}
 if(url!.href.length>2048||url!.protocol!=='https:'||url!.username||url!.password||url!.search||url!.hash||url!.port&&url!.port!=='443'||!publicHost(url!.hostname))fail('INPUT','Use a public HTTPS hostname on port 443, without credentials, query or fragment.',400)
 return url!.href
}
