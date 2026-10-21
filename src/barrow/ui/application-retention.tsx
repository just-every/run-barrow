import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import type { RunCommand } from './types'
export function ApplicationRetention({run,version,busy}:{run:RunCommand;version:unknown;busy:boolean}) {
 const [data,setData]=useState<any>(null),[days,setDays]=useState(''),[reason,setReason]=useState(''),[selected,setSelected]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState('')
 useEffect(()=>{void request<any>('/api/barrow/retention').then(r=>{setData(r);setDays(r.policy.days.applicationRecords?.toString()??'')}).catch(e=>setError(errorMessage(e)))},[version])
 return <section className="br-card br-stack" aria-label="Application retention"><h2>Application retention</h2><p>Declined and withdrawn applications become eligible for explicit owner review after the configured age. Nothing is deleted silently. Approved applications follow account erasure; once orders are submitted, certificates retain the commercial seven-year floor. No tax-law adequacy is asserted. Delivered mail, external copies and older backups have separate custody.</p>{error&&<Notice error>{error}</Notice>}
  <label>Application records retention days (blank means unscheduled)<input type="number" min={1} max={36500} value={days} onChange={e=>setDays(e.target.value)}/></label><label>Owner review reason<textarea value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!data||!reason} onClick={()=>void run('retention.settings',{revision:data.policy.revision,days:{...data.policy.days,applicationRecords:days?Number(days):null},reason})}>Save application retention</button>
  <label>Review application<select value={selected} onChange={e=>{setSelected(e.target.value);setConfirm('')}}><option value="">Choose application</option>{data?.applications.map((v:any)=><option key={v.id} value={v.id}>{v.name} · {v.state} · {v.eligible?'eligible':v.reason}</option>)}</select></label>
  {selected&&<><label>Type ERASE after reviewing this application<input value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="br-danger" disabled={busy||confirm!=='ERASE'||!reason||!data.applications.find((v:any)=>v.id===selected)?.eligible} onClick={()=>void run('retention.erase-application',{id:selected,revision:data.applications.find((v:any)=>v.id===selected).revision,policyRevision:data.policy.revision,confirm,reason})}>Erase reviewed application</button></>}
 </section>
}
