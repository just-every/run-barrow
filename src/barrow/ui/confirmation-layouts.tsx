import { useEffect, useId, useState } from 'react'
import { request, errorMessage } from './api'
import type { ConfirmationLayouts, ConfirmationColumn } from '../confirmation-layouts'
type Settings=ConfirmationLayouts & {availableColumns:ConfirmationColumn[]}
export function ConfirmationLayoutTools({selected,onSelect}:{selected:string;onSelect:(id:string)=>void}) {
 const formId=useId()
 const [settings,setSettings]=useState<Settings|null>(null),[name,setName]=useState(''),[columns,setColumns]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let active=true;void request<Settings>('/api/barrow/confirmation-layouts').then(value=>{if(active){setSettings(value);setColumns(value.layouts.find(row=>row.id===value.defaultId)!.columns.join(', '))}}).catch(cause=>{if(active)setError(errorMessage(cause))});return()=>{active=false}},[])
 function choose(id:string){onSelect(id);const layout=settings?.layouts.find(row=>row.id===id);if(layout){setName(layout.name);setColumns(layout.columns.join(', '))}}
 async function save(type:string,extra:Record<string,unknown>){if(!settings)return;setBusy(true);setError('');try{await request('/api/barrow/commands',{type,payload:{revision:settings.revision,...extra}});const next=await request<Settings>('/api/barrow/confirmation-layouts');setSettings(next);if(type==='confirmation-layout.save'&&!extra.id){onSelect(next.layouts.at(-1)!.id)}}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}}
 return <fieldset className="br-stack"><legend>Confirmation CSV layout</legend>
  {error&&<p role="alert">{error}</p>}
  {settings&&<>
   <label>Download layout<select value={selected} onChange={event=>choose(event.target.value)} disabled={busy}><option value="">Default: {settings.layouts.find(row=>row.id===settings.defaultId)?.name}</option>{settings.layouts.map(layout=><option key={layout.id} value={layout.id}>{layout.name}</option>)}</select></label>
   <details><summary>Manage named layouts</summary><div className="br-stack">
    <label>Layout name<input value={name} maxLength={80} onChange={event=>setName(event.target.value)} disabled={busy}/></label>
    <label htmlFor={`${formId}-columns`}>Columns, in export order</label><textarea id={`${formId}-columns`} value={columns} onChange={event=>setColumns(event.target.value)} disabled={busy}/>
    <p className="br-quiet-text">Choose comma-separated columns from: {settings.availableColumns.join(', ')}. One row per recorded order line. Matrix and bulk production exports are not available.</p>
    <div className="br-actions"><button type="button" disabled={busy||!name.trim()} onClick={()=>void save('confirmation-layout.save',{name,columns:columns.split(',').map(value=>value.trim())})}>Save as new layout</button>
     <button type="button" className="br-secondary" disabled={busy||!selected||!name.trim()} onClick={()=>void save('confirmation-layout.save',{id:selected,name,columns:columns.split(',').map(value=>value.trim())})}>Update selected layout</button>
     <button type="button" className="br-secondary" disabled={busy||!selected} onClick={()=>void save('confirmation-layout.default',{id:selected})}>Make selected layout default</button></div>
   </div></details>
  </>}
 </fieldset>
}
