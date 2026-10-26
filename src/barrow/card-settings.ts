import type { Bindings } from '../auth.server'
import { audit,commit } from './access'
import { fail,text,type Actor } from './model'
import { sealWebhookSecret } from './webhook-security'
import { provider,stripe } from './card-provider'
const prohibited=new Set(['CT','ME','MA','PR'])
const statesOfUs=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '))
export function cardOwner(actor:Actor) {if(actor.agent||actor.role!=='owner'||actor.staff)fail('FORBIDDEN','Only the signed-in owner may connect Stripe.',403)}
export function cardMerchant(actor:Actor) {if(actor.agent||!['owner','admin'].includes(actor.role)||actor.staff)fail('FORBIDDEN','Only the supplier owner or admin may capture or cancel card payments.',403)}
export async function cardSettings(env:Bindings,actor:Actor) {
 cardOwner(actor)
 const value=await env.DB.prepare('SELECT account_id,livemode,revision,surcharge_bps,allowed_states FROM bw_card_connection WHERE singleton=1').first<any>()
 return {configured:!!value,mode:value?.livemode?'live':'test',accountId:value?.account_id,revision:value?.revision,surchargeBps:value?.surcharge_bps??0,allowedStates:JSON.parse(value?.allowed_states??'[]')}
}
export async function cardConfiguration(env:Bindings,actor:Actor,type:string,p:any) {
 cardOwner(actor)
 const reason=text(p.reason,'Connection reason',1000),revision=crypto.randomUUID()
 if(type==='card.disconnect') {
  const current=await provider(env)
  // Revoke delivery before removing local custody; a failed revocation remains actionable.
  const key=await import('./webhook-security').then(m=>m.openWebhookSecret(env,'stripe:key',current.config.secret_cipher))
  const response=await fetch(`https://api.stripe.com/v1/webhook_endpoints/${current.config.webhook_id}`,{method:'DELETE',headers:{Authorization:`Bearer ${key}`}})
  if(!response.ok)fail('STRIPE_REFUSED','Stripe did not confirm webhook revocation. Connection custody remains.',409)
  await commit(env.DB,actor,[env.DB.prepare('DELETE FROM bw_card_connection WHERE singleton=1'),audit(env.DB,actor,'stripe','card.disconnected',{revision,source:type,reason})])
  return {configured:false}
 }
 if(p.consent!==true)fail('CONSENT','Explicitly consent to Stripe holding separate card and payment records.',400)
 const key=text(p.secretKey,'Stripe secret key',500)
 const live=p.mode==='live'
 if(p.mode!==undefined&&!['test','live'].includes(p.mode))fail('STRIPE_MODE','Select test or live mode explicitly.',400)
 const bps=Number(p.surchargeBps??0),states=p.allowedStates??[]
 if(!Number.isInteger(bps)||bps<0||bps>300||!Array.isArray(states)||states.some((s:any)=>typeof s!=='string'||!statesOfUs.has(s)||prohibited.has(s)))fail('SURCHARGE','Use up to 300 basis points and explicitly permitted US states. CT, ME, MA and PR are refused.',400)
 if(await env.DB.prepare('SELECT 1 FROM bw_card_connection').first())fail('CONNECTION','Disconnect the existing Stripe connection before replacing it.',409)
 const [account,balance]=await Promise.all([stripe(key,'/account'),stripe(key,'/balance')])
 if(balance.livemode!==live||!account.id)fail('STRIPE_MODE','The Stripe key does not match the explicitly selected mode.',400)
 if(bps>0&&account.country!=='US')fail('SURCHARGE','Card surcharges require a verified US Stripe merchant and permitted US state.',400)
 const origin=env.AUTH_LOCAL==='true'&&env.CARD_WEBHOOK_ORIGIN?env.CARD_WEBHOOK_ORIGIN:env.AUTH_ORIGIN
 if(!origin.startsWith('https://'))fail('STRIPE_ENDPOINT','Stripe needs this installation’s public HTTPS webhook address.',400)
 const endpoint=await stripe(key,'/webhook_endpoints',{url:new URL('/api/barrow/card-webhook',origin).href,'enabled_events[0]':'payment_intent.amount_capturable_updated','enabled_events[1]':'payment_intent.succeeded','enabled_events[2]':'payment_intent.payment_failed','enabled_events[3]':'payment_intent.canceled','enabled_events[4]':'refund.created','enabled_events[5]':'refund.updated','enabled_events[6]':'refund.failed','metadata[barrow]':'card-checkout'},`barrow-connect-${revision}`)
 if(!endpoint.secret||!endpoint.id)fail('STRIPE_ENDPOINT','Stripe did not create a signing endpoint.',409)
 const secret=await sealWebhookSecret(env,'stripe:key',key),webhook=await sealWebhookSecret(env,'stripe:webhook',endpoint.secret)
 try {
 await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_card_connection VALUES(1,?,?,?,?,?,?,?,?,?)').bind(account.id,account.country??'',live?1:0,secret,webhook,endpoint.id,revision,bps,JSON.stringify([...new Set(states)])),audit(env.DB,actor,'stripe','card.connected',{revision,source:type,reason:`${reason} Explicit owner consent to separate Stripe custody; ${bps} surcharge basis points in ${states.join(', ')||'no states'}; ${live?'live':'test'} mode, no card numbers retained.`})])
 } catch(error) {
  await fetch(`https://api.stripe.com/v1/webhook_endpoints/${endpoint.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${key}`}})
  throw error
 }
 return cardSettings(env,actor)
}
