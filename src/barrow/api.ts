import { listCommercialAudit,exportCommercialAudit } from './commercial-audit'
import { runtimeBindings, type Bindings } from '../auth.server'
import { createPortabilityHandler, boundedJson } from '@runeditrun/rer/modules/portability/http'
import { portabilityPolicy } from './portability-policy.mjs'
import { current,digest,commit,audit } from './access'
import { account,accounts,accountCommand } from './accounts'
import { orderCommand,readOrder } from './orders'
import { documentResponse } from './documents'
import { orderHistory } from './reorders'
import { catalogue, pierConfigured } from './pier'
import { invoiceCsv } from './invoice'
import { Problem,fail,requireSupplier,supplier } from './model'
import { dryRunAccountImport,applyAccountImport,listAccountImports,getAccountImport,undoAccountImport } from './imports'
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
export async function barrowResponse(request:Request,original:Bindings):Promise<Response|null> {
 const url=new URL(request.url),path=url.pathname
 if(!path.startsWith('/api/barrow/')) return null
 try {
  const env=runtimeBindings(original),actor=await current(request,env)
  if(!['GET','HEAD'].includes(request.method) && !actor.agent && request.headers.get('origin')!==env.AUTH_ORIGIN) fail('ORIGIN','Use this installation’s own page to change records.',403)
  if(path.startsWith('/api/barrow/portability/')) {
   requireSupplier(actor)
   if(actor.role!=='owner') fail('FORBIDDEN','Only the owner may export or restore the full installation.',403)
   return (await createPortabilityHandler({db:env.DB,policy:portabilityPolicy,appOrigin:env.AUTH_ORIGIN,basePath:'/api/barrow/portability',authorize:async()=>actor.id}))(request)
  }
  if(path==='/api/barrow/state' && request.method==='GET') {
   const selected=await accounts(env.DB,actor)
   const rows=await env.DB.prepare('SELECT value_json,revision FROM bw_orders'+(supplier(actor)?'':" WHERE account_id IN (SELECT id FROM bw_accounts WHERE json_extract(value_json,'$.email')=?)")+' ORDER BY rowid DESC').bind(...(supplier(actor)?[]:[actor.email])).all<any>()
   const orders=rows.results.map(row=>({...JSON.parse(row.value_json),revision:row.revision}))
   // Order history names people, not operator IDs: the display names of everyone these orders record.
   const ids=[...new Set(orders.flatMap((order:any)=>[order.preparedBy,order.submittedBy,order.approvedBy]).filter((id:unknown)=>typeof id==='string'&&!id.startsWith('agent:')))]
   const people=ids.length?Object.fromEntries((await env.DB.prepare('SELECT id,display_name FROM oa_operators WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<any>()).results.map(row=>[row.id,row.display_name])):{}
   return json({actor:{id:actor.id,email:actor.email,role:actor.role,agent:actor.agent},accounts:selected,orders,people,connection:{configured:await pierConfigured(env)}})
  }
  if(path==='/api/barrow/audit' && request.method==='GET') return json(await listCommercialAudit(env.DB,actor,url.searchParams))
  if(path==='/api/barrow/audit.csv' && request.method==='GET') return await exportCommercialAudit(env.DB,actor,url.searchParams)
  if(path==='/api/barrow/orders/history' && request.method==='GET') return json({orders:await orderHistory(env,actor,url.searchParams)})
  if(path==='/api/barrow/catalogue' && request.method==='GET') return json(await catalogue(env,await account(env.DB,actor,url.searchParams.get('accountId')??'')))
  const invoice=/^\/api\/barrow\/invoices\/([-a-zA-Z0-9_]+)\.csv$/.exec(path)
  if(invoice && request.method==='GET') {
   if(actor.agent) fail('FORBIDDEN','A person must download invoice exports.',403)
   const order=await readOrder(env.DB,actor,invoice[1])
   return new Response(invoiceCsv(order),{headers:{'content-type':'text/csv; charset=utf-8','cache-control':'no-store','content-disposition':`attachment; filename="barrow-${order.id}.csv"`}})
  }
  const document=/^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)\/document$/.exec(path)
  if(document && request.method==='GET') return await documentResponse(env,actor,await readOrder(env.DB,actor,document[1]))
  if(path.startsWith('/api/barrow/imports')) {
   requireSupplier(actor)
   if(path==='/api/barrow/imports'&&request.method==='GET') return json({jobs:await listAccountImports(env.DB,actor)})
   if(path==='/api/barrow/imports/preview'&&request.method==='POST') return json(await dryRunAccountImport(env.DB,actor,await boundedJson(request,1000000)))
   if(path==='/api/barrow/imports/apply'&&request.method==='POST') return json(await applyAccountImport(env.DB,actor,await boundedJson(request,1000000)))
   const match=/^\/api\/barrow\/imports\/([^/]+)(\/undo)?$/.exec(path)
   if(match && match[2] && request.method==='POST') return json(await undoAccountImport(env.DB,actor,match[1]))
   if(match && !match[2] && request.method==='GET') return json(await getAccountImport(env.DB,actor,match[1]))
  }
  if(path==='/api/barrow/agent-token' && request.method==='POST') {
   requireSupplier(actor)
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),expiresAt=Date.now()+7*86400000
   await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_agent_tokens VALUES(?,?,?,?,?)').bind(id,await digest(token),actor.id,actor.version,expiresAt),audit(env.DB,actor,id,'agent.granted',{revision:id,source:'agent-token.create',reason:'Supplier granted seven-day catalog-read and draft-only agent authority.'})])
   return json({token,expiresAt})
  }
  if(path==='/api/barrow/agent-token/revoke'&&request.method==='POST') {
   requireSupplier(actor)
   await commit(env.DB,actor,[env.DB.prepare('DELETE FROM bw_agent_tokens WHERE actor_id=?').bind(actor.id),audit(env.DB,actor,actor.id,'agent.revoked',{revision:`operator:${actor.version}`,source:'agent-token.revoke',reason:'Supplier revoked every agent grant issued under this identity.'})])
   return json({revoked:true})
  }
  if(path==='/api/barrow/commands' && request.method==='POST') {
   // A command carries at most one 1 MB PO document as base64.
   const body=await boundedJson(request,1500000) as any
   if(typeof body?.type!=='string'||!body.payload||typeof body.payload!=='object') fail('INPUT','A command has a type and payload.',400)
   if(actor.agent && body.type!=='order.prepare') fail('PERSON_REQUIRED','Agents may prepare drafts only. A person must submit and approve.',403)
   let result
   if(['account.save','account.invite','account.erase'].includes(body.type)) result=await accountCommand(request,env,actor,body.type,body.payload)
   else if(['order.prepare','order.submit','order.approve','order.refresh','order.cancel','order.attach','order.reorder-preview','order.reorder'].includes(body.type)) result=await orderCommand(env,actor,body.type,body.payload)
   else fail('COMMAND','Unknown command.',404)
   return json({result})
  }
  return json({error:{code:'NOT_FOUND',message:'Unknown endpoint.'}},404)
 } catch(error:any) {
  if(error?.message==='NATIVE_EDIT_CONFLICT') return json({error:{code:'NATIVE_EDIT_CONFLICT',message:'A native account edit was made after import. Undo stopped and preserved that edit.'}},409)
  if(error instanceof Problem) return json({error:{code:error.code,message:error.message}},error.status)
  // Import diagnostics contain product-authored messages; database/provider errors never escape.
  if(typeof error?.code==='string' && /^(ACCOUNT_|IMPORT_|CSV_|FORBIDDEN|NATIVE_EDIT_CONFLICT)/.test(error.code)) return json({error:{code:error.code,message:error.message}},error.code==='FORBIDDEN'?403:409)
  return json({error:{code:'CONFLICT',message:'This change could not be saved. Refresh the current record and check for a duplicate account email or changed permissions.'}},409)
 }
}
