// AUTO-001: conditional rules route a verified trade application to a reviewer and set its review deadline. Conditions
// are the facts the application form records: the US state of any requested location (the territory), the requested
// payment terms, expected annual volume and whether any document came with it (not validated; TAX-003 reviews
// certificates). The first matching rule in order wins; an application no rule matches goes to the fallback. A route may
// carry a prepared missing-information request that the reviewer reviews before sending; nothing is sent by a rule.
// ACC-005 includes current all-account sales managers holding the applications entitlement; only owners/admins save rules.
import { applicationReviewers, applicationReviewerGuard } from './application-reviewers'
import { audit, commit } from './access'
import { fail, integer, requirePerson, text, type Actor } from './model'

export type ApplicationRoute = { territory?: string; ownerId: string; escalateToId: string; deadlineDays: number; request?: string }
export type ApplicationRule = { id: string; name: string; when: { states?: string[]; minTermsDays?: number; maxTermsDays?: number; minVolumeUsd?: number; maxVolumeUsd?: number; certificate?: 'missing' | 'complete' }; route: ApplicationRoute }
export type ApplicationRules = { rules: ApplicationRule[]; fallback: ApplicationRoute | null }
const key = 'application-rules'
const conditions = ['states', 'minTermsDays', 'maxTermsDays', 'minVolumeUsd', 'maxVolumeUsd', 'certificate']

