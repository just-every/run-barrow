/** Return narratives are personal intake, separate from immutable commercial quantities. */
export function eraseReturnNarrative(value:any,userId?:string) {
 const currentAuthor=value.history.findLast((event:any)=>event.action==='return.request'||event.action==='return.revise')?.by??value.createdBy
 const authored=!userId||currentAuthor===userId
 return {...value,...(authored?{reason:'[Erased return text]',condition:'[Erased return text]',restored:true}:{}),
  decision:value.decision&&(!userId||value.decision.by===userId)?{...value.decision,reason:'[Erased return text]',instructions:'[Erased return text]'}:value.decision,
  history:value.history.map((event:any)=>!userId||event.by===userId?{...event,reason:'[Erased return text]'}:event)}
}

/** Erasure removes intake and decision text while retaining opaque audit attribution. */
export function eraseReturnAudit(context:any,action:string) {
 return ['return.request','return.revise','return.decide'].includes(action)
  ? {...context,reason:'[Erased return text]'} : context
}
