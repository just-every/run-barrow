import type { Bindings } from '../auth.server'
import { fail } from './model'
export type CarrierObservation = { id: string; at: string; status: string; message: string; detail: string }
export type TrackerRead = { carrier: string; code: string; link: string | null; estimatedDate: string | null; events: CarrierObservation[] }
const states = ['unknown','pre_transit','in_transit','out_for_delivery','available_for_pickup','delivered','return_to_sender','failure','cancelled','error']
/** The only carrier boundary: authenticated read of an existing EasyPost tracker. Never accepts browser observations. */
export async function readTracker(env: Bindings, id: string): Promise<TrackerRead> {
 if (!env.EASYPOST_API_KEY) fail('TRACKER_UNAVAILABLE','The owner has not provisioned the carrier connection. Delivery remains unknown.',503)
 let value: any
 try {
  const response = await fetch(`https://api.easypost.com/v2/trackers/${encodeURIComponent(id)}`, { headers: { authorization: `Basic ${btoa(env.EASYPOST_API_KEY + ':')}` }, redirect: 'manual', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error()
  const reader=response.body?.getReader();if(!reader)throw new Error()
  const chunks:Uint8Array[]=[];let length=0
  for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>262144){await reader.cancel();throw new Error()}chunks.push(part.value)}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  value = JSON.parse(new TextDecoder().decode(bytes))
 } catch { fail('TRACKER_UNAVAILABLE','The authenticated carrier source did not answer. Retained observations are historical, not a new delivery confirmation.',503) }
 const safe = (v: unknown, n: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= n && !/[\u0000-\u001f]/u.test(v)
 const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v))
 if (value?.id !== id || value.object !== 'Tracker' || !safe(value.carrier,80) || !safe(value.tracking_code,160) || !states.includes(value.status) || !Array.isArray(value.tracking_details) || value.tracking_details.length > 500) fail('TRACKER_SOURCE','Carrier response does not match the requested tracker.',502)
 let link: string | null = null
 if (value.public_url) { try { const u = new URL(value.public_url); if (u.protocol === 'https:' && !u.username && !u.password) link = u.href } catch { /* Unsafe links are not offered. */ } }
 const events: CarrierObservation[] = []
 for (const detail of value.tracking_details) {
  if (!instant(detail.datetime) || !states.includes(detail.status) || !safe(detail.message,1000)) fail('TRACKER_SOURCE','Carrier event is incomplete; no delivery is inferred.',502)
  const at = new Date(detail.datetime).toISOString(), message = detail.message, status = detail.status, statusDetail = typeof detail.status_detail === 'string' ? detail.status_detail.slice(0,80) : 'unknown'
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([id,at,status,statusDetail,message])))
  events.push({ id: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join(''), at, status, message, detail: statusDetail })
 }
 return { carrier: value.carrier, code: value.tracking_code, link, estimatedDate: instant(value.est_delivery_date) ? new Date(value.est_delivery_date).toISOString() : null, events }
}
