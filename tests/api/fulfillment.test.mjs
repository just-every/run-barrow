import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { installation, stock, accountValue } from './harness.mjs';

const date = delta => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10);
test('RPT-003: live Pier line fill, dispatch timeliness, open/aging backorders, warehouse evidence and late-line actions stay exact; missing tracking is unknown', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '24');
 let down = false;
 const proxy = createServer(async (req, res) => {
  try {
   if (down) { res.destroy(); return; }
   const chunks = []; for await (const part of req) chunks.push(part);
   const upstream = await pier.request(req.url, { method: req.method, ...(chunks.length ? { body: JSON.parse(Buffer.concat(chunks)) } : {}) });
   res.writeHead(upstream.status, { 'content-type': 'application/json' }); res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { res.destroy(); }
 });
 proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
 t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); });
 const h = await installation({ bindings: { PIER_ORIGIN: `http://127.0.0.1:${proxy.address().port}`, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 const buyer = await h.signIn('buyer@example.test');
 const place = async reference => {
  const draft = await h.command('order.prepare', { accountId: 'cedar', reference, requestedDate: date(2), lines: [{ sku: 'OAT-1', quantity: 10 }] }, { as: buyer });
  await h.command('order.submit', { orderId: draft.id }, { as: buyer });
  return h.command('order.approve', { orderId: draft.id });
 };
 const onTime = await place('ON-TIME');
 const dispatch = async (order, quantity) => {
  const upstream = (await pier.api('/api/pier/state')).orders.find(row => row.id === order.pierOrderId);
  return pier.command('dispatch.create', { orderId: upstream.id, shipmentReference: order.reference, lines: [{ orderLineId: upstream.lines[0].id, quantity }] });
 };
 const firstShipment = await dispatch(onTime, '10');
 const late = await place('LATE'); await dispatch(late, '6');
 // Historical date fixture only: stock, approvals and dispatches use the actual public doors.
 // Keep the original agreed date: the source date now differs and the report must disclose it.
 await pier.db.prepare("UPDATE pier_records SET data=json_set(data,'$.promiseDate',?) WHERE kind='orders' AND id=?").bind(date(-2), late.pierOrderId).run();
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.approvedAt',?) WHERE id=?").bind(date(-5) + 'T12:00:00Z', late.id).run();
 // Draft with sufficient observed stock, then another real Pier order consumes it before approval.
 const draft = await h.command('order.prepare', { accountId: 'cedar', reference: 'BACKORDER', lines: [{ sku: 'OAT-1', quantity: 4 }] }, { as: buyer });
 await h.command('order.submit', { orderId: draft.id }, { as: buyer });
 await pier.command('order.create', { customerId: products.customer.id, lines: [{ itemId: products.item.id, quantity: '2' }] });
 const short = await h.command('order.approve', { orderId: draft.id });
 assert.equal(short.status, 'shortfall');
 const report = await h.api('/api/barrow/reports/fulfillment');
 assert.equal(report.status, 'read'); assert.equal(report.source, 'Pier'); assert.ok(Number.isFinite(Date.parse(report.checkedAt)));
 assert.equal(report.lines.length, 3); assert.deepEqual(report.exceptions, []);
 const row = id => report.lines.find(line => line.orderId === id);
 assert.deepEqual([row(onTime.id).ordered, row(onTime.id).shipped, row(onTime.id).allocated, row(onTime.id).outstanding, row(onTime.id).fillBasisPoints, row(onTime.id).dispatchedByDate, row(onTime.id).dispatchedLate], ['10', '10', '0', '0', 10000, '10', '0']);
 assert.deepEqual([row(late.id).ordered, row(late.id).shipped, row(late.id).allocated, row(late.id).backordered, row(late.id).outstanding, row(late.id).fillBasisPoints, row(late.id).dispatchedByDate, row(late.id).dispatchedLate], ['10', '6', '4', '0', '4', 6000, '0', '6']);
 assert.equal(row(late.id).promiseChanged, true); assert.equal(row(late.id).agreedDate, late.requestedDate); assert.equal(row(late.id).promisedDate, date(-2)); assert.equal(row(late.id).promiseHistory, 'Not recorded by Pier');
 assert.ok(row(late.id).ageDays >= 4); assert.equal(row(late.id).overdue, true);
 assert.deepEqual(report.lateLines.map(line => line.orderId), [late.id]); assert.equal(row(late.id).owner, 'Supplier'); assert.match(row(late.id).action, /Review this order in Pier/);
 assert.deepEqual([row(short.id).ordered, row(short.id).shipped, row(short.id).allocated, row(short.id).backordered, row(short.id).unassignedBackorder, row(short.id).fillBasisPoints], ['4', '0', '2', '2', '2', 0]);
 assert.deepEqual(row(late.id).warehouses, [{ warehouse: 'New York', allocated: '4', shipped: '6' }]);
 assert.deepEqual(row(onTime.id).warehouses, [{ warehouse: 'New York', allocated: '0', shipped: '10' }]);
 for (const line of report.lines) {
  assert.equal(Number(line.ordered), Number(line.shipped) + Number(line.cancelled) + Number(line.allocated) + Number(line.backordered));
  assert.equal(line.delivery, 'unknown'); assert.equal(line.onTimeDelivery, null); assert.match(line.tracking, /no connected carrier source/);
 }
 assert.equal((await h.api('/api/barrow/reports/fulfillment?accountId=elsewhere')).lines.length, 0);
 assert.equal((await h.api('/api/barrow/reports/fulfillment?warehouse=New+York')).lines.length, 3);
 assert.equal((await h.api('/api/barrow/reports/fulfillment?warehouse=Los+Angeles')).lines.length, 0);
 assert.deepEqual((await h.api('/api/barrow/reports/fulfillment?warehouse=Unassigned+backorder')).lines.map(line => line.orderId), [short.id]);
 // Cancellation reconciles and has no fictitious fill denominator.
 await h.command('order.cancel', { orderId: short.id, reason: 'Buyer cancelled unshipped demand' });
 const cancelled = (await h.api('/api/barrow/reports/fulfillment')).lines.find(line => line.orderId === short.id);
 assert.deepEqual([cancelled.ordered, cancelled.cancelled, cancelled.outstanding, cancelled.fillBasisPoints], ['4', '4', '0', null]);
 // A connected destination cannot silently supply a different recorded order.
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.pierOrigin',?) WHERE id=?").bind('https://different-source.example.test', short.id).run();
 const mismatched = await h.api('/api/barrow/reports/fulfillment');
 assert.equal(mismatched.lines.length, 2); assert.equal(mismatched.exceptions[0].orderId, short.id);
 assert.equal(mismatched.exceptions[0].owner, 'Supplier'); assert.match(mismatched.exceptions[0].reason, /destination differs/);
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.pierOrigin',?) WHERE id=?").bind(`http://127.0.0.1:${proxy.address().port}`, short.id).run();
 // The same source timestamp falls on different calendar days in the installation zone.
 await pier.db.prepare("UPDATE pier_records SET data=json_set(data,'$.createdAt',?) WHERE kind='shipments' AND id=?").bind('2026-10-20T05:00:00Z', firstShipment.id).run();
 await pier.db.prepare("UPDATE pier_records SET data=json_set(data,'$.promiseDate',?) WHERE kind='orders' AND id=?").bind('2026-10-19', onTime.pierOrderId).run();
 const eastern = await h.api('/api/barrow/reports/fulfillment');
 assert.equal(eastern.timeZone, 'America/New_York');
 assert.equal(eastern.lines.find(line => line.orderId === onTime.id).dispatchedLate, '10');
 assert.equal((await h.command('settings.timezone', { timeZone: 'America/Los_Angeles' }, { as: buyer, status: 403 })).error.code, 'FORBIDDEN');
 assert.equal((await h.command('settings.timezone', { timeZone: 'not-a-zone' }, { status: 400 })).error.code, 'INPUT');
 await h.command('settings.timezone', { timeZone: 'America/Los_Angeles' });
 const pacific = await h.api('/api/barrow/reports/fulfillment');
 assert.equal(pacific.timeZone, 'America/Los_Angeles');
 assert.equal(pacific.lines.find(line => line.orderId === onTime.id).dispatchedByDate, '10');
 assert.equal(pacific.lines.find(line => line.orderId === onTime.id).dispatchedLate, '0');
 assert.equal((await h.request('/api/barrow/reports/fulfillment', { as: buyer })).status, 403);
 const { token } = await h.api('/api/barrow/agent-token', {});
 assert.equal((await h.request('/api/barrow/reports/fulfillment', { as: '', headers: { authorization: `Bearer ${token}` } })).status, 403);
 assert.equal((await h.request('/api/barrow/reports/fulfillment', { as: '' })).status, 401);
 down = true;
 const unavailable = await h.api('/api/barrow/reports/fulfillment');
 assert.equal(unavailable.status, 'unavailable'); assert.deepEqual(unavailable.lines, []); assert.match(unavailable.note, /unknown/);
});
