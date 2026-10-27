import type { Bindings } from '../auth.server'
import { audit, commit } from './access'
import { cutoverOwner } from './imports/cutover-targets'
import { previewPier, type ConnectorIssue } from './pier-review'
import { fail, text, type Actor } from './model'
import { openSftp } from './feeds/transport'
import type { FeedSnapshot } from './feeds/layout'

/** Observations only: native commerce and Pier stock retain their existing authorities. */
export async function connectorReview(env: Bindings, actor: Actor) {
 cutoverOwner(actor)
 const prior = await env.DB.prepare("SELECT value_json,revision FROM bw_settings WHERE key='connectorReview'").first<{value_json:string;revision:string}>()
 return { review: prior ? JSON.parse(prior.value_json) : null, revision: prior?.revision ?? null }
}
export async function inspectConnectors(env: Bindings, actor: Actor, input: {revision?:string|null;reason:string}) {
 cutoverOwner(actor)
 const reason = text(input?.reason, 'Review reason', 1000), before = await connectorReview(env, actor)
 if ((input.revision ?? null) !== before.revision) fail('CONNECTOR_CHANGED','Reload the connector review before inspecting again.')
 const at = new Date().toISOString(), owner = actor.id
 const preview = await previewPier(env, owner, before.review?.pier)
 const {pier} = preview, issues:ConnectorIssue[] = [...preview.issues]
 const attention = (record:string,kind:string,message:string,action:string,responsibleOwner=owner) => issues.push({record,kind,message,action,owner:responsibleOwner})
 const sync=await env.DB.prepare('SELECT observed_at,completed_at,pending,has_more,failures,enabled,task_owner,task_status FROM bw_stock_sync WHERE singleton=1').first<any>()
 const feedRows=(await env.DB.prepare('SELECT id,state,updated_at,feed_json,report_json,source_system,authorities_json,created_by,last_read_at,last_io_error FROM bw_delta_cutovers ORDER BY created_at,id').all<{id:string;state:string;updated_at:string;feed_json:string;report_json:string;source_system:string;authorities_json:string;created_by:string;last_read_at:string|null;last_io_error:string|null}>()).results
 const feeds=[]
 for(const row of feedRows) {
  const feed=JSON.parse(row.feed_json) as Partial<FeedSnapshot>, comparison=JSON.parse(row.report_json).comparison
  const totals=(comparison?.totals??[]).map((total:any)=>({kind:total.kind,currency:total.currency,sourceCount:total.sourceCount,targetCount:total.targetCount,sourceCents:total.sourceCents,targetCents:total.targetCents,differenceCents:total.differenceCents,sourceQuantity:total.sourceQuantity,targetQuantity:total.targetQuantity,quantityDifference:total.quantityDifference}))
  const files=(feed.rehearsal?.files??[]).map(file=>({id:file.id,name:file.name,kind:file.kind,receivedAt:file.receivedAt,rowsAccepted:file.rowsAccepted,owner:file.owner,errors:file.errors}))
  const deliveries=(feed.deliveries??[]).map(file=>({id:file.id,orderId:file.orderId,filename:file.filename,state:file.state,preparedAt:file.preparedAt,error:file.error??null}))
  const currentFiles = ['products','customers','ats'].map(kind=>[...files].reverse().find(file=>file.kind===kind)).filter((file):file is typeof files[number]=>Boolean(file))
  for(const file of currentFiles)for(const error of file.errors)attention(`${row.id}:${file.id}:${error.row}`,'quarantined-row',`${file.name} row ${error.row}: ${error.message}`,'Repair the source or field mapping in Move in, then rehearse the feed again.',error.owner)
  for(const file of deliveries)if(file.state!=='processed')attention(file.orderId,'unacknowledged-file',`${file.filename}: ${file.state}; the ERP has not acknowledged processing.`,'Review the retained delivery in Move in and explicitly reconcile or resend the same identity.',row.created_by)
  let connectionState='inactive'
  if(['rehearsal','signedoff'].includes(row.state)&&feed.config&&feed.consent===true) {
   let connection:Awaited<ReturnType<typeof openSftp>>|undefined
   try {
    connection=await openSftp(feed.config.connection,env.BARROW_SFTP_SECRETS)
    await connection.list(feed.config.connection.importDirectory);await connection.list(feed.config.connection.ackDirectory)
    connectionState='answered'
   } catch {
    connectionState='unavailable';attention(row.id,'feed-connection','The retained feed destination could not be read with its current credential.','Reconnect the retained destination in Move in and explicitly rehearse again.',row.created_by)
   } finally {await connection?.close().catch(()=>{})}
  }
  if(row.last_io_error)attention(row.id,'feed-operation',row.last_io_error,'Repair the destination or its permissions in Move in and explicitly retry the retained session.',row.created_by)
  feeds.push({connectionState,lastSuccessfulReadAt:row.last_read_at,lagSeconds:row.last_read_at?Math.max(0,Math.floor((Date.parse(at)-Date.parse(row.last_read_at))/1000)):null,sourceSystem:row.source_system,authorities:JSON.parse(row.authorities_json),totals,mappings:comparison?.mappings??{},balanceNote:comparison?.balanceNote??null,id:row.id,state:row.state,updatedAt:row.updated_at,mapping:feed.config?.mapping??null,files,deliveries,counts:feed.rehearsal?{products:feed.rehearsal.products,customers:feed.rehearsal.customers,ats:feed.rehearsal.ats,unresolvedErrors:feed.rehearsal.unresolvedErrors}:null})
 }
 const review={at,owner,pier,sync:sync?{...sync,lagSeconds:sync.completed_at?Math.max(0,Math.floor((Date.parse(at)-Date.parse(sync.completed_at))/1000)):null}:null,feeds,issues}
 const revision=crypto.randomUUID()
 await commit(env.DB,actor,[...preview.guards,
  env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='connectorReview'),'')=? THEN 1 ELSE 0 END").bind(before.revision??''),
  env.DB.prepare("INSERT INTO bw_settings(key,value_json,revision) VALUES('connectorReview',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(review),revision),
  audit(env.DB,actor,'connector:review','connector.inspected',{revision,source:'connector.review',reason}),
 ])
 return {review,revision}
}
