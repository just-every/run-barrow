import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';
const signature = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const csv = text => text.trim().split('\r\n').map(line => line.slice(1, -1).split('","'));
const pdfText = async response => { assert.equal(response.status, 200); return Buffer.from(await response.arrayBuffer()).toString(); };

test('ORD-015: versioned sales terms are accepted by the buyer or captured by signature, stay on each order across a later version, and the next order needs the new version', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier);
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const account = await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0 } });
 const buyer = { as: await h.signIn(account.value.email) }, other = { as: await h.signIn('other@example.test') };
 const lines = [{ sku: 'OAT-1', quantity: 3 }];
 const v1Text = 'Cancellations after the ship window carry a 10 percent restocking fee. Returns need written approval.';
 // Only a signed-in supplier publishes or assigns terms.
 await h.command('terms.publish', { series: 'Wholesale terms', title: 'Wholesale terms 2027', body: v1Text }, { ...buyer, status: 403 });
 await h.command('terms.publish', { series: 'Wholesale terms', title: 'Wholesale terms 2027' }, { status: 400 });
 assert.equal((await h.command('terms.publish', { series: 'Wholesale terms', title: 'Wholesale terms 2027', body: v1Text })).version, 1);
 await h.command('terms.assign', { accountId: 'cedar', series: 'Never published', requireAcceptance: true }, { status: 404 });
 await h.command('terms.assign', { accountId: 'cedar', series: 'Wholesale terms', requireAcceptance: true });
 // The buyer reads exactly the current terms of their own account; another buyer cannot.
 const shown = await h.api('/api/barrow/sales-terms?accountId=cedar', undefined, buyer);
 assert.equal(shown.assignment.current.version, 1); assert.equal(shown.assignment.current.body, v1Text); assert.equal(shown.assignment.requireAcceptance, true);
 assert.equal((await h.request('/api/barrow/sales-terms?accountId=cedar', other)).status, 404);
 assert.equal((await h.request('/api/barrow/sales-terms', buyer)).status, 403);

 // Buyer order: refused without acceptance, with a stale version or an unticked box; accepted version 1 is recorded.
 let first = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-BUYER', lines }, buyer);
 const refused = await h.command('order.submit', { orderId: first.id }, { ...buyer, status: 409 }); assert.equal(refused.error.code, 'TERMS_REQUIRED');
 assert.equal((await h.command('order.submit', { orderId: first.id, termsAcceptance: { version: 2, accepted: true } }, { ...buyer, status: 409 })).error.code, 'TERMS_VERSION');
 assert.equal((await h.command('order.submit', { orderId: first.id, termsAcceptance: { version: 1, accepted: false } }, { ...buyer, status: 409 })).error.code, 'TERMS_REQUIRED');
 first = await h.command('order.submit', { orderId: first.id, termsAcceptance: { version: 1, accepted: true, printedName: 'Casey Cedar' } }, buyer);
 assert.equal(first.status, 'submitted');
 assert.deepEqual([first.termsAcceptance.series, first.termsAcceptance.version, first.termsAcceptance.how, first.termsAcceptance.printedName], ['Wholesale terms', 1, 'buyer', 'Casey Cedar']);

 // Rep order: a supplier acting for the rep must capture the buyer's printed name and on-device signature image.
 let second = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-REP', lines });
 const needSignature = await h.command('order.submit', { orderId: second.id }, { status: 409 }); assert.equal(needSignature.error.code, 'TERMS_REQUIRED'); assert.match(needSignature.error.message, /signature/);
 await h.command('order.submit', { orderId: second.id, termsAcceptance: { version: 1, accepted: true } }, { status: 400 });
 await h.command('order.submit', { orderId: second.id, termsAcceptance: { version: 1, printedName: 'Pat Buyer', signaturePngBase64: Buffer.from('not a png').toString('base64') } }, { status: 400 });
 second = await h.command('order.submit', { orderId: second.id, termsAcceptance: { version: 1, printedName: 'Pat Buyer', signaturePngBase64: signature.toString('base64') } });
 assert.deepEqual([second.termsAcceptance.how, second.termsAcceptance.printedName, second.termsAcceptance.signatureSha256], ['rep-signature', 'Pat Buyer', sha(signature)]);
 const image = await h.request(`/api/barrow/orders/${second.id}/terms-signature`, buyer);
 assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await image.arrayBuffer()), signature);
 assert.equal((await h.request(`/api/barrow/orders/${second.id}/terms-signature`, other)).status, 404);
 assert.equal((await h.request(`/api/barrow/orders/${first.id}/terms-signature`, buyer)).status, 404);

 // Version 2 applies to new orders only: both submitted orders keep version 1 in their confirmation PDFs.
 const v2Text = 'Version two raises the restocking fee to 15 percent and adds chargeback handling.';
 assert.equal((await h.command('terms.publish', { series: 'Wholesale terms', title: 'Wholesale terms 2027 revised', body: v2Text })).version, 2);
 for (const [order, how] of [[first, /accepted by the buyer/], [second, /signed on the buyer's device/]]) {
  const confirmation = await h.api(`/api/barrow/orders/${order.id}/confirmations`, undefined, buyer);
  assert.equal(confirmation.confirmations[0].snapshot.termsAcceptance.version, 1);
  const text = await pdfText(await h.request(`/api/barrow/orders/${order.id}/confirmations/1.pdf`, buyer));
  assert.match(text, /version 1/); assert.ok(text.includes('10 percent restocking fee')); assert.match(text, how); assert.ok(!text.includes('15 percent'));
 }
 assert.match(await pdfText(await h.request(`/api/barrow/orders/${second.id}/confirmations/1.pdf`, buyer)), /Pat Buyer/);
 let third = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-NEXT', lines }, buyer);
 assert.equal((await h.command('order.submit', { orderId: third.id, termsAcceptance: { version: 1, accepted: true } }, { ...buyer, status: 409 })).error.code, 'TERMS_VERSION');
 assert.equal((await h.command('order.submit', { orderId: third.id }, { ...buyer, status: 409 })).error.code, 'TERMS_REQUIRED');
 third = await h.command('order.submit', { orderId: third.id, termsAcceptance: { version: 2, accepted: true } }, buyer);
 assert.equal(third.termsAcceptance.version, 2);
 assert.equal((await h.api(`/api/barrow/orders/${first.id}`, undefined, buyer)).termsAcceptance.version, 1);

 // Exports carry the versions and each order's acceptance; an archive restore keeps the evidence byte for byte.
 const all = await h.api('/api/barrow/export.json');
 assert.deepEqual(all.salesterms.map(row => row.version), [1, 2]);
 assert.deepEqual(all.termsacceptances.map(row => [row.orderId, row.version, row.how]).sort(), [[first.id, 1, 'buyer'], [second.id, 1, 'rep-signature'], [third.id, 2, 'buyer']].sort());
 const mine = await h.api('/api/barrow/export.json', undefined, buyer); assert.equal(mine.termsacceptances.length, 3); assert.equal(mine.salesterms.length, 2);
 const [header, ...rows] = csv(await (await h.request('/api/barrow/export/termsacceptances.csv', buyer)).text()); assert.equal(rows.length, 3); assert.ok(header.includes('signatureSha256'));
 const target = await installation(); t.after(() => target.close());
 await restore(target, await archive(h));
 assert.deepEqual(await target.api(`/api/barrow/orders/${second.id}`), await h.api(`/api/barrow/orders/${second.id}`));
 assert.deepEqual(Buffer.from(await (await target.request(`/api/barrow/orders/${second.id}/terms-signature`)).arrayBuffer()), signature);
 assert.equal(await pdfText(await target.request(`/api/barrow/orders/${first.id}/confirmations/1.pdf`)), await pdfText(await h.request(`/api/barrow/orders/${first.id}/confirmations/1.pdf`)));

 // Where acceptance is optional an order submits without it; with no assignment an acceptance is refused.
 await h.command('terms.assign', { accountId: 'cedar', series: 'Wholesale terms', requireAcceptance: false });
 let optional = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-OPTIONAL', lines }, buyer);
 optional = await h.command('order.submit', { orderId: optional.id }, buyer); assert.equal(optional.termsAcceptance, undefined);
 await h.command('terms.assign', { accountId: 'cedar', series: null });
 const unassigned = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-NONE', lines }, buyer);
 assert.equal((await h.command('order.submit', { orderId: unassigned.id, termsAcceptance: { version: 2, accepted: true } }, { ...buyer, status: 409 })).error.code, 'TERMS_NOT_ASSIGNED');
 assert.equal((await h.command('order.submit', { orderId: unassigned.id }, buyer)).status, 'submitted');
});

