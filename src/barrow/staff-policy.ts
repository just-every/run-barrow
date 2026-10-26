// ACC-005 functional authority never widens Base's native member role.
import { fail, type Actor } from './model'
import { coveredTerritories, repAccountIds, repEpoch, supplierToday } from './rep-scope'

export const staffRoles = ['sales-manager', 'rep', 'operations', 'finance', 'analyst'] as const
export const staffEntitlements = ['applications', 'application-documents'] as const
export const staffReports = ['sales', 'finance', 'quotes', 'fulfillment', 'commissions'] as const
export type StaffReport = (typeof staffReports)[number]
export type StaffPolicy = {
 role: (typeof staffRoles)[number]
 accounts: 'all' | string[]
 warehouses: 'all' | string[]
 entitlements?: (typeof staffEntitlements)[number][]
 reports: StaffReport[]
 discountLimitCents: number
 creditLimitCents?:number
 refundLimitCents?:number
 stockExceptionLimitCents: number
 commissionRep?: string
}
/** For a rep, `accounts` is the effective scope read at request time: the owner's exact list plus ACC-006 assignments and coverage. */
export type StaffGrant = StaffPolicy & {
 userId: string; revision: string; state: 'active' | 'revoked'; nativeVersion: number
 territories: string[]; scopeEpoch: number
}
type StaffActor = Actor & { staff?: StaffGrant | null }
const scope = (value: unknown): value is 'all' | string[] => value === 'all' || Array.isArray(value)
 && value.length <= 1000 && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 160 && id === id.trim() && !/[\u0000-\u001f\u007f]/u.test(id)) && new Set(value).size === value.length
const cents = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Every right is explicit; empty scopes mean no access, never unlimited access. */
function parsePolicy(input: any): StaffPolicy {
 const fields = ['role', 'accounts', 'warehouses', 'reports', 'discountLimitCents', 'stockExceptionLimitCents']
 if (!input || typeof input !== 'object' || Array.isArray(input) || fields.some(key => !(key in input))
  || Object.keys(input).some(key => ![...fields, 'commissionRep', 'entitlements','creditLimitCents','refundLimitCents'].includes(key))
  || !staffRoles.includes(input.role) || !scope(input.accounts) || !scope(input.warehouses)
  || !Array.isArray(input.reports) || input.reports.some((kind: any) => !staffReports.includes(kind)) || new Set(input.reports).size !== input.reports.length
  || !cents(input.discountLimitCents) || !cents(input.stockExceptionLimitCents)) fail('STAFF_POLICY', 'Set an exact staff role, explicit account and warehouse scopes, report rights and nonnegative whole USD-cent limits.', 400)
 for(const key of ['creditLimitCents','refundLimitCents'])if(input[key]!==undefined&&(!cents(input[key])||input.role!=='finance'&&input[key]!==0))fail('STAFF_POLICY','Only finance may receive explicit nonnegative USD credit and refund allowances.',400)
 const entitlements = input.entitlements ?? []
 if (!Array.isArray(entitlements) || new Set(entitlements).size !== entitlements.length || entitlements.some((right: unknown) => !staffEntitlements.includes(right as any)
  || right === 'applications' && (input.role !== 'sales-manager' || input.accounts !== 'all')
  || right === 'application-documents' && input.role !== 'finance')) fail('STAFF_POLICY', 'Application review requires an all-account sales manager; read-only application documents require finance.', 400)
 if (input.commissionRep !== undefined && input.commissionRep !== null && (typeof input.commissionRep !== 'string' || !input.commissionRep.length || input.commissionRep.length > 160 || input.commissionRep !== input.commissionRep.trim() || /[\u0000-\u001f\u007f]/u.test(input.commissionRep))) fail('STAFF_POLICY', 'Use an exact commission rep label.', 400)
 if(input.role!=='rep'&&input.commissionRep!==undefined&&input.commissionRep!==null)fail('STAFF_POLICY','A fixed commission rep label belongs only to a rep grant.',400)
 if (input.role === 'rep' && input.reports.includes('commissions') && !input.commissionRep) fail('STAFF_POLICY', 'A rep commission report needs an explicit fixed rep label.', 400)
 return { role: input.role,...(input.role==='finance'?{creditLimitCents:input.creditLimitCents??0,refundLimitCents:input.refundLimitCents??0}:{}), ...(entitlements.length ? { entitlements: [...entitlements] } : {}), accounts: input.accounts === 'all' ? 'all' : [...input.accounts], warehouses: input.warehouses === 'all' ? 'all' : [...input.warehouses], reports: [...input.reports], discountLimitCents: input.discountLimitCents, stockExceptionLimitCents: input.stockExceptionLimitCents, ...(input.commissionRep ? { commissionRep: input.commissionRep } : {}) }
}
export async function validateStaffPolicy(db: D1Database, input: unknown): Promise<StaffPolicy> {
 const policy = parsePolicy(input)
 if (policy.accounts !== 'all') {
  const missing = await db.prepare('SELECT value FROM json_each(?) requested WHERE NOT EXISTS(SELECT 1 FROM bw_accounts a WHERE a.id=requested.value) LIMIT 1').bind(JSON.stringify(policy.accounts)).first()
  if (missing) fail('STAFF_POLICY', 'Choose existing exact account IDs.', 400)
 }
 // Warehouses are exact source names in Barrow, not a second inventory registry.
 // The owner must name each explicitly; no alias or empty-list expansion exists.
 return policy
}
export function staffPolicyJson(policy: StaffPolicy) { return JSON.stringify({ ...policy, commissionRep: policy.commissionRep ?? null }) }
export function parseStaffGrant(row: any): StaffGrant {
 return { ...parsePolicy(JSON.parse(row.policy_json)), userId: row.user_id, revision: row.revision, state: row.state, nativeVersion: row.native_version, territories: [], scopeEpoch: 0 }
}

