import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { installation, archive, restore } from './harness.mjs';

const easternDay = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 86400000));

// Real pinned Pier with stock for two SKUs; Cedar has a PRI-002 volume break and account discount on OAT-1.
async function quoting(t, bindings={}) {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const items = [];
 for (const sku of ['OAT-1', 'RYE-1']) items.push(await pier.command('item.save', { sku, name: `Granola ${sku}`, unit: 'case', packSize: '1' }));
 const bin = await pier.command('location.save', { name: 'Shelf A1', warehouse: 'New York', kind: 'bin' });
 const mill = await pier.command('party.save', { name: 'Mill House Foods', kind: 'supplier' });
 const cedarParty = await pier.command('party.save', { name: 'Cedar Street Pantry', kind: 'customer' });
 const wrenParty = await pier.command('party.save', { name: 'Wren & Co.', kind: 'customer' });
 const po = await pier.command('po.draft', { supplierId: mill.id, promiseDate: '2026-10-20', reason: 'Opening stock', lines: items.map(item => ({ itemId: item.id, quantity: '60', price: '20.00' })) });
 await pier.command('po.approve', { poId: po.id, version: po.version });
 await pier.command('po.commit', { poId: po.id, version: po.version });
 await pier.command('receipt.create', { poId: po.id, supplierReference: 'Delivery 1', lines: po.lines.map(line => ({ poLineId: line.id, locationId: bin.id, quantity: '60', cost: '20.00' })) });

 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie, ...bindings } }); t.after(() => h.close());
 // PRI-002 basis: a volume break at 10 cases and a 5% account discount, effective across the test.
 const rule = { effectiveFrom: '2026-01-01', effectiveTo: '2030-12-31', mode: 'volume', breaks: [{ fromQuantity: '10', unitCents: 6000 }], accountDiscountBps: 500 };
 const prices = [{ sku: 'OAT-1', unitCents: 6500, minQty: 1, pricing: rule }, { sku: 'RYE-1', unitCents: 4000, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { name: 'Cedar Street Pantry', email: 'buyer@example.test', pierCustomerId: cedarParty.id, termsDays: 30, minimumCents: 10000, prices } });
 await h.command('account.save', { id: 'wren', value: { name: 'Wren & Co.', email: 'wren@example.test', pierCustomerId: wrenParty.id, termsDays: 30, minimumCents: 0, prices } });
 const buyer = { as: await h.signIn('buyer@example.test') }, wren = { as: await h.signIn('wren@example.test') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const quoteOf = (id, opts = {}) => h.api(`/api/barrow/quotes/${id}`, undefined, opts);
 return { pier, bin, h, rule, prices, buyer, wren, agent, quoteOf };
}

