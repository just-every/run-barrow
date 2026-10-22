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
