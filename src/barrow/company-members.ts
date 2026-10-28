import { eraseReturnNarrative, eraseReturnAudit } from './return-claim-custody'
import { prepareLegacyErasure } from './legacy-erasure-journal'
import { applicationAccess } from './application-access'
import { readStaffGrant, staffGuard } from './staff-policy'
import { operatorMail } from '../mail.server.mjs'
import { type Bindings } from '../auth.server'
import { audit, changed, commit, digest } from './access'
import { fail, requirePerson, requireSupplier, supplier, text, type Actor } from './model'
import { companyEmail, companyMembership, companyRightsGuard, parseCompanyMember, requireCompanyRight, unlimitedCompanyPolicy, validateCompanyPolicy, type CompanyMembership } from './company-policy'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { toD1Sql } from '@runeditrun/rer/modules/erasure/fence'
import { portabilityPolicy } from './portability-policy.mjs'

export * from './company-policy'
import { endDelegations, refuseRouteReference } from './company-routes'
const week = 7 * 86400000
const missing = () => fail('NOT_FOUND', 'Company user not found.', 404)
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('')
const guard = (db: D1Database, sql: string, values: (string | number | null)[] = []) => db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN ${sql} THEN 1 ELSE 0 END`).bind(...values)
const currentMember = (db: D1Database, id: string) => db.prepare('SELECT * FROM bw_company_members WHERE id=?').bind(id).first<any>()
const hasAdministrator = `EXISTS(SELECT 1 FROM json_each(policy_json,'$.rights') WHERE value='administrator')`

/** The marker outlives removal; immutable account email is used only for migration. */
export async function bootstrapLegacyCompanyMembers(db: D1Database) {
 const [accounts, people] = await Promise.all([
  db.prepare('SELECT id,value_json,revision FROM bw_accounts WHERE id NOT IN (SELECT account_id FROM bw_company_legacy_accounts)').all<any>(),
  db.prepare("SELECT id,email,display_name FROM oa_operators WHERE role='member' AND status='active' AND id NOT IN (SELECT user_id FROM bw_staff_members)").all<any>(),
 ])
 for (const account of accounts.results) {
  const email = companyEmail(JSON.parse(account.value_json).email)
  const person = people.results.find(person => companyEmail(person.email) === email)
  if (!person) continue
  const at = new Date().toISOString(), id = `legacy:${person.id}`, revision = crypto.randomUUID()
  await db.batch([
   db.prepare(`INSERT OR IGNORE INTO bw_company_members(id,account_id,user_id,email,email_key,display_name,policy_json,state,revision,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,'active',?,?,? WHERE NOT EXISTS(SELECT 1 FROM bw_company_legacy_accounts WHERE account_id=?)
    AND NOT EXISTS(SELECT 1 FROM bw_company_members WHERE account_id=? OR (user_id=? AND state<>'removed'))
    AND EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?)
    AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='member' AND status='active')`)
    .bind(id, account.id, person.id, person.email, email, person.display_name, JSON.stringify(unlimitedCompanyPolicy), revision, at, at, account.id, account.id, person.id, account.id, account.revision, person.id, person.email),
   db.prepare('INSERT OR IGNORE INTO bw_company_legacy_accounts SELECT ? WHERE EXISTS(SELECT 1 FROM bw_company_members WHERE account_id=?)').bind(account.id, account.id),
  ])
 }
}
async function manage(db: D1Database, actor: Actor, accountId: string) {
 requirePerson(actor)
 if (!await db.prepare('SELECT 1 FROM bw_accounts WHERE id=?').bind(accountId).first()) fail('NOT_FOUND', 'Trade account not found.', 404)
 return requireCompanyRight(db, actor, accountId, 'administrator')
}
function preserveLastAdministrator(db: D1Database, member: CompanyMembership) {
 return guard(db, `NOT EXISTS(SELECT 1 FROM bw_company_members WHERE id=? AND state='active' AND ${hasAdministrator})
  OR EXISTS(SELECT 1 FROM bw_company_members m JOIN oa_operators p ON p.id=m.user_id WHERE m.account_id=? AND m.id<>?
   AND m.state='active' AND p.role='member' AND p.status='active' AND EXISTS(SELECT 1 FROM json_each(m.policy_json,'$.rights') WHERE value='administrator'))`, [member.id, member.accountId, member.id])
}
/** Reject supplier identities and every other company's contact-of-record or membership. */
export async function companyInvitationCollision(db: D1Database, accountId: string, email: string) {
 const [accounts, members, people] = await Promise.all([
  db.prepare("SELECT id,value_json FROM bw_accounts a WHERE id<>? AND NOT EXISTS(SELECT 1 FROM bw_company_members former WHERE former.account_id=a.id AND former.email_key=? AND former.state='removed')").bind(accountId,email).all<any>(),
  db.prepare("SELECT account_id,email_key FROM bw_company_members WHERE state IN ('invited','active') AND account_id<>?").bind(accountId).all<any>(),
  db.prepare('SELECT id,email,role,status FROM oa_operators').all<any>(),
 ])
 const person = people.results.find(row => companyEmail(row.email) === email)
 const staff=person&&await db.prepare('SELECT 1 FROM bw_staff_members WHERE user_id=?').bind(person.id).first()
 const reason = person && (person.role !== 'member'||staff) ? 'supplier identity'
  : accounts.results.some(row => companyEmail(JSON.parse(row.value_json).email) === email) || members.results.some(row => row.email_key === email) ? 'another trade account'
  : person && person.status !== 'active' ? 'existing identity requires supplier review' : null
 return { reason, person }
}
/** No tokens, collision status or delivery status are returned to company administrators. */
export async function readCompanyMembers(db: D1Database, actor: Actor, accountId: string) {
 await manage(db, actor, accountId)
 const rows = (await db.prepare('SELECT * FROM bw_company_members WHERE account_id=? AND state<>\'invited\' ORDER BY created_at,id').bind(accountId).all<any>()).results.map(parseCompanyMember)
 const invitations = (await db.prepare("SELECT id,email,display_name,created_at FROM bw_company_invites WHERE account_id=? AND status IN ('requested','collision') ORDER BY created_at,id").bind(accountId).all<any>()).results
 return { members: rows, invitations: invitations.map(row => ({ id: row.id, email: row.email, name: row.display_name, requestedAt: row.created_at, status: 'invitation requested' })) }
}
export async function readCompanyCollisions(db: D1Database, actor: Actor) {
 requireSupplier(actor)
 return (await db.prepare("SELECT id,account_id,email,display_name,collision_reason,created_at,created_by,reason,revision,delivery_status FROM bw_company_invites WHERE status='collision' OR delivery_status IN ('failed','unavailable') ORDER BY created_at,id").all()).results
}
/** A signed-in invitee alone may inspect an exact-email collision. */
export async function ownCompanyInvitations(db: D1Database, actor: Actor) {
 requirePerson(actor)
 const email = companyEmail(actor.email)
 const rows = (await db.prepare("SELECT id,account_id,email_key,status,expires_at FROM bw_company_invites WHERE email_key=? AND status IN ('requested','collision') AND expires_at>? ORDER BY created_at,id").bind(email, Date.now()).all<any>()).results
 return rows.map(row => ({ id: row.id, accountId: row.status === 'collision' ? undefined : row.account_id, status: row.status === 'collision' ? 'this email is linked to another trade account; ask your supplier' : 'invitation requested', expiresAt: row.expires_at }))
}
function locationGuard(db: D1Database, accountId: string, policy: Awaited<ReturnType<typeof validateCompanyPolicy>>) {
 const ids = [...new Set([...(policy.locations === 'all' ? [] : policy.locations), ...Object.keys(policy.locationLimits ?? {})])]
 return guard(db, `NOT EXISTS(SELECT 1 FROM json_each(?) requested WHERE NOT EXISTS(
  SELECT 1 FROM bw_locations WHERE id=requested.value AND account_id=? AND kind='ship-to' AND archived=0))`, [JSON.stringify(ids), accountId])
}
function withdrawMemberMail(db: D1Database, userId: string, accountId: string) {
 return db.prepare(`UPDATE bw_quote_mail SET status='withdrawn',reason='recipient no longer authorized',lease_until=0,updated_at=?
  WHERE recipient_id=? AND account_id=? AND status IN ('queued','not configured','rate_limited','uncertain') AND restored=0`).bind(new Date().toISOString(), userId, accountId)
}

export async function companyCommand(request: Request, env: Bindings, actor: Actor, type: string, p: any, imported?: {key:string;jobId:string;fingerprint:string;sourceJson:string;rejectCollisions?:boolean}) {
 requirePerson(actor)
 if (type === 'company.accept') return acceptCompanyInvitation(env, actor, p)
 if (type === 'company.erase') return eraseCompanyUser(env, actor, p)
 const accountId = text(p.accountId, 'Trade account'), manager = await manage(env.DB, actor, accountId)
 const reason = text(p.reason, 'Reason', 1000), at = new Date().toISOString(), revision = crypto.randomUUID()
 if (type === 'company.invite') {
  const email = companyEmail(text(p.email, 'Email', 254)), name = text(p.name, 'Name', 120)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('INPUT', 'Enter a valid email address.', 400)
  const identitySnapshot = await identityGuard(env.DB)
  const policy = await validateCompanyPolicy(env.DB, accountId, p.policy ?? p)
  if(imported){const previous=await env.DB.prepare('SELECT i.policy_json FROM bw_import_invitations link JOIN bw_company_invites i ON i.id=link.invitation_id WHERE link.source_key=?').bind(imported.key).first<{policy_json:string}>();if(previous){if(previous.policy_json!==JSON.stringify(policy))fail('IMPORT_INVITATION_CHANGED','This source invitation was already reviewed with different rights. Use the native company rights controls to change them.');return {status:'invitation requested',replayed:true}}}
  const match = await companyInvitationCollision(env.DB, accountId, email), id = crypto.randomUUID(), secret = token(), expiresAt = Date.now() + week
  const prior = await env.DB.prepare("SELECT * FROM bw_company_members WHERE email_key=? AND account_id=? AND state<>'removed'").bind(email, accountId).first<any>()
  // An active member is edited explicitly; invitation is still a uniform request.
  const previousCompany=!supplier(actor)&&await env.DB.prepare("SELECT 1 FROM bw_company_members WHERE email_key=? AND account_id<>?").bind(email,accountId).first()
  const blocked = match.reason ?? (previousCompany?'supplier review required for company transfer':null) ?? (prior?.state === 'active' ? 'already active in this company' : null)
  if ((blocked || prior) && imported?.rejectCollisions) fail('IMPORT_EMAIL_COLLISION', 'The reviewed buyer identity now needs supplier review; no invitation was sent.', 409)
  const userId = match.person?.id ?? crypto.randomUUID(), memberId = prior?.id ?? crypto.randomUUID()
  // Read snapshots are fenced in the same batch, including Unicode collision keys
  // which SQLite cannot independently normalize.
  const statements: D1PreparedStatement[] = [companyRightsGuard(env.DB, manager), identitySnapshot, locationGuard(env.DB, accountId, policy)]
  statements.push(env.DB.prepare("UPDATE bw_company_invites SET status='revoked',token_hash=NULL WHERE email_key=? AND account_id=? AND status='requested'").bind(email, accountId))
  if (!blocked) {
   // Native Base sign-in proves the email. Enrollment supplies no credentials,
   // sessions, supplier authority or active company access.
   if (!match.person) statements.push(env.DB.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(userId, email, name, Date.now()))
   if (prior) statements.push(env.DB.prepare("UPDATE bw_company_members SET policy_json=?,display_name=?,revision=?,updated_at=? WHERE id=? AND revision=? AND state='invited'").bind(JSON.stringify(policy), name, revision, at, prior.id, prior.revision), changed(env.DB))
   else statements.push(env.DB.prepare("INSERT INTO bw_company_members(id,account_id,user_id,email,email_key,display_name,policy_json,state,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'invited',?,?,?)").bind(memberId, accountId, userId, email, email, name, JSON.stringify(policy), revision, at, at))
  }
  statements.push(env.DB.prepare('INSERT INTO bw_company_invites(id,account_id,member_id,email,email_key,display_name,token_hash,policy_json,status,collision_reason,expires_at,created_by,issuer_version,issuer_member_revision,created_at,reason,revision,delivery_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id, accountId, blocked ? null : memberId, email, email, name, blocked ? null : await digest(secret), JSON.stringify(policy), blocked ? 'collision' : 'requested', blocked, expiresAt, actor.id, actor.version, manager?.revision ?? actor.staff?.revision ?? null, at, reason, revision, blocked ? 'not sent' : 'pending'),
   audit(env.DB, actor, id, 'company.invitation-requested', { accountId, revision, source: type, reason }))
  if(imported)statements.push(guard(env.DB,"EXISTS(SELECT 1 FROM bw_platform_imports WHERE id=? AND fingerprint=? AND source_json=?) AND EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND coalesce(json_extract(value_json,'$.lifecycle'),'active')<>'closed')",[imported.jobId,imported.fingerprint,imported.sourceJson,accountId]),env.DB.prepare('INSERT INTO bw_import_invitations VALUES(?,?,?,?)').bind(imported.key,imported.jobId,accountId,id))
  await commit(env.DB, actor, statements)
  if (!blocked) {
   // The seven-day company link survives native sign-in-link expiry. Normal Base
   // sign-in verifies this exact email before explicit company acceptance.
   const link=new URL('/app',env.AUTH_ORIGIN);link.searchParams.set('companyInvitation',id);link.searchParams.set('companyToken',secret)
   let delivery='not configured'
   try {
    const result=await operatorMail(env)?.send({deliveryId:id,from:env.MAIL_FROM??'',to:[email],subject:'Your company buyer invitation',text:`You have been invited to a trade account. Sign in with this email and review the invitation within seven days: ${link.href}`,html:`<p>You have been invited to a trade account. Sign in with this email and review the invitation within seven days.</p><p><a href="${link.href.replaceAll('&','&amp;').replaceAll('"','&quot;')}">Review company invitation</a></p>`,headers:{}})
    delivery=result?.status==='development'?'development, not delivered':result?.status??'not configured'
   } catch {delivery='uncertain'}
   await env.DB.prepare('UPDATE bw_company_invites SET delivery_status=? WHERE id=?').bind(delivery, id).run()
  }
  return { status: 'invitation requested' }
 }
 const row = await currentMember(env.DB, text(p.memberId, 'Company user'))
 if (!row || row.account_id !== accountId) missing()
 const member = parseCompanyMember(row)
 if (p.revision !== member.revision || member.state === 'removed' || member.erasedAt) fail('CHANGED', 'Refresh the current company user before changing rights.')
 if (type === 'company.update') {
  const policy = await validateCompanyPolicy(env.DB, accountId, p.policy ?? p)
  if (!policy.rights.includes('approver')) await refuseRouteReference(env.DB, accountId, member.userId)
  await commit(env.DB, actor, [companyRightsGuard(env.DB, manager), locationGuard(env.DB, accountId, policy),
   ...(!policy.rights.includes('approver') ? [endDelegations(env.DB, member.userId, revision)] : []),
   ...(!policy.rights.includes('administrator') ? [preserveLastAdministrator(env.DB, member)] : []),
   env.DB.prepare("UPDATE bw_company_members SET policy_json=?,revision=?,updated_at=? WHERE id=? AND revision=? AND state<>'removed'").bind(JSON.stringify(policy), revision, at, member.id, member.revision), changed(env.DB),
   env.DB.prepare("UPDATE bw_company_invites SET policy_json=?,revision=? WHERE member_id=? AND status='requested'").bind(JSON.stringify(policy), revision, member.id),
   ...(!policy.rights.some(right => right === 'purchaser' || right === 'approver') ? [withdrawMemberMail(env.DB, member.userId, accountId)] : []),
   audit(env.DB, actor, member.id, 'company.rights-changed', { accountId, revision, source: type, reason })])
  return parseCompanyMember(await currentMember(env.DB, member.id))
 }
 if (type === 'company.remove') {
  await refuseRouteReference(env.DB, accountId, member.userId)
  await commit(env.DB, actor, [companyRightsGuard(env.DB, manager), preserveLastAdministrator(env.DB, member), endDelegations(env.DB, member.userId, revision),
   env.DB.prepare("UPDATE bw_company_members SET state='removed',revision=?,updated_at=? WHERE id=? AND revision=? AND state<>'removed'").bind(revision, at, member.id, member.revision), changed(env.DB),
   env.DB.prepare("UPDATE bw_company_invites SET status='revoked',token_hash=NULL WHERE member_id=? AND status='requested'").bind(member.id),
   withdrawMemberMail(env.DB, member.userId, accountId),
   audit(env.DB, actor, member.id, 'company.user-removed', { accountId, revision, source: type, reason })])
  return { id: member.id, state: 'removed', revision }
 }
 fail('COMMAND', 'Unknown company command.', 404)
}

