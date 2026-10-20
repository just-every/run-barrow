// PAY-007: an account statement derived from today's records, which are invoices only (one per fully reserved approved
// order, integer cents in the order's currency). Period bounds are inclusive YYYY-MM-DD dates compared with each
// invoice's recorded issue date, the America/New_York calendar day on which it was issued. Opening = invoices issued
// before `from`; closing = opening + the period's invoices, per currency. Payments, deposits, returns, credit notes and
// unapplied cash are not recorded, so balances are invoiced totals and the statement says so.
import { account } from './accounts'
import { now } from './clock'
import { csvText } from './cart-csv'
import { textPdf } from './pdf'
import { fail, requirePerson, supplierDate, type Actor, type Order } from './model'

export const statementNote = 'Barrow records no payments, deposits, returns, credit notes or unapplied cash yet; balances are invoiced totals, not amounts confirmed unpaid.'
const day = (value: string | null, name: string) => {
 if (!value) return undefined
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) fail('DATE', `Use a valid YYYY-MM-DD ${name} date.`, 400)
 return value
}
const amount = (cents: number, currency: string) => `${currency} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function statement(db: D1Database, actor: Actor, accountId: string, query: URLSearchParams) {
 requirePerson(actor)
 const selected = await account(db, actor, accountId)
 const from = day(query.get('from'), 'start'), to = day(query.get('to'), 'end') ?? supplierDate(await now())
 if (from && from > to) fail('DATE', 'The start date must precede the end date.', 400)
 const rows = await db.prepare("SELECT value_json FROM bw_orders WHERE account_id=? AND json_extract(value_json,'$.status')='approved' AND json_extract(value_json,'$.invoice') IS NOT NULL").bind(selected.id).all<{ value_json: string }>()
 const invoices = rows.results.map(row => JSON.parse(row.value_json) as Order).filter(order => order.invoice!.issuedAt <= to)
  .sort((a, b) => a.invoice!.issuedAt.localeCompare(b.invoice!.issuedAt) || a.invoice!.number.localeCompare(b.invoice!.number))
 const currencies = [...new Set(invoices.map(order => order.currency ?? 'AUD'))].sort((a, b) => a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))
 const sections = currencies.map(currency => {
  const mine = invoices.filter(order => (order.currency ?? 'AUD') === currency)
  const openingCents = mine.filter(order => from !== undefined && order.invoice!.issuedAt < from).reduce((sum, order) => sum + order.totalCents, 0)
  const period = mine.filter(order => from === undefined || order.invoice!.issuedAt >= from).map(order => ({ number: order.invoice!.number, issuedAt: order.invoice!.issuedAt, dueAt: order.invoice!.dueAt, orderId: order.id, reference: order.reference, amountCents: order.totalCents, invoicePath: `/api/barrow/invoices/${order.id}.csv`, orderPath: `/api/barrow/orders/${order.id}/timeline` }))
  const invoicedCents = period.reduce((sum, line) => sum + line.amountCents, 0)
  return { currency, openingCents, invoices: period, invoicedCents, closingCents: openingCents + invoicedCents }
 })
 return { accountId: selected.id, customer: selected.value.name, lifecycle: selected.value.lifecycle ?? 'active', from: from ?? null, to, dates: 'Inclusive invoice issue dates (America/New_York calendar days).', sections, note: statementNote }
}

const statementRows = (value: Awaited<ReturnType<typeof statement>>) => [['currency', 'kind', 'date', 'due_date', 'invoice_number', 'order', 'customer_reference', 'amount_cents', 'balance_cents'],
 ...value.sections.flatMap(section => {
  let balance = section.openingCents
  return [[section.currency, 'opening', value.from ?? '', '', '', '', '', section.openingCents, balance],
   ...section.invoices.map(line => [section.currency, 'invoice', line.issuedAt, line.dueAt, line.number, line.orderId, line.reference, line.amountCents, balance += line.amountCents]),
   [section.currency, 'closing', value.to, '', '', '', '', section.closingCents, section.closingCents]]
 })]

export async function statementResponse(db: D1Database, actor: Actor, accountId: string, format: 'json' | 'csv' | 'pdf', query: URLSearchParams) {
 const value = await statement(db, actor, accountId, query)
 const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
 if (format === 'json') return Response.json(value, { headers })
 const filename = `barrow-statement-${value.accountId}-${value.to}.${format}`
 if (format === 'csv') return new Response(csvText([...statementRows(value), [], [value.note]]), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` } })
 const lines = [`Statement for ${value.customer}`, `Period: ${value.from ?? 'all invoices'} to ${value.to}. ${value.dates}`, '']
 for (const section of value.sections) {
  lines.push(`${section.currency} opening balance: ${amount(section.openingCents, section.currency)}`)
  for (const line of section.invoices) lines.push(`  Invoice ${line.number} issued ${line.issuedAt}, due ${line.dueAt}${line.reference ? `, PO ${line.reference}` : ''}: ${amount(line.amountCents, section.currency)}`)
  lines.push(`${section.currency} closing balance: ${amount(section.closingCents, section.currency)}`, '')
 }
 if (!value.sections.length) lines.push('No invoices in this period.', '')
 lines.push(value.note)
 return new Response(textPdf(lines), { headers: { ...headers, 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"` } })
}
