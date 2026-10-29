export type AuditContext = {preparedBy?:{agent:string;person:string;label:string};operationId?:string;approvers?:readonly {id:string;name:string}[];accountId?:string;orderId?:string;revision?:string;source:string;reason:string}
/** Mutation callers include this statement in the same guarded atomic batch. */
export function commercialAuditEvent(actorId:string,subject:string,action:string,context:AuditContext) {
 return {sql:'INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json) VALUES(?,?,?,?,?,?)',params:[crypto.randomUUID(),subject,actorId,action,new Date().toISOString(),JSON.stringify(context)]}
}
