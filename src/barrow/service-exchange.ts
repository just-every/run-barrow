import type { Bindings } from '../auth.server'
import { digest } from './access'
import { requireActiveAccount } from './account-profile'
import { account } from './accounts'
import { orderBuyingProfile } from './buying-profiles'
import { now } from './clock'
import { fail, supplierDate, type Actor, type Line, type Order } from './model'
import { catalogue, pierOrigin } from './pier'
import { deliveryOptions, deliveryTotal, freightQuote, selectDelivery, shippingGuard } from './shipping'
import type { Delivery, FreightQuote } from './shipping-rules'
import { prepareLines } from './unit-lines'
import { quantityMicro } from './units'
import type { ServiceCase } from './service-resolution'

export type ExchangeOffer = {
 number: number; requestKey: string; requestFingerprint: string; basis: string;
 status: 'offered' | 'price-approved'; currency: Order['currency']; line: Line;
 originalMerchandiseCents: number; merchandiseCents: number; priceDifferenceCents: number;
 freightCents: number | null; delivery?: Delivery; freightQuotes?: FreightQuote[];
 termsDays: number; buyingProfile?: Order['buyingProfile']; accountRevision: string;
 orderRevision: string; proposedBy: string; proposedVersion: number; proposedAt: string; reason: string;
 buyerApproval?: { by: string; version: number; at: string; basis: string }
}

/** A priced proposal never reserves stock, issues credit, or accepts an exchange. */
export async function exchangePreview(env: Bindings, actor: Actor, order: Order, value: ServiceCase, p: any, retainedQuotes?: FreightQuote[], requireDelivery=true) {
 if(order.pierOrigin!==await pierOrigin(env))fail('PIER_CHANGED','Reconnect the original inventory authority before pricing a replacement.',409)
 const base=await account(env.DB,actor,order.accountId)
 const profile=await orderBuyingProfile(env.DB,actor,base,order)
 requireActiveAccount(profile.selected)
 const available=await catalogue(env,profile.selected),selected=available.account
 if(available.currency!==value.currency)fail('SERVICE_CURRENCY','A replacement must retain the original agreed currency and seller.',409)
 const line=prepareLines([{sku:p.sku,quantity:p.quantity,...(p.unit?{unit:p.unit}:{})}],available.items,supplierDate(await now()),false)[0]
 const originalTotal=value.basis.lineCents??value.basis.quantity*value.basis.unitCents
 const numerator=BigInt(originalTotal)*quantityMicro(value.quantity),denominator=quantityMicro(value.basis.quantity)
 if(numerator%denominator)fail('SERVICE_MONEY','The reported quantity has no exact whole-cent share of the original line. Resolve its commercial basis before offering an exchange.',409)
 const originalMerchandiseCents=Number(numerator/denominator),merchandiseCents=deliveryTotal([line])
 const context={currency:value.currency,account:selected,lines:[line],shipTo:order.shipTo}
 const quotes:FreightQuote[]|undefined=p.freightQuote?[await freightQuote(env,actor,context,p.freightQuote)]:retainedQuotes
 const shipping={...context,quotes},options=await deliveryOptions(env,shipping)
 const selection=p.delivery??(p.methodId?{methodId:p.methodId,warehouse:p.warehouse??'',ownCarrierAccount:p.ownCarrierAccount}:undefined)
 const option=selection?options.options.find(row=>row.methodId===selection.methodId&&row.warehouse===(selection.warehouse??'')):undefined
 const delivery=selection?await selectDelivery(env,shipping,{...selection,fingerprint:option?.fingerprint}):undefined
 if(requireDelivery&&options.required&&!delivery)fail('SHIPPING_REQUIRED','Select a binding replacement freight method and amount before offering the exchange.',409)
 // An installation with no rate book has no verified freight price, including zero.
 const freightCents=delivery?.totalCents??null
 const commercial={currency:value.currency,line,originalMerchandiseCents,merchandiseCents,priceDifferenceCents:merchandiseCents-originalMerchandiseCents,freightCents,delivery,termsDays:selected.value.termsDays,buyingProfile:selected.buyingProfile,accountRevision:selected.revision,orderRevision:order.revision}
 const basis=await digest(JSON.stringify(commercial))
 return {...commercial,basis,freightQuotes:quotes,deliveryOptions:options,guards:[profile.guard,shippingGuard(env.DB,delivery)],tax:'unverified' as const}
}

export async function revalidateExchange(env: Bindings, actor: Actor, order: Order, value: ServiceCase, offer: ExchangeOffer) {
 const proposer=await env.DB.prepare("SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin')").bind(offer.proposedBy,offer.proposedVersion).first()
 if(!proposer)fail('SERVICE_REVIEWER_REVOKED','The proposing supplier no longer holds the recorded authority. Ask a current reviewer for a new proposal.',409)
 const current=await exchangePreview(env,actor,order,value,{sku:offer.line.sku,unit:offer.line.unit,quantity:offer.line.quantity,delivery:offer.delivery},offer.freightQuotes)
 if(current.basis!==offer.basis)fail('SERVICE_EXCHANGE_CHANGED','Replacement prices, terms, seller, freight or the original order changed. Ask for a freshly reviewed proposal.',409)
 current.guards.push(env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin')) THEN 1 ELSE 0 END").bind(offer.proposedBy,offer.proposedVersion))
 return current
}
