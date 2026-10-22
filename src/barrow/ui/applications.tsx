import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { ApplicationRouting } from './application-review'
import { applicationDocumentReason } from '../application-document-policy'
import type { RunCommand } from './types'
const termsText=(days:number|null|undefined)=>days?`Net ${days}`:days===0?'Pay with each order (no terms)':'Not stated'
export function Applications({version,busy,run}:{version:unknown;busy:boolean;run:RunCommand}) {
 const [access,setAccess]=useState<'review'|'documents'>('documents'),[rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[selected,setSelected]=useState(''),[reason,setReason]=useState(''),[reviewed,setReviewed]=useState<string[]>([])
 const [account,setAccount]=useState({pierCustomerId:'',termsDays:30,minimumCents:0,sku:'',unitCents:0,minQty:1})
 useEffect(()=>{void request<any>('/api/barrow/applications').then(r=>{setAccess(r.access);setRows(r.applications);setReviewed([])}).catch(e=>{setRows([]);setSelected('');setError(errorMessage(e))})},[version])
 // A follow-up task's source link opens its application here.
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('application');if(id&&rows.some(v=>v.id===id))choose(id)},[rows.length])
 const row=rows.find(v=>v.id===selected)
 function choose(id:string){setSelected(id);setReviewed([]);setReason('');const chosen=rows.find(v=>v.id===id);if(typeof chosen?.value.requestedTermsDays==='number')setAccount(v=>({...v,termsDays:chosen.value.requestedTermsDays}))}
 async function decide(type:string) {
  if(!row)return
  await run(type,{id:row.id,revision:row.revision,reason,duplicateReviews:row.duplicates.map(({id,kind,revision}:any)=>({id,kind,revision})),accountDuplicateReviews:row.duplicates.filter((d:any)=>d.kind==='account').map(({id,revision}:any)=>({id,revision})),account:{pierCustomerId:account.pierCustomerId,termsDays:account.termsDays,minimumCents:account.minimumCents,prices:account.sku?[{sku:account.sku,unitCents:account.unitCents,minQty:account.minQty}]:[]}})
 }
 const canReview=access==='review'
 const ready=!busy&&!!reason&&reviewed.length===row?.duplicates.length
 return <section className="br-card br-stack" aria-label="Trade applications"><h2>{canReview?'Trade applications':'Application documents'}</h2>{canReview?<p>Only email-verified applications appear here. Review duplicates as separate companies; nothing is merged or reassigned.</p>:<p>Read-only document metadata for certificate review. Existing documents are quarantined because malware screening is not configured. Ask the installation owner about approved scanner setup before certificate review.</p>}{error&&<Notice error>{error}</Notice>}
  {!rows.length&&<p>No verified applications.</p>}<label>Application<select value={selected} onChange={e=>choose(e.target.value)}><option value="">Choose application</option>{rows.map(v=><option key={v.id} value={v.id}>{v.value.name}{canReview?` · ${v.state}`:''}</option>)}</select></label>
  {row&&<><h3>{row.value.name}{canReview?` · ${row.state}`:''}</h3>{canReview&&<><p>{row.value.contactName} · {row.value.email} · {row.value.phone}</p><p>EIN: {row.value.ein??'No EIN (sole proprietor)'} · not verified with the IRS. Expected annual volume: USD {row.value.annualVolumeUsd}. Requested payment terms: {termsText(row.value.requestedTermsDays)}.</p><ul>{row.value.locations.map((v:any,i:number)=><li key={i}>{v.name}: {v.line1}, {v.city}, {v.state} {v.zip}</li>)}</ul><p>{row.addressCheck}</p></>}<p>{row.documentLabels}</p><p>{applicationDocumentReason}</p><ul>{row.documents.map((d:any)=><li key={d.id}>{d.name} · {d.size} bytes · quarantined</li>)}</ul>{canReview&&<><ul>{row.history.map((v:any,i:number)=><li key={i}>{v.created_at} · {v.state}: {v.reason}</li>)}</ul>
  <ApplicationRouting review={row.review} statusEmails={row.statusEmails} open={['submitted','information requested'].includes(row.state)} onUseRequest={setReason}/>
  </>}{canReview&&['submitted','information requested'].includes(row.state)&&<><h3>Duplicate review</h3>{row.duplicates.length?row.duplicates.map((d:any)=><label key={d.id}><input type="checkbox" checked={reviewed.includes(d.id)} onChange={e=>setReviewed(ids=>e.target.checked?[...ids,d.id]:ids.filter(id=>id!==d.id))}/>{d.kind} {d.name} ({d.id}): reviewed as separate company, or decline below</label>):<p>No matching company names, EINs or emails.</p>}
   <label>Decision reason (shown to applicant)<textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="br-quiet-text">Each decision emails the applicant one generic status update (the new state and a link, never this reason); they read the reason after a fresh code.</p><div className="br-actions"><button disabled={!ready} onClick={()=>void decide('application.request-information')}>Request missing certificate</button><button className="br-secondary" disabled={!ready} onClick={()=>void decide('application.decline')}>Decline application</button></div>
   <details><summary>Approve and invite buyer</summary><div className="br-stack"><p>Approve the requested ship-tos and record the agreed native account terms and assortment.</p>{Object.entries(account).map(([key,value])=><label key={key}>{({pierCustomerId:'Exact Pier customer ID',termsDays:'Payment terms days',minimumCents:'Minimum order USD cents',sku:'Approved SKU (optional)',unitCents:'Unit price USD cents',minQty:'Minimum quantity'} as any)[key]}<input type={typeof value==='number'?'number':'text'} value={value} min={key==='minQty'?1:0} onChange={e=>setAccount(v=>({...v,[key]:typeof value==='number'?Number(e.target.value):e.target.value}))}/></label>)}<button disabled={!ready||!account.pierCustomerId} onClick={()=>void decide('application.approve')}>Approve application and request invitation</button></div></details>
  </>}</>}
 </section>
}
