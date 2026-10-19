import { supplierZone } from '../model'
export interface Price { sku: string; unitCents: number; minQty: number }
export interface AccountValue {
  name: string; email: string; pierCustomerId: string; termsDays: number; minimumCents: number; prices: Price[]; city?: string; state?: string
}
export interface Account { id: string; value: AccountValue; revision: string }
export interface Order {
  id: string; accountId: string; customerName: string; reference: string
  lines: { sku: string; name: string; itemId: string; quantity: number; unitCents: number; minQty: number }[]
  totalCents: number; termsDays: number; accountRevision: string; preparedAt: string
  status: 'draft' | 'submitted' | 'reserving' | 'shortfall' | 'approved' | 'superseded'
  replaces?: string; supersededBy?: string
  preparedBy: string; submittedBy?: string; approvedBy?: string; approvedAt?: string
  pierOrderId?: string; pierReference?: string; reservation?: { quantity: string; reserved: string }[]; invoice?: { number: string; issuedAt: string; dueAt: string }
}
export interface BarrowState {
  actor: { id: string; email: string; role: 'owner' | 'admin' | 'member'; agent: false }
  accounts: Account[]; orders: Order[]; people: Record<string, string>; connection: { configured: boolean }
}
export interface CatalogueItem {
  sku: string; itemId: string; name: string; unit: string; available: string; unitCents: number; minQty: number
}
export interface Catalogue { account: Account; items: CatalogueItem[]; observedAt: string }
export type RunCommand = (type: string, payload: Record<string, unknown>) => Promise<boolean>
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

// Every moment reads in the supplier's zone (Eastern), never the viewer's; "ET" follows wherever the viewer's clock reads differently.
const zoneLabel = 'ET'
const inZone = (date: Date, options: Intl.DateTimeFormatOptions, timeZone = supplierZone) => date.toLocaleString('en-US', { ...options, timeZone })
const zoned = (date: Date) => {
  const viewer = Intl.DateTimeFormat().resolvedOptions().timeZone, stamp: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
  return inZone(date, stamp) === inZone(date, stamp, viewer) ? '' : ` ${zoneLabel}`
}
const time = (date: Date) => inZone(date, { hour: 'numeric', minute: '2-digit' }).toLowerCase()
/** A moment as the pad writes it: "Tue Oct 20, 1:30 pm" (with " ET" outside Eastern time); anything unparseable stays as given. */
export const when = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${inZone(date, { weekday: 'short' })} ${inZone(date, { month: 'short', day: 'numeric' })}, ${time(date)}${zoned(date)}`
}
export const clock = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : `${time(date)}${zoned(date)}` }
/** A calendar date (YYYY-MM-DD, already the supplier's day) as "Tue Oct 20, 2026". */
export const day = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).replace(/^(\w+),/, '$1')
}
export const terms = (days: number) => days === 0 ? 'Due on receipt' : `Net ${days}`
/** "Columbia, SC", or empty when the account records no town. */
export const town = (value: AccountValue) => [value.city, value.state].filter(Boolean).join(', ')
/** Orders carry human numbers (JV-10439); a record written before them keeps the short form of its old ID. */
export const orderNumber = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) : id
/** A draft written against an older revision of its account's prices or terms cannot be submitted as it stands. */
export const stale = (order: Order, accounts: Account[]) => order.status === 'draft' && accounts.some(account => account.id === order.accountId && account.revision !== order.accountRevision)
export const byAgent = (order: Order) => order.preparedBy.startsWith('agent:')
