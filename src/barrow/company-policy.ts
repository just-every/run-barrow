import { staffAccountAllowed } from './staff-policy'
// ACC-002 keeps company authority in the seed; Base's member role never changes.
import { fail, supplier, type Actor } from './model'

export const companyRights = ['administrator', 'purchaser', 'approver', 'finance'] as const
export type CompanyRight = (typeof companyRights)[number]
export type CompanyPolicy = {
 rights: CompanyRight[]
 locations: 'all' | string[]
 perOrderLimitCents: number | null
 approvalLimitCents: number | null
 locationLimits?: Record<string, { perOrderLimitCents?: number | null; approvalLimitCents?: number | null }>
}
export type CompanyMembership = CompanyPolicy & {
 id: string; accountId: string; userId: string; email: string; name: string
 state: 'invited' | 'active' | 'removed'; revision: string; erasedAt?: string
}
export const unlimitedCompanyPolicy: CompanyPolicy = {
 rights: [...companyRights], locations: 'all', perOrderLimitCents: null, approvalLimitCents: null,
}
export const companyEmail = (value: string) => value.normalize('NFKC').trim().toLowerCase()
const validLimit = (value: unknown) => value === null || typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Missing limits never silently become unlimited. Overrides name real ship-tos. */
export async function validateCompanyPolicy(db: D1Database, accountId: string, input: any): Promise<CompanyPolicy> {
 if (!input || !Array.isArray(input.rights) || !input.rights.length || new Set(input.rights).size !== input.rights.length || input.rights.some((right: any) => !companyRights.includes(right))) fail('COMPANY_RIGHTS', 'Choose explicit company rights.', 400)
 if (input.locations !== 'all' && (!Array.isArray(input.locations) || !input.locations.length || input.locations.some((id: unknown) => typeof id !== 'string') || new Set(input.locations).size !== input.locations.length)) fail('COMPANY_LOCATIONS', 'Choose all locations or a nonempty list of locations.', 400)
 if (!validLimit(input.perOrderLimitCents) || !validLimit(input.approvalLimitCents)) fail('COMPANY_LIMIT', 'Set each USD-cent limit explicitly; null means unlimited.', 400)
 const locations = (await db.prepare("SELECT id FROM bw_locations WHERE account_id=? AND kind='ship-to' AND archived=0").bind(accountId).all<{id:string}>()).results.map(row => row.id)
 if (input.locations !== 'all' && input.locations.some((id: string) => !locations.includes(id))) fail('COMPANY_LOCATIONS', 'Use current ship-to locations of this company.', 400)
 const overrides = input.locationLimits ?? {}
 if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) fail('COMPANY_LIMIT', 'Location overrides must name this company’s ship-tos.', 400)
 for (const [id, value] of Object.entries(overrides) as [string, any][]) {
  if (!locations.includes(id) || input.locations !== 'all' && !input.locations.includes(id) || !value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).some(key => !['perOrderLimitCents', 'approvalLimitCents'].includes(key)) || Object.values(value).some(limit => !validLimit(limit))) fail('COMPANY_LIMIT', 'Use explicit limits for permitted ship-to locations.', 400)
 }
 return { rights: [...input.rights], locations: input.locations === 'all' ? 'all' : [...input.locations], perOrderLimitCents: input.perOrderLimitCents, approvalLimitCents: input.approvalLimitCents, ...(Object.keys(overrides).length ? { locationLimits: overrides } : {}) }
}

