import { useState } from 'react'
import { UnitOrder } from './unit-order'
import { Notice } from './primitives'
import { money, orderNumber, type Account, type Catalogue, type Order, type RunCommand } from './types'

export function UnitDraft({account,draft,catalogue,loading,error,busy,run,onNew,onPrepared}:{account:Account;draft:Order;catalogue:Catalogue|null;loading:boolean;error:string;busy:boolean;run:RunCommand;onNew:()=>void;onPrepared:()=>void}) {
 const [open,setOpen]=useState(true)
 return <div className="br-stack">
  <div className="br-card br-stack"><h1>{account.value.name}</h1><h2>Unit draft {orderNumber(draft.id)}</h2>
   <p>These are the draft’s recorded selling units and prices. Review current prices and conversions before preparing a replacement. Every original SKU/unit line remains available for review.</p>
   {draft.reference && <p>Reference: {draft.reference}</p>}{draft.deliveryLocation && <p>Delivery location: {draft.deliveryLocation}</p>}
   {draft.lines.map(line=><div className="br-card br-stack" key={JSON.stringify([line.sku,line.unit])}><h3>{line.sku} · {line.unit??'units'}</h3><p>{line.quantity} {line.unit??'units'} = {line.baseQuantity??line.quantity} {line.baseUnit??'base units'}</p><p>{money(line.unitCents,draft.currency??'AUD')} per {line.unit??'unit'} · {money(line.lineCents??line.quantity*line.unitCents,draft.currency??'AUD')}</p>{line.pricing&&<p>{line.pricing.reason}</p>}{line.packContents&&<p>{line.packContents}</p>}</div>)}
   <p>Total: <strong>{money(draft.totalCents,draft.currency??'AUD')}</strong></p>
   {loading&&<p role="status">Fetching current units and availability…</p>}{error&&<Notice error>{error}</Notice>}
   <div className="br-actions"><button type="button" disabled={busy||!catalogue?.items.length} onClick={()=>setOpen(true)}>Review selling units</button><button type="button" className="br-secondary" disabled={busy} onClick={onNew}>Start a new order</button></div>
  </div>
  {open&&catalogue&&catalogue.items.length>0&&<UnitOrder catalogue={catalogue} draft={draft} run={run} busy={busy} error={error} onClose={()=>setOpen(false)} onPrepared={onPrepared}/>}
 </div>
}
