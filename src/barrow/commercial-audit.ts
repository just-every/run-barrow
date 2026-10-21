import { fail, requireSupplier, type Actor } from './model'
import { readStaffGrant } from './staff-policy'

export type CommercialAuditEvent = {
  id: string; subjectId: string; actorId: string; actorKind: 'human' | 'agent' | 'system'
  actorName: string | null; actorEmail: string | null; action: string; createdAt: string
  accountId: string | null; orderId: string | null
  accountOrigin: 'recorded' | 'current-relation' | null
  orderOrigin: 'recorded' | 'current-relation' | null
  source: string | null; revision: string | null; reason: string | null
}
export type CommercialAuditPage = { events: CommercialAuditEvent[]; nextCursor: string | null }
type AuditRow = { cursor: number; id: string; subject_id: string; actor_id: string; action: string; created_at: string; context_json: string | null; actor_name: string | null; actor_email: string | null; related_account: string | null; related_order: string | null }

// Current relations support lookup; they do not become historical event metadata.
const from = `FROM bw_audit e
 LEFT JOIN oa_operators p ON p.id=e.actor_id AND substr(e.actor_id,1,6)<>'agent:'
 LEFT JOIN bw_orders o ON o.id=json_extract(e.context_json,'$.orderId')
   OR (e.context_json IS NULL AND e.action LIKE 'order.%' AND o.id=e.subject_id)
 LEFT JOIN bw_accounts a ON e.context_json IS NULL AND e.action LIKE 'account.%' AND a.id=e.subject_id`
const account = `COALESCE(json_extract(e.context_json,'$.accountId'),o.account_id,a.id)`
const order = `COALESCE(json_extract(e.context_json,'$.orderId'),o.id)`

function numberParam(value: string | null, name: string, defaultValue: number) {
  if (value === null) return defaultValue
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) fail('INPUT', `Invalid audit ${name}.`, 400)
  return Number(value)
}
function stringValue(value: unknown): string | null { return typeof value === 'string' && value.length ? value : null }
function event(row: AuditRow): CommercialAuditEvent {
  const context = row.context_json ? JSON.parse(row.context_json) : null
  const recordedAccount = stringValue(context?.accountId), recordedOrder = stringValue(context?.orderId)
  return {
    id: row.id, subjectId: row.subject_id, actorId: row.actor_id,
    actorKind: row.actor_id.startsWith('system:') ? 'system' : row.actor_id.startsWith('agent:') ? 'agent' : 'human',
    actorName: row.actor_name || null, actorEmail: row.actor_email || null,
    action: row.action, createdAt: row.created_at,
    accountId: recordedAccount ?? row.related_account, orderId: recordedOrder ?? row.related_order,
    accountOrigin: recordedAccount ? 'recorded' : row.related_account ? 'current-relation' : null,
    orderOrigin: recordedOrder ? 'recorded' : row.related_order ? 'current-relation' : null,
    source: stringValue(context?.source), revision: stringValue(context?.revision), reason: stringValue(context?.reason),
  }
}

