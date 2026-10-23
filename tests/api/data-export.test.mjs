import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installation, stock, accountValue, archive } from './harness.mjs';

const csvRows = text => text.trim().split('\r\n').map(line => line.slice(1, -1).split('","'));
const sum = (list, key) => list.reduce((total, row) => total + Number(row[key]), 0);

test('DATA-001: owner and buyer export open JSON/CSV commercial records that reconcile, resolve documents and stay in scope', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '200');
 const harborCustomer = await pier.command('party.save', { name: 'Harbor Provisions', kind: 'customer' });
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), providerReferences: { quickbooks: 'QB-118' } } });
 await h.command('account.save', { id: 'harbor', value: { ...accountValue(harborCustomer.id, 'harbor@example.test'), name: 'Harbor Provisions', prices: [{ sku: 'OAT-1', unitCents: 7100, minQty: 1 }] } });
 const cedar = { as: await h.signIn('buyer@example.test') }, harbor = { as: await h.signIn('harbor@example.test') };
 const place = async (accountId, as, quantity, reference) => {
  const draft = await h.command('order.prepare', { accountId, reference, lines: [{ sku: 'OAT-1', quantity }] }, as);
  await h.command('order.submit', { orderId: draft.id }, as);
  return h.command('order.approve', { orderId: draft.id });
 };
 const approved = await place('cedar', cedar, 3, 'PO-1');
 const review = await h.command('order.reorder-preview', { orderId: approved.id, selections: [{ sku: 'OAT-1' }] }, cedar);
 const reorder = await h.command('order.reorder', { orderId: approved.id, selections: [{ sku: 'OAT-1' }], fingerprint: review.fingerprint, acknowledged: true, reference: 'PO-2' }, cedar);
 const withDocument = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-3', lines: [{ sku: 'OAT-1', quantity: 2 }] }, cedar);
 const pdf = Buffer.from('%PDF-1.7\nPO 3 signed\n%%EOF\n');
 await h.command('order.attach', { orderId: withDocument.id, name: 'PO 3.pdf', contentBase64: pdf.toString('base64') }, cedar);
 const other = await place('harbor', harbor, 4, 'H-1');
 // A real-shaped record written before USD carries AUD exactly as recorded.
 const legacy = { ...approved, id: 'legacy-aud', reference: 'PO-legacy', invoice: { ...approved.invoice, number: 'BAR-legacy-aud' } };
 delete legacy.currency;
 await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(legacy.id, legacy.accountId, JSON.stringify(legacy), legacy.revision).run();

 // Owner: every account, with counts and per-currency totals that reconcile against the rows themselves.
 const all = await h.api('/api/barrow/export.json');
 assert.equal(all.manifest.scope, 'installation'); assert.deepEqual(all.manifest.accountIds, ['cedar', 'harbor']);
 assert.deepEqual(all.orders.map(order => order.id).sort(), [approved.id, reorder.id, withDocument.id, other.id, 'legacy-aud'].sort());
 for (const [kind, count] of Object.entries(all.manifest.counts)) assert.equal(all[kind].length, count, kind);
 for (const total of all.manifest.totals) {
  const orders = all.orders.filter(order => order.currency === total.currency);
  assert.equal(total.orders, orders.length); assert.equal(total.orderCents, sum(orders, 'totalCents'));
  assert.equal(total.invoiceCents, sum(all.invoices.filter(invoice => invoice.currency === total.currency), 'totalCents'));
 }
 assert.deepEqual(all.manifest.totals.map(total => [total.currency, total.orders]), [['AUD', 1], ['USD', 4]]);
 for (const order of all.orders) assert.equal(sum(all.lines.filter(line => line.orderId === order.id), 'lineCents'), order.totalCents, order.id);
 const exported = all.orders.find(order => order.id === approved.id);
 assert.equal(exported.revision, approved.revision); assert.equal(exported.pierOrderId, approved.pierOrderId); assert.equal(exported.invoiceNumber, approved.invoice.number);
 assert.equal(all.orders.find(order => order.id === reorder.id).reorderedFrom, approved.id);
 assert.equal(all.accounts.find(account => account.id === 'cedar').providerReferences, '{"quickbooks":"QB-118"}');
 assert.equal(all.accounts.find(account => account.id === 'cedar').pierCustomerId, products.customer.id);
 assert.ok(all.audit.some(event => event.orderId === approved.id && event.action === 'order.approved'));
 // Each document reference resolves to exactly the stored bytes.
 assert.equal(all.documents.length, 1);
 const [document] = all.documents, file = await h.request(document.path, { as: cedar.as });
 assert.equal(file.status, 200);
 const bytes = Buffer.from(await file.arrayBuffer());
 assert.equal(bytes.length, document.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), document.sha256);
 assert.equal((await h.request(document.path, { as: harbor.as })).status, 404);
 // Each kind is also a CSV with the same rows.
 const ordersCsv = csvRows(await (await h.request('/api/barrow/export/orders.csv')).text());
 assert.equal(ordersCsv[0][0], 'id'); assert.equal(ordersCsv.length - 1, all.orders.length);
 assert.equal(csvRows(await (await h.request('/api/barrow/export/invoices.csv')).text()).length - 1, all.invoices.length);

 // A buyer's export holds only their own account, never audit decisions; an agent cannot export.
 const mine = await h.api('/api/barrow/export.json', undefined, cedar);
 assert.equal(mine.manifest.scope, 'buyer'); assert.deepEqual(mine.manifest.accountIds, ['cedar']);
 assert.ok(mine.orders.every(order => order.accountId === 'cedar')); assert.equal(mine.audit, undefined);
 assert.ok(!JSON.stringify(mine).includes('harbor'));
 assert.equal((await h.request('/api/barrow/export/audit.csv', { as: cedar.as })).status, 403);
 const { token } = await h.api('/api/barrow/agent-token', {});
 assert.equal((await h.request('/api/barrow/export.json', { as: '', headers: { authorization: `Bearer ${token}` } })).status, 403);
 // The owner archive remains the credential-free full restore.
 const archived = JSON.stringify(await archive(h));
 assert.ok(archived.includes('legacy-aud'));
 for (const secret of [token, pier.cookie]) assert.ok(!archived.includes(secret));
});

