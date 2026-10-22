import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import type { RunCommand } from './types'
import type { readVisits } from '../visits'

type Data = Awaited<ReturnType<typeof readVisits>>
type Item = Data['visits'][number]
type Offer = { sku: string; name: string }
type Line = { sku: string; quantity: string }

function LineEditor({ label, offers, lines, onChange }: { label: string; offers: Offer[]; lines: Line[]; onChange: (next: Line[]) => void }) {
  const edit = (index: number, next: Partial<Line>) => onChange(lines.map((line, i) => i === index ? { ...line, ...next } : line))
  return <fieldset className="br-stack" aria-label={label}><legend>{label}</legend>
    {lines.map((line, index) => <div className="br-form-grid" key={index}>
      <label>Item<select aria-label={`${label} item ${index + 1}`} value={line.sku} onChange={event => edit(index, { sku: event.target.value })}><option value="">Choose an item</option>{offers.map(offer => <option key={offer.sku} value={offer.sku}>{offer.name} ({offer.sku})</option>)}</select></label>
      <label>Quantity<input aria-label={`${label} quantity ${index + 1}`} inputMode="numeric" value={line.quantity} onChange={event => edit(index, { quantity: event.target.value })} /></label>
    </div>)}
    <div className="br-actions"><button type="button" className="br-secondary" disabled={lines.length >= 20} onClick={() => onChange([...lines, { sku: '', quantity: '1' }])}>Add a line to {label.toLowerCase()}</button></div>
  </fieldset>
}
const ready = (lines: Line[]) => lines.length > 0 && lines.every(line => line.sku && Number.isInteger(Number(line.quantity)) && Number(line.quantity) >= 1)
const value = (lines: Line[]) => lines.map(line => ({ sku: line.sku, quantity: Number(line.quantity) }))

function VisitCard({ visit, data, offers, canSell, canHandOff, busy, run }: { visit: Item; data: Data; offers: Offer[]; canSell: boolean; canHandOff: boolean; busy: boolean; run: RunCommand }) {
  const [note, setNote] = useState(''), [samples, setSamples] = useState<Line[]>([{ sku: '', quantity: '1' }]), [basket, setBasket] = useState<Line[]>([{ sku: '', quantity: '1' }])
  const person = (id?: string) => id ? data.people[id] ?? 'A former staff member' : ''
  const open = visit.status !== 'cancelled'
  return <article className="br-card br-stack" aria-label={`${data.kinds[visit.kind]} on ${visit.date}`}>
    <h3>{data.kinds[visit.kind]} · {visit.date} {visit.time} · {visit.status}</h3>
    <p>{[visit.location, visit.agenda].filter(Boolean).join(' · ') || 'No location or agenda recorded.'} Planned by {person(visit.ownerId)}.</p>
    {visit.task && <p>Next action: {visit.task.status === 'open' ? `${person(visit.task.ownerId)} · ${visit.task.nextContactDate} · ${visit.task.reason}` : `closed · ${visit.task.resolution}`}</p>}
    {!!visit.notes.length && <ul aria-label="Buyer notes">{visit.notes.map((entry, index) => <li key={index}>{entry.at} · {person(entry.by)}: {entry.text}</li>)}</ul>}
    {visit.samples && <div className="br-stack"><p>Sample request: {visit.samples.lines.map(line => `${line.quantity} × ${line.name}`).join(', ')}.</p>
      <p>{visit.samples.handoff ? `Handed to inventory by ${person(visit.samples.handoff.by)}. Pier acknowledged sample order ${visit.samples.handoff.pierReference}: ${visit.samples.handoff.lines.map(line => `${line.reserved} of ${line.quantity} reserved`).join(', ')}.` : 'Awaiting handoff to inventory.'}</p>
      {!visit.samples.handoff && canHandOff && <div className="br-actions"><button disabled={busy} onClick={() => void run('visit.handoff', { id: visit.id, revision: visit.revision })}>Hand samples to inventory</button></div>}</div>}
    {visit.basket && <p>Show basket prepared as {visit.basket.quoteId ? `quote ${visit.basket.quoteId}` : `draft order ${visit.basket.orderId}`}.</p>}
    {canSell && open && <details><summary>Record buyer notes and outcome</summary><div className="br-stack">
      <label>Buyer notes<textarea maxLength={4000} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label>
      <div className="br-actions"><button disabled={busy || !note.trim()} onClick={() => void run('visit.record', { id: visit.id, revision: visit.revision, note }).then(done => { if (done) setNote('') })}>Save buyer notes</button>
        {visit.status === 'planned' && <button className="br-secondary" disabled={busy} onClick={() => void run('visit.record', { id: visit.id, revision: visit.revision, note: note.trim() || undefined, status: 'completed' }).then(done => { if (done) setNote('') })}>Complete visit</button>}
        {visit.status === 'planned' && <button className="br-danger" disabled={busy} onClick={() => void run('visit.record', { id: visit.id, revision: visit.revision, status: 'cancelled' })}>Cancel visit</button>}</div>
    </div></details>}
    {canSell && open && !visit.samples?.handoff && <details><summary>Request samples</summary><div className="br-stack">
      <LineEditor label="Samples" offers={offers} lines={samples} onChange={setSamples} />
      <div className="br-actions"><button disabled={busy || !ready(samples)} onClick={() => void run('visit.samples', { id: visit.id, revision: visit.revision, lines: value(samples) })}>Record sample request</button></div>
    </div></details>}
    {canSell && open && !visit.basket && <details><summary>Show basket</summary><div className="br-stack">
      <LineEditor label="Show basket" offers={offers} lines={basket} onChange={setBasket} />
      <div className="br-actions"><button disabled={busy || !ready(basket)} onClick={() => void run('visit.basket', { id: visit.id, revision: visit.revision, prepare: 'quote', lines: value(basket) })}>Prepare quote from basket</button>
        <button className="br-secondary" disabled={busy || !ready(basket)} onClick={() => void run('visit.basket', { id: visit.id, revision: visit.revision, prepare: 'order', lines: value(basket) })}>Prepare draft order from basket</button></div>
    </div></details>}
  </article>
}

