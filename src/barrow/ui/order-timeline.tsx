import { useState } from 'react'
import { request, errorMessage } from './api'
import { when, type Order } from './types'
import type { orderTimeline } from '../timeline'

type Timeline = Awaited<ReturnType<typeof orderTimeline>>

// ORD-012: recorded facts only, read when opened; states no connected source reports say so.
export function OrderTimeline({ order }: { order: Order }) {
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [error, setError] = useState('')
  async function load() {
    setError('')
    try { setTimeline(await request<Timeline>(`/api/barrow/orders/${encodeURIComponent(order.id)}/timeline`)) }
    catch (cause) { setError(errorMessage(cause)) }
  }
  return <details className="br-details" onToggle={event => { if ((event.target as HTMLDetailsElement).open) void load() }}>
    <summary>Order timeline</summary>
    {error && <p role="alert">{error}</p>}
    {!timeline && !error && <p className="br-quiet-text">Loading the recorded events…</p>}
    {timeline && <>
      <ol className="br-stack">{timeline.entries.map((entry, index) => <li key={index}><strong>{entry.state}</strong> · {when(entry.at)} · {entry.source}{entry.owner !== entry.source ? ` · ${entry.owner}` : ''}{entry.detail ? <><br />{entry.detail}</> : null}</li>)}</ol>
      {timeline.pier === 'unavailable' && <p className="br-quiet-text">Pier did not answer, so shipments and returns are unknown right now.</p>}
      <p className="br-quiet-text">{timeline.unrecorded.map(item => item.state).join(', ')}: not recorded. No connected source reports these states yet.</p>
    </>}
  </details>
}
