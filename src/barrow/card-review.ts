import type { CardConnection } from './card-model'
import type { Order } from './model'

export function reviewedCard(config:CardConnection,order:Order,accountState:string,method:any,amountCents:number) {
 const jurisdiction=order.shipTo?.state??accountState,billing=method.billing_details?.address
 const funding=method.card?.funding??'unknown',state=billing?.country==='US'?billing.state??'':''
 const eligible=config.country==='US'&&order.currency==='USD'&&funding==='credit'&&state===jurisdiction&&JSON.parse(config.allowed_states).includes(state)&&!['CT','ME','MA','PR'].includes(state)
 return {surchargeCents:eligible?Number((BigInt(amountCents)*BigInt(config.surcharge_bps)+5000n)/10000n):0,card:{brand:method.card.brand,last4:method.card.last4,funding,state}}
}
