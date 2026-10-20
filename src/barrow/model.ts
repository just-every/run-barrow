export class Problem extends Error {
 constructor(public code: string, message: string, public status = 409) { super(message) }
}
export function fail(code: string, message: string, status = 409): never { throw new Problem(code, message, status) }
export type Actor = { id: string; email: string; role: string; version: number; sessionId?: string; agent: boolean; grantId?: string }
export type Price = { sku: string; unitCents: number; minQty: number; casePack?: number; increment?: number; units?: import('./units').UnitDefinition[]; pricing?: import('./pricing').Pricing }
export type { AccountValue } from './imports/validation'
import type { AccountValue } from './imports/validation'
export type Account = { id: string; value: AccountValue; revision: string }
export type Line = { sku: string; name: string; itemId: string; quantity: number; unitCents: number; minQty: number; unit?: string; baseUnit?: string; conversion?: string; baseQuantity?: string; packContents?: string; lineCents?: number; pricing?: import('./pricing').PricingSnapshot; buyerSku?: string; quote?: QuotedPrice }
/** ORD-004: how an accepted quote priced a line against its PRI-002 basis. */
export type QuotedPrice = { id: string; revision: number; basisUnitCents: number; basisLineCents: number; discountBps?: number; negotiatedUnitCents?: number }
export type Order = { id: string; accountId: string; accountRevision: string; customerName: string; reference: string; poRelease?: { number: number; of: string; authorizedBy: string; authorizedAt: string }; requestedDate?: string; cancelAfter?: string; instructions?: string; document?: { name: string; type: string; size: number; sha256: string; uploadedBy: string; uploadedAt: string }; deliveryLocation?: string; reorderedFrom?: string; reorderReview?: { fingerprint: string; acknowledgedBy: string; acknowledgedAt: string; differences: unknown }; lines: Line[]; totalCents: number; currency?: 'USD'|'AUD'; termsDays: number; status: 'draft'|'submitted'|'reserving'|'shortfall'|'approved'|'superseded'|'releasing'|'cancelled'; replaces?: string; supersededBy?: string; preparedBy: string; preparedAt: string; submittedBy?: string; approvedBy?: string; approvedAt?: string; pierCustomerId: string; pierOrigin: string; pierOrderId?: string; pierReference?: string; reservation?: unknown; invoice?: {number: string; issuedAt: string; dueAt: string}; release?: Release; stockException?: { by: string; at: string; reason: string }; quote?: { id: string; revision: number; shipping: string; validUntil: string }; revision: string }
/** STK-004: one cancellation's stock release; `held` is what Pier still reserved when it was requested. */
export type Release = { reason: string; requestedBy: string; requestedAt: string; held: {itemId: string; quantity: string}[]; confirmedAt?: string; lines?: {itemId: string; quantity: string; dispatched: string; cancelled: string; reserved: string}[] }
export const text = (v: unknown, name: string, limit = 160): string => typeof v === 'string' && v.trim() && v.length <= limit ? v.trim() : fail('INPUT', `${name} is required (at most ${limit} characters).`, 400)
export const integer = (v: unknown, name: string, min = 0, max = 1000000000): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : fail('INPUT', `${name} must be a whole number between ${min} and ${max}.`, 400)
export const supplier = (actor: Actor) => ['owner','admin'].includes(actor.role)
export const requireSupplier = (actor: Actor) => { if (actor.agent || !supplier(actor)) fail('FORBIDDEN','A signed-in supplier must approve this action.',403) }
export const requirePerson = (actor: Actor) => { if(actor.agent) fail('PERSON_REQUIRED','An agent can prepare a draft; a person must review and submit it.',403) }
export const actorLabel = (actor: Actor) => actor.agent ? `agent:${actor.grantId}` : actor.id
/** The supplier's zone: every date Barrow writes or shows is a date in Eastern time unless a brand says otherwise. */
export const supplierZone = 'America/New_York'
/** A moment's calendar date in the supplier's zone, as YYYY-MM-DD. */
export function supplierDate(date: Date) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: supplierZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]))
 return `${parts.year}-${parts.month}-${parts.day}`
}
