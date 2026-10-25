import { useState } from 'react'
import { AccountPages, useAccountPage } from './account-pages'

type Command = (type: string, payload: Record<string, unknown>) => Promise<void>
type Action = { id: string; kind: 'delivery' | 'quote'; quoteId: string; body: string; recipientId: string; sendOn: string; status: 'proposed' | 'approved' | 'suppressed' | 'sent'; reason?: string }
type Plan = {
  model: string; runId: string; generatedAt: string; sourceFingerprint: string
  sources: { kind: string; path: string; summary: string }[]
  recipients: { id: string; email: string }[]
  actions: Action[]
  history: { at: string; by: string; actionId: string; decision: string; reason: string; revision: string }[]
  previousRuns?: {runId:string;generatedAt:string;resolution?:string;ownerId:string;history:Plan['history']}[]
}
type PlannedTask = { id: string; revision: string; status: string; plan?: Plan }

export function AccountPlanBuilder({ busy, command }: { busy: boolean; command: Command }) {
  const directory = useAccountPage(), [accountId, setAccountId] = useState('')
  return <section className="br-card br-stack" aria-label="Plan account follow-up">
    <h3>Plan account follow-up</h3>
    <p>Review the account’s recorded service issues and conversations before choosing its next contact.</p>
    <AccountPages directory={directory} />
    <label>Account for follow-up<select value={accountId} onChange={event => setAccountId(event.target.value)}>
      <option value="">Choose a trade account</option>
      {accountId && !directory.result?.accounts.some(account => account.id === accountId) && <option value={accountId}>{accountId}</option>}
      {directory.result?.accounts.map(account => <option key={account.id} value={account.id}>{account.value.name}</option>)}
    </select></label>
    <div className="br-actions"><button disabled={busy || !accountId} onClick={() => void command('followup.plan', { accountId })}>Prepare account follow-up plan</button></div>
  </section>
}

function ActionReview({ task, plan, action, busy, command }: { task: PlannedTask; plan: Plan; action: Action; busy: boolean; command: Command }) {
  const [recipientId, setRecipientId] = useState(action.recipientId), [body, setBody] = useState(action.body)
  const [sendOn, setSendOn] = useState(action.sendOn), [reason, setReason] = useState(''), [consent, setConsent] = useState(false)
  const proposed = action.status === 'proposed', editable = task.status === 'open' && proposed
  const decision = (value: 'approve' | 'suppress') => command('followup.decide', { id: task.id, revision: task.revision, actionId: action.id, decision: value, recipientId, body, sendOn, reason, consent })
  return <article className="br-card br-stack" aria-label={action.kind === 'delivery' ? 'Delivery follow-up' : 'Quote follow-up'}>
    <h4>{action.kind === 'delivery' ? 'Resolve delayed delivery' : 'Review unanswered quote'} · {action.status}</h4>
    <a href={`/app?quote=${encodeURIComponent(action.quoteId)}`}>Open quote conversation</a>
    <label>Message recipient<select value={recipientId} disabled={!editable || busy} onChange={event => setRecipientId(event.target.value)}>
      {plan.recipients.map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.email}</option>)}
    </select></label>
    <label>Message to buyer<textarea value={body} readOnly={!editable} disabled={busy} onChange={event => setBody(event.target.value)} maxLength={2000} rows={6} /></label>
    <label>Contact date<input type="date" value={sendOn} disabled={!editable || busy} onChange={event => setSendOn(event.target.value)} /></label>
    {action.reason && <p>Decision reason: {action.reason}</p>}
    {task.status === 'open' && proposed && <>
      <label>Reason for this decision<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} /> I reviewed this recipient, message and contact date.</label>
      <div className="br-actions">
        {proposed && <button disabled={busy || !consent || !reason.trim() || !body.trim() || !recipientId || !sendOn} onClick={() => void decision('approve')}>Approve exact message</button>}
        <button className="br-secondary" disabled={busy || !consent || !reason.trim()} onClick={() => void decision('suppress')}>Suppress outreach</button>
      </div>
    </>}
    {task.status === 'open' && action.status === 'approved' && <div className="br-actions"><button disabled={busy} onClick={() => void command('followup.send', { id: task.id, revision: task.revision, actionId: action.id })}>Send approved message</button></div>}
    {action.status === 'sent' && <p>Message posted. Email delivery is recorded separately. This task stays assigned while awaiting the buyer’s response or a recorded resolution.</p>}
  </article>
}

export function AccountPlanReview({ task, busy, command }: { task: PlannedTask; busy: boolean; command: Command }) {
  const plan = task.plan
  if (!plan) return null
  return <section className="br-stack" aria-label="Account follow-up plan">
    <p>Plan prepared {plan.generatedAt}. Review each action before sending. Approval and suppression keep the account task open.</p>
    <details><summary>Records used for this plan</summary><ul>{plan.sources.map((source, index) => <li key={`${source.kind}:${index}`}><a href={source.path}>{source.kind}</a>: {source.summary}</li>)}</ul></details>
    {plan.actions.map(action => <ActionReview key={`${task.revision}:${action.id}`} task={task} plan={plan} action={action} busy={busy} command={command} />)}
    {!!plan.previousRuns?.length && <details><summary>Earlier account plan outcomes</summary>{plan.previousRuns.map(run => <article key={run.runId}><p>{run.generatedAt} · owner {run.ownerId} · {run.resolution}</p><ul>{run.history.map((event,index) => <li key={index}>{event.decision} · {event.reason}</li>)}</ul></article>)}</details>}
    {!!plan.history.length && <details><summary>Follow-up decisions and outcomes</summary><ul>{plan.history.map((event, index) => <li key={`${event.revision}:${index}`}>{event.at} · {event.decision} · {event.reason} · recorded by {event.by}</li>)}</ul></details>}
  </section>
}
