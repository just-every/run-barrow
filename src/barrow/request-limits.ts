import type { Bindings } from '../auth.server'

/** Every seed API door, including anonymous intake, webhooks and unknown paths, shares this admission limit.
 * The trusted platform IP is HMACed with the installation secret; addresses and payloads are never stored.
 * Existing stricter authentication and trade-application limits still apply. Missing platform IPs share one bucket.
 */
export async function requestLimit(request: Request, env: Bindings): Promise<Response | null> {
 const now = Date.now(), window = Math.floor(now / 60000), expires = (window + 1) * 60000
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), {name:'HMAC',hash:'SHA-256'}, false, ['sign'])
 const bytes = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${window}:${request.headers.get('CF-Connecting-IP') ?? 'unattributed'}`))
 const digest = Array.from(new Uint8Array(bytes), n=>n.toString(16).padStart(2,'0')).join('')
 const results = await env.DB.batch([
  env.DB.prepare('DELETE FROM bw_request_rates WHERE expires_at<=?').bind(now),
  env.DB.prepare('INSERT INTO bw_request_rates(digest,count,expires_at) VALUES(?,1,?) ON CONFLICT(digest) DO UPDATE SET count=MIN(count+1,601) RETURNING count').bind(digest,expires),
 ])
 if ((results[1].results[0] as {count:number}).count <= 600) return null
 return Response.json({error:{code:'RATE_LIMIT',message:'Too many requests. Wait before trying again.'}}, {status:429,headers:{'retry-after':String(Math.max(1,Math.ceil((expires-now)/1000))),'cache-control':'no-store','x-content-type-options':'nosniff'}})
}