export function parseCompanyMember(row: any): CompanyMembership {
 return { ...JSON.parse(row.policy_json), id: row.id, accountId: row.account_id, userId: row.user_id, email: row.email, name: row.display_name, state: row.state, revision: row.revision, ...(row.erased_at ? { erasedAt: row.erased_at } : {}) }
}
export async function companyMembership(db: D1Database, actor: Actor, accountId?: string): Promise<CompanyMembership | null> {
 if (actor.agent || actor.staff || actor.role !== 'member') return null
 const row = await db.prepare(`SELECT m.* FROM bw_company_members m JOIN oa_operators p ON p.id=m.user_id
  WHERE m.user_id=? AND m.state='active' AND m.erased_at IS NULL AND p.status='active' AND p.role='member'${accountId === undefined ? '' : ' AND m.account_id=?'}`).bind(actor.id, ...(accountId === undefined ? [] : [accountId])).first<any>()
 return row ? parseCompanyMember(row) : null
}
/** null means supplier-wide scope; [] means no company access. */
export async function companyAccountIds(db: D1Database, actor: Actor): Promise<string[] | null> {
 if(actor.staff)return actor.staff.accounts==='all'?null:actor.staff.accounts
 if (supplier(actor)) return null
 const member = await companyMembership(db, actor)
 return member ? [member.accountId] : []
}
export function companyLocationAllowed(member: CompanyMembership, locationId?: string) {
 return member.locations === 'all' || typeof locationId === 'string' && member.locations.includes(locationId)
}
export async function requireCompanyRight(db: D1Database, actor: Actor, accountId: string, right: CompanyRight | 'purchasing', locationId?: string): Promise<CompanyMembership | null> {
 if(actor.staff&&!staffAccountAllowed(actor.staff,accountId))fail('NOT_FOUND','Trade account not found.',404)
 if (supplier(actor)) return null
 const member = await companyMembership(db, actor, accountId)
 if (!member) fail('NOT_FOUND', 'Trade account not found.', 404)
 const rights: CompanyRight[] = right === 'purchasing' ? ['purchaser', 'approver'] : [right]
 if (!rights.some(value => member.rights.includes(value))) fail('FORBIDDEN', 'Your company rights do not permit this action.', 403)
 // A caller omitting the location is checking only the company right, not an order.
 if (locationId !== undefined && !companyLocationAllowed(member, locationId)) fail('FORBIDDEN', 'This ship-to is outside your company purchasing rights.', 403)
 return member
}
/** Include with a mutation's existing commit/admission batch to close downgrade races. */
export function companyRightsGuard(db: D1Database, member: CompanyMembership | null) {
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN ? IS NULL OR EXISTS(
  SELECT 1 FROM bw_company_members m JOIN oa_operators p ON p.id=m.user_id
  WHERE m.id=? AND m.user_id=? AND m.account_id=? AND m.revision=? AND m.state='active'
  AND m.erased_at IS NULL AND p.role='member' AND p.status='active') THEN 1 ELSE 0 END`)
  .bind(member?.id ?? null, member?.id ?? '', member?.userId ?? '', member?.accountId ?? '', member?.revision ?? '')
}
export function companyPurchaserLimit(member: CompanyMembership, locationId?: string) {
 if (!companyLocationAllowed(member, locationId)) fail('FORBIDDEN', 'Choose a permitted ship-to before submitting.', 403)
 return locationId && member.locationLimits?.[locationId]?.perOrderLimitCents !== undefined ? member.locationLimits[locationId].perOrderLimitCents! : member.perOrderLimitCents
}
/** Company approval releases to supplier submission; it never reserves stock or replaces supplier approval. */
export async function requireCompanyApproval(db: D1Database, actor: Actor, order: { accountId: string; preparedBy: string; totalCents: number; currency?: string; shipTo?: {id:string} }) {
 if (actor.agent) fail('PERSON_REQUIRED', 'An agent cannot approve a company order.', 403)
 if (order.preparedBy === actor.id) fail('SELF_APPROVAL', 'The preparer cannot approve their own order.', 403)
 if (order.currency !== 'USD') fail('COMPANY_CURRENCY', 'Company purchasing limits apply to USD orders.', 409)
 const member = await requireCompanyRight(db, actor, order.accountId, 'approver', order.shipTo?.id)
 if (member) {
  if (!companyLocationAllowed(member, order.shipTo?.id)) fail('FORBIDDEN', 'This order has no permitted ship-to.', 403)
  const limit = order.shipTo && member.locationLimits?.[order.shipTo.id]?.approvalLimitCents !== undefined ? member.locationLimits[order.shipTo.id].approvalLimitCents! : member.approvalLimitCents
  if (limit !== null && order.totalCents > limit) fail('APPROVAL_LIMIT', 'This order exceeds your company approval limit.', 403)
 }
 // The preparer must still have current purchaser authority and this ship-to.
 if (!order.preparedBy.startsWith('agent:')) {
  const person = await db.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(order.preparedBy).first<any>()
  if (!person) fail('PREPARER_REVOKED', 'The preparer no longer has purchasing authority.', 403)
  if (!supplier(person)) {
   const preparer = await requireCompanyRight(db, {...person,agent:false}, order.accountId, 'purchaser', order.shipTo?.id)
   if (!preparer || !companyLocationAllowed(preparer, order.shipTo?.id)) fail('PREPARER_REVOKED', 'The preparer no longer has purchasing authority at this ship-to.', 403)
   return { member, preparer, guard: companyRightsGuard(db, member), preparerGuard: companyRightsGuard(db, preparer) }
  }
 }
 return { member, preparer: null, guard: companyRightsGuard(db, member), preparerGuard: companyRightsGuard(db, null) }
}
/** SQL predicate over an oa_operators alias; use at enqueue AND at dispatch claim. */
export function companyPurchasingRecipientSql(personAlias = 'p', accountExpression = 'm.account_id') {
 if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(personAlias) || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(accountExpression)) throw new Error('Invalid server-authored recipient alias')
 return `${personAlias}.status='active' AND ${personAlias}.role='member' AND EXISTS (
  SELECT 1 FROM bw_company_members cm WHERE cm.user_id=${personAlias}.id AND cm.account_id=${accountExpression}
  AND cm.state='active' AND cm.erased_at IS NULL AND EXISTS (
   SELECT 1 FROM json_each(cm.policy_json,'$.rights') cr WHERE cr.value IN ('purchaser','approver')))`
}
