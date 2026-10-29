import { fail, type Actor, type Order } from './model'
import { staffAccountAllowed } from './staff-policy'

export const returnReviewer=(actor:Actor)=>!actor.agent&&(!actor.staff&&['owner','admin'].includes(actor.role)||actor.staff?.role==='operations'&&(actor.staff.returnLimitCents??0)>0)
export function reviewReturn(actor:Actor) {
 if(!returnReviewer(actor))fail('FORBIDDEN','An owner, admin or explicitly entitled operations reviewer must review returns.',403)
}
export function returnWarehouseAuthority(actor:Actor,warehouses:string[]) {
 if(actor.staff?.role==='operations'&&actor.staff.warehouses!=='all'&&(!warehouses.length||warehouses.some(warehouse=>!actor.staff!.warehouses.includes(warehouse))))fail('FORBIDDEN','Every source warehouse must be within your current return grant.',403)
}
export function returnWarehouses(order:Order,state:any,itemId?:string) {
 const shipments=state.shipments.filter((row:any)=>row.orderId===order.pierOrderId)
 const locations=new Set<string>(shipments.flatMap((shipment:any)=>shipment.lines.filter((line:any)=>!itemId||line.itemId===itemId).flatMap((line:any)=>(line.reservations??[]).map((row:any)=>row.locationId))))
 const shipmentIds=new Set(shipments.map((row:any)=>row.id))
 for(const receipt of state.returns.filter((row:any)=>shipmentIds.has(row.shipmentId)&&(!itemId||row.itemId===itemId)))locations.add(receipt.locationId)
 return [...locations].map(id=>state.locations?.find((row:any)=>row.id===id)?.warehouse??'Unknown warehouse').filter((value,index,all)=>all.indexOf(value)===index).sort() as string[]
}
export function returnAmountAuthority(actor:Actor,claim:{accountId:string;currency?:string;basis:Order['lines'][number]},quantity:number) {
 if(!actor.staff)return
 const grant=actor.staff,limit=grant.returnLimitCents??0
 if(!Number.isSafeInteger(claim.basis.lineCents)||claim.basis.lineCents!<0)fail('RETURN_SOURCE','The original accepted monetary basis is unavailable.',409)
 const amount=(BigInt(claim.basis.lineCents!)*BigInt(quantity)+BigInt(claim.basis.quantity)-1n)/BigInt(claim.basis.quantity)
 if(grant.role!=='operations'||!staffAccountAllowed(grant,claim.accountId)||claim.currency!=='USD'||!limit||amount>BigInt(limit))fail('FORBIDDEN','The approved original-price return value exceeds your explicit USD return allowance or account scope.',403)
}
