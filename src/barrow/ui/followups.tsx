import { useEffect, useRef, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { AccountPlanBuilder, AccountPlanReview } from './followup-plan'
import type { readFollowups } from '../followups'

type Board = Awaited<ReturnType<typeof readFollowups>>
type Task = Board['tasks'][number]

function TaskEditor({ task, people, busy, update, command }: { task: Task; people: Board['people']; busy: boolean; update: (payload: Record<string, unknown>) => Promise<void>; command: (type: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [ownerId, setOwner] = useState(task.ownerId), [nextContactDate, setDate] = useState(task.nextContactDate)
  const [note, setNote] = useState(''), [outcome, setOutcome] = useState('failed'), [resolution, setResolution] = useState('')
  const save = (extra: Record<string, unknown> = {}) => update({ id: task.id, revision: task.revision, ownerId, nextContactDate, ...extra })
  return <article id={`followup-${task.id}`} style={{scrollMarginTop:'7rem'}} className="br-card br-stack"><h3>{task.title}</h3>
    <p>Last recorded source: {task.reason} · {task.status} · next contact {task.nextContactDate}</p>
    {task.escalated && task.status === 'open' && <p><strong>Escalated since {task.escalated.since} to {people.find(person => person.id === task.escalated!.toId)?.displayName ?? 'a former owner or admin'}</strong> until a decision or an explicit closure.</p>}
    <a href={task.sourcePath}>Open source record</a>
    <AccountPlanReview task={task} busy={busy} command={command} />
    {task.status === 'closed' ? <p>Resolution: {task.resolution}</p> : <>
      <div className="br-form-grid"><label>Task owner<select value={ownerId} onChange={event => setOwner(event.target.value)}>{!people.some(person => person.id === ownerId) && <option value={ownerId} disabled>Former staff member; choose a current owner</option>}{people.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label>
        <label>Next contact date<input type="date" value={nextContactDate} onChange={event => setDate(event.target.value)} /></label></div>
      <div className="br-actions"><button className="br-secondary" disabled={busy} onClick={() => void save()}>Save owner and date</button></div>
      <details><summary>Record a contact attempt</summary><div className="br-stack">
        <p className="br-quiet-text">This records a contact you made. Barrow does not send a message.</p>
        <label>Outcome<select value={outcome} onChange={event => setOutcome(event.target.value)}><option value="failed">Could not reach them</option><option value="reached">Reached them</option></select></label>
        <label>Contact note<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} /></label>
        <button className="br-secondary" disabled={busy || !note.trim()} onClick={() => void save({ contact: { outcome, note } })}>Record contact</button>
      </div></details>
      {task.kind === 'payment-promise' ? <p>Use Buyer payment promises in Data or Reports to record an attributed finance resolution or buyer withdrawal.</p> : <><label>Resolution<textarea value={resolution} onChange={event => setResolution(event.target.value)} maxLength={1000} /></label>
      <div className="br-actions"><button className="br-secondary" disabled={busy || !resolution.trim()} onClick={() => void save({ close: true, resolution })}>Close with resolution</button></div></>}
    </>}
    {!!task.contacts.length && <details><summary>Recorded contacts ({task.contacts.length})</summary><ul>{task.contacts.map((contact, index) => <li key={index}>{contact.at} · {contact.outcome} · {contact.note}</li>)}</ul></details>}
  </article>
}

// AUTO-005: source-linked human follow-up; no delivery, settlement or message is invented.
export function Followups() {
  const [board, setBoard] = useState<Board | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [view, setView] = useState('due'), [on, setOn] = useState('')
  useEffect(() => { if (new URLSearchParams(window.location.search).get('task')) setView('all') }, [])
  useEffect(() => { const id=new URLSearchParams(window.location.search).get('task'); if(id&&board?.tasks.some(task=>task.id===id))document.getElementById(`followup-${id}`)?.scrollIntoView({block:'start'}) }, [board])
  const query = new URLSearchParams({ view, ...(on ? { on } : {}) })
  const currentQuery = useRef(String(query)), latestRequest = useRef(0)
  currentQuery.current = String(query)
  const load = async () => {
    const requested = currentQuery.current, id = ++latestRequest.current
    const value = await request<Board>(`/api/barrow/followups?${requested}`)
    if (id === latestRequest.current && requested === currentQuery.current) setBoard(value)
  }
  useEffect(() => { setBoard(null); setError(''); void load().catch(cause => setError(errorMessage(cause))); return () => { latestRequest.current++ } }, [String(query)])
  async function command(type: string, payload: Record<string, unknown>) {
    setBusy(true); setError('')
    try { await request('/api/barrow/commands', { type, payload }); if (type === 'followup.plan') setView('all'); await load() }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <div className="br-card br-stack"><h2>Next actions</h2>
    <div className="br-form-grid"><label>Queue view<select value={view} onChange={event => setView(event.target.value)}><option value="due">Due and unanswered</option><option value="all">All, including snoozed and closed</option></select></label>
      <label>Due on<input type="date" value={on} onChange={event => setOn(event.target.value)} /></label></div>
    <div className="br-actions"><button disabled={busy} onClick={() => void command('followup.refresh', {})}>Refresh next actions</button></div>
    {board?.canPlan && <AccountPlanBuilder busy={busy} command={command} />}
    {error && <Notice error>{error}</Notice>}
    {board && <>
      <p className="br-quiet-text">{Object.values(board.notes).join(' ')}</p>
      {!board.tasks.length && <p>No next actions in this view. Refresh to reconcile the current source records.</p>}
      {board.tasks.map(task => <TaskEditor key={`${task.id}:${task.revision}`} task={task} people={board.people} busy={busy} command={command} update={payload => command('followup.update', payload)} />)}
    </>}
  </div>
}
