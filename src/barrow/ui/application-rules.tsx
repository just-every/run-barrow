import { useEffect, useState } from 'react'
import { errorMessage, request } from './api'
import { Notice } from './primitives'
import type { RunCommand } from './types'
import type { ApplicationRules } from '../application-rules'

type Reviewer = { id: string; name: string; role: string }
type Data = ApplicationRules & { revision: string | null; reviewers: Reviewer[]; notes: { rule: string; conditions: string } }
type RouteForm = { territory: string; ownerId: string; escalateToId: string; deadlineDays: string; request: string }
type RuleForm = { id: string; name: string; states: string; minTerms: string; maxTerms: string; min: string; max: string; certificate: string; route: RouteForm }
const emptyRoute = (): RouteForm => ({ territory: '', ownerId: '', escalateToId: '', deadlineDays: '3', request: '' })
const emptyRule = (): RuleForm => ({ id: '', name: '', states: '', minTerms: '', maxTerms: '', min: '', max: '', certificate: '', route: emptyRoute() })
const number = (value: string, key: string) => value.trim() ? { [key]: Number(value) } : {}
const routeValue = (form: RouteForm) => ({ ...(form.territory.trim() ? { territory: form.territory.trim() } : {}), ownerId: form.ownerId, escalateToId: form.escalateToId, deadlineDays: Number(form.deadlineDays), ...(form.request.trim() ? { request: form.request.trim() } : {}) })
const ruleValue = (form: RuleForm) => ({ id: form.id.trim(), name: form.name.trim(), when: { ...(form.states.trim() ? { states: form.states.split(/[\s,]+/).filter(Boolean).map(state => state.toUpperCase()) } : {}), ...number(form.minTerms, 'minTermsDays'), ...number(form.maxTerms, 'maxTermsDays'), ...number(form.min, 'minVolumeUsd'), ...number(form.max, 'maxVolumeUsd'), ...(form.certificate ? { certificate: form.certificate } : {}) }, route: routeValue(form.route) })
const routeForm = (route: ApplicationRules['rules'][number]['route']): RouteForm => ({ territory: route.territory ?? '', ownerId: route.ownerId, escalateToId: route.escalateToId, deadlineDays: String(route.deadlineDays), request: route.request ?? '' })
const shown = (value?: number) => value === undefined ? '' : String(value)
const ruleForm = (rule: ApplicationRules['rules'][number]): RuleForm => ({ id: rule.id, name: rule.name, states: rule.when.states?.join(', ') ?? '', minTerms: shown(rule.when.minTermsDays), maxTerms: shown(rule.when.maxTermsDays), min: shown(rule.when.minVolumeUsd), max: shown(rule.when.maxVolumeUsd), certificate: rule.when.certificate ?? '', route: routeForm(rule.route) })

function RouteFields({ route, onChange, reviewers, label }: { route: RouteForm; onChange: (next: Partial<RouteForm>) => void; reviewers: Reviewer[]; label: string }) {
  const select = (name: string, value: string, key: 'ownerId' | 'escalateToId') => <label>{name}<select required aria-label={`${label} ${name.toLowerCase()}`} value={value} onChange={event => onChange({ [key]: event.target.value })}><option value="">Choose a current application reviewer</option>{reviewers.map(person => <option key={person.id} value={person.id}>{person.name} ({person.role})</option>)}</select></label>
  return <div className="br-form-grid">
    <label>Territory label (optional)<input aria-label={`${label} territory label`} maxLength={120} value={route.territory} onChange={event => onChange({ territory: event.target.value })} /></label>
    {select('Reviewer', route.ownerId, 'ownerId')}{select('Escalation person', route.escalateToId, 'escalateToId')}
    <label>Review deadline (days)<input required inputMode="numeric" aria-label={`${label} deadline days`} value={route.deadlineDays} onChange={event => onChange({ deadlineDays: event.target.value })} /></label>
    <label>Prepared missing-information request (optional; the reviewer reviews it before sending)<textarea aria-label={`${label} prepared request`} maxLength={1000} rows={2} value={route.request} onChange={event => onChange({ request: event.target.value })} /></label>
  </div>
}

