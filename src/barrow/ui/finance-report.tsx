import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, when } from './types'
import type { financeReport } from '../finance-report'

type Report = Awaited<ReturnType<typeof financeReport>>
const amount = (cents: number, currency: string) => money(cents, currency as 'USD' | 'AUD')

// RPT-004: invoice aging by frozen due date. No payment or ledger fact is inferred.
export function FinanceReport() {
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState('')
  const [filter, setFilter] = useState({ asOf: '', accountId: '', assignedRep: '' })
  const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value.trim()))
  useEffect(() => {
    let active = true
    setReport(null); setError('')
    void request<Report>(`/api/barrow/reports/finance?${query}`).then(value => { if (active) setReport(value) }).catch(cause => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [String(query)])
  return <div className="br-card br-stack"><h2>Invoice aging and finance</h2>
    <div className="br-form-grid">
      <label>As of<input type="date" value={filter.asOf} onChange={event => setFilter(value => ({ ...value, asOf: event.target.value }))} /></label>
      <label>Account ID<input value={filter.accountId} onChange={event => setFilter(value => ({ ...value, accountId: event.target.value }))} /></label>
      <label>Assigned rep<input value={filter.assignedRep} onChange={event => setFilter(value => ({ ...value, assignedRep: event.target.value }))} /></label>
    </div>
    {error && <Notice error>{error}</Notice>}
    {report && <>
      <p className="br-quiet-text">As of {report.asOf} · {report.timeZone} · read {when(report.checkedAt)}.</p>
      <p className="br-quiet-text">{report.notes.amounts}</p>
      {report.totals.map(total => <article className="br-card br-stack" key={total.currency}><h3>{total.currency} invoiced totals</h3>
        <p>Total {amount(total.totalCents, total.currency)}</p>
        {Object.entries(total.buckets).map(([bucket, cents]) => <p key={bucket}>{bucket}: {amount(cents, total.currency)}</p>)}
      </article>)}
      {!report.rows.length && <p>No invoices match this date and these filters.</p>}
      <details><summary>Invoice sources ({report.rows.length})</summary><ul>{report.rows.map(row => <li key={row.orderId}>{row.account} · <a href={row.invoicePath} download>{row.invoiceNumber}</a> · {amount(row.amountCents, row.currency)} · due {row.dueAt} · {row.overdueDays} days overdue · {row.bucket}<br /><a href={row.orderPath}>Order</a> · <a href={row.statementPath}>Account statement</a></li>)}</ul></details>
      <p className="br-quiet-text">{report.notes.dates} {report.notes.unrecorded} {report.notes.access}</p>
      <div className="br-actions"><a className="br-secondary" href={`/api/barrow/reports/finance.csv?${query}`} download>Download invoice aging (CSV)</a></div>
    </>}
  </div>
}
