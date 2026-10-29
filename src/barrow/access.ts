import { now } from './clock'
import { integrationCredential, integrationAdmission } from './integration-grants'
import { staffGuard } from './staff-policy'
import { companyRightsGuard } from './company-policy'
import { operatorAuth, type Bindings } from '../auth.server'
import { commercialAuditEvent, type AuditContext } from './audit-event'
import { fail, type Actor } from './model'
export { digest } from './digest'
import { digest } from './digest'
export async function current(request: Request, env: Bindings): Promise<Actor> {
 const authorization = request.headers.get('authorization')
 if (authorization) {
  if(!authorization.startsWith('Bearer ')) fail('AUTH','Use a current session or Barrow agent credential.',401)
  const grant = await env.DB.prepare(`SELECT t.id AS grantId,t.scope_kind AS agentScope,o.id,o.email,o.role,o.version FROM bw_agent_tokens t JOIN oa_operators o ON o.id=t.actor_id WHERE t.digest=? AND t.expires_at>? AND o.status='active' AND o.version=t.actor_version AND o.role IN ('owner','admin')`).bind(await digest(authorization.slice(7)),Date.now()).first<any>()
  if (!grant) {
   const integration=await integrationCredential(env,authorization.slice(7))
   if(integration)return integration
   fail('AUTH','Agent credential expired or revoked.',401)
  }
  return {...grant,agent:true}
 }
 const session=await operatorAuth(env).getSession(request)
 if(!session) fail('AUTH','Sign in to open your trade portal.',401)
 return {id:session.operator.id,email:session.operator.email,role:session.operator.role,version:session.operator.version,sessionId:session.id,agent:false}
}
export function admission(db: D1Database, actor: Actor): D1PreparedStatement {
 if(actor.door)return actor.door.admission()
 if(actor.integration)return integrationAdmission(db,actor)
 const sql = actor.agent
  ? `EXISTS(SELECT 1 FROM bw_agent_tokens t JOIN oa_operators o ON o.id=t.actor_id WHERE t.id=? AND o.id=? AND o.version=? AND o.status='active' AND o.role IN ('owner','admin') AND t.expires_at>?)`
  : `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND o.version=? AND s.operator_version=o.version AND o.role=? AND o.status='active' AND s.revoked_at IS NULL AND s.expires_at>?)`
 const values = actor.agent ? [actor.grantId!,actor.id,actor.version,Date.now()] : [actor.sessionId!,actor.id,actor.version,actor.role,Date.now()]
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN ${sql} THEN 1 ELSE 0 END`).bind(...values)
}
export async function commit(db: D1Database, actor: Actor, statements: D1PreparedStatement[]) {
 if(actor.integration)actor={...actor,integrationAt:(await now()).getTime()}
 const exchange=actor.exchange?await (await import('./integration-exchange')).exchangeAdmission(db,actor,actor.exchange):[]
 await db.batch([admission(db,actor),...(actor.staff?[staffGuard(db,actor.staff)]:[]),...(actor.company?[companyRightsGuard(db,actor.company)]:[]),...exchange,...statements,db.prepare('DELETE FROM bw_guard')])
}
export const changed = (db: D1Database) => db.prepare('INSERT INTO bw_guard(value) VALUES(changes())')
export const audit = (db:D1Database,actor:Actor,subject:string,action:string,context:AuditContext) => {
 const event=commercialAuditEvent(actor.door?`agent:${actor.door.agentId}`:(actor.agent?`agent:${actor.grantId}`:actor.id),subject,action,{...context,...(actor.door?{preparedBy:{agent:actor.door.agentId,person:actor.door.sponsorId,label:actor.door.label},operationId:actor.door.operationId,approvers:actor.door.approvers}: {})})
 return db.prepare(event.sql).bind(...event.params)
}
