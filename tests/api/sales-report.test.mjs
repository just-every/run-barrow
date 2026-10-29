import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

const rows = text => text.trim().split('\r\n').map(line => line.slice(1, -1).split('","'));

test('RPT-001: booked, split-shipped, invoiced and outstanding sales by account, SKU, channel, territory and month, filtered by territory, drilled to documents and reconciled in CSV', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '60');
 const wrenParty = await pier.command('party.save', { name: 'Wren & Co.', kind: 'customer' });
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), territory: 'Northeast', channel: 'Independent', assignedRep: 'rep-avery' } });
 await h.command('account.save', { id: 'wren', value: { ...accountValue(wrenParty.id, 'wren@example.test'), name: 'Wren & Co.', territory: 'West', channel: 'Department store' } });
 const buyer = { as: await h.signIn('buyer@example.test') }, wren = { as: await h.signIn('wren@example.test') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const place = async (accountId, as, quantity) => { const draft = await h.command('order.prepare', { accountId, reference: `PO-${accountId}`, lines: [{ sku: 'OAT-1', quantity }] }, as); await h.command('order.submit', { orderId: draft.id }, as); return h.command('order.approve', { orderId: draft.id }) };
 const dispatch = async (order, quantity, reference) => { const upstream = (await pier.api('/api/pier/state')).orders.find(row => row.id === order.pierOrderId); await pier.command('dispatch.create', { orderId: upstream.id, shipmentReference: reference, lines: [{ orderLineId: upstream.lines[0].id, quantity }] }) };

 // Cedar's order ships in two Pier dispatches; Wren's ships 1 of 4; a draft is not booked.
 const cedar = await place('cedar', buyer, 10), other = await place('wren', wren, 4);
 await dispatch(cedar, '6', 'SHIP-1'); await dispatch(cedar, '4', 'SHIP-2'); await dispatch(other, '1', 'SHIP-W');
 await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);

 const report = await h.api('/api/barrow/reports/sales');
 assert.equal(report.shipments, 'read');
 assert.deepEqual(report.totals, [{ currency: 'USD', lines: 2, orders: 2, bookedCents: 91000, shippedCents: 65000 + 6500, invoicedCents: 91000, paidCents: 0, creditedCents: 0, appliedCreditCents:0, outstandingCents: 91000, freightCents: 0, invoicedFreightCents: 0, creditedFreightCents:0,paidFreightCents:0,appliedFreightCreditCents:0,outstandingFreightCents:0 }]);
 const line = report.rows.find(row => row.orderId === cedar.id);
 assert.deepEqual([line.shippedBaseQuantity, line.shippedCents, line.invoiceNumber, line.rep], ['10', 65000, cedar.invoice.number, 'rep-avery']);
 assert.deepEqual(report.byTerritory.map(group => [group.name, group.totals[0].bookedCents]), [['Northeast', 65000], ['West', 26000]]);
 assert.deepEqual(report.byChannel.map(group => group.name), ['Department store', 'Independent']);
 assert.deepEqual(report.bySku.map(group => [group.name, group.totals[0].shippedCents]), [['OAT-1', 71500]]);
 assert.deepEqual(report.byAccount.map(group => group.name), ['Cedar Street Pantry', 'Wren & Co.']);
 assert.equal(report.byMonth.length, 1);

 // Filter one territory and drill to its documents: the order and its invoice lines match the report line.
 const northeast = await h.api('/api/barrow/reports/sales?territory=Northeast');
 assert.deepEqual(northeast.rows.map(row => row.orderId), [cedar.id]);
 const drilled = await h.api(northeast.rows[0].orderPath);
 assert.equal(drilled.lines[0].lineCents, northeast.rows[0].bookedCents);
 assert.match(await (await h.request(northeast.rows[0].invoicePath)).text(), /"OAT-1".*"65000"/);
 // Exported lines reconcile with the report totals.
 const [header, ...csv] = rows(await (await h.request('/api/barrow/reports/sales.csv')).text());
 const column = name => csv.map(row => row[header.indexOf(name)]);
 assert.equal(column('bookedCents').reduce((sum, value) => sum + Number(value), 0), report.totals[0].bookedCents);
 assert.equal(column('shippedCents').reduce((sum, value) => sum + Number(value), 0), report.totals[0].shippedCents);
 assert.deepEqual([...new Set(column('paidCents'))], ['0']);
 // Periods are inclusive reporting-zone days; managers' figures are refused to buyers and agents.
 assert.equal((await h.api('/api/barrow/reports/sales?from=2000-01-01&to=2000-01-31')).rows.length, 0);
 assert.equal((await h.api('/api/barrow/reports/sales?from=2026-02-01&to=2026-01-01', undefined, { status: 400 })).error.code, 'INPUT');
 assert.equal((await h.api('/api/barrow/reports/sales', undefined, { ...buyer, status: 403 })).error.code, 'FORBIDDEN');
 assert.equal((await h.api('/api/barrow/reports/sales', undefined, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 assert.equal((await h.api(`/api/barrow/orders/${cedar.id}`, undefined, { ...wren, status: 404 })).error.code, 'NOT_FOUND');
 // With Pier gone, shipped is unknown; booked and invoiced stand.
 await pier.close();
 const blind = await h.api('/api/barrow/reports/sales');
 assert.deepEqual([blind.shipments, blind.totals[0].shippedCents, blind.totals[0].bookedCents], ['unavailable', null, 91000]);
});
