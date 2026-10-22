// Activity and current workload are separate from compensation; no money is calculated here.
import type { Bindings } from '../auth.server'
import { accounts } from './accounts'
import { csvText } from './cart-csv'
import { now } from './clock'
import type { CommissionSnapshot } from './commission-rules'
import { fail, requirePerson, requireSupplier, supplierDate, type Actor, type Order } from './model'
import type { Quote } from './quotes'
import { activeRepSql, currentReps } from './rep-scope'
import { calendarDate, reportZone } from './report-zone'
import { canEditRepTargets, performanceDay, readRepTargets } from './rep-targets'
import { requireStaffReport, staffAccountAllowed } from './staff-policy'
import type { Visit } from './visits'

type Source = {
 kind: 'account' | 'visit' | 'quote' | 'order'; id: string; accountId: string; path: string; appPath?: string
 date?: string; territory?: string; workload?: 'primary' | 'covered' | 'granted' | 'unassigned'; status?: Visit['status']
 offered?: boolean; accepted?: boolean; newAccount?: boolean; firstOrderId?: string; attribution?: string
}
type Identity = { key: string; userId: string | null; rep: string | null; name: string }
type Person = { userId: string; name: string; commissionRep: string | null; policy_json: string }
const rate = (numerator: number, denominator: number) => ({ numerator, denominator, bps: denominator ? Math.floor((numerator * 10000 + denominator / 2) / denominator) : null })
const placed = new Set(['submitted', 'reserving', 'shortfall', 'approved', 'releasing', 'cancelled'])
const unique = (values: string[]) => new Set(values).size
function measures(sources: Source[]) {
 const workload = sources.filter(source => source.kind === 'account'), visits = sources.filter(source => source.kind === 'visit'), quotes = sources.filter(source => source.kind === 'quote'), orders = sources.filter(source => source.kind === 'order')
 const scope = (kind: Source['workload'], territories = false) => [...new Set(workload.filter(source => source.workload === kind).map(source => territories ? source.territory ?? '' : source.accountId).filter(Boolean))].sort()
 return {
  workload: { primaryAccounts: scope('primary').length, coveredAccounts: scope('covered').length, grantedAccounts: scope('granted').length, unassignedAccounts: scope('unassigned').length, primaryTerritories: scope('primary', true), coveredTerritories: scope('covered', true), grantedTerritories: scope('granted', true), primaryTerritoryCount: scope('primary', true).length, coveredTerritoryCount: scope('covered', true).length },
  visits: { planned: visits.filter(source => source.status === 'planned').length, completed: visits.filter(source => source.status === 'completed').length, cancelled: visits.filter(source => source.status === 'cancelled').length },
  quotes: { requested: quotes.length, offered: quotes.filter(source => source.offered).length, accepted: quotes.filter(source => source.accepted).length, acceptanceRate: rate(quotes.filter(source => source.accepted).length, quotes.filter(source => source.offered).length) },
  accounts: { new: unique(orders.filter(source => source.newAccount).map(source => source.accountId)), repeat: unique(orders.filter(source => !source.newAccount).map(source => source.accountId)) },
 }
}

