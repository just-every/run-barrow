import { effectiveBook } from './currency'
import { now } from './clock'
import type { Bindings } from '../auth.server'
import { account, prepareAccountSave } from './accounts'
import { commit } from './access'
import { fail, requireSupplier, supplierDate, text, type Actor, type Account } from './model'
import { validateAccountValue } from './imports'
import { parseCsv, csvText } from './cart-csv'
export async function importPriceBook(env:Bindings,actor:Actor,p:any) {
 requireSupplier(actor)
 const selected=await account(env.DB,actor,text(p.accountId,'Account'))
 const value=await priceBookValue(selected,p)
 const saved=await prepareAccountSave(env,actor,{id:selected.id,revision:selected.revision,value})
 await commit(env.DB,actor,saved.statements)
 return saved.record
}
/** Validate without writes so integration preparation and native import use one rule. */
export async function priceBookValue(selected:Account,p:any) {
 if(p.revision!==selected.revision)fail('CHANGED','Refresh the price book before importing.')
 const [header,...rows]=parseCsv(p.csv)
 if(header?.join(',')!=='sku,currency,unitCents,msrpCents,minQty')fail('INPUT','Use sku,currency,unitCents,msrpCents,minQty headers.',400)
 if(!rows.length||rows.length>200)fail('INPUT','Import one to 200 price rows.',400)
 const currencies=new Set(rows.map(row=>row[1]))
 if(currencies.size!==1||!['USD','CAD','EUR','GBP'].includes(rows[0][1]))fail('INPUT','Each account book has one explicit USD, CAD, EUR or GBP currency.',400)
 const integer=(s:string)=>/^(0|[1-9]\d*)$/.test(s)?Number(s):fail('INPUT','Prices and minimums are integer minor units or quantities.',400)
 const at=await now(),currentPrices=effectiveBook(selected,at).value.prices,active=selected.value.priceRevisions?.filter(row=>row.effectiveFrom<=supplierDate(at)).at(-1)
 const sameCurrency=rows[0][1]===(selected.value.currency??'USD')
 if(!sameCurrency&&(selected.value.priceRevisions?.length||selected.value.usdConversion||selected.value.prices.some(p=>p.units?.length||p.pricing)))fail('INPUT','Currency changes require explicitly repricing configured selling units and rules in Edit account first.',400)
 const prices=rows.map(row=>{if(row.length!==5)fail('INPUT','Each price row needs five columns.',400);const prior=currentPrices.find(price=>price.sku===row[0]);return {...prior,sku:row[0],unitCents:integer(row[2]),msrpCents:row[3]===''?undefined:integer(row[3]),minQty:integer(row[4])}})
 return validateAccountValue({...selected.value,currency:rows[0][1],...(active?{priceRevisions:selected.value.priceRevisions!.map(row=>row===active?{...row,prices}:row)}:{prices})})
}
export async function priceBookCsv(env:Bindings,actor:Actor,id:string) {
 requireSupplier(actor)
 const a=effectiveBook(await account(env.DB,actor,id),await now())
 return new Response(csvText([['sku','currency','unitCents','msrpCents','minQty'],...a.value.prices.map(p=>[p.sku,a.value.currency??'USD',p.unitCents,p.msrpCents,p.minQty])]),{headers:{'content-type':'text/csv; charset=utf-8','cache-control':'no-store','content-disposition':'attachment; filename="price-book.csv"'}})
}
