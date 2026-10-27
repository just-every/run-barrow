import type { Bindings } from '../../auth.server'
import type { Actor } from '../model'
import { fail } from '../model'
import { now } from '../clock'
import { canonicalJson, deltaRow, deltaView, deltaRevision, deltaReason, deltaFingerprint, deltaFence, deltaCommit, deltaAudit, deltaScopeAudits } from './delta-store'

function inspect(value:unknown,depth=0):void {
 if(depth>30)fail('DELTA_FEED','Feed snapshot nesting exceeds the supported limit.',400)
 if(value===null||typeof value==='string'||typeof value==='boolean')return
 if(typeof value==='number'&&Number.isFinite(value))return
 if(Array.isArray(value)) { for(const item of value)inspect(item,depth+1); return }
 if(value&&typeof value==='object') {
  for(const [key,item] of Object.entries(value)) {
   if(/^(password|privateKey|passphrase|secret|token|authorization|cookie)$/i.test(key))fail('DELTA_FEED_SECRET','Keep SFTP credentials in private server bindings, outside the source/feed snapshot.',400)
   inspect(item,depth+1)
  }
  return
 }
 fail('DELTA_FEED','Feed snapshot must be finite JSON data.',400)
}
// Receipt timestamps describe observation, not changed source bytes. Replaying
// an identical feed must retain the earlier review and its original receipt.
function reviewed(value:unknown):unknown {
 if(Array.isArray(value))return value.map(reviewed)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='receivedAt'&&key!=='checkedAt').map(([key,item])=>[key,reviewed(item)]))
 return value
}
export async function updateDeltaFeed(env:Bindings,actor:Actor,id:string,snapshot:Record<string,unknown>&{expectedRevision:string},reasonValue:string) {
 const row=await deltaRow(env,actor,id)
 deltaRevision(row,snapshot?.expectedRevision)
 if(row.state!=='rehearsal')fail('DELTA_STATE','Feed rehearsal can update only an isolated rehearsal session.')
 const reason=deltaReason(reasonValue),{expectedRevision,...feed}=snapshot
 inspect(feed)
 if(JSON.stringify(feed).length>8*1024*1024)fail('DELTA_FEED','Feed rehearsal snapshot exceeds 8 MiB.',400)
 if(canonicalJson(reviewed(feed))===canonicalJson(reviewed(JSON.parse(row.feed_json))))return deltaView(row)
 const revision=crypto.randomUUID(),at=(await now()).toISOString(),fingerprint=deltaFingerprint(JSON.parse(row.source_json),JSON.parse(row.report_json),feed,row.source_system)
 await deltaCommit(env,actor,[deltaFence(env,row),
  env.DB.prepare('UPDATE bw_delta_cutovers SET revision=?,fingerprint=?,feed_json=?,updated_at=?,reason=? WHERE id=?').bind(revision,fingerprint,JSON.stringify(feed),at,reason,id),
  env.DB.prepare('INSERT INTO bw_delta_feed_runs(session_id,revision,snapshot_json,created_at) VALUES(?,?,?,?)').bind(id,revision,JSON.stringify(feed),at),
  ...deltaScopeAudits(env,actor,id,'delta.feed-rehearsed',revision,reason,JSON.parse(row.scope_json)),
 ])
 return deltaView({...row,revision,fingerprint,feed_json:JSON.stringify(feed),updated_at:at,reason})
}
