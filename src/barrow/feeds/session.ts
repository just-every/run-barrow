import type {Bindings} from '../../auth.server'
import {audit,commit} from '../access'
import {fail,type Actor} from '../model'
import {now} from '../clock'
import {deltaRow,deltaRevision,deltaReason,deltaView,canonicalJson} from '../imports/delta-store'
import {updateDeltaFeed} from '../imports/delta-feed'
import {captureFeedLayout,validateFeedConfig,type FeedConfiguration,type FeedSnapshot,type FeedDelivery} from './layout'
import {runRehearsal} from './rehearsal'
import {prepareExports,deliverExports} from './export'

const LEASE_MS=10*60*1000
export async function runDeltaFeed(env:Bindings,actor:Actor,id:string,kind:'rehearse'|'run',input:{revision:string;config?:FeedConfiguration;consent:boolean;reason:string}) {
 const row=await deltaRow(env,actor,id);deltaRevision(row,input?.revision)
 if(input.consent!==true)fail('FEED_CONSENT','Explicitly authorize this destination run.',400)
 const reason=deltaReason(input.reason)
 if(row.state!==(kind==='rehearse'?'rehearsal':'signedoff'))fail('DELTA_STATE','Rehearsal files stay isolated; exports require an active signed-off cutoff.')
 if(kind==='run'&&(!row.cutoff_at||Date.parse(row.cutoff_at)>(await now()).getTime()))fail('DELTA_CUTOFF','Order export remains off until the signed cutoff time.')
 let config:FeedConfiguration|undefined
 if(kind==='rehearse') {
  config=validateFeedConfig(input.config!)
  if(canonicalJson([...config.accountIds].sort())!==canonicalJson(JSON.parse(row.scope_json)))fail('FEED_SCOPE','Use exactly the cutover session account scope.',400)
  config.layout=await captureFeedLayout(env.DB,config.layoutId)
 }
 const token=crypto.randomUUID(),until=Date.now()+LEASE_MS
 try {await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_delta_cutovers WHERE id=? AND revision=? AND state=? AND io_until<=?) THEN 1 ELSE 0 END').bind(id,row.revision,row.state,Date.now()),env.DB.prepare('UPDATE bw_delta_cutovers SET io_token=?,io_until=? WHERE id=?').bind(token,until,id)])}
 catch(error) {if((error as Error).message.includes('CHECK constraint'))fail('FEED_BUSY','The session changed or already has a destination run in progress. Reload it before retrying.');throw error}
 const fence=()=>env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_delta_cutovers WHERE id=? AND revision=? AND state=? AND io_token=? AND io_until>?) THEN 1 ELSE 0 END').bind(id,row.revision,row.state,token,Date.now())
 const assertActive=async()=>{
  try {await commit(env.DB,actor,[fence(),env.DB.prepare('UPDATE bw_delta_cutovers SET io_until=? WHERE id=? AND io_token=?').bind(Date.now()+LEASE_MS,id,token)])}
  catch {fail('FEED_PAUSED','This destination run lost its session or owner authority. No further file may be written.')}
 }
 const release=()=>env.DB.prepare('UPDATE bw_delta_cutovers SET io_token=NULL,io_until=0 WHERE id=? AND io_token=?').bind(id,token).run()
 try {
  if(kind==='rehearse') {
   const previous=JSON.parse(row.feed_json) as FeedSnapshot
   const snapshot=await runRehearsal(config!,env.BARROW_SFTP_SECRETS,{...previous,consent:true},actor.id,(await now()).toISOString())
   await assertActive();await release()
   return updateDeltaFeed(env,actor,id,{...snapshot,expectedRevision:row.revision},reason)
  }
  const snapshot=await prepareExports(env.DB,JSON.parse(row.feed_json),{sessionId:id,cutoffAt:row.cutoff_at!,signedoffAt:row.signedoff_at!,excludedOrders:JSON.parse(row.excluded_order_ids_json),accountIds:JSON.parse(row.scope_json)})
  // Retain the immutable destination, identity, exact layout and bytes BEFORE any remote write.
  await commit(env.DB,actor,[fence(),env.DB.prepare('UPDATE bw_delta_cutovers SET feed_json=? WHERE id=?').bind(JSON.stringify(snapshot),id),...JSON.parse(row.scope_json).map((accountId:string)=>audit(env.DB,actor,id,'feed.export-prepared',{accountId,revision:row.revision,source:'cutover.feed.run',reason}))])
  const claim=async(delivery:FeedDelivery)=>{
   await assertActive()
   const retained=(snapshot.deliveries??[]).find(item=>item.id===delivery.id)
   if(!retained||canonicalJson(retained)!==canonicalJson(delivery))fail('FEED_CHANGED','The retained delivery changed; review it before publishing.')
   await commit(env.DB,actor,[fence(),env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=? AND json_extract(value_json,'$.status')='approved') THEN 1 ELSE 0 END").bind(delivery.orderId,delivery.orderRevision)])
   return true
  }
  const completed=await deliverExports(snapshot,env.BARROW_SFTP_SECRETS,{claim,assertActive},(await now()).toISOString())
  const revision=crypto.randomUUID(),at=(await now()).toISOString()
  await commit(env.DB,actor,[fence(),env.DB.prepare('UPDATE bw_delta_cutovers SET feed_json=?,revision=?,updated_at=?,reason=? WHERE id=?').bind(JSON.stringify(completed),revision,at,reason,id),...JSON.parse(row.scope_json).map((accountId:string)=>audit(env.DB,actor,id,'feed.export-reconciled',{accountId,revision,source:'cutover.feed.run',reason})),...completed.deliveries.map(delivery=>audit(env.DB,actor,delivery.orderId,'feed.delivery-reconciled',{orderId:delivery.orderId,revision:delivery.orderRevision,source:'cutover.feed.run',reason:`${delivery.state}: ${delivery.error??'Exact retained delivery reconciled'}`}))])
  return deltaView({...row,revision,feed_json:JSON.stringify(completed),updated_at:at,reason})
 } finally {await release()}
}
