import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import type { readReportSchedules } from '../report-schedules'
type State = Awaited<ReturnType<typeof readReportSchedules>>

export function ScheduledReports() {
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [name,setName]=useState(''),[reportType,setType]=useState('sales'),[accountId,setAccount]=useState(''),[sku,setSku]=useState(''),[recipients,setRecipients]=useState<string[]>([])
 const load=async()=>setState(await request<State>('/api/barrow/report-schedules'))
 useEffect(()=>{void load().catch(e=>setError(errorMessage(e)))},[])
 async function act(type:string,payload:unknown) {
  setBusy(true);setError('')
  try {await request('/api/barrow/commands',{type,payload});await load();return true}
  catch(e){setError(errorMessage(e));return false}finally{setBusy(false)}
 }
 const selectedRun=typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('reportRun')
 return <section className="br-card br-stack" aria-labelledby="scheduled-reports-title"><h2 id="scheduled-reports-title">Saved monthly reports</h2>
  <p>Save sales or invoice-aging filters. Each month freezes the previous calendar month at the first run, with downloads for 90 days. Email contains a sign-in link and report metadata. Your own current staff access is checked again at download.</p>
  <p className="br-quiet-text">Monthly schedule: first day at 09:00 UTC. Sales uses the reporting zone’s inclusive date bounds; invoice aging is as of the period’s last day. Uncertain sends are recorded for review and never automatically resubmitted.</p>
  {error&&<Notice error>{error}<button className="br-quiet" onClick={()=>void load().then(()=>setError('')).catch(e=>setError(errorMessage(e)))}>Refresh saved reports</button></Notice>}
  {!state&&!error&&<p role="status">Loading saved reports…</p>}
  {selectedRun&&<a href={`/api/barrow/report-runs/${encodeURIComponent(selectedRun)}.json`} download>Download the report from your email</a>}
  {state&&<>
   <form className="br-stack" onSubmit={e=>{e.preventDefault();void act('report.save',{name,reportType,filters:{...(accountId.trim()?{accountId:accountId.trim()}:{}),...(reportType==='sales'&&sku.trim()?{sku:sku.trim()}: {})},recipientIds:recipients}).then(ok=>{if(ok){setName('');setRecipients([])}})}}>
    <div className="br-form-grid">
     <label>Report name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>Report type<select value={reportType} onChange={e=>setType(e.target.value)}><option value="sales">Sales</option><option value="finance">Invoice aging</option></select></label>
     <label>Saved account ID (optional)<input maxLength={160} value={accountId} onChange={e=>setAccount(e.target.value)}/></label>
     {reportType==='sales'&&<label>Saved SKU (optional)<input maxLength={160} value={sku} onChange={e=>setSku(e.target.value)}/></label>}
    </div>
    <fieldset><legend>Staff recipients</legend>{state.operators.map((operator:any)=><label key={operator.id}><input type="checkbox" checked={recipients.includes(operator.id)} onChange={e=>setRecipients(v=>e.target.checked?[...v,operator.id]:v.filter(id=>id!==operator.id))}/>{operator.display_name} ({operator.role})</label>)}</fieldset>
    <div className="br-actions"><button disabled={busy||!recipients.length}>Save monthly report</button></div>
   </form>
   {!state.schedules.length&&<p>No saved reports yet.</p>}
   {state.schedules.map(schedule=><article className="br-card br-stack" key={schedule.id}><h3>{schedule.name}</h3>
    <p>{schedule.report_type==='sales'?'Sales':'Invoice aging'} · Next run {schedule.next_at}</p>
    <p>Filters: {Object.entries(schedule.filters).map(([key,value])=>`${key}: ${value}`).join(' · ')||'All accounts'}</p>
    {schedule.restored===1&&<p>Restored history: save a new schedule to resume delivery.</p>}
    <div className="br-actions"><button className="br-secondary" disabled={busy||schedule.restored===1} onClick={()=>void act('report.run',{scheduleId:schedule.id})}>Run previous month now</button>
     {schedule.recipients.some((r:any)=>r.operator_id===state.viewer&&!r.removed_at)&&<button className="br-quiet" disabled={busy} onClick={()=>void act('report.remove-recipient',{scheduleId:schedule.id})}>Remove me from this report</button>}
    </div>
    <ul>{schedule.recipients.map((r:any)=><li key={r.operator_id}>{(state.operators as any[]).find(p=>p.id===r.operator_id)?.display_name??'Former staff recipient'} · {r.removed_at?'Removed':r.role}
     {!r.removed_at&&r.operator_id!==state.viewer&&<button className="br-quiet" disabled={busy} onClick={()=>void act('report.remove-recipient',{scheduleId:schedule.id,operatorId:r.operator_id})}>Remove recipient</button>}</li>)}</ul>
   </article>)}
   <h3>Your frozen reports</h3>
   {!state.runs.length&&<p>No report runs for you yet.</p>}
   {state.runs.map(run=><article className="br-card br-stack" key={run.id}><h4>{state.schedules.find(s=>s.id===run.schedule_id)?.name} · {run.period}</h4><p>As of {run.as_of} · Available until {run.expires_at}</p><p>Notification: {run.status}{run.reason?` · ${run.reason}`:''}</p><a href={`/api/barrow/report-runs/${encodeURIComponent(run.id)}.json`} download>Download frozen report</a></article>)}
  </>}
 </section>
}
