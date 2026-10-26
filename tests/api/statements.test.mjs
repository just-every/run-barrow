import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

test('PAY-007: a dated statement of invoices with opening and closing balances by currency, as JSON, CSV and PDF, for the buyer even after hold and close', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const wrenParty = await pier.command('party.save', { name: 'Wren & Co.', kind: 'customer' });
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 let account = await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 await h.command('account.save', { id: 'wren', value: { ...accountValue(wrenParty.id, 'wren@example.test'), name: 'Wren & Co.' } });
 const buyer = { as: await h.signIn('buyer@example.test') }, wren = { as: await h.signIn('wren@example.test') };
 // Real public-door invoices; only their historical issue dates (and one legacy currency) are fixture data.
 const invoiced = async (quantity, reference, issuedAt, legacy = false) => {
  const draft = await h.command('order.prepare', { accountId: 'cedar', reference, lines: [{ sku: 'OAT-1', quantity }] }, buyer);
  await h.command('order.submit', { orderId: draft.id }, buyer);
  const order = await h.command('order.approve', { orderId: draft.id });
  assert.equal(order.status, 'approved');
  const aged = { ...order, invoice: { ...order.invoice, issuedAt, dueAt: issuedAt.replace(/-\d\d$/, '-28') } };
  if (legacy) delete aged.currency;
  await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(aged), order.id).run();
  return aged;
 };
 const august = await invoiced(2, 'PO-AUG', '2026-08-14');
 const first = await invoiced(3, 'PO-SEP-1', '2026-09-01');
 const second = await invoiced(4, 'PO-SEP-2', '2026-09-30');
 const legacy = await invoiced(2, 'PO-LEGACY', '2026-09-10', true);
 await invoiced(5, 'PO-OCT', '2026-10-01');
 await h.command('order.prepare', { accountId: 'cedar', reference: 'DRAFT', lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);

 const read = (suffix = '', query = '?from=2026-09-01&to=2026-09-30', opts = buyer) => h.request(`/api/barrow/statements/cedar${suffix}${query}`, opts);
 const statement = await (await read()).json();
 assert.equal(statement.to, '2026-09-30');
 const [usd, aud] = statement.sections;
 // Inclusive bounds: 1 and 30 September are in the period; 14 August is opening; 1 October is excluded.
 assert.deepEqual([usd.currency, usd.openingCents, usd.invoices.map(line => line.number), usd.invoicedCents, usd.closingCents], ['USD', august.totalCents, [first.invoice.number, second.invoice.number], first.totalCents + second.totalCents, august.totalCents + first.totalCents + second.totalCents]);
 assert.deepEqual([aud.currency, aud.openingCents, aud.invoices.map(line => [line.number, line.amountCents]), aud.closingCents], ['AUD', 0, [[legacy.invoice.number, legacy.totalCents]], legacy.totalCents]);
 assert.deepEqual(usd.entries.map(line => [line.kind, line.date, line.amountCents]), [['invoice', '2026-09-01', first.totalCents], ['invoice', '2026-09-30', second.totalCents]]);
 assert.equal(usd.receivedCents, 0);
 assert.equal(usd.surchargedCents, 0);
 assert.deepEqual(usd.invoices[0], { number: first.invoice.number, issuedAt: '2026-09-01', dueAt: '2026-09-28', orderId: first.id, reference: 'PO-SEP-1', amountCents: 19500, invoicePath: `/api/barrow/invoices/${first.id}.csv`, orderPath: `/api/barrow/orders/${first.id}/timeline` });
 // Each source link resolves to the invoice with the same total.
 const invoiceCsv = await (await h.request(usd.invoices[1].invoicePath, buyer)).text();
 assert.ok(invoiceCsv.includes(`"${second.invoice.number}"`) && invoiceCsv.includes(`"${second.totalCents}"`));
 assert.equal((await h.request(usd.invoices[1].orderPath, buyer)).status, 200);

 // The CSV and PDF carry the same financial figures as JSON.
 const csv = await (await read('.csv')).text(), [header, ...data] = csv.trim().split('\r\n').map(line => line.slice(1, -1).split('","'));
 const rows = data.filter(row => row.length === header.length).map(row => Object.fromEntries(header.map((key, index) => [key, row[index]])));
 assert.deepEqual(rows.filter(row => row.currency === 'USD').map(row => [row.kind, row.date, Number(row.amount_cents), Number(row.balance_cents)]), [
  ['opening', '2026-09-01', august.totalCents, august.totalCents],
  ['invoice', '2026-09-01', first.totalCents, august.totalCents + first.totalCents],
  ['invoice', '2026-09-30', second.totalCents, usd.closingCents],
  ['closing', '2026-09-30', usd.closingCents, usd.closingCents],
 ]);
 assert.equal(Number(rows.find(row => row.currency === 'AUD' && row.kind === 'closing').balance_cents), aud.closingCents);
 const pdf = await read('.pdf');
 assert.equal(pdf.headers.get('content-type'), 'application/pdf');
 const text = await pdf.text();
 assert.ok(text.startsWith('%PDF-1.4'));
 assert.ok(text.includes(`(USD closing balance: USD ${((august.totalCents + 45500) / 100).toFixed(2)}) Tj`));
 assert.ok(text.includes(legacy.invoice.number) && text.includes('AUD 130.00'));
 // DATA-001: every statement invoice is in the buyer's export with the same number, issue date, currency and amount.
 const exported = await (await h.request('/api/barrow/export.json', buyer)).json();
 const records = new Map(exported.invoices.map(row => [row.number, [row.issuedAt, row.currency, row.totalCents]]));
 for (const section of statement.sections) for (const line of section.invoices) assert.deepEqual(records.get(line.number), [line.issuedAt, section.currency, line.amountCents]);
 // Without a start date the statement opens at zero and runs to today.
 const all = await (await read('', '')).json();
 assert.equal(all.from, null); assert.equal(all.sections[0].openingCents, 0); assert.equal(all.sections[0].invoices.length, 4);
 assert.equal((await read('', '?from=2026-09-31')).status, 400);
 assert.equal((await read('', '?from=2026-10-01&to=2026-09-01')).status, 400);

 // Another company is refused as not found; an agent cannot read finance statements.
 assert.equal((await read('', '', wren)).status, 404);
 assert.equal((await read('.pdf', '', wren)).status, 404);
 const { token } = await h.api('/api/barrow/agent-token', {});
 assert.equal((await read('', '', { as: '', headers: { authorization: `Bearer ${token}` } })).status, 403);
 // ACC-004: holding then closing the account keeps its buyer's statement access.
 for (const lifecycle of ['on-hold', 'closed']) {
  account = await h.command('account.save', { id: 'cedar', revision: account.revision, value: { ...account.value, lifecycle } });
  const held = await read();
  assert.equal(held.status, 200); assert.equal((await held.json()).sections[0].closingCents, usd.closingCents);
  assert.equal((await read('.pdf')).status, 200);
 }
});
