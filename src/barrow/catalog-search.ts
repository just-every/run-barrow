import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, commit } from './access'
import { fail, requirePerson, text, type Actor } from './model'
import { catalogue, pierOrigin } from './pier'
import { variantAttributes } from './variant-attributes'

const normalized = (value: string) => value.normalize('NFKC').toLowerCase()
const pageSize = 25
/** Explicitly rebuild one account's observations. No inventory or ordering authority is created here. */
export async function refreshCatalogIndex(env: Bindings, actor: Actor, input: any) {
 requirePerson(actor)
 if (!['owner','admin'].includes(actor.role) || actor.staff) fail('FORBIDDEN','Only the supplier owner or admin can refresh catalog search.',403)
 const selected = await account(env.DB,actor,text(input.accountId,'Account ID',100))
 const attributes = await variantAttributes(env.DB), live = await catalogue(env,selected)
 if (live.items.length > 20000) fail('CATALOG_SIZE','Search supports at most 20,000 eligible variants per account.',400)
 const revision = crypto.randomUUID(), source = await pierOrigin(env)
 const rows = live.items.map(item => {
  const { image: _image, ...details } = attributes.variants[item.sku] ?? {style:'',color:'',size:''}
  return {sku:item.sku,skuKey:normalized(item.sku),barcodeKey:normalized(item.barcode??''),
   searchText:normalized([item.sku,item.barcode??'',item.name,details.style,details.color,details.size].join(' ')),
   style:details.style,color:details.color,size:details.size,inStock:Number(item.available)>0?1:0,value:{...item,...details}}
 })
 const statements = [
  env.DB.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) AND COALESCE((SELECT revision FROM bw_settings WHERE key='variant-attributes'),'')=? THEN 1 ELSE 0 END`).bind(selected.id,selected.revision,attributes.revision??''),
  env.DB.prepare('DELETE FROM bw_catalog_search WHERE account_id=?').bind(selected.id),
 ]
 for (let offset=0;offset<rows.length;offset+=100) statements.push(env.DB.prepare(`INSERT INTO bw_catalog_search
  SELECT ?,json_extract(value,'$.sku'),json_extract(value,'$.skuKey'),json_extract(value,'$.barcodeKey'),json_extract(value,'$.searchText'),
   json_extract(value,'$.style'),json_extract(value,'$.color'),json_extract(value,'$.size'),json_extract(value,'$.inStock'),json_extract(value,'$.value') FROM json_each(?)`).bind(selected.id,JSON.stringify(rows.slice(offset,offset+100))))
 statements.push(env.DB.prepare(`INSERT INTO bw_catalog_indexes VALUES(?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET
  revision=excluded.revision,account_revision=excluded.account_revision,attributes_revision=excluded.attributes_revision,pier_origin=excluded.pier_origin,observed_at=excluded.observed_at`).bind(selected.id,revision,selected.revision,attributes.revision??'',source??'demo',live.observedAt),
  audit(env.DB,actor,selected.id,'catalog.refreshed',{accountId:selected.id,revision,source:'catalog.refresh',reason:`Rebuilt discovery observations for ${rows.length} currently eligible variants; stock is not reserved.`}))
 await commit(env.DB,actor,statements)
 return {accountId:selected.id,revision,count:rows.length,observedAt:live.observedAt}
}
/** Search only a currently entitled account's index. Price/attribute edits invalidate the entire observation. */
export async function searchCatalog(env: Bindings, actor: Actor, query: URLSearchParams) {
 requirePerson(actor)
 const selected = await account(env.DB,actor,text(query.get('accountId'),'Account ID',100))
 const attributes = await variantAttributes(env.DB), source = await pierOrigin(env)
 const index = await env.DB.prepare('SELECT * FROM bw_catalog_indexes WHERE account_id=?').bind(selected.id).first<{revision:string;account_revision:string;attributes_revision:string;pier_origin:string;observed_at:string}>()
 if (!index || index.account_revision!==selected.revision || index.attributes_revision!==(attributes.revision??'') || index.pier_origin!==(source??'demo')) fail('CATALOG_REFRESH','The supplier must refresh this account’s search observations before searching.',409)
 const clauses=['account_id=?'], values:(string|number)[]=[selected.id]
 const rawPage=query.get('page')??'1'
 if (!/^[1-9]\d{0,5}$/.test(rawPage)) fail('SEARCH','Choose a positive page number up to 999999.',400)
 const page=Number(rawPage)
 const supported=new Set(['accountId','q','sku','barcode','style','color','size','availability','page'])
 for (const key of query.keys()) if (!supported.has(key)) fail('SEARCH','Choose a supported search field.',400)
 for (const key of ['q','sku','barcode','style','color','size']) {
  const term=(query.get(key)??'').trim()
  if(term.length>160) fail('SEARCH','Search fields accept at most 160 characters.',400)
  if(!term)continue
  if(key==='q'){clauses.push('instr(search_text,?)>0');values.push(normalized(term))}
  else {const column=key==='sku'?'sku_key':key==='barcode'?'barcode_key':key;clauses.push(`${column}=?`);values.push(['sku','barcode'].includes(key)?normalized(term):term)}
 }
 const availability=query.get('availability')??'all'
 if(!['all','in-stock','out-of-stock'].includes(availability))fail('SEARCH','Choose all, in-stock or out-of-stock availability.',400)
 if(availability!=='all'){clauses.push('in_stock=?');values.push(availability==='in-stock'?1:0)}
 const result=await env.DB.prepare(`SELECT value_json FROM bw_catalog_search WHERE ${clauses.join(' AND ')} ORDER BY sku LIMIT ? OFFSET ?`).bind(...values,pageSize+1,(page-1)*pageSize).all<{value_json:string}>()
 return {accountId:selected.id,accountRevision:selected.revision,currency:selected.value.currency??'USD',revision:index.revision,observedAt:index.observed_at,
  availability:'Observed stock only; preparation and submission recheck live Pier.',items:result.results.slice(0,pageSize).map(row=>JSON.parse(row.value_json)),page,pageSize,hasNext:result.results.length>pageSize}
}
