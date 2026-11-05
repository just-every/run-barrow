import type { Actor } from '../model'

/** Retain opaque attribution and cursor identity, but erase the named person. */
export function nativePersonEventErasureStatements(userId:string) {
 return [{sql:`UPDATE agent_door_events SET event=json_set(event,'$.actor.person.name','Former company user')
  WHERE json_extract(event,'$.actor.kind')='person' AND json_extract(event,'$.actor.person.id')=?`,params:[userId]}]
}

/** Native person changes retain their event in the guarded business transaction.
 * Agent preparations already emit through the shared policy pipeline. */
export function nativeRecordEvents(db:D1Database,actor:Actor,type:string,kind:'accounts'|'catalogs'|'orders'|'lists'|'proposals',id:string,revision:string) {
 if(actor.agent)return []
 const event={id:crypto.randomUUID(),type,uri:`barrow://${kind}/${id}`,at:new Date().toISOString(),revision}
 return [db.prepare(`INSERT INTO agent_door_events(id,uri,event)
  SELECT ?,?,json_set(?,'$.actor',json_object('kind','person','person',json_object('id',id,'name',display_name)))
  FROM oa_operators WHERE id=? AND version=? AND status='active'`)
  .bind(event.id,event.uri,JSON.stringify(event),actor.id,actor.version)]
}
