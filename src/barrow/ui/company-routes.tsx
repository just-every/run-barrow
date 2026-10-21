import { useEffect, useState } from 'react'
import { errorMessage, request } from './api'
import { AccountPicker, Notice } from './primitives'
import { money, type Account, type RunCommand } from './types'
import type { RoutePolicy, RouteRule } from '../company-routes'

type Person = { userId: string; name: string; email: string }
type Delegation = { id: string; delegatorId: string; delegateId: string; startsOn: string; endsOn: string; state: 'active' | 'ended'; revision: string; reason: string; effective: boolean }
type Data = { policy: RoutePolicy; revision: string | null; today: string; approvers: Person[]; versions: { revision: string; savedAt: string; reason: string }[]; delegations: Delegation[]; notes: { rule: string; versions: string } }
type StepForm = { label: string; approvers: string[]; hours: string; escalateTo: string[] }
type RuleForm = { id: string; name: string; all: boolean; locations: string[]; above: string; steps: StepForm[] }
const emptyStep = (): StepForm => ({ label: '', approvers: [], hours: '', escalateTo: [] })
const emptyRule = (): RuleForm => ({ id: '', name: '', all: true, locations: [], above: '0', steps: [emptyStep()] })
const ruleForm = (rule: RouteRule): RuleForm => ({ id: rule.id, name: rule.name, all: rule.locations === 'all', locations: rule.locations === 'all' ? [] : rule.locations, above: String(rule.aboveCents), steps: rule.steps.map(step => ({ label: step.label, approvers: step.approvers, hours: step.escalateAfterHours === null ? '' : String(step.escalateAfterHours), escalateTo: step.escalateTo })) })
const ruleValue = (form: RuleForm) => ({ id: form.id.trim(), name: form.name.trim(), locations: form.all ? 'all' : form.locations, aboveCents: Number(form.above), steps: form.steps.map(step => ({ label: step.label.trim(), approvers: step.approvers, escalateAfterHours: step.hours.trim() ? Number(step.hours) : null, escalateTo: step.hours.trim() ? step.escalateTo : [] })) })
const toggle = (list: string[], id: string, on: boolean) => on ? [...list, id] : list.filter(value => value !== id)

