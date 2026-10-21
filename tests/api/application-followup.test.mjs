import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, activateStaff } from './harness.mjs';

const easternDay = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 86400000));
const pdf = { name: 'resale certificate.pdf', contentBase64: Buffer.from('%PDF-1.4 synthetic-barrow-21').toString('base64') };

test('AUTO-001: rules route verified applications to a reviewer with a deadline, escalation persists through requests and answers and ends only with a decision or explicit closure', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier);
 const h = await installation({ https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const admin = { as: await h.signIn('territory-owner@example.test', 'admin') };
 const adminId = (await h.api('/api/barrow/state', undefined, admin)).actor.id, ownerId = (await h.api('/api/barrow/state')).actor.id;
 const manager = await activateStaff(h, 'manager@example.test', { role: 'sales-manager', accounts: 'all', warehouses: [], reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0 });
 const buyer = { as: await h.signIn('buyer@example.test') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };

 // Routing is the owner's; admins read it; nobody else does. Reviewers are owners or admins only.
 const rules = [
  { id: 'southeast', name: 'Southeast without a certificate', when: { states: ['SC', 'NC'], certificate: 'missing' }, route: { territory: 'Southeast', ownerId: adminId, escalateToId: ownerId, deadlineDays: 2 } },
  { id: 'large', name: 'Large expected volume', when: { minVolumeUsd: 100000 }, route: { ownerId: ownerId, escalateToId: adminId, deadlineDays: 1 } },
 ];
 const save = (opts = {}, body = {}) => h.command('application.rules.save', { revision: null, rules, fallback: null, reason: 'Owner routed applications by territory.', ...body }, opts);
 for (const who of [admin, manager.who, buyer, agent]) await save({ ...who, status: 403 });
 for (const who of [manager.who, buyer, agent]) await h.api('/api/barrow/application-rules', undefined, { ...who, status: 403 });
 await save({ status: 400 }, { rules: [{ ...rules[0], route: { ...rules[0].route, ownerId: manager.id } }] }); // a functional manager cannot review applications
 await save({ status: 400 }, { rules: [{ ...rules[0], when: { states: ['South Carolina'] } }] });
 await save({ status: 400 }, { rules: [{ ...rules[0], route: { ...rules[0].route, deadlineDays: 0 } }] });
 await save({ status: 400 }, { rules: [rules[0], rules[0]] });
 const saved = await save();
 await save({ status: 409 }); // stale base revision
 assert.equal((await h.api('/api/barrow/application-rules', undefined, admin)).rules.length, 2);

 // Applicants: the public form, then the emailed code.
 const form = await h.api('/api/barrow/applications/form', undefined, { as: '' });
 await new Promise(resolve => setTimeout(resolve, 3050));
 const location = { name: 'Cedar downtown', line1: '101 Main Street', city: 'Columbia', state: 'SC', zip: '29201' };
 let serial = 0;
 const apply = async (value = {}) => {
  serial += 1;
  const email = `applicant-${serial}@example.test`;
  const pending = await h.api('/api/barrow/applications', { name: `Applicant Company ${serial}`, ein: `12-345678${serial}`, contactName: 'River Buyer', email, phone: '803 555 0101', annualVolumeUsd: 90000, locations: [location], consent: true, website: '', formToken: form.formToken, ...value }, { as: '' });
  const code = h.mail.requests.findLast(row => row.message.to.includes(email) && row.message.subject === 'Verify your trade application').message.text.match(/code is (\d{6})/)[1];
  const response = await h.request('/api/barrow/applications/verify', { method: 'POST', body: { id: pending.id, code }, as: '' });
  assert.equal(response.status, 200);
  return { id: pending.id, email, session: { as: response.headers.getSetCookie().map(part => part.split(';')[0]).join('; ') } };
 };
 const board = async (who = {}) => (await h.api('/api/barrow/followups?view=all', undefined, who)).tasks.filter(task => task.kind === 'application');
 const taskFor = async id => (await board()).find(task => task.sourceId === id);

 // 1. No certificate, Southeast: routed to the territory reviewer with the two-day deadline.
 const first = await apply();
 let task = await taskFor(first.id);
 assert.equal(task.ownerId, adminId); assert.equal(task.status, 'open'); assert.equal(task.nextContactDate, easternDay(2)); assert.equal(task.priority, 2);
 assert.match(task.reason, /Southeast without a certificate/); assert.match(task.reason, /territory Southeast/); assert.match(task.reason, /no certificate attached/);
 assert.deepEqual((await board(admin)).map(row => row.id), [task.id], 'the territory reviewer sees it');
 assert.deepEqual(await board(manager.who), [], 'functional staff never see application tasks');
 await h.api('/api/barrow/followups', undefined, { ...buyer, status: 403 });
 // Other applications: a documented large one, and an unmatched one with the owner default.
 const large = await apply({ annualVolumeUsd: 250000, documents: [pdf] });
 assert.deepEqual([(await taskFor(large.id)).ownerId, (await taskFor(large.id)).nextContactDate], [ownerId, easternDay(1)]);
 const plain = await apply({ locations: [{ ...location, state: 'NY', zip: '10001' }], documents: [pdf] });
 assert.deepEqual([(await taskFor(plain.id)).ownerId, (await taskFor(plain.id)).nextContactDate, (await taskFor(plain.id)).application.ruleId], [ownerId, easternDay(3), null]);

 // 2. Staff request the missing certificate: the deadline restarts and the task stays open; the applicant answers; it stays open.
 let row = (await h.api('/api/barrow/applications')).applications.find(application => application.id === first.id);
 row = await h.command('application.request-information', { id: row.id, revision: row.revision, reason: 'Please attach your state resale certificate.', duplicateReviews: [] });
 task = await taskFor(first.id);
 assert.equal(task.status, 'open'); assert.match(task.reason, /Information requested from the applicant/);
 const mine = await h.api('/api/barrow/applications/mine', undefined, first.session);
 assert.equal(mine.state, 'information requested');
 assert.equal(JSON.stringify(h.mail.requests.map(entry => entry.message.subject)).includes('Please attach'), false, 'no new applicant email is sent');
 await h.api('/api/barrow/applications/respond', { revision: mine.revision, document: pdf }, first.session);
 task = await taskFor(first.id);
 assert.equal(task.status, 'open'); assert.match(task.reason, /The applicant answered/);

 // 3. Past the deadline the open task escalates (priority 1, escalation person named) and refresh keeps it open and escalated.
 const stored = JSON.parse((await h.db.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(task.id).first()).value_json);
 stored.nextContactDate = easternDay(-1);
 await h.db.prepare('UPDATE bw_followups SET value_json=? WHERE id=?').bind(JSON.stringify(stored), task.id).run(); // stands in for the passing days
 task = await taskFor(first.id);
 assert.equal(task.priority, 1); assert.match(task.reason, new RegExp(`Escalated: the review deadline ${easternDay(-1)} passed.*${ownerId}`));
 await h.command('followup.refresh', {});
 task = await taskFor(first.id);
 assert.equal(task.status, 'open'); assert.equal(task.priority, 1); assert.match(task.reason, /Escalated/);
 const due = (await h.api('/api/barrow/followups')).tasks.filter(row => row.kind === 'application');
 assert.ok(due.some(row => row.sourceId === first.id), 'an escalated task is due on the board');

 // 4. Only a recorded decision (or the applicant's withdrawal) ends it; the invitation email queued by approval is not what ends it.
 row = (await h.api('/api/barrow/applications')).applications.find(application => application.id === first.id);
 const approved = await h.command('application.approve', { id: row.id, revision: row.revision, reason: 'Certificate reviewed; approve.', duplicateReviews: [], account: { pierCustomerId: products.customer.id, termsDays: 30, minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 2 }] } });
 assert.equal(approved.state, 'approved');
 task = await taskFor(first.id);
 assert.equal(task.status, 'closed'); assert.equal(task.resolution, 'Decision recorded: application approved.');
 await h.command('followup.refresh', {});
 assert.equal((await taskFor(first.id)).status, 'closed', 'refresh never reopens a decided application');
 let declined = (await h.api('/api/barrow/applications')).applications.find(application => application.id === large.id);
 await h.command('application.decline', { id: declined.id, revision: declined.revision, reason: 'Outside our trade criteria.', duplicateReviews: [] });
 assert.equal((await taskFor(large.id)).resolution, 'Decision recorded: application declined.');
 const leaving = await apply({ locations: [{ ...location, state: 'GA', zip: '30301' }], documents: [pdf] });
 assert.equal((await taskFor(leaving.id)).status, 'open');
 const view = await h.api('/api/barrow/applications/mine', undefined, leaving.session);
 await h.api('/api/barrow/applications/respond', { action: 'withdraw', revision: view.revision }, leaving.session);
 assert.equal((await taskFor(leaving.id)).resolution, 'Decision recorded: application withdrawn.');

 // 5. Explicit closure by a person stands: later activity never reopens it.
 const open = (await board()).find(row => row.sourceId === plain.id);
 await h.command('followup.update', { id: open.id, revision: open.revision, close: true, resolution: 'Owner reviewed the application offline.' });
 assert.equal((await taskFor(plain.id)).status, 'closed');
 await h.command('followup.refresh', {});
 assert.equal((await taskFor(plain.id)).status, 'closed');
 const audit = (await h.api('/api/barrow/audit?limit=200')).events.map(event => event.action);
 for (const action of ['application.task-opened', 'application.task-updated', 'application.task-closed', 'application.routing-saved']) assert.ok(audit.includes(action), action);
 assert.ok(saved.revision);
});
