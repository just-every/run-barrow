// ACC-006: managers assign reps to named accounts and territories, with dated temporary coverage. One primary rep holds an
// account on any day; coverage adds holders without moving attribution. Ending or transferring an assignment takes effect
// immediately (the row ends now) and rewrites no earlier order, quote, commission snapshot or audit event.
import { audit, changed, commit } from './access'
import { fail, requirePerson, requireSupplier, supplierDate, text, type Actor } from './model'
import { now } from './clock'
import { repEpoch } from './rep-scope'

export type Assignment = {
 id: string; userId: string; kind: 'account' | 'territory' | 'rep'; target: string; coverage: boolean
 startsOn: string; endsOn: string | null; state: 'active' | 'ended'; revision: string; reason: string
 transferredFrom: string | null; createdBy: string; createdAt: string; updatedAt: string
}
const row = (r: any): Assignment => ({ id: r.id, userId: r.user_id, kind: r.kind, target: r.target, coverage: Boolean(r.coverage), startsOn: r.starts_on, endsOn: r.ends_on, state: r.state, revision: r.revision, reason: r.reason, transferredFrom: r.transferred_from, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at })

/** Owner/admin, or a sales manager whose grant covers every account (assignments move whole territories). */
function requireManager(actor: Actor) {
 requirePerson(actor); requireSupplier(actor)
 if (actor.staff && (actor.staff.role !== 'sales-manager' || actor.staff.accounts !== 'all')) fail('FORBIDDEN', 'Only owners, admins and all-account sales managers assign reps.', 403)
}
const day = (value: unknown, name: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : fail('INPUT', `${name} must be a real YYYY-MM-DD date (Eastern time).`, 400)

/** The active Native rep identity an assignment may name; nobody else can hold accounts through this table. */
async function activeRep(db: D1Database, userId: string) {
 const person = await db.prepare(`SELECT p.id,p.display_name,p.version FROM oa_operators p JOIN bw_staff_members g ON g.user_id=p.id
  WHERE p.id=? AND p.status='active' AND p.role='member' AND g.state='active' AND g.native_version=p.version AND json_extract(g.policy_json,'$.role')='rep'`).bind(userId).first<{ id: string; display_name: string; version: number }>()
 return person ?? fail('INPUT', 'Choose an active Native staff member whose grant is the rep role.', 400)
}
const repGuard = (db: D1Database, person: { id: string; version: number }) => db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators p JOIN bw_staff_members g ON g.user_id=p.id
 WHERE p.id=? AND p.status='active' AND p.version=? AND g.state='active' AND g.native_version=p.version AND json_extract(g.policy_json,'$.role')='rep') THEN 1 ELSE 0 END`).bind(person.id, person.version)
const epochGuard = (db: D1Database, epoch: number) => db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT value FROM bw_rep_epoch WHERE singleton=1)=? THEN 1 ELSE 0 END').bind(epoch)

async function accountsOf(db: D1Database, kind: string, target: string): Promise<string[]> {
 return (await db.prepare(kind === 'account' ? 'SELECT id FROM bw_accounts WHERE id=?' : "SELECT id FROM bw_accounts WHERE json_extract(value_json,'$.territory')=?").bind(target).all<{ id: string }>()).results.map(r => r.id)
}
/** A primary assignment must leave exactly one primary rep for each account on every day it covers. */
async function refuseOverlap(db: D1Database, userId: string, kind: string, target: string, startsOn: string, endsOn: string | null, ignore?: string) {
 const mine = new Set(await accountsOf(db, kind, target))
 if (!mine.size) fail('INPUT', kind === 'territory' ? 'No account carries that exact territory name.' : 'Choose an existing account.', 400)
 const others = (await db.prepare("SELECT * FROM bw_rep_assignments WHERE coverage=0 AND state='active' AND id<>? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)").bind(ignore ?? '', endsOn ?? '9999-12-31', startsOn).all<any>()).results
 for (const other of others) {
  if ((await accountsOf(db, other.kind, other.target)).some(id => mine.has(id))) fail('ASSIGNMENT_OVERLAP', 'Another rep is already the primary rep for part of this scope on those dates. Transfer or end that assignment first.')
 }
}

export async function readRepAssignments(env: { DB: D1Database }, actor: Actor) {
 requirePerson(actor); requireSupplier(actor)
 const today = supplierDate(await now()), manager = !actor.staff || actor.staff.role === 'sales-manager' && actor.staff.accounts === 'all'
 if (!manager && actor.staff?.role !== 'rep') fail('FORBIDDEN', 'Your role does not read rep assignments.', 403)
 const rows = (await env.DB.prepare(`SELECT x.*,p.display_name,
  CASE WHEN x.state='active' AND x.starts_on<=? AND (x.ends_on IS NULL OR x.ends_on>=?) THEN 1 ELSE 0 END AS effective
  FROM bw_rep_assignments x LEFT JOIN oa_operators p ON p.id=x.user_id WHERE ?=1 OR x.user_id=? ORDER BY x.created_at DESC,x.id`).bind(today, today, manager ? 1 : 0, actor.id).all<any>()).results
 const reps = manager ? (await env.DB.prepare(`SELECT p.id AS userId,p.display_name AS name FROM oa_operators p JOIN bw_staff_members g ON g.user_id=p.id
  WHERE p.status='active' AND p.role='member' AND g.state='active' AND g.native_version=p.version AND json_extract(g.policy_json,'$.role')='rep' ORDER BY p.display_name,p.id`).all<any>()).results : []
 const territories = manager ? (await env.DB.prepare("SELECT DISTINCT json_extract(value_json,'$.territory') AS name FROM bw_accounts WHERE json_type(value_json,'$.territory')='text' AND length(json_extract(value_json,'$.territory'))>0 ORDER BY name").all<{ name: string }>()).results.map(r => r.name) : []
 return { today, timeZone: 'America/New_York', manager, assignments: rows.map(r => ({ ...row(r), name: r.display_name ?? null, effective: Boolean(r.effective) })), reps, territories,
  notes: { rule: 'A rep holds an account only through a dated assignment, temporary coverage, or an exact account the owner listed on the grant. Profile rep and territory text grants nothing. Dates are inclusive calendar days in Eastern time.',
   attribution: 'Transfers change future access, quote notices and new-order commission attribution from the transfer moment; earlier orders, commission snapshots and audit history are never rewritten. Coverage never moves commission attribution.' } }
}

export async function repAssignmentCommand(env: { DB: D1Database }, actor: Actor, type: string, p: any) {
 requireManager(actor)
 const at = (await now()).toISOString(), today = supplierDate(new Date(at)), reason = text(p.reason, 'Reason', 1000)
 const db = env.DB, epoch = await repEpoch(db)
 if (type === 'rep.assign' || type === 'rep.cover') {
  const coverage = type === 'rep.cover', rep = await activeRep(db, text(p.userId, 'Rep', 160))
  const kind = text(p.kind, 'Kind', 20), target = text(p.target, 'Target', 160)
  if (!(coverage ? ['account', 'territory', 'rep'] : ['account', 'territory']).includes(kind)) fail('INPUT', coverage ? 'Coverage names an account, a territory or another rep.' : 'Assign an account or a territory.', 400)
  const startsOn = p.startsOn === undefined ? today : day(p.startsOn, 'Starts on'), endsOn = p.endsOn === undefined || p.endsOn === null ? null : day(p.endsOn, 'Ends on')
  if (coverage && !endsOn) fail('INPUT', 'Temporary coverage needs an end date.', 400)
  if (endsOn && endsOn < startsOn) fail('INPUT', 'Ends on cannot be before Starts on.', 400)
  if (endsOn && endsOn < today) fail('INPUT', 'An assignment cannot end before today (Eastern time).', 400)
  if (kind === 'rep') {
   if (target === rep.id) fail('INPUT', 'A rep cannot cover themselves.', 400)
   await activeRep(db, target)
  } else if (coverage) {
   if (!(await accountsOf(db, kind, target)).length) fail('INPUT', kind === 'territory' ? 'No account carries that exact territory name.' : 'Choose an existing account.', 400)
  } else await refuseOverlap(db, rep.id, kind, target, startsOn, endsOn)
  const id = crypto.randomUUID(), revision = crypto.randomUUID()
  await commit(db, actor, [repGuard(db, rep), epochGuard(db, epoch),
   db.prepare("INSERT INTO bw_rep_assignments(id,user_id,kind,target,coverage,starts_on,ends_on,state,revision,reason,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'active',?,?,?,?,?)").bind(id, rep.id, kind, target, coverage ? 1 : 0, startsOn, endsOn, revision, reason, actor.id, at, at),
   audit(db, actor, id, coverage ? 'rep.covered' : 'rep.assigned', { ...(kind === 'account' ? { accountId: target } : {}), revision, source: type, reason: `${coverage ? 'Temporary coverage' : 'Primary assignment'} of ${kind} ${target} to ${rep.display_name} (${rep.id}) from ${startsOn} through ${endsOn ?? 'until ended'}: ${reason}` })])
  return row(await db.prepare('SELECT * FROM bw_rep_assignments WHERE id=?').bind(id).first())
 }
 if (type === 'rep.end' || type === 'rep.transfer') {
  const before = await db.prepare('SELECT * FROM bw_rep_assignments WHERE id=?').bind(text(p.id, 'Assignment', 80)).first<any>()
  if (!before) fail('NOT_FOUND', 'Assignment not found.', 404)
  if (typeof p.revision !== 'string' || p.revision !== before.revision) fail('CHANGED', 'This assignment changed. Refresh it before continuing.')
  if (before.state !== 'active') fail('CHANGED', 'This assignment has already ended.')
  const revision = crypto.randomUUID()
  const end = db.prepare("UPDATE bw_rep_assignments SET state='ended',revision=?,updated_at=? WHERE id=? AND revision=? AND state='active'").bind(revision, at, before.id, before.revision)
  const subject = before.kind === 'account' ? { accountId: before.target } : {}
  if (type === 'rep.end') {
   await commit(db, actor, [epochGuard(db, epoch), end, changed(db), audit(db, actor, before.id, 'rep.ended', { ...subject, revision, source: type, reason: `Ended ${before.coverage ? 'coverage' : 'assignment'} of ${before.kind} ${before.target} for ${before.user_id} immediately: ${reason}` })])
   return row(await db.prepare('SELECT * FROM bw_rep_assignments WHERE id=?').bind(before.id).first())
  }
  if (before.coverage) fail('INPUT', 'Only a primary assignment transfers; end coverage and cover again instead.', 400)
  const to = await activeRep(db, text(p.toUserId, 'New rep', 160))
  if (to.id === before.user_id) fail('INPUT', 'Choose a different rep.', 400)
  const nextId = crypto.randomUUID(), nextRevision = crypto.randomUUID(), startsOn = before.starts_on > today ? before.starts_on : today
  await refuseOverlap(db, to.id, before.kind, before.target, startsOn, before.ends_on, before.id)
  await commit(db, actor, [repGuard(db, to), epochGuard(db, epoch), end, changed(db),
   db.prepare("INSERT INTO bw_rep_assignments(id,user_id,kind,target,coverage,starts_on,ends_on,state,revision,reason,transferred_from,created_by,created_at,updated_at) VALUES(?,?,?,?,0,?,?,'active',?,?,?,?,?,?)").bind(nextId, to.id, before.kind, before.target, startsOn, before.ends_on, nextRevision, reason, before.id, actor.id, at, at),
   audit(db, actor, nextId, 'rep.transferred', { ...subject, revision: nextRevision, source: type, reason: `Transferred ${before.kind} ${before.target} from ${before.user_id} to ${to.display_name} (${to.id}) effective ${startsOn}; earlier orders, quotes and commission snapshots keep their recorded rep: ${reason}` })])
  return row(await db.prepare('SELECT * FROM bw_rep_assignments WHERE id=?').bind(nextId).first())
 }
 fail('COMMAND', 'Unknown rep assignment command.', 404)
}

