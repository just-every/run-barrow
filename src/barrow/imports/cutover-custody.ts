/** Incumbent files can contain several companies. Retire the whole shared source
 * on an explicit erasure rather than retaining another copy of erased contacts. */
export function cutoverErasure(accountId:string) {
 return {sql:"UPDATE bw_cutover_imports SET state='erased',source_json='{}',report_json='{}',reason='[Erased cutover source custody]' WHERE EXISTS(SELECT 1 FROM json_each(scope_json) WHERE value=?)",params:[accountId]}
}
