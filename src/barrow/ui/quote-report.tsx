import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, when } from './types'
import type { quoteReport } from '../quote-report'
type Report = Awaited<ReturnType<typeof quoteReport>>
type Row = Report['totals']

const pct = (rate: { numerator: number; denominator: number; bps: number | null }) => `${rate.bps === null ? 'not applicable' : `${(rate.bps / 100).toFixed(2)}%`} (${rate.numerator} of ${rate.denominator})`
const cents = (value: number | null) => value === null ? 'unknown: Pier unavailable' : money(value)

function Measures({ row }: { row: Row }) {
  return <>
    <p>Quotes {row.quotes.requested} · responded {row.quotes.responded} · could accept {row.quotes.offered} · accepted {row.quotes.accepted} · revised {row.quotes.revised} · expired {row.quotes.expired} · open {row.quotes.open}</p>
    <p>Response {pct(row.responseRate)} · acceptance {pct(row.acceptanceRate)}</p>
    <p>Accepted orders {row.acceptedOrders}: {money(row.acceptedCents)} · quote discounts {money(row.quoteDiscountCents)} · returned {cents(row.returnedCents)} · net {cents(row.netAcceptedCents)}</p>
    <p>Drafts {row.carts.drafts} · abandoned {row.carts.abandoned} · placed {row.carts.placed} · abandonment {pct(row.carts.abandonmentRate)} · reorders {pct(row.reorderRate)}</p>
  </>
}

// RPT-002: quote conversion, carts and reorders for the owner and admins acting as sales managers.
export function QuoteReport() {
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState('')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [view, setView] = useState<'byRep' | 'byCohort' | 'byProduct'>('byRep')
  useEffect(() => {
    let current = true
    setError('')
    void request<Report>(`/api/barrow/reports/quotes?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`).then(value => { if (current) setReport(value) }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [from, to])
  return <div className="br-card br-stack"><h2>Quote conversion</h2>
    <div className="br-form-grid"><label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <label>Compare by<select value={view} onChange={event => setView(event.target.value as typeof view)}><option value="byRep">Rep</option><option value="byCohort">Cohort</option><option value="byProduct">Product</option></select></label></div>
    {error && <Notice error>{error}</Notice>}
    {report && <>
      <p className="br-quiet-text">{report.definitions.period} USD. Read {when(report.checkedAt)}{report.returnsSource === 'unavailable' ? ' · Pier unavailable: returns unknown' : ''}.</p>
      <Measures row={report.totals} />
      {report[view].map(row => <article className="br-card br-stack" key={row.name}><h3>{row.name}</h3><Measures row={row} /></article>)}
      <details><summary>How each figure is counted</summary><dl>{Object.entries(report.definitions).map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl></details>
      {report.notRecorded.map(item => <p className="br-quiet-text" key={item.measure}>{item.measure}: not recorded. {item.note}</p>)}
    </>}
  </div>
}
