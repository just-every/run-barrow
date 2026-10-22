import { useEffect, useState } from 'react'
import type { repPerformance } from '../rep-performance'
import { errorMessage, request } from './api'
import { Notice } from './primitives'
import type { RunCommand } from './types'

type Report = Awaited<ReturnType<typeof repPerformance>>
/** RPT-005 activity goals do not alter commission rates, approvals or payroll. */
export function RepPerformance({version,run,busy}:{version:unknown;run:RunCommand;busy:boolean}) {
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[refresh,setRefresh]=useState(0)
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[accountId,setAccountId]=useState(''),[rep,setRep]=useState('')
 const [userId,setUserId]=useState(''),[completedVisits,setCompletedVisits]=useState('0'),[newAccounts,setNewAccounts]=useState('0'),[reason,setReason]=useState('')
 useEffect(()=>{let active=true;setError('');setReport(null);void request<Report>(`/api/barrow/reports/rep-performance?${query}`).then(value=>{if(active)setReport(value)}).catch(cause=>{if(active)setError(errorMessage(cause))});return()=>{active=false}},[query,refresh,version])
 const target=report?.targets.find(row=>row.userId===userId)
 function filter(){const params=new URLSearchParams();for(const [key,value] of Object.entries({from,to,accountId,rep}))if(value)params.set(key,value);setQuery(params.toString());setRefresh(value=>value+1)}
 function chooseTarget(id:string){setUserId(id);const saved=report?.targets.find(row=>row.userId===id);setCompletedVisits(String(saved?.completedVisits??0));setNewAccounts(String(saved?.newAccounts??0));setReason('')}
 async function save(){if(!report)return;const done=await run('rep.target.save',{userId,from:report.from,to:report.to,completedVisits:Number(completedVisits),newAccounts:Number(newAccounts),revision:target?.revision??null,reason});if(done){setReason('');setRefresh(value=>value+1)}}
 return <section className="br-card br-stack" aria-label="Rep performance"><h2>Rep performance</h2>
  <p>Compare recorded sales activity with current territory coverage. Activity goals guide follow-up; they do not change commission rates, earnings or payroll.</p>
  <form className="br-stack" onSubmit={event=>{event.preventDefault();filter()}}><div className="br-form-grid">
   <label>Performance from<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Performance through<input type="date" min={from||undefined} value={to} onChange={e=>setTo(e.target.value)}/></label>
   <label>Performance account ID (optional)<input value={accountId} onChange={e=>setAccountId(e.target.value)}/></label><label>Performance commission rep (optional)<input value={rep} onChange={e=>setRep(e.target.value)}/></label>
  </div><div className="br-actions"><button disabled={busy}>Read performance</button></div></form>
  {error&&<Notice error>{error}</Notice>}
  {report&&<><p>Activity period: {report.from} through {report.to} · {report.timeZone}. Coverage is current on {report.today}.</p><p>Activity follows your current account access. Historical commission attribution stays in the authorized manager’s statements after a transfer.</p>
   {report.rows.length===0&&<p>No authorized activity is recorded for this period.</p>}
   {report.rows.map(row=><article className="br-card br-stack" key={row.key}><h3>{row.name}</h3>
    <p>Current primary accounts: {row.workload.primaryAccounts} · temporary coverage: {row.workload.coveredAccounts}</p>
    <p>Primary territories: {row.workload.primaryTerritories.join(', ')||'None'} · covered territories: {row.workload.coveredTerritories.join(', ')||'None'}</p>
    <p>Visits: {row.visits.planned} planned · {row.visits.completed} completed · {row.visits.cancelled} cancelled</p>
    <p>Quotes: {row.quotes.requested} requested · {row.quotes.offered} offered · {row.quotes.accepted} accepted. Acceptance: {row.quotes.acceptanceRate.numerator}/{row.quotes.acceptanceRate.denominator}{row.quotes.acceptanceRate.bps===null?' (not applicable)':` (${row.quotes.acceptanceRate.bps/100}%)`}.</p>
    <p>New accounts: {row.accounts.new} · repeat accounts: {row.accounts.repeat}</p>
    {report.targets.filter(goal=>goal.userId===row.userId).map(goal=><p key={goal.id}>Activity goals ({goal.timeZone}): {goal.timeZone===report.timeZone?<>completed visits {row.visits.completed}/{goal.completedVisits}; new accounts {row.accounts.new}/{goal.newAccounts}</>:<>completed visits {goal.completedVisits}; new accounts {goal.newAccounts}. A different reporting zone prevents an achievement comparison</>}. {goal.reason}</p>)}
    <details><summary>Activity source records</summary><ul>{row.sources.map((source,index)=><li key={`${source.kind}-${source.id}-${index}`}><a href={source.appPath??source.path}>{source.kind} · {source.id}</a> · {source.accountId}</li>)}</ul></details>
   </article>)}
   {report.canEditTargets&&<form className="br-stack" aria-label="Set rep activity goals" onSubmit={event=>{event.preventDefault();void save()}}><h3>Set activity goals for this period</h3><p>{report.from} through {report.to} · {report.timeZone}</p>
    <label>Goal rep<select aria-label="Goal rep" required value={userId} onChange={e=>chooseTarget(e.target.value)}><option value="">Choose a native rep</option>{report.reps.map(person=><option key={person.userId} value={person.userId}>{person.name}</option>)}</select></label>
    <div className="br-form-grid"><label>Completed visit goal<input required type="number" min={0} step={1} value={completedVisits} onChange={e=>setCompletedVisits(e.target.value)}/></label><label>New account goal<input required type="number" min={0} step={1} value={newAccounts} onChange={e=>setNewAccounts(e.target.value)}/></label></div>
    <label>Reason for activity goals<textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="br-actions"><button disabled={busy||!userId||!reason.trim()}>Save activity goals</button></div>
   </form>}
   <details><summary>Performance definitions</summary>{Object.entries(report.definitions).map(([key,value])=><p key={key}>{typeof value==='string'?value:JSON.stringify(value)}</p>)}</details>
   <div className="br-actions"><a href={`/api/barrow/reports/rep-performance.csv?${query}`} download>Download rep performance (CSV)</a><a href={`/api/barrow/reports/commissions.csv?${query}`} download>Download itemized commission statement (all dates, CSV)</a></div>
  </>}
 </section>
}
