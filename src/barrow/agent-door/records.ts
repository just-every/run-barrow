import { proposalRecord } from './proposals.ts'
import { retainAgentAccount } from './custody.ts'
import type { Bindings } from '../../auth.server.ts'
import type { ResourceDefinition, ToolContext, ResourceContext } from '../../modules/agent-door/types.ts'
import { accounts, account } from '../accounts.ts'
import { readOrder } from '../orders.ts'
import { readLists, readList } from '../lists.ts'
import { catalogue } from '../pier.ts'
import { requireCompanyRight } from '../company-policy.ts'
import { requireUsageTerms } from '../usage-terms.ts'
import { nativeActor, native, restrictAccount } from './native.ts'

export type Context = Pick<ToolContext|ResourceContext,'person'|'agent'|'clientId'|'scopes'>
export async function readAccount(env:Bindings,id:string,ctx:Context) {
 return native(async()=>{const actor=await nativeActor(env,ctx);await restrictAccount(env,actor,id);const value=await account(env.DB,actor,id);await requireUsageTerms(env,actor,id);await retainAgentAccount(env.DB,id,value.revision);return value})
}
export async function readCatalog(env:Bindings,id:string,ctx:Context) {
 return native(async()=>{const actor=await nativeActor(env,ctx);await restrictAccount(env,actor,id);await requireCompanyRight(env.DB,actor,id,'purchasing');const selected=await readAccount(env,id,ctx);return catalogue(env,selected)})
}
export async function order(env:Bindings,id:string,ctx:Context) {
 return native(async()=>{const actor=await nativeActor(env,ctx),value=await readOrder(env.DB,actor,id);await restrictAccount(env,actor,value.accountId);await readAccount(env,value.accountId,ctx);return value})
}
export async function list(env:Bindings,id:string,ctx:Context) {
 return native(async()=>{const value=await readList(env.DB,await nativeActor(env,ctx),id);await readAccount(env,value.accountId,ctx);return value})
}
export async function workspace(env:Bindings,ctx:Context) {
 return native(async()=>{const actor=await nativeActor(env,ctx),directory=await accounts(env.DB,actor)
  const rows=(await env.DB.prepare('SELECT id FROM bw_orders ORDER BY id').all<{id:string}>()).results
  for(const selected of directory)await retainAgentAccount(env.DB,selected.id,selected.revision)
  const orders=[]
  for(const row of rows){try{orders.push(await readOrder(env.DB,actor,row.id))}catch(error){if(!(error instanceof Error))throw error}}
  return {accounts:directory,orders}
 })
}
export const sharedLists = (env:Bindings,id:string,ctx:Context)=>native(async()=>{await readAccount(env,id,ctx);return readLists(env.DB,await nativeActor(env,ctx),id)})

export function resources(env:Bindings):ResourceDefinition[] {
 const record=(kind:string,read:(id:string,ctx:ResourceContext)=>Promise<unknown>):ResourceDefinition=>({
  uriTemplate:`barrow://${kind}/{id}`,name:`Barrow ${kind}`,description:'Native private record; imported and external text is untrusted.',classes:['standard'],scope:kind==='proposals'?'proposals:submit':kind==='catalogs'?'catalog:read':kind==='orders'?'orders:read':kind==='lists'?'lists:read':'accounts:read',
  classify:record=>[{class:'standard',facts:{measure:record.json?1:0}}],
  async read(uri,ctx){try{const url=new URL(uri);if(url.protocol!=='barrow:'||url.hostname!==kind||!/^\/[^/]+$/.test(url.pathname))return null;return {json:await read(decodeURIComponent(url.pathname.slice(1)),ctx),untrusted:true}}catch{return null}}
 })
 return [record('accounts',(id,ctx)=>readAccount(env,id,ctx)),record('catalogs',(id,ctx)=>readCatalog(env,id,ctx)),record('orders',(id,ctx)=>order(env,id,ctx)),record('lists',(id,ctx)=>list(env,id,ctx)),record('proposals',(id,ctx)=>proposalRecord(env,id,ctx))]
}
