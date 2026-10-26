import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

// Historical invoice dates and legacy currency are fixture data, not invented provider payment events.
test('RPT-004: invoice aging reconciles frozen source cents and due dates at every bucket boundary, keeps currencies separate and refuses unauthorized reports', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const customer = await pier.command('party.save', { name: 'Wren Market', kind: 'customer' });
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), assignedRep: 'Alex' } });
 await h.command('account.save', { id: 'wren', value: { ...accountValue(customer.id, 'wren@example.test'), name: 'Wren Market', assignedRep: 'Jo' } });
 const buyer = { as: await h.signIn('buyer@example.test') };
 const admin = { as: await h.signIn('finance@example.test', 'admin') };
 let sequence = 0;
 const asOf = '2026-10-20', shift = days => new Date(Date.parse(asOf + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
 async function invoice(accountId, days, legacy = false, issuedAt = '2026-06-01') {
  const draft = await h.command('order.prepare', { accountId, reference: `PO-${accountId}-${++sequence}`, lines: [{ sku: 'OAT-1', quantity: 2 }] });
  await h.command('order.submit', { orderId: draft.id });
  const order = await h.command('order.approve', { orderId: draft.id });
  const historical = { ...order, invoice: { ...order.invoice, issuedAt, dueAt: shift(days) } };
  if (legacy) delete historical.currency;
  await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(historical), order.id).run();
  return historical;
 }
 const days = [-1, 0, 1, 30, 31, 60, 61, 90, 91], expected = ['current', 'current', '1-30', '1-30', '31-60', '31-60', '61-90', '61-90', '91+'];
 const orders = [];
 for (const overdue of days) orders.push(await invoice('cedar', overdue));
 const legacy = await invoice('cedar', 40, true);
 const wren = await invoice('wren', 4);
 await invoice('cedar', 0, false, '2026-10-21'); // Not issued as of report date.
 const included = await invoice('cedar', 0, false, asOf); // Inclusive issue bound.
 await h.command('order.prepare', { accountId: 'cedar', reference: 'UNINVOICED', lines: [{ sku: 'OAT-1', quantity: 2 }] });
 const path = `/api/barrow/reports/finance?asOf=${asOf}`;
 const report = await h.api(path);
 assert.equal(report.asOf, asOf); assert.equal(report.timeZone, 'America/New_York');
 assert.equal(report.rows.length, orders.length + 3);
 const rows = new Map(report.rows.map(row => [row.orderId, row]));
 for (let i = 0; i < orders.length; i++) {
  const row = rows.get(orders[i].id);
  assert.equal(row.bucket, expected[i]); assert.equal(row.overdueDays, Math.max(0, days[i]));
  assert.equal(row.amountCents, orders[i].totalCents); assert.equal(row.dueAt, orders[i].invoice.dueAt);
  assert.equal(row.invoiceNumber, orders[i].invoice.number);
 }
 assert.ok(rows.has(included.id)); assert.equal(rows.get(legacy.id).currency, 'AUD');
 const usd = report.totals.find(row => row.currency === 'USD'), aud = report.totals.find(row => row.currency === 'AUD');
 assert.equal(usd.totalCents, [...orders, wren, included].reduce((sum, order) => sum + order.totalCents, 0));
 assert.equal(aud.totalCents, legacy.totalCents);
 for (const total of report.totals) {
  assert.equal(Object.values(total.buckets).reduce((sum, value) => sum + value, 0), total.totalCents);
  for (const [bucket, cents] of Object.entries(total.buckets)) assert.equal(cents, report.rows.filter(row => row.currency === total.currency && row.bucket === bucket).reduce((sum, row) => sum + row.amountCents, 0));
 }
 const source = rows.get(orders[0].id);
 const downloaded = await (await h.request(source.invoicePath)).text(); assert.ok(downloaded.includes(`"${orders[0].totalCents}"`));
 assert.equal((await h.api(source.orderPath)).id, orders[0].id);
 assert.equal((await h.request(source.statementPath)).status, 200);
 const csvResponse = await h.request(`/api/barrow/reports/finance.csv?asOf=${asOf}`), csv = await csvResponse.text();
 assert.match(csvResponse.headers.get('content-type'), /text\/csv/);
 const csvLines = csv.split('\r\n').filter(Boolean).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"')));
 const [headers, ...values] = csvLines;
 const exported = values.map(value => Object.fromEntries(headers.map((name, index) => [name, value[index]]))).filter(row => row.orderId?.startsWith('ORD-'));
 assert.equal(exported.length, report.rows.length);
 for (const row of report.rows) {
  const entry = exported.find(item => item.orderId === row.orderId);
  assert.deepEqual([entry.invoiceNumber, entry.accountId, entry.currency, Number(entry.amountCents), entry.dueAt, entry.bucket, Number(entry.overdueDays)], [row.invoiceNumber, row.accountId, row.currency, row.amountCents, row.dueAt, row.bucket, row.overdueDays]);
 }
 for (const total of report.totals) assert.equal(exported.filter(row => row.currency === total.currency).reduce((sum, row) => sum + Number(row.amountCents), 0), total.totalCents);
 assert.match(report.notes.amounts, /not.*confirmed unpaid/i); assert.match(csv, /not.*confirmed unpaid/i);
 assert.deepEqual(report.refundStatus, []);
 assert.match(report.notes.unrecorded, /not recorded/i);
 for (const key of ['availableCredit', 'exposure', 'deposits', 'failedPayments', 'disputedBalances', 'ledgerReconciliation']) assert.equal(report[key], null);
 const scoped = await h.api(path + '&assignedRep=Jo'); assert.deepEqual(scoped.rows.map(row => row.orderId), [wren.id]);
 assert.equal((await h.api(path + '&accountId=cedar')).rows.length, report.rows.length - 1);
 assert.deepEqual((await h.api(path + '&accountId=absent')).rows, []);
 assert.deepEqual((await h.api(path, undefined, admin)).rows, report.rows);
 for (const suffix of ['', '.csv']) {
  await h.api(`/api/barrow/reports/finance${suffix}?asOf=${asOf}`, undefined, { ...buyer, status: 403 });
 }
 const { token } = await h.api('/api/barrow/agent-token', {});
 await h.api(path, undefined, { as: '', headers: { authorization: `Bearer ${token}` }, status: 403 });
 for (const date of ['2026-02-30', 'bad', '2026-13-01']) await h.api(`/api/barrow/reports/finance?asOf=${date}`, undefined, { status: 400 });
 await h.command('settings.timezone', { timeZone: 'Pacific/Honolulu' });
 const current = await h.api('/api/barrow/reports/finance');
 const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Honolulu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(current.checkedAt));
 assert.equal(current.asOf, date); assert.equal(current.timeZone, 'Pacific/Honolulu');
 assert.equal((await h.api(path)).rows.find(row => row.orderId === orders[0].id).dueAt, orders[0].invoice.dueAt);
});