export async function repPerformance(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireStaffReport(actor, 'commissions', params); requireSupplier(actor)
 const own = actor.staff?.role === 'rep', manager = canEditRepTargets(actor) || actor.staff?.role === 'sales-manager' && actor.staff.accounts === 'all'
 if (!own && !manager) fail('FORBIDDEN', 'Rep performance requires an owner, admin, all-account sales manager or entitled rep.', 403)
 for (const key of ['from', 'to', 'rep', 'userId', 'accountId', 'territory']) if (params.getAll(key).length > 1) fail('INPUT', 'Choose one exact value per report filter.', 400)
 const at = await now(), timeZone = await reportZone(env.DB), today = supplierDate(at), to = params.has('to') ? performanceDay(params.get('to'), 'To') : calendarDate(at, timeZone)
 const from = params.has('from') ? performanceDay(params.get('from'), 'From') : new Date(Date.parse(to + 'T00:00:00Z') - 89 * 86400000).toISOString().slice(0, 10)
 if (from > to) fail('INPUT', 'From must not be after To.', 400)
 const filter = { rep: params.get('rep') ?? '', userId: params.get('userId') ?? '', accountId: params.get('accountId') ?? '', territory: params.get('territory') ?? '' }
 if (own && filter.userId && filter.userId !== actor.id) fail('FORBIDDEN', 'A rep reads only their exact Native identity.', 403)
 if (own) filter.userId = actor.id
 const list = (await accounts(env.DB, actor)).filter(account => (!actor.staff || staffAccountAllowed(actor.staff, account.id)) && (!filter.accountId || filter.accountId === account.id) && (!filter.territory || filter.territory === account.value.territory))
 const byId = new Map(list.map(account => [account.id, account])), ids = JSON.stringify([...byId.keys()])
 const [peopleResult, visitResult, quoteResult, orderResult, holders] = await Promise.all([
  env.DB.prepare(`SELECT p.id AS userId,p.display_name AS name,json_extract(g.policy_json,'$.commissionRep') AS commissionRep,g.policy_json FROM oa_operators p JOIN bw_staff_members g ON g.user_id=p.id WHERE ${activeRepSql('p')} ORDER BY p.display_name,p.id`).all<Person>(),
  env.DB.prepare('SELECT value_json,created_by FROM bw_visits WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(ids).all<{ value_json: string; created_by: string }>(),
  env.DB.prepare('SELECT value_json FROM bw_quotes WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(ids).all<{ value_json: string }>(),
  env.DB.prepare('SELECT o.value_json,c.value_json AS commission_json FROM bw_orders o LEFT JOIN bw_order_commissions c ON c.order_id=o.id WHERE o.account_id IN (SELECT value FROM json_each(?)) ORDER BY o.id').bind(ids).all<{ value_json: string; commission_json: string | null }>(),
  currentReps(env.DB, [...byId.keys()], today),
 ])
 const people = new Map(peopleResult.results.map(person => [person.userId, person])), rows = new Map<string, Identity & { sources: Source[] }>()
 const native = (userId: string): Identity => ({ key: `user:${userId}`, userId, rep: people.get(userId)?.commissionRep ?? null, name: people.get(userId)?.name ?? userId })
 const label = (rep: string): Identity => ({ key: `label:${rep}`, userId: null, rep, name: `${rep} (frozen attribution)` })
 const unattributed: Identity = { key: 'unattributed', userId: null, rep: null, name: 'Unattributed' }
 const visible = (identity: Identity) => own ? identity.userId === actor.id || identity.userId === null && identity.rep === filter.rep
  : (!filter.userId || identity.userId === filter.userId) && (!filter.rep || identity.rep === filter.rep)
 const add = (identity: Identity, source?: Source) => {
  if (!visible(identity)) return
  if (!rows.has(identity.key)) rows.set(identity.key, { ...identity, sources: [] })
  if (source) rows.get(identity.key)!.sources.push(source)
 }
 for (const person of people.values()) add(native(person.userId))
 if (own) add(native(actor.id))
 // This is today's workload only. No historical territory membership is inferred from the account profile.
 for (const account of list) {
  const held = holders.get(account.id) ?? [], source = { kind: 'account' as const, id: account.id, accountId: account.id, territory: account.value.territory ?? '', path: `/api/barrow/accounts/by-id/${encodeURIComponent(account.id)}` }
  for (const holder of held) add(native(holder.userId), { ...source, workload: holder.coverage ? 'covered' : 'primary' })
  for (const person of people.values()) {
   const grant = JSON.parse(person.policy_json)
   if (!held.some(holder => holder.userId === person.userId) && (grant.accounts === 'all' || grant.accounts.includes(account.id))) add(native(person.userId), { ...source, workload: 'granted' })
  }
  if (!held.some(holder => !holder.coverage)) add(unattributed, { ...source, workload: 'unassigned', attribution: 'No current primary assignment.' })
 }
 const inPeriod = (iso: string) => { const date = calendarDate(new Date(iso), timeZone); return date >= from && date <= to }
 for (const record of visitResult.results) {
  const visit = JSON.parse(record.value_json) as Visit
  if (visit.date < from || visit.date > to) continue
  add(native(record.created_by), { kind: 'visit', id: visit.id, accountId: visit.accountId, date: visit.date, status: visit.status, path: `/api/barrow/visits?accountId=${encodeURIComponent(visit.accountId)}`, appPath: `/app?task=${encodeURIComponent('visit:' + visit.id)}`, attribution: 'Immutable stored planner user ID; scheduled Eastern calendar date.' })
 }
 for (const record of quoteResult.results) {
  const quote = JSON.parse(record.value_json) as Quote
  if (!inPeriod(quote.requestedAt)) continue
  // A supplier proposal records its exact author. Unoffered buyer requests have no recorded rep.
  const proposer = quote.revisions.find(revision => !revision.discounted || revision.approval)?.proposedBy ?? quote.revisions[0]?.proposedBy
  const userId = proposer ?? (people.has(quote.requestedBy) ? quote.requestedBy : null)
  add(userId ? native(userId) : unattributed, { kind: 'quote', id: quote.id, accountId: quote.accountId, date: calendarDate(new Date(quote.requestedAt), timeZone), offered: quote.revisions.some(revision => !revision.discounted || revision.approval), accepted: Boolean(quote.accepted), path: `/api/barrow/quotes/${encodeURIComponent(quote.id)}`, appPath: `/app?quote=${encodeURIComponent(quote.id)}`, attribution: proposer ? 'Exact author of first accept-ready proposal (or first proposal when none is accept-ready).' : userId ? 'Exact requesting Native rep user ID.' : 'No stored supplier proposal or identifiable Native rep requester.' })
 }
 const orders = orderResult.results.map(record => ({ order: JSON.parse(record.value_json) as Order, commission: record.commission_json ? JSON.parse(record.commission_json) as CommissionSnapshot : null })).filter(record => placed.has(record.order.status))
 const firsts = new Map<string, Order>()
 for (const { order } of orders) { const before = firsts.get(order.accountId); if (!before || order.preparedAt < before.preparedAt || order.preparedAt === before.preparedAt && order.id < before.id) firsts.set(order.accountId, order) }
 for (const { order, commission } of orders) {
  if (!inPeriod(order.preparedAt)) continue
  const first = firsts.get(order.accountId)!, newAccount = inPeriod(first.preparedAt)
  const identity = order.preparedAs === 'rep' && !order.preparedBy.startsWith('agent:') ? native(order.preparedBy) : commission?.assignedRep ? label(commission.assignedRep) : unattributed
  add(identity, { kind: 'order', id: order.id, accountId: order.accountId, date: calendarDate(new Date(order.preparedAt), timeZone), newAccount, firstOrderId: first.id, path: `/api/barrow/orders/${encodeURIComponent(order.id)}/timeline`, attribution: identity.userId ? 'Exact stored rep preparer user ID.' : identity.rep ? 'Assigned rep label frozen at first approval; no Native identity inferred.' : 'No stored rep preparation identity or frozen assigned rep label.' })
 }
 const targetParams = new URLSearchParams(params); targetParams.set('from', from); targetParams.set('to', to)
 if (own) targetParams.set('userId', actor.id)
 const targets = (await readRepTargets(env, actor, targetParams)).filter(goal => !filter.rep || goal.userId === actor.id && own || people.get(goal.userId)?.commissionRep === filter.rep)
 const result = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key)).map(row => ({ ...row, ...measures(row.sources) }))
 const allSources = [...new Map(result.flatMap(row => row.sources).map(source => [JSON.stringify([source.kind, source.id, source.workload]), source])).values()]
 return { checkedAt: at.toISOString(), from, to, timeZone, today, filter, canEditTargets: canEditRepTargets(actor), reps: manager ? peopleResult.results.map(({ policy_json, ...person }) => person) : [], rows: result, totals: measures(allSources), targets,
  definitions: {
   period: `Inclusive calendar days ${from} to ${to} in ${timeZone} for quote request and order preparation timestamps; visits use their stored scheduled Eastern date. Current workload is as of ${today} in America/New_York, not historical coverage.`,
   workload: 'Primary and temporary covered accounts/territories come from current dated assignments. Granted counts are additional explicitly granted accounts. Territory counts use today’s account metadata. Unattributed workload has no current assignment.',
   visits: 'Current planned/completed/cancelled outcomes by immutable planner user ID and stored scheduled date, regardless of the follow-up task owner. Completed goals count these same visits.',
   quotes: 'Quote request cohorts, attributed to the exact first accept-ready proposer (else first proposer), else an exact requesting Native rep. Requested/offered/accepted count each quote once; acceptance rate is accepted ÷ offered, with numerator and denominator. Unattributed requests are explicit; current territories never assign historical quotes.',
   accounts: 'Distinct accounts with placed orders prepared in the period. New means the first ever recorded placed order is in the period; repeat means that first order is before it. Placed includes later cancellation. Attribution uses exact stored rep preparation, else frozen assigned-rep label, else Unattributed; frozen labels are separate from Native identities. Split commission rules do not multiply activity counts. An account may occur in multiple people’s rows when they prepared different orders; totals count each account once, so distinct-account row counts are not additive. No order appears in both a Native and frozen-label row.',
   totals: 'Visits and quote cohorts each count one source record, without split duplication. Workload totals count distinct accounts and named territories per workload category; primary, temporary coverage and direct grant are separate categories. Account totals count distinct accounts across all visible sources; new/repeat are disjoint within a period.',
   access: 'A rep sees only their exact Native activity and fixed-label frozen attribution, limited to currently held accounts; transferred-away history is excluded. Targets name only the exact Native user. Managers compare the currently authorized report scope.',
   identity: 'Native rows group by immutable recorded user ID; their displayed name and commission label are current metadata only. Frozen-label rows group by the recorded label without resolving it to today’s Native person. An unavailable identity retains its opaque ID; no historical effective assignment is inferred.',
   targets: 'Only owners/admins set reasoned integer activity goals. Each target freezes its period time zone; compare only matching periods and zones. Goals affect no commissions, compensation, access, automatic action or notification. New-account goals compare only exact Native preparation identity, excluding frozen-label rows.',
   compensation: 'Earned/reversed amounts and approved split rules remain in the separate source-backed commission statement. This report calculates no money and reconstructs no historical assignment.',
  },
 }
}