export async function listCommercialAudit(db: D1Database, actor: Actor, params: URLSearchParams): Promise<CommercialAuditPage> {
  requireSupplier(actor)
  const predicates: string[] = [], values: (string | number)[] = []
  if (actor.staff) {
    const grant = await readStaffGrant(db, actor)
    if (!grant || actor.staff.userId !== actor.id || actor.staff.state !== 'active'
      || actor.staff.nativeVersion !== actor.version || grant.revision !== actor.staff.revision) fail('FORBIDDEN', 'Current staff access is required to read the audit.', 403)
    // Scope in SQL before pagination/export, using the current grant in the same read.
    // Accountless supplier decisions stay private; only one's own refusal is global.
    predicates.push(`e.actor_id=? AND EXISTS (
      SELECT 1 FROM bw_staff_members g JOIN oa_operators current_actor ON current_actor.id=g.user_id
      WHERE g.user_id=? AND g.revision=? AND g.state='active' AND g.native_version=?
        AND current_actor.role='member' AND current_actor.status='active' AND current_actor.version=g.native_version
        AND NOT EXISTS(SELECT 1 FROM bw_company_members m WHERE m.user_id=current_actor.id OR m.email_key=lower(trim(current_actor.email)))
        AND NOT EXISTS(SELECT 1 FROM bw_company_invites i WHERE i.email_key=lower(trim(current_actor.email)) OR i.accepted_by=current_actor.id)
        AND NOT EXISTS(SELECT 1 FROM bw_accounts buyer WHERE lower(trim(json_extract(buyer.value_json,'$.email')))=lower(trim(current_actor.email)))
        AND ((${account} IS NOT NULL AND (json_extract(g.policy_json,'$.accounts')='all'
          OR ${account} IN (SELECT value FROM json_each(g.policy_json,'$.accounts'))))
          OR (${account} IS NULL AND e.action='staff.permission-refused' AND e.subject_id=?))
    )`)
    values.push(actor.id, actor.id, grant.revision, actor.version, actor.id)
  } else {
    const current = await db.prepare("SELECT id FROM oa_operators WHERE id=? AND version=? AND role=? AND role IN ('owner','admin') AND status='active'").bind(actor.id, actor.version, actor.role).first<{ id: string }>()
    if (!current) fail('FORBIDDEN', 'Current supplier access is required to read the audit.', 403)
  }
  const limit = Math.min(numberParam(params.get('limit'), 'page size', 50), 200)
  for (const [key, expression] of [['accountId', account], ['orderId', order]]) {
    const value = params.get(key)?.trim()
    if (value) { predicates.push(`${expression}=?`); values.push(value) }
  }
  const person = params.get('person')?.trim()
  if (person) {
    predicates.push(`(instr(lower(e.actor_id),lower(?))>0 OR instr(lower(p.display_name),lower(?))>0 OR instr(lower(p.email),lower(?))>0)`)
    values.push(person, person, person)
  }
  if (params.has('cursor')) { predicates.push('e.rowid<?'); values.push(numberParam(params.get('cursor'), 'cursor', 0)) }
  const rows = await db.prepare(`SELECT e.rowid AS cursor,e.*,p.display_name AS actor_name,p.email AS actor_email,
    COALESCE(o.account_id,a.id) AS related_account,o.id AS related_order ${from}
    ${predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''} ORDER BY e.rowid DESC LIMIT ?`).bind(...values, limit + 1).all<AuditRow>()
  const visible = rows.results.slice(0, limit)
  return { events: visible.map(event), nextCursor: rows.results.length > limit ? String(visible[visible.length - 1].cursor) : null }
}

function csvCell(value: string | null) {
  const text = value ?? 'unrecorded'
  // Spreadsheet formula detection can skip leading whitespace/control characters.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
const columns: (keyof CommercialAuditEvent)[] = ['id', 'actorId', 'actorKind', 'actorName', 'actorEmail', 'subjectId', 'accountId', 'accountOrigin', 'orderId', 'orderOrigin', 'action', 'createdAt', 'source', 'revision', 'reason']

export async function exportCommercialAudit(db: D1Database, actor: Actor, params: URLSearchParams): Promise<Response> {
  requireSupplier(actor)
  const query = new URLSearchParams(params)
  query.delete('cursor'); query.set('limit', '200')
  let page = await listCommercialAudit(db, actor, query)
  let header = true, finished = false
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) { controller.close(); return }
      try {
        const lines = header ? [columns.map(csvCell).join(',')] : []
        header = false
        lines.push(...page.events.map(value => columns.map(key => csvCell(value[key])).join(',')))
        controller.enqueue(encoder.encode(lines.join('\r\n') + '\r\n'))
        if (!page.nextCursor) { finished = true; controller.close() }
        else { query.set('cursor', page.nextCursor); page = await listCommercialAudit(db, actor, query) }
      } catch (error) { controller.error(error) }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="barrow-commercial-audit.csv"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
