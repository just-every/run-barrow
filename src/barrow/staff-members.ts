import { operatorAuth, type Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { companyEmail } from './company-policy'
import { fail, text, type Actor } from './model'
import { parseStaffGrant, readStaffGrant, staffPolicyJson, validateStaffPolicy, type StaffGrant } from './staff-policy'

export * from './staff-policy'
const owner = (actor: Actor) => { if (actor.agent || actor.role !== 'owner') fail('FORBIDDEN', 'Only the signed-in owner may manage functional staff grants.', 403) }
const guard = (db: D1Database, sql: string, values: (string | number | null)[] = []) => db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN ${sql} THEN 1 ELSE 0 END`).bind(...values)
const selected = (db: D1Database, userId: string) => db.prepare('SELECT * FROM bw_staff_members WHERE user_id=?').bind(userId).first<any>()
const personFor = (db: D1Database, userId: string) => db.prepare('SELECT id,email,display_name,role,status,version FROM oa_operators WHERE id=?').bind(userId).first<any>()

/** Snapshot all company history, including removed people and withdrawn invites.
 * DB-generated JSON gives the guard the same exact byte order as this read. */
async function companySnapshot(db: D1Database) {
 const tables = ['bw_accounts', 'bw_company_members', 'bw_company_invites'] as const
 const reads = await Promise.all(tables.map(table => db.prepare(`SELECT COALESCE(json_group_array(json(row)), '[]') AS snapshot FROM (SELECT json_object(${table === 'bw_accounts' ? "'id',id,'value',value_json,'revision',revision" : table === 'bw_company_members' ? "'id',id,'user',user_id,'email',email_key,'revision',revision,'state',state" : "'id',id,'email',email_key,'accepted',accepted_by,'revision',revision,'status',status"}) AS row FROM ${table} ORDER BY id)`).first<{snapshot:string}>()))
 return tables.map((table, index) => {
  const keys = table === 'bw_accounts' ? "'id',id,'value',value_json,'revision',revision" : table === 'bw_company_members' ? "'id',id,'user',user_id,'email',email_key,'revision',revision,'state',state" : "'id',id,'email',email_key,'accepted',accepted_by,'revision',revision,'status',status"
  return guard(db, `(SELECT COALESCE(json_group_array(json(row)), '[]') FROM (SELECT json_object(${keys}) AS row FROM ${table} ORDER BY id))=?`, [reads[index]!.snapshot])
 })
}
async function refuseCompanyIdentity(db: D1Database, email: string, userId?: string) {
 const [accounts, members, invitations] = await Promise.all([
  db.prepare('SELECT value_json FROM bw_accounts').all<{value_json:string}>(),
  db.prepare('SELECT user_id,email,email_key FROM bw_company_members').all<any>(),
  db.prepare('SELECT email,email_key,accepted_by FROM bw_company_invites').all<any>(),
 ])
 if (accounts.results.some(row => companyEmail(JSON.parse(row.value_json).email) === email)
  || members.results.some(row => row.user_id === userId || companyEmail(row.email_key) === email || companyEmail(row.email) === email)
  || invitations.results.some(row => userId && row.accepted_by === userId || companyEmail(row.email_key) === email || companyEmail(row.email) === email)) fail('STAFF_COLLISION', 'This identity or email has company buyer history or is a trade-account contact. Staff authority requires a separate identity.', 409)
}
function nativeGuard(db: D1Database, person: any) {
 return guard(db, "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='member' AND status=? AND version=?)", [person.id, person.email, person.status, person.version])
}
function accountsGuard(db: D1Database, grant: {accounts: StaffGrant['accounts']}) {
 return guard(db, 'NOT EXISTS(SELECT 1 FROM json_each(?) requested WHERE NOT EXISTS(SELECT 1 FROM bw_accounts a WHERE a.id=requested.value))', [JSON.stringify(grant.accounts === 'all' ? [] : grant.accounts)])
}
/** Pending identities are labelled invited; an active row alone grants nothing. */
export async function readStaffMembers(db: D1Database, actor: Actor) {
 owner(actor)
 const rows = (await db.prepare(`SELECT g.*,p.email,p.display_name,p.status,p.role AS native_role,p.version AS current_native_version
  FROM bw_staff_members g LEFT JOIN oa_operators p ON p.id=g.user_id ORDER BY g.created_at,g.user_id`).all<any>()).results
 return Promise.all(rows.map(async row => ({ ...parseStaffGrant(row), email: row.email ?? null, name: row.display_name ?? null, status: row.status ?? 'unavailable',
  effective: row.status === 'active' && Boolean(await readStaffGrant(db, { id: row.user_id, email: row.email, role: row.native_role, version: row.current_native_version, agent: false })),
  createdAt: row.created_at, updatedAt: row.updated_at })))
}
export async function staffCommand(request: Request, env: Bindings, actor: Actor, type: string, p: any) {
 owner(actor)
 if (!['staff.invite', 'staff.update', 'staff.revoke'].includes(type)) fail('COMMAND', 'Unknown staff command.', 404)
 const reason = text(p.reason, 'Reason', 1000), revision = crypto.randomUUID(), at = new Date().toISOString()
 if (type === 'staff.invite') {
  const email = companyEmail(text(p.email, 'Email', 254)), name = text(p.name, 'Name', 120)
  if (!/^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/.test(email) || /[\x00-\x1f]/.test(name)) fail('INPUT', 'Use a valid exact email and display name.', 400)
  const policy = await validateStaffPolicy(env.DB, p.policy), snapshot = await companySnapshot(env.DB)
  await refuseCompanyIdentity(env.DB, email)
  const people = (await env.DB.prepare('SELECT id,email,role,status,version FROM oa_operators').all<any>()).results
  const matches = people.filter(person => companyEmail(person.email) === email)
  if (matches.length > 1 || matches.some(person => person.role !== 'member' || !['invited', 'active'].includes(person.status) || person.email !== email)) fail('STAFF_COLLISION', 'This existing identity requires owner identity review before a staff grant.', 409)
  const priorPerson = matches[0]
  if (priorPerson && await selected(env.DB, priorPerson.id)) fail('CHANGED', 'This identity already has a staff record; update its current revision explicitly.')
  // Base owns the seven-day invitation, confirmation and session. An existing
  // active native member already proved this email; an explicit grant sends no mail.
  const invited = !priorPerson || priorPerson.status === 'invited'
  if (invited) await operatorAuth(env).invite(request, { email, displayName: name, role: 'member', returnTo: '/app' })
  const person = await env.DB.prepare('SELECT id,email,display_name,role,status,version FROM oa_operators WHERE email=?').bind(email).first<any>()
  if (!person || person.role !== 'member' || !['invited', 'active'].includes(person.status) || priorPerson && (person.id !== priorPerson.id || person.version !== priorPerson.version)) fail('CHANGED', 'The Native invitation identity changed; refresh before granting authority.')
  await refuseCompanyIdentity(env.DB, email, person.id)
  const nativeVersion = person.version + (person.status === 'invited' ? 1 : 0)
  await commit(env.DB, actor, [...snapshot, nativeGuard(env.DB, person), accountsGuard(env.DB, policy),
   guard(env.DB, 'NOT EXISTS(SELECT 1 FROM bw_staff_members WHERE user_id=?)', [person.id]),
   env.DB.prepare("INSERT INTO bw_staff_members(user_id,policy_json,state,revision,native_version,created_at,updated_at) VALUES(?,?,'active',?,?,?,?)").bind(person.id, staffPolicyJson(policy), revision, nativeVersion, at, at),
   audit(env.DB, actor, person.id, 'staff.granted', { revision, source: type, reason }),
   ...(invited ? [audit(env.DB, actor, person.id, 'staff.invitation-requested', { revision, source: type, reason: 'Owner explicitly requested a Native seven-day staff invitation; this records a request, not delivery.' })] : []),
  ])
  return { ...parseStaffGrant(await selected(env.DB, person.id)), status: person.status, effective: person.status === 'active', invitation: invited ? 'requested' : 'existing active identity; no invitation sent' }
 }
 const userId = text(p.userId, 'Staff user ID'), row = await selected(env.DB, userId)
 if (!row) fail('NOT_FOUND', 'Staff user not found.', 404)
 if (typeof p.revision !== 'string' || p.revision !== row.revision) fail('CHANGED', 'Refresh this staff grant before changing its current revision.')
 if (type === 'staff.revoke') {
  if (row.state !== 'active') fail('CHANGED', 'This staff grant is already revoked.')
  await commit(env.DB, actor, [env.DB.prepare("UPDATE bw_staff_members SET state='revoked',revision=?,updated_at=? WHERE user_id=? AND revision=? AND state='active'").bind(revision, at, userId, row.revision), changed(env.DB), audit(env.DB, actor, userId, 'staff.revoked', { revision, source: type, reason })])
  return { ...parseStaffGrant({ ...row, state: 'revoked', revision }), effective: false }
 }
 const policy = await validateStaffPolicy(env.DB, p.policy), snapshot = await companySnapshot(env.DB), person = await personFor(env.DB, userId)
 if (!person || person.role !== 'member' || !['invited', 'active'].includes(person.status)) fail('STAFF_COLLISION', 'Only an invited or active Native member can receive functional staff authority.', 409)
 await refuseCompanyIdentity(env.DB, companyEmail(person.email), userId)
 const nativeVersion = person.version + (person.status === 'invited' ? 1 : 0)
 await commit(env.DB, actor, [...snapshot, nativeGuard(env.DB, person), accountsGuard(env.DB, policy),
  env.DB.prepare("UPDATE bw_staff_members SET policy_json=?,state='active',revision=?,native_version=?,updated_at=? WHERE user_id=? AND revision=?").bind(staffPolicyJson(policy), revision, nativeVersion, at, userId, row.revision), changed(env.DB),
  audit(env.DB, actor, userId, 'staff.rights-changed', { revision, source: type, reason }),
 ])
 return { ...policy, userId, revision, nativeVersion, state: 'active' as const, status: person.status, effective: person.status === 'active' }
}