test('a company finance viewer exports only invoiced orders, never drafts, quotes or agreed prices', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '20');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 2 }] } });
 const buyer = { as: await h.signIn('buyer@example.test') };
 await h.command('company.invite', { accountId: 'cedar', email: 'finance@example.test', name: 'Company Finance', policy: { rights: ['finance'], locations: 'all', perOrderLimitCents: null, approvalLimitCents: null }, reason: 'Administrator assigned the finance viewer right.' }, buyer);
 const finance = { as: await h.signIn('finance@example.test', 'existing') };
 const invitation = new URL(h.mail.requests.findLast(row => row.message.subject === 'Your company buyer invitation' && row.message.to.includes('finance@example.test')).message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
 await h.command('company.accept', { invitationId: invitation.searchParams.get('companyInvitation'), token: invitation.searchParams.get('companyToken') }, finance);
 const invoiced = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-1', lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);
 await h.command('order.submit', { orderId: invoiced.id }, buyer);
 assert.ok((await h.command('order.approve', { orderId: invoiced.id })).invoice);
 const draft = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-2', lines: [{ sku: 'OAT-1', quantity: 3 }] }, buyer);
 const quote = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 4 }] }, buyer);
 await h.command('quote.propose', { quoteId: quote.id, revision: quote.revision, validUntil: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()), lines: [{ sku: 'OAT-1', quantity: 4, unitCents: 6100 }] });
 await h.command('quote.message', { quoteId: quote.id, body: 'Buyer-visible revision is ready.' });
 // The finance viewer reads the invoice, while the draft and the quote stay closed to them.
 assert.equal((await h.request(`/api/barrow/invoices/${invoiced.id}.csv`, finance)).status, 200);
 assert.equal((await h.request(`/api/barrow/orders/${draft.id}`, finance)).status, 403);
 assert.equal((await h.request(`/api/barrow/quotes/${quote.id}`, finance)).status, 404);
 const exported = await h.api('/api/barrow/export.json', undefined, finance);
 assert.deepEqual(exported.manifest.accountIds, ['cedar']);
 assert.deepEqual(exported.orders.map(order => order.id), [invoiced.id]);
 assert.deepEqual(exported.invoices.map(invoice => invoice.orderId), [invoiced.id]);
 assert.ok(exported.lines.every(line => line.orderId === invoiced.id));
 for (const kind of ['quotes', 'quotelines', 'quotemessages', 'prices']) assert.deepEqual(exported[kind], [], kind);
 for (const kind of ['orders', 'lines', 'quotes', 'quotelines', 'quotemessages', 'prices']) {
  const csv = await h.request(`/api/barrow/export/${kind}.csv`, finance);
  assert.equal(csv.status, 200, kind);
  const text = await csv.text();
  for (const hidden of [draft.id, quote.id, '6100']) assert.ok(!text.includes(hidden), `${kind}.csv discloses ${hidden}`);
 }
});
