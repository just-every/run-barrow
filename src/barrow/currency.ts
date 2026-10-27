import type { Account, Order } from './model'
import { fail, supplierDate } from './model'
export type UsdConversion={asOf:string;numerator:number;denominator:number;source:string}
/** Book revisions activate at midnight Eastern and never change the book currency. */
export function effectiveBook(account:Account,at:Date):Account {
 const revision=account.value.priceRevisions?.filter(row=>row.effectiveFrom<=supplierDate(at)).at(-1)
 return revision?{...account,value:{...account.value,prices:revision.prices}}:account
}
export function conversionSnapshot(account:Account,at:Date):UsdConversion|undefined {
 if((account.value.currency??'USD')==='USD')return {asOf:supplierDate(at),numerator:1,denominator:1,source:'Original USD transaction'}
 const basis=account.value.usdConversion
 if(basis&&basis.asOf>supplierDate(at))fail('CONVERSION_DATE','The recorded conversion basis is dated after this transaction.',409)
 return basis?{...basis}:undefined
}
/** Conversion is supplementary: original transaction cents are never overwritten. */
export function usdReporting(order:Pick<Order,'usdConversion'>,cents:number) {
 const basis=order.usdConversion
 if(!basis)return {usdCents:null,usdConversionDate:'',usdConversionSource:'',usdRateNumerator:null,usdRateDenominator:null}
 const numerator=BigInt(cents)*BigInt(basis.numerator),denominator=BigInt(basis.denominator)
 const usdCents=Number((numerator+denominator/2n)/denominator)
 if(!Number.isSafeInteger(usdCents))fail('MONEY','The converted amount exceeds exact integer cents.',409)
 return {usdCents,usdConversionDate:basis.asOf,usdConversionSource:basis.source,usdRateNumerator:basis.numerator,usdRateDenominator:basis.denominator}
}
