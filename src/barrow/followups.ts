import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { now } from './clock'
import { followupSources, type FollowupSource } from './followup-sources'
import { fail, requirePerson, requireSupplier, text, type Actor } from './model'
import { calendarDate, reportZone } from './report-zone'

export type FollowupContact = { outcome: 'failed' | 'reached'; note: string; by: string; at: string }
export type FollowupValue = FollowupSource & { createdAt: string; ownerId: string; nextContactDate: string; status: 'open' | 'closed'; resolution?: string; contacts: FollowupContact[] }
export type FollowupTask = FollowupValue & { revision: string }
type Stored = { value_json: string; revision: string }
const parse = (row: Stored): FollowupTask => ({ ...JSON.parse(row.value_json), revision: row.revision })
const authorize = (actor: Actor) => { requirePerson(actor); requireSupplier(actor) }
const validDay = (value: unknown) => {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('INPUT', 'Use a valid YYYY-MM-DD contact date.', 400)
 return value
}
const people = async (db: D1Database) => (await db.prepare("SELECT id,display_name AS displayName FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY display_name,id").all<{ id: string; displayName: string }>()).results
const allTasks = async (db: D1Database) => (await db.prepare('SELECT value_json,revision FROM bw_followups ORDER BY id').all<Stored>()).results.map(parse)
const notes = {
 scope: 'Owner and admins act for reps until ACC-005/ACC-006 supply scoped staff assignments. Wholesale source tasks are refreshed by an explicit command; recorded quote mail failures create owned tasks automatically.',
 sources: 'Quote email failures, unanswered quotes, drafts older than seven elapsed days, approvals older than 24 elapsed hours and active accounts dormant for 90 elapsed days. Missing sources or unknown ages do not prove resolution.',
 contact: 'Contact attempts are manually recorded and do not send outreach; quote email delivery is recorded separately. Failed contact leaves work open unless a person explicitly records a separate resolution.',
 exceptions: 'Carrier delivery and payment exceptions are not recorded until SHIP-003, PAY-011 and AGT-005 provide verified sources.',
}
export async function readFollowups(env: Bindings, actor: Actor, params: URLSearchParams) {
 authorize(actor)
 const timeZone = await reportZone(env.DB), today = calendarDate(await now(), timeZone), on = params.has('on') ? validDay(params.get('on')) : today
 const [tasks, staff] = await Promise.all([allTasks(env.DB), people(env.DB)])
 return { tasks: tasks.filter(task => params.get('view') === 'all' || task.status === 'open' && task.nextContactDate <= on).sort((a, b) => a.priority - b.priority || a.nextContactDate.localeCompare(b.nextContactDate) || a.id.localeCompare(b.id)), people: staff, today, timeZone, on, notes }
}
function updateStatement(db: D1Database, before: FollowupTask, after: FollowupValue, revision: string) {
 return db.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(after), revision, before.id, before.revision)
}
export async function followupCommand(env: Bindings, actor: Actor, type: string, p: any) {
 authorize(actor)
 const at = (await now()).toISOString()
 if (type === 'followup.refresh') {
  const [sources, existing] = await Promise.all([followupSources(env.DB, new Date(at)), allTasks(env.DB)])
  const today = calendarDate(new Date(at), await reportZone(env.DB)), known = new Map(existing.map(task => [task.id, task]))
  const statements: D1PreparedStatement[] = [], created: string[] = [], closed: string[] = [], updated: string[] = []
  for (const source of sources.candidates) {
   const existingTask = known.get(source.id)
   if (existingTask) {
    if (existingTask.status === 'open' && (Object.keys(source) as (keyof FollowupSource)[]).some(key => existingTask[key] !== source[key])) {
     const { revision: previous, ...value } = existingTask
     statements.push(updateStatement(env.DB, existingTask, { ...value, ...source }, crypto.randomUUID()), changed(env.DB))
     updated.push(source.id)
    }
    continue
   }
   const accountRevision = sources.accountRevisions.get(source.accountId)
   if (!accountRevision) continue
   const revision = crypto.randomUUID(), value: FollowupValue = { ...source, createdAt: at, ownerId: actor.id, nextContactDate: today, status: 'open', contacts: [] }
   statements.push(env.DB.prepare('INSERT INTO bw_followups(id,account_id,value_json,revision) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?)').bind(value.id, value.accountId, JSON.stringify(value), revision, source.accountId, accountRevision), changed(env.DB))
   created.push(value.id)
  }
  for (const task of existing) {
   const resolution = sources.resolved.get(task.id)
   if (task.status === 'closed' || !resolution) continue
   const { revision: previous, ...value } = task, revision = crypto.randomUUID()
   statements.push(updateStatement(env.DB, task, { ...value, status: 'closed', resolution }, revision), changed(env.DB))
   closed.push(task.id)
  }
  const revision = crypto.randomUUID()
  statements.push(audit(env.DB, actor, 'followups', 'followup.refreshed', { revision, source: type, reason: `Explicit source reconciliation at ${at}: created ${created.length}, updated ${updated.length}, resolved ${closed.length}. Missing sources remain assigned; human-closed tasks stay closed.` }))
  await commit(env.DB, actor, statements)
  return { created, updated, closed, unknownAge: sources.unknownAge, ...(await readFollowups(env, actor, new URLSearchParams('view=all'))) }
 }
 if (type !== 'followup.update') fail('COMMAND', 'Unknown follow-up command.', 400)
 const id = text(p.id, 'Task ID', 240), expected = text(p.revision, 'Task revision', 100)
 const row = await env.DB.prepare('SELECT value_json,revision FROM bw_followups WHERE id=?').bind(id).first<Stored>()
 if (!row) fail('NOT_FOUND', 'Follow-up task not found.', 404)
 const before = parse(row)
 if (before.revision !== expected) fail('REVISION', 'The task changed. Refresh before updating it.')
 if (before.status === 'closed') fail('CLOSED', 'Resolved follow-up tasks remain closed.')
 const { revision: previous, ...value } = before
 const statements: D1PreparedStatement[] = []
 if (p.ownerId !== undefined) {
  value.ownerId = text(p.ownerId, 'Owner', 160)
  if (!(await people(env.DB)).some(person => person.id === value.ownerId)) fail('OWNER', 'Assign an active owner or admin.', 400)
  statements.push(env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')) THEN 1 ELSE 0 END").bind(value.ownerId))
 }
 if (p.nextContactDate !== undefined) value.nextContactDate = validDay(p.nextContactDate)
 if (p.contact !== undefined) {
  if (!['failed', 'reached'].includes(p.contact?.outcome)) fail('INPUT', 'Contact outcome must be failed or reached.', 400)
  value.contacts = [...value.contacts, { outcome: p.contact.outcome, note: text(p.contact.note, 'Contact note', 2000), by: actor.id, at }]
 }
 if (p.close === true) { value.status = 'closed'; value.resolution = text(p.resolution, 'Resolution', 2000) }
 if (p.ownerId === undefined && p.nextContactDate === undefined && p.contact === undefined && p.close !== true) fail('INPUT', 'Choose an assignment, contact date, contact or resolution.', 400)
 const revision = crypto.randomUUID()
 statements.push(updateStatement(env.DB, before, value, revision), changed(env.DB), audit(env.DB, actor, id, 'followup.updated', { accountId: value.accountId, revision, source: type, reason: `Manual task update at ${at}; owner ${value.ownerId}, next contact ${value.nextContactDate}, status ${value.status}.${p.contact ? ` Recorded ${p.contact.outcome} contact; no outreach sent.` : ''}${value.resolution ? ` Resolution: ${value.resolution}` : ''}` }))
 await commit(env.DB, actor, statements)
 return { ...value, revision }
}
