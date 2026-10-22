import { readStaffGrant, staffGuard } from './staff-policy'
import { fail, type Actor } from './model'

/** ct 22 Oct: the owner grants these functional rights independently of report access. */
export function applicationAccess(actor: Pick<Actor, 'agent' | 'role' | 'staff'>): 'review' | 'documents' | null {
 if (actor.agent) return null
 if (actor.role === 'owner' || actor.role === 'admin') return 'review'
 const grant = actor.staff
 if (actor.role !== 'member' || !grant || grant.state !== 'active') return null
 if (grant.role === 'sales-manager' && grant.accounts === 'all' && grant.entitlements?.includes('applications')) return 'review'
 if (grant.role === 'finance' && grant.entitlements?.includes('application-documents')) return 'documents'
 return null
}
export function requireApplicationAccess(actor: Actor, decision = false) {
 const access = applicationAccess(actor)
 if (!access || decision && access !== 'review') fail('FORBIDDEN', 'Your current sign-in is not entitled to this application action.', 403)
 return access
}

/** Current Native identity and the exact functional grant, shared by routing and task assignment. */
export async function applicationReviewers(db: D1Database) {
 const native = (await db.prepare("SELECT id,email,display_name AS name,role,version FROM oa_operators WHERE status='active' ORDER BY role='owner' DESC,display_name,id").all<{id:string;email:string;name:string;role:string;version:number}>()).results
 const allowed = []
 for (const person of native) {
  const grant = await readStaffGrant(db, { ...person, agent: false })
  if (applicationAccess({ ...person, agent: false, staff: grant }) === 'review') allowed.push({ ...person, grant })
 }
 return allowed
}
export function applicationReviewerGuard(db: D1Database, person: Awaited<ReturnType<typeof applicationReviewers>>[number]) {
 return person.grant ? staffGuard(db, person.grant) : db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin')) THEN 1 ELSE 0 END").bind(person.id, person.version)
}
