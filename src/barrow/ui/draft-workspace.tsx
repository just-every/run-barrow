import { useEffect, useState, type ComponentProps } from 'react'
import { OrderPad } from './order-pad'
import { request, errorMessage } from './api'
import { money, orderNumber, when, type Order } from './types'

type Props = Omit<ComponentProps<typeof OrderPad>, 'draft'> & { draftId:string; version:unknown }
/** Keep the pad's complete draft collection reachable without loading it all on every command. */
export function DraftWorkspace({draftId,version,...props}: Props) {
 const [page,setPage]=useState(1),[drafts,setDrafts]=useState<Order[]>([]),[hasNext,setHasNext]=useState(false)
 const [selected,setSelected]=useState<Order|undefined>(),[loading,setLoading]=useState(false),[error,setError]=useState('')
 useEffect(()=>{setPage(1)},[props.account.id])
 useEffect(()=>{
  let current=true;setLoading(true);setError('');setDrafts([]);setHasNext(false)
  void request<{orders:Order[];hasNext:boolean}>(`/api/barrow/orders/history?${new URLSearchParams({status:'draft',accountId:props.account.id,page:String(page)})}`)
   .then(value=>{if(current){setDrafts(value.orders);setHasNext(value.hasNext)}}).catch(cause=>{if(current)setError(errorMessage(cause))}).finally(()=>{if(current)setLoading(false)})
  return ()=>{current=false}
 },[props.account.id,page,version])
 useEffect(()=>{
  let current=true;setSelected(undefined)
  if(draftId)void request<Order>(`/api/barrow/orders/${encodeURIComponent(draftId)}`).then(order=>{if(current){if(order.status==='draft' && order.accountId===props.account.id)setSelected(order);else props.onDraft('')}}).catch(cause=>{if(current)setError(errorMessage(cause))})
  return ()=>{current=false}
 },[draftId,props.account.id,version])
 const options=selected&&!drafts.some(draft=>draft.id===selected.id)?[selected,...drafts]:drafts
 return <div className="br-stack">
  {error && <p role="alert">{error}</p>}
  <div className="br-actions" aria-label="Draft pages">
   <span role="status">{loading?'Loading drafts…':`Draft page ${page} · ${drafts.length} shown`}</span>
   <button type="button" className="br-secondary" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}>Previous drafts</button>
   <button type="button" className="br-secondary" disabled={loading||!hasNext} onClick={()=>setPage(value=>value+1)}>Next drafts</button>
  </div>
  <label>Start from<select value={selected?.id ?? ''} disabled={props.busy||loading} onChange={event=>props.onDraft(event.target.value)}>
   <option value="">New order</option>
   {options.map(value=><option key={value.id} value={value.id}>{orderNumber(value.id)} · {when(value.preparedAt)} · {money(value.totalCents,value.currency??'AUD')}</option>)}
  </select></label>
  <OrderPad {...props} busy={props.busy||loading||Boolean(draftId&&!selected&&!error)} draft={selected}/>
 </div>
}