/** REP-005: plan visits and appointments for the selected account, record notes, samples and a show basket, and see the Pier acknowledgment. */
export function Visits({ accountId, version, canSell, canHandOff, busy, run }: { accountId?: string; version: unknown; canSell: boolean; canHandOff: boolean; busy: boolean; run: RunCommand }) {
  const [data, setData] = useState<Data | null>(null), [offers, setOffers] = useState<Offer[]>([]), [error, setError] = useState('')
  const [form, setForm] = useState({ kind: 'showroom', date: '', time: '10:00', location: '', agenda: '' })
  useEffect(() => {
    let live = true
    setError('')
    void request<Data>(`/api/barrow/visits${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`).then(value => { if (live) setData(value) }).catch(cause => { if (live) setError(errorMessage(cause)) })
    if (accountId) void request<{ items: Offer[] }>(`/api/barrow/catalogue?accountId=${encodeURIComponent(accountId)}`).then(value => { if (live) setOffers(value.items) }).catch(() => { if (live) setOffers([]) })
    return () => { live = false }
  }, [accountId, version])
  if (error) return <Notice error>{error}</Notice>
  if (!data) return <p role="status">Loading visits…</p>
  const visits = canSell ? data.visits : data.visits.filter(visit => visit.samples && !visit.samples.handoff)
  return <section className="br-card br-stack" aria-label="Visits and samples">
    <h2>{canSell ? 'Visits, samples and show baskets' : 'Sample requests awaiting inventory'}</h2>
    <p className="br-quiet-text">{data.notes.stock} {data.notes.followup}</p>
    {canSell && accountId && <form className="br-stack" aria-label="Plan a visit" onSubmit={event => { event.preventDefault(); void run('visit.schedule', { accountId, ...form, location: form.location || undefined, agenda: form.agenda || undefined }).then(done => { if (done) setForm(current => ({ ...current, location: '', agenda: '' })) }) }}>
      <div className="br-form-grid">
        <label>Kind<select aria-label="Visit kind" value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value }))}>{Object.entries(data.kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Date (Eastern time)<input type="date" required value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></label>
        <label>Time<input type="time" required value={form.time} onChange={event => setForm(current => ({ ...current, time: event.target.value }))} /></label>
        <label>Location (optional)<input maxLength={160} value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} /></label>
      </div>
      <label>Agenda (optional)<textarea maxLength={1000} rows={2} value={form.agenda} onChange={event => setForm(current => ({ ...current, agenda: event.target.value }))} /></label>
      <div className="br-actions"><button disabled={busy || !form.date || !form.time}>Plan visit</button></div>
    </form>}
    {!visits.length && <p>{canSell ? 'No visits planned for this account yet.' : 'No sample requests are waiting.'}</p>}
    {visits.map(visit => <VisitCard key={`${visit.id}:${visit.revision}`} visit={visit} data={data} offers={offers} canSell={canSell} canHandOff={canHandOff} busy={busy} run={run} />)}
  </section>
}
