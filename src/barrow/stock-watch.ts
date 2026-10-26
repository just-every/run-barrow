import { companyPurchasingRecipientSql } from './company-policy'
import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, commit } from './access'
import { now } from './clock'
import { catalogue } from './pier'
import { fail, text, type Actor } from './model'

export async function stockWatchCommand(env: Bindings, actor: Actor, type: string, p: any) {
 if(actor.agent || actor.role!=='member') fail('FORBIDDEN','Only a signed-in buyer can request their own stock notices.',403)
 const selected=await account(env.DB,actor,text(p.accountId,'Account'))
 const sku=text(p.sku,'SKU',100),stamp=(await now()).toISOString(),kind=p.kind??'stock'
 if(!['stock','prebook'].includes(kind))fail('INPUT','Choose a stock or prebook notice.',400)
 if(type==='stock.watch') {
  const live=await catalogue(env,selected)
  if(kind==='stock'&&Number(live.items.find((item:any)=>item.sku===sku)?.available)>0)fail('AVAILABLE','This product is available now. Request a notice when it is out of stock.',409)
  if(!live.items.some((item:any)=>item.sku===sku))fail('NOT_FOUND','This SKU is not in your current assortment.',404)
 }
 const id=crypto.randomUUID()
 await commit(env.DB,actor,[env.DB.prepare(`INSERT INTO bw_stock_watches VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,user_id,sku,kind) DO UPDATE SET active=excluded.active`).bind(id,selected.id,actor.id,sku,kind,type==='stock.watch'?1:0,stamp),audit(env.DB,actor,sku,type==='stock.watch'?'stock.watch-requested':'stock.watch-cancelled',{accountId:selected.id,revision:id,source:type,reason:'Buyer explicitly changed their own in-app back-in-stock notice request; no email or external channel.'})])
 return {sku,active:type==='stock.watch'}
}
export async function readStockWatches(env:Bindings,actor:Actor,accountId:string) {
 if(actor.agent||actor.role!=='member')fail('FORBIDDEN','Stock requests are private to the signed-in buyer.',403)
 const selected=await account(env.DB,actor,accountId)
 const allowed=new Set(selected.value.prices.map(row=>row.sku))
 return {watches:(await env.DB.prepare('SELECT id,sku,kind,active FROM bw_stock_watches WHERE account_id=? AND user_id=?').bind(accountId,actor.id).all()).results,notices:(await env.DB.prepare('SELECT id,sku,kind,event_id,created_at FROM bw_stock_notices WHERE account_id=? AND user_id=? ORDER BY created_at DESC').bind(accountId,actor.id).all<{id:string;sku:string;kind:string;event_id:string;created_at:string}>()).results.filter(row=>allowed.has(row.sku))}
}
/** The event is a trigger only. Live, account-scoped Pier stock is the sole promise authority. */
export async function stockNoticeStatements(env:Bindings,events:any[],kind='stock') {
 const watches=(await env.DB.prepare(`SELECT w.* FROM bw_stock_watches w JOIN oa_operators p ON p.id=w.user_id WHERE w.active=1 AND w.kind=? AND p.status='active' AND p.role='member'`).bind(kind).all<any>()).results
 const statements:D1PreparedStatement[]=[]
 for(const watch of watches) {
  const member=await env.DB.prepare('SELECT id,email,role,version FROM oa_operators WHERE id=?').bind(watch.user_id).first<any>()
  if(!member)continue
  const actor={...member,agent:false}
  let live:any
  try { live=await catalogue(env,await account(env.DB,actor,watch.account_id)) } catch(error:any) { if(error?.code==='NOT_FOUND'||error?.code==='FORBIDDEN')continue; throw error }
  const item=live.items.find((row:any)=>row.sku===watch.sku)
  if(!item||kind==='stock'&&Number(item.available)<=0)continue
  const restored=kind==='prebook'?events.find(event=>event.sku===watch.sku):events.find(event=>event.itemId===item.itemId&&event.status==='sellable'&&Number(event.available)>0)
  if(!restored)continue
  const id=crypto.randomUUID(),stamp=(await now()).toISOString()
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO bw_stock_notices SELECT ?,w.id,w.account_id,w.user_id,w.sku,w.kind,?,? FROM bw_stock_watches w JOIN oa_operators p ON p.id=w.user_id WHERE w.id=? AND w.active=1 AND ${companyPurchasingRecipientSql('p','w.account_id')}`).bind(id,restored.eventId,stamp,watch.id))
  // One request is fulfilled once. A buyer can deliberately request a later occurrence.
  statements.push(env.DB.prepare('UPDATE bw_stock_watches SET active=0 WHERE id=? AND EXISTS(SELECT 1 FROM bw_stock_notices WHERE watch_id=? AND event_id=?)').bind(watch.id,watch.id,restored.eventId))
 }
 return statements
}
