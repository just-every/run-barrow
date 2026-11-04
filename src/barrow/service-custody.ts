/** Personal service narratives never acquire a financial-retention exemption. */
export function eraseServiceNarrative(value:any,userId?:string) {
 const authored=!userId||value.createdBy===userId
 const contributed=authored||value.history.some((event:any)=>event.by===userId)
 return {...value,...(authored?{reason:'[Erased service text]',requestedReplacement:value.requestedReplacement?{...value.requestedReplacement,sku:'[Erased service text]'}:null}:{}),...(contributed?{restored:true}:{}),history:value.history.map((event:any)=>!userId||event.by===userId?{...event,reason:'[Erased service text]'}:event)}
}
export function eraseServiceAudit(context:any,action:string) {
 return ['service.report','service.review'].includes(action)?{...context,reason:'[Erased service text]'}:context
}
