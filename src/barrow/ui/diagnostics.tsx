import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { orderNumber, when } from './types'
import type { diagnostics } from '../diagnostics'

type Diagnostics = Awaited<ReturnType<typeof diagnostics>>

// OPS-001: live Pier health and every outstanding handoff with its correlation ID; resume from Orders.
export function DiagnosticsCard() {
  const [value, setValue] = useState<Diagnostics | null>(null)
  const [error, setError] = useState('')
  const [checks, setChecks] = useState(0)
  useEffect(() => {
    let current = true
    void request<Diagnostics>('/api/barrow/diagnostics').then(next => { if (current) { setValue(next); setError('') } }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [checks])
  return <div className="br-card br-stack"><h2>Diagnostics</h2>
    {error && <Notice error>{error}</Notice>}
    {value && <>
      <p>Pier: {value.pier.state === 'ok' ? 'answered' : value.pier.state === 'failed' ? `did not answer — ${value.pier.message}` : 'not configured'} · checked {when(value.pier.checkedAt)}{value.pier.origin ? ` · ${value.pier.origin}` : ''}</p>
      {value.handoffs.length === 0 ? <p className="br-quiet-text">No outstanding stock handoffs.</p> : <ul className="br-stack">{value.handoffs.map(item => <li key={item.correlationId}><strong>{orderNumber(item.orderId)}</strong> · {item.customer} · {item.state} since {when(item.since)} · owner {item.owner}<br /><code>{item.correlationId}</code> · Next: {item.action} on this order in Orders.</li>)}</ul>}
      <p className="br-quiet-text">{value.notifications.note}</p>
    </>}
    <div className="br-actions"><button type="button" className="br-secondary" onClick={() => setChecks(count => count + 1)}>Check again</button><a className="br-button br-secondary" href="/api/barrow/diagnostics.json" download>Export diagnostics</a></div>
    <p className="br-quiet-text">The export holds no sessions, credentials or message contents.</p>
  </div>
}
