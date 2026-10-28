import { useEffect, useRef, useState, type FormEvent } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, type Account, type CatalogueItem } from './types'
import { groupStyles } from './styles'
import type { readSheet } from '../line-sheets'
type Sheet=Awaited<ReturnType<typeof readSheet>>
const command=async(type:string,payload:unknown)=>(await request<{result:any}>('/api/barrow/commands',{type,payload})).result

/** Functional controls inherit the existing Barrow cards, forms and matrix; no new visual system. */
export function LineSheets({accounts,merchant,version,onPrepared}:{accounts:Account[];merchant:boolean;version:unknown;onPrepared:()=>void}) {
 const [accountId,setAccount]=useState(accounts[0]?.id??''),[list,setList]=useState<any[]>([]),[sheet,setSheet]=useState<Sheet|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0)
 const [cart,setCart]=useState<any[]>([]),[corrections,setCorrections]=useState<Record<string,string>>({})
 const [quantities,setQuantities]=useState<Record<string,string>>({}),[packs,setPacks]=useState<Record<string,string>>({}),[preview,setPreview]=useState<any>(null),[mode,setMode]=useState('replace'),[paste,setPaste]=useState(''),[reference,setReference]=useState('')
 const root=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(!accountId)return;let current=true;setError('');setSheet(null);void request<any>(`/api/barrow/line-sheets?accountId=${encodeURIComponent(accountId)}`).then(value=>{if(current)setList(value.sheets)}).catch(cause=>{if(current)setError(errorMessage(cause))});return()=>{current=false}},[accountId,version,refresh])
 useEffect(()=>{
  if(!sheet||merchant)return
  const seen=new Set<string>(),pending=new Set<string>();let timer:ReturnType<typeof setTimeout>|undefined
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting){const sku=(entry.target as HTMLElement).dataset.sku!;if(!seen.has(sku)){seen.add(sku);pending.add(sku)}}
   if(pending.size&&!timer)timer=setTimeout(()=>{const skus=[...pending];pending.clear();timer=undefined;void command('sheet.view',{sheetId:sheet.id,revision:sheet.revision,kind:'view',skus}).catch(cause=>setError(errorMessage(cause)))},150)
  },{threshold:0.5})
  root.current?.querySelectorAll('[data-sku]').forEach(el=>observer.observe(el))
  return()=>{observer.disconnect();if(timer)clearTimeout(timer)}
 },[sheet,merchant])
 async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work()}catch(cause){setError(errorMessage(cause));if((cause as {status?:number})?.status===404){setSheet(null);setPreview(null)}}finally{setBusy(false)}}
 async function open(id:string){await action(async()=>{const value=await request<Sheet>(`/api/barrow/line-sheets/${id}`);await command('sheet.view',{sheetId:value.id,revision:value.revision,kind:'open',skus:[]});setSheet(value);setPreview(null);setQuantities({});setPacks({});setPaste('');setCart([]);setCorrections({})})}
 async function publish(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);await action(async()=>{await command('sheet.publish',{accountId,name:data.get('name'),season:data.get('season'),display:data.get('display'),shipStart:data.get('shipStart'),shipEnd:data.get('shipEnd'),skus:String(data.get('skus')).split(/[,\s]+/).filter(Boolean),packs:JSON.parse(String(data.get('packs')||'[]')),...(String(data.get('presentation')||'').trim()?{presentation:JSON.parse(String(data.get('presentation')))}:{})});setRefresh(n=>n+1)})}
 async function review(){if(!sheet)return;await action(async()=>{const result=await command('sheet.preview',{sheetId:sheet.id,revision:sheet.revision,...(paste.trim()?{csv:paste}:{lines:Object.entries(quantities).filter(([,n])=>Number(n)>0).map(([sku,n])=>({sku,quantity:Number(n)})),packs:Object.entries(packs).filter(([,n])=>Number(n)>0).map(([id,n])=>({id,quantity:Number(n)}))}),mode,cart,set:corrections});setPreview(result)})}
 const rows=sheet?groupStyles(sheet.items.map(item=>({...item,unitCents:item.unitCents??0})) as CatalogueItem[],sheet.currency).rows:[]
 return <section className="br-stack" aria-label="Seasonal line sheets" ref={root}>
  {error&&<Notice error>{error}</Notice>}
  <label>Line-sheet account<select aria-label="Line-sheet account" value={accountId} onChange={e=>setAccount(e.target.value)} disabled={busy}>{accounts.map(a=><option key={a.id} value={a.id}>{a.value.name}</option>)}</select></label>
  {merchant&&accountId&&<>
   <details className="br-card"><summary>Import recipient price book</summary><form className="br-stack" onSubmit={e=>{e.preventDefault();const csv=String(new FormData(e.currentTarget).get('csv'));void action(async()=>{const account=await request<Account>(`/api/barrow/accounts/by-id/${encodeURIComponent(accountId)}`);await command('price-book.import',{accountId,revision:account.revision,csv});setRefresh(n=>n+1)})}}><label>Price book CSV<textarea name="csv" rows={6} required placeholder={'sku,currency,unitCents,msrpCents,minQty\nJV-2214-S,USD,4800,9600,1'}/></label><p>One currency per recipient book; USD and CAD books are separate. All rows replace this account’s agreed assortment. Blank MSRP means absent. Publish a new sheet after book edits.</p><button disabled={busy}>Import price book</button><a href={`/api/barrow/price-book.csv?accountId=${encodeURIComponent(accountId)}`}>Export price book CSV</a></form></details>
   <details className="br-card"><summary>Publish seasonal line sheet</summary><form className="br-form-grid" onSubmit={e=>void publish(e)}>
    <label>Sheet name<input name="name" required maxLength={100}/></label><label>Season<input name="season" required maxLength={80}/></label>
    <label>Sheet prices<select aria-label="Sheet prices" name="display"><option value="both">Wholesale and MSRP with margin</option><option value="wholesale">Wholesale only</option><option value="retail">Retail only</option></select></label>
    <label>Ship start<input name="shipStart" type="date" required/></label><label>Ship end<input name="shipEnd" type="date" required/></label>
    <label className="br-full">Variant SKUs<textarea aria-label="Variant SKUs" name="skus" required rows={3}/><small>Exact eligible SKUs, separated by commas or whitespace.</small></label>
    <label className="br-full">Size runs and fixed assortment packs (optional JSON)<textarea name="packs" rows={5} placeholder={'[{"id":"run","name":"Small to large","kind":"run","lines":[{"sku":"JV-2214-S","quantity":1},{"sku":"JV-2214-M","quantity":2}]}]'}/></label>
    <label className="br-full">Presentation collections (optional JSON)<textarea name="presentation" rows={5} aria-label="Presentation collections"/><small>Title, introduction and sections with a title, text and exact sheet SKUs. Rebuild editorial content from your imported assortment.</small></label>
    <button disabled={busy}>Publish for this account</button><p>Only this account’s signed-in purchasers and its authorized supplier staff may open the share. Publishing freezes these prices, columns and revision; availability stays live.</p>
   </form></details>
  </>}
  <div className="br-actions">{list.map(s=><button key={s.id} className="br-secondary" disabled={busy||s.state!=='published'} onClick={()=>void open(s.id)}>{s.name} · {s.season} · {s.currency}{s.state==='revoked'?' · Revoked':''}</button>)}</div>
  {list.length===0&&<p>No published sheets for this account.</p>}
  {sheet&&<article className="br-card br-stack" aria-label="Published line sheet">
   <h2>{sheet.name}</h2><p>{sheet.season} · {sheet.currency} · Ship {sheet.shipStart} to {sheet.shipEnd}</p><p className="br-quiet-text">Revision {sheet.revision}. Stock is observed, never reserved. Totals use wholesale only.</p>
   <div className="br-actions"><a href={`/api/barrow/line-sheets/${sheet.id}.pdf`}>Account PDF</a><a href={`/api/barrow/line-sheets/${sheet.id}.csv`}>Matrix order form CSV</a>{merchant&&<button className="br-secondary" disabled={busy} onClick={()=>void action(async()=>{await command('sheet.revoke',{sheetId:sheet.id,revision:sheet.revision});setRefresh(n=>n+1)})}>Revoke share</button>}</div>
   {sheet.presentation&&<section className="br-stack" aria-label="Rebuilt presentation"><h3>{sheet.presentation.title}</h3><p>{sheet.presentation.introduction}</p>{sheet.presentation.sections.map((section,index)=><section key={index}><h4>{section.title}</h4><p>{section.text}</p><div className="br-actions">{section.skus.map(sku=><a key={sku} href={`#sheet-product-${encodeURIComponent(sku)}`}>{sku}{sheet.items.find(item=>item.sku===sku)?.eligible?' · View product':' · Unavailable'}</a>)}</div></section>)}</section>}
   {rows.map(row=><div className="br-table-wrap" key={row.key}><table><caption>{row.name} · {row.key}</caption><thead><tr>{row.sizes.map(size=><th key={size} scope="col">{size}</th>)}</tr></thead><tbody><tr>{row.sizes.map(size=>{const item=sheet.items.find(i=>i.sku===row.cells[size].sku)!;return <td key={size} data-sku={item.sku} id={`sheet-product-${encodeURIComponent(item.sku)}`}>
    <p>{item.sku}{!item.eligible?' · Unavailable':''}</p>{item.unitCents!==undefined&&<p>Wholesale {money(item.unitCents,sheet.currency)}</p>}{'msrpCents'in item&&<p>MSRP {item.msrpCents===null?'absent':money(item.msrpCents!,sheet.currency)}</p>}{'marginBps'in item&&<p>Margin {item.marginBps===null?'absent':(item.marginBps!/100).toFixed(2)+'%'}</p>}
    <p>Available {item.available} {item.unit} · min. {item.minQty}{item.casePack?` · pack ${item.casePack}`:''}{item.increment?` · increment ${item.increment}`:''}</p>
    <label>{size} quantity for {row.name}<input type="number" min="0" step="1" value={quantities[item.sku]??''} disabled={busy||!item.eligible} onChange={e=>{setQuantities({...quantities,[item.sku]:e.target.value});setPreview(null);setCorrections({})}}/></label>
   </td>})}</tr></tbody></table></div>)}
   {sheet.packs.map(pack=><label key={pack.id}>{pack.name} · {pack.kind} ({pack.lines.map(l=>`${l.sku} × ${l.quantity}`).join(', ')})<input aria-label={`${pack.name} pack count`} type="number" min="0" step="1" value={packs[pack.id]??''} onChange={e=>{setPacks({...packs,[pack.id]:e.target.value});setPreview(null);setCorrections({})}}/></label>)}
   <details><summary>Upload filled order form</summary><input type="file" accept=".csv,text/csv" aria-label="Filled matrix order form" onChange={e=>{const file=e.target.files?.[0];if(file)void file.text().then(setPaste)}}/><label>Order form CSV<textarea value={paste} onChange={e=>{setPaste(e.target.value);setPreview(null)}} rows={5}/></label></details>
   <label>Cart choice<select value={mode} onChange={e=>{setMode(e.target.value);setPreview(null)}}><option value="replace">Replace cart</option><option value="merge">Merge into reviewed cart</option></select></label>
   <button disabled={busy} onClick={()=>void review()}>Preview sheet cart</button>
   {preview&&<section className="br-stack" aria-label="Line-sheet cart preview"><h3>Cart preview</h3>{preview.rows.filter((r:any)=>r.status==='error').map((r:any)=><p role="alert" key={r.ref}>{r.message}</p>)}{preview.lines.map((line:any)=><div key={line.key}><p>{line.sku} × {line.quantity} · Wholesale {money(line.lineCents,sheet.currency)}{line.combined?` · ${line.combined}`:''}</p>{line.problem&&<p role="alert">{line.problem}</p>}{line.choices?.map((n:string)=><button key={n} disabled={busy} onClick={()=>void action(async()=>{setCorrections({...corrections,[line.key]:n});setPreview(await command('sheet.preview',{sheetId:sheet.id,revision:sheet.revision,csv:paste||undefined,lines:Object.entries(quantities).filter(([,q])=>Number(q)>0).map(([sku,q])=>({sku,quantity:Number(q)})),packs:Object.entries(packs).filter(([,q])=>Number(q)>0).map(([id,q])=>({id,quantity:Number(q)})),mode,set:{...corrections,[line.key]:n},cart}))})}>Use {n} for {line.sku}</button>)}</div>)}<p>Wholesale total {money(preview.totalCents,sheet.currency)}</p><button disabled={busy||!preview.ready} onClick={()=>{setCart(preview.cart);setPreview(null)}}>Keep reviewed cart for merge</button><label>PO reference<input value={reference} onChange={e=>setReference(e.target.value)}/></label><button disabled={busy||!preview.ready||!preview.cart} onClick={()=>void action(async()=>{await command('order.prepare',{accountId:sheet.accountId,lineSheetId:sheet.id,lineSheetRevision:sheet.revision,reference,requestedDate:sheet.shipStart,cancelAfter:sheet.shipEnd,lines:preview.cart});onPrepared()})}>Prepare sheet order</button></section>}
  </article>}
 </section>
}
