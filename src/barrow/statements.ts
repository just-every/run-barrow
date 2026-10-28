import { unappliedPrincipal } from './deposits'
import { requireCompanyRight } from './company-policy'
import { creditRecords } from './credit-ledger'
// PAY-007 / PAY-001: invoice issue dates retain their recorded America/New_York calendar day; captured card receipts
// use the capturedAt America/New_York calendar day. Captured surcharges are assessed separately from the full card receipt.
// Credit notes reduce account balances once; applications move existing credit without another cash effect.
import { account } from './accounts'
import { now } from './clock'
import { csvText } from './cart-csv'
import type { CardPayment } from './card-model'
import { textPdf } from './pdf'
import { fail, requirePerson, supplierDate, type Actor, type Order } from './model'

type InvoiceLine = { number: string; issuedAt: string; dueAt: string; orderId: string; reference: string; amountCents: number; invoicePath: string; orderPath: string }
type StatementEntry = ({ kind: 'invoice'; date: string } & InvoiceLine) | { kind: 'card-payment' | 'card-surcharge' | 'credit-note' | 'refund' | 'card-allocation'; appliedCents?:number;providerPaymentId?:string;paymentId?:string; date: string; id: string; orderId: string; amountCents: number; paymentPath: string; orderPath: string }
export const statementNote = 'Recorded card allocations and applied credits explain invoice outstanding. Other payment sources are not recorded, so these figures are not amounts confirmed unpaid.'
const cardStatementNote = 'Balances are invoices plus captured card surcharges, less captured card receipts and issued credit notes, plus succeeded provider refunds. Applying existing cash or credit to an invoice does not change this account balance. Pending and failed refunds do not count as returned funds. Unapplied principal is shown separately. Deposit allocations explain release settlement without recording another sale or cash receipt. Other payment types are not recorded.'
const day = (value: string | null, name: string) => {
 if (!value) return undefined
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) fail('DATE', `Use a valid YYYY-MM-DD ${name} date.`, 400)
 return value
}
const amount = (cents: number, currency: string) => `${currency} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pdfParagraph = (value: string) => value.split(' ').reduce<string[]>((lines, word) => {
 const last = lines.length - 1
 if (lines[last].length + word.length + 1 > 85) lines.push(word)
 else lines[last] += `${lines[last] ? ' ' : ''}${word}`
 return lines
}, [''])
const entryId = (entry: StatementEntry) => entry.kind === 'invoice' ? entry.number : entry.id
const entryOrder = { invoice: 0, 'card-surcharge': 1, 'card-payment': 2, 'credit-note': 3, refund: 4, 'card-allocation':5 }
const entryLabel = { 'card-surcharge': 'Card surcharge', 'card-payment': 'Card receipt', 'credit-note': 'Credit note', refund: 'Refund', 'card-allocation':'Principal allocation' }
const invoiceLine = (order: Order): InvoiceLine => ({ number: order.invoice!.number, issuedAt: order.invoice!.issuedAt, dueAt: order.invoice!.dueAt, orderId: order.id, reference: order.reference, amountCents: order.totalCents, invoicePath: `/api/barrow/invoices/${order.id}.csv`, orderPath: `/api/barrow/orders/${order.id}/timeline` })

export async function statement(db: D1Database, actor: Actor, accountId: string, query: URLSearchParams) {
 requirePerson(actor)
 const selected = await account(db, actor, accountId)
 await requireCompanyRight(db,actor,accountId,'finance')
 const from = day(query.get('from'), 'start'), to = day(query.get('to'), 'end') ?? supplierDate(await now())
 if (from && from > to) fail('DATE', 'The start date must precede the end date.', 400)
 const [rows, paymentRows, financial] = await Promise.all([
  db.prepare("SELECT value_json FROM bw_orders WHERE account_id=? AND (json_extract(value_json,'$.status')='approved' OR json_extract(value_json,'$.status')='cancelled' AND EXISTS(SELECT 1 FROM bw_credit_notes credit WHERE credit.order_id=bw_orders.id)) AND json_extract(value_json,'$.invoice') IS NOT NULL").bind(selected.id).all<{ value_json: string }>(),
  db.prepare("SELECT value_json FROM bw_card_payments WHERE account_id=? AND json_extract(value_json,'$.state')='captured' AND json_extract(value_json,'$.capturedAt') IS NOT NULL").bind(selected.id).all<{ value_json: string }>(),
  creditRecords(db),
 ])
 const invoices = rows.results.map(row => JSON.parse(row.value_json) as Order).filter(order => order.invoice!.issuedAt <= to)
  .sort((a, b) => a.invoice!.issuedAt.localeCompare(b.invoice!.issuedAt) || a.invoice!.number.localeCompare(b.invoice!.number))
 const receipts = paymentRows.results.map(row => JSON.parse(row.value_json) as CardPayment).map(payment => ({ payment, date: supplierDate(new Date(payment.capturedAt!)) })).filter(receipt => receipt.date <= to)
 const credits = financial.credits.filter(credit => credit.accountId === selected.id).map(credit => ({ credit, date: supplierDate(new Date(credit.createdAt)) })).filter(row => row.date <= to)
 const refunds = financial.refunds.filter(refund => refund.accountId === selected.id && refund.status === 'succeeded' && refund.completedAt).map(refund => ({ refund, date: supplierDate(new Date(refund.completedAt!)) })).filter(row => row.date <= to)
 const currencies = [...new Set([...invoices.map(order => order.currency ?? 'AUD'), ...receipts.map(({ payment }) => payment.currency), ...credits.map(({ credit }) => credit.currency), ...refunds.map(({ refund }) => refund.currency)])].sort((a, b) => a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))
 const sections = currencies.map(currency => {
  const mine = invoices.filter(order => (order.currency ?? 'AUD') === currency)
  const invoiceEntries: StatementEntry[] = mine.map(order => ({ kind: 'invoice', date: order.invoice!.issuedAt, ...invoiceLine(order) }))
  const cardEntries = receipts.filter(({ payment }) => payment.currency === currency).flatMap(({ payment, date }): StatementEntry[] => {
   const source = { date, id: payment.id,providerPaymentId:payment.providerPaymentId, orderId: payment.orderId, paymentPath: `/api/barrow/payments/${payment.id}`, orderPath: `/api/barrow/orders/${payment.orderId}/timeline` }
   return [
    ...(payment.surchargeCents > 0 ? [{ ...source, kind: 'card-surcharge' as const, amountCents: payment.surchargeCents }] : []),
    { ...source, kind: 'card-payment', amountCents: -(payment.amountCents + payment.surchargeCents) },
   ]
  })
  const creditEntries: StatementEntry[] = credits.filter(({ credit }) => credit.currency === currency).map(({ credit, date }) => ({ kind: 'credit-note', date, id: credit.id, orderId: credit.orderId, amountCents: -credit.amountCents, paymentPath: `/api/barrow/credits/${credit.id}`, orderPath: `/api/barrow/orders/${credit.orderId}/timeline` }))
  const refundEntries: StatementEntry[] = refunds.filter(({ refund }) => refund.currency === currency).map(({ refund, date }) => ({ kind: 'refund', date, id: refund.id, orderId: refund.orderId, amountCents: refund.amountCents, paymentPath: `/api/barrow/refunds/${refund.id}`, orderPath: `/api/barrow/orders/${refund.orderId}/timeline` }))
  const allocations=financial.allocations.filter(row=>row.accountId===selected.id&&row.currency===currency&&supplierDate(new Date(row.createdAt))<=to)
  const allocationEntries:StatementEntry[]=allocations.map(row=>({kind:'card-allocation',date:supplierDate(new Date(row.createdAt)),id:row.id,orderId:row.orderId,amountCents:0,appliedCents:row.amountCents,paymentId:row.paymentId,providerPaymentId:row.providerPaymentId,paymentPath:`/api/barrow/payments/${row.paymentId}`,orderPath:`/api/barrow/orders/${row.orderId}/timeline`}))
  const unappliedCents=receipts.filter(row=>row.payment.currency===currency).reduce((sum,row)=>sum+unappliedPrincipal(row.payment,{...financial,allocations,refunds:refunds.map(row=>row.refund)}),0)
  const allEntries = [...invoiceEntries, ...cardEntries, ...creditEntries, ...refundEntries,...allocationEntries].sort((a, b) => a.date.localeCompare(b.date) || entryOrder[a.kind] - entryOrder[b.kind] || entryId(a).localeCompare(entryId(b)))
  const openingCents = allEntries.filter(entry => from !== undefined && entry.date < from).reduce((sum, entry) => sum + entry.amountCents, 0)
  const entries = allEntries.filter(entry => from === undefined || entry.date >= from)
  // Keep the original invoice-only API field and its object shape for existing consumers.
  const period = mine.filter(order => from === undefined || order.invoice!.issuedAt >= from).map(invoiceLine)
  const invoicedCents = period.reduce((sum, line) => sum + line.amountCents, 0)
  const surchargedCents = entries.filter(entry => entry.kind === 'card-surcharge').reduce((sum, entry) => sum + entry.amountCents, 0)
  const receivedCents = -entries.filter(entry => entry.kind === 'card-payment').reduce((sum, entry) => sum + entry.amountCents, 0)
  const creditedCents = -entries.filter(entry => entry.kind === 'credit-note').reduce((sum, entry) => sum + entry.amountCents, 0)
  const refundedCents = entries.filter(entry => entry.kind === 'refund').reduce((sum, entry) => sum + entry.amountCents, 0)
  return { currency,unappliedCents, openingCents, invoices: period, entries, invoicedCents, surchargedCents, receivedCents, creditedCents, refundedCents, closingCents: openingCents + invoicedCents + surchargedCents - receivedCents - creditedCents + refundedCents }
 })
 return { accountId: selected.id, customer: selected.value.name, lifecycle: selected.value.lifecycle ?? 'active', from: from ?? null, to, dates: 'Inclusive invoice issue, card capture, credit issue and completed refund dates (America/New_York calendar days).', sections, note: cardStatementNote }
}

const statementRows = (value: Awaited<ReturnType<typeof statement>>) => [['currency', 'kind', 'date', 'due_date', 'invoice_number', 'order', 'customer_reference', 'amount_cents', 'balance_cents', 'payment_id', 'credit_id', 'refund_id', 'source_path','applied_cents','provider_payment_id'],
 ...value.sections.flatMap(section => {
  let balance = section.openingCents
  return [[section.currency, 'opening', value.from ?? '', '', '', '', '', section.openingCents, balance, '', '', '', ''],
   ...section.entries.map(line => [section.currency, line.kind, line.date, line.kind === 'invoice' ? line.dueAt : '', line.kind === 'invoice' ? line.number : '', line.orderId, line.kind === 'invoice' ? line.reference : '', line.amountCents, balance += line.amountCents, line.kind === 'card-payment' || line.kind === 'card-surcharge' ? line.id : '', line.kind === 'credit-note' ? line.id : '', line.kind === 'refund' ? line.id : '', line.kind === 'invoice' ? line.invoicePath : line.paymentPath,line.kind==='card-allocation'?line.appliedCents??0:0,line.kind==='invoice'?'':line.providerPaymentId??'']),
   [section.currency,'unapplied principal',value.to,'','','','',section.unappliedCents,'','','','',''],
   [section.currency, 'closing', value.to, '', '', '', '', section.closingCents, section.closingCents, '', '', '', '']]
 })]

export async function statementResponse(db: D1Database, actor: Actor, accountId: string, format: 'json' | 'csv' | 'pdf', query: URLSearchParams) {
 const value = await statement(db, actor, accountId, query)
 const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
 if (format === 'json') return Response.json(value, { headers })
 const filename = `barrow-statement-${value.accountId}-${value.to}.${format}`
 if (format === 'csv') return new Response(csvText([...statementRows(value), [], [value.note]]), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` } })
 const lines = [`Statement for ${value.customer}`, `Period: ${value.from ?? 'all activity'} to ${value.to}.`, ...pdfParagraph(value.dates), '']
 for (const section of value.sections) {
  lines.push(`${section.currency} opening balance: ${amount(section.openingCents, section.currency)}`)
  for (const line of section.entries) {
   if (line.kind === 'invoice') lines.push(`  Invoice ${line.number} issued ${line.issuedAt}, due ${line.dueAt}${line.reference ? `, PO ${line.reference}` : ''}: ${amount(line.amountCents, section.currency)}`)
   else lines.push(`  ${entryLabel[line.kind]} ${line.id}: ${amount(line.amountCents, section.currency)}`, `    Recorded ${line.date}; order ${line.orderId}`, `    Source ${line.paymentPath}${line.providerPaymentId?' · '+line.providerPaymentId:''}${line.kind==='card-allocation'?' · applied '+amount(line.appliedCents??0,section.currency):''}`)
  }
  lines.push(`${section.currency} unapplied principal: ${amount(section.unappliedCents,section.currency)}`)
  lines.push(`${section.currency} closing balance: ${amount(section.closingCents, section.currency)}`, '')
 }
 if (!value.sections.length) lines.push('No recorded activity in this period.', '')
 lines.push(...pdfParagraph(value.note))
 return new Response(textPdf(lines), { headers: { ...headers, 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"` } })
}
