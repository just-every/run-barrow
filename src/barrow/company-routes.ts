// ACC-007: company administrators set amount/location approval routes with ordered steps, dated delegation and timed
// escalation. A route is chosen when an order or accepted quote needs company approval and is frozen on that order, so a
// later policy revision never changes an order already waiting. ACC-002's person/location limits and distinct-person
// release stay the floor: every step approver still needs the approver right and a limit that covers the order.
import { audit, changed, commit } from './access'
import { now } from './clock'
import { requireCompanyRight } from './company-policy'
import { fail, requirePerson, supplierDate, text, type Actor, type Order } from './model'

export type RouteStep = { label: string; approvers: string[]; escalateAfterHours: number | null; escalateTo: string[] }
export type RouteRule = { id: string; name: string; locations: 'all' | string[]; aboveCents: number; steps: RouteStep[] }
export type RoutePolicy = { rules: RouteRule[] }
export type OrderRoute = {
 policyRevision: string; ruleId: string; name: string; steps: RouteStep[]; stepRequestedAt: string
 decided: { step: number; label: string; by: string; at: string; via: 'approver' | 'delegate' | 'escalation'; delegatedFrom?: string }[]
}
const dayPattern = /^\d{4}-\d{2}-\d{2}$/
const day = (value: unknown, name: string) => typeof value === 'string' && dayPattern.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : fail('INPUT', `${name} must be a real YYYY-MM-DD date (Eastern time).`, 400)
const whole = (value: unknown, name: string, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : fail('ROUTE_INPUT', `${name} must be a whole number between ${min} and ${max}.`, 400)

/** The company's current approvers: active, signed-in members holding the approver right. */
export async function companyApprovers(db: D1Database, accountId: string) {
 return (await db.prepare(`SELECT m.user_id AS userId,m.display_name AS name,m.email FROM bw_company_members m JOIN oa_operators p ON p.id=m.user_id
  WHERE m.account_id=? AND m.state='active' AND m.erased_at IS NULL AND p.status='active' AND p.role='member'
  AND EXISTS(SELECT 1 FROM json_each(m.policy_json,'$.rights') r WHERE r.value='approver') ORDER BY m.display_name,m.user_id`).bind(accountId).all<{ userId: string; name: string; email: string }>()).results
}
async function manage(db: D1Database, actor: Actor, accountId: string) {
 requirePerson(actor)
 if (!await db.prepare('SELECT 1 FROM bw_accounts WHERE id=?').bind(accountId).first()) fail('NOT_FOUND', 'Trade account not found.', 404)
 return requireCompanyRight(db, actor, accountId, 'administrator')
}
const ids = (value: unknown, name: string, approvers: Set<string>, min = 1) => {
 if (!Array.isArray(value) || value.length < min || value.length > 10 || new Set(value).size !== value.length || value.some(id => typeof id !== 'string' || !approvers.has(id))) fail('ROUTE_INPUT', `${name} must list distinct current company approvers (one to ten).`, 400)
 return value as string[]
}
/** Every named person is a current approver of this company; locations are this company's ship-tos. */
export async function validateRoutePolicy(db: D1Database, accountId: string, input: any): Promise<RoutePolicy> {
 if (!input || !Array.isArray(input.rules) || input.rules.length > 20) fail('ROUTE_INPUT', 'Supply up to twenty approval rules.', 400)
 const approvers = new Set((await companyApprovers(db, accountId)).map(row => row.userId))
 const shipTos = new Set((await db.prepare("SELECT id FROM bw_locations WHERE account_id=? AND kind='ship-to' AND archived=0").bind(accountId).all<{ id: string }>()).results.map(row => row.id))
 const seen = new Set<string>()
 return { rules: input.rules.map((raw: any): RouteRule => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['id', 'name', 'locations', 'aboveCents', 'steps'].includes(key))) fail('ROUTE_INPUT', 'A rule has an ID, name, locations, amount threshold and steps.', 400)
  const id = text(raw.id, 'Rule ID', 40)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || seen.has(id)) fail('ROUTE_INPUT', 'Rule IDs are unique letters, digits, dot, dash or underscore.', 400)
  seen.add(id)
  const locations = raw.locations === 'all' ? 'all' as const : Array.isArray(raw.locations) && raw.locations.length && new Set(raw.locations).size === raw.locations.length && raw.locations.every((value: unknown) => typeof value === 'string' && shipTos.has(value)) ? [...raw.locations] as string[] : fail('ROUTE_INPUT', 'Choose all locations or current ship-to locations of this company.', 400)
  if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > 5) fail('ROUTE_INPUT', 'A rule needs one to five sequential steps.', 400)
  return { id, name: text(raw.name, 'Rule name', 80), locations, aboveCents: whole(raw.aboveCents, 'Amount threshold (USD cents)', 0, 10_000_000_000), steps: raw.steps.map((step: any): RouteStep => {
   if (!step || typeof step !== 'object' || Array.isArray(step) || Object.keys(step).some(key => !['label', 'approvers', 'escalateAfterHours', 'escalateTo'].includes(key))) fail('ROUTE_INPUT', 'A step has a label, approvers and optional escalation.', 400)
   const hours = step.escalateAfterHours === undefined || step.escalateAfterHours === null ? null : whole(step.escalateAfterHours, 'Escalate after (hours)', 1, 720)
   const escalateTo = hours === null ? (step.escalateTo === undefined || Array.isArray(step.escalateTo) && !step.escalateTo.length ? [] : fail('ROUTE_INPUT', 'Escalation people need an escalation time.', 400)) : ids(step.escalateTo, 'Escalation people', approvers)
   return { label: text(step.label, 'Step label', 80), approvers: ids(step.approvers, 'Step approvers', approvers), escalateAfterHours: hours, escalateTo }
  }) }
 }) }
}
async function currentPolicy(db: D1Database, accountId: string) {
 const row = await db.prepare('SELECT policy_json,revision FROM bw_company_routes WHERE account_id=?').bind(accountId).first<{ policy_json: string; revision: string }>()
 return row ? { policy: JSON.parse(row.policy_json) as RoutePolicy, revision: row.revision } : { policy: { rules: [] } as RoutePolicy, revision: null }
}
/** The most specific matching rule: highest threshold the total exceeds, then a named ship-to over all locations. */
export function selectRule(policy: RoutePolicy, shipToId: string | undefined, totalCents: number) {
 return policy.rules.filter(rule => totalCents > rule.aboveCents && (rule.locations === 'all' || Boolean(shipToId && rule.locations.includes(shipToId))))
  .sort((a, b) => b.aboveCents - a.aboveCents || Number(Array.isArray(b.locations)) - Number(Array.isArray(a.locations)) || (a.id < b.id ? -1 : 1))[0]
}
/** The route a company-approval request starts with, frozen on the order; null keeps ACC-002's single approver. */
export async function startRoute(db: D1Database, order: Pick<Order, 'accountId' | 'totalCents' | 'shipTo'>, at: string): Promise<OrderRoute | null> {
 const { policy, revision } = await currentPolicy(db, order.accountId), rule = selectRule(policy, order.shipTo?.id, order.totalCents)
 return rule ? { policyRevision: revision!, ruleId: rule.id, name: rule.name, steps: rule.steps, decided: [], stepRequestedAt: at } : null
}

