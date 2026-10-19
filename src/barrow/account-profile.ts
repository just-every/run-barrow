import { fail, type Account, type AccountValue } from './model'

export const normalizedCompanyName = (name:string) => name.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase()
export const duplicateCompany = (a:AccountValue,b:AccountValue) => normalizedCompanyName(a.name)===normalizedCompanyName(b.name)||a.pierCustomerId===b.pierCustomerId
export const companyIdentityChanged = (before:AccountValue|undefined,after:AccountValue) => !before||normalizedCompanyName(before.name)!==normalizedCompanyName(after.name)||before.pierCustomerId!==after.pierCustomerId
export const duplicateReviewAction = (reviews:{id:string;revision:string}[]) => `account.duplicates-reviewed:${JSON.stringify(reviews)}`

export function requireActiveAccount(account:Account) {
 if((account.value.lifecycle??'active')!=='active') fail('ACCOUNT_INACTIVE','This account is on hold or closed. Contact the supplier before placing a new order.')
}
export function activeAccountGuard(db:D1Database,account:Account) {
 return db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=? AND COALESCE(json_extract(value_json,'$.lifecycle'),'active')='active') THEN 1 ELSE 0 END").bind(account.id,account.revision)
}

// The complete directory fences normalized-name matches, including a company
// inserted during review. SQLite cannot reproduce JavaScript's NFKC normalization.
export function accountDirectorySnapshot(rows:Account[]) {
 return rows.map(row=>({id:row.id,revision:row.revision,value:row.value}))
}
export const directoryPredicate = `NOT EXISTS(SELECT 1 FROM bw_accounts a WHERE NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE json_extract(s.value,'$.id')=a.id AND json_extract(s.value,'$.revision')=a.revision AND json(json_extract(s.value,'$.value'))=json(a.value_json))) AND (SELECT COUNT(*) FROM bw_accounts)=?`

export function validateDuplicateReviews(input:unknown,candidates:Account[]) {
 const reviews=input===undefined?[]:input
 if(!Array.isArray(reviews)||reviews.length>1000) fail('DUPLICATE_REVIEW','Review the current duplicate companies before saving.',400)
 const seen=new Set<string>()
 for(const row of reviews) {
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||typeof row.id!=='string'||typeof row.revision!=='string'||row.id.length>100||row.revision.length>160||seen.has(row.id)) fail('DUPLICATE_REVIEW','Supply each reviewed account ID and current revision exactly once.',400)
  seen.add(row.id)
 }
 if(reviews.length!==candidates.length||candidates.some(row=>!reviews.some(review=>review.id===row.id&&review.revision===row.revision))) fail('DUPLICATE_REVIEW','Review all matching companies as separate companies using their current revisions before saving.')
 return candidates.map(row=>({id:row.id,revision:row.revision}))
}
