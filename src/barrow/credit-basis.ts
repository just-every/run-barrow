import type { Bindings } from '../auth.server'
import { commissionSources } from './commission-source'
import { decimal,pierOrigin,pierState } from './pier'
import { digest } from './digest'
import { fail,integer,text,type Order } from './model'
import type { CreditLine,CreditNote } from './credit-model'
export async function creditSource(env:Bindings,order:Order,p:any) {
 const kind=p.kind??'return'
 if(!['return','price-correction','cancellation'].includes(kind))fail('CREDIT_KIND','Choose a return, price correction or confirmed cancellation.',400)
 if(kind==='price-correction')return {kind:kind as 'price-correction',sourceId:`price-correction:${order.id}:${text(p.sourceReference,'Price correction reference')}`,source:undefined,received:undefined}
 const [state,origin]=await Promise.all([pierState(env),pierOrigin(env)])
 let sources:ReturnType<typeof commissionSources>
 try{sources=commissionSources(order,state,origin)}catch{fail('RETURN_SOURCE','The connected source does not reconcile with the original approved order.',409)}
 if(kind==='cancellation') {
  if(order.status!=='cancelled'||!order.release?.confirmedAt)fail('CANCELLATION_SOURCE','Only a confirmed original-order cancellation may be credited.',409)
  return {kind:kind as 'cancellation',sourceId:`cancellation:${order.id}`,source:sources,received:undefined}
 }
 const sourceId=text(p.returnId,'Physical return receipt'),received=state.returns.find((row:any)=>row.id===sourceId)
 if(!received||!sources.get(received.itemId)?.returnIds.includes(sourceId))fail('RETURN_SOURCE','Use a received Pier return linked to this order and shipment.',409)
 return {kind:kind as 'return',sourceId,source:sources,received}
}
export async function creditBasis(env:Bindings,order:Order,p:any,previous:CreditNote[]) {
 const source=await creditSource(env,order,p),kind=source.kind
 if(!Array.isArray(p.lines)||!p.lines.length||new Set(p.lines.map((row:any)=>row.line)).size!==p.lines.length)fail('CREDIT_LINES','Choose distinct original invoice lines and quantities.',400)
 let used=0n
 const lines:CreditLine[]=p.lines.map((entry:any)=>{
  const number=integer(entry.line,'Original line',1,order.lines.length),basis=order.lines[number-1],quantity=integer(entry.quantity,'Credited selling units',1,basis.quantity)
  const prior=previous.filter(row=>row.orderId===order.id).flatMap(note=>note.lines.filter(line=>line.line===number).map(line=>({kind:note.kind??'return',line})))
  const physical=prior.filter(row=>row.kind!=='price-correction').reduce((sum,row)=>sum+row.line.quantity,0),credited=prior.reduce((sum,row)=>sum+row.line.amountCents,0),remaining=basis.lineCents!-credited
  if(quantity>basis.quantity-physical||remaining<=0)fail('CREDIT_LIMIT','Total credit exceeds the original accepted line units or remaining value.',409)
  const baseUnits=decimal(basis.baseQuantity??String(basis.quantity)),numerator=baseUnits*BigInt(quantity)
  if(numerator%BigInt(basis.quantity)!==0n)fail('CREDIT_UNITS','Selling units must map exactly to the original physical units.',409)
  const units=numerator/BigInt(basis.quantity)
  if(kind==='return'){if(basis.itemId!==source.received.itemId)fail('RETURN_SOURCE','Credit lines must name this physical return’s item.',409);used+=units}
  if(kind==='cancellation') {
   const cancelled=source.source?.get(basis.itemId)?.cancelled??0n,priorUnits=previous.filter(note=>note.orderId===order.id&&note.kind==='cancellation').flatMap(note=>note.lines).filter(line=>line.basis.itemId===basis.itemId).reduce((sum,line)=>sum+decimal(line.basis.baseQuantity??String(line.basis.quantity))*BigInt(line.quantity)/BigInt(line.basis.quantity),0n)
   if(units+priorUnits>cancelled)fail('CREDIT_LIMIT','Credit units exceed verified cancelled units.',409)
  }
  const proportional=Number((BigInt(remaining)*BigInt(quantity)+BigInt(basis.quantity-physical)/2n)/BigInt(basis.quantity-physical))
  const amountCents=kind==='price-correction'?integer(entry.amountCents,'Price correction cents',1,proportional):proportional
  return {line:number,sku:basis.sku,quantity,amountCents,basis,...(basis.substitutedFrom?{original:basis.substitutedFrom}:{})}
 })
 if(kind==='return'&&used>decimal(source.received.quantity))fail('CREDIT_LIMIT','Credit units exceed the verified physical return receipt.',409)
 const freightCents=integer(p.freightCents??0,'Freight credit cents'),taxCents=integer(p.taxCents??0,'Tax credit cents')
 if(taxCents!==0)fail('TAX_UNVERIFIED','The original invoice has no verified tax amount; tax corrections require its tax-provider transaction.',409)
 const priorFreight=previous.filter(note=>note.orderId===order.id).reduce((sum,note)=>sum+(note.freightCents??0),0)
 if(freightCents>(order.delivery?.totalCents??0)-priorFreight)fail('CREDIT_FREIGHT','Freight credit exceeds the original accepted delivery and handling basis.',409)
 const amountCents=lines.reduce((sum,line)=>sum+line.amountCents,0)+freightCents
 if(amountCents<=0)fail('CREDIT_AMOUNT','The credit must have a positive original commercial value.',409)
 const key=kind==='return'?source.sourceId:await digest(JSON.stringify([order.id,kind,source.sourceId]))
 return {...source,id:`credit-${key}`,lines,freightCents,taxCents,amountCents}
}
