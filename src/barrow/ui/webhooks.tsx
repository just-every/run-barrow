import { useEffect,useState,type FormEvent } from 'react'
import { request,errorMessage } from './api'
import { Notice } from './primitives'
import { when } from './types'
import type { readWebhooks } from '../webhooks'
type State=Awaited<ReturnType<typeof readWebhooks>>
export function Webhooks() {
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [endpoint,setEndpoint]=useState(''),[secret,setSecret]=useState(''),[reason,setReason]=useState(''),[consent,setConsent]=useState(false),[types,setTypes]=useState<string[]>(['order.submitted'])
 const [rotation,setRotation]=useState(''),[changeReason,setChangeReason]=useState('')
 async function load(){setState(await request<State>('/api/barrow/webhooks'))}
 useEffect(()=>{void load().catch(cause=>{if((cause as any)?.status!==403)setError(errorMessage(cause))})},[])
 async function command(type:string,payload:unknown) {
  setBusy(true);setError('');setMessage('')
  try {await request('/api/barrow/commands',{type,payload});await load();setMessage(type==='webhook.subscribe'?'Subscription active for future events.':type==='webhook.replay'?'Replay locally queued; external acceptance pending.':type==='webhook.dispatch'?'Due deliveries checked.':'Subscription updated.');return true}
  catch(cause){setError(errorMessage(cause));return false}finally{setBusy(false)}
 }
 async function subscribe(event:FormEvent){event.preventDefault();if(await command('webhook.subscribe',{endpoint,secret,reason,consent,eventTypes:types})){setSecret('');setConsent(false);setReason('')}}
 if(!state&&!error)return null
 return <section className="br-card br-stack" aria-label="Outbound webhooks"><h2>Outbound webhooks</h2>
  {error&&<Notice error>{error}</Notice>}{message&&<Notice>{message}</Notice>}
  {state&&<><p>{state.note}</p><p>Unresolved handoffs: <strong>{state.unresolved}</strong>. At most one request per endpoint every {state.rateSeconds} seconds. Automatic backoff starts at 30 seconds; after {state.maxAttempts} unsuccessful attempts the item stays in dead letter until replay is acknowledged.</p>
   <form onSubmit={subscribe} className="br-stack"><h3>Subscribe an endpoint</h3>
    <label>Owner-named HTTPS endpoint<input type="url" required value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://receiver.your-company.com/events" disabled={busy}/></label>
    <p className="br-quiet-text">The endpoint receives only event ID, type, time and local revision. No account identity, prices or documents. Share the signing secret with your receiver through your own secure channel.</p>
    <label>Shared signing secret<input type="password" required minLength={24} maxLength={256} autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)} disabled={busy}/></label>
    <fieldset><legend>Event types</legend>{state.eventTypes.map(type=><label key={type}><input type="checkbox" checked={types.includes(type)} onChange={e=>setTypes(e.target.checked?[...types,type]:types.filter(t=>t!==type))} disabled={busy}/>{type}</label>)}</fieldset>
    <label>Subscription reason<input required value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} disabled={busy}/></label>
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/>I authorize sending these minimal events to the endpoint named above.</label>
    <div className="br-actions"><button disabled={busy||!consent||!types.length}>Subscribe endpoint</button></div>
   </form>
   <h3>Subscription custody</h3>{state.subscriptions.length===0?<p>No endpoints subscribed. No outbound webhook traffic is enabled.</p>:<ul className="br-stack">{state.subscriptions.map(s=><li key={s.id}><strong style={{overflowWrap:'anywhere'}}>{s.endpoint}</strong> · {s.state} · signing secret {s.secretConfigured?'configured (masked)':'revoked'}<br/><code>{s.id}</code> · {s.eventTypes.join(', ')}
    {s.state==='active'&&<div className="br-actions"><button className="br-secondary" disabled={busy||rotation.length<24||!changeReason.trim()} onClick={()=>void command('webhook.rotate',{id:s.id,revision:s.revision,secret:rotation,reason:changeReason}).then(ok=>{if(ok)setRotation('')})}>Rotate signing secret</button><button className="br-danger" disabled={busy||!changeReason.trim()} onClick={()=>void command('webhook.revoke',{id:s.id,revision:s.revision,reason:changeReason})}>Revoke subscription</button></div>}</li>)}</ul>}
   <label>Replacement signing secret<input type="password" autoComplete="new-password" maxLength={256} value={rotation} onChange={e=>setRotation(e.target.value)} disabled={busy}/></label>
   <label>Recovery or custody change reason<input maxLength={1000} value={changeReason} onChange={e=>setChangeReason(e.target.value)} disabled={busy}/></label>
   <div className="br-actions"><button className="br-secondary" disabled={busy||!changeReason.trim()} onClick={()=>void command('webhook.dispatch',{reason:changeReason})}>Dispatch due webhooks</button><button className="br-secondary" disabled={busy} onClick={()=>void load().catch(cause=>setError(errorMessage(cause)))}>Refresh webhook state</button><a className="br-button br-secondary" href="/api/barrow/webhooks.json" download>Export webhook history</a></div>
   <h3>Retained handoffs</h3><p className="br-quiet-text">Showing the latest 200 handoffs. Full history is available in the owner export. Revoking custody pauses requests and keeps unresolved work. Acknowledgment records acceptance by the endpoint, not completion of its downstream business action.</p>
   {state.deliveries.length===0?<p>No queued events.</p>:<ul className="br-stack">{state.deliveries.map(d=><li key={d.id} style={{overflowWrap:'anywhere'}}><strong>{d.event.type} · {d.state}</strong><br/>Event <code>{d.event_id}</code> · occurred {when(d.event.occurredAt)} · revision {d.event.revision}<br/>Delivery <code>{d.id}</code> · {d.attempts} attempts · {d.last_result}{d.subscription_state!=='active'&&' · Subscription absent or revoked: retained, no sending'}
    {d.state!=='acknowledged'&&<p>Next eligible attempt: {d.state==='dead-letter'?'Owner replay required':when(new Date(d.next_attempt_at).toISOString())}</p>}
    <details><summary>Attempt history</summary><ul>{state.attempts.filter(a=>a.delivery_id===d.id).map(a=><li key={a.id}>Attempt {a.number} · {when(a.started_at)} · {a.result}{a.finished_at?` · completed ${when(a.finished_at)}`:' · result not yet recorded'} · signing revision <code>{a.signing_revision}</code></li>)}</ul></details>
    {['dead-letter','acknowledged'].includes(d.state)&&d.subscription_state==='active'&&<button className="br-secondary" disabled={busy||!changeReason.trim()} onClick={()=>void command('webhook.replay',{deliveryId:d.id,reason:changeReason})}>Replay same event</button>}
   </li>)}</ul>}
   <h3>Authenticated incoming provider receipts</h3><p className="br-quiet-text">Current quote and report email callbacks only. Base retains identity and event time, deduplicates replays and prevents older delivery states from replacing terminal states. Future connectors must provide their own authenticated intake and source-specific ordering.</p>
   {state.incoming.length===0?<p>No verified receipts.</p>:<ul>{state.incoming.map(r=><li key={`${r.provider}:${r.event_namespace}:${r.event_id}`} style={{overflowWrap:'anywhere'}}><code>{r.event_id}</code> · {r.provider}/{r.event_namespace} · {typeof r.occurred_at==='number'?when(new Date(r.occurred_at).toISOString()):'time unrecorded'} · {r.status??'informational'} · {r.result} · {r.intake_count} authenticated requests, {r.duplicate_count} duplicate replays</li>)}</ul>}
   <details><summary>Receiver signature contract</summary><p>Verify HMAC-SHA256 over the exact UTF-8 bytes of webhook-id + "." + webhook-timestamp + "." + request body using the shared secret. webhook-signature is v1, followed by base64. Enforce a timestamp tolerance, deduplicate webhook-id durably and acknowledge with HTTP 2xx only after your durable acceptance. Replays preserve event ID and body; timestamps and signatures describe each request. Rotation uses the current secret and webhook-key-revision. Redirects are refused.</p></details>
  </>}
 </section>
}
