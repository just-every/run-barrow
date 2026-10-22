import { ConfirmationLayoutTools } from './confirmation-layouts'
import { useState } from 'react'
import { request, errorMessage } from './api'
import { when } from './types'
import type { Confirmation } from '../confirmations'

type Emails = Record<string, { status: string; at: string }>
export function OrderConfirmations({ orderId, supplier }: { orderId: string; supplier: boolean }) {
 const [layout,setLayout]=useState('')
 const [records,setRecords] = useState<Confirmation[] | null>(null),[emails,setEmails]=useState<Emails>({})
 const [error,setError] = useState('')
 async function load() {
  setError('')
  try { const value=await request<{confirmations:Confirmation[];emails:Emails}>(`/api/barrow/orders/${encodeURIComponent(orderId)}/confirmations`);setRecords(value.confirmations);setEmails(value.emails) }
  catch(cause) {setError(errorMessage(cause))}
 }
 return <details className="br-details" onToggle={event=>{if((event.target as HTMLDetailsElement).open)void load()}}>
  <summary>Order confirmations</summary>
  {error && <p role="alert">{error}</p>}
  {!records && !error && <p>Loading confirmations…</p>}
  {records?.length===0 && <p>No confirmation was recorded for this historical order.</p>}
  {supplier&&Boolean(records?.length)&&<ConfirmationLayoutTools selected={layout} onSelect={setLayout}/>}
  {records?.map(record=><p key={record.number}>
   {orderId}-C{record.number} · {record.stage} · {when(record.at)}{record.snapshot.season?` · ${record.snapshot.season}`:''}<br />
   {record.snapshot.changes&&<>Revises C{record.snapshot.revises}: {record.snapshot.changes.map(change=>`line ${change.line+1} ${change.sku} ${change.before.quantity} → ${change.after.quantity}`).join('; ')}<br /></>}
   <span className="br-quiet-text">Email to the account contact: {emails[record.number]?`${emails[record.number].status} · ${when(emails[record.number].at)}`:'not recorded'}</span><br />
   <a href={`/api/barrow/orders/${encodeURIComponent(orderId)}/confirmations/${record.number}.pdf`} download>Download confirmation {record.number} PDF</a>{' · '}
   <a href={`/api/barrow/orders/${encodeURIComponent(orderId)}/confirmations/${record.number}.csv${layout?`?layout=${encodeURIComponent(layout)}`:''}`} download>Download confirmation {record.number} CSV</a>
  </p>)}
  {Boolean(records?.length) && <p>Each revision records the seller identity, lines with their style, color, size and ship window, addresses, delivery and payment terms. Configured wholesale and MSRP columns follow the recorded document preferences. Accepted sales terms appear where the account had assigned terms. Product images are not recorded. Tax is not calculated.</p>}
 </details>
}