/** Both Native activation and the exact version are prerequisites, never effects. */
export async function readStaffGrant(db: D1Database, actor: Actor): Promise<StaffGrant | null> {
 if (actor.agent || actor.role !== 'member') return null
 const row = await db.prepare(`SELECT g.* FROM bw_staff_members g JOIN oa_operators p ON p.id=g.user_id
  WHERE g.user_id=? AND g.state='active' AND p.role='member' AND p.status='active' AND p.version=g.native_version AND p.version=?
  AND NOT EXISTS(SELECT 1 FROM bw_company_members m WHERE m.user_id=p.id OR m.email_key=lower(trim(p.email)))
  AND NOT EXISTS(SELECT 1 FROM bw_company_invites i WHERE i.email_key=lower(trim(p.email)) OR i.accepted_by=p.id)
  AND NOT EXISTS(SELECT 1 FROM bw_accounts a WHERE lower(trim(json_extract(a.value_json,'$.email')))=lower(trim(p.email)))`).bind(actor.id, actor.version).first<any>()
 if (!row) return null
 try {
  const grant = parseStaffGrant(row)
  if (grant.role !== 'rep') return grant
  // ACC-006: read the epoch first, so any later assignment change makes this scope's writes fail their guard.
  const scopeEpoch = await repEpoch(db), held = grant.accounts === 'all' ? null : new Set([...grant.accounts, ...await repAccountIds(db, grant.userId, await supplierToday())])
  return { ...grant, scopeEpoch, ...(held ? { accounts: [...held].sort(), territories: await coveredTerritories(db, held) } : {}) }
 } catch { return null }
}
/** Append to commit admission so a role downgrade cannot race a commercial write. */
export function staffGuard(db: D1Database, grant: StaffGrant): D1PreparedStatement {
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(
  SELECT 1 FROM bw_staff_members g JOIN oa_operators p ON p.id=g.user_id
  WHERE g.user_id=? AND g.revision=? AND g.state='active' AND g.native_version=?
  AND p.role='member' AND p.status='active' AND p.version=g.native_version
  AND NOT EXISTS(SELECT 1 FROM bw_company_members m WHERE m.user_id=p.id OR m.email_key=lower(trim(p.email)))
  AND NOT EXISTS(SELECT 1 FROM bw_company_invites i WHERE i.email_key=lower(trim(p.email)) OR i.accepted_by=p.id)
  AND NOT EXISTS(SELECT 1 FROM bw_accounts a WHERE lower(trim(json_extract(a.value_json,'$.email')))=lower(trim(p.email)))
 ) AND (?<0 OR (SELECT value FROM bw_rep_epoch WHERE singleton=1)=?) THEN 1 ELSE 0 END`).bind(grant.userId, grant.revision, grant.nativeVersion, grant.role === 'rep' ? grant.scopeEpoch : -1, grant.scopeEpoch)
}
export function staffAccountAllowed(grant: StaffGrant, id: string): boolean {
 return grant.state === 'active' && typeof id === 'string' && !!id && (grant.accounts === 'all' || grant.accounts.includes(id))
}
/** Authorize the whole requested filter; a narrower grant never trims a report. */
export function requireStaffReport(actor: StaffActor, type: StaffReport, params: URLSearchParams, saved = false): void {
 if (actor.agent) fail('FORBIDDEN', 'Reports require an entitled signed-in person.', 403)
 if (actor.role === 'owner' || actor.role === 'admin') return
 const grant = actor.staff
 if (actor.role !== 'member' || !grant || grant.userId !== actor.id || grant.state !== 'active' || grant.nativeVersion !== actor.version || !grant.reports.includes(type)) fail('FORBIDDEN', 'Your staff grant does not entitle this report.', 403)
 if (['accountId', 'warehouse', 'rep', 'territory'].some(key => params.getAll(key).length > 1)) fail('FORBIDDEN', 'Choose one exact report scope.', 403)
 const accountId = params.get('accountId') ?? '', territory = params.get('territory') ?? ''
 // A territory filter is authorized only when every account in it is held today; it is never trimmed to the held part.
 // A rep's own commission statement is bound to their fixed label and its rows are limited to current accounts (ACC-006),
 // so it needs no named account; every other scoped report names one held account or one completely held territory.
 // Saved recipients are rechecked in SQL at freeze and send, which resolves one named account; a territory stays an on-demand filter.
 if (saved && grant.accounts !== 'all' && territory) fail('FORBIDDEN', 'A saved report for scoped staff must name one account they hold.', 403)
 const ownStatement = type === 'commissions' && grant.role === 'rep'
 if (grant.accounts !== 'all' && (!ownStatement && !(accountId || territory) || accountId && !staffAccountAllowed(grant, accountId) || territory && !grant.territories.includes(territory))) fail('FORBIDDEN', 'Choose one explicitly permitted account or a territory you hold completely; this grant does not cover an all-account report.', 403)
 if (type === 'fulfillment' && grant.warehouses !== 'all') {
  const warehouse = params.get('warehouse') ?? ''
  if (!warehouse || !grant.warehouses.includes(warehouse)) fail('FORBIDDEN', 'Choose one explicitly permitted warehouse.', 403)
 }
 if (type === 'commissions' && grant.role === 'rep') {
  const requested = params.get('rep')
  if (!grant.commissionRep || requested && requested !== grant.commissionRep) fail('FORBIDDEN', 'Your commission report is bound to the owner-granted rep label.', 403)
  params.set('rep', grant.commissionRep)
 }
}