test('ORD-015: terms published as a PDF download only for the buyer they are assigned to, and agents cannot publish or assign', async t => {
 const h = await installation(); t.after(() => h.close());
 const account = await h.command('account.save', { id: 'fern', value: { ...accountValue('pier-customer-1', 'fern@example.test'), minimumCents: 0 } });
 const buyer = { as: await h.signIn(account.value.email) }, other = { as: await h.signIn('other@example.test') };
 const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
 const published = await h.command('terms.publish', { series: 'Chargebacks', title: 'Chargeback policy', pdf: { name: 'Chargeback policy.pdf', contentBase64: pdf.toString('base64') } });
 assert.equal(published.version, 1);
 await h.command('terms.publish', { series: 'Chargebacks', title: 'Not a PDF', pdf: { name: 'terms.png', contentBase64: signature.toString('base64') } }, { status: 400 });
 await h.command('terms.assign', { accountId: 'fern', series: 'Chargebacks', requireAcceptance: true });
 const current = (await h.api('/api/barrow/sales-terms?accountId=fern', undefined, buyer)).assignment.current;
 assert.equal(current.pdf.sha256, sha(pdf)); assert.equal(current.hasText, false);
 const path = `/api/barrow/sales-terms/Chargebacks/1/document`, download = await h.request(path, buyer);
 assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'application/pdf'); assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
 assert.equal((await h.request(path, other)).status, 404);
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 await h.command('terms.publish', { series: 'Agent terms', title: 'Nope', body: 'No.' }, { ...agent, status: 403 });
 await h.command('terms.assign', { accountId: 'fern', series: null }, { ...agent, status: 403 });
 assert.equal((await h.api('/api/barrow/sales-terms')).series.length, 1);
});