export async function repPerformanceCsv(env: Bindings, actor: Actor, params: URLSearchParams) {
 const report = await repPerformance(env, actor, params)
 const columns = ['key', 'userId', 'rep', 'name', 'primaryAccounts', 'coveredAccounts', 'grantedAccounts', 'unassignedAccounts', 'primaryTerritories', 'coveredTerritories', 'grantedTerritories', 'primaryTerritoryCount', 'coveredTerritoryCount', 'plannedVisits', 'completedVisits', 'cancelledVisits', 'requestedQuotes', 'offeredQuotes', 'acceptedQuotes', 'acceptanceNumerator', 'acceptanceDenominator', 'acceptanceBps', 'newAccounts', 'repeatAccounts']
 const rows = [...report.rows, { key: 'total', userId: null, rep: null, name: 'All visible sources', ...report.totals }].map(row => [row.key, row.userId, row.rep, row.name, row.workload.primaryAccounts, row.workload.coveredAccounts, row.workload.grantedAccounts, row.workload.unassignedAccounts, row.workload.primaryTerritories.join(';'), row.workload.coveredTerritories.join(';'), row.workload.grantedTerritories.join(';'), row.workload.primaryTerritoryCount, row.workload.coveredTerritoryCount, row.visits.planned, row.visits.completed, row.visits.cancelled, row.quotes.requested, row.quotes.offered, row.quotes.accepted, row.quotes.acceptanceRate.numerator, row.quotes.acceptanceRate.denominator, row.quotes.acceptanceRate.bps, row.accounts.new, row.accounts.repeat])
 const sources = report.rows.flatMap(row => row.sources.map(source => [row.key, source.kind, source.id, source.accountId, source.date ?? '', source.path, source.appPath ?? '', source.attribution ?? '', source.workload ?? '', source.status ?? '', source.offered ?? '', source.accepted ?? '', source.firstOrderId ?? '', source.newAccount === undefined ? '' : source.newAccount ? 'new' : 'repeat']))
 return new Response(csvText([['from', report.from, 'to', report.to, 'timeZone', report.timeZone, 'checkedAt', report.checkedAt], columns, ...rows, [], ['row', 'sourceKind', 'sourceId', 'accountId', 'date', 'path', 'appPath', 'attribution', 'workload', 'visitStatus', 'offered', 'accepted', 'firstOrderId', 'accountClassification'], ...sources, [], ['targetId', 'userId', 'from', 'to', 'timeZone', 'completedVisits', 'newAccounts', 'revision', 'reason'], ...report.targets.map(goal => [goal.id, goal.userId, goal.from, goal.to, goal.timeZone, goal.completedVisits, goal.newAccounts, goal.revision, goal.reason]), [], ...Object.entries(report.definitions).map(([name, definition]) => [name, definition])]), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="barrow-rep-performance.csv"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
