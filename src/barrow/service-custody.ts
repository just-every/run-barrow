/** Personal service narratives never acquire a financial-retention exemption. */
export function eraseServiceNarrative(value:any,userId?:string) {
 const authored=!userId||value.createdBy===userId
 const contributed=authored||value.history.some((event:any)=>event.by===userId)||value.exchanges?.some((offer:any)=>offer.proposedBy===userId||offer.buyerApproval?.by===userId)
 const eraseQuote=(quote:any)=>quote&&(!userId||quote.by===userId)?{...quote,reason:'[Erased service text]'}:quote
 const exchanges=value.exchanges?.map((offer:any)=>({
  ...offer,
  ...(!userId||offer.proposedBy===userId?{reason:'[Erased service text]'}:{}),
  freightQuotes:offer.freightQuotes?.map(eraseQuote),
  delivery:offer.delivery?{
   ...offer.delivery,quote:eraseQuote(offer.delivery.quote),
   ...((!userId||offer.proposedBy===userId)&&offer.delivery.ownCarrierAccount?{ownCarrierAccount:'[Erased service text]'}:{})
  }:undefined
 }))
 return {
  ...value,
  ...(authored?{reason:'[Erased service text]',requestedReplacement:value.requestedReplacement?{...value.requestedReplacement,sku:'[Erased service text]'}:null}:{}),
  ...(contributed?{restored:true}:{}),exchanges,
  history:value.history.map((event:any)=>!userId||event.by===userId?{...event,reason:'[Erased service text]'}:event)
 }
}
export function eraseServiceAudit(context:any,action:string) {
 return ['service.report','service.review','service.exchange-offer','service.exchange-approve'].includes(action)?{...context,reason:'[Erased service text]'}:context
}
