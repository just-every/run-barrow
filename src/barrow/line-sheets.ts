import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, commit, changed } from './access'
import { fail, integer, requirePerson, text, type Actor, type Account } from './model'
import { requireCompanyRight } from './company-policy'
import { catalogue } from './pier'
import { now } from './clock'
import { csvText } from './cart-csv'
import { previewCart, orderForm } from './cart-import'
import { displayMode, marginBps, priceLabels, type PriceDisplay } from './price-display'
import { textPdf } from './pdf'

export type Sheet = {id:string;revision:string;accountId:string;name:string;season:string;display:PriceDisplay;state:'published'|'revoked';publishedAt:string;publishedBy:string;bookRevision:string;currency:'USD'|'CAD';shipStart:string;shipEnd:string;items:Awaited<ReturnType<typeof catalogue>>['items'];packs:{id:string;name:string;kind:'run'|'assortment';lines:{sku:string;quantity:number}[]}[]}
function merchant(actor:Actor) {
 requirePerson(actor)
 if(!['owner','admin'].includes(actor.role)||actor.staff)fail('FORBIDDEN','Only the supplier owner or admin may publish or revoke line sheets.',403)
}
async function stored(env:Bindings,actor:Actor,id:string,includeRevoked=false):Promise<Sheet> {
 requirePerson(actor)
 const row=await env.DB.prepare('SELECT value_json,revision FROM bw_line_sheets WHERE id=?').bind(id).first<{value_json:string;revision:string}>()
 if(!row)fail('NOT_FOUND','Line sheet not found.',404)
 const sheet={...JSON.parse(row.value_json),revision:row.revision} as Sheet
 await account(env.DB,actor,sheet.accountId)
 await requireCompanyRight(env.DB,actor,sheet.accountId,'purchasing')
 if(sheet.state!=='published'&&!includeRevoked)fail('NOT_FOUND','Line sheet not found.',404)
 return sheet
}
/** Live availability is always Pier's; the recipient's published book and assortment stay immutable. */
async function offered(env:Bindings,actor:Actor,sheet:Sheet) {
 const selected=await account(env.DB,actor,sheet.accountId),live=await catalogue(env,selected)
 const items=sheet.items.map(item=>{
  const current=live.items.find(row=>row.sku===item.sku)
  return {...item,available:current?.available??'0',warehouses:current?.warehouses??[],incoming:current?.incoming??[]}
 })
 return {selected,catalogue:{...live,items,currency:sheet.currency}}
}
function publicSheet(sheet:Sheet,items:Sheet['items']) {
 return {id:sheet.id,revision:sheet.revision,accountId:sheet.accountId,name:sheet.name,season:sheet.season,display:sheet.display,currency:sheet.currency,shipStart:sheet.shipStart,shipEnd:sheet.shipEnd,publishedAt:sheet.publishedAt,packs:sheet.packs,items:items.map(item=>({sku:item.sku,name:item.name,barcode:item.barcode,unit:item.unit,minQty:item.minQty,casePack:item.casePack,increment:item.increment,available:item.available,incoming:item.incoming,...(sheet.display!=='retail'?{unitCents:item.unitCents}:{}),...(sheet.display!=='wholesale'?{msrpCents:item.msrpCents??null}:{}),...(sheet.display==='both'?{marginBps:marginBps(item.unitCents,item.msrpCents)}:{})}))}
}
export async function listSheets(env:Bindings,actor:Actor,accountId:string) {
 requirePerson(actor)
 await account(env.DB,actor,accountId);await requireCompanyRight(env.DB,actor,accountId,'purchasing')
 const rows=await env.DB.prepare('SELECT id,revision,value_json FROM bw_line_sheets WHERE account_id=? ORDER BY rowid DESC').bind(accountId).all<{id:string;revision:string;value_json:string}>()
 return {sheets:rows.results.flatMap(row=>{const s=JSON.parse(row.value_json) as Sheet;return s.state==='published'||['owner','admin'].includes(actor.role)&&!actor.staff?[{id:row.id,revision:row.revision,name:s.name,season:s.season,state:s.state,display:s.display,currency:s.currency}]:[]})}
}
export async function readSheet(env:Bindings,actor:Actor,id:string) {
 const sheet=await stored(env,actor,id),live=await offered(env,actor,sheet)
 return publicSheet(sheet,live.catalogue.items)
}
export async function sheetDownload(env:Bindings,actor:Actor,id:string,format:'pdf'|'csv') {
 const sheet=await stored(env,actor,id),live=await offered(env,actor,sheet)
 let body:string|Uint8Array<ArrayBuffer>
 if(format==='csv')body=orderForm(live.selected,live.catalogue.items,{layout:'matrix'}).csv
 else body=textPdf([sheet.name,`${sheet.season} | Account ${sheet.accountId} | Revision ${sheet.revision}`,`Ship window ${sheet.shipStart} to ${sheet.shipEnd} | ${sheet.currency}`,...live.catalogue.items.flatMap(item=>[`${item.sku} | ${item.name}`,priceLabels(item,sheet.currency,sheet.display),`Available ${item.available} ${item.unit}; minimum ${item.minQty}${item.casePack?`; case pack ${item.casePack}`:''}${item.increment?`; increment ${item.increment}`:''}`]),...sheet.packs.flatMap(pack=>[`${pack.kind}: ${pack.name}`,pack.lines.map(line=>`${line.sku} x ${line.quantity}`).join(', ')]),'Availability is observed, never reserved. Order totals use wholesale prices only.'])
 return new Response(body,{headers:{'content-type':format==='pdf'?'application/pdf':'text/csv; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':`attachment; filename="line-sheet-${sheet.id}.${format}"`}})
}
const date=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('INPUT','Use valid YYYY-MM-DD ship dates.',400);return v}
export async function sheetCommand(env:Bindings,actor:Actor,type:string,p:any) {
 requirePerson(actor)
 if(type==='sheet.publish') {
  merchant(actor)
  const selected=await account(env.DB,actor,text(p.accountId,'Account')),live=await catalogue(env,selected)
  const skus=p.skus
  if(!Array.isArray(skus)||!skus.length||skus.length>100||new Set(skus).size!==skus.length||skus.some(sku=>!live.items.some(item=>item.sku===sku)))fail('INPUT','Choose distinct eligible variant SKUs for this recipient.',400)
  const shipStart=date(p.shipStart),shipEnd=date(p.shipEnd)
  if(shipEnd<shipStart)fail('INPUT','Ship end must follow ship start.',400)
  if(p.packs!==undefined&&(!Array.isArray(p.packs)||p.packs.length>30))fail('INPUT','Use up to 30 size runs or fixed assortment packs.',400)
  const packs:Sheet['packs']=(p.packs??[]).map((pack:any)=>{
   if(!['run','assortment'].includes(pack?.kind)||!Array.isArray(pack.lines)||!pack.lines.length||pack.lines.length>100)fail('INPUT','Each pack needs a kind and exact SKU quantities.',400)
   const lines=pack.lines.map((line:any)=>({sku:text(line.sku,'Pack SKU',100),quantity:integer(line.quantity,'Pack quantity',1,10000)}))
   if(new Set(lines.map((line:{sku:string})=>line.sku)).size!==lines.length||lines.some((line:{sku:string})=>!skus.includes(line.sku)))fail('INPUT','Pack variants must be distinct sheet SKUs.',400)
   return {id:text(pack.id,'Pack ID',100),name:text(pack.name,'Pack name',100),kind:pack.kind,lines}
  })
  if(new Set(packs.map(pack=>pack.id)).size!==packs.length)fail('INPUT','Use unique pack IDs.',400)
  const id=crypto.randomUUID(),revision=crypto.randomUUID(),sheet:Sheet={id,revision,accountId:selected.id,name:text(p.name,'Sheet name',100),season:text(p.season,'Season',80),display:displayMode(p.display),state:'published',publishedAt:(await now()).toISOString(),publishedBy:actor.id,bookRevision:selected.revision,currency:live.currency,shipStart,shipEnd,items:live.items.filter(item=>skus.includes(item.sku)),packs}
  await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT revision FROM bw_accounts WHERE id=?)=? THEN 1 ELSE 0 END').bind(selected.id,selected.revision),env.DB.prepare('INSERT INTO bw_line_sheets VALUES(?,?,?,?)').bind(id,selected.id,JSON.stringify(sheet),revision),audit(env.DB,actor,id,'sheet.published',{accountId:selected.id,revision,source:type,reason:`Published ${sheet.name} for this account only, using ${sheet.currency} book ${selected.revision}.`})])
  return {id,revision}
 }
 const sheet=await stored(env,actor,text(p.sheetId,'Line sheet'),type==='sheet.revoke')
 if(p.revision!==sheet.revision)fail('CHANGED','Refresh this line sheet before continuing.')
 if(type==='sheet.revoke') {
  merchant(actor)
  const revision=crypto.randomUUID()
  await commit(env.DB,actor,[env.DB.prepare('UPDATE bw_line_sheets SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({...sheet,state:'revoked',revision}),revision,sheet.id,sheet.revision),changed(env.DB),audit(env.DB,actor,sheet.id,'sheet.revoked',{accountId:sheet.accountId,revision,source:type,reason:'Supplier revoked this recipient share; every sheet, PDF, form and order door refuses it.'})])
  return {id:sheet.id,revision,state:'revoked'}
 }
 if(type==='sheet.view') {
  if(!['open','view'].includes(p.kind)||!Array.isArray(p.skus)||p.skus.length>100||new Set(p.skus).size!==p.skus.length||p.skus.some((sku:unknown)=>!sheet.items.some(item=>item.sku===sku)))fail('INPUT','Record an open or view with only this sheet’s item SKUs.',400)
  // Only actual buyer activity enters the per-buyer report; supplier previews are not buyer opens.
  if(!['owner','admin'].includes(actor.role)&&!actor.staff)await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_sheet_events VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),sheet.id,sheet.accountId,actor.id,p.kind,JSON.stringify(p.skus),(await now()).toISOString())])
  return {recorded:true}
 }
 if(type==='sheet.preview') {
  const live=await offered(env,actor,sheet)
  let input=p.csv
  if(input===undefined){
   if(!Array.isArray(p.lines)||p.lines.length>100||p.packs!==undefined&&(!Array.isArray(p.packs)||p.packs.length>30))fail('INPUT','Choose variant quantities or fixed packs.',400)
   const lines=p.lines.map((line:any)=>({sku:text(line.sku,'SKU',100),quantity:integer(line.quantity,'Quantity',1,1000000)}))
   for(const chosen of p.packs??[]){const pack=sheet.packs.find(pack=>pack.id===chosen.id);if(!pack)fail('INPUT','Pack is not on this sheet.',400);const n=integer(chosen.quantity,'Pack count',1,10000);lines.push(...pack.lines.map(line=>({sku:line.sku,quantity:line.quantity*n})))}
   input=csvText([['sku','quantity'],...lines.map((line:{sku:string;quantity:number})=>[line.sku,line.quantity])])
  }
  return previewCart(live.selected,live.catalogue,{...p,csv:input,paste:undefined})
 }
 fail('COMMAND','Unknown line-sheet action.',404)
}
/** Preparation must carry the exact active recipient share and book revision, never a client-supplied price. */
export async function sheetForOrder(env:Bindings,actor:Actor,p:any,selected:Account) {
 const sheet=await stored(env,actor,text(p.lineSheetId,'Line sheet'))
 if(sheet.accountId!==selected.id)fail('NOT_FOUND','Line sheet not found.',404)
 if(sheet.revision!==p.lineSheetRevision||sheet.bookRevision!==selected.revision)fail('CHANGED','The recipient book or sheet changed. Ask the supplier to publish a current sheet before preparing.')
 if(!Array.isArray(p.lines)||p.lines.some((line:any)=>!sheet.items.some(item=>item.sku===line.sku)))fail('INPUT','Order only variants on this line sheet.',400)
 return sheet
}
