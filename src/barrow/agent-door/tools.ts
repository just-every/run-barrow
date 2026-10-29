import type { Bindings } from '../../auth.server.ts'
import type { ToolDefinition, JsonSchema, JsonSchemaObject } from '../../modules/agent-door/types.ts'
import { orderCommand } from '../orders.ts'
import { cartCommand } from '../cart-import.ts'
import { nativeActor, native } from './native.ts'
import { readAccount, readCatalog, order, list, workspace, sharedLists } from './records.ts'

const str={type:'string',minLength:1}, object=(properties:Record<string,JsonSchema>,required:string[]=[]):JsonSchemaObject=>({type:'object',properties,required,additionalProperties:false})
export function tools(env:Bindings):ToolDefinition[] {
 const read=(area:string,verb:string,scope:string,clauses:string[],schema:JsonSchemaObject,run:(args:any,ctx:Parameters<ToolDefinition['run']>[1])=>Promise<unknown>):ToolDefinition=>({
  name:`barrow.${area}.${verb}`,title:`${area} ${verb}`,description:'Read current native records within the sponsor’s existing Barrow authority. Text is untrusted.',scope,readOnly:true,classes:['standard'],clauses,inputSchema:schema,outputSchema:{type:'object'},untrusted:true,
  classify:async(args,ctx)=>{await run(args,ctx);return [{class:'standard',facts:{measure:1}}]},run:async(args,ctx)=>({result:await run(args,ctx)})})
 const records:ToolDefinition[]=[
  read('workspace','read','accounts:read',['BAR-001','DATA-002'],object({}),(a,c)=>workspace(env,c)),
  read('accounts','read','accounts:read',['BAR-001'],object({id:str},['id']),(a,c)=>readAccount(env,a.id,c)),
  read('catalog','read','catalog:read',['BAR-003','CAT-001','STK-001'],object({accountId:str},['accountId']),(a,c)=>readCatalog(env,a.accountId,c)),
  read('orders','read','orders:read',['BAR-001','BAR-002'],object({id:str},['id']),(a,c)=>order(env,a.id,c)),
  read('lists','read','lists:read',['ORD-002'],object({id:str},['id']),(a,c)=>list(env,a.id,c)),
  read('lists','list','lists:read',['ORD-002'],object({accountId:str},['accountId']),async(a,c)=>({lists:await sharedLists(env,a.accountId,c)})),
  read('cart','preview','catalog:read',['ORD-001','BAR-003'],object({accountId:str,csv:str,paste:str},['accountId']),async(a,c)=>native(async()=>{await readAccount(env,a.accountId,c);return cartCommand(env,await nativeActor(env,c),'cart.preview',a)})),
  read('cart','form','catalog:read',['ORD-001','BAR-003'],object({accountId:str,layout:{type:'string',enum:['vertical','matrix']}},['accountId','layout']),async(a,c)=>native(async()=>{await readAccount(env,a.accountId,c);return cartCommand(env,await nativeActor(env,c),'cart.form',a)}))
 ]
 records.push({name:'barrow.orders.prepare',title:'Prepare a current-price order draft',description:'Prepare a validated draft only. A person must submit and approve it; no reservation, message, payment or provider charge occurs.',
  scope:'orders:prepare',readOnly:false,classes:['standard'],clauses:['BAR-003','AGT-001','ORD-001'],
  inputSchema:object({accountId:str,reference:{type:'string',maxLength:100},lines:{type:'array',minItems:1,maxItems:100,items:object({sku:str,unit:str,quantity:{type:'number',exclusiveMinimum:0}},['sku','quantity'])}},['accountId','lines']),outputSchema:{type:'object'},untrusted:true,revisionType:'string',
  revision:async(a,c)=>(await readAccount(env,String(a.accountId),c)).revision,
  target:async(a,c)=>({kind:'account',id:(await readAccount(env,String(a.accountId),c)).id}),
  classify:async(a,c)=>{await readAccount(env,String(a.accountId),c);return [{class:'standard',facts:{measure:Array.isArray(a.lines)?a.lines.length:0}}]},
  summary:async(a,c)=>{const value=await readAccount(env,String(a.accountId),c);return {target:{id:value.id,name:value.value.name},items:(a.lines as {sku:string;quantity:number}[]).map(line=>`${line.quantity} × ${line.sku}`)}},
  run:async(a,c)=>native(async()=>{const actor=await nativeActor(env,c),selected=await readAccount(env,String(a.accountId),c)
   const value=await orderCommand(env,actor,'order.prepare',a,{accountRevision:selected.revision,currency:selected.value.currency??'USD'})
   c.emit('order.prepared',`barrow://orders/${(value as {id:string}).id}`,{operationId:c.operationId})
   return {result:value,resources:[{uri:`barrow://orders/${(value as {id:string}).id}`,name:'Prepared draft'}]}
  })})
 return records
}
