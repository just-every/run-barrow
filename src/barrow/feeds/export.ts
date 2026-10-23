import { Buffer } from 'node:buffer'
import { digest } from '../digest'
import { confirmationCsv, readConfirmations } from '../confirmations'
import { csvText } from '../cart-csv'
import { fail, type Order } from '../model'
import { fullyReserved } from '../pier'
import { openSftp } from './transport'
import { feedCsv, feedPath, validateFeedConfig, type FeedConfiguration, type FeedDelivery, type FeedSnapshot } from './layout'

export type ExportCutoff = {sessionId:string;cutoffAt:string;signedoffAt:string;excludedOrders:string[];accountIds:string[]}
/** Root must acquire a durable session lease, persist prepareExports(), then fence EVERY effect. */
export type ExportFence = {claim(delivery:FeedDelivery):Promise<boolean>;assertActive():Promise<void>}
const BATCH=20
async function destination(config:FeedConfiguration) {
 const c=config.connection
 return digest(JSON.stringify([c.host,c.port,c.username,c.hostKey,c.exportDirectory.replace(/\/$/,''),c.ackDirectory.replace(/\/$/,'')]))
}
function eligible(order:Order,cutoff:ExportCutoff) {
 try {
  return cutoff.accountIds.includes(order.accountId)&&!cutoff.excludedOrders.includes(order.id)
   &&Date.parse(order.preparedAt)>=Date.parse(cutoff.cutoffAt)&&Date.parse(order.preparedAt)>=Date.parse(cutoff.signedoffAt)
   &&Boolean(order.approvedBy&&!order.approvedBy.startsWith('agent:')&&order.approvedAt&&Date.parse(order.approvedAt)>=Date.parse(cutoff.cutoffAt))
   &&order.status==='approved'&&Boolean(order.pierOrderId)&&fullyReserved({lines:order.reservation},order.lines)
 }catch{return false}
}
/** Creates no external effect. The returned immutable bytes/identity must be persisted under CAS before IO. */
export async function prepareExports(db:D1Database,snapshot:FeedSnapshot,cutoff:ExportCutoff):Promise<FeedSnapshot> {
 const config=validateFeedConfig(snapshot.config),layout=config.layout
 if(!snapshot.consent||!layout||layout.id!==config.layoutId)fail('FEED_CONSENT','Sign off the destination and an exact saved confirmation layout before exporting.',409)
 if(!Number.isFinite(Date.parse(cutoff.cutoffAt))||!Number.isFinite(Date.parse(cutoff.signedoffAt)))fail('FEED_CUTOFF','A signed-off cutoff and native-order watermark are required.',409)
 if(config.accountIds.length!==cutoff.accountIds.length||config.accountIds.some(id=>!cutoff.accountIds.includes(id)))fail('FEED_SCOPE','The feed account scope differs from the signed-off session.',409)
 const result=structuredClone(snapshot),target=await destination(config)
 result.deliveries??=[]
 for(const delivery of result.deliveries) {
  if(delivery.destination!==target)fail('FEED_DESTINATION','Retained deliveries belong to a different signed-off destination.',409)
  if(delivery.state==='processed')continue
  const row=await db.prepare('SELECT value_json,revision FROM bw_orders WHERE id=?').bind(delivery.orderId).first<{value_json:string;revision:string}>()
  if(!row||row.revision!==delivery.orderRevision||!eligible({...JSON.parse(row.value_json),revision:row.revision},cutoff))delivery.error='FEED_ORDER_CHANGED'
 }
 const excluded=[...cutoff.excludedOrders,...result.deliveries.map(delivery=>delivery.orderId)]
 const rows=await db.prepare(`SELECT value_json,revision FROM bw_orders WHERE account_id IN (SELECT value FROM json_each(?))
  AND id NOT IN (SELECT value FROM json_each(?)) AND json_extract(value_json,'$.status')='approved'
  AND json_extract(value_json,'$.preparedAt')>=? AND json_extract(value_json,'$.preparedAt')>=?
  ORDER BY json_extract(value_json,'$.preparedAt'),id LIMIT 21`).bind(JSON.stringify(cutoff.accountIds),JSON.stringify(excluded),cutoff.cutoffAt,cutoff.signedoffAt).all<{value_json:string;revision:string}>()
 result.moreOrders=rows.results.length>BATCH
 for(const row of rows.results.slice(0,BATCH)) {
  const order:Order={...JSON.parse(row.value_json),revision:row.revision}
  if(!eligible(order,cutoff))continue
  const record=[...await readConfirmations(db,order.id)].reverse().find(confirmation=>confirmation.stage==='accepted')
  if(!record||record.snapshot.accountId!==order.accountId||record.snapshot.totalCents!==order.totalCents||JSON.stringify(record.snapshot.lines)!==JSON.stringify(order.lines))continue
  const approval=await db.prepare(`SELECT 1 AS found FROM bw_audit WHERE subject_id=? AND action='order.approved' AND actor_id=? AND json_extract(context_json,'$.revision')=?`).bind(order.id,order.approvedBy!,record.snapshot.orderRevision).first()
  if(!approval)continue
  const id=await digest(JSON.stringify([cutoff.sessionId,target,order.id]))
  const rows=feedCsv(new TextEncoder().encode(confirmationCsv(record,layout)))
  const csv=csvText([['delivery_identity','native_order','native_order_revision','confirmation_revision',...rows[0]],...rows.slice(1).map(cells=>[id,order.id,order.revision,record.snapshot.orderRevision,...cells])])
  result.deliveries.push({id,destination:target,orderId:order.id,orderRevision:order.revision,confirmationRevision:record.snapshot.orderRevision,confirmation:record.number,layout:structuredClone(layout),filename:`barrow-${id}.csv`,bytesBase64:Buffer.from(csv,'utf8').toString('base64'),sha256:await digest(csv),preparedAt:order.preparedAt,state:'pending'})
 }
 if(new TextEncoder().encode(JSON.stringify(result)).byteLength>1_800_000)fail('FEED_CUSTODY_LIMIT','Retained feed and export custody exceeds the session storage limit.',409)
 return result
}

