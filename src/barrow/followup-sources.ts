import type { AccountValue, Order } from './model'
import type { Quote } from './quotes'
import { applicationTaskId, escalatedView } from './application-followup'
import { supplierDate } from './model'

export type FollowupKind = 'approval' | 'quote' | 'cart' | 'dormant' | 'quote-mail' | 'application' | 'visit'
export type FollowupSource = { id: string; kind: FollowupKind; accountId: string; sourceId: string; sourcePath: string; title: string; reason: string; priority: number }
const day = 86400000
/** AUTO-002: the exact reason a submitted order still waits for supplier approval, checked the way approval checks it. */
function supplierApprovalCause(order: Order, account: { value_json: string; revision: string } | undefined) {
 if (!account) return 'The trade account is no longer recorded.'
 const lifecycle = (JSON.parse(account.value_json) as AccountValue).lifecycle ?? 'active'
 if (lifecycle !== 'active') return `The account is ${lifecycle.replace('-', ' ')}; a first approval is refused until it is active again.`
 if (account.revision !== order.accountRevision) return 'The account changed after submission (prices, terms or profile); approval is refused until the buyer prepares a new draft.'
 return 'No supplier approver has approved it yet: an owner, an admin, or a sales manager or operations person with every warehouse approves it and reserves stock.'
}
export async function followupSources(db: D1Database, at: Date) {
 const [quoteRows, orderRows, accountRows, auditRows] = await Promise.all([
  db.prepare('SELECT value_json FROM bw_quotes').all<{ value_json: string }>(),
  db.prepare('SELECT value_json FROM bw_orders').all<{ value_json: string }>(),
  db.prepare('SELECT id,value_json,revision FROM bw_accounts').all<{ id: string; value_json: string; revision: string }>(),
  db.prepare("SELECT subject_id,action,MIN(created_at) AS created_at FROM bw_audit WHERE action IN ('account.saved','order.submitted','order.submitted-release') GROUP BY subject_id,action").all<{ subject_id: string; action: string; created_at: string }>(),
 ])
 const orders = orderRows.results.map(row => JSON.parse(row.value_json) as Order), accountsById = new Map(accountRows.results.map(row => [row.id, row]))
 const created = new Map(auditRows.results.filter(row => row.action === 'account.saved').map(row => [row.subject_id, row.created_at]))
 const submissions = new Map<string, string>()
 for (const row of auditRows.results.filter(row => row.action !== 'account.saved')) {
  if (!submissions.has(row.subject_id) || row.created_at < submissions.get(row.subject_id)!) submissions.set(row.subject_id, row.created_at)
 }
 const candidates: FollowupSource[] = [], resolved = new Map<string, string>(), unknownAge: string[] = []
 const age = (value: string) => at.getTime() - Date.parse(value)
 for (const row of quoteRows.results) {
  const quote = JSON.parse(row.value_json) as Quote, id = `quote:${quote.id}`
  if (quote.status === 'accepted' || quote.accepted) { resolved.set(id, 'Quote accepted.'); continue }
  if (['requested', 'proposed', 'awaiting-approval'].includes(quote.status)) candidates.push({ id, kind: 'quote', accountId: quote.accountId, sourceId: quote.id, sourcePath: `/api/barrow/quotes/${quote.id}`, title: `Unanswered quote ${quote.id}`, reason: `Quote remains ${quote.status}; latest activity ${quote.revisions.at(-1)?.proposedAt ?? quote.requestedAt}.`, priority: 2 })
 }
 for (const order of orders) {
  if (order.status !== 'draft') resolved.set(`cart:${order.id}`, `Draft became ${order.status}.`)
  if (['reserving', 'shortfall', 'approved', 'releasing', 'cancelled', 'superseded'].includes(order.status)) resolved.set(`approval:${order.id}`, `Order became ${order.status}.`)
  if (order.status === 'draft' && age(order.preparedAt) > 7 * day) candidates.push({ id: `cart:${order.id}`, kind: 'cart', accountId: order.accountId, sourceId: order.id, sourcePath: `/api/barrow/orders/${order.id}`, title: `Abandoned cart ${order.reference || order.id}`, reason: `Unsubmitted draft prepared ${order.preparedAt}, more than seven elapsed days ago.`, priority: 3 })
  // A request a company released reaches the supplier at its company approval.
  const submittedAt = submissions.get(order.id) ?? order.companyApprovedAt
  if (order.status === 'submitted' && submittedAt && age(submittedAt) > day) candidates.push({ id: `approval:${order.id}`, kind: 'approval', accountId: order.accountId, sourceId: order.id, sourcePath: `/api/barrow/orders/${order.id}`, title: `Overdue approval ${order.reference || order.id}`, reason: `Submitted ${submittedAt}; awaiting supplier approval for more than 24 elapsed hours. Blocking: ${supplierApprovalCause(order, accountsById.get(order.accountId))}`, priority: 1 })
  if (order.status === 'submitted' && !submittedAt) unknownAge.push(`Order ${order.id}: submission time not recorded.`)
 }
 for (const row of accountRows.results) {
  const account = JSON.parse(row.value_json) as AccountValue, id = `dormant:${row.id}`
  if ((account.lifecycle ?? 'active') !== 'active') { resolved.set(id, 'Account is no longer active.'); continue }
  const mine = orders.filter(order => order.accountId === row.id && (order.submittedBy || !['draft', 'superseded'].includes(order.status)))
  const dates = mine.map(order => submissions.get(order.id)).filter((value): value is string => Boolean(value)).sort()
  const since = dates.at(-1) ?? (mine.length ? undefined : created.get(row.id))
  if (!since) { unknownAge.push(`Account ${row.id}: ${mine.length ? 'submission' : 'creation'} time not recorded; dormant age unknown.`); continue }
  if (age(since) < 90 * day) { resolved.set(id, 'Account has recent submitted activity or has not reached 90 elapsed days.'); continue }
  // An undated submitted order could be newer: do not invent a dormant age.
  if (mine.some(order => !submissions.has(order.id))) { unknownAge.push(`Account ${row.id}: an undated submission leaves dormant age unknown.`); continue }
  candidates.push({ id, kind: 'dormant', accountId: row.id, sourceId: row.id, sourcePath: '/api/barrow/state', title: `Dormant account ${account.name}`, reason: `${dates.length ? 'Latest submitted order' : 'Earliest recorded account save'} ${since}; no submitted activity within 90 elapsed days.`, priority: 4 })
 }
 // AUTO-001: an open application stays a candidate (escalated once past its deadline) until a decision resolves it.
 const [applicationRows, applicationTasks] = await Promise.all([
  db.prepare("SELECT id,value_json,state FROM bw_applications WHERE state<>'unverified'").all<{ id: string; value_json: string; state: string }>(),
  db.prepare("SELECT value_json FROM bw_followups WHERE id LIKE 'application:%'").all<{ value_json: string }>(),
 ])
 const tasks = new Map(applicationTasks.results.map(row => { const task = JSON.parse(row.value_json); return [task.id as string, task] }))
 for (const row of applicationRows.results) {
  const id = applicationTaskId(row.id)
  if (['approved', 'declined', 'withdrawn'].includes(row.state)) { resolved.set(id, `Decision recorded: application ${row.state}.`); continue }
  const shown = tasks.has(id) ? escalatedView(tasks.get(id), supplierDate(at)) : null
  candidates.push({ id, kind: 'application', accountId: id, sourceId: row.id, sourcePath: `/app?application=${encodeURIComponent(row.id)}`, title: shown?.title ?? `Review trade application ${JSON.parse(row.value_json).name}`, reason: shown?.reason ?? 'Verified application awaiting review.', priority: shown?.priority ?? 2 })
 }
 const accountRevisions = new Map(accountRows.results.map(row => [row.id, row.revision]))
 return { candidates, resolved, unknownAge, accountRevisions }
}
