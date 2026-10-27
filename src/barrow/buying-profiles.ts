import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, changed, commit } from './access'
import { bootstrapLegacyCompanyMembers, companyMembership, companyPurchasingRecipientSql } from './company-members'
import { validateAccountValue } from './imports/validation'
import { fail, requirePerson, requireSupplier, supplier, text, type Account, type Actor, type Order, type Price } from './model'
import type { SellerIdentity } from './seller-identity'

export type BrandValue={name:string;seller:SellerIdentity;currency:'USD'|'CAD'|'EUR'|'GBP';termsSeries?:string;requireAcceptance?:boolean}
export type ProfileValue={brandId:string;name:string;prices:Price[];minimumCents:number;termsDays:number;priceRevisions?:Account['value']['priceRevisions'];usdConversion?:Account['value']['usdConversion']}
export type BuyingProfileSnapshot={id:string;name:string;revision:string;brandId:string;brandRevision:string;brandName:string;seller:SellerIdentity;currency:'USD'|'CAD'|'EUR'|'GBP';termsSeries?:string;requireAcceptance?:boolean}
type Row={id:string;value_json:string;revision:string;account_id?:string}
const read=async(db:D1Database,table:string,id:string)=>db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<Row>()
const owner=(actor:Actor)=>{requirePerson(actor);requireSupplier(actor);if(actor.staff||!['owner','admin'].includes(actor.role))fail('FORBIDDEN','Only the supplier owner or admin manages brands and buying approvals.',403)}
const guard=(db:D1Database,sql:string,args:(string|number)[])=>db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN ${sql} THEN 1 ELSE 0 END`).bind(...args)
const id=(value:unknown,label:string)=>{const result=text(value,label,100);if(!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result))fail('INPUT','Use a stable identifier with letters, digits, dash or underscore.',400);return result}
const approvedSql=`SELECT 1 FROM bw_profile_approvals g JOIN bw_company_members cm ON cm.user_id=g.user_id AND cm.account_id=g.account_id JOIN oa_operators u ON u.id=g.user_id WHERE g.profile_id=? AND g.user_id=? AND g.account_id=? AND g.state='approved' AND g.restored=0 AND cm.state='active' AND cm.erased_at IS NULL AND u.status='active' AND u.role='member' AND EXISTS(SELECT 1 FROM json_each(cm.policy_json,'$.rights') WHERE value IN ('purchaser','approver'))`
export async function resolveBuyingProfile(db:D1Database,actor:Actor,base:Account,profileId?:string|null) {
 if(!profileId)return {selected:base,guard:guard(db,'1=1',[])}
 requirePerson(actor)
 const row=await read(db,'bw_buying_profiles',text(profileId,'Buying profile',100))
 if(!row||row.account_id!==base.id)fail('NOT_FOUND','Buying profile not found.',404)
 const value=JSON.parse(row.value_json) as ProfileValue,brand=await read(db,'bw_brands',value.brandId)
 if(!brand)fail('NOT_FOUND','Brand not found.',404)
 if(base.value.catalogs?.length&&!base.value.catalogs.includes(row.id)&&!base.value.catalogs.includes(value.brandId))fail('NOT_FOUND','Buying profile is outside the account catalogs.',404)
 const brandValue=JSON.parse(brand.value_json) as BrandValue
 if(!supplier(actor)) {
  await companyMembership(db,actor,base.id)
  if(!await db.prepare(approvedSql).bind(row.id,actor.id,base.id).first())fail('NOT_FOUND','Buying profile not approved for this buyer.',404)
 }
 const snapshot:BuyingProfileSnapshot={id:row.id,name:value.name,revision:row.revision,brandId:brand.id,brandRevision:brand.revision,brandName:brandValue.name,seller:brandValue.seller,currency:brandValue.currency,...(brandValue.termsSeries?{termsSeries:brandValue.termsSeries,requireAcceptance:brandValue.requireAcceptance??true}:{})}
 const clauses=["EXISTS(SELECT 1 FROM bw_buying_profiles WHERE id=? AND account_id=? AND revision=?)","EXISTS(SELECT 1 FROM bw_brands WHERE id=? AND revision=?)"]
 const args:(string|number)[]=[row.id,base.id,row.revision,brand.id,brand.revision]
 if(!supplier(actor)){clauses.push(`EXISTS(${approvedSql})`);args.push(row.id,actor.id,base.id)}
 return {selected:{...base,value:{...base.value,prices:value.prices,priceRevisions:value.priceRevisions,usdConversion:value.usdConversion,minimumCents:value.minimumCents,termsDays:value.termsDays,currency:brandValue.currency},buyingProfile:snapshot},guard:guard(db,clauses.join(' AND '),args)}
}
export async function orderBuyingProfile(db:D1Database,actor:Actor,base:Account,order:Pick<Order,'buyingProfile'>) {
 const context=await resolveBuyingProfile(db,actor,base,order.buyingProfile?.id)
 if(order.buyingProfile&&(context.selected.buyingProfile?.revision!==order.buyingProfile.revision||context.selected.buyingProfile.brandRevision!==order.buyingProfile.brandRevision))fail('PROFILE_CHANGED','The brand or buying profile changed. Prepare and review a new cart.')
 return context
}
export async function buyingOrderGuards(db:D1Database,actor:Actor,order:Order) {
 if(!order.buyingProfile)return []
 const context=await orderBuyingProfile(db,actor,await account(db,actor,order.accountId),order),guards=[context.guard]
 const buyerId=order.submittedBy??order.companyPreparedBy??order.preparedBy
 const person=await db.prepare('SELECT role FROM oa_operators WHERE id=?').bind(buyerId).first<{role:string}>()
 if(person?.role==='member'&&!await db.prepare('SELECT 1 FROM bw_staff_members WHERE user_id=?').bind(buyerId).first()) {
  if(!await db.prepare(approvedSql).bind(order.buyingProfile.id,buyerId,order.accountId).first())fail('PROFILE_REVOKED','The purchasing buyer no longer holds this buying profile.')
  guards.push(guard(db,`EXISTS(${approvedSql})`,[order.buyingProfile.id,buyerId,order.accountId]))
 }
 return guards
}
export async function readBuyingProfiles(db:D1Database,actor:Actor,accountId:string) {
 requirePerson(actor);const selected=await account(db,actor,accountId);await bootstrapLegacyCompanyMembers(db)
 const rows=(await db.prepare('SELECT * FROM bw_buying_profiles WHERE account_id=? ORDER BY id').bind(selected.id).all<Row>()).results
 const profiles=[]
 for(const row of rows){const value=JSON.parse(row.value_json) as ProfileValue,brand=await read(db,'bw_brands',value.brandId);if(!brand)continue
  const approved=supplier(actor)||!!await db.prepare(approvedSql).bind(row.id,actor.id,accountId).first()
  if(!approved||selected.value.catalogs?.length&&!selected.value.catalogs.includes(row.id)&&!selected.value.catalogs.includes(value.brandId))continue
  profiles.push({id:row.id,accountId,revision:row.revision,value,brand:{id:brand.id,revision:brand.revision,value:JSON.parse(brand.value_json) as BrandValue},approved})
 }
 const manageable=['owner','admin'].includes(actor.role)&&!actor.staff
 const brands=manageable?(await db.prepare('SELECT * FROM bw_brands ORDER BY id').all<Row>()).results.map(row=>({id:row.id,revision:row.revision,value:JSON.parse(row.value_json) as BrandValue})):profiles.map(profile=>profile.brand)
 const people=manageable?(await db.prepare(`SELECT p.id,p.email FROM oa_operators p JOIN bw_accounts a ON a.id=? WHERE ${companyPurchasingRecipientSql('p','a.id')} ORDER BY p.email`).bind(accountId).all<{id:string;email:string}>()).results:[]
 return {profiles,brands,people}
}
export async function buyingProfileCommand(env:Bindings,actor:Actor,type:string,p:any) {
 owner(actor);const revision=crypto.randomUUID(),at=new Date().toISOString()
 if(type==='brand.save') {
  const brandId=id(p.id,'Brand ID'),before=await read(env.DB,'bw_brands',brandId)
  if((before?.revision??null)!==(p.revision??null))fail('REVISION','Refresh the brand before editing it.')
  if(!['USD','CAD','EUR','GBP'].includes(p.value?.currency))fail('CURRENCY','Choose an explicitly priced USD, CAD, EUR or GBP book.',400)
  const value:BrandValue={name:text(p.value?.name,'Brand name',160),seller:{legalName:text(p.value?.seller?.legalName,'Seller legal name',160),address:text(p.value?.seller?.address,'Seller registered address',400),...(p.value?.seller?.registration?{registration:text(p.value.seller.registration,'Seller registration',80)}:{})},currency:p.value.currency}
  if(before&&JSON.parse(before.value_json).currency!==value.currency)fail('CURRENCY_IMMUTABLE','Create a separately priced brand for a different currency. Existing cents cannot be relabeled.')
  if(p.value.termsSeries){value.termsSeries=text(p.value.termsSeries,'Brand terms series',80);value.requireAcceptance=p.value.requireAcceptance!==false;if(!await env.DB.prepare('SELECT 1 FROM bw_sales_terms WHERE series=?').bind(value.termsSeries).first())fail('TERMS_SERIES','Publish the brand terms before assigning them.')}
  await commit(env.DB,actor,[before?env.DB.prepare('UPDATE bw_brands SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,brandId,before.revision):env.DB.prepare('INSERT INTO bw_brands VALUES(?,?,?)').bind(brandId,JSON.stringify(value),revision),changed(env.DB),audit(env.DB,actor,brandId,'brand.saved',{revision,source:type,reason:'Supplier configured a separate legal seller, fixed ISO currency and brand terms; historical order snapshots stay unchanged.'})])
  return {id:brandId,value,revision}
 }
 if(type==='profile.save') {
  const profileId=id(p.id,'Profile ID'),selected=await account(env.DB,actor,id(p.accountId,'Account')),before=await read(env.DB,'bw_buying_profiles',profileId)
  if(before&&(before.account_id!==selected.id||before.revision!==p.revision))fail('REVISION','Refresh the account-owned profile before editing it.')
  const brand=await read(env.DB,'bw_brands',id(p.value?.brandId,'Brand'));if(!brand)fail('NOT_FOUND','Brand not found.',404)
  if(before&&JSON.parse(before.value_json).brandId!==brand.id)fail('SELLER_IMMUTABLE','Create a separate profile for another seller; an existing profile cannot change ownership.')
  const validated=validateAccountValue({...selected.value,prices:p.value?.prices,priceRevisions:p.value?.priceRevisions,usdConversion:p.value?.usdConversion,minimumCents:p.value?.minimumCents,termsDays:p.value?.termsDays,currency:JSON.parse(brand.value_json).currency})
  const value:ProfileValue={brandId:brand.id,name:text(p.value?.name,'Profile name',160),prices:validated.prices,...(validated.priceRevisions?{priceRevisions:validated.priceRevisions}:{}),...(validated.usdConversion?{usdConversion:validated.usdConversion}:{}),minimumCents:validated.minimumCents,termsDays:validated.termsDays}
  await commit(env.DB,actor,[guard(env.DB,'EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?)',[selected.id,selected.revision]),before?env.DB.prepare('UPDATE bw_buying_profiles SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,profileId,before.revision):env.DB.prepare('INSERT INTO bw_buying_profiles VALUES(?,?,?,?)').bind(profileId,selected.id,JSON.stringify(value),revision),changed(env.DB),audit(env.DB,actor,profileId,'profile.saved',{accountId:selected.id,revision,source:type,reason:'Supplier explicitly configured this account-owned brand assortment and independent exact-cent price book.'})])
  return {id:profileId,accountId:selected.id,value,revision}
 }
 if(type==='profile.grant') {
  const row=await read(env.DB,'bw_buying_profiles',id(p.profileId,'Profile'));if(!row)fail('NOT_FOUND','Profile not found.',404)
  const selected=await account(env.DB,actor,row.account_id!);await bootstrapLegacyCompanyMembers(env.DB)
  const userId=text(p.userId,'Buyer',160),reason=text(p.reason,'Approval reason',1000)
  if(typeof p.approved!=='boolean')fail('INPUT','Explicitly approve or revoke this buying profile.',400)
  if(p.approved&&!await env.DB.prepare("SELECT 1 FROM bw_company_members cm JOIN oa_operators u ON u.id=cm.user_id WHERE cm.account_id=? AND cm.user_id=? AND cm.state='active' AND cm.erased_at IS NULL AND u.status='active' AND u.role='member'").bind(row.account_id,userId).first())fail('MEMBERSHIP','Approve an existing active buyer of this same account.',400)
  await commit(env.DB,actor,[guard(env.DB,'EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM bw_buying_profiles WHERE id=? AND revision=?)',[selected.id,selected.revision,row.id,row.revision]),...(p.approved?[guard(env.DB,"EXISTS(SELECT 1 FROM bw_company_members WHERE account_id=? AND user_id=? AND state='active' AND erased_at IS NULL)",[selected.id,userId])]:[]),env.DB.prepare("INSERT INTO bw_profile_approvals VALUES(?,?,?,?,?,?,?,?,0) ON CONFLICT(profile_id,user_id) DO UPDATE SET state=excluded.state,revision=excluded.revision,approved_by=excluded.approved_by,reason=excluded.reason,approved_at=excluded.approved_at,restored=0").bind(row.id,userId,row.account_id,p.approved?'approved':'revoked',revision,actor.id,reason,at),audit(env.DB,actor,row.id,p.approved?'profile.approved':'profile.revoked',{accountId:row.account_id,revision,source:type,reason})])
  return {profileId:row.id,userId,approved:p.approved,revision}
 }
 fail('COMMAND','Unknown buying profile command.',400)
}