/** AUTO-001: owner and admin people route verified applications to a reviewer with a deadline and an optional prepared request. */
export function ApplicationRules({ version, run, busy }: { version: unknown; run: RunCommand; busy: boolean }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const [rules, setRules] = useState<RuleForm[]>([]), [fallback, setFallback] = useState<RouteForm | null>(null), [reason, setReason] = useState('')
  useEffect(() => {
    let current = true
    setError('')
    void request<Data>('/api/barrow/application-rules').then(value => { if (current) { setData(value); setRules(value.rules.map(ruleForm)); setFallback(value.fallback ? routeForm(value.fallback) : null) } }).catch(cause => { if (current) { setData(null); setError(errorMessage(cause)) } })
    return () => { current = false }
  }, [version, refresh])
  if (error) return <Notice error>{error}</Notice>
  if (!data) return <p role="status">Loading application routing…</p>
  const edit = (index: number, next: Partial<RuleForm>) => setRules(list => list.map((rule, i) => i === index ? { ...rule, ...next } : rule))
  const routeOk = (route: RouteForm) => route.ownerId && route.escalateToId && Number.isInteger(Number(route.deadlineDays)) && Number(route.deadlineDays) >= 1 && Number(route.deadlineDays) <= 60
  const valid = reason.trim() && rules.every(rule => rule.id.trim() && rule.name.trim() && routeOk(rule.route)) && (!fallback || routeOk(fallback))
  async function save() { if (await run('application.rules.save', { revision: data!.revision, rules: rules.map(ruleValue), fallback: fallback ? routeValue(fallback) : null, reason: reason.trim() })) { setReason(''); setRefresh(value => value + 1) } }
  return <section className="br-card br-stack" aria-label="Application routing">
    <h2>Application routing and review deadlines</h2>
    <p>{data.notes.rule}</p><p className="br-quiet-text">{data.notes.conditions}</p>
    <form className="br-stack" aria-label="Application routing rules" onSubmit={event => { event.preventDefault(); void save() }}>
      <fieldset disabled={busy} className="br-stack">
        {rules.map((rule, index) => <fieldset className="br-card br-stack" key={index} aria-label={`Routing rule ${index + 1}`}><legend>Rule {index + 1}</legend>
          <div className="br-form-grid">
            <label>Rule ID<input required maxLength={40} value={rule.id} onChange={event => edit(index, { id: event.target.value })} /></label>
            <label>Rule name<input required maxLength={80} value={rule.name} onChange={event => edit(index, { name: event.target.value })} /></label>
            <label>Requested location states (comma separated)<input value={rule.states} onChange={event => edit(index, { states: event.target.value })} /></label>
            <label>Requested terms at least (days)<input inputMode="numeric" value={rule.minTerms} onChange={event => edit(index, { minTerms: event.target.value })} /></label>
            <label>Requested terms at most (days)<input inputMode="numeric" value={rule.maxTerms} onChange={event => edit(index, { maxTerms: event.target.value })} /></label>
            <label>Expected volume at least (USD)<input inputMode="numeric" value={rule.min} onChange={event => edit(index, { min: event.target.value })} /></label>
            <label>Expected volume at most (USD)<input inputMode="numeric" value={rule.max} onChange={event => edit(index, { max: event.target.value })} /></label>
            <label>Certificate<select aria-label="Certificate condition" value={rule.certificate} onChange={event => edit(index, { certificate: event.target.value })}><option value="">Either</option><option value="missing">No document attached</option><option value="complete">A document attached</option></select></label>
          </div>
          <RouteFields route={rule.route} onChange={next => edit(index, { route: { ...rule.route, ...next } })} reviewers={data.reviewers} label={`Rule ${index + 1}`} />
          <div className="br-actions"><button type="button" className="br-danger" onClick={() => setRules(list => list.filter((_, i) => i !== index))}>Remove rule {index + 1}</button></div>
        </fieldset>)}
        {!rules.length && <p>No routing rules: every verified application goes to the fallback, or to the owner with a three-day deadline.</p>}
        <div className="br-actions"><button type="button" className="br-secondary" disabled={rules.length >= 50} onClick={() => setRules(list => [...list, emptyRule()])}>Add a rule</button>
          <button type="button" className="br-secondary" onClick={() => setFallback(value => value ? null : emptyRoute())}>{fallback ? 'Remove fallback' : 'Add a fallback route'}</button></div>
        {fallback && <fieldset className="br-card br-stack" aria-label="Fallback route"><legend>Fallback for unmatched applications</legend><RouteFields route={fallback} onChange={next => setFallback(value => ({ ...value!, ...next }))} reviewers={data.reviewers} label="Fallback" /></fieldset>}
        <label>Reason for this routing change<textarea required maxLength={1000} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="br-actions"><button disabled={busy || !valid}>Save application routing</button></div>
      </fieldset>
    </form>
  </section>
}
