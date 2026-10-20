// ORD-014: named per-line CSV layouts over immutable confirmation fields.
import { audit, commit } from './access'
import { fail, requireSupplier, text, type Actor } from './model'
export const confirmationColumns = ['confirmation','stage','recorded_at','order','order_revision','account','buyer','po','bill_to','ship_to','requested_date','cancel_after','terms_days','currency','sku','description','quantity','unit','base_quantity','base_unit','unit_cents','line_cents','shipping_cents','order_total_cents','limitations'] as const
export type ConfirmationColumn = typeof confirmationColumns[number]
export type ConfirmationLayout = {id:string;name:string;columns:ConfirmationColumn[];shape:'per-line'}
export type ConfirmationLayouts = {layouts:ConfirmationLayout[];defaultId:string;revision:string|null}
export async function confirmationLayouts(db:D1Database):Promise<ConfirmationLayouts> {
 const row=await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='confirmation-layouts'").first<{value_json:string;revision:string}>()
 return row?{...JSON.parse(row.value_json),revision:row.revision}:{layouts:[{id:'standard',name:'Complete confirmation',columns:[...confirmationColumns],shape:'per-line'}],defaultId:'standard',revision:null}
}
export async function readConfirmationLayouts(db:D1Database,actor:Actor) {requireSupplier(actor);return {...await confirmationLayouts(db),availableColumns:confirmationColumns}}
export async function saveConfirmationLayout(db:D1Database,actor:Actor,type:string,p:any) {
 requireSupplier(actor)
 const prior=await confirmationLayouts(db)
 if(p.revision!==prior.revision)fail('CHANGED','Refresh the export layouts before saving.')
 let layouts=prior.layouts,defaultId=prior.defaultId,id=p.id
 if(type==='confirmation-layout.save') {
  id=p.id===undefined?crypto.randomUUID():text(p.id,'Layout ID',100)
  if(p.id!==undefined&&!layouts.some(layout=>layout.id===id))fail('NOT_FOUND','Export layout not found.',404)
  const name=text(p.name,'Layout name',80)
  if(!Array.isArray(p.columns)||!p.columns.length||p.columns.length>confirmationColumns.length||p.columns.some((column:any)=>!confirmationColumns.includes(column))||new Set(p.columns).size!==p.columns.length)fail('INPUT','Choose distinct recorded confirmation columns in export order.',400)
  if(p.shape!==undefined&&p.shape!=='per-line')fail('INPUT','Only per-line layouts are implemented. Matrix layouts are not recorded.',400)
  const layout:ConfirmationLayout={id,name,columns:p.columns,shape:'per-line'}
  layouts=layouts.some(row=>row.id===id)?layouts.map(row=>row.id===id?layout:row):[...layouts,layout]
  if(p.makeDefault===true)defaultId=id
 } else if(type==='confirmation-layout.default') {
  if(!layouts.some(row=>row.id===p.id))fail('NOT_FOUND','Export layout not found.',404)
  defaultId=p.id
 } else fail('COMMAND','Unknown export layout command.',404)
 const revision=crypto.randomUUID(),value={layouts,defaultId}
 await commit(db,actor,[db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='confirmation-layouts'),'')=? THEN 1 ELSE 0 END").bind(prior.revision??''),db.prepare("INSERT INTO bw_settings VALUES('confirmation-layouts',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(value),revision),audit(db,actor,'confirmation-layouts','confirmation-layout.saved',{revision,source:type,reason:`Saved named per-line CSV layout ${id}; default ${defaultId}.`})])
 return {...value,revision}
}
export async function selectedConfirmationColumns(db:D1Database,id?:string) {
 const settings=await confirmationLayouts(db),layout=settings.layouts.find(row=>row.id===(id??settings.defaultId))
 if(!layout)fail('NOT_FOUND','Export layout not found.',404)
 return layout.columns
}
