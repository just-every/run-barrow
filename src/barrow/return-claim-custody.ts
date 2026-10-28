/** Return narratives are personal intake, separate from immutable commercial quantities. */
export function eraseReturnNarrative(value:any,userId?:string) {
 const authored=!userId||value.createdBy===userId
 return {...value,...(authored?{reason:'[Erased return text]',condition:'[Erased return text]',restored:true}:{}),
  decision:value.decision&&(!userId||value.decision.by===userId)?{...value.decision,reason:'[Erased return text]',instructions:'[Erased return text]'}:value.decision,
  history:value.history.map((event:any)=>!userId||event.by===userId?{...event,reason:'[Erased return text]'}:event)}
}