function acknowledgment(bytes:Uint8Array,json:boolean,delivery:FeedDelivery):boolean {
 try {
  let value:Record<string,unknown>
  if(json)value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  else {
   const rows=feedCsv(bytes),headers=['identity','orderId','orderRevision','status']
   if(rows.length!==2||rows[0].join(',')!==headers.join(',')||rows[1].length!==4)return false
   value=Object.fromEntries(headers.map((header,index)=>[header,rows[1][index]]))
  }
  return Boolean(value&&value.identity===delivery.id&&value.orderId===delivery.orderId&&value.orderRevision===delivery.orderRevision&&value.status==='processed')
 }catch{return false}
}
/** Reads processed acknowledgments and resends the SAME retained filename and bytes, never another reservation. */
export async function deliverExports(snapshot:FeedSnapshot,secrets:string|undefined,fence:ExportFence,at:string):Promise<FeedSnapshot> {
 const config=validateFeedConfig(snapshot.config),target=await destination(config),result=structuredClone(snapshot)
 if(!snapshot.consent||!fence?.claim||!fence?.assertActive)fail('FEED_CLAIM','A signed-off feed and durable export claim are required.',409)
 if(!Number.isFinite(Date.parse(at)))fail('FEED_TIME','Record a valid delivery attempt timestamp.',400)
 await fence.assertActive()
 const pending=result.deliveries.filter(delivery=>delivery.state!=='processed'&&delivery.error!=='FEED_ORDER_CHANGED').slice(0,BATCH)
 if(!pending.length)return result
 const connection=await openSftp(config.connection,secrets)
 try {
  await fence.assertActive()
  const acks=await connection.list(config.connection.ackDirectory)
  await fence.assertActive()
  const exports=await connection.list(config.connection.exportDirectory)
  for(const delivery of pending) {
   if(delivery.destination!==target)fail('FEED_DESTINATION','This export belongs to a different approved destination.',409)
   const bytes=Buffer.from(delivery.bytesBase64,'base64')
   const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)))].map(value=>value.toString(16).padStart(2,'0')).join('')
   if(checksum!==delivery.sha256||delivery.filename!==`barrow-${delivery.id}.csv`)fail('FEED_CUSTODY','Retained export custody does not match its immutable identity.',409)
   await fence.assertActive()
   if(!await fence.claim(delivery))fail('FEED_CLAIM','The exact retained export was not claimed for this active session.',409)
   const ack=acks.find(file=>!file.directory&&(file.name===`${delivery.filename}.ack.json`||file.name===`${delivery.filename}.ack.csv`))
   if(ack) {
    await fence.assertActive()
    const contents=await connection.read(feedPath(config.connection.ackDirectory,ack.name),16*1024)
    if(acknowledgment(contents,ack.name.endsWith('.json'),delivery)) {
     delivery.state='processed';delivery.processedAt=at;delete delivery.error;continue
    }
    delivery.error='FEED_ACK_INVALID'
    continue
   }
   const final=feedPath(config.connection.exportDirectory,delivery.filename)
   await fence.assertActive()
   if(exports.some(file=>file.name===delivery.filename&&!file.directory)) {
    const existing=await connection.read(final,Math.max(bytes.byteLength,1))
    if(Buffer.compare(Buffer.from(existing),bytes)!==0){delivery.error='FEED_DESTINATION_CONFLICT';continue}
   } else {
    const temporary=feedPath(config.connection.exportDirectory,`${delivery.filename}.part`)
    await connection.write(temporary,bytes)
    await fence.assertActive()
    await connection.rename(temporary,final)
   }
   delivery.state='sent';delivery.sentAt??=at;delete delivery.error
  }
  return result
 }finally{await connection.close()}
}
