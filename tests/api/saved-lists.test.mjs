import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, archive } from './harness.mjs';

test('ORD-002: a shared store list adds to another authorized person’s cart at current prices with explicit exceptions; private and other-company lists stay hidden', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const items = [];
 for (const sku of ['OAT-1', 'RYE-1', 'SPELT-1']) items.push(await pier.command('item.save', { sku, name: `Granola ${sku}`, unit: 'case', packSize: '1' }));
 const bin = await pier.command('location.save', { name: 'Shelf A1', warehouse: 'New York', kind: 'bin' });
 const mill = await pier.command('party.save', { name: 'Mill House Foods', kind: 'supplier' });
 const cedarParty = await pier.command('party.save', { name: 'Cedar Street Pantry', kind: 'customer' });
 const wrenParty = await pier.command('party.save', { name: 'Wren & Co.', kind: 'customer' });
 const po = await pier.command('po.draft', { supplierId: mill.id, promiseDate: '2026-10-20', reason: 'Opening stock', lines: items.map(item => ({ itemId: item.id, quantity: '50', price: '20.00' })) });
 await pier.command('po.approve', { poId: po.id, version: po.version });
 await pier.command('po.commit', { poId: po.id, version: po.version });
 await pier.command('receipt.create', { poId: po.id, supplierReference: 'Delivery 1', lines: po.lines.map(line => ({ poLineId: line.id, locationId: bin.id, quantity: '50', cost: '20.00' })) });

 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const prices = [{ sku: 'OAT-1', unitCents: 6500, minQty: 6, casePack: 6 }, { sku: 'RYE-1', unitCents: 4000, minQty: 1 }, { sku: 'SPELT-1', unitCents: 3000, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { name: 'Cedar Street Pantry', email: 'buyer@example.test', pierCustomerId: cedarParty.id, termsDays: 30, minimumCents: 10000, prices } });
 await h.command('account.save', { id: 'wren', value: { name: 'Wren & Co.', email: 'wren@example.test', pierCustomerId: wrenParty.id, termsDays: 30, minimumCents: 0, prices } });
 const buyer = { as: await h.signIn('buyer@example.test') }, wren = { as: await h.signIn('wren@example.test') };
 const lists = async (accountId, opts = {}) => (await h.api(`/api/barrow/lists?accountId=${accountId}`, undefined, opts)).lists;

 // The buyer saves a shared store replenishment list and a private one; lists keep SKUs and quantities only.
 const store = await h.command('list.save', { accountId: 'cedar', name: 'Store replenishment', shared: true, lines: [{ sku: 'OAT-1', quantity: 12 }, { sku: 'RYE-1', quantity: '6' }, { sku: 'SPELT-1', quantity: 4 }] }, buyer);
 assert.deepEqual(store.lines, [{ sku: 'OAT-1', quantity: '12' }, { sku: 'RYE-1', quantity: '6' }, { sku: 'SPELT-1', quantity: '4' }]);
 assert.equal(JSON.stringify(store).includes('Cents'), false);
 const ideas = await h.command('list.save', { accountId: 'cedar', name: 'Holiday ideas', lines: [{ sku: 'RYE-1', quantity: 2 }] }, buyer);
 assert.equal(ideas.shared, false);
 assert.equal((await h.command('list.save', { accountId: 'cedar', name: 'store REPLENISHMENT', lines: [{ sku: 'RYE-1', quantity: 1 }] }, { ...buyer, status: 409 })).error.code, 'LIST_NAME');
 assert.equal((await h.command('list.save', { accountId: 'cedar', name: 'Empty', lines: [{ sku: 'RYE-1', quantity: 0 }] }, { ...buyer, status: 400 })).error.code, 'QUANTITY');

 // The supplier changes one price and Pier discontinues one SKU after the list was saved.
 const cedar = (await h.api('/api/barrow/state')).accounts.find(account => account.id === 'cedar');
 await h.command('account.save', { id: 'cedar', revision: cedar.revision, value: { ...cedar.value, prices: prices.map(price => price.sku === 'OAT-1' ? { ...price, unitCents: 7000 } : price) } });
 const spelt = items[2];
 await pier.command('item.save', { id: spelt.id, version: spelt.version, sku: 'SPELT-1', name: spelt.name, unit: 'case', packSize: '1', archived: true });

 // Another authorized person (the supplier, acting for the rep) sees the shared list but not the private one.
 assert.deepEqual((await lists('cedar')).map(list => [list.name, list.mine]), [['Store replenishment', false]]);
 assert.deepEqual((await lists('cedar', buyer)).map(list => [list.name, list.mine]), [['Holiday ideas', true], ['Store replenishment', true]]);
 const preview = payload => h.command('cart.preview', { listId: store.id, ...payload });
 const first = await preview({});
 assert.deepEqual(first.list, { id: store.id, name: 'Store replenishment', revision: store.revision });
 assert.deepEqual(first.lines.map(line => [line.sku, line.quantity, line.unitCents, line.lineCents]), [['OAT-1', '12', 7000, 84000], ['RYE-1', '6', 4000, 24000]]);
 const discontinued = first.rows.find(row => row.status === 'error');
 assert.deepEqual([discontinued.input, discontinued.message], ['SPELT-1', 'SPELT-1 is not on this account’s price list.']);
 assert.equal(first.ready, false); assert.equal(first.totalCents, 108000);
 // Nothing reaches the cart until the exception is left out explicitly; merge adds to what the pad already holds.
 assert.equal((await preview({ mode: 'merge', cart: [{ sku: 'RYE-1', quantity: 2 }] })).cart, undefined);
 const merged = await preview({ mode: 'merge', skip: [discontinued.ref], cart: [{ sku: 'RYE-1', quantity: 2 }] });
 assert.deepEqual(merged.cart, [{ sku: 'OAT-1', unit: 'case', quantity: 12 }, { sku: 'RYE-1', unit: 'case', quantity: 8 }]);
 assert.equal(merged.totalCents, 12 * 7000 + 8 * 4000);
 const draft = await h.command('order.prepare', { accountId: 'cedar', lines: merged.cart });
 assert.equal(draft.totalCents, merged.totalCents);
 // A case-pack change after saving is offered as a correction, never applied silently.
 const edited = await h.command('list.save', { listId: store.id, revision: store.revision, lines: [{ sku: 'OAT-1', quantity: 8 }, { sku: 'RYE-1', quantity: 6 }] });
 const pack = (await preview({})).lines.find(line => line.sku === 'OAT-1');
 assert.match(pack.problem, /case packs of 6/); assert.deepEqual(pack.choices, ['6', '12']);
 assert.notEqual(edited.updatedBy, edited.createdBy);
 assert.equal((await h.command('list.save', { listId: store.id, revision: store.revision, name: 'Stale' }, { status: 409 })).error.code, 'CHANGED');
 // Only the creator shares, unshares or deletes; the private list reads exactly like an unknown list.
 assert.equal((await h.command('list.delete', { listId: store.id, revision: edited.revision }, { status: 403 })).error.code, 'FORBIDDEN');
 assert.equal((await h.command('list.save', { listId: store.id, revision: edited.revision, shared: false }, { status: 403 })).error.code, 'FORBIDDEN');
 const unknown = await h.command('cart.preview', { listId: 'no-such-list' }, { status: 404 });
 assert.deepEqual(await h.command('cart.preview', { listId: ideas.id }, { status: 404 }), unknown);
 const sharedIdeas = await h.command('list.save', { listId: ideas.id, revision: ideas.revision, shared: true }, buyer);
 assert.equal((await h.command('cart.preview', { listId: ideas.id })).lines[0].sku, 'RYE-1');

 // Duplicate makes a private copy for its maker; it can go to another account the person may act for.
 const copy = await h.command('list.duplicate', { listId: store.id }, buyer);
 assert.deepEqual([copy.name, copy.shared, copy.duplicatedFrom, copy.lines], ['Store replenishment (copy)', false, store.id, edited.lines]);
 const wrenCopy = await h.command('list.duplicate', { listId: store.id, accountId: 'wren', name: 'Wren opening order' });
 assert.equal(wrenCopy.accountId, 'wren');

 // An agent reads shared lists and previews them but never saves one.
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 assert.deepEqual((await lists('cedar', agent)).map(list => list.name).sort(), ['Holiday ideas', 'Store replenishment']);
 assert.equal((await h.command('cart.preview', { listId: sharedIdeas.id }, agent)).ready, true);
 assert.equal((await h.command('list.save', { accountId: 'cedar', name: 'Agent list', lines: [{ sku: 'RYE-1', quantity: 1 }] }, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');

 // Another company's buyer cannot see, preview or copy Cedar's lists, shared or not.
 assert.equal((await h.api('/api/barrow/lists?accountId=cedar', undefined, { ...wren, status: 404 })).error.code, 'NOT_FOUND');
 assert.deepEqual(await h.command('cart.preview', { listId: store.id }, { ...wren, status: 404 }), unknown);
 assert.deepEqual(await h.command('list.duplicate', { listId: store.id, accountId: 'wren' }, { ...wren, status: 404 }), unknown);
 assert.deepEqual((await lists('wren', wren)), []);

 // Lists travel in the owner archive and leave with an erased unused account.
 assert.ok(JSON.stringify(await archive(h)).includes('Store replenishment'));
 await h.command('account.erase', { accountId: 'wren', confirm: 'ERASE' });
 assert.equal((await h.db.prepare("SELECT count(*) AS n FROM bw_lists WHERE account_id='wren'").first()).n, 0);
 assert.equal((await lists('cedar')).length, 2);
});
