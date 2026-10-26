import type { Actor, Order } from './model'
import { supplier } from './model'
import { staffScope } from './staff-access'

const encoded = (value: unknown) => value === undefined ? '' : JSON.stringify(value)
export const buyingProfileColumns = {
 brands: ['id', 'revision', 'name', 'seller', 'sellerLegalName', 'currency', 'termsSeries', 'requireAcceptance'],
 buyingprofiles: ['id', 'revision', 'accountId', 'brandId', 'name', 'currency', 'prices', 'minimumCents', 'termsDays'],
 profileapprovals: ['profileId', 'userId', 'accountId', 'state', 'revision', 'approvedBy', 'reason', 'approvedAt', 'restored'],
}
export const orderProfileColumns = ['buyingProfileId', 'buyingProfileName', 'brandId', 'brandName', 'seller', 'sellerLegalName']

/** Historical exports use the order's agreed seller, never today's brand definition. */
export function orderProfileExport(order: Order) {
 const profile = order.buyingProfile
 return { buyingProfileId: profile?.id ?? '', buyingProfileName: profile?.name ?? '', brandId: profile?.brandId ?? '',
  brandName: profile?.brandName ?? '', seller: encoded(profile?.seller), sellerLegalName: profile?.seller.legalName ?? '' }
}

/** Profiles stay inside current account authority; an approval never grants another company's identity. */
export async function buyingProfileExport(db: D1Database, actor: Actor, accountIds: string[], hidePrices: boolean) {
 const staff = staffScope(actor, 'p.account_id'), values: (string | number)[] = [JSON.stringify(accountIds), ...staff.values]
 let predicate = `p.account_id IN (SELECT value FROM json_each(?))${staff.sql}`
 if (!supplier(actor)) {
  predicate += ` AND EXISTS(SELECT 1 FROM bw_profile_approvals a
   JOIN bw_company_members m ON m.user_id=a.user_id AND m.account_id=a.account_id
   JOIN oa_operators person ON person.id=m.user_id
   WHERE a.profile_id=p.id AND a.account_id=p.account_id AND a.user_id=? AND a.state='approved' AND a.restored=0
   AND m.state='active' AND m.erased_at IS NULL AND person.status='active' AND person.role='member')`
  values.push(actor.id)
 }
 const rows = (await db.prepare(`SELECT p.id,p.account_id,p.value_json,p.revision,b.id AS brand_id,b.value_json AS brand_json,b.revision AS brand_revision
  FROM bw_buying_profiles p JOIN bw_brands b ON b.id=json_extract(p.value_json,'$.brandId') WHERE ${predicate} ORDER BY p.id`).bind(...values).all<any>()).results
 const ids = rows.map(row => row.id)
 const brands = supplier(actor) && !actor.staff ? (await db.prepare('SELECT id,value_json,revision FROM bw_brands ORDER BY id').all<any>()).results
  : [...new Map(rows.map(row => [row.brand_id, { id: row.brand_id, value_json: row.brand_json, revision: row.brand_revision }])).values()]
 const approvals = (await db.prepare(`SELECT a.* FROM bw_profile_approvals a WHERE a.profile_id IN (SELECT value FROM json_each(?))
  AND a.account_id IN (SELECT value FROM json_each(?))${supplier(actor) ? '' : " AND a.user_id=? AND a.state='approved' AND a.restored=0"} ORDER BY a.profile_id,a.user_id`)
  .bind(JSON.stringify(ids), JSON.stringify(accountIds), ...(supplier(actor) ? [] : [actor.id])).all<any>()).results
 return {
  brands: brands.map(row => { const value=JSON.parse(row.value_json); return { id: row.id, revision: row.revision, name: value.name,
   seller: encoded(value.seller), sellerLegalName: value.seller.legalName, currency: value.currency, termsSeries: value.termsSeries ?? '', requireAcceptance: value.requireAcceptance ?? false } }),
  buyingprofiles: rows.map(row => { const value=JSON.parse(row.value_json), brand=JSON.parse(row.brand_json); return { id: row.id, revision: row.revision,
   accountId: row.account_id, brandId: value.brandId, name: value.name, currency: brand.currency, prices: hidePrices ? '' : encoded(value.prices), minimumCents: value.minimumCents, termsDays: value.termsDays } }),
  profileapprovals: approvals.map(row => ({ profileId: row.profile_id, userId: row.user_id, accountId: row.account_id, state: row.state, revision: row.revision,
   approvedBy: row.approved_by, reason: row.reason, approvedAt: row.approved_at, restored: row.restored })),
 }
}
