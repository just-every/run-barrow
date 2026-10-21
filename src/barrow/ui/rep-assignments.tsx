import { useEffect, useState } from 'react'
import { errorMessage, request } from './api'
import { Notice } from './primitives'
import type { RunCommand } from './types'

type Assignment = { id: string; userId: string; name: string | null; kind: 'account' | 'territory' | 'rep'; target: string; coverage: boolean; startsOn: string; endsOn: string | null; state: 'active' | 'ended'; revision: string; reason: string; effective: boolean; transferredFrom: string | null }
type Rep = { userId: string; name: string }
type Roster = { today: string; manager: boolean; assignments: Assignment[]; reps: Rep[]; territories: string[]; notes: { rule: string; attribution: string } }
const kinds = { account: 'Account', territory: 'Territory', rep: 'Another rep’s whole book' }
const initial = { coverage: false, userId: '', kind: 'territory', target: '', startsOn: '', endsOn: '', reason: '' }

/** ACC-006: managers assign reps to territories and accounts and give dated coverage; a rep reads only their own. */
export function RepAssignments({ version, run, busy }: { version: unknown; run: RunCommand; busy: boolean }) {
  const [roster, setRoster] = useState<Roster | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const [form, setForm] = useState(initial), [moving, setMoving] = useState<Assignment | null>(null), [toUserId, setToUserId] = useState(''), [moveReason, setMoveReason] = useState('')
  useEffect(() => {
    let current = true
    setError('')
    void request<Roster>('/api/barrow/rep-assignments').then(value => { if (current) setRoster(value) }).catch(cause => { if (current) { setRoster(null); setError(errorMessage(cause)) } })
    return () => { current = false }
  }, [version, refresh])
  if (error) return <Notice error>{error}</Notice>
  if (!roster) return <p role="status">Loading rep assignments…</p>
  const rep = (id: string) => roster.reps.find(row => row.userId === id)?.name ?? roster.assignments.find(row => row.userId === id)?.name ?? id
  const targetLabel = (row: Assignment) => row.kind === 'rep' ? `everything ${rep(row.target)} holds` : `${kinds[row.kind].toLowerCase()} ${row.target}`
  const changed = async (type: string, payload: Record<string, unknown>) => { if (await run(type, payload)) setRefresh(value => value + 1); return false }
  async function save() {
    const payload = { userId: form.userId, kind: form.kind, target: form.target.trim(), reason: form.reason.trim(), ...(form.startsOn ? { startsOn: form.startsOn } : {}), ...(form.endsOn ? { endsOn: form.endsOn } : {}) }
    if (await run(form.coverage ? 'rep.cover' : 'rep.assign', payload)) { setForm(initial); setRefresh(value => value + 1) }
  }
  const valid = form.userId && form.target.trim() && form.reason.trim() && (!form.coverage || form.endsOn)
  return <section className="br-card br-stack" aria-labelledby="rep-assignments-title">
    <h2 id="rep-assignments-title">{roster.manager ? 'Rep territories and coverage' : 'Your accounts'}</h2>
    <p>{roster.notes.rule}</p>
    {!roster.assignments.length && <p>{roster.manager ? 'No rep holds a territory or account through an assignment yet.' : 'No assignment or coverage holds an account for you today.'}</p>}
    {roster.assignments.map(row => <article className="br-card br-stack" key={row.id}>
      <h3>{row.name ?? row.userId} · {row.coverage ? 'Temporary coverage' : 'Primary rep'}</h3>
      <p>{targetLabel(row)} · from {row.startsOn} {row.endsOn ? `through ${row.endsOn}` : 'until ended'} · <span className="br-badge">{row.state === 'ended' ? 'Ended' : row.effective ? 'In effect today' : 'Not in effect today'}</span></p>
      <details className="br-details"><summary>Reason and revision</summary><p>{row.reason}</p><p>Revision {row.revision}{row.transferredFrom ? ` · transferred from ${row.transferredFrom}` : ''}</p></details>
      {roster.manager && row.state === 'active' && <div className="br-actions">
        {!row.coverage && <button type="button" className="br-secondary" disabled={busy} onClick={() => { setMoving(row); setToUserId(''); setMoveReason('') }}>Transfer {row.target}</button>}
        <button type="button" className="br-danger" disabled={busy} onClick={() => { const text = window.prompt(`Reason for ending this ${row.coverage ? 'coverage' : 'assignment'} now`); if (text?.trim()) void changed('rep.end', { id: row.id, revision: row.revision, reason: text.trim() }) }}>End {row.coverage ? 'coverage' : 'assignment'} now</button>
      </div>}
    </article>)}
    {roster.manager && moving && <form className="br-card br-stack" aria-label="Transfer assignment" onSubmit={event => { event.preventDefault(); void changed('rep.transfer', { id: moving.id, revision: moving.revision, toUserId, reason: moveReason.trim() }).then(() => setMoving(null)) }}>
      <h3>Transfer {moving.kind} {moving.target}</h3>
      <label>New primary rep<select aria-label="New primary rep" required value={toUserId} onChange={event => setToUserId(event.target.value)}><option value="">Choose a rep</option>{roster.reps.filter(row => row.userId !== moving.userId).map(row => <option key={row.userId} value={row.userId}>{row.name}</option>)}</select></label>
      <label>Reason<textarea required maxLength={1000} rows={2} value={moveReason} onChange={event => setMoveReason(event.target.value)} /></label>
      <div className="br-actions"><button disabled={busy || !toUserId || !moveReason.trim()}>Transfer from today</button><button type="button" className="br-secondary" onClick={() => setMoving(null)}>Cancel</button></div>
    </form>}
    {roster.manager && <form className="br-stack" aria-label="Assign or cover" onSubmit={event => { event.preventDefault(); void save() }}>
      <h3>Assign a rep or give coverage</h3>
      <div className="br-form-grid">
        <label>Type<select aria-label="Type" value={form.coverage ? 'cover' : 'assign'} onChange={event => setForm(value => ({ ...value, coverage: event.target.value === 'cover', kind: 'territory', target: '' }))}><option value="assign">Primary rep</option><option value="cover">Temporary coverage</option></select></label>
        <label>Rep<select aria-label="Rep" required value={form.userId} onChange={event => setForm(value => ({ ...value, userId: event.target.value }))}><option value="">Choose a rep</option>{roster.reps.map(row => <option key={row.userId} value={row.userId}>{row.name}</option>)}</select></label>
        <label>Scope<select aria-label="Scope" value={form.kind} onChange={event => setForm(value => ({ ...value, kind: event.target.value, target: '' }))}>{Object.entries(kinds).filter(([key]) => form.coverage || key !== 'rep').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {form.kind === 'territory' ? <label>Territory<select aria-label="Territory" required value={form.target} onChange={event => setForm(value => ({ ...value, target: event.target.value }))}><option value="">Choose a territory</option>{roster.territories.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          : form.kind === 'rep' ? <label>Rep being covered<select aria-label="Rep being covered" required value={form.target} onChange={event => setForm(value => ({ ...value, target: event.target.value }))}><option value="">Choose a rep</option>{roster.reps.filter(row => row.userId !== form.userId).map(row => <option key={row.userId} value={row.userId}>{row.name}</option>)}</select></label>
          : <label>Account ID<input required maxLength={160} value={form.target} onChange={event => setForm(value => ({ ...value, target: event.target.value }))} /></label>}
        <label>Starts on (Eastern, optional)<input type="date" value={form.startsOn} onChange={event => setForm(value => ({ ...value, startsOn: event.target.value }))} /></label>
        <label>{form.coverage ? 'Covers through (required)' : 'Ends on (optional)'}<input type="date" required={form.coverage} min={roster.today} value={form.endsOn} onChange={event => setForm(value => ({ ...value, endsOn: event.target.value }))} /></label>
      </div>
      <label>Reason<textarea required maxLength={1000} rows={2} value={form.reason} onChange={event => setForm(value => ({ ...value, reason: event.target.value }))} /></label>
      <div className="br-actions"><button disabled={busy || !valid}>{form.coverage ? 'Give coverage' : 'Assign rep'}</button></div>
      <p className="br-quiet-text">{roster.notes.attribution}</p>
    </form>}
  </section>
}
