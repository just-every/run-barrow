import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import type { Account } from './types'
export type AccountPage = { accounts:Account[];page:number;pageSize:number;hasNext:boolean }
export function useAccountPage(version?:unknown) {
 const [query,setQuery]=useState({q:'',sort:'id',page:1}),[result,setResult]=useState<AccountPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{
  let current=true;setLoading(true);setError('');setResult(null)
  const timer=setTimeout(()=>void request<AccountPage>(`/api/barrow/accounts?${new URLSearchParams({q:query.q,sort:query.sort,page:String(query.page)})}`).then(value=>{if(current)setResult(value)}).catch(cause=>{if(current)setError(errorMessage(cause))}).finally(()=>{if(current)setLoading(false)}),150)
  return ()=>{current=false;clearTimeout(timer)}
 },[query,version,retry])
 return {query,setQuery,result,loading,error,retry:()=>setRetry(value=>value+1)}
}
export function AccountPages({directory,sort=false}:{directory:ReturnType<typeof useAccountPage>;sort?:boolean}) {
 const {query,setQuery,result,loading,error,retry}=directory
 return <div className="br-stack">
  <label>Find trade accounts<input type="search" maxLength={160} value={query.q} onChange={event=>setQuery(current=>({...current,q:event.target.value,page:1}))} placeholder="Company, account ID, email or Pier ID"/></label>
  {sort&&<label>Sort trade accounts<select value={query.sort} onChange={event=>setQuery(current=>({...current,sort:event.target.value,page:1}))}><option value="id">Account ID</option><option value="name-asc">Company A–Z</option><option value="name-desc">Company Z–A</option></select></label>}
  {error&&<div role="alert">{error} <button type="button" className="br-secondary" onClick={retry}>Retry accounts</button></div>}
  <div className="br-actions" aria-label="Account pages">
   <span role="status">{loading?'Loading accounts…':result?`Account page ${result.page} · ${result.accounts.length} shown`:''}</span>
   <button type="button" className="br-secondary" disabled={loading||query.page<=1} onClick={()=>setQuery(current=>({...current,page:current.page-1}))}>Previous accounts</button>
   <button type="button" className="br-secondary" disabled={loading||!result?.hasNext} onClick={()=>setQuery(current=>({...current,page:current.page+1}))}>Next accounts</button>
  </div>
 </div>
}
