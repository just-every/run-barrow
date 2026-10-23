/** Shared originals and feed files may contain contacts for several accounts.
 * Retire the complete session and every prior delta original atomically with
 * the native erasure planner and its independent journal checkpoint. */
export function deltaErasure(accountId:string) {
 const scope='EXISTS(SELECT 1 FROM json_each(scope_json) WHERE value=?)'
 return [
  {sql:`INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_delta_cutovers WHERE ${scope} AND io_until>?) THEN 1 ELSE 0 END`,params:[accountId,Date.now()]},
  {sql:`UPDATE bw_delta_feed_runs SET snapshot_json='{}' WHERE session_id IN (SELECT id FROM bw_delta_cutovers WHERE ${scope})`,params:[accountId]},
  {sql:`UPDATE bw_delta_sources SET source_json='{}',report_json='{}' WHERE session_id IN (SELECT id FROM bw_delta_cutovers WHERE ${scope})`,params:[accountId]},
  {sql:`UPDATE bw_delta_cutovers SET state='erased',revision=lower(hex(randomblob(16))),source_system='[Erased]',source_json='{}',report_json='{}',feed_json='{}',authorities_json='{}',native_watermark_json='{}',reason='[Erased delta source custody]' WHERE ${scope}`,params:[accountId]},
 ]
}
/** Restoring snapshots never resumes a job or outbound exchange. The owner
 * must explicitly review custody and choose rollback to native-only entry. */
export function deltaRestoreInactive() {
 return {sql:"UPDATE bw_delta_cutovers SET state='inactive',revision=lower(hex(randomblob(16))),feed_json='{}',reason='Restored cutover is inactive; owner review required' WHERE state IN ('rehearsal','signedoff')",params:[]}
}
