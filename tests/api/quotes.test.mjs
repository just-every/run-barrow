import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installation, archive } from './harness.mjs';

const easternDay = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 86400000));

// Real pinned Pier with stock for two SKUs; Cedar has a PRI-002 volume break and account discount on OAT-1.
async function quoting(t) {
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

 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 // PRI-002 basis: a volume break at 10 cases and a 5% account discount, effective across the test.
 const rule = { effectiveFrom: '2026-01-01', effectiveTo: '2030-12-31', mode: 'volume', breaks: [{ fromQuantity: '10', unitCents: 6000 }], accountDiscountBps: 500 };
 const prices = [{ sku: 'OAT-1', unitCents: 6500, minQty: 1, pricing: rule }, { sku: 'RYE-1', unitCents: 4000, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { name: 'Cedar Street Pantry', email: 'buyer@example.test', pierCustomerId: cedarParty.id, termsDays: 30, minimumCents: 10000, prices } });
 await h.command('account.save', { id: 'wren', value: { name: 'Wren & Co.', email: 'wren@example.test', pierCustomerId: wrenParty.id, termsDays: 30, minimumCents: 0, prices } });
 const buyer = { as: await h.signIn('buyer@example.test') }, wren = { as: await h.signIn('wren@example.test') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const quoteOf = (id, opts = {}) => h.api(`/api/barrow/quotes/${id}`, undefined, opts);
 return { pier, h, rule, prices, buyer, wren, agent, quoteOf };
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