/** Capture all identity claims after validation; any race aborts, never joins. */
async function identityGuard(db: D1Database) {
 const queries = [
  "SELECT id,revision,value_json FROM bw_accounts ORDER BY id",
  "SELECT id,user_id,email_key,state,revision FROM bw_company_members ORDER BY id",
  "SELECT id,email,role,status,version FROM oa_operators ORDER BY id",
 ]
 const results = await Promise.all(queries.map(sql => db.prepare(sql).all<any>()))
 const predicates = queries.map((sql, index) => `(SELECT json_group_array(json(row)) FROM (SELECT json_object(${Object.keys(results[index].results[0] ?? (index === 0 ? {id:0,revision:0,value_json:0} : index === 1 ? {id:0,user_id:0,email_key:0,state:0,revision:0} : {id:0,email:0,role:0,status:0,version:0})).map(key => `'${key}',${key}`).join(',')}) AS row FROM (${sql})))=json(?)`)
 return guard(db, predicates.join(' AND '), results.map(result => JSON.stringify(result.results)))
}

async function acceptCompanyInvitation(env: Bindings, actor: Actor, p: any) {
 if (actor.role !== 'member') fail('FORBIDDEN', 'Supplier people cannot be company users.', 403)
 const invite = await env.DB.prepare('SELECT * FROM bw_company_invites WHERE id=?').bind(text(p.invitationId, 'Invitation')).first<any>()
 if (!invite || invite.email_key !== companyEmail(actor.email)) fail('NOT_FOUND', 'Company invitation not found.', 404)
 if (invite.status === 'collision') fail('COMPANY_COLLISION', 'This email is linked to another trade account; ask your supplier.', 409)
 if (invite.status !== 'requested' || invite.expires_at <= Date.now() || typeof p.token !== 'string' || await digest(p.token) !== invite.token_hash) fail('INVITATION_EXPIRED', 'This invitation was used, revoked or expired. Ask for a new invitation.', 409)
 const identitySnapshot = await identityGuard(env.DB)
 const match = await companyInvitationCollision(env.DB, invite.account_id, invite.email_key)
 if (match.reason || match.person?.id !== actor.id) fail('COMPANY_COLLISION', 'This email is linked to another trade account; ask your supplier.', 409)
 const issuer = await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(invite.created_by).first<any>()
 if (!issuer || issuer.version !== invite.issuer_version) fail('INVITATION_REVOKED', 'The inviter no longer has the invitation’s original authority.', 409)
 // ACC-005 application approval may invite the first company buyer, without granting Native administration.
 const issuerStaff = await readStaffGrant(env.DB, {...issuer, agent:false})
 if(issuerStaff) {
  const approved = await env.DB.prepare("SELECT 1 FROM bw_applications a JOIN bw_application_history h ON h.application_id=a.id WHERE a.account_id=? AND a.state='approved' AND json_extract(a.value_json,'$.email')=? AND h.state='approved' AND h.actor_id=?").bind(invite.account_id,invite.email_key,issuer.id).first()
  if(applicationAccess({...issuer,agent:false,staff:issuerStaff})!=='review' || issuerStaff.revision!==invite.issuer_member_revision || !approved) fail('INVITATION_REVOKED', 'The application reviewer no longer holds this invitation’s original authority.', 409)
  issuer.staff=issuerStaff
 }
 const issuerMembership = supplier(issuer) ? null : await companyMembership(env.DB, {...issuer,agent:false}, invite.account_id)
 if (!supplier(issuer) && (!issuerMembership?.rights.includes('administrator') || issuerMembership.revision !== invite.issuer_member_revision)) fail('INVITATION_REVOKED', 'The inviter no longer has the invitation’s original company administrator rights.', 409)
 const member = await currentMember(env.DB, invite.member_id)
 if (!member || member.user_id !== actor.id || member.state !== 'invited') fail('INVITATION_REVOKED', 'The invitation no longer has a pending company user.', 409)
 const revision = crypto.randomUUID(), at = new Date().toISOString()
 await commit(env.DB, actor, [identitySnapshot, companyRightsGuard(env.DB, issuerMembership), ...(issuerStaff?[staffGuard(env.DB,issuerStaff)]:[]),
  guard(env.DB, "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role=? AND status='active')", [issuer.id, issuer.version, issuer.role]),
  env.DB.prepare("UPDATE bw_company_invites SET status='accepted',token_hash=NULL,accepted_by=?,revision=? WHERE id=? AND revision=? AND status='requested' AND expires_at>? AND token_hash=?").bind(actor.id, revision, invite.id, invite.revision, Date.now(), invite.token_hash), changed(env.DB),
  env.DB.prepare("UPDATE bw_company_members SET state='active',revision=?,updated_at=? WHERE id=? AND revision=? AND state='invited'").bind(revision, at, member.id, member.revision), changed(env.DB),
  env.DB.prepare('INSERT OR IGNORE INTO bw_company_legacy_accounts VALUES(?)').bind(invite.account_id),
  audit(env.DB, actor, member.id, 'company.invitation-accepted', { accountId: invite.account_id, revision, source: 'company.accept', reason: 'Signed-in Base member accepted the exact-email, single-use company invitation.' })])
 return parseCompanyMember(await currentMember(env.DB, member.id))
}

