import { useEffect,useState } from 'react'
import { request,errorMessage } from './api'
import { money,day } from './types'
import type { Delivery,DeliveryOption } from '../shipping-rules'
export function QuoteShippingFields({quoteId,onChange,canQuote=true}:{canQuote?:boolean;quoteId:string;onChange:(value:Record<string,unknown>)=>void}) {
 const [options,setOptions]=useState<DeliveryOption[]>([]),[error,setError]=useState(''),[selected,setSelected]=useState('')
 const [freight,setFreight]=useState({cents:'',windowStart:'',windowEnd:'',reason:''}),[ownCarrierAccount,setOwnCarrierAccount]=useState('')
 useEffect(()=>{let live=true;void request<{options:DeliveryOption[]}>(`/api/barrow/shipping/options?quoteId=${encodeURIComponent(quoteId)}`).then(value=>{if(live)setOptions(value.options)}).catch(e=>{if(live)setError(errorMessage(e))});return()=>{live=false}},[quoteId])
 useEffect(()=>{const choice=options.find(o=>JSON.stringify([o.methodId,o.warehouse])===selected);onChange(choice?{shippingMethodId:choice.methodId,shippingWarehouse:choice.warehouse,ownCarrierAccount,...(choice.approvalRequired&&canQuote?{freightQuote:{methodId:choice.methodId,warehouse:choice.warehouse,...freight,cents:Number(freight.cents)}}:{})}:{})},[selected,freight,ownCarrierAccount,options,onChange,canQuote])
 useEffect(()=>{if(!canQuote&&options.some(o=>JSON.stringify([o.methodId,o.warehouse])===selected&&o.approvalRequired))setSelected('')},[canQuote,options,selected])
 const choice=options.find(o=>JSON.stringify([o.methodId,o.warehouse])===selected)
 if(!options.length&&!error)return null
 return <fieldset className="br-stack"><legend>Quoted delivery</legend>{error&&<p role="alert">{error}</p>}
  <label>Delivery method<select required value={selected} onChange={event=>{setSelected(event.target.value);const option=options.find(o=>JSON.stringify([o.methodId,o.warehouse])===event.target.value);setFreight({cents:'',windowStart:option?.windowStart??'',windowEnd:option?.windowEnd??'',reason:''})}}><option value="">Choose a delivery method</option>{options.map(o=><option disabled={o.approvalRequired&&!canQuote} key={JSON.stringify([o.methodId,o.warehouse])} value={JSON.stringify([o.methodId,o.warehouse])}>{o.name}{o.warehouse&&` · ${o.warehouse}`} · {o.totalCents===null?'quote required':money(o.totalCents)}</option>)}</select></label>
  {choice?.kind==='own-carrier'&&<label>Buyer carrier account reference<input required value={ownCarrierAccount} onChange={event=>setOwnCarrierAccount(event.target.value)} maxLength={100}/></label>}
  {!canQuote&&options.some(o=>o.approvalRequired)&&<p>A sales manager must quote delivery methods that require approval.</p>}
  {choice?.approvalRequired&&canQuote&&<><label>Quoted freight (USD cents, excluding handling)<input type="number" min="0" step="1" required value={freight.cents} onChange={event=>setFreight(value=>({...value,cents:event.target.value}))}/></label><label>Quoted window starts<input type="date" required value={freight.windowStart} onChange={event=>setFreight(value=>({...value,windowStart:event.target.value}))}/></label><label>Quoted window ends<input type="date" required value={freight.windowEnd} onChange={event=>setFreight(value=>({...value,windowEnd:event.target.value}))}/></label><label>Freight quote reason<input required maxLength={240} value={freight.reason} onChange={event=>setFreight(value=>({...value,reason:event.target.value}))}/></label></>}
  <p className="br-quiet-text">Rates are merchant-configured, not live carrier rates. Eligibility and free shipping are recalculated for the proposed quantities and prices.</p>
 </fieldset>
}
export function AgreedQuoteDelivery({delivery}:{delivery:Delivery}) {return <p>{delivery.name} · {money(delivery.totalCents??0)} delivery and handling · {day(delivery.windowStart)}–{day(delivery.windowEnd)}{delivery.warehouse&&` · ${delivery.warehouse}`}</p>}
