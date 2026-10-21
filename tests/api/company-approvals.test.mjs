import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

const policyOf = (rights, extra = {}) => ({ rights, locations: 'all', perOrderLimitCents: null, approvalLimitCents: null, ...extra });
const hoursAgo = hours => new Date(Date.now() - hours * 3600000).toISOString();

test('ACC-007: amount and location routes run sequential approvers with delegation, escalation, withdrawal and fresh approval after any material change', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '400');
 const h = await installation({ https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const prices = [{ sku: 'OAT-1', unitCents: 40000, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices } });
 const admin = { as: await h.signIn('buyer@example.test') }; // legacy company administrator with every right and no limit
 const downtown = await h.command('location.save', { accountId: 'cedar', kind: 'ship-to', value: { name: 'Downtown', line1: '101 Main Street', city: 'Columbia', state: 'SC', zip: '29201' } }, admin);
 const north = await h.command('location.save', { accountId: 'cedar', kind: 'ship-to', value: { name: 'North store', line1: '202 Main Street', city: 'Columbia', state: 'SC', zip: '29201' } }, admin);
 const companyToken = email => {
  const message = h.mail.requests.findLast(row => row.message.subject === 'Your company buyer invitation' && row.message.to.includes(email)).message;
  const link = new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
  return { invitationId: link.searchParams.get('companyInvitation'), token: link.searchParams.get('companyToken') };
 };
 const join = async (email, name, rights, extra = {}) => {
  await h.command('company.invite', { accountId: 'cedar', email, name, policy: policyOf(rights, extra), reason: 'Administrator assigned explicit company purchasing rights.' }, admin);
  const who = { as: await h.signIn(email, 'existing') };
  await h.command('company.accept', companyToken(email), who);
  const actor = (await h.api('/api/barrow/state', undefined, who)).actor;
  return { ...who, id: actor.id, email };
 };
 const purchaser = await join('purchaser@example.test', 'Limited Purchaser', ['purchaser'], { perOrderLimitCents: 100000, approvalLimitCents: 0 });
 const second = await join('second@example.test', 'Second Purchaser', ['purchaser'], { perOrderLimitCents: 100000, approvalLimitCents: 0 });
 const ops = await join('ops@example.test', 'Operations Manager', ['approver'], { approvalLimitCents: 1000000, perOrderLimitCents: 0 });
 const finance = await join('finance-lead@example.test', 'Finance Lead', ['approver'], { approvalLimitCents: 1000000, perOrderLimitCents: 0 });
 const director = await join('director@example.test', 'Escalation Director', ['approver'], { approvalLimitCents: 1000000, perOrderLimitCents: 0 });
 const deputy = await join('deputy@example.test', 'Deputy Approver', ['approver'], { approvalLimitCents: 1000000, perOrderLimitCents: 0 });
 const small = await join('small@example.test', 'Small Approver', ['approver'], { approvalLimitCents: 100000, perOrderLimitCents: 0 });
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const rules = [
  { id: 'large', name: 'Large orders', locations: 'all', aboveCents: 500000, steps: [{ label: 'Operations', approvers: [ops.id], escalateAfterHours: 24, escalateTo: [director.id] }, { label: 'Finance', approvers: [finance.id], escalateAfterHours: null, escalateTo: [] }] },
  { id: 'north', name: 'North store', locations: [north.id], aboveCents: 0, steps: [{ label: 'Director', approvers: [director.id], escalateAfterHours: null, escalateTo: [] }] },
 ];
 const routes = who => h.api('/api/barrow/company/routes?accountId=cedar', undefined, who);
 const save = (opts = {}, body = {}) => h.command('company.route.save', { accountId: 'cedar', revision: null, rules, reason: 'Company administrator set the approval route.', ...body }, { ...admin, ...opts });

 // Only a company administrator (or the supplier) sets policy; every named person must be a current approver of this company.
 for (const who of [purchaser, ops, agent]) await save({ ...who, status: 403 });
 await h.api('/api/barrow/company/routes?accountId=cedar', undefined, { ...purchaser, status: 403 });
 await save({ status: 400 }, { rules: [{ ...rules[0], steps: [{ label: 'Plain buyer', approvers: [second.id], escalateAfterHours: null, escalateTo: [] }] }] });
 await save({ status: 400 }, { rules: [{ ...rules[0], steps: [{ label: 'Escalation without people', approvers: [ops.id], escalateAfterHours: 4, escalateTo: [] }] }] });
 await save({ status: 400 }, { rules: [{ ...rules[0], locations: ['not-a-location'] }] });
 await save({ status: 400 }, { rules: [{ ...rules[0], steps: [] }] });
 const first = await save();
 await save({ status: 409 }); // a stale base revision is refused
 const renamed = await save({}, { revision: first.revision, rules: rules.map(rule => rule.id === 'north' ? { ...rule, name: 'North store (director)' } : rule), reason: 'Renamed the north rule.' });
 assert.notEqual(renamed.revision, first.revision);
 assert.equal((await routes(admin)).versions.length, 2, 'each saved revision is kept');
 assert.equal((await routes({})).policy.rules.length, 2, 'the supplier reads the same policy');

 const cart = quantity => ({ accountId: 'cedar', shipToId: downtown.id, lines: [{ sku: 'OAT-1', quantity }] });
 const submit = async (quantity = 15, shipTo = downtown.id) => {
  const draft = await h.command('order.prepare', { ...cart(quantity), shipToId: shipTo }, purchaser);
  return { draft, waiting: await h.command('order.submit', { orderId: draft.id }, purchaser) };
 };
 const approve = (order, who, opts = {}) => h.command('order.company-approve', { orderId: order.id, revision: order.revision, reason: 'Reviewed this exact purchase.' }, { ...who, ...opts });
 const read = (id, who = purchaser) => h.api(`/api/barrow/orders/${id}`, undefined, who);

 // A $6,000 cart above the purchaser's limit waits on the frozen two-step route; no one outside it can bypass it.
 let { waiting } = await submit();
 assert.equal(waiting.totalCents, 600000); assert.equal(waiting.status, 'awaiting-company-approval');
 assert.equal(waiting.approvalRoute.ruleId, 'large'); assert.equal(waiting.approvalRoute.steps.length, 2); assert.equal(waiting.approvalRoute.policyRevision, renamed.revision);
 await approve(waiting, second, { status: 403 }); // a lower-rights buyer
 await approve(waiting, small, { status: 403 }); // an approver the route does not name
 await approve(waiting, admin, { status: 403 }); // company administrators do not bypass the route
 await approve(waiting, finance, { status: 403 }); // step 2 cannot be taken first
 await approve(waiting, purchaser, { status: 403 }); // the preparer
 await approve(waiting, agent, { status: 403 });
 await approve(waiting, {}, { status: 403 }); // nor can the supplier
 let view = await read(waiting.id, ops);
 assert.deepEqual([view.approvalStatus.step, view.approvalStatus.of, view.approvalStatus.label, view.approvalStatus.canDecide], [1, 2, 'Operations', true]);
 assert.equal((await read(waiting.id, finance)).approvalStatus.canDecide, false);

 // Delegation: only to another current approver, dated, and the delegate still needs their own limit.
 await h.command('company.delegate', { accountId: 'cedar', delegatorId: ops.id, delegateId: second.id, endsOn: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), reason: 'A plain buyer cannot receive approval authority.' }, { ...admin, status: 400 });
 await h.command('company.delegate', { accountId: 'cedar', delegatorId: ops.id, delegateId: ops.id, endsOn: new Date(Date.now() + 86400000).toISOString().slice(0, 10), reason: 'Self.' }, { ...admin, status: 400 });
 await h.command('company.delegate', { accountId: 'cedar', delegatorId: ops.id, delegateId: deputy.id, endsOn: '2000-01-01', reason: 'Past.' }, { ...admin, status: 400 });
 await h.command('company.delegate', { accountId: 'cedar', delegatorId: ops.id, delegateId: deputy.id, endsOn: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), reason: 'Operations manager is away.' }, { ...purchaser, status: 403 });
 const delegation = await h.command('company.delegate', { accountId: 'cedar', delegatorId: ops.id, delegateId: deputy.id, endsOn: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), reason: 'Operations manager is away.' }, admin);
 assert.equal((await read(waiting.id, deputy)).approvalStatus.canDecide, true);
 const stepOne = await approve(waiting, deputy);
 assert.equal(stepOne.status, 'awaiting-company-approval');
 assert.deepEqual(stepOne.approvalRoute.decided.map(row => [row.step, row.by, row.via, row.delegatedFrom]), [[1, deputy.id, 'delegate', ops.id]]);
 await approve(stepOne, deputy, { status: 403 }); // the delegate cannot also take step 2; each step is a different person
 await approve(stepOne, ops, { status: 403 }); // step 1 is decided; ops is not the step-2 approver
 const released = await approve(stepOne, finance);
 assert.equal(released.status, 'submitted'); assert.equal(released.companyApprovedBy, finance.id);
 assert.deepEqual(released.approvalRoute.decided.map(row => row.step), [1, 2]);
 assert.equal((await h.command('order.approve', { orderId: released.id })).status, 'approved', 'supplier approval stays a separate attributable decision');
 // Ending the delegation is immediate.
 await h.command('company.undelegate', { accountId: 'cedar', id: delegation.id, revision: delegation.revision, reason: 'Operations manager is back.' }, admin);

 // Revising quantities requires fresh approval: nothing decided on the old request carries to the revised one.
 ({ waiting } = await submit());
 const progressed = await approve(waiting, ops);
 assert.equal(progressed.approvalRoute.decided.length, 1);
 const revised = await h.command('order.prepare', { ...cart(16), replaces: waiting.id }, purchaser);
 assert.equal((await read(waiting.id)).status, 'superseded');
 const resubmitted = await h.command('order.submit', { orderId: revised.id }, purchaser);
 assert.equal(resubmitted.totalCents, 640000); assert.deepEqual(resubmitted.approvalRoute.decided, []);
 await approve(progressed, finance, { status: 409 }); // the superseded request is closed
 await approve(resubmitted, finance, { status: 403 }); // still needs Operations first
 await approve(resubmitted, ops);

 // Withdrawal: the submitter or a company administrator; every approval so far is void.
 const current = await read(resubmitted.id);
 await h.command('order.withdraw', { orderId: current.id, revision: current.revision, reason: 'Not mine.' }, { ...second, status: 403 });
 await h.command('order.withdraw', { orderId: current.id, revision: current.revision, reason: 'Supplier.' }, { status: 403 });
 await h.command('order.withdraw', { orderId: current.id, revision: 'stale', reason: 'Stale.' }, { ...purchaser, status: 409 });
 const back = await h.command('order.withdraw', { orderId: current.id, revision: current.revision, reason: 'Quantities need rework.' }, purchaser);
 assert.equal(back.status, 'draft'); assert.equal(back.approvalRoute, undefined); assert.equal(back.companyPreparedBy, undefined);
 await h.command('order.withdraw', { orderId: back.id, revision: back.revision, reason: 'Already a draft.' }, { ...purchaser, status: 409 });
 const again = await h.command('order.submit', { orderId: back.id }, purchaser);
 assert.deepEqual(again.approvalRoute.decided, [], 'a resubmission starts the route again');
 await h.command('order.withdraw', { orderId: again.id, revision: again.revision, reason: 'A company administrator may withdraw it.' }, admin);

 // Escalation: after the step's time, its escalation people may decide it, not before; the clock is the recorded request time.
 ({ waiting } = await submit());
 await approve(waiting, director, { status: 403 });
 assert.equal((await read(waiting.id, director)).approvalStatus.escalated, false);
 const row = await h.db.prepare('SELECT value_json FROM bw_orders WHERE id=?').bind(waiting.id).first();
 const aged = JSON.parse(row.value_json); aged.approvalRoute.stepRequestedAt = hoursAgo(25);
 await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(aged), waiting.id).run(); // stands in for 25 elapsed hours
 view = await read(waiting.id, director);
 assert.equal(view.approvalStatus.escalated, true); assert.equal(view.approvalStatus.canDecide, true);
 assert.equal((await read(waiting.id, ops)).approvalStatus.canDecide, true, 'the original approver can still decide');
 await approve(view, finance, { status: 403 });
 const escalated = await approve(view, director);
 assert.deepEqual(escalated.approvalRoute.decided.map(entry => [entry.step, entry.via]), [[1, 'escalation']]);
 assert.equal(escalated.approvalRoute.steps[1].escalateAfterHours, null);
 await approve(escalated, finance);
 const audit = (await h.api('/api/barrow/audit?limit=200')).events.filter(event => event.action.startsWith('order.company-'));
 assert.ok(audit.some(event => event.action === 'order.company-step-approved' && /by escalation/.test(event.reason)));
 assert.ok(audit.some(event => event.action === 'order.company-step-approved' && /as delegate for/.test(event.reason)));
 assert.ok(audit.some(event => event.action === 'order.company-withdrawn'));

 // Material price and address changes void every approval so far and return the request to a draft.
 ({ waiting } = await submit());
 const priced = await approve(waiting, ops);
 const cedar = await h.api('/api/barrow/accounts/by-id/cedar');
 await h.command('account.save', { id: 'cedar', revision: cedar.revision, value: { ...cedar.value, prices: [{ sku: 'OAT-1', unitCents: 39000, minQty: 1 }] } });
 await approve(priced, finance, { status: 409 });
 const voided = await read(waiting.id);
 assert.equal(voided.status, 'draft'); assert.equal(voided.approvalRoute, undefined); assert.match(voided.approvalVoided.reason, /changed/);
 ({ waiting } = await submit());
 const placed = await approve(waiting, ops);
 const place = (await h.api('/api/barrow/locations?accountId=cedar', undefined, admin)).locations.find(row => row.id === downtown.id);
 await h.command('location.save', { accountId: 'cedar', id: downtown.id, revision: place.revision, kind: 'ship-to', value: { ...place.value, line1: '999 Main Street' } }, admin);
 await approve(placed, finance, { status: 409 });
 const moved = await read(waiting.id);
 assert.equal(moved.status, 'draft'); assert.match(moved.approvalVoided.reason, /address/);

 // A location rule: a smaller order to the north store takes its own single-step route.
 const northOrder = await submit(2, north.id);
 assert.equal(northOrder.waiting.approvalRoute.ruleId, 'north'); assert.equal(northOrder.waiting.approvalRoute.steps.length, 1);
 await approve(northOrder.waiting, ops, { status: 403 });
 assert.equal((await approve(northOrder.waiting, director)).status, 'submitted');
 // Below every rule and the purchaser's limit there is no route: ACC-002 behaviour is unchanged.
 const small2 = await h.command('order.prepare', { accountId: 'cedar', shipToId: downtown.id, lines: [{ sku: 'OAT-1', quantity: 1 }] }, purchaser);
 const direct = await h.command('order.submit', { orderId: small2.id }, purchaser);
 assert.equal(direct.status, 'submitted'); assert.equal(direct.approvalRoute, undefined);

 // Approvers named by a route cannot be removed or lose the right until the route is edited.
 const roster = (await h.api('/api/barrow/company/members?accountId=cedar', undefined, admin)).members;
 const named = roster.find(member => member.userId === ops.id);
 await h.command('company.remove', { accountId: 'cedar', memberId: named.id, revision: named.revision, reason: 'Named in the route.' }, { ...admin, status: 409 });
 await h.command('company.update', { accountId: 'cedar', memberId: named.id, revision: named.revision, policy: policyOf(['purchaser']), reason: 'Named in the route.' }, { ...admin, status: 409 });
});