export async function readCompanyRoutes(db: D1Database, actor: Actor, accountId: string) {
 await manage(db, actor, accountId)
 const { policy, revision } = await currentPolicy(db, accountId), today = supplierDate(await now())
 const delegations = (await db.prepare('SELECT * FROM bw_company_delegations WHERE account_id=? ORDER BY created_at DESC,id').bind(accountId).all<any>()).results
 const versions = (await db.prepare('SELECT revision,saved_by,saved_at,reason FROM bw_company_route_versions WHERE account_id=? ORDER BY saved_at DESC,rowid DESC').bind(accountId).all<any>()).results
 return { policy, revision, today, approvers: await companyApprovers(db, accountId), versions: versions.map(row => ({ revision: row.revision, savedBy: row.saved_by, savedAt: row.saved_at, reason: row.reason })),
  delegations: delegations.map(row => ({ id: row.id, delegatorId: row.delegator_id, delegateId: row.delegate_id, startsOn: row.starts_on, endsOn: row.ends_on, state: row.state, revision: row.revision, reason: row.reason, effective: row.state === 'active' && row.starts_on <= today && row.ends_on >= today })),
  notes: { rule: 'When an order or accepted quote needs company approval, the most specific matching rule is frozen on it. Steps run in order; each needs a different current approver (the person who prepared the order never counts), who must hold the approver right and a limit that covers the order. A delegate holding the approver right may decide for an absent approver within dated delegation. After the escalation time the step’s escalation people may decide it too.', versions: 'Each save keeps its revision; orders already waiting keep the revision they started with.' } }
}

