// ACC-008: ORD-005's supplier-side quote notices reach the account's assigned or covering reps instead of every owner and
// admin. An account with no current rep keeps the owner/admin audience (null), and so does a discount waiting for approval,
// because the rep who proposed it cannot approve it.
import { currentReps, supplierToday } from './rep-scope'

/** User IDs the notice names, never the actor; null means the owner/admin audience. */
export async function supplierRoute(db: D1Database, accountId: string, actorId: string): Promise<string[] | null> {
 const reps = (await currentReps(db, [accountId], await supplierToday())).get(accountId) ?? []
 return reps.length ? reps.map(rep => rep.userId).filter(id => id !== actorId) : null
}
