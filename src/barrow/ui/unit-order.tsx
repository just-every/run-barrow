import { priceLine } from '../pricing'
import { supplierDate } from '../model'
import { useState } from 'react'
import { Dialog } from './dialog'
import { Notice } from './primitives'
import { convertQuantity, sellingUnits } from '../units'
import { money, type Catalogue, type RunCommand, type Order } from './types'

export function UnitOrder({catalogue,draft,run,busy,error,onClose,onPrepared}:{catalogue:Catalogue;draft?:Order;run:RunCommand;busy:boolean;error:string;onClose:()=>void;onPrepared:()=>void}) {
 const first=catalogue.items.find(item=>item.units?.length) ?? catalogue.items[0]
 const nextLine=()=>({sku:first.sku,unit:first.units?.[0]?.code ?? first.unit,quantity:''})
 const [lines,setLines]=useState(draft?.lines.map(line=>({sku:line.sku,unit:line.unit??catalogue.items.find(item=>item.sku===line.sku)?.unit??'',quantity:String(line.quantity)})) ?? [nextLine()]),[reference,setReference]=useState(draft?.reference??''),[location,setLocation]=useState(draft?.deliveryLocation??'')
 const change=(index:number,patch:Partial<typeof lines[number]>)=>setLines(current=>current.map((line,i)=>i===index?{...line,...patch}:line))
 let total=0,problem=''
 const summary=lines.map(line=>{
  const item=catalogue.items.find(item=>item.sku===line.sku),unit=item?sellingUnits(item).find(unit=>unit.code===line.unit):undefined
  try {
   if(!item||!unit) throw Error(`${line.sku}: choose an available SKU and selling unit.`)
   if((unit.quantityKind!=='measured' || ['case','pallet'].includes(unit.code.toLowerCase())) && !Number.isSafeInteger(Number(line.quantity))) throw Error('Enter whole selling units.')
   const base=convertQuantity(line.quantity,unit.baseQuantity),priced=priceLine(line.quantity,unit.unitCents,unit.pricing,supplierDate(new Date(catalogue.observedAt))),cents=priced.lineCents
   total+=cents
   return `${line.quantity} ${unit.code} = ${base} ${item.unit} · ${money(cents)}${priced.pricing ? ` · ${priced.pricing.reason}` : ''}`
  } catch(error) {problem=error instanceof Error?error.message:'Check quantities.';return 'Enter a valid quantity.'}
 })
 async function prepare() {
  if(problem || !lines.length) return
  const result=await run('order.prepare',{accountId:catalogue.account.id,...(draft?{replaces:draft.id}:{}),reference,deliveryLocation:location,lines:lines.map(line=>({...line,quantity:Number(line.quantity)}))})
  if(result){onClose();onPrepared()}
 }
 return <Dialog title="Order by selling unit" busy={busy} onClose={onClose}>
  <p>Choose each, case, pallet or a configured measured unit. Prices are per selected unit; Pier stock stays in {first.unit} base units for {first.sku}.</p>
  {draft && <p>Preparing replaces draft {draft.id} with a new draft at the current prices and conversions shown below. Review them before preparing.</p>}
  {error && <Notice error>{error}</Notice>}
  <div className="br-stack">{lines.map((line,index)=>{
   const item=catalogue.items.find(item=>item.sku===line.sku)
   return <div className="br-card br-stack" key={index}>
    <label>SKU for line {index+1}<select value={line.sku} disabled={busy} onChange={event=>{const item=catalogue.items.find(item=>item.sku===event.target.value)!;change(index,{sku:item.sku,unit:item.unit})}}>{!item&&<option value={line.sku}>{line.sku} · unavailable</option>}{catalogue.items.map(item=><option key={item.sku} value={item.sku}>{item.sku} · {item.name}</option>)}</select></label>
    <label>Selling unit for line {index+1}<select value={line.unit} disabled={busy} onChange={event=>change(index,{unit:event.target.value})}>{(!item||!sellingUnits(item).some(unit=>unit.code===line.unit))&&<option value={line.unit}>{line.unit} · unavailable</option>}{(item?sellingUnits(item):[]).map(unit=><option key={unit.code} value={unit.code}>{unit.code} · {unit.packContents} · {money(unit.unitCents)} per {unit.code}</option>)}</select></label>
    <p>{item ? `Available: ${item.available} ${item.unit}. Minimum: ${item.minQty} ${item.unit} across this SKU’s lines.` : "This SKU is no longer available. Choose an explicit replacement or remove the line."}</p>
    <label>Quantity for line {index+1}<input inputMode="decimal" value={line.quantity} disabled={busy} onChange={event=>change(index,{quantity:event.target.value})} /></label>
    <p>{summary[index]}</p><button type="button" className="br-secondary" disabled={busy || lines.length===1} onClick={()=>setLines(current=>current.filter((_,i)=>i!==index))}>Remove line {index+1}</button>
   </div>
  })}</div>
  <div className="br-actions"><button type="button" className="br-secondary" disabled={busy || lines.length>=100} onClick={()=>setLines(current=>[...current,nextLine()])}>Add another unit line</button></div>
  <label>Purchase order / reference<input value={reference} maxLength={100} disabled={busy} onChange={event=>setReference(event.target.value)} /></label>
  <label>Delivery location label<input value={location} maxLength={240} disabled={busy} onChange={event=>setLocation(event.target.value)} /></label>
  <p>Total: <strong>{money(total)}</strong>. Measured line prices round to the nearest cent, half cents up. Case and pallet quantities are whole units.</p>
  {problem && <p role="status">{problem}</p>}
  <div className="br-actions"><button type="button" disabled={busy || Boolean(problem) || !lines.length} onClick={()=>void prepare()}>Prepare unit draft</button><button type="button" className="br-secondary" disabled={busy} onClick={onClose}>Cancel</button></div>
 </Dialog>
}
