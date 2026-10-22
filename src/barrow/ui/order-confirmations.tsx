import { ConfirmationLayoutTools } from './confirmation-layouts'
import { useState } from 'react'
import { request, errorMessage } from './api'
import { when } from './types'
import type { Confirmation } from '../confirmations'

export function OrderConfirmations({ orderId, supplier }: { orderId: string; supplier: boolean }) {
 const [layout,setLayout]=useState('')
 const [records,setRecords] = useState<Confirmation[] | null>(null)
 const [error,setError] = useState('')
 async function load() {
  setError('')
  try { setRecords((await request<{confirmations:Confirmation[]}>(`/api/barrow/orders/${encodeURIComponent(orderId)}/confirmations`)).confirmations) }
  catch(cause) {setError(errorMessage(cause))}
 }
 return <details className="br-details" onToggle={event=>{if((event.target as HTMLDetailsElement).open)void load()}}>
  <summary>Order confirmations</summary>
  {error && <p role="alert">{error}</p>}
  {!records && !error && <p>Loading confirmations…</p>}
  {records?.length===0 && <p>No confirmation was recorded for this historical order.</p>}
  {supplier&&Boolean(records?.length)&&<ConfirmationLayoutTools selected={layout} onSelect={setLayout}/>}
  {records?.map(record=><p key={record.number}>
   {orderId}-C{record.number} · {record.stage} · {when(record.at)}<br />
   <a href={`/api/barrow/orders/${encodeURIComponent(orderId)}/confirmations/${record.number}.pdf`} download>Download confirmation {record.number} PDF</a>{' · '}
   <a href={`/api/barrow/orders/${encodeURIComponent(orderId)}/confirmations/${record.number}.csv${layout?`?layout=${encodeURIComponent(layout)}`:''}`} download>Download confirmation {record.number} CSV</a>
  </p>)}
  {Boolean(records?.length) && <p>Recorded lines, addresses, delivery and payment terms. Configured wholesale and MSRP columns follow the recorded document preferences. Seller legal identity and images are not recorded; accepted sales terms appear only where the account had assigned terms. No confirmation email delivery is recorded. Tax is not calculated.</p>}
 </details>
}
