import { prebookNoticeStatements, saveStockWindow } from './stock-windows'
import type { Bindings } from '../auth.server'
import { audit, commit } from './access'
import { now } from './clock'
import { fail, text, integer, type Actor } from './model'
import { pierStockPage, acknowledgePierStock } from './pier'
import { stockNoticeStatements } from './stock-watch'
const authorize=(actor:Actor)=>{if(actor.agent||!['owner','admin'].includes(actor.role))fail('FORBIDDEN','Only a signed-in owner or admin can operate stock synchronization.',403)}
export async function stockSyncState(env:Bindings,actor:Actor) {authorize(actor);return {sync:await env.DB.prepare('SELECT (SELECT display_name FROM oa_operators WHERE id=task_owner) AS task_owner_name,consumer,origin,enabled,page_limit,checkpoint,pending,failures,next_at,observed_at,processed,has_more,task_owner,task_status,task_reason,resolution FROM bw_stock_sync WHERE singleton=1').first()}}
export async function stockSyncCommand(env:Bindings,actor:Actor,type:string,p:any) {
 authorize(actor)
 if(type==='stock.window') { await saveStockWindow(env,actor,p) }
 else if(type==='stock.sync-settings') {
  if(typeof p.enabled!=='boolean')fail('INPUT','Choose whether scheduled synchronization is enabled.',400)
  if(!env.PIER_ORIGIN||!env.PIER_SESSION)fail('PIER_UNAVAILABLE','Connect a real Pier installation first.',503)
  const id=crypto.randomUUID(),limit=integer(p.pageSize??100,'Events per page',1,100)
  await commit(env.DB,actor,[env.DB.prepare(`INSERT INTO bw_stock_sync(singleton,consumer,origin,enabled,page_limit) VALUES(1,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET enabled=excluded.enabled,page_limit=excluded.page_limit WHERE origin=excluded.origin`).bind('barrow-'+id,env.PIER_ORIGIN,p.enabled?1:0,limit),audit(env.DB,actor,'stock-sync','stock.sync-settings',{revision:id,source:type,reason:p.enabled?'Owner enabled scheduled Pier stock observations.':'Owner disabled scheduled Pier stock observations.'})])
 } else if(type==='stock.sync-reset') {
  if(p.confirm!=='RESET')fail('CONFIRM','Type RESET to restart source reconciliation.',400)
  const reason=text(p.reason,'Restart reason',1000)
  if(!env.PIER_ORIGIN||!env.PIER_SESSION)fail('PIER_UNAVAILABLE','Connect Pier before restarting its checkpoint.',503)
  await commit(env.DB,actor,[env.DB.prepare('UPDATE bw_stock_sync SET consumer=?,origin=?,checkpoint=NULL,pending=NULL,next_at=0,rate_until=0,has_more=1 WHERE singleton=1 AND lease_until<=?').bind('barrow-'+crypto.randomUUID(),env.PIER_ORIGIN,(await now()).getTime()),audit(env.DB,actor,'stock-sync','stock.sync-restarted',{revision:crypto.randomUUID(),source:type,reason})])
 } else if(type==='stock.sync-resolve') {
  const reason=text(p.reason,'Resolution',1000)
  await commit(env.DB,actor,[env.DB.prepare("UPDATE bw_stock_sync SET task_status='closed',resolution=? WHERE singleton=1 AND task_status='open' AND failures=0").bind(reason),audit(env.DB,actor,'stock-sync','stock.sync-resolved',{revision:crypto.randomUUID(),source:type,reason})])
 } else await runStockSync(env,1,true)
 return stockSyncState(env,actor)
}
/** Durable page application precedes source ACK. Lost ACK responses repeat the same ACK before fetching. */
export async function runStockSync(env:Bindings,pages=10,manual=false) {
 if(env.RER_DEMO==='1')return
 const db=env.DB,at=(await now()).getTime(),lease=at+120000
 const claimed=await db.prepare('UPDATE bw_stock_sync SET lease_until=? WHERE singleton=1 AND enabled=1 AND lease_until<=? AND next_at<=? AND rate_until<=? RETURNING *').bind(lease,at,at+(manual?59000:0),at).first<any>()
 if(!claimed)return
 try {
  if(claimed.origin!==env.PIER_ORIGIN)fail('PIER_CHANGED','The Pier origin changed. Restore the original connection before resuming.',409)
  let checkpoint=claimed.checkpoint,pending=claimed.pending
  for(let count=0;count<pages;count++) {
   if(pending) {
    await acknowledgePierStock(env,claimed.consumer,pending)
    await db.prepare('UPDATE bw_stock_sync SET checkpoint=?,pending=NULL WHERE singleton=1 AND lease_until=?').bind(pending,lease).run()
    checkpoint=pending;pending=null
   }
   const page=await pierStockPage(env,claimed.consumer,checkpoint,claimed.page_limit)
   if(!Array.isArray(page.events)||typeof page.pageToken!=='string'||typeof page.hasMore!=='boolean')fail('PIER_RESPONSE','Pier returned an incomplete stock page.',502)
   const unseen=[]
   for(const event of page.events) {
    if(typeof event.eventId!=='string'||!Number.isSafeInteger(event.sequence)||typeof event.itemId!=='string')fail('PIER_RESPONSE','Pier returned an invalid stock event.',502)
    if(!await db.prepare('SELECT 1 FROM bw_stock_events WHERE id=?').bind(event.eventId).first())unseen.push(event)
   }
   const noticeStatements=await stockNoticeStatements(env,unseen)
   await db.batch([
    db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_stock_sync WHERE singleton=1 AND lease_until=?) THEN 1 ELSE 0 END').bind(lease),
    ...unseen.map(event=>db.prepare('INSERT OR IGNORE INTO bw_stock_events VALUES(?,?,?)').bind(event.eventId,event.sequence,JSON.stringify(event))),...noticeStatements,
    db.prepare('UPDATE bw_stock_sync SET pending=?,processed=processed+?,has_more=?,observed_at=? WHERE singleton=1 AND lease_until=?').bind(page.pageToken,unseen.length,page.hasMore?1:0,page.observedAt,lease),db.prepare('DELETE FROM bw_guard')
   ])
   pending=page.pageToken
   await acknowledgePierStock(env,claimed.consumer,pending)
   await db.prepare('UPDATE bw_stock_sync SET checkpoint=?,pending=NULL,failures=0 WHERE singleton=1 AND lease_until=?').bind(pending,lease).run()
   checkpoint=pending;pending=null
   if(!page.hasMore){const notices=await prebookNoticeStatements(env);if(notices.length)await db.batch(notices);break}
  }
  await db.prepare('UPDATE bw_stock_sync SET lease_until=0,next_at=? WHERE singleton=1 AND lease_until=?').bind(at+60000,lease).run()
 } catch(error:any) {
  // No source detail, credential, or raw transport response is retained in this operator task.
  const owner=await db.prepare("SELECT id FROM oa_operators WHERE status='active' AND role='owner' ORDER BY created_at,id LIMIT 1").first<{id:string}>()
  await db.prepare(`UPDATE bw_stock_sync SET failures=failures+1,lease_until=0,next_at=?,rate_until=?,task_owner=CASE WHEN failures>=2 THEN COALESCE(task_owner,?) ELSE task_owner END,task_status=CASE WHEN failures>=2 THEN 'open' ELSE task_status END,task_reason=CASE WHEN failures>=2 THEN 'Pier synchronization repeatedly failed; reconnect and reconcile before resolving.' ELSE task_reason END WHERE singleton=1 AND lease_until=?`).bind(Math.max(at+60000,Number(error?.retryAt)||0),Number(error?.retryAt)||0,owner?.id??null,lease).run()
 }
}
