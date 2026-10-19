import test from 'node:test';
import assert from 'node:assert/strict';
import { installation } from './harness.mjs';

const sizes = ['S', 'M', 'L', 'XL'];
const skus = Array.from({ length: 20 }, (_, n) => sizes.map(size => `ST${String(n + 1).padStart(2, '0')}-${size}`)).flat();
const codes = [...skus, 'OTHER-1', 'ARCH-1'], barcode = sku => `0${codes.indexOf(sku) + 100000000000}`;

test('ORD-001: barcode/SKU paste and an 80-line CSV preview resolve duplicates, hidden SKUs and case packs before an explicit merge or replace; order forms round-trip', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const items = [];
 for (const sku of codes) items.push(await pier.command('item.save', { sku, name: `Tee ${sku}`, barcode: barcode(sku), unit: 'each', packSize: '1' }));
 const bin = await pier.command('location.save', { name: 'Shelf A1', warehouse: 'New York', kind: 'bin' });
 const mill = await pier.command('party.save', { name: 'Mill House', kind: 'supplier' });
 const customer = await pier.command('party.save', { name: 'Cedar Street Outfitters', kind: 'customer' });
 const wren = await pier.command('party.save', { name: 'Wren & Co.', kind: 'customer' });
 const quantityOf = item => item.sku === 'ST20-XL' ? '10' : '200';
 const po = await pier.command('po.draft', { supplierId: mill.id, promiseDate: '2026-10-20', reason: 'Opening stock', lines: items.map(item => ({ itemId: item.id, quantity: quantityOf(item), price: '5.00' })) });
 await pier.command('po.approve', { poId: po.id, version: po.version });
 await pier.command('po.commit', { poId: po.id, version: po.version });
 await pier.command('receipt.create', { poId: po.id, supplierReference: 'Delivery 1', lines: po.lines.map((line, index) => ({ poLineId: line.id, locationId: bin.id, quantity: quantityOf(items[index]), cost: '5.00' })) });
 const archived = items.at(-1);
 await pier.command('item.save', { id: archived.id, version: archived.version, sku: 'ARCH-1', name: 'Tee ARCH-1', barcode: archived.barcode, unit: 'each', packSize: '1', archived: true });

 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 // OTHER-1 is in Pier but not on this account's price list; ARCH-1 is listed but archived in Pier.
 const prices = [...skus.map((sku, n) => ({ sku, unitCents: 1000 + n * 25, minQty: sku === 'ST01-S' ? 6 : 1, ...(sku === 'ST01-S' ? { casePack: 6 } : {}) })), { sku: 'ARCH-1', unitCents: 900, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { name: 'Cedar Street Outfitters', email: 'buyer@example.test', pierCustomerId: customer.id, termsDays: 30, minimumCents: 10000, prices } });
 const as = { as: await h.signIn('buyer@example.test') };
 const preview = (payload, opts = as) => h.command('cart.preview', { accountId: 'cedar', ...payload }, opts);
 const offers = (await h.api('/api/barrow/catalogue?accountId=cedar', undefined, as)).items;
 assert.equal(offers.find(item => item.sku === 'ST07-M').barcode, barcode('ST07-M'));

 // Quick add by SKU or scanned barcode: unknown, unlisted and archived SKUs read identically; stock is checked.
 const quick = await preview({ paste: `st05-s 2\n${barcode('ST06-L')}\t3\nNOPE-9 1\nOTHER-1,1\n${barcode('OTHER-1')} 1\nARCH-1 1\nST20-XL 20` });
 assert.deepEqual(quick.lines.map(line => [line.sku, line.quantity]), [['ST05-S', '2'], ['ST06-L', '3'], ['ST20-XL', '20']]);
 assert.deepEqual(quick.rows.filter(row => row.status === 'error').map(row => row.message), ['NOPE-9', 'OTHER-1', barcode('OTHER-1'), 'ARCH-1'].map(code => `${code} is not on this account’s price list.`));
 assert.equal(quick.lines[2].problem, 'ST20-XL: only 10 each available.');
 assert.equal(quick.ready, false); assert.equal(quick.cart, undefined);

 // Replace and merge are explicit and differ: the pad already holds 4 × ST02-M.
 const cart = [{ sku: 'ST02-M', quantity: 4 }], two = { paste: 'ST05-S 2\nST02-M 2' };
 assert.deepEqual((await preview({ ...two, cart, mode: 'replace' })).cart, [{ sku: 'ST05-S', unit: 'each', quantity: 2 }, { sku: 'ST02-M', unit: 'each', quantity: 2 }]);
 const merged = await preview({ ...two, cart, mode: 'merge' });
 assert.deepEqual(merged.cart, [{ sku: 'ST05-S', unit: 'each', quantity: 2 }, { sku: 'ST02-M', unit: 'each', quantity: 6 }]);
 assert.equal(merged.lines[1].inCart, '4');

 // A real-shaped 80-line CSV: 77 valid SKUs (one by barcode only, one with the buyer's own code), a duplicate,
 // an unknown SKU and a quantity that breaks ST01-S's case pack of 6.
 const valid = skus.filter(sku => !['ST01-S', 'ST20-XL', 'ST19-XL'].includes(sku));
 const body = valid.map((sku, n) => sku === 'ST09-L' ? `,${barcode(sku)},${n % 5 + 1},` : `${sku},,${n % 5 + 1},${sku === 'ST04-M' ? 'CEDAR-TEE-4M' : ''}`);
 body.splice(40, 0, 'ST03-L,,2,', 'NOPE-9,,1,', '"ST01-S",,8,');
 const csv = `SKU,Barcode,Quantity,buyerSku\r\n${body.join('\r\n')}\r\n`;
 assert.equal(body.length, 80);
 const first = await preview({ csv, cart });
 assert.equal(first.layout, 'vertical'); assert.equal(first.lines.length, 78); assert.equal(first.errors, 2); assert.equal(first.ready, false);
 const dup = first.lines.find(line => line.sku === 'ST03-L');
 assert.equal(dup.quantity, String(valid.indexOf('ST03-L') % 5 + 1 + 2)); assert.match(dup.combined, /^Rows \d+, 42 combined: \d \+ 2 = \d$/);
 assert.deepEqual(first.rows.find(row => row.status === 'error'), { ref: '43', input: 'NOPE-9', quantity: '1', status: 'error', message: 'NOPE-9 is not on this account’s price list.' });
 const pack = first.lines.find(line => line.sku === 'ST01-S');
 assert.match(pack.problem, /case packs of 6/); assert.deepEqual(pack.choices, ['6', '12']);
 assert.equal(first.lines.find(line => line.sku === 'ST09-L').rows.length, 1);
 // Nothing is applied while a row or line is unresolved, even when merge is chosen.
 assert.equal((await preview({ csv, cart, mode: 'merge' })).cart, undefined);
 const resolved = await preview({ csv, cart, mode: 'merge', skip: ['43'], set: { 'ST01-S|each': '12' } });
 assert.equal(resolved.ready, true); assert.equal(resolved.cart.length, 78);
 const accepted = Object.fromEntries(resolved.cart.map(line => [line.sku, line.quantity]));
 assert.equal(accepted['ST01-S'], 12); assert.equal(accepted['ST02-M'], 4 + valid.indexOf('ST02-M') % 5 + 1);
 assert.equal(resolved.cart.find(line => line.sku === 'ST04-M').buyerSku, 'CEDAR-TEE-4M');
 assert.equal((await h.api('/api/barrow/state', undefined, as)).orders.length, 0);

 // Checkout: the prepared draft carries every accepted line and exactly the previewed total.
 const draft = await h.command('order.prepare', { accountId: 'cedar', lines: resolved.cart }, as);
 assert.deepEqual(Object.fromEntries(draft.lines.map(line => [line.sku, line.quantity])), accepted);
 assert.equal(draft.totalCents, resolved.totalCents);
 assert.equal(draft.totalCents, resolved.cart.reduce((sum, line) => sum + line.quantity * prices.find(price => price.sku === line.sku).unitCents, 0));
 assert.equal(draft.lines.find(line => line.sku === 'ST04-M').buyerSku, 'CEDAR-TEE-4M');

 // The working cart downloads as a style-by-size form; filled offline, it uploads back through the same preview.
 const form = await h.command('cart.form', { accountId: 'cedar', layout: 'matrix', cart: [{ sku: 'ST01-S', quantity: 12 }] }, as);
 const rows = form.csv.trim().split('\r\n');
 assert.equal(rows[0], '"style","name","S","M","L","XL"'); assert.equal(rows.length, 21);
 assert.equal(rows[1], '"ST01","Tee ST01","12","","",""');
 rows[1] = '"ST01","Tee ST01","12","3","",""'; rows[2] = '"ST02","Tee ST02","","","4","2"';
 const filled = await preview({ csv: rows.join('\r\n'), mode: 'replace' });
 assert.equal(filled.layout, 'matrix');
 assert.deepEqual(filled.cart.map(line => [line.sku, line.quantity]), [['ST01-S', 12], ['ST01-M', 3], ['ST02-L', 4], ['ST02-XL', 2]]);
 const vertical = await h.command('cart.form', { accountId: 'cedar', layout: 'vertical', cart: [{ sku: 'ST05-S', quantity: 2 }] }, as);
 const lines = vertical.csv.trim().split('\r\n');
 assert.equal(lines[0], '"sku","barcode","name","unit","unitPriceUsd","quantity"');
 assert.ok(lines.includes(`"ST05-S","${barcode('ST05-S')}","Tee ST05-S","each","${(prices.find(price => price.sku === 'ST05-S').unitCents / 100).toFixed(2)}","2"`));
 assert.deepEqual((await preview({ csv: vertical.csv, mode: 'replace' })).cart, [{ sku: 'ST05-S', unit: 'each', quantity: 2 }]);

 // An agent previews through the same door; nobody previews another account's catalog.
 const { token } = await h.api('/api/barrow/agent-token', {});
 assert.equal((await preview({ paste: 'ST05-S 2' }, { as: '', headers: { authorization: `Bearer ${token}` } })).ready, true);
 await h.command('account.save', { id: 'wren', value: { name: 'Wren & Co.', email: 'wren@example.test', pierCustomerId: wren.id, termsDays: 30, minimumCents: 0, prices: prices.slice(0, 2) } });
 const other = await h.command('cart.preview', { accountId: 'cedar', paste: 'ST01-M 1' }, { as: await h.signIn('wren@example.test'), status: 404 });
 assert.equal(other.error.code, 'NOT_FOUND');
});
