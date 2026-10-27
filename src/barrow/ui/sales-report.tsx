import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, orderNumber, when } from './types'
import type { salesReport } from '../sales-report'
type Report = Awaited<ReturnType<typeof salesReport>>
type Totals = Report['totals']

const amount = (cents: number | null, currency: string) => cents === null ? 'unknown' : money(cents, currency as 'USD' | 'AUD')
function TotalsLine({ totals }: { totals: Totals }) {
  return <>{totals.map(row => <p key={row.currency}>{row.currency} · {row.orders} orders, {row.lines} lines · booked {amount(row.bookedCents, row.currency)} · shipped {amount(row.shippedCents, row.currency)} · invoiced {amount(row.invoicedCents, row.currency)} · paid {amount(row.paidCents, row.currency)} · credited {amount(row.creditedCents, row.currency)} · applied credits {amount(row.appliedCreditCents, row.currency)} · outstanding {amount(row.outstandingCents, row.currency)} (merchandise) · freight booked {amount(row.freightCents,row.currency)}, invoiced {amount(row.invoicedFreightCents,row.currency)}, credited {amount(row.creditedFreightCents,row.currency)}, paid {amount(row.paidFreightCents,row.currency)}, applied credits {amount(row.appliedFreightCreditCents,row.currency)}, outstanding {amount(row.outstandingFreightCents,row.currency)}</p>)}</>
}

// RPT-001: booked, shipped, invoiced and outstanding sales by account, SKU, channel, territory and month.
export function SalesReport() {
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState('')
  const [filter, setFilter] = useState({ from: '', to: '', territory: '', channel: '' }), [view, setView] = useState<'byAccount' | 'bySku' | 'byChannel' | 'byTerritory' | 'byMonth'>('byAccount')
  const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value.trim()))
  useEffect(() => {
    let current = true
    setError('')
    void request<Report>(`/api/barrow/reports/sales?${query}`).then(value => { if (current) setReport(value) }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [String(query)])
  const input = (name: keyof typeof filter, label: string, type = 'text') => <label>{label}<input type={type} value={filter[name]} onChange={event => setFilter(value => ({ ...value, [name]: event.target.value }))} /></label>
  return <div className="br-card br-stack"><h2>Sales by account and product</h2>
    <div className="br-form-grid">{input('from', 'From', 'date')}{input('to', 'To', 'date')}{input('territory', 'Territory')}{input('channel', 'Channel')}
      <label>Compare by<select value={view} onChange={event => setView(event.target.value as typeof view)}><option value="byAccount">Account</option><option value="bySku">SKU</option><option value="byChannel">Channel</option><option value="byTerritory">Territory</option><option value="byMonth">Month</option></select></label></div>
    {error && <Notice error>{error}</Notice>}
    {report && <>
      <p className="br-quiet-text">{report.notes.period} {report.notes.amounts} Read {when(report.checkedAt)}.</p>
      <TotalsLine totals={report.totals} />
      {report[view].map(group => <article className="br-card br-stack" key={group.name}><h3>{group.name}</h3><TotalsLine totals={group.totals} /></article>)}
      <details><summary>Document lines ({report.rows.length})</summary><ul>{report.rows.map(row => <li key={`${row.orderId}:${row.line}`}>{orderNumber(String(row.orderId))} line {row.line} · USD conversion {row.usdCents===null?'not recorded':amount(Number(row.usdCents),'USD')} · basis {row.usdConversionDate||'not recorded'} {row.usdConversionSource} ({row.usdRateNumerator??'—'} to {row.usdRateDenominator??'—'}) · {row.account} · {row.sku} · booked {amount(row.bookedCents as number, String(row.currency))} · paid {amount(row.paidCents as number, String(row.currency))} · credited {amount(row.creditedCents as number, String(row.currency))} · applied credits {amount(row.appliedCreditCents as number, String(row.currency))} · outstanding {amount(row.outstandingCents as number, String(row.currency))} · freight {amount(row.freightCents as number,String(row.currency))}, outstanding {amount(row.outstandingFreightCents as number, String(row.currency))}{row.invoiceNumber ? <> · <a href={String(row.invoicePath)} download>invoice {row.invoiceNumber}</a></> : ' · not invoiced'}</li>)}</ul></details>
      <p className="br-quiet-text">{report.notes.conversion} {report.notes.shipped} {report.notes.payments} {report.notes.season}</p>
      <div className="br-actions"><a className="br-secondary" href={`/api/barrow/reports/sales.csv?${query}`} download>Download lines (CSV)</a></div>
    </>}
  </div>
}
