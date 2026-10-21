import { useEffect, useState, type ReactNode } from 'react'
import { errorMessage, request } from './api'
import { Notice } from './primitives'
import { staffReports, staffRoles, type StaffPolicy } from './staff-policy-fields'
import { money, when, type Account, type Order, type RunCommand } from './types'

type ReportName = StaffPolicy['reports'][number]
type RecordValue = Record<string, unknown>
type Actor = { id: string; email?: string; staff?: StaffPolicy | null }
type Props = { actor: Actor; accounts: Account[]; orders: Order[]; people: Record<string, string>; run: RunCommand; busy: boolean; version: unknown; onOpen: (order: Order) => void }
const columns: Record<ReportName, string[]> = {
  sales: ['account', 'sku', 'bookedCents', 'shippedCents', 'invoicedCents', 'outstandingCents'],
  finance: ['account', 'invoiceNumber', 'dueAt', 'amountCents', 'bucket'],
  quotes: ['name', 'quotes', 'acceptedCents', 'responseRate', 'acceptanceRate'],
  fulfillment: ['customer', 'sku', 'ordered', 'shipped', 'backordered', 'outstanding'],
  commissions: ['rep', 'account', 'sku', 'grossCents', 'reversedCents', 'netCents'],
}
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, value => value.toUpperCase())
const object = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const safeSource = (value: unknown) => typeof value === 'string' && value.startsWith('/api/barrow/') && !/[\r\n\\]/.test(value)

function Fact({ value, name = '', currency }: { value: unknown; name?: string; currency?: unknown }): ReactNode {
  if (value === null || value === undefined) return <>Unknown / not recorded</>
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>
  if (typeof value === 'number' && name.endsWith('Cents')) return <>{currency === 'USD' || currency === 'AUD' ? money(value, currency) : `${value} cents`}</>
  if (typeof value === 'number' && /Bps$|^bps$|BasisPoints$/.test(name)) return <>{(value / 100).toFixed(2)}%</>
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={index}><Fact value={item} currency={currency} /></li>)}</ul> : <>None recorded</>
  if (object(value)) return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{label(key)}</dt><dd><Fact name={key} value={item} currency={value.currency ?? currency} /></dd></div>)}</dl>
  if (safeSource(value)) return <a href={String(value)}>Open source record</a>
  return <>{String(value) || 'Not recorded'}</>
}