function requireReviewer(actor: Actor) {
 requirePerson(actor)
 if (actor.agent || actor.staff || !['owner', 'admin'].includes(actor.role)) fail('FORBIDDEN', 'Only owner or admin people manage application routing; only current application reviewers may receive routes.', 403)
}
async function route(input: any, allowed: Set<string>): Promise<ApplicationRoute> {
 if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(name => !['territory', 'ownerId', 'escalateToId', 'deadlineDays', 'request'].includes(name))) fail('RULE_INPUT', 'A route has an optional territory label, a reviewer, an escalation person, a deadline in days and an optional prepared request.', 400)
 const ownerId = text(input.ownerId, 'Reviewer', 160), escalateToId = text(input.escalateToId, 'Escalation person', 160)
 if (!allowed.has(ownerId) || !allowed.has(escalateToId)) fail('RULE_INPUT', 'Reviewers and escalation people are active owners/admins or all-account sales managers with the applications entitlement.', 400)
 return { ...(input.territory ? { territory: text(input.territory, 'Territory label', 120) } : {}), ownerId, escalateToId, deadlineDays: integer(input.deadlineDays, 'Review deadline (days)', 1, 60), ...(input.request ? { request: text(input.request, 'Prepared missing-information request', 1000) } : {}) }
}
const bounds = (min: unknown, max: unknown, label: string, top: number) => {
 const low = min === undefined ? undefined : integer(min, `Minimum ${label}`, 0, top), high = max === undefined ? undefined : integer(max, `Maximum ${label}`, 0, top)
 if (low !== undefined && high !== undefined && low > high) fail('RULE_INPUT', `The minimum ${label} cannot exceed the maximum.`, 400)
 return [low, high] as const
}
export async function readApplicationRules(db: D1Database, actor: Actor) {
 requireReviewer(actor)
 const row = await db.prepare('SELECT value_json,revision FROM bw_settings WHERE key=?').bind(key).first<{ value_json: string; revision: string }>()
 return { ...(row ? JSON.parse(row.value_json) as ApplicationRules : { rules: [], fallback: null }), revision: row?.revision ?? null, reviewers: (await applicationReviewers(db)).map(({id,name,role,grant}) => ({id,name,role:grant?.role ?? role})),
  notes: { rule: 'The first matching rule routes a verified application; others go to the fallback, or the owner with a three-day deadline when none is set. The review deadline starts when the application is verified and again when staff request information or the applicant answers. Once a deadline passes with no decision the task is escalated, and it stays escalated until a decision (approve, decline or withdrawal) or an explicit closure; requests, answers and queued emails never end it.', conditions: 'Conditions use requested location states, requested payment terms, expected annual volume and whether any document was attached. Certificates are not validated here. A prepared request is only a draft: the reviewer reviews and sends it from the application.' } }
}
export async function saveApplicationRules(db: D1Database, actor: Actor, p: any) {
 requireReviewer(actor)
 const people = await applicationReviewers(db), allowed = new Set(people.map(row => row.id)), reason = text(p.reason, 'Reason', 1000)
 const prior = await db.prepare('SELECT revision FROM bw_settings WHERE key=?').bind(key).first<{ revision: string }>()
 if ((p.revision ?? null) !== (prior?.revision ?? null)) fail('CHANGED', 'Application routing changed. Refresh before saving.')
 if (!Array.isArray(p.rules) || p.rules.length > 50) fail('RULE_INPUT', 'Supply at most 50 routing rules.', 400)
 const seen = new Set<string>()
 const rules: ApplicationRule[] = []
 for (const raw of p.rules) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(name => !['id', 'name', 'when', 'route'].includes(name))) fail('RULE_INPUT', 'A rule has an ID, name, conditions and a route.', 400)
  const id = text(raw.id, 'Rule ID', 40)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || seen.has(id)) fail('RULE_INPUT', 'Rule IDs are unique letters, digits, dot, dash or underscore.', 400)
  seen.add(id)
  const when = raw.when ?? {}
  if (typeof when !== 'object' || Array.isArray(when) || Object.keys(when).some(name => !conditions.includes(name))) fail('RULE_INPUT', 'Conditions are states, requested terms bounds, volume bounds and certificate completeness.', 400)
  const states = when.states === undefined ? undefined : Array.isArray(when.states) && when.states.length && when.states.length <= 60 && when.states.every((state: unknown) => typeof state === 'string' && /^[A-Z]{2}$/.test(state)) ? [...new Set<string>(when.states)] : fail('RULE_INPUT', 'List one or more two-letter US state codes.', 400)
  const [minTerms, maxTerms] = bounds(when.minTermsDays, when.maxTermsDays, 'requested terms (days)', 365), [min, max] = bounds(when.minVolumeUsd, when.maxVolumeUsd, 'volume (USD)', 1_000_000_000)
  if (when.certificate !== undefined && !['missing', 'complete'].includes(when.certificate)) fail('RULE_INPUT', 'Certificate completeness is missing or complete.', 400)
  rules.push({ id, name: text(raw.name, 'Rule name', 80), when: { ...(states ? { states } : {}), ...(minTerms !== undefined ? { minTermsDays: minTerms } : {}), ...(maxTerms !== undefined ? { maxTermsDays: maxTerms } : {}), ...(min !== undefined ? { minVolumeUsd: min } : {}), ...(max !== undefined ? { maxVolumeUsd: max } : {}), ...(when.certificate ? { certificate: when.certificate } : {}) }, route: await route(raw.route, allowed) })
 }
 const fallback = p.fallback === null || p.fallback === undefined ? null : await route(p.fallback, allowed), revision = crypto.randomUUID()
 const assigned = new Set([...rules.flatMap(rule => [rule.route.ownerId, rule.route.escalateToId]), ...(fallback ? [fallback.ownerId, fallback.escalateToId] : [])])
 await commit(db, actor, [...people.filter(person => assigned.has(person.id)).map(person => applicationReviewerGuard(db, person)), db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key=?),'')=? THEN 1 ELSE 0 END").bind(key, prior?.revision ?? ''),
  db.prepare('INSERT INTO bw_settings(key,value_json,revision) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(key, JSON.stringify({ rules, fallback }), revision),
  audit(db, actor, `settings:${key}`, 'application.routing-saved', { revision, source: 'application.rules.save', reason: `Saved ${rules.length} routing rule(s) and ${fallback ? 'a fallback route' : 'no fallback'}: ${reason}` })])
 return { rules, fallback, revision }
}
export type ApplicationFacts = { states: string[]; termsDays: number; volumeUsd: number; documents: number }
/** The first matching rule's route, else the fallback, else the owner with a three-day deadline. */
export async function routeApplication(db: D1Database, facts: ApplicationFacts, existing?: ApplicationRoute & {ruleId: string | null; ruleName: string | null}): Promise<ApplicationRoute & { ruleId: string | null; ruleName: string | null; guards: D1PreparedStatement[] }> {
 const row = await db.prepare('SELECT value_json FROM bw_settings WHERE key=?').bind(key).first<{ value_json: string }>()
 const settings: ApplicationRules = row ? JSON.parse(row.value_json) : { rules: [], fallback: null }
 const people = await applicationReviewers(db), owner = people.find(person => person.role === 'owner')
 const currentRoute = (route: ApplicationRoute) => {
  const reviewer = people.find(person => person.id === route.ownerId) ?? owner, escalation = people.find(person => person.id === route.escalateToId) ?? owner
  if (!reviewer || !escalation) fail('REVIEWER_UNAVAILABLE', 'An active installation owner must receive unassigned application reviews.', 503)
  return { ...route, ownerId: reviewer.id, escalateToId: escalation.id, guards: [applicationReviewerGuard(db, reviewer), applicationReviewerGuard(db, escalation)] }
 }
 if (existing) return { ...currentRoute(existing), ruleId: existing.ruleId, ruleName: existing.ruleName }
 const outside = (value: number, min?: number, max?: number) => min !== undefined && value < min || max !== undefined && value > max
 for (const rule of settings.rules) {
  const when = rule.when
  if (when.states && !facts.states.some(state => when.states!.includes(state))) continue
  if (outside(facts.termsDays, when.minTermsDays, when.maxTermsDays) || outside(facts.volumeUsd, when.minVolumeUsd, when.maxVolumeUsd)) continue
  if (when.certificate === 'missing' && facts.documents > 0 || when.certificate === 'complete' && facts.documents === 0) continue
  return { ...currentRoute(rule.route), ruleId: rule.id, ruleName: rule.name }
 }
 if (settings.fallback) return { ...currentRoute(settings.fallback), ruleId: null, ruleName: null }
 return { ...currentRoute({ ownerId: owner?.id ?? '', escalateToId: owner?.id ?? '', deadlineDays: 3 }), ruleId: null, ruleName: null }
}
