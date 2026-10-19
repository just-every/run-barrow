import { useEffect, useRef, useState } from 'react'
import type { CommercialAuditEvent, CommercialAuditPage } from '../commercial-audit'
import { errorMessage, request } from './api'
import { when } from './types'
import { Empty, Notice } from './primitives'

function relation(value: string | null, origin: CommercialAuditEvent['accountOrigin']) {
  return value ? `${value}${origin === 'current-relation' ? ' (current relation; historical link unrecorded)' : ''}` : 'Unrecorded'
}

export function CommercialAudit() {
  const [accountId, setAccountId] = useState(''), [orderId, setOrderId] = useState(''), [person, setPerson] = useState('')
  const [query, setQuery] = useState(''), [page, setPage] = useState<CommercialAuditPage | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const generation = useRef(0)
  async function load(filters: string, cursor?: string) {
    const current = ++generation.current
    setBusy(true); setError('')
    const params = new URLSearchParams(filters)
    if (cursor) params.set('cursor', cursor)
    try {
      const result = await request<CommercialAuditPage>(`/api/barrow/audit?${params}`)
      if (current === generation.current) setPage(result)
    } catch (failure) { if (current === generation.current) setError(errorMessage(failure)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  useEffect(() => { void load(''); return () => { generation.current++ } }, [])
  function filter() {
    const params = new URLSearchParams()
    if (accountId.trim()) params.set('accountId', accountId.trim())
    if (orderId.trim()) params.set('orderId', orderId.trim())
    if (person.trim()) params.set('person', person.trim())
    setQuery(params.toString()); setPage(null); void load(params.toString())
  }
  return <div className="br-stack">
    <div className="br-card br-stack"><h2>Commercial audit</h2><p>Review recorded commercial changes and the person or agent responsible.</p>
      <form className="br-stack" onSubmit={event => { event.preventDefault(); filter() }}>
        <label>Account ID<input value={accountId} onChange={event => setAccountId(event.target.value)} /></label>
        <label>Order ID<input value={orderId} onChange={event => setOrderId(event.target.value)} /></label>
        <label>Person ID, name or email<input value={person} onChange={event => setPerson(event.target.value)} /></label>
        <div className="br-actions"><button disabled={busy}>Apply filters</button><a className="br-secondary" href={`/api/barrow/audit.csv?${query}`} download>Download filtered CSV</a></div>
      </form>
      <p className="br-quiet-text">CSV includes every event matching the applied filters. Names and emails reflect the current sign-in directory. Older events may have unrecorded details.</p>
    </div>
    {error && <Notice error>{error}</Notice>}
    {busy && <Notice>Loading audit events…</Notice>}
    {page && <>
      {!page.events.length ? <Empty title="No matching events">Change the filters to review other recorded activity.</Empty> : page.events.map(value => <article className="br-card br-stack" key={value.id}>
        <div className="br-heading-row"><h3>{value.action}</h3><time dateTime={value.createdAt}>{when(value.createdAt)}</time></div>
        <p>{value.actorKind === 'agent' ? 'Agent' : 'Person'}: {value.actorName || 'Name unrecorded'} · {value.actorId}{value.actorEmail ? ` · ${value.actorEmail}` : ''}</p>
        <dl className="br-facts br-facts-wrap">
          <div><dt>Subject</dt><dd>{value.subjectId}</dd></div>
          <div><dt>Account</dt><dd>{relation(value.accountId, value.accountOrigin)}</dd></div>
          <div><dt>Order</dt><dd>{relation(value.orderId, value.orderOrigin)}</dd></div>
          <div><dt>Source</dt><dd>{value.source || 'Unrecorded'}</dd></div>
          <div><dt>Revision</dt><dd>{value.revision || 'Unrecorded'}</dd></div>
          <div><dt>Reason</dt><dd>{value.reason || 'Unrecorded'}</dd></div>
        </dl>
      </article>)}
      <div className="br-actions"><button className="br-secondary" disabled={busy} onClick={() => void load(query)}>Latest events</button>{page.nextCursor && <button disabled={busy} onClick={() => void load(query, page.nextCursor!)}>Older events</button>}</div>
    </>}
  </div>
}