function ReportResult({ report, type }: { report: RecordValue; type: ReportName }) {
  const [group, setGroup] = useState('byRep')
  const rowsValue = type === 'quotes' ? report[group] : report[type === 'fulfillment' ? 'lines' : 'rows']
  const rows = Array.isArray(rowsValue) ? rowsValue.filter(object) : []
  return <div className="br-stack">
    <p className="br-quiet-text">{typeof report.checkedAt === 'string' && `Read ${when(report.checkedAt)}. `}{typeof report.timeZone === 'string' && `Reporting zone: ${report.timeZone}. `}{typeof report.currency === 'string' && `Currency: ${report.currency}.`}</p>
    {(report.status === 'unavailable' || report.source === 'unavailable' || report.returnsSource === 'unavailable') && <Notice>Source information is unavailable. Unconfirmed measures remain unknown.</Notice>}
    {report.totals !== undefined && <section aria-label="Report totals"><h3>Report totals</h3><Fact value={report.totals} currency={report.currency} /></section>}
    {type === 'quotes' && <label>Compare quote results by<select aria-label="Compare quote results by" value={group} onChange={event => setGroup(event.target.value)}><option value="byRep">Rep</option><option value="byCohort">Cohort</option><option value="byProduct">Product</option></select></label>}
    <div className="br-table-wrap" role="region" aria-label={`${staffReports[type]} report rows`} tabIndex={0}>
      <table><caption>{staffReports[type]} · {rows.length} report rows</caption><thead><tr>{columns[type].map(key => <th scope="col" key={key}>{label(key)}</th>)}<th scope="col">Source and details</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.orderId ?? row.name ?? 'row'}:${row.line ?? index}:${row.rep ?? ''}`}>
          {columns[type].map(key => <td key={key}><Fact name={key} value={row[key]} currency={row.currency ?? report.currency} /></td>)}
          <td>{typeof row.orderId === 'string' && <a href={`/api/barrow/orders/${encodeURIComponent(row.orderId)}`}>Order {row.orderId}</a>}
            <details className="br-details"><summary>Recorded details</summary><Fact value={row} currency={report.currency} /></details>
          </td>
        </tr>)}</tbody>
      </table>
    </div>
    {!rows.length && <p>No source rows match these filters.</p>}
    {Array.isArray(report.exceptions) && report.exceptions.length > 0 && <Notice error><h3>Source exceptions</h3><Fact value={report.exceptions} /></Notice>}
    <details className="br-details"><summary>Source notes and definitions</summary>
      <Fact value={Object.fromEntries(Object.entries(report).filter(([key]) => !['totals', 'rows', 'lines', 'lateLines', 'byAccount', 'bySku', 'byChannel', 'byTerritory', 'byMonth', 'byRep', 'byCohort', 'byProduct', 'exceptions'].includes(key)))} />
    </details>
  </div>
}

export function StaffWorkspace({ actor, accounts, run, busy, version }: Props) {
  const grant = actor.staff
  const [type, setType] = useState<ReportName | ''>(''), [accountId, setAccountId] = useState(''), [warehouse, setWarehouse] = useState('')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [asOf, setAsOf] = useState('')
  const [query, setQuery] = useState(''), [report, setReport] = useState<{ key: string; value: RecordValue } | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0)
  const signature = JSON.stringify(grant), selected = grant?.reports.includes(type as ReportName) ? type as ReportName : ''
  const key = `${signature}:${query}`
  const permittedAccounts = grant?.accounts === 'all' ? accounts : (grant?.accounts ?? []).map(id => accounts.find(account => account.id === id) ?? { id, value: { name: id } })
  const chosenAccountAllowed = accountId === '__all__' ? grant?.accounts === 'all' : Boolean(accountId) && (grant?.accounts === 'all' || Boolean(grant?.accounts.includes(accountId)))
  const chosenWarehouseAllowed = warehouse === '__all__' ? grant?.warehouses === 'all' : Boolean(warehouse) && (grant?.warehouses === 'all' || Boolean(grant?.warehouses.includes(warehouse)))
  const canRead = Boolean(selected && chosenAccountAllowed && (selected !== 'fulfillment' || chosenWarehouseAllowed))
  useEffect(() => { setQuery(''); setReport(null); setError('') }, [signature])
  useEffect(() => {
    if (!query) { setLoading(false); return }
    let current = true
    setLoading(true); setError(''); setReport(null)
    void request<RecordValue>(query).then(value => { if (current) setReport({ key, value }) }).catch(cause => { if (current) setError(errorMessage(cause)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [query, key, version, refresh])
  function read() {
    if (!canRead || !selected) return
    const params = new URLSearchParams()
    if (accountId !== '__all__') params.set('accountId', accountId)
    if (selected === 'fulfillment' && warehouse !== '__all__') params.set('warehouse', warehouse)
    if (selected === 'sales' || selected === 'quotes') { if (from) params.set('from', from); if (to) params.set('to', to) }
    if (selected === 'finance' && asOf) params.set('asOf', asOf)
    if (selected === 'commissions' && grant?.commissionRep) params.set('rep', grant.commissionRep)
    const next = `/api/barrow/reports/${selected}?${params}`
    setQuery(next); setReport(null)
    setRefresh(value => value + 1)
  }
  const visible = report?.key === key && selected && query.startsWith(`/api/barrow/reports/${selected}?`) ? report.value : null
  return <div className="br-stack">
    <section className="br-card br-stack" aria-labelledby="staff-reports-title"><h2 id="staff-reports-title">Your staff reports</h2>
      {grant && <p><span className="br-badge">{staffRoles[grant.role]}</span> · {grant.accounts === 'all' ? 'All-account access' : `${grant.accounts.length} scoped accounts`} · {grant.warehouses === 'all' ? 'All warehouses' : grant.warehouses.join(', ') || 'No warehouses granted'}</p>}
      <p>Choose a report and its whole account scope. Each read and download checks your current access. Source records and unknown measures are retained as reported.</p>
      {!grant?.reports.length ? <p>No direct reports are granted to this sign-in. Ask the owner to change your functional policy.</p> : <form className="br-stack" onSubmit={event => { event.preventDefault(); read() }}>
        <div className="br-form-grid"><label>Entitled report<select aria-label="Entitled report" required value={selected} onChange={event => { setType(event.target.value as ReportName); setQuery(''); setReport(null); setError('') }}><option value="">Choose a report</option>{grant.reports.map(name => <option key={name} value={name}>{staffReports[name]}</option>)}</select></label>
          <label>Report account<select aria-label="Report account" required value={accountId} onChange={event => { setAccountId(event.target.value); setQuery(''); setReport(null) }}><option value="">Choose an explicit scope</option>{grant.accounts === 'all' && <option value="__all__">All trade accounts</option>}{permittedAccounts.map(account => <option key={account.id} value={account.id}>{account.value.name}</option>)}</select></label>
          {selected === 'fulfillment' && <label>Report warehouse<select aria-label="Report warehouse" required value={warehouse} onChange={event => { setWarehouse(event.target.value); setQuery(''); setReport(null) }}><option value="">Choose an explicit warehouse scope</option>{grant.warehouses === 'all' ? <option value="__all__">All warehouses</option> : grant.warehouses.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
          {(selected === 'sales' || selected === 'quotes') && <><label>From<input type="date" value={from} onChange={event => { setFrom(event.target.value); setQuery(''); setReport(null) }} /></label><label>To<input type="date" min={from || undefined} value={to} onChange={event => { setTo(event.target.value); setQuery(''); setReport(null) }} /></label></>}
          {selected === 'finance' && <label>As of<input type="date" value={asOf} onChange={event => { setAsOf(event.target.value); setQuery(''); setReport(null) }} /></label>}
        </div>
        {selected === 'commissions' && grant.commissionRep && <p>Fixed rep attribution: {grant.commissionRep}</p>}
        <div className="br-actions"><button disabled={busy || loading || !canRead}>{loading ? 'Reading report…' : 'Read scoped report'}</button></div>
      </form>}
      {error && <Notice error>{error}</Notice>}
      {loading && <p role="status">Reading current source facts…</p>}
      {visible && selected && <><ReportResult key={query} type={selected} report={visible} /><div className="br-actions">
        <a className="br-secondary" href={query} download>Download scoped report (JSON)</a>
        {['sales', 'finance', 'commissions'].includes(selected) && <a className="br-secondary" href={query.replace('?', '.csv?')} download>Download scoped report (CSV)</a>}
      </div></>}
    </section>
    {grant && <OwnScheduledReports actorId={actor.id} version={version} busy={busy} run={run} />}
  </div>
}

type Schedules = {
  viewer: string
  schedules: { id: string; name: string; report_type: string; filters: Record<string, string>; recipients: { operator_id: string; removed_at?: string | null }[] }[]
  runs: { id: string; schedule_id: string; period: string; as_of: string; expires_at: string; status: string; reason?: string | null }[]
}
function OwnScheduledReports({ actorId, version, busy, run }: { actorId: string; version: unknown; busy: boolean; run: RunCommand }) {
  const [state, setState] = useState<Schedules | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let current = true
    setError(''); setState(null)
    void request<Schedules>('/api/barrow/report-schedules').then(value => { if (current) setState(value) }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [actorId, version, refresh])
  const own = state?.viewer === actorId ? state.schedules.filter(schedule => schedule.recipients.some(recipient => recipient.operator_id === actorId && !recipient.removed_at)) : []
  const runs = state?.viewer === actorId ? state.runs : []
  return <section className="br-card br-stack" aria-labelledby="staff-snapshots-title"><h2 id="staff-snapshots-title">Your scheduled snapshots</h2>
    <p>Frozen reports belong to the exact recipient. Downloads check your current entitlement to the whole saved snapshot. Removing yourself revokes existing links and queued notifications.</p>
    {error && <Notice error>{error}<button type="button" className="br-quiet" onClick={() => setRefresh(value => value + 1)} disabled={busy}>Refresh your snapshots</button></Notice>}
    {!state && !error && <p role="status">Loading your scheduled reports…</p>}
    {state && <>{!own.length && <p>No active report subscriptions for this sign-in.</p>}{own.map(schedule => <article className="br-card br-stack" key={schedule.id}><h3>{schedule.name}</h3>
      <p>{staffReports[schedule.report_type as ReportName] ?? schedule.report_type}</p><Fact value={schedule.filters} />
      <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => void run('report.remove-recipient', { scheduleId: schedule.id }).then(done => { if (done) setRefresh(value => value + 1) })}>Remove me from {schedule.name}</button></div>
    </article>)}
      <h3>Your frozen report history</h3>{!runs.length && <p>No snapshots have been recorded for you yet.</p>}
      {runs.map(snapshot => <article className="br-card br-stack" key={snapshot.id}><h4>{state.schedules.find(schedule => schedule.id === snapshot.schedule_id)?.name ?? 'Saved report'} · {snapshot.period}</h4>
        <p>As of {snapshot.as_of} · Expires {when(snapshot.expires_at)}</p><p>Notification: {snapshot.status}{snapshot.reason ? ` · ${snapshot.reason}` : ''}</p>
        <a href={`/api/barrow/report-runs/${encodeURIComponent(snapshot.id)}.json`} download>Download this frozen snapshot</a>
      </article>)}
    </>}
  </section>
}