export async function companyRouteCommand(env: { DB: D1Database }, actor: Actor, type: string, p: any) {
 const accountId = text(p.accountId, 'Trade account'), db = env.DB
 await manage(db, actor, accountId)
 const reason = text(p.reason, 'Reason', 1000), at = (await now()).toISOString(), today = supplierDate(new Date(at)), revision = crypto.randomUUID()
 if (type === 'company.route.save') {
  const prior = await currentPolicy(db, accountId)
  if ((p.revision ?? null) !== prior.revision) fail('CHANGED', 'The approval policy changed. Refresh it before saving.')
  const policy = await validateRoutePolicy(db, accountId, { rules: p.rules })
  await commit(db, actor, [
   db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_company_routes WHERE account_id=?),'')=? THEN 1 ELSE 0 END").bind(accountId, prior.revision ?? ''),
   db.prepare('INSERT INTO bw_company_routes(account_id,policy_json,revision,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET policy_json=excluded.policy_json,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(accountId, JSON.stringify(policy), revision, actor.id, at),
   db.prepare('INSERT INTO bw_company_route_versions(id,account_id,revision,policy_json,saved_by,saved_at,reason) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(), accountId, revision, JSON.stringify(policy), actor.id, at, reason),
   audit(db, actor, accountId, 'company.route-saved', { accountId, revision, source: type, reason: `Saved approval policy revision ${revision} with ${policy.rules.length} rule(s); waiting orders keep their frozen route: ${reason}` })])
  return { policy, revision }
 }
 if (type === 'company.delegate') {
  const approvers = new Set((await companyApprovers(db, accountId)).map(row => row.userId))
  const delegatorId = text(p.delegatorId, 'Absent approver', 160), delegateId = text(p.delegateId, 'Delegate', 160)
  if (delegatorId === delegateId || !approvers.has(delegatorId) || !approvers.has(delegateId)) fail('DELEGATION', 'Delegate between two different current approvers of this company; a buyer without the approver right cannot receive approval authority.', 400)
  const startsOn = p.startsOn === undefined ? today : day(p.startsOn, 'Starts on'), endsOn = day(p.endsOn, 'Ends on')
  if (endsOn < today || endsOn < startsOn || Date.parse(endsOn) - Date.parse(startsOn) > 90 * 86400000) fail('DELEGATION', 'A delegation ends no earlier than today or its start, and lasts at most 90 days.', 400)
  const id = crypto.randomUUID()
  await commit(db, actor, [
   db.prepare('INSERT INTO bw_company_delegations(id,account_id,delegator_id,delegate_id,starts_on,ends_on,state,revision,reason,created_by,created_at) VALUES(?,?,?,?,?,?,\'active\',?,?,?,?)').bind(id, accountId, delegatorId, delegateId, startsOn, endsOn, revision, reason, actor.id, at),
   audit(db, actor, id, 'company.delegated', { accountId, revision, source: type, reason: `Approval authority of ${delegatorId} delegated to ${delegateId} from ${startsOn} through ${endsOn}; the delegate still needs their own approver right and limit: ${reason}` })])
  return { id, revision }
 }
 if (type === 'company.undelegate') {
  const row = await db.prepare('SELECT * FROM bw_company_delegations WHERE id=? AND account_id=?').bind(text(p.id, 'Delegation', 80), accountId).first<any>()
  if (!row) fail('NOT_FOUND', 'Delegation not found.', 404)
  if (p.revision !== row.revision || row.state !== 'active') fail('CHANGED', 'This delegation changed or already ended.')
  await commit(db, actor, [db.prepare("UPDATE bw_company_delegations SET state='ended',revision=? WHERE id=? AND revision=? AND state='active'").bind(revision, row.id, row.revision), changed(db),
   audit(db, actor, row.id, 'company.delegation-ended', { accountId, revision, source: type, reason: `Ended the delegation immediately: ${reason}` })])
  return { id: row.id, state: 'ended', revision }
 }
 fail('COMMAND', 'Unknown approval route command.', 404)
}

/** A person named by a saved route cannot leave the approver role until an administrator edits the route. */
export async function refuseRouteReference(db: D1Database, accountId: string, userId: string) {
 const { policy } = await currentPolicy(db, accountId)
 if (policy.rules.some(rule => rule.steps.some(step => step.approvers.includes(userId) || step.escalateTo.includes(userId)))) fail('ROUTE_REFERENCE', 'This person is named in the company’s approval route. Edit the route before removing them or their approver right.', 409)
}
/** Delegations die with the person's company role: nothing delegated survives their removal, erasure or lost approver right. */
export const endDelegations = (db: D1Database, userId: string, revision: string) => db.prepare("UPDATE bw_company_delegations SET state='ended',revision=? WHERE (delegator_id=? OR delegate_id=?) AND state='active'").bind(revision, userId, userId)
