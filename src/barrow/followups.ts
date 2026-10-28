import { reconcilePaymentPromises } from './payment-promises'
import { planResponseResolution, type FollowupPlan } from './account-followup'
import { applicationReviewers } from './application-reviewers'
import { staffTaskAllowed } from './staff-access'
import { readStaffGrant,staffGuard } from './staff-policy'
import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { now } from './clock'
import { followupSources, type FollowupSource } from './followup-sources'
import { applicationTaskStatements, escalatedView } from './application-followup'
import { fail, requirePerson, requireSupplier, text, type Actor } from './model'
import { calendarDate, reportZone } from './report-zone'
import type { CardPayment } from './card-model'

export type FollowupContact = { outcome: 'failed' | 'reached'; note: string; by: string; at: string }
export type FollowupValue = FollowupSource & { createdAt: string; ownerId: string; nextContactDate: string; status: 'open' | 'closed'; resolution?: string; contacts: FollowupContact[]; plan?: FollowupPlan }
export type FollowupTask = FollowupValue & { revision: string }
type Stored = { value_json: string; revision: string }
const parse = (row: Stored): FollowupTask => ({ ...JSON.parse(row.value_json), revision: row.revision })
const authorize = (actor: Actor) => { requirePerson(actor); requireSupplier(actor) }
const validDay = (value: unknown) => {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('INPUT', 'Use a valid YYYY-MM-DD contact date.', 400)
 return value
}
const people = async (db: D1Database) => (await db.prepare("SELECT id,display_name AS displayName FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY display_name,id").all<{ id: string; displayName: string }>()).results
// AUTO-002: an approval task goes only to someone who can approve the order: an owner, an admin, or a sales manager or
// operations person holding every warehouse (reps still read it in their queue).
const approves=(grant:{role:string;warehouses:unknown})=>['sales-manager','operations'].includes(grant.role)&&grant.warehouses==='all'
async function taskPeople(db:D1Database,task:{accountId:string;kind:string}) {
 const native=(await db.prepare("SELECT id,email,role,version,display_name AS displayName FROM oa_operators WHERE status='active'").all<any>()).results
 const allowed=[];for(const p of native){if(['owner','admin'].includes(p.role)){allowed.push(p);continue}const grant=await readStaffGrant(db,{...p,agent:false});if(grant&&staffTaskAllowed({...p,agent:false,staff:grant},task)&&(task.kind!=='approval'||approves(grant)))allowed.push({...p,grant})}return allowed
}
const installationOwner=async(env:Bindings)=>(await env.DB.prepare("SELECT id FROM oa_operators WHERE status='active' AND role='owner' ORDER BY email=? DESC,created_at,id LIMIT 1").bind(env.OWNER_EMAIL??'').first<{id:string}>())?.id
const allTasks = async (db: D1Database) => (await db.prepare('SELECT value_json,revision FROM bw_followups ORDER BY id').all<Stored>()).results.map(parse)
const notes = {
 scope: 'Your role and current account access determine which follow-ups you can read, assign and resolve. Refresh reconciles current wholesale records; recorded quote email failures create owned tasks automatically.',
 sources: 'Verified card payment exceptions, quote email failures, unanswered quotes, drafts older than seven elapsed days, approvals older than 24 elapsed hours and active accounts dormant for 90 elapsed days. Missing sources or unknown ages do not prove resolution.',
 contact: 'Contact attempts are manually recorded and do not send outreach; quote email delivery is recorded separately. Failed contact leaves work open unless a person explicitly records a separate resolution.',
 exceptions: 'Verified card payment exceptions remain assigned until a recorded provider resolution. Other payment and carrier delivery exceptions are not recorded.',
}
export async function readFollowups(env: Bindings, actor: Actor, params: URLSearchParams) {
 authorize(actor)
 const timeZone = await reportZone(env.DB), today = calendarDate(await now(), timeZone), on = params.has('on') ? validDay(params.get('on')) : today
 const tasks=(await allTasks(env.DB)).filter(task=>staffTaskAllowed(actor,task))
 const candidates=actor.staff?(await Promise.all(tasks.map(task=>taskPeople(env.DB,task)))).flat():[
  ...await people(env.DB),
  ...(tasks.some(task=>task.kind==='application')?(await applicationReviewers(env.DB)).map(person=>({id:person.id,displayName:person.name})):[]),
 ]
 const staff=Array.from(new Map(candidates.map(person=>[person.id,{id:person.id,displayName:person.displayName}])).values())
 // AUTO-001: an escalated application task stays due from its escalation day, whatever its next contact date says.
 return { canPlan: !actor.staff || ['rep','sales-manager'].includes(actor.staff.role), tasks: tasks.map(task => escalatedView(task, today)).filter(task => params.get('view') === 'all' || task.status === 'open' && (task.nextContactDate <= on || !!task.escalated && task.escalated.since <= on)).sort((a, b) => a.priority - b.priority || a.nextContactDate.localeCompare(b.nextContactDate) || a.id.localeCompare(b.id)), people: staff, today, timeZone, on, notes }
}
function updateStatement(db: D1Database, before: FollowupTask, after: FollowupValue, revision: string) {
 return db.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(after), revision, before.id, before.revision)
}
export async function followupCommand(env: Bindings, actor: Actor, type: string, p: any) {
 authorize(actor)
 const at = (await now()).toISOString()
 if (type === 'followup.refresh') {
  if(!actor.staff||actor.staff.role==='finance')await reconcilePaymentPromises(env,actor)
  const [sources, existing] = await Promise.all([followupSources(env.DB, new Date(at)), allTasks(env.DB)])
  const today = calendarDate(new Date(at), await reportZone(env.DB)), known = new Map(existing.map(task => [task.id, task]))
  const statements: D1PreparedStatement[] = [], created: string[] = [], closed: string[] = [], updated: string[] = []
  for (const source of sources.candidates) {
   if(!staffTaskAllowed(actor,source))continue
   const existingTask = known.get(source.id)
   if (existingTask) {
    if (existingTask.status === 'open' && (Object.keys(source) as (keyof FollowupSource)[]).some(key => existingTask[key] !== source[key])) {
     const { revision: previous, ...value } = existingTask
     statements.push(updateStatement(env.DB, existingTask, { ...value, ...source }, crypto.randomUUID()), changed(env.DB))
     updated.push(source.id)
    }
    continue
   }
   if (source.kind === 'application') {
    // An application verified before its task existed gets the same routed owner task.
    const app = await env.DB.prepare('SELECT id,value_json FROM bw_applications WHERE id=?').bind(source.sourceId).first<{ id: string; value_json: string }>()
    if (app) { statements.push(...await applicationTaskStatements(env.DB, app, 'submitted', at, actor.id)); created.push(source.id) }
    continue
   }
   const accountRevision = sources.accountRevisions.get(source.accountId)
   if (!accountRevision) continue
   const ownerId = source.kind === 'approval' && actor.staff && !approves(actor.staff) ? await installationOwner(env) ?? actor.id : actor.id
   const revision = crypto.randomUUID(), value: FollowupValue = { ...source, createdAt: at, ownerId, nextContactDate: today, status: 'open', contacts: [] }
   statements.push(env.DB.prepare('INSERT INTO bw_followups(id,account_id,value_json,revision) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?)').bind(value.id, value.accountId, JSON.stringify(value), revision, source.accountId, accountRevision), changed(env.DB))
   created.push(value.id)
  }
  for (const task of existing) {
   if(!staffTaskAllowed(actor,task))continue
   const resolution = task.plan ? await planResponseResolution(env.DB,task) : sources.resolved.get(task.id)
   if (task.status === 'closed' || !resolution) continue
   const { revision: previous, ...value } = task, revision = crypto.randomUUID()
   statements.push(updateStatement(env.DB, task, { ...value, status: 'closed', resolution }, revision), changed(env.DB))
   closed.push(task.id)
  }
  const revision = crypto.randomUUID()
  statements.push(audit(env.DB, actor, 'followups', 'followup.refreshed', { revision, source: type, reason: `Explicit source reconciliation at ${at}: created ${created.length}, updated ${updated.length}, resolved ${closed.length}. Missing sources remain assigned; human-closed tasks stay closed.` }))
  await commit(env.DB, actor, statements)
  return { created, updated, closed, unknownAge: actor.staff?['Unknown-age source records remain unresolved; owner review can inspect all source diagnostics.']:sources.unknownAge, ...(await readFollowups(env, actor, new URLSearchParams('view=all'))) }
 }
 if (type !== 'followup.update') fail('COMMAND', 'Unknown follow-up command.', 400)
 const id = text(p.id, 'Task ID', 240), expected = text(p.revision, 'Task revision', 100)
 const row = await env.DB.prepare('SELECT value_json,revision FROM bw_followups WHERE id=?').bind(id).first<Stored>()
 if (!row) fail('NOT_FOUND', 'Follow-up task not found.', 404)
 const before = parse(row)
 if(!staffTaskAllowed(actor,before))fail('NOT_FOUND','Follow-up task not found.',404)
 if (before.revision !== expected) fail('REVISION', 'The task changed. Refresh before updating it.')
 if (before.status === 'closed') fail('CLOSED', 'Resolved follow-up tasks remain closed.')
 const { revision: previous, ...value } = before
 const statements: D1PreparedStatement[] = []
 if (p.ownerId !== undefined) {
  value.ownerId = text(p.ownerId, 'Owner', 160)
  const recipient=(await taskPeople(env.DB,before)).find(person=>person.id===value.ownerId);if(!recipient)fail('OWNER','Assign a current person with authority for this complete task.',400)
  statements.push(recipient.grant?staffGuard(env.DB,recipient.grant):env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin')) THEN 1 ELSE 0 END").bind(recipient.id,recipient.version))
 }
 if (p.nextContactDate !== undefined) value.nextContactDate = validDay(p.nextContactDate)
 if (p.contact !== undefined) {
  if (!['failed', 'reached'].includes(p.contact?.outcome)) fail('INPUT', 'Contact outcome must be failed or reached.', 400)
  value.contacts = [...value.contacts, { outcome: p.contact.outcome, note: text(p.contact.note, 'Contact note', 2000), by: actor.id, at }]
 }
 if (p.close === true) {
  if(before.kind==='payment-promise')fail('PROMISE_RESOLUTION','Resolve or withdraw the promise through its finance decision door; contact records cannot close it.',409)
  if (before.kind === 'card-payment') {
   const payment = await env.DB.prepare('SELECT value_json,revision FROM bw_card_payments WHERE id=? AND account_id=?').bind(before.sourceId, before.accountId).first<Stored>()
   const exception = payment ? (JSON.parse(payment.value_json) as CardPayment).exception : undefined
   if (!exception?.verifiedAt || !exception.resolvedAt || !exception.resolution) fail('PAYMENT_UNRESOLVED', 'This card payment exception needs a verified provider resolution before it can close.', 409)
   value.resolution = exception.resolution
   statements.push(env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_card_payments WHERE id=? AND account_id=? AND revision=?) THEN 1 ELSE 0 END').bind(before.sourceId, before.accountId, payment!.revision))
  } else value.resolution = text(p.resolution, 'Resolution', 2000)
  value.status = 'closed'
 }
 if (p.ownerId === undefined && p.nextContactDate === undefined && p.contact === undefined && p.close !== true) fail('INPUT', 'Choose an assignment, contact date, contact or resolution.', 400)
 const revision = crypto.randomUUID()
 statements.push(updateStatement(env.DB, before, value, revision), changed(env.DB), audit(env.DB, actor, id, 'followup.updated', { accountId: value.accountId, revision, source: type, reason: `Manual task update at ${at}; owner ${value.ownerId}, next contact ${value.nextContactDate}, status ${value.status}.${p.contact ? ` Recorded ${p.contact.outcome} contact; no outreach sent.` : ''}${value.resolution ? ` Resolution: ${value.resolution}` : ''}` }))
 await commit(env.DB, actor, statements)
 return { ...value, revision }
}
