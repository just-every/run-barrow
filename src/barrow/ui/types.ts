export interface Price { sku: string; unitCents: number; minQty: number }
export interface AccountValue {
  name: string; email: string; pierCustomerId: string; termsDays: number; minimumCents: number; prices: Price[]
}
export interface Account { id: string; value: AccountValue; revision: string }
export interface Order {
  id: string; accountId: string; customerName: string; reference: string
  lines: { sku: string; name: string; itemId: string; quantity: number; unitCents: number; minQty: number }[]
  totalCents: number; termsDays: number; accountRevision: string; preparedAt: string
  status: 'draft' | 'submitted' | 'reserving' | 'shortfall' | 'approved'
  preparedBy: string; submittedBy?: string; approvedBy?: string; approvedAt?: string
  pierOrderId?: string; pierReference?: string; reservation?: unknown; invoice?: unknown
}
export interface BarrowState {
  actor: { id: string; email: string; role: 'owner' | 'admin' | 'member'; agent: false }
  accounts: Account[]; orders: Order[]; connection: { configured: boolean }
}
export interface CatalogueItem {
  sku: string; itemId: string; name: string; unit: string; available: string; unitCents: number; minQty: number
}
export interface Catalogue { account: Account; items: CatalogueItem[]; observedAt: string }
export type RunCommand = (type: string, payload: Record<string, unknown>) => Promise<boolean>
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
/** A moment as the pad writes it: "Tue Oct 20, 1:30 pm"; anything unparseable stays as given. */
export const when = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleString('en-US', options)
  return `${part({ weekday: 'short' })} ${part({ month: 'short', day: 'numeric' })}, ${part({ hour: 'numeric', minute: '2-digit' }).toLowerCase()}`
}
export const clock = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase() }
export const terms = (days: number) => days === 0 ? 'Due on receipt' : `Net ${days}`
/** A draft written against an older revision of its account's prices or terms cannot be submitted as it stands. */
export const stale = (order: Order, accounts: Account[]) => order.status === 'draft' && accounts.some(account => account.id === order.accountId && account.revision !== order.accountRevision)
export const byAgent = (order: Order) => order.preparedBy.startsWith('agent:')
