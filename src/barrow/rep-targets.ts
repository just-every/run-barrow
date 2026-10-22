// RPT-005 activity goals are human instructions, never commission rules or automatic actions.
import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { now } from './clock'
import { fail, integer, requirePerson, requireSupplier, text, type Actor } from './model'
import { activeRepSql } from './rep-scope'
import { reportZone } from './report-zone'
import { requireStaffReport } from './staff-policy'

export type RepTarget = {
 id: string; userId: string; from: string; to: string; timeZone: string
 completedVisits: number; newAccounts: number; revision: string; reason: string
 createdBy: string; createdAt: string; updatedBy: string; updatedAt: string
}
export function performanceDay(value: unknown, name: string): string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('INPUT', `${name} must be a real YYYY-MM-DD date.`, 400)
 return value
}
const target = (row: any): RepTarget => ({ id: row.id, userId: row.user_id, from: row.from_on, to: row.to_on, timeZone: row.time_zone,
 completedVisits: row.completed_visits, newAccounts: row.new_accounts, revision: row.revision, reason: row.reason,
 createdBy: row.created_by, createdAt: row.created_at, updatedBy: row.updated_by, updatedAt: row.updated_at })
export const canEditRepTargets = (actor: Actor) => !actor.agent && ['owner', 'admin'].includes(actor.role)

/** Reads exact Native identities; fixed commission labels never identify the owner of a goal. */
export async function readRepTargets(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireStaffReport(actor, 'commissions', params); requireSupplier(actor)
 const own = actor.staff?.role === 'rep', manager = canEditRepTargets(actor) || actor.staff?.role === 'sales-manager' && actor.staff.accounts === 'all'
 if (!own && !manager) fail('FORBIDDEN', 'Only owners, admins, all-account sales managers and the exact rep read activity goals.', 403)
 if (params.getAll('userId').length > 1 || params.getAll('from').length > 1 || params.getAll('to').length > 1) fail('INPUT', 'Choose one exact rep and period.', 400)
 const requested = params.get('userId') ?? ''
 if (own && requested && requested !== actor.id) fail('FORBIDDEN', 'A rep reads only their own activity goals.', 403)
 const userId = own ? actor.id : requested, from = params.has('from') ? performanceDay(params.get('from'), 'From') : '', to = params.has('to') ? performanceDay(params.get('to'), 'To') : ''
 if (from && to && from > to) fail('INPUT', 'From must not be after To.', 400)
 const rows = await env.DB.prepare(`SELECT * FROM bw_rep_targets WHERE (?='' OR user_id=?) AND (?='' OR from_on=?) AND (?='' OR to_on=?) ORDER BY from_on DESC,to_on,user_id,id`).bind(userId, userId, from, from, to, to).all<any>()
 return rows.results.map(target)
}

export async function saveRepTarget(env: Bindings, actor: Actor, p: any): Promise<RepTarget> {
 requirePerson(actor); requireSupplier(actor)
 if (!canEditRepTargets(actor)) fail('FORBIDDEN', 'Only an owner or admin can set activity goals. Sales managers have no target editing authority.', 403)
 if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(key => !['userId', 'from', 'to', 'completedVisits', 'newAccounts', 'revision', 'reason'].includes(key))) fail('INPUT', 'Use the declared activity goal fields.', 400)
 const userId = text(p.userId, 'Exact Native rep user ID', 160), from = performanceDay(p.from, 'From'), to = performanceDay(p.to, 'To')
 if (from > to) fail('INPUT', 'From must not be after To.', 400)
 if (p.revision !== null && (typeof p.revision !== 'string' || !p.revision.length || p.revision.length > 160)) fail('INPUT', 'Supply the current revision, or null for a new goal.', 400)
 const reason = text(p.reason, 'Goal reason', 1000), completedVisits = integer(p.completedVisits, 'Completed visit goal'), newAccounts = integer(p.newAccounts, 'New account goal')
 const db = env.DB, person = await db.prepare(`SELECT p.id,p.version,g.revision AS grant_revision FROM oa_operators p JOIN bw_staff_members g ON g.user_id=p.id WHERE p.id=? AND ${activeRepSql('p')}
  AND NOT EXISTS(SELECT 1 FROM bw_accounts a WHERE lower(trim(json_extract(a.value_json,'$.email')))=lower(trim(p.email)))`).bind(userId).first<{ id: string; version: number; grant_revision: string }>()
 if (!person) fail('INPUT', 'Choose an active Native staff member with a current rep grant.', 400)
 const prior = await db.prepare('SELECT * FROM bw_rep_targets WHERE user_id=? AND from_on=? AND to_on=?').bind(userId, from, to).first<any>()
 if (p.revision !== (prior?.revision ?? null)) fail('CHANGED', 'This activity goal changed. Refresh before saving.')
 const at = (await now()).toISOString(), timeZone = prior?.time_zone ?? await reportZone(db), id = prior?.id ?? crypto.randomUUID(), revision = crypto.randomUUID()
 const record: RepTarget = { id, userId, from, to, timeZone, completedVisits, newAccounts, revision, reason, createdBy: prior?.created_by ?? actor.id, createdAt: prior?.created_at ?? at, updatedBy: actor.id, updatedAt: at }
 const personGuard = db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators p JOIN bw_staff_members g ON g.user_id=p.id WHERE p.id=? AND p.version=? AND g.revision=? AND ${activeRepSql('p')}
  AND NOT EXISTS(SELECT 1 FROM bw_accounts a WHERE lower(trim(json_extract(a.value_json,'$.email')))=lower(trim(p.email)))) THEN 1 ELSE 0 END`).bind(userId, person.version, person.grant_revision)
 const guard = db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_rep_targets WHERE user_id=? AND from_on=? AND to_on=?),'')=? THEN 1 ELSE 0 END").bind(userId, from, to, prior?.revision ?? '')
 const write = prior ? db.prepare('UPDATE bw_rep_targets SET completed_visits=?,new_accounts=?,revision=?,reason=?,updated_by=?,updated_at=? WHERE id=? AND revision=?').bind(completedVisits, newAccounts, revision, reason, actor.id, at, id, prior.revision)
  : db.prepare('INSERT INTO bw_rep_targets(id,user_id,from_on,to_on,time_zone,completed_visits,new_accounts,revision,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, userId, from, to, timeZone, completedVisits, newAccounts, revision, reason, actor.id, at, actor.id, at)
 await commit(db, actor, [personGuard, guard, write, changed(db), audit(db, actor, id, 'rep.target-saved', { revision, source: 'rep.target.save', reason: `Activity goals for Native rep ${userId}, inclusive ${from} to ${to} in ${timeZone}: completed visits ${completedVisits}; new accounts ${newAccounts}. No compensation effect or automatic action. ${reason}` })])
 return record
}
