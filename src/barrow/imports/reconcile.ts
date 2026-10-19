// MOVE-007: what a dry run will change, counted and summed beside the source so the two can be compared before
// anyone approves. Amounts are integer USD cents. The account CSV header must match exactly, so no column is ever
// dropped silently: an unknown column refuses the file instead of appearing here as rejected.
import type { AccountValue } from './validation'

type Planned = { account: AccountValue; previous: { value: unknown } | null }
const totals = (accounts: AccountValue[]) => ({
 accounts: accounts.length,
 prices: accounts.reduce((n, account) => n + account.prices.length, 0),
 unitCentsUsd: accounts.reduce((n, account) => n + account.prices.reduce((sum, price) => sum + price.unitCents, 0), 0),
 minimumCentsUsd: accounts.reduce((n, account) => n + account.minimumCents, 0),
})

export function reconciliation(source: AccountValue[], planned: Planned[], unknownSkus: string[], skuCheck: boolean) {
 const before = totals(source), after = totals(planned.map(row => row.account))
 const same = (row: Planned) => row.previous && JSON.stringify(row.previous.value) === JSON.stringify(row.account)
 return {
  source: before, planned: { ...after, create: planned.filter(row => !row.previous).length, update: planned.filter(row => row.previous && !same(row)).length, unchanged: planned.filter(same).length },
  matches: JSON.stringify(before) === JSON.stringify(after), rejectedColumns: [] as string[],
  skuCheck: skuCheck ? 'Checked against the connected Pier catalog' : 'Did not run: Pier was unreachable', unknownSkus,
 }
}
export const approvalReason = (fingerprint: string, review: ReturnType<typeof reconciliation>) =>
 `Approved dry-run ${fingerprint}: ${review.planned.accounts} accounts (${review.planned.create} new, ${review.planned.update} updated, ${review.planned.unchanged} unchanged), ${review.planned.prices} price rows, USD ${review.planned.unitCentsUsd} unit cents and ${review.planned.minimumCentsUsd} minimum cents.`
