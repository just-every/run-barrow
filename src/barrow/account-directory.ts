import { staffScope } from './staff-access'
import { companyAccountPredicate } from './company-access'
import { account } from './accounts'
import { duplicateCompany, companyIdentityChanged } from './account-profile'
import { fail, requireSupplier, supplier, type Account, type Actor } from './model'
import { currentReps, supplierToday } from './rep-scope'

const pageSize = 25
function pageNumber(query: URLSearchParams) {
 const raw = query.get('page') ?? '1'
 if (!/^[1-9]\d{0,5}$/.test(raw)) fail('PAGE', 'Choose a positive account page up to 999999.', 400)
 return Number(raw)
}
function term(query: URLSearchParams, key: string, limit = 160) {
 const value = (query.get(key) ?? '').trim()
 if (value.length > limit) fail('SEARCH', `Account search fields accept at most ${limit} characters.`, 400)
 return value
}
const parse = (row: any): Account => ({ id: row.id, revision: row.revision, value: JSON.parse(row.value_json) })
/** Page in D1 using existing account authority; agents retain their existing scoped read access. */
export async function accountPage(db: D1Database, actor: Actor, query: URLSearchParams) {
 const page = pageNumber(query), search = term(query, 'q'), sort = query.get('sort') ?? 'id'
 const sorts: Record<string,string> = { id: 'id ASC', 'name-asc': "lower(json_extract(value_json,'$.name')) ASC,id ASC", 'name-desc': "lower(json_extract(value_json,'$.name')) DESC,id ASC" }
 if (!Object.hasOwn(sorts, sort)) fail('SEARCH', 'Choose a listed account sort.', 400)
 const scope=staffScope(actor,'id'),clauses = ['1=1'+scope.sql], values: (string|number)[] = [...scope.values]
 if (actor.agent) clauses.push('NOT EXISTS(SELECT 1 FROM bw_agent_erased_accounts WHERE account_id=bw_accounts.id)')
 if (!supplier(actor)) { clauses.push(companyAccountPredicate('id')); values.push(actor.id) }
 if (search) {
  clauses.push("(instr(lower(id),lower(?))>0 OR instr(lower(json_extract(value_json,'$.name')),lower(?))>0 OR instr(lower(json_extract(value_json,'$.email')),lower(?))>0 OR instr(lower(json_extract(value_json,'$.pierCustomerId')),lower(?))>0)")
  values.push(search,search,search,search)
 }
 const rows = await db.prepare(`SELECT * FROM bw_accounts WHERE ${clauses.join(' AND ')} ORDER BY ${sorts[sort]} LIMIT ? OFFSET ?`).bind(...values,pageSize+1,(page-1)*pageSize).all<any>()
 const accounts = rows.results.slice(0,pageSize).map(parse), reps = await currentReps(db, accounts.map(row => row.id), await supplierToday())
 // ACC-006: every reader sees who currently holds the account; names only, never identities or contact details.
 const currentRepsByAccount = Object.fromEntries(accounts.map(row => [row.id, (reps.get(row.id) ?? []).map(({ name, coverage, through }) => ({ name, coverage, ...(through ? { through } : {}) }))]))
 return { accounts, currentReps: currentRepsByAccount, page, pageSize, hasNext: rows.results.length>pageSize }
}
/** Duplicate review keeps the existing Unicode normalization and exact Pier identity semantics.
 * Scan bounded batches, return one page, and let account.save fence the complete directory. */
export async function duplicateAccountPage(db: D1Database, actor: Actor, query: URLSearchParams) {
 requireSupplier(actor)
 const page = pageNumber(query), name = term(query,'name'), pierCustomerId = term(query,'pierCustomerId'), exclude = term(query,'exclude',100)
 const before = exclude ? await account(db,actor,exclude) : undefined
 const proposed = { name, pierCustomerId } as Account['value']
 const rows: {id:string;revision:string;name:string}[] = []
 if (!companyIdentityChanged(before?.value,proposed)) return { candidates: rows,page,pageSize,hasNext:false }
 if(actor.staff&&actor.staff.accounts!=='all')fail('FORBIDDEN','Directory-wide duplicate review requires all-account manager authority.',403)

 let position = '', matched = 0
 while (rows.length<=pageSize) {
  const batch = await db.prepare('SELECT * FROM bw_accounts WHERE id>? ORDER BY id LIMIT 100').bind(position).all<any>()
  for (const raw of batch.results) {
   const row = parse(raw)
   if (row.id===exclude || !duplicateCompany(row.value,proposed)) continue
   if (matched++ >= (page-1)*pageSize) rows.push({id:row.id,revision:row.revision,name:row.value.name})
   if (rows.length>pageSize) break
  }
  if (batch.results.length<100) break
  position=batch.results.at(-1).id
 }
 return { candidates: rows.slice(0,pageSize),page,pageSize,hasNext:rows.length>pageSize }
}
