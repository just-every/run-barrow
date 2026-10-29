import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

import { easternDay } from '../eastern-day.mjs';

test('ACC-003: a headquarters bill-to and two store ship-tos, orders to each store, a changed default and edits that never rewrite order addresses or tax jurisdictions', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '60');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 const wrenParty = await pier.command('party.save', { name: 'Wren & Co.', kind: 'customer' });
 await h.command('account.save', { id: 'wren', value: { ...accountValue(wrenParty.id, 'wren@example.test'), name: 'Wren & Co.' } });
 const buyer = { as: await h.signIn('buyer@example.test') }, wren = { as: await h.signIn('wren@example.test') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const save = (kind, value, opts = buyer, extra = {}) => h.command('location.save', { accountId: 'cedar', kind, value, ...extra }, opts);
 const list = async (opts = buyer) => (await h.api('/api/barrow/locations?accountId=cedar', undefined, opts)).locations;

 // The buyer keeps a headquarters bill-to, two store ship-tos and a contact; the first of each kind becomes the default.
 const hq = await save('bill-to', { name: 'Headquarters', line1: '350 Fifth Avenue', line2: 'Suite 4100', city: 'New York', state: 'ny', zip: '10118' });
 const brooklyn = await save('ship-to', { name: 'Brooklyn store', line1: '88 Court Street', city: 'Brooklyn', state: 'NY', zip: '11201-4402', deliveryInstructions: 'Dock B before 10am', exemption: { reference: 'NY-ST120-4471', state: 'NY' } });
 const newark = await save('ship-to', { name: 'Newark store', line1: '1 Market Street', city: 'Newark', state: 'NJ', zip: '07102', deliveryInstructions: 'Ring the side door' });
 await save('contact', { name: 'Pat Lee', role: 'Receiving', email: 'pat@example.test', phone: '+1 212 555 0100' });
 assert.deepEqual([hq.isDefault, hq.value.state, brooklyn.isDefault, newark.isDefault], [true, 'NY', true, false]);
 // US address format checks; nothing claims USPS verification.
 for (const [value, code] of [[{ state: 'ZZ', zip: '10001' }, 'ADDRESS'], [{ state: 'NY', zip: '1001' }, 'ADDRESS'], [{ state: 'NY', zip: '07102' }, 'ADDRESS']])
  assert.equal((await save('ship-to', { name: 'Bad', line1: '1 Main St', city: 'Albany', ...value }, { ...buyer, status: 400 })).error.code, code);
 assert.equal((await save('ship-to', { name: 'Hoboken', line1: '1 River St', city: 'Hoboken', state: 'NJ', zip: '07030', exemption: { reference: 'X', state: 'NY' } }, { ...buyer, status: 400 })).error.code, 'INPUT');
 // Agents neither read nor write locations; another company sees none.
 assert.equal((await h.api('/api/barrow/locations?accountId=cedar', undefined, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 assert.equal((await save('ship-to', { name: 'Agent', line1: '1 Main St', city: 'Albany', state: 'NY', zip: '12207' }, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 assert.equal((await h.api('/api/barrow/locations?accountId=cedar', undefined, { ...wren, status: 404 })).error.code, 'NOT_FOUND');
 assert.equal((await list({})).length, 4, 'the supplier reads the same records');

 // One order to each store: the default ship-to, then Newark by choice. Each snapshots its addresses and jurisdiction.
 const toBrooklyn = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-BK', lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);
 const toNewark = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-NWK', shipToId: newark.id, lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);
 for (const order of [toBrooklyn, toNewark]) await h.command('order.submit', { orderId: order.id }, buyer);
 assert.deepEqual([toBrooklyn.shipTo.name, toBrooklyn.shipTo.jurisdiction, toBrooklyn.shipTo.exemption, toBrooklyn.shipTo.deliveryInstructions, toBrooklyn.billTo.name], ['Brooklyn store', 'US-NY', { reference: 'NY-ST120-4471', state: 'NY' }, 'Dock B before 10am', 'Headquarters']);
 assert.deepEqual([toNewark.shipTo.name, toNewark.shipTo.jurisdiction, toNewark.shipTo.exemption, toNewark.billTo.zip], ['Newark store', 'US-NJ', undefined, '10118']);
 assert.match(toNewark.shipTo.check, /not verified with USPS/);
 assert.equal((await h.command('order.prepare', { accountId: 'cedar', shipToId: 'not-a-location', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...buyer, status: 400 })).error.code, 'LOCATION');

 // Change the default and edit Brooklyn afterward: submitted orders keep their addresses; a new draft uses Newark.
 const now = await list();
 await save('ship-to', { ...newark.value }, buyer, { id: newark.id, revision: now.find(row => row.id === newark.id).revision, makeDefault: true });
 const edited = await save('ship-to', { ...brooklyn.value, deliveryInstructions: 'Front door after noon' }, buyer, { id: brooklyn.id, revision: (await list()).find(row => row.id === brooklyn.id).revision });
 assert.equal((await save('ship-to', brooklyn.value, { ...buyer, status: 409 }, { id: brooklyn.id, revision: brooklyn.revision })).error.code, 'CHANGED');
 const orders = (await h.api('/api/barrow/state', undefined, buyer)).orders;
 const kept = id => orders.find(order => order.id === id).shipTo;
 assert.deepEqual([kept(toBrooklyn.id).deliveryInstructions, kept(toBrooklyn.id).jurisdiction, kept(toBrooklyn.id).revision], ['Dock B before 10am', 'US-NY', brooklyn.revision]);
 assert.equal(kept(toNewark.id).jurisdiction, 'US-NJ');
 const later = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);
 assert.equal(later.shipTo.name, 'Newark store');

 // ORD-003: history search matches the snapshot; a reorder keeps the original's ship-to while it exists, else the default.
 const search = async location => (await h.api(`/api/barrow/orders/history?${new URLSearchParams({ location })}`, undefined, buyer)).orders.map(order => order.id);
 assert.deepEqual(await search('court street'), [toBrooklyn.id]);
 assert.deepEqual((await search('newark')).sort(), [later.id, toNewark.id].sort());
 const reorder = async original => { const selections = [{ sku: 'OAT-1' }], review = await h.command('order.reorder-preview', { orderId: original.id, selections }, buyer); return h.command('order.reorder', { orderId: original.id, selections, fingerprint: review.fingerprint, acknowledged: true }, buyer) };
 assert.equal((await reorder(toBrooklyn)).shipTo.deliveryInstructions, 'Front door after noon');
 await h.command('location.archive', { accountId: 'cedar', id: brooklyn.id, revision: edited.revision }, buyer);
 assert.equal((await reorder(toBrooklyn)).shipTo.name, 'Newark store');
 assert.equal((await h.command('order.prepare', { accountId: 'cedar', shipToId: brooklyn.id, lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...buyer, status: 400 })).error.code, 'LOCATION');
 assert.equal(kept(toBrooklyn.id).name, 'Brooklyn store');

 // A converted quote snapshots the default locations.
 const q = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);
 await h.command('quote.propose', { quoteId: q.id, revision: q.revision, validUntil: easternDay(5), lines: [{ sku: 'OAT-1', quantity: 2 }] });
 const { order: quoted } = await h.command('quote.accept', { quoteId: q.id, number: 1 }, buyer);
 assert.deepEqual([quoted.shipTo.name, quoted.billTo.name], ['Newark store', 'Headquarters']);

 // DATA-001: every record (archived included) with IDs, revision and jurisdiction; orders carry their snapshots; scope holds.
 const all = JSON.parse(await (await h.request('/api/barrow/export.json')).text());
 assert.equal(all.manifest.counts.locations, 4);
 const exported = all.locations.find(row => row.id === brooklyn.id);
 assert.deepEqual([exported.kind, exported.archived, exported.jurisdiction, exported.exemptionReference, exported.revision], ['ship-to', 'yes', 'US-NY', 'NY-ST120-4471', (await list()).find(row => row.id === brooklyn.id).revision]);
 assert.equal(JSON.parse(all.orders.find(row => row.id === toBrooklyn.id).shipTo).deliveryInstructions, 'Dock B before 10am');
 assert.match(await (await h.request('/api/barrow/export/locations.csv', buyer)).text(), /^"?id"?,"?revision"?,"?accountId"?,"?kind"?/);
 const theirs = JSON.parse(await (await h.request('/api/barrow/export.json', wren)).text());
 assert.equal(theirs.manifest.counts.locations, 0);
 // DATA-002 attribution; erasing an unused account removes its locations.
 assert.ok((await h.api('/api/barrow/audit?accountId=cedar')).events.some(event => event.action === 'location.archived' && event.source === 'location.archive'));
 await h.command('location.save', { accountId: 'wren', kind: 'contact', value: { name: 'Robin Wren', email: 'robin@example.test' } }, wren);
 await h.command('account.erase', { accountId: 'wren', confirm: 'ERASE' });
 assert.equal(JSON.stringify(JSON.parse(await (await h.request('/api/barrow/export.json')).text()).locations).includes('Robin Wren'), false);
});
