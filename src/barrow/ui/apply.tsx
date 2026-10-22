import { useEffect, useState, type FormEvent } from 'react'
import { request, errorMessage } from './api'
import { applicationFile } from './application-files'
import { Notice } from './primitives'
const emptyLocation=()=>({name:'',line1:'',city:'',state:'',zip:''})
export function TradeApplication() {
 const [config,setConfig]=useState<any>(null),[id,setId]=useState(''),[code,setCode]=useState(''),[email,setEmail]=useState(''),[application,setApplication]=useState<any>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [challenge,setChallenge]=useState(false)
 const [locations,setLocations]=useState([emptyLocation()]),[noEin,setNoEin]=useState(false),[file,setFile]=useState<File|null>(null)
 useEffect(()=>{void request('/api/barrow/applications/form').then(setConfig).catch(e=>setError(errorMessage(e)));void request('/api/barrow/applications/mine').then(setApplication).catch(()=>{});setId(new URLSearchParams(window.location.search).get('application')??'')},[])
 useEffect(()=>{if(config?.captchaSiteKey&&!challenge){const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js';script.async=true;script.defer=true;document.head.appendChild(script);setChallenge(true)}},[config,challenge])
 async function act(fn:()=>Promise<void>) {setBusy(true);setError('');setMessage('');try{await fn()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();const data=new FormData(event.currentTarget)
  await act(async()=>{
   const documents=await Promise.all(data.getAll('documents').filter((v):v is File=>v instanceof File&&v.size>0).map(applicationFile))
   const result=await request<any>('/api/barrow/applications',{formToken:config.formToken,turnstileToken:data.get('cf-turnstile-response'),website:data.get('website'),consent:data.get('consent')==='on',name:data.get('name'),dba:data.get('dba'),ein:data.get('ein'),noEin,contactName:data.get('contactName'),email:data.get('email'),phone:data.get('phone'),annualVolumeUsd:Number(data.get('annualVolumeUsd')),requestedTermsDays:Number(data.get('requestedTermsDays')),locations,documents})
   setId(result.id);setEmail(String(data.get('email')));setMessage(`Verification ${result.delivery.status}. Your application ID is ${result.id}. Keep this ID for future status visits.`);window.history.replaceState(null,'',`/apply?application=${result.id}`)
  })
 }
 async function verify(){await act(async()=>{await request('/api/barrow/applications/verify',{id,code});setApplication(await request('/api/barrow/applications/mine'));setCode('')})}
 async function respond(action:string){await act(async()=>{setApplication(await request('/api/barrow/applications/respond',{action,revision:application.revision,...(file?{document:await applicationFile(file)}:{})}));setFile(null)})}
 return <div className="barrow"><header className="br-top"><a className="br-brand" href="/">Barrow</a><a href="/signin">Buyer sign in</a></header><main className="br-main br-stack"><div className="br-page-title"><div><p className="br-eyebrow">Trade relationships</p><h1>Trade application</h1></div></div>
  {error&&<Notice error>{error}</Notice>}{message&&<Notice>{message}</Notice>}
  {application?<section className="br-card br-stack" aria-label="Your application"><h2>{application.value.name}</h2><p><strong>Status: {application.state}</strong></p><p>Application {application.id} · Updated {application.updatedAt}</p>
   {application.state==='approved'&&<p>Invitation requested to {application.value.email}. Use the invitation email to sign in; this application session gives no price access.</p>}
   <ul>{application.history.map((v:any,i:number)=><li key={i}>{v.created_at} · {v.state}: {v.reason}</li>)}</ul>
   <h3>Your documents</h3><p>{application.documentLabels}</p><ul>{application.documents.map((d:any)=><li key={d.id}><a href={d.path}>{d.name}</a> · {d.size} bytes</li>)}</ul>
   {application.state==='information requested'&&<><label>Requested certificate (PDF, PNG or JPEG, at most 1 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e=>setFile(e.target.files?.[0]??null)}/></label><button disabled={busy||!file} onClick={()=>void respond('upload')}>Answer information request</button></>}
   {['submitted','information requested'].includes(application.state)&&<button className="br-secondary" disabled={busy} onClick={()=>void respond('withdraw')}>Withdraw application</button>}
  </section>:<>
   <section className="br-card br-stack"><h2>Verify or check status</h2><p>Enter your saved application ID and the one-use email code. For a later visit, request a fresh code to your original contact email.</p><label>Application ID<input value={id} onChange={e=>setId(e.target.value)}/></label><label>Original contact email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button disabled={busy||!id||!email} className="br-secondary" onClick={()=>void act(async()=>{const r=await request<any>('/api/barrow/applications/code',{id,email});setMessage(`Verification ${r.delivery.status}.`)})}>Request fresh code</button><label>Verification code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} maxLength={6}/></label><button disabled={busy||!id||code.length!==6} onClick={()=>void verify()}>Verify email and view application</button></section>
   {config?.open?<form className="br-card br-stack" onSubmit={e=>void submit(e)} aria-label="Public trade form"><h2>Apply for a trade account</h2><p>Submitting and verifying this application grants no membership or price access. {config.mail}.</p>
    <label>Company legal name<input name="name" required maxLength={160}/></label><label>DBA (optional)<input name="dba" maxLength={160}/></label>
    <label><input type="checkbox" checked={noEin} onChange={e=>setNoEin(e.target.checked)}/>No EIN (sole proprietor)</label><label>EIN, never a Social Security number<input name="ein" disabled={noEin} required={!noEin} pattern="[0-9]{2}-[0-9]{7}" placeholder="XX-XXXXXXX"/></label><p>Format check only; not verified with the IRS.</p>
    <label>Contact name<input name="contactName" required maxLength={120}/></label><label>Contact email<input name="email" type="email" required maxLength={200}/></label><label>Contact phone<input name="phone" type="tel" required maxLength={40}/></label><label>Expected annual volume in whole USD<input name="annualVolumeUsd" type="number" min={0} max={1000000000} step={1} required/></label>
    <label>Requested payment terms<select name="requestedTermsDays" aria-label="Requested payment terms" defaultValue="0"><option value="0">Pay with each order (no terms)</option>{[15,30,45,60].map(days=><option key={days} value={days}>Net {days}</option>)}</select></label><p>A request only; the supplier sets any terms when approving.</p>
    <fieldset className="br-stack"><legend>Requested locations</legend><p>Format checked (state code, ZIP format and range); not verified with USPS or a carrier.</p>{locations.map((location,index)=><div key={index} className="br-stack"><h3>Location {index+1}</h3>{Object.entries(location).map(([key,value])=><label key={key}>{({name:'Location name',line1:'Address line 1',city:'City',state:'US state',zip:'ZIP code'} as any)[key]}<input required value={value} onChange={e=>setLocations(rows=>rows.map((v,i)=>i===index?{...v,[key]:e.target.value}:v))}/></label>)}{locations.length>1&&<button type="button" className="br-secondary" onClick={()=>setLocations(rows=>rows.filter((_,i)=>i!==index))}>Remove location {index+1}</button>}</div>)}<button type="button" className="br-secondary" disabled={locations.length>=20} onClick={()=>setLocations(rows=>[...rows,emptyLocation()])}>Add requested location</button></fieldset>
    <label>Resale certificates (up to 5 PDF, PNG or JPEG files, each at most 1 MB)<input type="file" name="documents" multiple accept="application/pdf,image/png,image/jpeg"/></label><p>Not validated; exemption review is TAX-003’s. Not malware-screened.</p>
    <div hidden aria-hidden="true"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off"/></label></div><label><input type="checkbox" name="consent" required/>Your details and documents go only to the supplier to review this trade application and contact you about it.</label><p>Spam checks apply.</p>{config.captchaSiteKey&&<div className="cf-turnstile" data-sitekey={config.captchaSiteKey}/>}<button disabled={busy}>Submit and request verification code</button>
   </form>:<Notice>Applications are closed: verification mail is not configured.</Notice>}
  </>}
 </main></div>
}
