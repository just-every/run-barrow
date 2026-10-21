// ACC-006: the one definition of which accounts a rep holds today. A rep holds an account through a dated
// primary assignment (the exact account, or every account whose profile territory equals the named territory) or a
// dated temporary coverage (the same, or everything another rep primarily holds). Dates are inclusive calendar days in
// the supplier's zone. Profile "assigned rep" text and territory text are metadata: only these rows grant anything.
import { now } from './clock'
import { supplierDate } from './model'

const dayPattern = /^\d{4}-\d{2}-\d{2}$/
/** Dates enter SQL as literals only after this exact check; they come from supplierDate or validated input. */
const literal = (today: string) => dayPattern.test(today) ? `'${today}'` : (() => { throw new Error('Invalid scope date') })()
/** AND as a scalar min(): D1 refuses expression trees deeper than 100 and a left-deep AND chain adds one level per term. */
export const allOf = (...terms: string[]) => terms.length === 1 ? `(${terms[0]})` : `min(${terms.map(term => `COALESCE((${term}),0)`).join(',')})`
const live = (alias: string, today: string) => allOf(`${alias}.state='active'`, `${alias}.starts_on<=${literal(today)}`, `(${alias}.ends_on IS NULL OR ${alias}.ends_on>=${literal(today)})`)
const matches = (alias: string, account: string) => `${alias}.target=CASE ${alias}.kind WHEN 'account' THEN ${account}.id WHEN 'territory' THEN json_extract(${account}.value_json,'$.territory') END`

/** True when `user` (an SQL expression for a user id) holds the account whose id is the SQL expression `accountId` on `today`.
 * One flat join: SQLite on D1 refuses expression trees deeper than 100, and report coverage repeats this per recipient. */
export function repHoldsSql(user: string, accountId: string, today: string) {
 return `EXISTS(SELECT 1 FROM bw_rep_assignments x JOIN bw_accounts ra ON ra.id=${accountId}
  LEFT JOIN bw_rep_assignments y ON ${allOf(`x.kind='rep'`, 'y.user_id=x.target', 'y.coverage=0', live('y', today))}
  WHERE ${allOf(`x.user_id=${user}`, live('x', today), `(${matches('x', 'ra')} OR y.id IS NOT NULL AND ${matches('y', 'ra')})`)})`
}
export const supplierToday = async () => supplierDate(await now())

export async function repAccountIds(db: D1Database, userId: string, today: string): Promise<string[]> {
 const rows = await db.prepare(`SELECT a.id FROM bw_accounts a WHERE ${repHoldsSql('?', 'a.id', today)} ORDER BY a.id`).bind(userId).all<{ id: string }>()
 return rows.results.map(row => row.id)
}
/** Territories whose every account is held; the report doors authorize a territory filter only for these. */
export async function coveredTerritories(db: D1Database, held: Set<string>): Promise<string[]> {
 const rows = await db.prepare("SELECT id,json_extract(value_json,'$.territory') AS territory FROM bw_accounts WHERE json_type(value_json,'$.territory')='text' AND length(json_extract(value_json,'$.territory'))>0").all<{ id: string; territory: string }>()
 const open = new Map<string, boolean>()
 for (const row of rows.results) open.set(row.territory, (open.get(row.territory) ?? true) && held.has(row.id))
 return [...open].filter(([, covered]) => covered).map(([name]) => name).sort()
}
export async function repEpoch(db: D1Database): Promise<number> {
 return (await db.prepare('SELECT value FROM bw_rep_epoch WHERE singleton=1').first<{ value: number }>())?.value ?? 0
}

/** An active Native member whose seed grant is the rep role, never a company buyer; the only people a rep route can name. */
export const activeRepSql = (p: string) => `(${p}.status='active' AND ${p}.role='member' AND EXISTS(SELECT 1 FROM bw_staff_members g WHERE g.user_id=${p}.id AND g.state='active' AND g.native_version=${p}.version
 AND json_extract(g.policy_json,'$.role')='rep' AND NOT EXISTS(SELECT 1 FROM bw_company_members cm WHERE cm.user_id=${p}.id OR cm.email_key=lower(trim(${p}.email)))
 AND NOT EXISTS(SELECT 1 FROM bw_company_invites ci WHERE ci.email_key=lower(trim(${p}.email)) OR ci.accepted_by=${p}.id)))`
/** True when user `p` is a rep who holds the account (SQL expression `accountId`) today through assignment or coverage. */
export const repRecipientSql = (p: string, accountId: string, today: string) => `(${activeRepSql(p)} AND ${repHoldsSql(`${p}.id`, accountId, today)})`

/** The commission label of the single primary rep who holds the account today, or null: coverage never moves attribution,
 * and two primary holders (a later territory edit) fall back to the account's recorded assigned-rep text. */
export async function attributedRep(db: D1Database, accountId: string, today: string): Promise<string | null> {
 const rows = (await db.prepare(`SELECT json_extract(g.policy_json,'$.commissionRep') AS label FROM bw_accounts a JOIN oa_operators p ON ${activeRepSql('p')}
  JOIN bw_staff_members g ON g.user_id=p.id WHERE a.id=? AND EXISTS(SELECT 1 FROM bw_rep_assignments x WHERE x.user_id=p.id AND x.coverage=0 AND ${live('x', today)} AND (${matches('x', 'a')}))`).bind(accountId).all<{ label: string | null }>()).results
 return rows.length === 1 && rows[0].label ? rows[0].label : null
}

export type CurrentRep = { userId: string; name: string; coverage: boolean; through?: string }
/** The people who hold an account today: primary assigned reps and covering reps, active Native staff only. */
export async function currentReps(db: D1Database, accountIds: string[], today: string): Promise<Map<string, CurrentRep[]>> {
 const result = new Map<string, CurrentRep[]>(accountIds.map(id => [id, []]))
 if (!accountIds.length) return result
 const rows = await db.prepare(`SELECT a.id AS account_id,p.id AS user_id,p.display_name,
  EXISTS(SELECT 1 FROM bw_rep_assignments x WHERE x.user_id=p.id AND x.coverage=0 AND ${live('x', today)} AND (${matches('x', 'a')})) AS primary_rep,
  (SELECT MAX(x.ends_on) FROM bw_rep_assignments x WHERE x.user_id=p.id AND x.coverage=1 AND ${live('x', today)}) AS through
  FROM bw_accounts a JOIN oa_operators p ON ${activeRepSql('p')} WHERE a.id IN (SELECT value FROM json_each(?))
  AND ${repHoldsSql('p.id', 'a.id', today)}
  ORDER BY a.id,primary_rep DESC,p.display_name,p.id`).bind(JSON.stringify(accountIds)).all<any>()
 for (const row of rows.results) result.get(row.account_id)!.push({ userId: row.user_id, name: row.display_name, coverage: !row.primary_rep, ...(!row.primary_rep ? { through: row.through } : {}) })
 return result
}
