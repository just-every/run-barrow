import { supplierZone } from '../model'
export interface Price { sku: string; unitCents: number; minQty: number; casePack?: number; increment?: number; units?: import('../units').UnitDefinition[]; pricing?: import('../pricing').Pricing }
export interface AccountValue {
  name: string; email: string; pierCustomerId: string; termsDays: number; minimumCents: number; prices: Price[]; city?: string; state?: string
  lifecycle?: 'active' | 'on-hold' | 'closed'; channel?: string; territory?: string; assignedRep?: string; catalogs?: string[]; warehouses?: string[]; providerReferences?: Record<string, string>
}
export interface Account { id: string; value: AccountValue; revision: string }
export interface Order {
  substitutions?: import("../substitution-preview").Substitution[]; fromSubstitution?: {orderId:string;number:number}

  delivery?: import('../shipping-rules').Delivery; freightQuotes?: import('../shipping-rules').FreightQuote[]
  id: string; accountId: string; customerName: string; reference: string; deliveryLocation?: string; reorderedFrom?: string
  poRelease?: { number: number; of: string; authorizedBy: string; authorizedAt: string }; requestedDate?: string; cancelAfter?: string; instructions?: string; document?: { name: string; type: string; size: number; sha256: string; uploadedBy: string; uploadedAt: string }
  lines: { sku: string; name: string; itemId: string; quantity: number; unitCents: number; minQty: number; unit?:string; baseUnit?:string; baseQuantity?:string; conversion?:string; packContents?:string; lineCents?:number; pricing?:import('../pricing').PricingSnapshot; buyerSku?:string }[]
  totalCents: number; currency?: 'USD' | 'AUD'; termsDays: number; accountRevision: string; preparedAt: string
  status: 'draft' | 'submitted' | 'reserving' | 'shortfall' | 'approved' | 'superseded' | 'releasing' | 'cancelled'
  replaces?: string; supersededBy?: string; stockException?: { by: string; at: string; reason: string }; quote?: { id: string; revision: number; shipping: string; validUntil: string }
  preparedBy: string; submittedBy?: string; approvedBy?: string; approvedAt?: string
  pierOrderId?: string; pierReference?: string; reservation?: { quantity: string; reserved: string }[]; invoice?: { number: string; issuedAt: string; dueAt: string }
  release?: { reason: string; requestedBy: string; requestedAt: string; held: { itemId: string; quantity: string }[]; confirmedAt?: string; lines?: { quantity: string; dispatched: string; cancelled: string }[] }
}
export interface BarrowState {
  actor: { id: string; email: string; role: 'owner' | 'admin' | 'member'; agent: false }
  accounts: Account[]; orders: Order[]; people: Record<string, string>; connection: { configured: boolean }; settings: { stockFreshnessMinutes: number | null }
}
export interface CatalogueItem {
  sku: string; itemId: string; name: string; unit: string; barcode?: string; available: string; warehouses?: { warehouse: string; available: string; promised: boolean }[]; incoming?: { date: string | null; quantity: string }[]; awaitingRelease?: string; unitCents: number; minQty: number; casePack?: number; increment?: number; units?: import('../units').UnitDefinition[]; pricing?: import('../pricing').Pricing
}
export interface Catalogue { currency: 'USD'; account: Account; items: CatalogueItem[]; observedAt: string }
export type RunCommand = (type: string, payload: Record<string, unknown>) => Promise<boolean>
/** Shift the decimal point as text so large exact-cent amounts never lose a cent to division. */
export const money = (cents: number, currency: 'USD' | 'AUD' = 'USD') => {
  const [coefficient, exponent = '0'] = String(cents).split('e')
  const negative = coefficient.startsWith('-'), [whole, fraction = ''] = coefficient.replace('-', '').split('.')
  const digits = whole + fraction, point = whole.length + Number(exponent) - 2
  const decimal = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`
  // Intl accepts decimal strings without converting them to binary floating point.
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format((negative ? '-' + decimal : decimal) as unknown as number)
}
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