test('ORD-004: a buyer requests a quote, a discount is approved, double acceptance through the buyer and API doors yields one order at the accepted revision, and stale, revised or expired quotes are refused', async t => {
 const { h, rule, prices, buyer, wren, agent, quoteOf } = await quoting(t);

 // The buyer requests a quote from a cart; the request carries PRI-002's explanation and exact cents, and reserves nothing.
 const requested = await h.command('quote.request', { accountId: 'cedar', note: 'Holiday floor set', lines: [{ sku: 'OAT-1', quantity: 12 }, { sku: 'RYE-1', quantity: 5 }] }, buyer);
 assert.equal(requested.id, 'Q-10001'); assert.equal(requested.status, 'requested');
 assert.deepEqual(requested.request.map(line => [line.sku, line.unitCents, line.lineCents]), [['OAT-1', 6000, 68400], ['RYE-1', 4000, 20000]]);
 assert.match(requested.request[0].pricing.reason, /Volume break at 10 selling units · Account discount 500 bps/);
 assert.equal((await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'RYE-1', quantity: 1 }] }, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 assert.equal((await h.api('/api/barrow/quotes', undefined, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 assert.equal((await h.command('quote.propose', { quoteId: 'Q-10001', revision: requested.revision, validUntil: easternDay(5), lines: [{ sku: 'RYE-1', quantity: 5 }] }, { ...buyer, status: 403 })).error.code, 'FORBIDDEN');

 // The supplier, acting for the rep, proposes a negotiated price, a discount, quantities, terms, shipping and validity.
 const validUntil = easternDay(10);
 assert.equal((await h.command('quote.propose', { quoteId: 'Q-10001', revision: requested.revision, validUntil: easternDay(-1), lines: [{ sku: 'RYE-1', quantity: 5 }] }, { status: 400 })).error.code, 'INPUT');
 const r1 = await h.command('quote.propose', { quoteId: 'Q-10001', revision: requested.revision, validUntil, termsDays: 45, shipping: 'Freight prepaid by supplier', lines: [{ sku: 'OAT-1', quantity: 12, unitCents: 5333 }, { sku: 'RYE-1', quantity: 6, discountBps: 333 }] });
 const [oat, rye] = r1.revisions[0].lines;
 assert.deepEqual([oat.basisLineCents, oat.negotiatedUnitCents, oat.lineCents], [68400, 5333, 63996]);
 // 24000 × 0.9667 = 23200.8 rounds half up once to 23201.
 assert.deepEqual([rye.basisLineCents, rye.discountBps, rye.lineCents], [24000, 333, 23201]);
 assert.deepEqual([r1.status, r1.revisions[0].basisCents, r1.revisions[0].totalCents, r1.revisions[0].termsDays], ['awaiting-approval', 92400, 87197, 45]);
 assert.equal((await h.command('quote.accept', { quoteId: 'Q-10001', number: 1 }, { ...buyer, status: 409 })).error.code, 'QUOTE_APPROVAL');
 assert.equal((await h.command('quote.propose', { quoteId: 'Q-10001', revision: requested.revision, validUntil, lines: [{ sku: 'RYE-1', quantity: 5 }] }, { status: 409 })).error.code, 'CHANGED');

 // A recorded owner/admin approval releases the discount; it is searchable and exportable staff audit, private from buyers and agents.
 const approved = await h.command('quote.approve', { quoteId: 'Q-10001', revision: r1.revision, number: 1, reason: 'Opening order for a new flagship store' });
 assert.equal(approved.status, 'proposed'); assert.equal(approved.revisions[0].approval.reason, 'Opening order for a new flagship store');
 const { events } = await h.api('/api/barrow/audit?accountId=cedar');
 const decision = events.find(event => event.action === 'quote.discount-approved');
 assert.deepEqual([decision.subjectId, decision.actorKind, decision.source, decision.accountId], ['Q-10001', 'human', 'quote.approve', 'cedar']);
 assert.match(decision.revision, /^Q-10001:r1:/); assert.match(decision.reason, /5203 USD cent discount .* revision 1: Opening order for a new flagship store/);
 assert.ok(events.some(event => event.action === 'quote.requested' && event.source === 'quote.request'));
 assert.match(await (await h.request('/api/barrow/audit.csv?accountId=cedar')).text(), /quote\.discount-approved.*Opening order for a new flagship store/);
 assert.equal((await h.request('/api/barrow/audit?accountId=cedar', buyer)).status, 403);
 assert.equal((await h.request('/api/barrow/audit?accountId=cedar', agent)).status, 403);
 assert.equal(JSON.stringify(await quoteOf('Q-10001', buyer)).includes('flagship'), false);

 // A revision invalidates acceptance of the earlier one; the revised discount needs its own approval.
 const r2 = await h.command('quote.propose', { quoteId: 'Q-10001', revision: approved.revision, validUntil, termsDays: 45, shipping: 'Freight prepaid by supplier', lines: [{ sku: 'OAT-1', quantity: 12, unitCents: 5400 }, { sku: 'RYE-1', quantity: 6, discountBps: 333 }] });
 assert.equal((await h.command('quote.accept', { quoteId: 'Q-10001', number: 1 }, { ...buyer, status: 409 })).error.code, 'QUOTE_REVISED');
 const ready = await h.command('quote.approve', { quoteId: 'Q-10001', revision: r2.revision, number: 2, reason: 'Revised after buyer call' });
 assert.equal((await h.command('quote.accept', { quoteId: 'Q-10001', number: 2 }, { status: 403 })).error.code, 'BUYER_REQUIRED');
 assert.equal((await h.command('quote.accept', { quoteId: 'Q-10001', number: 2 }, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 assert.equal((await h.command('quote.accept', { quoteId: 'Q-10001', number: 2 }, { ...wren, status: 404 })).error.code, 'NOT_FOUND');

 // Accept twice at once (the page and a direct API call) and once more later: exactly one linked order.
 const [page, direct] = await Promise.all([h.command('quote.accept', { quoteId: 'Q-10001', number: 2 }, buyer), h.command('quote.accept', { quoteId: 'Q-10001', number: 2 }, buyer)]);
 const again = await h.command('quote.accept', { quoteId: 'Q-10001', number: 2 }, buyer);
 assert.equal(page.order.id, direct.order.id); assert.equal(again.order.id, page.order.id);
 const state = await h.api('/api/barrow/state');
 const linked = state.orders.filter(order => order.quote?.id === 'Q-10001');
 assert.equal(linked.length, 1);
 const [order] = linked, total = ready.revisions[1].totalCents;
 assert.deepEqual([order.status, order.quote.revision, order.quote.shipping, order.termsDays, order.totalCents, order.currency], ['submitted', 2, 'Freight prepaid by supplier', 45, total, 'USD']);
 assert.equal(total, 12 * 5400 + 23201);
 assert.deepEqual(order.lines.map(line => [line.sku, line.lineCents, line.quote.basisLineCents, line.quote.revision]), [['OAT-1', 64800, 68400, 2], ['RYE-1', 23201, 24000, 2]]);
 assert.match(order.lines[0].pricing.reason, /Volume break at 10 selling units/);
 assert.equal((await quoteOf('Q-10001', buyer)).accepted.orderId, order.id);
 // ORD-014: quote conversion records the submitted commercial confirmation once.
 const confirmations=(await h.api(`/api/barrow/orders/${order.id}/confirmations`,undefined,buyer)).confirmations;
 assert.equal(confirmations.length,1);assert.deepEqual(confirmations[0].snapshot.lines,order.lines);
 assert.equal((await h.command('quote.accept', { quoteId: 'Q-10001', number: 1 }, { ...buyer, status: 409 })).error.code, 'QUOTE_ACCEPTED');
 assert.equal((await h.command('quote.propose', { quoteId: 'Q-10001', revision: (await quoteOf('Q-10001')).revision, validUntil, lines: [{ sku: 'RYE-1', quantity: 5 }] }, { status: 409 })).error.code, 'QUOTE_ACCEPTED');

 // The converted order still needs supplier approval; Pier reserves it and the invoice keeps the quoted prices and terms.
 const reserved = await h.command('order.approve', { orderId: order.id });
 assert.equal(reserved.status, 'approved');
 const due = new Date(reserved.invoice.issuedAt + 'T00:00:00Z'); due.setUTCDate(due.getUTCDate() + 45);
 assert.equal(reserved.invoice.dueAt, due.toISOString().slice(0, 10));
 assert.match(await (await h.request(`/api/barrow/invoices/${order.id}.csv`, buyer)).text(), new RegExp(`"OAT-1".*"64800","${total}"`));

 // Current stock is checked at acceptance: a quote for more than Pier can promise is refused.
 const big = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'RYE-1', quantity: 55 }] }, buyer);
 const bigProposal = await h.command('quote.propose', { quoteId: big.id, revision: big.revision, validUntil, lines: [{ sku: 'RYE-1', quantity: 55 }] });
 assert.equal(bigProposal.status, 'proposed');
 assert.equal((await h.command('quote.accept', { quoteId: big.id, number: 1 }, { ...buyer, status: 409 })).error.code, 'STOCK');

 // A changed pricing rule makes the quote's basis stale; a revision at today's rule can be accepted until it expires.
 const second = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 10 }] }, buyer);
 const offered = await h.command('quote.propose', { quoteId: second.id, revision: second.revision, validUntil: easternDay(0), lines: [{ sku: 'OAT-1', quantity: 10 }] });
 assert.deepEqual([offered.status, offered.revisions[0].totalCents], ['proposed', 57000]);
 const cedar = state.accounts.find(account => account.id === 'cedar');
 await h.command('account.save', { id: 'cedar', revision: cedar.revision, value: { ...cedar.value, prices: [{ ...prices[0], pricing: { ...rule, accountDiscountBps: 700 } }, prices[1]] } });
 assert.equal((await h.command('quote.accept', { quoteId: second.id, number: 1 }, { ...buyer, status: 409 })).error.code, 'QUOTE_STALE');
 const current = await h.command('quote.propose', { quoteId: second.id, revision: offered.revision, validUntil: easternDay(0), lines: [{ sku: 'OAT-1', quantity: 10 }] });
 assert.equal(current.revisions[1].totalCents, 55800);
 // Accepted snapshots never follow the rule change.
 assert.equal((await quoteOf('Q-10001')).revisions[1].totalCents, total);
 assert.equal((await h.api('/api/barrow/state')).orders.find(row => row.id === order.id).totalCents, total);
 // Test data standing in for the clock: valid through yesterday (Eastern), so today is past the inclusive date.
 await h.db.prepare("UPDATE bw_quotes SET value_json=json_set(value_json,'$.revisions[1].validUntil',?) WHERE id=?").bind(easternDay(-1), second.id).run();
 assert.equal((await quoteOf(second.id, buyer)).expired, true);
 assert.equal((await h.command('quote.accept', { quoteId: second.id, number: 2 }, { ...buyer, status: 409 })).error.code, 'QUOTE_EXPIRED');

 // Another company's buyer sees none of Cedar's quotes; a company with a quote is not an unused account.
 assert.equal((await quoteOf('Q-10001', { ...wren, status: 404 })).error.code, 'NOT_FOUND');
 assert.equal((await h.api('/api/barrow/quotes?accountId=cedar', undefined, { ...wren, status: 404 })).error.code, 'NOT_FOUND');
 await h.command('quote.request', { accountId: 'wren', lines: [{ sku: 'RYE-1', quantity: 2 }] }, wren);
 assert.deepEqual((await h.api('/api/barrow/quotes', undefined, wren)).quotes.map(quote => quote.accountId), ['wren']);
 assert.equal((await h.command('account.erase', { accountId: 'wren', confirm: 'ERASE' }, { status: 409 })).error.code, 'QUOTES_EXIST');

 // DATA-001: quotes and every revision's lines export with stable IDs, currency, revision and reconciled totals.
 const all = JSON.parse(await (await h.request('/api/barrow/export.json')).text());
 assert.equal(all.manifest.counts.quotes, 4); assert.equal(all.manifest.counts.quotelines, 2 + 2 + 1 + 1 + 1);
 const usd = all.manifest.totals.find(row => row.currency === 'USD');
 assert.equal(usd.quotes, 4); assert.equal(usd.quoteCents, all.quotes.reduce((sum, quote) => sum + quote.totalCents, 0));
 const exported = all.quotes.find(quote => quote.id === 'Q-10001');
 assert.deepEqual([exported.status, exported.latestRevision, exported.acceptedRevision, exported.orderId, exported.currency, exported.totalCents], ['accepted', 2, 2, order.id, 'USD', total]);
 assert.equal(all.quotelines.filter(line => line.quoteId === 'Q-10001' && line.quoteRevision === 2).reduce((sum, line) => sum + line.lineCents, 0), total);
 assert.equal(all.orders.find(row => row.id === order.id).quote, 'Q-10001 r2');
 assert.match(await (await h.request('/api/barrow/export/quotelines.csv')).text(), /^"?quoteId"?,"?quoteRevision"?/);
 const mine = JSON.parse(await (await h.request('/api/barrow/export.json', buyer)).text());
 assert.deepEqual([...new Set(mine.quotes.map(quote => quote.accountId))], ['cedar']);
 assert.ok(mine.quotelines.every(line => line.discountApprovedBy === ''));
 assert.equal((await h.request('/api/barrow/export.json', agent)).status, 403);
 assert.ok(JSON.stringify(await archive(h)).includes('Freight prepaid by supplier'));
});

