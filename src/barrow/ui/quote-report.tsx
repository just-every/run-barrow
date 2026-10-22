import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, when } from './types'
import type { quoteReport } from '../quote-report'
type Report = Awaited<ReturnType<typeof quoteReport>>
type Row = Report['totals']

const pct = (rate: { numerator: number; denominator: number; bps: number | null }) => `${rate.bps === null ? 'not applicable' : `${(rate.bps / 100).toFixed(2)}%`} (${rate.numerator} of ${rate.denominator})`
const cents = (value: number | null,currency:'USD'|'CAD'|'AUD'='USD') => value === null ? 'unknown: Pier unavailable' : money(value,currency)

function Measures({ row,currency }: { row: Row; currency:'USD'|'CAD'|'AUD' }) {
  return <>
    <p>Quotes {row.quotes.requested} · responded {row.quotes.responded} · could accept {row.quotes.offered} · accepted {row.quotes.accepted} · revised {row.quotes.revised} · expired {row.quotes.expired} · open {row.quotes.open}</p>
    <p>Response {pct(row.responseRate)} · acceptance {pct(row.acceptanceRate)}</p>
    <p>Accepted orders {row.acceptedOrders}: {money(row.acceptedCents,currency)} · quote discounts {money(row.quoteDiscountCents,currency)} · returned {cents(row.returnedCents,currency)} · net {cents(row.netAcceptedCents,currency)}</p>
    <p>Drafts {row.carts.drafts} · abandoned {row.carts.abandoned} · placed {row.carts.placed} · abandonment {pct(row.carts.abandonmentRate)} · reorders {pct(row.reorderRate)}</p>
  </>
}

// RPT-002: quote conversion, carts and reorders for the owner and admins acting as sales managers.
export function QuoteReport() {
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState('')
  const [currency,setCurrency]=useState<'USD'|'CAD'|'AUD'>('USD')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [view, setView] = useState<'byRep' | 'byCohort' | 'byProduct'>('byRep')
  useEffect(() => {
    let current = true
    setError('')
    void request<Report>(`/api/barrow/reports/quotes?${new URLSearchParams({ currency, ...(from ? { from } : {}), ...(to ? { to } : {}) })}`).then(value => { if (current) setReport(value) }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [from, to,currency])
  return <div className="br-card br-stack"><h2>Quote conversion</h2>
    <div className="br-form-grid"><label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <label>Currency<select value={currency} onChange={e=>setCurrency(e.target.value as typeof currency)}><option>USD</option><option>CAD</option><option>AUD</option></select></label><label>Compare by<select value={view} onChange={event => setView(event.target.value as typeof view)}><option value="byRep">Rep</option><option value="byCohort">Cohort</option><option value="byProduct">Product</option></select></label></div>
    {error && <Notice error>{error}</Notice>}
    {report && <>
      <p className="br-quiet-text">{report.definitions.period} Read {when(report.checkedAt)}{report.returnsSource === 'unavailable' ? ' · Pier unavailable: returns unknown' : ''}.</p>
      <Measures row={report.totals} currency={currency} />
      <section aria-label="Line-sheet engagement"><h3>Line-sheet engagement per buyer</h3>{report.lineSheets.length===0?<p>No buyer activity in this period.</p>:report.lineSheets.map(row=><p key={`${row.sheetId}:${row.buyerId}`}>{row.accountId} · Buyer {row.buyerId} · Sheet {row.sheetId}: opens {row.opens}, views {row.views}, items viewed {row.itemsViewed}. {row.bySku.map(item=>`${item.sku}: ${item.views}`).join('; ')}</p>)}</section>
      {report[view].map(row => <article className="br-card br-stack" key={row.name}><h3>{row.name}</h3><Measures row={row} currency={currency} /></article>)}
      <details><summary>How each figure is counted</summary><dl>{Object.entries(report.definitions).map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl></details>
      {report.notRecorded.map(item => <p className="br-quiet-text" key={item.measure}>{item.measure}: not recorded. {item.note}</p>)}
    </>}
  </div>
}
