import type { Bindings } from '../../auth.server.ts'
import { agentDoor } from './index.ts'

/** Stream every retained audit field through the existing person-only reader. */
export async function agentAuditExport(request:Request,env:Bindings):Promise<Response> {
 if(request.method!=='GET')return Response.json({code:'method_not_allowed'},{status:405})
 const url=new URL(request.url),query=new URLSearchParams()
 for(const key of ['agent','class'])if(url.searchParams.has(key))query.set(key,url.searchParams.get(key)!)
 const door=agentDoor(env)
 const page=async(after?:string)=>{
  const next=new URL('/agents/api/audit',env.AUTH_ORIGIN)
  next.search=query.toString()
  if(after)next.searchParams.set('after',after)
  return (await door.handle(new Request(next,{headers:request.headers})))!
 }
 const first=await page()
 if(!first.ok)return first
 // Freeze membership at admission; later activity belongs to the next export.
 const last=await env.DB.prepare('SELECT max(sequence) AS last FROM agent_door_audit').first<{last:number|null}>()
 const through=last?.last??0
 const encoder=new TextEncoder()
 let current=first,cursor:string|undefined,started=false,opened=false,ended=false
 const body=new ReadableStream<Uint8Array>({
  async pull(controller) {
   try {
    if(ended){controller.close();return}
    const value=await current.json() as {rows:Array<{sequence:number}>;cursor:string|null}
    const rows=value.rows.filter(row=>row.sequence<=through)
    controller.enqueue(encoder.encode((opened?'': '{"rows":[')+(started&&rows.length?',':'')+rows.map(row=>JSON.stringify(row)).join(',')))
    opened=true;started=started||rows.length>0
    if(!value.cursor||value.cursor===cursor||Number(value.cursor)>=through) {
     controller.enqueue(encoder.encode(']}'));ended=true;controller.close();return
    }
    cursor=value.cursor
    current=await page(cursor)
    // Revoked people never continue reading, and a truncated download is invalid JSON.
    if(!current.ok)throw new Error('audit_export_authority_changed')
   } catch(error) {controller.error(error)}
  }
 })
 return new Response(body,{headers:{'content-type':'application/json','content-disposition':'attachment; filename="barrow-agent-audit.json"','cache-control':'no-store','x-content-type-options':'nosniff'}})
}