test('ORD-005: buyer messages and staff-only internal notes with attachments, revisions that name who changed which terms, participant notices, and acceptance bound to one version', async t => {
 const { h, rule, prices, buyer, wren, agent, quoteOf } = await quoting(t);
 const rep = { as: await h.signIn('rep@example.test', 'admin') };
 const kinds = async (opts = {}) => (await quoteOf('Q-10001', opts)).notices.map(notice => notice.kind);
 const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'), png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
 const validUntil = easternDay(10);

 // The buyer's request notifies the supplier staff acting for the rep (owner and admin), never the buyer.
 await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 12 }, { sku: 'RYE-1', quantity: 5 }] }, buyer);
 assert.deepEqual(await kinds(), ['requested']); assert.deepEqual(await kinds(rep), ['requested']); assert.deepEqual(await kinds(buyer), []);

 // Revision 1 (owner): a negotiated OAT-1 price against the PRI-002 basis, explained, exact and awaiting approval.
 const r1 = await h.command('quote.propose', { quoteId: 'Q-10001', revision: (await quoteOf('Q-10001')).revision, validUntil, lines: [{ sku: 'OAT-1', quantity: 12, unitCents: 5400 }, { sku: 'RYE-1', quantity: 5 }] });
 const first = r1.revisions[0];
 assert.deepEqual([first.proposedByEmail, first.basisCents, first.totalCents, first.termsDays], ['owner@example.test', 88400, 84800, 30]);
 assert.match(first.lines[0].pricing.reason, /Volume break at 10 selling units · Account discount 500 bps/);
 assert.deepEqual(first.changes, ['OAT-1 (case) $684.00 → $648.00 ($54.00 each)']);
 assert.deepEqual(await kinds(buyer), [], 'a revision awaiting discount approval is not offered to the buyer');
 assert.deepEqual(await kinds(rep), ['requested', 'revision']);
 const approved = await h.command('quote.approve', { quoteId: 'Q-10001', revision: r1.revision, number: 1, reason: 'Opening order' });

 // The buyer opens revision 1 and is notified it is ready; they write with a PDF, which notifies every staff member.
 const open = await quoteOf('Q-10001', buyer);
 assert.deepEqual(open.notices.map(notice => notice.summary), [`Revision 1 of Q-10001 from owner@example.test is ready: $848.00, net 30 days, valid through ${validUntil} (Eastern time).`]);
 const asked = await h.command('quote.message', { quoteId: 'Q-10001', body: 'Could you do net 60 if we take 14 cases?', attachment: { name: 'floor plan.pdf', contentBase64: pdf.toString('base64') } }, buyer);
 assert.deepEqual([asked.kind, asked.side, asked.authorEmail, asked.quoteRevision, asked.attachment.name, asked.attachment.sha256], ['message', 'buyer', 'buyer@example.test', 1, 'floor-plan.pdf', createHash('sha256').update(pdf).digest('hex')]);
 assert.equal((await h.command('quote.message', { quoteId: 'Q-10001', body: 'Note to self', internal: true }, { ...buyer, status: 403 })).error.code, 'FORBIDDEN');
 assert.equal((await h.command('quote.message', { quoteId: 'Q-10001', body: 'Agent note' }, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 assert.equal((await h.command('quote.message', { quoteId: 'Q-10001', body: 'Wrong company' }, { ...wren, status: 404 })).error.code, 'NOT_FOUND');
 assert.equal((await h.command('quote.message', { quoteId: 'Q-10001', body: 'Script', attachment: { name: 'x.html', contentBase64: Buffer.from('<html>').toString('base64') } }, { ...buyer, status: 400 })).error.code, 'DOCUMENT');
 assert.deepEqual(await kinds(), ['requested', 'message']); assert.deepEqual(await kinds(rep), ['requested', 'revision', 'message']);

 // The owner's internal margin note (with a PNG) reaches the other staff only; the owner replies to the buyer.
 const note = await h.command('quote.message', { quoteId: 'Q-10001', body: 'Margin 31% at $54.00; floor is $52.00', internal: true, attachment: { name: 'margin.png', contentBase64: png.toString('base64') } });
 await h.command('quote.message', { quoteId: 'Q-10001', body: 'Net 60 works at 14 cases; revision 2 follows.' });
 assert.deepEqual(await kinds(rep), ['requested', 'revision', 'message', 'internal']);
 assert.deepEqual(await kinds(buyer), ['revision', 'message']);
 // Reading the quote clears the notices for everyone on the same side.
 assert.deepEqual((await h.command('quote.read', { quoteId: 'Q-10001' }, rep)).notices, []);
 assert.deepEqual(await kinds(), []);
 // Messages and notes never change the quote's version: the token from the approval still proposes.
 assert.equal((await quoteOf('Q-10001')).revision, approved.revision);

 // Revision 2 (the admin acting as rep) while the buyer still has revision 1 open, at today's changed PRI-002 rule.
 const cedar = (await h.api('/api/barrow/state')).accounts.find(account => account.id === 'cedar');
 await h.command('account.save', { id: 'cedar', revision: cedar.revision, value: { ...cedar.value, prices: [{ ...prices[0], pricing: { ...rule, accountDiscountBps: 700 } }, prices[1]] } });
 const r2 = await h.command('quote.propose', { quoteId: 'Q-10001', revision: approved.revision, validUntil, termsDays: 60, shipping: 'Freight prepaid', lines: [{ sku: 'OAT-1', quantity: 14, unitCents: 5300 }, { sku: 'RYE-1', quantity: 5 }] }, rep);
 const second = r2.revisions[1];
 assert.deepEqual([second.proposedByEmail, second.basisCents, second.totalCents], ['rep@example.test', 14 * 5580 + 20000, 14 * 5300 + 20000]);
 assert.match(second.lines[0].pricing.reason, /Account discount 700 bps/);
 assert.deepEqual(second.changes, ['OAT-1 (case) quantity 12 → 14', 'OAT-1 (case) $648.00 → $742.00 ($53.00 each)', 'Payment terms net 30 → net 60 days', 'Shipping note “” → “Freight prepaid”']);
 // Revision 1's frozen PRI-002 snapshot is unchanged.
 assert.deepEqual([r2.revisions[0].basisCents, r2.revisions[0].lines[0].basisLineCents], [88400, 68400]);
 // Approval binds to the latest version and the current quote token; acceptance binds to one revision.
 assert.equal((await h.command('quote.approve', { quoteId: 'Q-10001', revision: r2.revision, number: 1, reason: 'Old one' }, { status: 409 })).error.code, 'QUOTE_APPROVAL');
 assert.equal((await h.command('quote.approve', { quoteId: 'Q-10001', revision: approved.revision, number: 2, reason: 'Stale token' }, { status: 409 })).error.code, 'CHANGED');
 assert.equal((await h.command('quote.accept', { quoteId: 'Q-10001', number: open.revisions.at(-1).number }, { ...buyer, status: 409 })).error.code, 'QUOTE_REVISED');
 await h.command('quote.approve', { quoteId: 'Q-10001', revision: r2.revision, number: 2, reason: 'Fourteen cases at net 60' });
 assert.equal((await h.command('quote.accept', { quoteId: 'Q-10001', number: 1 }, { ...buyer, status: 409 })).error.code, 'QUOTE_REVISED');

 // The buyer sees both revisions, both messages and the notices, never the internal note or its attachment.
 const seen = await quoteOf('Q-10001', buyer);
 assert.deepEqual(seen.notices.map(notice => notice.kind), ['revision', 'message', 'revision']);
 assert.deepEqual(seen.thread.map(entry => [entry.side, entry.kind]), [['buyer', 'message'], ['supplier', 'message']]);
 assert.equal(JSON.stringify(seen).includes('Margin'), false);
 assert.deepEqual((await quoteOf('Q-10001')).thread.map(entry => entry.kind), ['message', 'internal', 'message']);
 assert.deepEqual((await h.api('/api/barrow/quotes', undefined, buyer)).quotes[0].thread.length, 2);
 assert.deepEqual(Buffer.from(await (await h.request(asked.attachment.path, buyer)).arrayBuffer()), pdf);
 assert.deepEqual(Buffer.from(await (await h.request(note.attachment.path)).arrayBuffer()), png);
 assert.equal((await h.request(note.attachment.path, buyer)).status, 404);
 assert.equal((await h.request(asked.attachment.path, wren)).status, 404);
 assert.equal((await h.request(asked.attachment.path, agent)).status, 403);
 assert.equal((await quoteOf('Q-10001', { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');

 // Accepting revision 2 converts it once, with its terms and frozen basis, and notifies the staff.
 const { order } = await h.command('quote.accept', { quoteId: 'Q-10001', number: 2 }, buyer);
 assert.deepEqual([order.quote.revision, order.termsDays, order.totalCents, order.lines[0].quote.basisLineCents], [2, 60, 94200, 78120]);
 assert.deepEqual(await kinds(rep), ['accepted']);
 await h.command('quote.read', { quoteId: 'Q-10001' }, buyer);
 assert.deepEqual(await kinds(buyer), []);

 // Inherited DATA-002: revision 2's discount approval is attributed staff audit, private from the buyer.
 const { events } = await h.api('/api/barrow/audit?accountId=cedar');
 const decision = events.find(event => event.action === 'quote.discount-approved' && /^Q-10001:r2:/.test(event.revision));
 assert.deepEqual([decision.actorKind, decision.source], ['human', 'quote.approve']); assert.match(decision.reason, /Fourteen cases at net 60/);
 assert.equal((await h.request('/api/barrow/audit?accountId=cedar', buyer)).status, 403);

 // DATA-001: every entry exports with its attachment reference; the buyer's export holds no internal note.
 const all = JSON.parse(await (await h.request('/api/barrow/export.json')).text());
 assert.equal(all.manifest.counts.quotemessages, 3);
 assert.deepEqual(all.quotemessages.map(row => row.visibility), ['buyer-visible', 'internal', 'buyer-visible']);
 assert.equal(all.quotemessages[0].attachmentSha256, asked.attachment.sha256); assert.equal(all.quotemessages[0].attachmentPath, asked.attachment.path);
 const mine = await (await h.request('/api/barrow/export.json', buyer)).text();
 assert.equal(JSON.parse(mine).manifest.counts.quotemessages, 2); assert.equal(mine.includes('Margin'), false);
 const csv = await (await h.request('/api/barrow/export/quotemessages.csv', buyer)).text();
 assert.match(csv, /^"?id"?,"?quoteId"?/); assert.match(csv, /net 60 if we take 14 cases/); assert.equal(csv.includes('Margin'), false);
 assert.ok(JSON.stringify(await archive(h)).includes('Margin 31% at $54.00'));
});

test('RPT-002: quote response and acceptance, accepted value net of returns, abandoned carts and reorder rates by rep, cohort and product, with every denominator explained', async t => {
 const { pier, bin, h, buyer, wren, agent } = await quoting(t);
 const state = await h.api('/api/barrow/state'), cedar = state.accounts.find(account => account.id === 'cedar');
 await h.command('account.save', { id: 'cedar', revision: cedar.revision, value: { ...cedar.value, assignedRep: 'rep-avery' } });
 const validUntil = easternDay(10), quoteOf = id => h.api(`/api/barrow/quotes/${id}`);

 // Accepted after a revision: two discounted revisions, each approved; revision 2 converts into one order.
 const q1 = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 12 }] }, buyer);
 let current = await h.command('quote.propose', { quoteId: q1.id, revision: q1.revision, validUntil, lines: [{ sku: 'OAT-1', quantity: 12, unitCents: 5400 }] });
 current = await h.command('quote.approve', { quoteId: q1.id, revision: current.revision, number: 1, reason: 'First offer' });
 current = await h.command('quote.propose', { quoteId: q1.id, revision: current.revision, validUntil, lines: [{ sku: 'OAT-1', quantity: 12, unitCents: 5500 }] });
 await h.command('quote.approve', { quoteId: q1.id, revision: current.revision, number: 2, reason: 'Final offer' });
 const { order } = await h.command('quote.accept', { quoteId: q1.id, number: 2 }, buyer);
 // Accepting again is the same order: it counts once.
 await h.command('quote.accept', { quoteId: q1.id, number: 2 }, buyer);
 const approved = await h.command('order.approve', { orderId: order.id });
 const upstream = (await pier.api('/api/pier/state')).orders.find(row => row.id === approved.pierOrderId);
 const shipment = await pier.command('dispatch.create', { orderId: upstream.id, shipmentReference: 'SHIP-Q1', lines: [{ orderLineId: upstream.lines[0].id, quantity: '12' }] });
 await pier.command('return.create', { shipmentId: shipment.id, shipmentLineId: shipment.lines[0].id, locationId: bin.id, quantity: '2', reason: 'Crushed cases' });

 // Expired: offered at current prices, then past its inclusive valid-through date. Open: never answered.
 const q2 = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'RYE-1', quantity: 3 }] }, buyer);
 await h.command('quote.propose', { quoteId: q2.id, revision: q2.revision, validUntil: easternDay(0), lines: [{ sku: 'RYE-1', quantity: 3 }] });
 // Test data standing in for the clock: valid through yesterday (Eastern).
 await h.db.prepare("UPDATE bw_quotes SET value_json=json_set(value_json,'$.revisions[0].validUntil',?) WHERE id=?").bind(easternDay(-1), q2.id).run();
 await h.command('quote.request', { accountId: 'wren', lines: [{ sku: 'RYE-1', quantity: 2 }] }, wren);

 // Cedar places an order and reorders it (ORD-003); Wren leaves one stale and one fresh draft.
 const placed = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-RYE', lines: [{ sku: 'RYE-1', quantity: 4 }] }, buyer);
 await h.command('order.submit', { orderId: placed.id }, buyer);
 const selections = [{ sku: 'RYE-1' }], review = await h.command('order.reorder-preview', { orderId: placed.id, selections }, buyer);
 const again = await h.command('order.reorder', { orderId: placed.id, selections, fingerprint: review.fingerprint, acknowledged: true, reference: 'PO-RYE-2' }, buyer);
 await h.command('order.submit', { orderId: again.id }, buyer);
 const stale = await h.command('order.prepare', { accountId: 'wren', reference: 'W-1', lines: [{ sku: 'RYE-1', quantity: 1 }] }, wren);
 await h.command('order.prepare', { accountId: 'wren', reference: 'W-2', lines: [{ sku: 'RYE-1', quantity: 1 }] }, wren);
 // Test data standing in for the clock: the stale draft was prepared ten days ago.
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.preparedAt',?) WHERE id=?").bind(new Date(Date.now() - 10 * 86400000).toISOString(), stale.id).run();

 const report = await h.api('/api/barrow/reports/quotes');
 const { totals } = report;
 assert.deepEqual(totals.quotes, { requested: 3, responded: 2, offered: 2, accepted: 1, revised: 1, expired: 1, open: 1 });
 assert.deepEqual(totals.responseRate, { numerator: 2, denominator: 3, bps: 6667 });
 assert.deepEqual(totals.acceptanceRate, { numerator: 1, denominator: 2, bps: 5000 });
 // Accepted value is the one converted order; the quote discount and Pier's returned 2 of 12 cases are visible.
 assert.deepEqual([totals.acceptedOrders, totals.acceptedCents, totals.quoteDiscountCents, totals.returnedCents, totals.netAcceptedCents], [1, 66000, 68400 - 66000, 11000, 55000]);
 assert.equal((await quoteOf(q1.id)).accepted.orderId, order.id);
 assert.deepEqual(totals.carts, { drafts: 2, abandoned: 1, placed: 3, abandonmentRate: { numerator: 1, denominator: 4, bps: 2500 } });
 assert.deepEqual(totals.reorderRate, { numerator: 1, denominator: 3, bps: 3333 });
 // By rep (ACC-004 label), cohort (month of the first placed order) and product (that SKU's lines only).
 assert.deepEqual(report.byRep.map(row => [row.name, row.quotes.requested, row.quotes.accepted, row.carts.placed, row.carts.abandoned, row.reorderRate.bps]), [['Unassigned', 1, 0, 0, 1, null], ['rep-avery', 2, 1, 3, 0, 3333]]);
 assert.deepEqual(report.byCohort.map(row => [row.name, row.quotes.requested]), [[easternDay(0).slice(0, 7), 2], ['No placed order', 1]]);
 const [oat, rye] = report.byProduct;
 assert.deepEqual([oat.name, oat.quotes.requested, oat.acceptedCents, oat.returnedCents, oat.carts.placed], ['OAT-1', 1, 66000, 11000, 1]);
 assert.deepEqual([rye.name, rye.quotes.requested, rye.quotes.expired, rye.acceptedCents, rye.carts.placed, rye.reorderRate.numerator, rye.carts.abandonmentRate.denominator], ['RYE-1', 2, 1, 0, 2, 1, 3]);
 // Every rate explains its denominator; capabilities that do not exist yet are named, not reported as zero.
 for (const key of ['period', 'responseRate', 'acceptanceRate', 'acceptedCents', 'returnedCents', 'abandonmentRate', 'reorderRate', 'cohort', 'rep', 'product']) assert.ok(report.definitions[key].length > 20, key);
 assert.match(report.definitions.acceptanceRate, /never revenue/);
 assert.deepEqual(report.notRecorded.map(item => item.note.match(/(PRI|CAT)-\d{3}/)[0]), ['PRI-005', 'CAT-003', 'CAT-011']);
 assert.equal(report.timeZone, 'America/New_York');
 // Periods are inclusive reporting-zone days; an empty or inverted period is explicit.
 assert.equal((await h.api('/api/barrow/reports/quotes?from=2000-01-01&to=2000-01-31')).totals.quotes.requested, 0);
 assert.equal((await h.api('/api/barrow/reports/quotes?from=2026-02-01&to=2026-01-01', undefined, { status: 400 })).error.code, 'INPUT');
 // Sales-manager figures: buyers and agents are refused.
 assert.equal((await h.api('/api/barrow/reports/quotes', undefined, { ...buyer, status: 403 })).error.code, 'FORBIDDEN');
 assert.equal((await h.api('/api/barrow/reports/quotes', undefined, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 // With Pier gone, returns are unknown rather than zero.
 await pier.close();
 const blind = await h.api('/api/barrow/reports/quotes');
 assert.deepEqual([blind.returnsSource, blind.totals.returnedCents, blind.totals.netAcceptedCents, blind.totals.acceptedCents], ['unavailable', null, null, 66000]);
});

test('AUTO-003: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing',async t=>{
 const key=randomBytes(32),{h,buyer,wren,agent,quoteOf}=await quoting(t,{MAIL_WEBHOOK_SECRET:'whsec_'+key.toString('base64')});
 const admin={as:await h.signIn('rep@example.test','admin')};
 const quote=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'RYE-1',quantity:5}]},buyer);
 const quoteMail=()=>h.mail.deliveries.filter(row=>row.message.subject===`Barrow quote ${quote.id}`);
 assert.deepEqual(quoteMail().map(row=>row.message.to[0]).sort(),['owner@example.test','rep@example.test']);
 const ready=await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,validUntil:easternDay(0),lines:[{sku:'RYE-1',quantity:5}]});
 const sent=quoteMail().find(row=>row.message.to.includes('buyer@example.test'));
 assert.deepEqual(quoteMail().filter(row=>row.message.text.includes('expires after today')).map(row=>row.message.to[0]).sort(),['buyer@example.test','owner@example.test','rep@example.test']);
 assert.ok(sent);assert.match(sent.message.text,new RegExp(`/app\\?quote=${quote.id}`));
 assert.equal((await h.request(`/api/barrow/quotes/${quote.id}`,buyer)).status,200);
 assert.equal((await h.request(`/api/barrow/quotes/${quote.id}`,wren)).status,404);
 assert.equal((await h.request(`/api/barrow/quotes/${quote.id}`,{as:''})).status,401);
 const before=quoteMail().length;
 await h.command('quote.message',{quoteId:quote.id,body:'Staff-only delivery concern',internal:true});
 assert.equal(quoteMail().length,before+1);assert.deepEqual(quoteMail().at(-1).message.to,['rep@example.test']);
 assert.ok(!(await quoteOf(quote.id,buyer)).thread.some(row=>row.kind==='internal'));
 assert.ok((await quoteOf(quote.id,admin)).thread.some(row=>row.kind==='internal'&&row.body==='Staff-only delivery concern'));
 const buyerCount=quoteMail().filter(row=>row.message.to.includes('buyer@example.test')).length;
 await h.command('quote.message',{quoteId:quote.id,body:'Buyer-visible delivery update'});
 assert.equal(quoteMail().filter(row=>row.message.to.includes('buyer@example.test')).length,buyerCount+1);
 const count=quoteMail().length;
 await h.command('quote-mail.dispatch',{});await h.command('quote-mail.dispatch',{});
 assert.equal(quoteMail().length,count);
 await h.command('quote-mail.dispatch',{}, {...buyer,status:403});await h.command('quote-mail.dispatch',{}, {...agent,status:403});
 const webhookEvents=new Map();
 const webhook=async(id,messageId=sent.id,to='buyer@example.test',signature=true)=>{
  const timestamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify({type:'email.bounced',created_at:new Date().toISOString(),data:{email_id:messageId,to:[to]}});
  if(!webhookEvents.has(id))webhookEvents.set(id,{timestamp,body});
  const saved=webhookEvents.get(id);
  const digest=createHmac('sha256',key).update(`${id}.${saved.timestamp}.${saved.body}`).digest('base64');
  return fetch(h.origin+'/api/barrow/quote-mail/webhook',{method:'POST',headers:{'svix-id':id,'svix-timestamp':saved.timestamp,'svix-signature':'v1,'+(signature?digest:Buffer.alloc(32).toString('base64'))},body:saved.body});
 };
 assert.equal((await webhook('invalid',sent.id,'buyer@example.test',false)).status,400);
 assert.equal((await webhook('foreign','unrelated-provider-message')).status,400);
 assert.equal((await webhook('recipient',sent.id,'wren@example.test')).status,400);
 assert.equal((await webhook('bounced')).status,200);
 // Replay the identical authenticated provider event, with its original bytes and signature.
 assert.equal((await webhook('bounced')).status,200);
 const tasks=()=>h.api('/api/barrow/followups?view=all');
 let failed=(await tasks()).tasks.filter(row=>row.kind==='quote-mail');
 assert.equal(failed.length,1);assert.ok(failed[0].ownerId);assert.equal(failed[0].status,'open');
 await h.command('quote-mail.dispatch',{});
 assert.equal((await tasks()).tasks.filter(row=>row.kind==='quote-mail').length,1);
 const contacted=await h.command('followup.update',{id:failed[0].id,revision:failed[0].revision,contact:{outcome:'failed',note:'Mailbox still unavailable'}});
 assert.equal(contacted.status,'open');
 await h.command('quote.accept',{quoteId:quote.id,number:ready.revisions.at(-1).number},buyer);
 await h.command('followup.refresh',{});
 assert.equal((await tasks()).tasks.find(row=>row.id===contacted.id).status,'open');
 const acceptedMail=quoteMail().filter(row=>row.message.text.includes('accepted'));
 assert.ok(acceptedMail.length);
 const beforeAcceptedDispatch=quoteMail().length;await h.command('quote-mail.dispatch',{});assert.equal(quoteMail().length,beforeAcceptedDispatch);
 const resolved=await h.command('followup.update',{id:contacted.id,revision:contacted.revision,close:true,resolution:'Buyer reached by phone; correct email confirmed'});
 assert.equal(resolved.status,'closed');
 const diagnostics=await h.api('/api/barrow/diagnostics');assert.ok(diagnostics.notifications.deliveries.some(row=>row.status==='bounced'));
 // A separate refused network submission also creates owned work and is never labelled sent/delivered.
 h.mail.reject=true;
 await h.command('quote.message',{quoteId:quote.id,body:'New delivery update'},admin);
 assert.ok((await tasks()).tasks.some(row=>row.kind==='quote-mail'&&row.status==='open'));
 h.mail.reject=false;
 const snapshot=await archive(h),target=await installation();t.after(()=>target.close());
 await restore(target,snapshot);
 await target.command('quote-mail.dispatch',{});
 assert.equal(target.mail.deliveries.length,0);
 assert.ok((await target.api('/api/barrow/followups?view=all')).tasks.some(row=>row.id===resolved.id&&row.status==='closed'));
});
