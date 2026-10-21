import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money } from './types'
import { CommissionSettings } from './commission-settings'
import type { commissionReport } from '../commission-report'

type Report=Awaited<ReturnType<typeof commissionReport>>
export function Commissions() {
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[rep,setRep]=useState(''),[version,setVersion]=useState(0)
 const query=new URLSearchParams(rep?{rep}:{})
 useEffect(()=>{let active=true;setError('');setReport(null);void request<Report>(`/api/barrow/reports/commissions?${query}`).then(value=>{if(active)setReport(value)}).catch(e=>{if(active)setError(errorMessage(e))});return()=>{active=false}},[rep,version])
 const amount=(value:number|null,currency:string)=>value===null?'Not recorded':money(value,currency as 'USD'|'AUD')
 return <section className="br-card br-stack" aria-label="Rep commissions"><h2>Rep commissions</h2>
  <p>Commission statements use the original approved merchandise prices and split. Physical returns reverse the original commission; a return does not assert a credit or refund.</p>
  <label>Statement rep<input value={rep} onChange={e=>setRep(e.target.value)} placeholder="All reps"/></label>
  {error&&<Notice error>{error}</Notice>}
  {report&&<>
   <p>{report.historicalUnrecorded} earlier approved orders have no recorded attribution. {report.unmatchedLines} lines had no matching rule at approval.</p>
   {report.totals.map(total=><p key={`${total.currency}-${total.rep}`}><strong>{total.rep||'Unassigned'} · {total.currency}</strong> · Earned {amount(total.grossCents,total.currency)} · Reversed {amount(total.reversedCents,total.currency)} · Net {amount(total.netCents,total.currency)}</p>)}
   {!report.rows.length&&<p>No recorded commission lines match this rep. Earlier orders without approval-time attribution are not reconstructed.</p>}
   <div className="br-stack">{report.rows.map((row,i)=><article className="br-card br-stack" key={`${row.orderId}-${row.line}-${row.rep}-${i}`}>
    <h3>{row.rep} · {row.sku}</h3><p><a href={`/api/barrow/orders/${row.orderId}`}>{row.orderId}</a> · line {row.line} · {row.accountId}</p>
    <p>Rule {row.ruleId??'not recorded'} · {row.basis??'not recorded'} · {row.rateBps===null?'Not recorded':`${row.rateBps/100}% commission`} · {row.shareBps===null?'Not recorded':`${row.shareBps/100}% share`}</p>
    {row.reason&&<p>{row.basis==='payment'?'Verified payment allocations are not recorded; earnings on payment remain unknown.':row.reason}</p>}
    <details><summary>Original basis and source records</summary><p>Approved {row.acceptedAt}. Policy revision {row.ruleRevision??'not recorded'}. Original assigned rep: {row.assignedRep||'not recorded'}.</p><p>Merchandise basis {amount(row.basisCents,row.currency)} · Cancelled {amount(row.cancelledBasisCents,row.currency)} · Returned {amount(row.returnedBasisCents,row.currency)}. Basis amounts repeat for each split.</p><p>Pier order: {row.sourceOrderId??'not recorded'} · line: {row.sourceLineId??'not recorded'}</p><p>Shipments: {row.shipmentIds.join(', ')||'none recorded'}. Returns: {row.returnIds.join(', ')||'none recorded'}. Source: {row.source}.</p></details>
    <p>Earned {amount(row.grossCents,row.currency)} · Reversed {amount(row.reversedCents,row.currency)} · Net {amount(row.netCents,row.currency)}</p>
   </article>)}</div>
   {report.exceptions.map(row=><Notice key={row.orderId}>{row.orderId}: {row.reason}</Notice>)}
   <p className="br-quiet-text">Payment information and credit notes are not recorded. Payment-based commission remains unknown.</p>
   <details><summary>How commissions are calculated</summary><p>{report.notes.attribution}</p><p>{report.notes.precedence}</p><p>{report.notes.amounts}</p><p>{report.notes.rounding.replace('BigInt ratios','Quantity ratios')}</p><p>{report.notes.returns}</p></details>
   <div className="br-actions"><a className="br-secondary" href={`/api/barrow/reports/commissions.csv?${query}`} download>Download commission statement (CSV)</a></div>
  </>}
  <CommissionSettings onSaved={()=>setVersion(value=>value+1)}/>
 </section>
}
