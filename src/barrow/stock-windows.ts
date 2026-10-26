import type { Bindings } from '../auth.server'
import { audit, commit } from './access'
import { now } from './clock'
import { pierReadOnlyState } from './pier'
import { fail, text, type Actor } from './model'
import { stockNoticeStatements } from './stock-watch'
type Window={sku:string;opensAt:string;closesAt:string;revision:string}
export async function saveStockWindow(env:Bindings,actor:Actor,p:any) {
 const sku=text(p.sku,'SKU',100),reason=text(p.reason,'Window reason',1000)
 const date=(value:unknown)=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('INPUT','Use a complete opening and closing date with timezone.',400);return new Date(value).toISOString()}
 const opensAt=date(p.opensAt),closesAt=date(p.closesAt)
 if(opensAt>=closesAt)fail('INPUT','The prebook window must close after it opens.',400)
 const source=await pierReadOnlyState(env)
 if(!source.items?.some((item:any)=>item.sku===sku&&!item.archived))fail('NOT_FOUND','Choose an active SKU from Pier.',404)
 const previous=await env.DB.prepare("SELECT value_json,revision FROM bw_settings WHERE key='stock-windows'").first<{value_json:string;revision:string}>(),revision=crypto.randomUUID()
 const windows:Window[]=previous?JSON.parse(previous.value_json):[]
 const next=[...windows.filter(window=>window.sku!==sku),{sku,opensAt,closesAt,revision}]
 await commit(env.DB,actor,[env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='stock-windows'),'')=? THEN 1 ELSE 0 END").bind(previous?.revision??''),env.DB.prepare("INSERT INTO bw_settings VALUES('stock-windows',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(next),revision),audit(env.DB,actor,sku,'stock.prebook-window',{revision,source:'stock.window',reason})])
}
export async function prebookNoticeStatements(env:Bindings) {
 const row=await env.DB.prepare("SELECT value_json FROM bw_settings WHERE key='stock-windows'").first<{value_json:string}>(),stamp=(await now()).toISOString()
 const windows:Window[]=row?JSON.parse(row.value_json):[]
 return stockNoticeStatements(env,windows.filter(window=>window.opensAt<=stamp&&stamp<window.closesAt).map(window=>({sku:window.sku,eventId:'prebook-'+window.revision})),'prebook')
}
