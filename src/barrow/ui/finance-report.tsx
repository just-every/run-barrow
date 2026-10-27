import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, when } from './types'
import type { financeReport } from '../finance-report'

type Report = Awaited<ReturnType<typeof financeReport>>
const amount = (cents: number, currency: string) => money(cents, currency as 'USD' | 'AUD')

// RPT-004: invoice aging by frozen due date and explicit verified financial effects.
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
  return <div className="br-card br-stack" style={{overflowWrap:'anywhere',minWidth:0}}><h2>Invoice aging and finance</h2>
    <div className="br-form-grid">
      <label>As of<input type="date" value={filter.asOf} onChange={event => setFilter(value => ({ ...value, asOf: event.target.value }))} /></label>
      <label>Account ID<input value={filter.accountId} onChange={event => setFilter(value => ({ ...value, accountId: event.target.value }))} /></label>
      <label>Assigned rep<input value={filter.assignedRep} onChange={event => setFilter(value => ({ ...value, assignedRep: event.target.value }))} /></label>
    </div>
    {error && <Notice error>{error}</Notice>}
    {report && <>
      <p className="br-quiet-text">As of {report.asOf} · {report.timeZone} · read {when(report.checkedAt)}.</p>
      <p className="br-quiet-text">{report.notes.amounts}</p>
      {report.totals.map(total => <article className="br-card br-stack" key={total.currency}><h3>{total.currency} outstanding totals</h3>
        <p>Outstanding {amount(total.totalCents, total.currency)} · invoiced {amount(total.invoicedCents, total.currency)} · paid {amount(total.paidCents, total.currency)} · applied credits {amount(total.appliedCreditCents, total.currency)}</p>
        {Object.entries(total.buckets).map(([bucket, cents]) => <p key={bucket}>{bucket}: {amount(cents, total.currency)}</p>)}
      </article>)}
      {report.creditAccounts.map(row=><article className="br-card br-stack" key={row.accountId}><h3>{row.account} current credit</h3><p>{row.currency} · limit {amount(row.limitCents!,row.currency)} · exposure {amount(row.exposureCents,row.currency)} · available {amount(row.availableCents!,row.currency)}</p><ul>{row.rows.map(source=><li key={source.orderId}><a href={source.path}>{source.orderId}</a> · {source.kind} · {amount(source.exposureCents,source.currency)}</li>)}</ul></article>)}
      {!report.rows.length && <p>No invoices match this date and these filters.</p>}
      <details><summary>Invoice sources ({report.rows.length})</summary><ul>{report.rows.map(row => <li key={row.orderId}>{row.account} · <a href={row.invoicePath} download>{row.invoiceNumber}</a> · invoiced {amount(row.amountCents, row.currency)} · paid {amount(row.paidCents, row.currency)} · applied credits {amount(row.appliedCreditCents, row.currency)} · outstanding {amount(row.outstandingCents, row.currency)} · due {row.dueAt} · {row.overdueDays} days overdue · {row.bucket}<br /><a href={row.orderPath}>Order</a> · <a href={row.statementPath}>Account statement</a></li>)}</ul></details>
      <details><summary>Refund status ({report.refundStatus.length})</summary>{report.refundStatus.length ? <ul>{report.refundStatus.map(refund => <li key={refund.id}><a href={refund.path}>{refund.id}</a> · {refund.status} · {amount(refund.amountCents, refund.currency)} · order {refund.orderId} · <a href={refund.creditPath}>Credit note</a> · provider {refund.providerRefundId || refund.providerPaymentId} · updated {when(refund.updatedAt)}</li>)}</ul> : <p>No refund status recorded within this date and these filters.</p>}</details>
      <p className="br-quiet-text">{report.notes.dates} {report.notes.unrecorded} {report.notes.access}</p>
      <div className="br-actions"><a className="br-secondary" href={`/api/barrow/reports/finance.csv?${query}`} download>Download invoice aging (CSV)</a></div>
    </>}
  </div>
}
