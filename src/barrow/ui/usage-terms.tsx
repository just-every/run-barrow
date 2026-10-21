import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { applicationFile } from './application-files'
import { Notice } from './primitives'
import type { RunCommand } from './types'
export function UsageAcceptance({onAccepted}:{onAccepted:()=>void}) {
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false)
 useEffect(()=>{void request('/api/barrow/usage-terms').then(setData).catch(e=>setError(errorMessage(e)))},[])
 async function accept(){setBusy(true);try{await request('/api/barrow/commands',{type:'usage.accept',payload:{version:data.current.version,sha256:data.current.sha256,accepted:checked}});onAccepted()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}
 return <section className="br-card br-stack" aria-label="Accept portal usage terms"><h1>Portal usage terms</h1>{error&&<Notice error>{error}</Notice>}{data?.current&&<><h2>{data.current.title} · version {data.current.version}</h2><p style={{whiteSpace:'pre-wrap'}}>{data.current.body}</p>{data.current.pdf&&<a href={data.current.pdf.path}>Read usage terms PDF</a>}<p>Accept the newest portal usage terms to continue to commercial records. Your person, version, content SHA-256 and time are recorded.</p><label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>I accept portal usage terms version {data.current.version}.</label><button disabled={busy||!checked} onClick={()=>void accept()}>Accept portal usage terms</button></>}</section>
}
export function UsagePublisher({run,busy}:{run:RunCommand;busy:boolean}) {
 const [data,setData]=useState<any>(null),[title,setTitle]=useState(''),[body,setBody]=useState(''),[file,setFile]=useState<File|null>(null),[tick,setTick]=useState(0)
 useEffect(()=>{void request('/api/barrow/usage-terms').then(setData)},[tick])
 async function publish(){if(await run('usage.publish',{title,body,...(file?{pdf:await applicationFile(file)}:{})})){setTick(t=>t+1);setTitle('');setBody('');setFile(null)}}
 return <section className="br-card br-stack" aria-label="Portal usage terms"><h2>Portal usage terms</h2><p>{data?.current?`Current version ${data.current.version}: ${data.current.title}`:'No portal usage terms published.'}</p><p>Publish an immutable numbered version. Every buyer person must accept the newest version before opening commercial records. Sales terms remain separate.</p><label>Usage terms title<input value={title} maxLength={160} onChange={e=>setTitle(e.target.value)}/></label><label>Usage terms text<textarea rows={6} maxLength={20000} value={body} onChange={e=>setBody(e.target.value)}/></label><label>Usage terms PDF (optional, at most 1 MB)<input type="file" accept="application/pdf" onChange={e=>setFile(e.target.files?.[0]??null)}/></label><button disabled={busy||!title||(!body&&!file)} onClick={()=>void publish()}>Publish portal usage version</button></section>
}
