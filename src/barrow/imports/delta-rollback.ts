import {rollbackDeltaUnits} from './delta-units'
import type { Bindings } from '../../auth.server'
import { fail, type Actor } from '../model'
import { now } from '../clock'
import { sha256, deltaRow, deltaView, deltaRevision, deltaReason, deltaFence, deltaCommit, deltaAudit } from './delta-store'

export async function rollbackDelta(env:Bindings,actor:Actor,id:string,input:{revision:string;reason:string;consent:boolean;resumeNativeOnly:boolean}) {
 const row=await deltaRow(env,actor,id)
 deltaRevision(row,input.revision)
 if(row.state==='erased')fail('DELTA_STATE','Erased source custody cannot be reopened.')
 if(row.state==='rolledback')return deltaView(row)
 if(input.consent!==true||input.resumeNativeOnly!==true)fail('DELTA_ROLLBACK_CONSENT','Explicitly resume native Pier-only order entry while stopping bridge exports and preserving source authority.',400)
 const reason=deltaReason(input.reason),at=(await now()).toISOString(),revision=crypto.randomUUID()
 const source=JSON.parse(row.source_json),report=JSON.parse(row.report_json),authorities=JSON.parse(row.authorities_json),watermark=JSON.parse(row.native_watermark_json)
 const baseline=new Map<string,{revision:string;hash:string}>((watermark.orders??[]).map((order:{id:string;revision:string;hash:string})=>[order.id,order]))
 const native=(await env.DB.prepare('SELECT id,account_id,revision,value_json FROM bw_orders WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(row.scope_json).all<{id:string;account_id:string;revision:string;value_json:string}>()).results
 const snapshot=JSON.stringify(native.map(order=>[order.id,order.account_id,order.revision,order.value_json]))
 const guard=env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(id,account_id,revision,value_json)) FROM (SELECT id,account_id,revision,value_json FROM bw_orders WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY id))=? THEN 1 ELSE 0 END').bind(row.scope_json,snapshot)
 const nativeDispositions=native.map(order=>{
  const value=JSON.parse(order.value_json),before=baseline.get(order.id),edited=Boolean(before&&(before.revision!==order.revision||before.hash!==sha256(order.value_json)))
  const commercial=Boolean(value.pierOrderId||value.invoice||value.release||!['draft','superseded'].includes(value.status))
  return {kind:'native-order',id:order.id,accountId:order.account_id,revision:order.revision,postCutover:Boolean(row.signedoff_at&&!before),nativeEdited:edited,
   disposition:commercial?'preserved-commercial-dependency':edited?'preserved-native-edit':'preserved-native-order',
   reason:commercial?'Existing order and its reservation, shipment or commercial evidence cannot be undone by migration rollback.':edited?'Later native edits are retained.':'Migration rollback never deletes or rewrites native orders.'}
 })
 const accounts=(await env.DB.prepare('SELECT id,revision FROM bw_accounts WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(row.scope_json).all<{id:string;revision:string}>()).results
 const accountGuard=env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(id,revision)) FROM (SELECT id,revision FROM bw_accounts WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id))=? THEN 1 ELSE 0 END').bind(row.scope_json,JSON.stringify(accounts.map(account=>[account.id,account.revision])))
 const accountBefore=new Map<string,string>((watermark.accounts??[]).map((account:{id:string;revision:string})=>[account.id,account.revision]))
 const accountDispositions=accounts.map(account=>({kind:'native-account',id:account.id,revision:account.revision,disposition:accountBefore.has(account.id)&&accountBefore.get(account.id)!==account.revision?'preserved-native-edit':'preserved-native-account',reason:'Native accounts and later profile edits are retained unchanged.'}))
 const dispositions=[...(source.records??[]).map((record:{kind:string;id:string})=>({kind:record.kind,id:record.id,sourceKey:`${record.kind}:${record.id}`,disposition:'retained-source-original',system:authorities[`${record.kind}:${record.id}`]??row.source_system,reason:'Isolated source originals remain; no native/provider effect was initiated and no external order or invoice authority is assumed.'})),...nativeDispositions,...accountDispositions]
 const units=await rollbackDeltaUnits(env,JSON.parse(row.scope_json),watermark.unitChanges??[])
 dispositions.push(...units.dispositions as any)
 const rollback={at,by:actor.id,reason,resumeNativeOnly:true,exportsPaused:true,dispositions}
 await deltaCommit(env,actor,[deltaFence(env,row),guard,accountGuard,...units.guards,...units.statements,
  env.DB.prepare("UPDATE bw_delta_cutovers SET state='rolledback',revision=?,report_json=?,updated_at=?,reason=? WHERE id=?").bind(revision,JSON.stringify({...report,rollback}),at,reason,id),
  deltaAudit(env,actor,id,'delta.rolledback',revision,reason),
  ...units.dispositions.filter(item=>item.disposition==='reversed').map(item=>deltaAudit(env,actor,item.id,'delta.units-reversed',revision,reason)),
 ])
 return deltaView({...row,state:'rolledback',revision,report_json:JSON.stringify({...report,rollback}),updated_at:at,reason})
}
