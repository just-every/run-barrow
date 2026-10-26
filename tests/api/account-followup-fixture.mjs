import { installation, stock, accountValue } from './harness.mjs';

const date = delta => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10);
export async function accountFollowupFixture(t, options = {}) {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const inventory = await stock(pier, '80');
 const h = await installation({ https: true, ...options, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie, MAIL_WEBHOOK_SECRET: ['whsec', Buffer.from('synthetic-barrow-709').toString('base64')].join('_'), MAIL_EVENT_TENANT: 'synthetic-barrow-710', ...options.bindings } }); t.after(() => h.close());
 const account = await h.command('account.save', { id: 'synthetic-barrow-701', value: { ...accountValue(inventory.customer.id, 'synthetic-barrow-701@example.test'), name: 'Cedar Street Pantry', minimumCents: 0 } });
 const buyer = { as: await h.signIn(account.value.email) };
 let order = await h.command('order.prepare', { accountId: account.id, reference: 'FALL-DELIVERY-702', requestedDate: date(7), lines: [{ sku: 'OAT-1', quantity: 10 }] }, buyer);
 await h.command('order.submit', { orderId: order.id }, buyer);
 order = await h.command('order.approve', { orderId: order.id });
 const upstream = (await pier.api('/api/pier/state')).orders.find(row => row.id === order.pierOrderId);
 await pier.command('dispatch.create', { orderId: upstream.id, shipmentReference: 'synthetic-barrow-703', lines: [{ orderLineId: upstream.lines[0].id, quantity: '6' }] });
 // Only historical source dates change; ordering, stock allocation and shipment use real commands.
 await pier.db.prepare("UPDATE pier_records SET data=json_set(data,'$.promiseDate',?) WHERE kind='orders' AND id=?").bind(date(-4), upstream.id).run();
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.approvedAt',?) WHERE id=?").bind(date(-10) + 'T12:00:00Z', order.id).run();
 const quote = await h.command('quote.request', { accountId: account.id, lines: [{ sku: 'OAT-1', quantity: 3 }] }, buyer);
 await h.command('quote.message', { quoteId: quote.id, body: 'Four cases from our existing order are still outstanding. Please resolve that delivery before discussing another order.' }, buyer);
 const cart = await h.command('order.prepare', { accountId: account.id, reference: 'UNFINISHED-RESTOCK-704', lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.preparedAt',?) WHERE id=?").bind(date(-12) + 'T12:00:00Z', cart.id).run();
 await h.command('followup.refresh', {});
 const board = () => h.api('/api/barrow/followups?view=all');
 const task = async () => (await board()).tasks.find(row => row.id === `plan:${account.id}`);
 const plan = () => h.command('followup.plan', { accountId: account.id });
 const decide = (current, action, decision, extra = {}, who = {}) => h.command('followup.decide', { id: current.id, revision: current.revision, actionId: action.id, decision, recipientId: action.recipientId, body: action.body, sendOn: action.sendOn, reason: 'Review the delayed order before further stock outreach.', consent: true, ...extra }, who);
 const send = (current, action, who = {}) => h.command('followup.send', { id: current.id, revision: current.revision, actionId: action.id }, who);
 return { h, pier, inventory, account, buyer, order, quote, cart, board, task, plan, decide, send };
}
