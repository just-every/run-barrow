import type { Bindings } from '../auth.server'
import { fail } from './model'
import { openWebhookSecret } from './webhook-security'
import type { CardConnection } from './card-model'
export async function connection(env:Bindings) {
 const row=await env.DB.prepare('SELECT * FROM bw_card_connection WHERE singleton=1').first<CardConnection>()
 if(!row)fail('STRIPE_CONFIGURATION','The owner must connect Stripe before collecting a card payment.',409)
 return row
}
export async function stripe(key:string,path:string,values?:Record<string,string>,idempotency?:string) {
 let response:Response
 try {response=await fetch('https://api.stripe.com/v1'+path,{method:values?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2024-06-20',...(values?{'content-type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},...(values?{body:new URLSearchParams(values)}:{})})}
 catch {fail('STRIPE_UNCERTAIN','Stripe did not confirm the result. Refresh this same payment before retrying.',409)}
 let data:any
 try {data=await response!.json()}catch{fail('STRIPE_UNCERTAIN','Stripe returned an unreadable result. Refresh this same payment.',409)}
 if(!response!.ok) {
  if(data?.error?.payment_intent)return data.error.payment_intent
  fail('STRIPE_REFUSED','Stripe refused this request. Check the connection or payment state; no success is assumed.',409)
 }
 return data
}
export async function provider(env:Bindings,config?:CardConnection) {
 const selected=config??await connection(env)
 return {config:selected,call:async(path:string,values?:Record<string,string>,idempotency?:string)=>stripe(await openWebhookSecret(env,'stripe:key',selected.secret_cipher),path,values,idempotency)}
}
export function hostedUrl(value:unknown) {
 if(typeof value!=='string')return undefined
 try {const url=new URL(value);if(url.protocol==='https:'&&(url.hostname==='checkout.stripe.com'||url.hostname.endsWith('.stripe.com')))return url.href}catch{}
 return undefined
}