/** ACC-007: company administrators (and the supplier) set amount/location approval routes and dated delegations. */
export function CompanyRoutes({ accounts, version, run, busy }: { accounts: Account[]; version: unknown; run: RunCommand; busy: boolean }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? ''), [data, setData] = useState<Data | null>(null), [locations, setLocations] = useState<any[]>([]), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const [rules, setRules] = useState<RuleForm[]>([]), [reason, setReason] = useState('')
  const [delegation, setDelegation] = useState({ delegatorId: '', delegateId: '', endsOn: '', reason: '' })
  useEffect(() => {
    if (!accountId) return
    let current = true
    setError('')
    void Promise.all([request<Data>(`/api/barrow/company/routes?accountId=${encodeURIComponent(accountId)}`), request<{ locations: any[] }>(`/api/barrow/locations?accountId=${encodeURIComponent(accountId)}`)])
      .then(([routes, places]) => { if (current) { setData(routes); setRules(routes.policy.rules.map(ruleForm)); setLocations(places.locations.filter(place => place.kind === 'ship-to' && !place.archived)) } })
      .catch(cause => { if (current) { setData(null); setError(errorMessage(cause)) } })
    return () => { current = false }
  }, [accountId, version, refresh])
  const name = (id: string) => data?.approvers.find(person => person.userId === id)?.name ?? 'A former approver'
  const edit = (index: number, next: Partial<RuleForm>) => setRules(list => list.map((rule, i) => i === index ? { ...rule, ...next } : rule))
  const editStep = (index: number, step: number, next: Partial<StepForm>) => setRules(list => list.map((rule, i) => i === index ? { ...rule, steps: rule.steps.map((value, j) => j === step ? { ...value, ...next } : value) } : rule))
  const valid = reason.trim() && rules.every(rule => rule.id.trim() && rule.name.trim() && Number.isInteger(Number(rule.above)) && Number(rule.above) >= 0 && (rule.all || rule.locations.length) && rule.steps.length && rule.steps.every(step => step.label.trim() && step.approvers.length && (!step.hours.trim() || step.escalateTo.length)))
  async function save() { if (await run('company.route.save', { accountId, revision: data?.revision ?? null, rules: rules.map(ruleValue), reason: reason.trim() })) { setReason(''); setRefresh(value => value + 1) } }
  async function delegate() { if (await run('company.delegate', { accountId, ...delegation, reason: delegation.reason.trim() })) { setDelegation({ delegatorId: '', delegateId: '', endsOn: '', reason: '' }); setRefresh(value => value + 1) } }
  return <section className="br-card br-stack" aria-label="Approval routes">
    <h2>Approval routes and delegation</h2>
    <AccountPicker accounts={accounts} value={accountId} onChange={id => { setAccountId(id); setData(null) }} />
    {error && <Notice error>{error}</Notice>}
    {data && <>
      <p>{data.notes.rule}</p>
      <h3>Rules · policy revision {data.revision ? data.versions.length : 'none saved'}</h3>
      {!rules.length && <p>No approval route yet: orders over a purchaser’s own limit wait for any one approver with the right and limit.</p>}
      <form className="br-stack" aria-label="Approval policy" onSubmit={event => { event.preventDefault(); void save() }}>
        {rules.map((rule, index) => <fieldset className="br-card br-stack" key={index} aria-label={`Rule ${index + 1}`}><legend>Rule {index + 1}</legend>
          <div className="br-form-grid">
            <label>Rule ID<input required maxLength={40} value={rule.id} onChange={event => edit(index, { id: event.target.value })} /></label>
            <label>Rule name<input required maxLength={80} value={rule.name} onChange={event => edit(index, { name: event.target.value })} /></label>
            <label>Orders above (USD cents)<input required inputMode="numeric" value={rule.above} onChange={event => edit(index, { above: event.target.value })} /></label>
          </div>
          <label><input type="checkbox" checked={rule.all} onChange={event => edit(index, { all: event.target.checked })} />All ship-to locations</label>
          {!rule.all && locations.map(place => <label key={place.id}><input type="checkbox" checked={rule.locations.includes(place.id)} onChange={event => edit(index, { locations: toggle(rule.locations, place.id, event.target.checked) })} />{place.value.name}</label>)}
          {rule.steps.map((step, number) => <fieldset className="br-stack" key={number} aria-label={`Rule ${index + 1} step ${number + 1}`}><legend>Step {number + 1}</legend>
            <label>Step label<input required maxLength={80} value={step.label} onChange={event => editStep(index, number, { label: event.target.value })} /></label>
            <div role="group" aria-label={`Approvers for step ${number + 1}`}>{data.approvers.map(person => <label key={person.userId}><input type="checkbox" checked={step.approvers.includes(person.userId)} onChange={event => editStep(index, number, { approvers: toggle(step.approvers, person.userId, event.target.checked) })} />{person.name}</label>)}</div>
            <label>Escalate after (hours, blank for none)<input inputMode="numeric" value={step.hours} onChange={event => editStep(index, number, { hours: event.target.value })} /></label>
            {step.hours.trim() && <div role="group" aria-label={`Escalation people for step ${number + 1}`}>{data.approvers.map(person => <label key={person.userId}><input type="checkbox" checked={step.escalateTo.includes(person.userId)} onChange={event => editStep(index, number, { escalateTo: toggle(step.escalateTo, person.userId, event.target.checked) })} />{person.name}</label>)}</div>}
            {rule.steps.length > 1 && <button type="button" className="br-quiet" disabled={busy} onClick={() => edit(index, { steps: rule.steps.filter((_, j) => j !== number) })}>Remove step {number + 1}</button>}
          </fieldset>)}
          <div className="br-actions"><button type="button" className="br-secondary" disabled={busy || rule.steps.length >= 5} onClick={() => edit(index, { steps: [...rule.steps, emptyStep()] })}>Add a step</button>
            <button type="button" className="br-danger" disabled={busy} onClick={() => setRules(list => list.filter((_, i) => i !== index))}>Remove rule {index + 1}</button></div>
        </fieldset>)}
        <label>Reason for this policy change<textarea required maxLength={1000} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="br-actions"><button type="button" className="br-secondary" disabled={busy || rules.length >= 20} onClick={() => setRules(list => [...list, emptyRule()])}>Add a rule</button><button disabled={busy || !valid}>Save approval policy</button></div>
        <p className="br-quiet-text">{data.notes.versions}{data.versions.length ? ` Latest saved ${data.versions[0].savedAt}: ${data.versions[0].reason}` : ''}</p>
      </form>
      <h3>Delegation for an absent approver</h3>
      {!data.delegations.length && <p>No delegations.</p>}
      <ul>{data.delegations.map(row => <li key={row.id}>{name(row.delegatorId)} → {name(row.delegateId)} · {row.startsOn} through {row.endsOn} · {row.state === 'ended' ? 'Ended' : row.effective ? 'In effect today' : 'Not in effect today'}
        {row.state === 'active' && <> <button type="button" className="br-quiet" disabled={busy} onClick={() => { const text = window.prompt('Reason for ending this delegation now'); if (text?.trim()) void run('company.undelegate', { accountId, id: row.id, revision: row.revision, reason: text.trim() }).then(done => { if (done) setRefresh(value => value + 1) }) }}>End delegation</button></>}</li>)}</ul>
      <form className="br-stack" aria-label="Delegate approval" onSubmit={event => { event.preventDefault(); void delegate() }}>
        <div className="br-form-grid">
          <label>Absent approver<select required aria-label="Absent approver" value={delegation.delegatorId} onChange={event => setDelegation(value => ({ ...value, delegatorId: event.target.value }))}><option value="">Choose an approver</option>{data.approvers.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select></label>
          <label>Delegate<select required aria-label="Delegate" value={delegation.delegateId} onChange={event => setDelegation(value => ({ ...value, delegateId: event.target.value }))}><option value="">Choose an approver</option>{data.approvers.filter(person => person.userId !== delegation.delegatorId).map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select></label>
          <label>Through (Eastern time, at most 90 days)<input required type="date" min={data.today} value={delegation.endsOn} onChange={event => setDelegation(value => ({ ...value, endsOn: event.target.value }))} /></label>
        </div>
        <label>Reason<textarea required maxLength={1000} rows={2} value={delegation.reason} onChange={event => setDelegation(value => ({ ...value, reason: event.target.value }))} /></label>
        <div className="br-actions"><button disabled={busy || !delegation.delegatorId || !delegation.delegateId || !delegation.endsOn || !delegation.reason.trim()}>Delegate approval</button></div>
        <p className="br-quiet-text">A delegate must already hold the approver right and their own approval limit ({money(0)} means none) still applies; a buyer without the approver right cannot receive approval authority.</p>
      </form>
    </>}
  </section>
}
