import type { Bindings } from '../auth.server'
import { account, prepareAccountSave } from './accounts'
import { commit } from './access'
import { fail, requireSupplier, text, type Actor } from './model'
import { parseCsv, csvText } from './cart-csv'
export async function importPriceBook(env:Bindings,actor:Actor,p:any) {
 requireSupplier(actor)
 const selected=await account(env.DB,actor,text(p.accountId,'Account'))
 if(p.revision!==selected.revision)fail('CHANGED','Refresh the price book before importing.')
 const [header,...rows]=parseCsv(p.csv)
 if(header?.join(',')!=='sku,currency,unitCents,msrpCents,minQty')fail('INPUT','Use sku,currency,unitCents,msrpCents,minQty headers.',400)
 if(!rows.length||rows.length>200)fail('INPUT','Import one to 200 price rows.',400)
 const currencies=new Set(rows.map(row=>row[1]))
 if(currencies.size!==1||!['USD','CAD'].includes(rows[0][1]))fail('INPUT','Each account book has one explicit USD or CAD currency.',400)
 const integer=(s:string)=>/^(0|[1-9]\d*)$/.test(s)?Number(s):fail('INPUT','Prices and minimums are integer minor units or quantities.',400)
 const sameCurrency=rows[0][1]===(selected.value.currency??'USD')
 if(!sameCurrency&&selected.value.prices.some(p=>p.units?.length||p.pricing))fail('INPUT','Currency changes require explicitly repricing configured selling units and rules in Edit account first.',400)
 const prices=rows.map(row=>{if(row.length!==5)fail('INPUT','Each price row needs five columns.',400);const prior=selected.value.prices.find(price=>price.sku===row[0]);return {...prior,sku:row[0],unitCents:integer(row[2]),msrpCents:row[3]===''?undefined:integer(row[3]),minQty:integer(row[4])}})
 const saved=await prepareAccountSave(env,actor,{id:selected.id,revision:selected.revision,value:{...selected.value,currency:rows[0][1],prices}})
 await commit(env.DB,actor,saved.statements)
 return saved.record
}
export async function priceBookCsv(env:Bindings,actor:Actor,id:string) {
 requireSupplier(actor)
 const a=await account(env.DB,actor,id)
 return new Response(csvText([['sku','currency','unitCents','msrpCents','minQty'],...a.value.prices.map(p=>[p.sku,a.value.currency??'USD',p.unitCents,p.msrpCents,p.minQty])]),{headers:{'content-type':'text/csv; charset=utf-8','cache-control':'no-store','content-disposition':'attachment; filename="price-book.csv"'}})
}
