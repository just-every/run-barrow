/** Return narratives are personal intake, separate from immutable commercial quantities. */
export function eraseReturnNarrative(value:any,userId?:string) {
 const narrativeBy=value.history.filter((event:any)=>event.action==='return.request'||event.action==='return.revise').at(-1)?.by??value.createdBy
 const authored=!userId||narrativeBy===userId
 return {...value,...(authored?{reason:'[Erased return text]',condition:'[Erased return text]',restored:true}:{}),
  decision:value.decision&&(!userId||value.decision.by===userId)?{...value.decision,reason:'[Erased return text]',instructions:'[Erased return text]'}:value.decision,
  history:value.history.map((event:any)=>!userId||event.by===userId?{...event,reason:'[Erased return text]'}:event)}
}

/** Audit attribution survives erasure; the copied personal return narrative does not. */
export function eraseReturnAudit(context:any,action:string) {
 return action.startsWith('return.')&&typeof context?.reason==='string'?{...context,reason:'[Erased return text]'}:context
}
