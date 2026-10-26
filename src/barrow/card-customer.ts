import { cardInstallation } from './card-installation'
import type { Bindings } from '../auth.server'
import { provider } from './card-provider'
/** One opaque Stripe customer per trade account and merchant; no local contact fields are sent. */
export async function cardCustomer(env:Bindings,accountId:string) {
 const stripe=await provider(env),merchant=stripe.config.account_id
 const existing=await env.DB.prepare('SELECT customer_id FROM bw_card_customers WHERE account_id=? AND provider_account_id=?').bind(accountId,merchant).first<{customer_id:string}>()
 if(existing)return existing.customer_id
 const installationId=await cardInstallation(env.DB)
 const customer=await stripe.call('/customers',{'metadata[barrowAccountId]':accountId,'metadata[barrowInstallationId]':installationId},`barrow-customer-${installationId}-${merchant}-${accountId}`)
 await env.DB.prepare('INSERT OR IGNORE INTO bw_card_customers VALUES(?,?,?)').bind(accountId,merchant,customer.id).run()
 return (await env.DB.prepare('SELECT customer_id FROM bw_card_customers WHERE account_id=? AND provider_account_id=?').bind(accountId,merchant).first<{customer_id:string}>())!.customer_id
}
