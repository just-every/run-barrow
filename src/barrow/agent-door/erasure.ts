import { agentErasureStatements, checkAgentArtifacts, type AgentArtifactMap, type ToolContext } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server.ts'
import { toD1Sql } from '@runeditrun/rer/modules/erasure/fence'

// Identifiers and exact addresses select custody. Name-only text stays an
// explicit DATA-003 gap; a shared name must never select another buyer's data.
const sourceId = "CASE WHEN subject.type='object' THEN json_extract(subject.value,'$.sourceUserId') END"
const tokenCharacter = "'[A-Za-z0-9_@.+/:-]'"
// Check every literal occurrence, including one after an embedded occurrence.
// Keep URI/version separators inside tokens (for example policy/1 is not id 1).
const sourceMention = (column: string) => `EXISTS(
  WITH RECURSIVE hits(text,source,pos) AS (
    SELECT content.value,(${sourceId}),instr(content.value,(${sourceId}))
    FROM json_tree(CASE WHEN json_valid(${column}) THEN ${column} ELSE json_quote(${column}) END) content
    WHERE content.type='text'
    UNION ALL
    SELECT text,source,pos+instr(substr(text,pos+1),source) FROM hits
    WHERE pos>0 AND instr(substr(text,pos+1),source)>0
  )
  SELECT 1 FROM hits WHERE pos>0
    AND substr(text,pos-1,1) NOT GLOB ${tokenCharacter}
    AND substr(text,pos+length(source),1) NOT GLOB ${tokenCharacter}
)`
const mentions = (table: string, columns: string[]) => 'EXISTS(SELECT 1 FROM json_each(?1) subject WHERE ' + columns.map(name => {
  const column = table + '.' + name
  return "(subject.type='text' AND instr(CAST(" + column + " AS TEXT),CAST(subject.value AS TEXT))>0) OR (subject.type='object' AND (CAST(" + column + " AS TEXT)=(" + sourceId + ') OR ' + sourceMention(column) + '))'
}).join(' OR ') + ')'
const calls = mentions('agent_door_calls', ['key', 'outcome']), approvals = mentions('agent_door_approvals', ['saved', 'approvals', 'result']), reviews = mentions('agent_door_reviews', ['saved', 'marked_by']), audits = mentions('agent_door_audit', ['row', 'evidence'])
const decisions = "SELECT decision_id FROM agent_door_calls WHERE " + calls + " UNION SELECT json_extract(saved,'$.decision_id') FROM agent_door_approvals WHERE " + approvals + " UNION SELECT json_extract(saved,'$.decision_id') FROM agent_door_reviews WHERE " + reviews + " UNION SELECT id FROM agent_door_audit WHERE " + audits + " UNION SELECT json_extract(context_json,'$.operationId') FROM bw_audit WHERE subject_id IN (SELECT json_extract(value,'$.sourceUserId') FROM json_each(?1))"
const match = (sql: string) => ({ sql, params: ['values'] })
export const accountAgentArtifacts: AgentArtifactMap = { artifacts: [
  { table: 'agent_door_state', columns: ['id','envelope','local_document','local_revision','local_paused','decision_lock','decision_until'], unrelated: 'Installation policy and admission leases; buyer subjects are not policy principals.' },
  { table: 'agent_door_agents', columns: ['id','name','specialist','sponsor','sponsor_name','revoked','window','requests','tombstone'], unrelated: 'Non-person agent identities and native operator sponsors; buyer subjects are not agent sponsors.' },
  { table: 'agent_door_calls', columns: ['agent','key','digest','decision_id','created_at','state','outcome','expires_at'], match: match('decision_id IN (' + decisions + ')') },
  { table: 'agent_door_audit', columns: ['sequence','id','at','agent','classes','row','evidence'], match: match('id IN (' + decisions + ') OR json_extract(row,\'$.decision_id\') IN (' + decisions + ') OR json_extract(row,\'$.replay_of\') IN (' + decisions + ')') },
  { table: 'agent_door_approvals', columns: ['id','state','saved','approvals','result','version'], match: match('json_extract(saved,\'$.decision_id\') IN (' + decisions + ') OR ' + approvals) },
  { table: 'agent_door_reviews', columns: ['id','state','saved','marked_by','marked_at'], match: match('json_extract(saved,\'$.decision_id\') IN (' + decisions + ') OR ' + reviews) },
  { table: 'agent_door_events', columns: ['sequence','id','uri','event'], match: match(mentions('agent_door_events', ['uri','event']) + ' OR json_extract(event,\'$.decision_id\') IN (' + decisions + ')') },
  { table: 'agent_door_usage', columns: ['decision_id','at','seed','specialist','agent','classes'], match: match('decision_id IN (' + decisions + ')') },
  { table: 'agent_door_replay_aliases', columns: ['agent','alias','call_id','tombstone'], unrelated: 'Installation-private, value-free replay aliases; excluded from archives and exports.' },
] }

export const checkAccountAgentArtifacts=(db:D1Database)=>checkAgentArtifacts(db,accountAgentArtifacts)
export async function eraseAccountAgentArtifacts(env:Bindings,subject:{accountId:string;accountEmail?:string;people?:{id:string;email:string;subjects:string[]}[]},operation:{id:string;at:string}) {
 const values:string[]=[subject.accountId,...(subject.accountEmail?[subject.accountEmail]:[])]
 for(const person of subject.people??[])values.push(person.id,person.email,...person.subjects)
 for(const table of ['bw_orders','bw_quotes','bw_lists','bw_agent_proposals','bw_agent_proposal_grants']) {
  const rows=(await env.DB.prepare(`SELECT id FROM ${table} WHERE account_id=?`).bind(subject.accountId).all<{id:string}>()).results
  values.push(...rows.map(row=>row.id))
 }
 // The caller's existing native transaction includes transfer invalidation and
 // the portability redaction checkpoint exactly once, even with no artifacts.
 return (await agentErasureStatements({db:env.DB,map:accountAgentArtifacts,subject:{values:JSON.stringify([...new Set(values.filter(Boolean))].map(sourceUserId=>({sourceUserId})))},secret:env.SESSION_SECRET,
  tombstone:{erasure_id:operation.id,at:operation.at},checkpoint:async()=>[]})).map(toD1Sql)
}
export async function accountErasureFenced(env:Bindings,name:string,args:Record<string,unknown>,_ctx:ToolContext) {
 const parent=async(table:string,key:unknown)=>typeof key==='string'?(await env.DB.prepare(`SELECT account_id FROM ${table} WHERE id=? LIMIT 1`).bind(key).first<{account_id:string}>())?.account_id:undefined
 let id=args.accountId
 if(name==='barrow.accounts.read'||name==='barrow.catalog.read')id=args.id
 if(name==='barrow.orders.read'||name==='barrow.proposals.submit')id=await parent('bw_orders',args.orderId??args.id)
 if(name==='barrow.lists.read')id=await parent('bw_lists',args.id)
 if(name==='barrow.proposals.read')id=await parent('bw_agent_proposals',args.id)
 return typeof id==='string'&&!!await env.DB.prepare('SELECT 1 FROM bw_agent_erased_accounts WHERE account_id=?').bind(id).first()
}
