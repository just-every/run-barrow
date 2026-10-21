import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import type { readCommissionRules } from '../commission-rules'

type Policy = Awaited<ReturnType<typeof readCommissionRules>>
const blank = () => ({ id: '', rep: '', accountId: '', sku: '', from: '', to: '', rate: '10', basis: 'acceptance', splits: [{ rep: '', share: '100' }] })
export function CommissionSettings({ onSaved }: { onSaved: () => void }) {
 const [policy,setPolicy]=useState<Policy|null>(null),[form,setForm]=useState(blank),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const load=()=>request<Policy>('/api/barrow/commissions').then(setPolicy)
 useEffect(()=>{void load().catch(e=>setError(errorMessage(e)))},[])
 async function save(remove=false) {
  if(!policy)return
  setBusy(true);setError('')
  try {
   const rule={id:form.id,rep:form.rep,...(form.accountId?{accountId:form.accountId}:{}),...(form.sku?{sku:form.sku}:{}),from:form.from,...(form.to?{to:form.to}:{}),rateBps:Math.round(Number(form.rate)*100),basis:form.basis,splits:form.splits.map(row=>({rep:row.rep,shareBps:Math.round(Number(row.share)*100)}))}
   await request('/api/barrow/commands',{type:'commission.settings',payload:{revision:policy.revision,rules:[...policy.rules.filter(row=>row.id!==form.id),...(remove?[]:[rule])],reason}})
   await load();setForm(blank());setReason('');onSaved()
  }catch(e){setError(errorMessage(e))}finally{setBusy(false)}
 }
 return <details><summary>Manage commission rules</summary><div className="br-stack">
  <p>Supplier approval freezes the assigned rep, rule and split for each order line. Later transfers or rule edits affect new approvals. Assign the rep in the account’s commercial profile first.</p>
  {error&&<Notice error>{error}</Notice>}
  <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={()=>{setError('');void load().catch(e=>setError(errorMessage(e)))}}>Reload current rules</button></div>
  <ul>{policy?.rules.map(rule=><li key={rule.id}><button type="button" className="br-secondary" onClick={()=>setForm({id:rule.id,rep:rule.rep,accountId:rule.accountId??'',sku:rule.sku??'',from:rule.from,to:rule.to??'',rate:String(rule.rateBps/100),basis:rule.basis,splits:rule.splits.map(row=>({rep:row.rep,share:String(row.shareBps/100)}))})}>{rule.id}</button> · {rule.rep} · {rule.rateBps/100}% · {rule.basis} · {rule.from} to {rule.to??'no end'}</li>)}</ul>
  <form className="br-stack" onSubmit={event=>{event.preventDefault();void save()}}>
   <div className="br-form-grid">
    <label>Rule ID<input required value={form.id} onChange={e=>setForm({...form,id:e.target.value})}/></label>
    <label>Assigned rep<input required value={form.rep} onChange={e=>setForm({...form,rep:e.target.value})}/></label>
    <label>Account ID (optional)<input value={form.accountId} onChange={e=>setForm({...form,accountId:e.target.value})}/></label>
    <label>SKU (optional)<input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label>
    <label>Effective from<input required type="date" value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label>
    <label>Effective through (optional)<input type="date" value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></label>
    <label>Commission percent<input required type="number" min="0" max="100" step="0.01" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label>
    <label>Earn when<select value={form.basis} onChange={e=>setForm({...form,basis:e.target.value})}><option value="acceptance">Supplier acceptance</option><option value="shipment">Pier shipment</option><option value="payment">Payment (not recorded)</option></select></label>
   </div>
   <p>Splits must total 100%. Rep labels record attribution; they do not grant access.</p>
   {form.splits.map((row,i)=><div className="br-form-grid" key={i}>
    <label>Split rep {i+1}<input required value={row.rep} onChange={e=>setForm({...form,splits:form.splits.map((value,n)=>n===i?{...value,rep:e.target.value}:value)})}/></label>
    <label>Split percent {i+1}<input required type="number" min="0" max="100" step="0.01" value={row.share} onChange={e=>setForm({...form,splits:form.splits.map((value,n)=>n===i?{...value,share:e.target.value}:value)})}/></label>
    {form.splits.length>1&&<button type="button" className="br-secondary" onClick={()=>setForm({...form,splits:form.splits.filter((_,n)=>n!==i)})}>Remove split {i+1}</button>}
   </div>)}
   <div className="br-actions"><button type="button" className="br-secondary" onClick={()=>setForm({...form,splits:[...form.splits,{rep:'',share:''}]})}>Add split</button></div>
   <label>Change reason<input required value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <div className="br-actions"><button disabled={busy||!policy}>{busy?'Saving…':'Save commission rule'}</button>{policy?.rules.some(row=>row.id===form.id)&&<button type="button" className="br-danger" disabled={busy||!reason.trim()} onClick={()=>void save(true)}>Retire rule for future approvals</button>}</div>
  </form>
 </div></details>
}