/** Identity redaction retains every commercial row and opaque actor ID. The
 * seven-year financial floor is untouched; a hold blocks even this redaction.
 * Portability's real redaction checkpoint refuses older archives on restore. */
export async function eraseCompanyUser(env: Bindings, actor: Actor, p: any) {
 requireSupplier(actor)
 if (actor.role !== 'owner') fail('FORBIDDEN', 'Only the owner may erase a company user.', 403)
 if (p.confirm !== 'ERASE') fail('CONFIRM', 'Type ERASE to erase this company user.', 400)
 const row = await currentMember(env.DB, text(p.memberId, 'Company user'))
 if (!row) missing()
 const member = parseCompanyMember(row), reason = text(p.reason, 'Erasure reason', 1000)
 if (p.revision !== member.revision) fail('CHANGED', 'Refresh the company user before erasing.')
 if (await env.DB.prepare('SELECT 1 FROM bw_retention_requests WHERE held=1 AND account_id IN (SELECT account_id FROM bw_company_members WHERE user_id=?)').bind(member.userId).first()) fail('LEGAL_HOLD', 'Preserve this company user under a company’s held erasure request.')
 await refuseRouteReference(env.DB, member.accountId, member.userId)
 const at = new Date().toISOString(), revision = crypto.randomUUID(), former = 'Former company user', email = `former-${member.userId.replace(/[^A-Za-z0-9-]/g, '')}@invalid.invalid`
 const person = await env.DB.prepare('SELECT email,display_name FROM oa_operators WHERE id=?').bind(member.userId).first<any>()
 const originals = [...new Set([member.email, person?.email, member.name, person?.display_name].filter((value): value is string => typeof value === 'string' && value.length > 0))]
 const redact = (value: unknown, field = ''): any => {
  // IDs, hashes and commercial product identifiers must never change because
  // someone's display name happens to equal part of an identifier.
  if (/^(id|by|sku|itemId|unit|reference|sha256|contentSha256)$|Id$|By$/.test(field)) return value
  if (typeof value === 'string') return originals.reduce((result, original) => original.includes('@') ? result.replaceAll(original, email) : result === original ? former : result, value)
  if (Array.isArray(value)) return value.map(item => redact(item, field))
  return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, key)])) : value
 }
 const sourceCustody="SELECT p.id FROM bw_platform_imports p WHERE EXISTS(SELECT 1 FROM json_tree(p.source_json) value WHERE value.type='text' AND lower(value.atom)=?)"
 const statements: D1PreparedStatement[] = [guard(env.DB, `NOT EXISTS(
  SELECT 1 FROM bw_company_members target WHERE target.user_id=? AND target.state='active'
  AND EXISTS(SELECT 1 FROM json_each(target.policy_json,'$.rights') WHERE value='administrator')
  AND NOT EXISTS(SELECT 1 FROM bw_company_members other JOIN oa_operators p ON p.id=other.user_id
   WHERE other.account_id=target.account_id AND other.user_id<>target.user_id AND other.state='active'
   AND p.role='member' AND p.status='active' AND EXISTS(SELECT 1 FROM json_each(other.policy_json,'$.rights') WHERE value='administrator')))`, [member.userId]),
  guard(env.DB, 'NOT EXISTS(SELECT 1 FROM bw_retention_requests WHERE held=1 AND account_id IN (SELECT account_id FROM bw_company_members WHERE user_id=?))', [member.userId]),
  guard(env.DB, 'EXISTS(SELECT 1 FROM bw_company_members WHERE id=? AND revision=?)', [member.id, member.revision]),
  env.DB.prepare("UPDATE bw_company_members SET email=?,email_key=?,display_name=?,state='removed',revision=?,erased_at=?,updated_at=? WHERE user_id=?").bind(email, email, former, revision, at, at, member.userId),
  env.DB.prepare("UPDATE bw_company_invites SET email=?,email_key=?,display_name=?,status='revoked',token_hash=NULL,delivery_status='withdrawn' WHERE email_key=? OR member_id IN (SELECT id FROM bw_company_members WHERE user_id=?)").bind(email, email, former, companyEmail(member.email), member.userId),
  env.DB.prepare('INSERT INTO bw_erasure_receipts VALUES(?,?,?,?,?,?,?)').bind(revision,member.id,member.accountId,'company-user',actor.id,at,reason),
  endDelegations(env.DB, member.userId, revision),
  env.DB.prepare('DELETE FROM bw_lists WHERE created_by=? AND json_extract(value_json,\'$.shared\')=0').bind(member.userId),
  withdrawMemberMail(env.DB, member.userId, member.accountId),
  env.DB.prepare(`DELETE FROM bw_import_history WHERE import_id IN (${sourceCustody})`).bind(companyEmail(member.email)),
  env.DB.prepare(`UPDATE bw_platform_imports SET source_json='{}',report_json='{}' WHERE id IN (${sourceCustody})`).bind(companyEmail(member.email)),
  env.DB.prepare('DELETE FROM bw_usage_acceptances WHERE user_id=?').bind(member.userId),env.DB.prepare('DELETE FROM bw_profile_approvals WHERE user_id=?').bind(member.userId),
  env.DB.prepare('DELETE FROM bw_approval_notices WHERE recipient_id=? OR delegated_from=?').bind(member.userId, member.userId),
 ]
 // Use snapshot revisions so an order edit racing the review cannot be lost.
 for (const table of ['bw_orders', 'bw_quotes', 'bw_lists', 'bw_return_claims']) {
  const rows = (await env.DB.prepare(`SELECT id,value_json,revision FROM ${table}`).all<any>()).results
  for (const record of rows) {
   if (table === 'bw_lists' && JSON.parse(record.value_json).createdBy === member.userId && !JSON.parse(record.value_json).shared) continue
   const redacted=redact(JSON.parse(record.value_json))
   const value = JSON.stringify(table==='bw_return_claims'?eraseReturnNarrative(redacted,member.userId):redacted)
   if (value !== record.value_json) statements.push(env.DB.prepare(`UPDATE ${table} SET value_json=?,revision=? WHERE id=? AND revision=?`).bind(value, crypto.randomUUID(), record.id, record.revision), changed(env.DB))
  }
 }
 // Confirmations retain amounts and their immutable order identities, but not
 // the erased person's printed-name attribution copied at submission.
 const confirmations=(await env.DB.prepare('SELECT order_id,number,value_json FROM bw_confirmations').all<any>()).results
 for(const record of confirmations){const value=JSON.stringify(redact(JSON.parse(record.value_json)));if(value!==record.value_json)statements.push(env.DB.prepare('UPDATE bw_confirmations SET value_json=? WHERE order_id=? AND number=? AND value_json=?').bind(value,record.order_id,record.number,record.value_json),changed(env.DB))}
 for(const table of ['bw_quote_notices','bw_quote_mail','bw_audit']) {
  const rows=(await env.DB.prepare(`SELECT id,${table==='bw_audit'?'context_json AS content,actor_id,action':'summary AS content'} FROM ${table}`).all<any>()).results
  for(const row of rows){
   if(!row.content)continue
   const content=table==='bw_audit'&&row.actor_id===member.userId?JSON.stringify(eraseReturnAudit(JSON.parse(row.content),row.action)):row.content
   const value=originals.reduce((v,original)=>v.replaceAll(original,original.includes('@')?email:former),content)
   if(value!==row.content)statements.push(env.DB.prepare(`UPDATE ${table} SET ${table==='bw_audit'?'context_json':'summary'}=? WHERE id=? AND ${table==='bw_audit'?'context_json':'summary'}=?`).bind(value,row.id,row.content),changed(env.DB))
  }
 }
 // Every exact actor reference stays opaque; only its saved identifying text goes.
 statements.push(env.DB.prepare('UPDATE bw_quote_entries SET author_email=?,body=replace(body,?,?) WHERE author_id=?').bind(email,member.email,email,member.userId),
  env.DB.prepare('UPDATE bw_quote_mail SET recipient=NULL,submission_json=NULL,sender_result_json=NULL WHERE recipient_id=?').bind(member.userId),
  env.DB.prepare("DELETE FROM oa_dev_credentials WHERE (credential='oa_sessions' AND id IN (SELECT id FROM oa_sessions WHERE operator_id=?)) OR (credential='oa_tokens' AND id IN (SELECT id FROM oa_tokens WHERE operator_id=?)) OR (credential='oa_credentials' AND id IN (SELECT id FROM oa_credentials WHERE operator_id=?))").bind(member.userId,member.userId,member.userId),
  env.DB.prepare('DELETE FROM oa_provider_session_pins WHERE session_id IN (SELECT id FROM oa_sessions WHERE operator_id=?)').bind(member.userId),
  env.DB.prepare('DELETE FROM oa_provider_sessions WHERE session_id IN (SELECT id FROM oa_sessions WHERE operator_id=?)').bind(member.userId),
  env.DB.prepare('DELETE FROM oa_sessions WHERE operator_id=?').bind(member.userId),
  env.DB.prepare('DELETE FROM oa_tokens WHERE operator_id=?').bind(member.userId),
  env.DB.prepare('DELETE FROM oa_credentials WHERE operator_id=?').bind(member.userId),
  env.DB.prepare('DELETE FROM oa_step_up_challenges WHERE operator_id=?').bind(member.userId),
  env.DB.prepare('DELETE FROM oa_external_identities WHERE operator_id=?').bind(member.userId),
  env.DB.prepare("UPDATE oa_operators SET email=?,display_name=?,status='inactive' WHERE id=? AND role='member'").bind(email, former, member.userId))
 const portability = await createPortability({ db: env.DB, policy: portabilityPolicy })
 const checkpoint = [...await portability.invalidateTransfersStatements(), ...await portability.redactionStatements()].map(toD1Sql).map(statement => env.DB.prepare(statement.sql).bind(...(statement.params ?? [])))
 const journal=await prepareLegacyErasure(env,actor,'company-user',member.accountId,{userId:member.userId,email:member.email,name:member.name,reason},{id:revision,memberId:member.id,userId:member.userId,erasedAt:at,erasedBy:actor.id,commercialHistory:'preserved under the seven-year financial floor'})
 await journal.run(()=>commit(env.DB, actor, [...statements, ...checkpoint, env.DB.prepare(journal.statement.sql).bind(...journal.statement.params!), audit(env.DB, actor, member.id, 'company.user-erased', { accountId: member.accountId, revision, source: 'company.erase', reason })]))
 return { id: member.id, userId: member.userId, name: former, erasedAt: at, revision, commercialHistory: 'preserved under the seven-year financial floor' }
}
