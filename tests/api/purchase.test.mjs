import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

const easternDay = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 86400000));

test('ORD-007: purchase dates, instructions and buyer SKU aliases reach the order and Pier; an accidental duplicate PO is refused until a numbered release is authorized', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '60');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const birch = await pier.command('party.save', { name: 'Birch Lane Grocer', kind: 'customer' });
 await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(birch.id, 'other@example.test'), name: 'Birch Lane Grocer' } });
 const buyer = await h.signIn('buyer@example.test'), other = await h.signIn('other@example.test');
 const requestedDate = easternDay(14), cancelAfter = easternDay(28);
 const prepare = (payload, as = buyer, accountId = 'cedar') => h.command('order.prepare', { accountId, lines: [{ sku: 'OAT-1', quantity: 2, buyerSku: 'CSP-GRAN-12' }], ...payload }, { as });

 // Dates are Eastern calendar days, inclusive, never before today; cancel-after is on or after the requested date.
 assert.equal((await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }], requestedDate: easternDay(-1) }, { as: buyer, status: 400 })).error.code, 'DATES');
 assert.equal((await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }], requestedDate, cancelAfter: easternDay(7) }, { as: buyer, status: 400 })).error.code, 'DATES');
 assert.equal((await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }], requestedDate: '2026-02-30' }, { as: buyer, status: 400 })).error.code, 'INPUT');
 const sameDay = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }], requestedDate: easternDay(0), cancelAfter: easternDay(0) }, { as: buyer });
 assert.equal(sameDay.cancelAfter, sameDay.requestedDate);

 const first = await prepare({ reference: 'PO-7781', requestedDate, cancelAfter, instructions: 'Deliver to the loading dock before 10 am.' });
 assert.deepEqual([first.reference, first.requestedDate, first.cancelAfter, first.instructions, first.lines[0].buyerSku], ['PO-7781', requestedDate, cancelAfter, 'Deliver to the loading dock before 10 am.', 'CSP-GRAN-12']);
 assert.equal(first.lines[0].sku, 'OAT-1');
 // One supporting PO document per draft: PDF/PNG/JPEG by its bytes, at most 1 MB, downloaded never inline, people only.
 const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 32), Buffer.from('%%EOF\n')]);
 const attach = (orderId, bytes, name = 'PO 7781 (signed).pdf', opts = { as: buyer }) => h.command('order.attach', { orderId, name, contentBase64: bytes.toString('base64') }, opts);
 assert.equal((await attach(first.id, Buffer.from('<html><script>alert(1)</script>'), 'po.pdf', { as: buyer, status: 400 })).error.code, 'DOCUMENT');
 assert.equal((await attach(first.id, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1048576)]), 'big.pdf', { as: buyer, status: 400 })).error.code, 'DOCUMENT');
 assert.equal((await attach(first.id, pdf, 'po.pdf', { as: other, status: 404 })).error.code, 'NOT_FOUND');
 const attached = await attach(first.id, pdf);
 assert.deepEqual([attached.document.name, attached.document.type, attached.document.size, attached.document.sha256], ['PO-7781-signed.pdf', 'application/pdf', pdf.length, createHash('sha256').update(pdf).digest('hex')]);
 const download = await h.request(`/api/barrow/orders/${first.id}/document`, { as: buyer });
 assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'application/pdf');
 assert.equal(download.headers.get('content-disposition'), 'attachment; filename="PO-7781-signed.pdf"'); assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
 assert.ok(Buffer.from(await download.arrayBuffer()).equals(pdf));
 assert.equal((await h.request(`/api/barrow/orders/${first.id}/document`)).status, 200);
 assert.equal((await h.request(`/api/barrow/orders/${first.id}/document`, { as: other })).status, 404);
 const { token } = await h.api('/api/barrow/agent-token', {});
 assert.equal((await h.request(`/api/barrow/orders/${first.id}/document`, { as: '', headers: { authorization: `Bearer ${token}` } })).status, 403);
 assert.equal((await h.request('/api/barrow/commands', { method: 'POST', as: '', headers: { authorization: `Bearer ${token}` }, body: { type: 'order.attach', payload: { orderId: first.id, name: 'x.pdf', contentBase64: pdf.toString('base64') } } })).status, 403);
 await h.command('order.submit', { orderId: first.id }, { as: buyer });
 assert.equal((await attach(first.id, pdf, 'late.pdf', { as: buyer, status: 409 })).error.code, 'DOCUMENT_LOCKED');
 const approved = await h.command('order.approve', { orderId: first.id });
 assert.equal(approved.status, 'approved');
 const handoff = (await pier.api('/api/pier/state')).orders.find(order => order.id === approved.pierOrderId);
 assert.equal(handoff.promiseDate, requestedDate);

 // The same PO on the same account, however it is spaced or cased, is an accidental repeat until a release is authorized.
 const repeat = await prepare({ reference: '  po-7781 ' });
 const refused = await h.command('order.submit', { orderId: repeat.id }, { as: buyer, status: 409 });
 assert.equal(refused.error.code, 'DUPLICATE_PO'); assert.match(refused.error.message, new RegExp(first.id));
 assert.equal((await h.api('/api/barrow/state', undefined, { as: buyer })).orders.find(order => order.id === repeat.id).status, 'draft');
 const buyerId = (await h.api('/api/barrow/state', undefined, { as: buyer })).actor.id;
 const release = await h.command('order.submit', { orderId: repeat.id, release: true }, { as: buyer });
 assert.equal(release.status, 'submitted');
 assert.deepEqual([release.poRelease.number, release.poRelease.of, release.poRelease.authorizedBy], [2, first.id, buyerId]);
 const third = await prepare({ reference: 'PO-7781' });
 assert.equal((await h.command('order.submit', { orderId: third.id, release: true }, { as: buyer })).poRelease.number, 3);
 const trail = (await h.api(`/api/barrow/audit?orderId=${repeat.id}`)).events.map(event => event.action);
 assert.ok(trail.includes('order.submitted-release'));

 // Detection is account-scoped: another company may use the same PO number; a PO-less order is never a duplicate.
 const elsewhere = await prepare({ reference: 'PO-7781' }, other, 'birch');
 assert.equal((await h.command('order.submit', { orderId: elsewhere.id }, { as: other })).poRelease, undefined);
 const unreferenced = await prepare({});
 await h.command('order.submit', { orderId: unreferenced.id }, { as: buyer });
 assert.equal((await h.command('order.submit', { orderId: (await prepare({})).id }, { as: buyer })).status, 'submitted');
 // The owner archive carries the purchase details and the document; a restored installation serves the same bytes.
 const moved = await installation(); t.after(() => moved.close());
 await restore(moved, await archive(h));
 const restored = (await moved.api('/api/barrow/state')).orders.find(order => order.id === first.id);
 assert.deepEqual([restored.requestedDate, restored.cancelAfter, restored.instructions, restored.lines[0].buyerSku, restored.document.sha256], [requestedDate, cancelAfter, 'Deliver to the loading dock before 10 am.', 'CSP-GRAN-12', attached.document.sha256]);
 assert.ok(Buffer.from(await (await moved.request(`/api/barrow/orders/${first.id}/document`)).arrayBuffer()).equals(pdf));
 // Another buyer cannot read the purchase details.
 assert.equal((await h.api('/api/barrow/state', undefined, { as: other })).orders.some(order => order.id === first.id), false);
});
