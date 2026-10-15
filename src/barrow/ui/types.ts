export interface Price { sku: string; unitCents: number; minQty: number }
export interface AccountValue {
  name: string; email: string; pierCustomerId: string; termsDays: number; minimumCents: number; prices: Price[]
}
export interface Account { id: string; value: AccountValue; revision: string }
export interface Order {
  id: string; accountId: string; customerName: string; reference: string
  lines: { sku: string; name: string; itemId: string; quantity: number; unitCents: number; minQty: number }[]
  totalCents: number; termsDays: number
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
export const money = (cents: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
