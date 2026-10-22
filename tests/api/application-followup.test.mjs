import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, activateStaff } from './harness.mjs';

const easternDay = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 86400000));
const pdf = { name: 'resale certificate.pdf', contentBase64: Buffer.from('%PDF-1.4 synthetic-barrow-21').toString('base64') };

test('AUTO-001: rules route verified applications by territory, requested terms and certificate to a reviewer with a deadline and a prepared request; applicants get generic status emails; escalation persists through requests, refused uploads and emails until a decision or explicit closure', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier);
 const h = await installation({ https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const admin = { as: await h.signIn('territory-owner@example.test', 'admin') };
 const adminId = (await h.api('/api/barrow/state', undefined, admin)).actor.id, ownerId = (await h.api('/api/barrow/state')).actor.id;
 const manager = await activateStaff(h, 'manager@example.test', { role: 'sales-manager', accounts: 'all', warehouses: [], reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0 });
 const buyer = { as: await h.signIn('buyer@example.test') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };

 // Owners/admins manage routing. Only current all-account managers with applications may join the reviewer choices.
 const prepared = 'Please attach your state resale certificate.';
 const rules = [
  { id: 'southeast', name: 'Southeast without a certificate', when: { states: ['SC', 'NC'], certificate: 'missing' }, route: { territory: 'Southeast', ownerId: adminId, escalateToId: ownerId, deadlineDays: 2, request: prepared } },
  { id: 'net-terms', name: 'Net terms requests', when: { minTermsDays: 30 }, route: { ownerId, escalateToId: adminId, deadlineDays: 1 } },
  { id: 'large', name: 'Large expected volume', when: { minVolumeUsd: 100000 }, route: { ownerId, escalateToId: adminId, deadlineDays: 5 } },
 ];
 const save = (opts = {}, body = {}) => h.command('application.rules.save', { revision: null, rules, fallback: null, reason: 'Routed applications by territory, terms and volume.', ...body }, opts);
 for (const who of [manager.who, buyer, agent]) await save({ ...who, status: 403 });
 for (const who of [manager.who, buyer, agent]) await h.api('/api/barrow/application-rules', undefined, { ...who, status: 403 });
 await save({ status: 400 }, { rules: [{ ...rules[0], route: { ...rules[0].route, ownerId: manager.id } }] }); // no applications entitlement
 await save({ status: 400 }, { rules: [{ ...rules[0], when: { states: ['South Carolina'] } }] });
 await save({ status: 400 }, { rules: [{ ...rules[1], when: { minTermsDays: 60, maxTermsDays: 30 } }] });
 await save({ status: 400 }, { rules: [{ ...rules[0], route: { ...rules[0].route, deadlineDays: 0 } }] });
 await save({ status: 400 }, { rules: [rules[0], rules[0]] });
 const managerPolicy = {role:'sales-manager',accounts:'all',warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0,entitlements:['applications']}
 let managerGrant = await h.command('staff.update', {userId:manager.id,revision:manager.grant.revision,policy:managerPolicy,reason:'Authorize functional application routing and tasks.'})
 rules[0].route.ownerId = manager.id
 rules[1].route.escalateToId = manager.id
 const finance = await activateStaff(h, 'certificates@example.test', {...managerPolicy,role:'finance',entitlements:['application-documents']})
 await save({status:400}, {rules:[{...rules[0],route:{...rules[0].route,ownerId:finance.id}}]})
 const saved = await save(admin);
 await save({ status: 409 }); // stale base revision
 const routing = await h.api('/api/barrow/application-rules');
 assert.equal(routing.rules.length, 3); assert.equal(routing.revision, saved.revision);
 const name = id => routing.reviewers.find(person => person.id === id).name;

 // Applicants: the public form, then the emailed code.
 const form = await h.api('/api/barrow/applications/form', undefined, { as: '' });
 await new Promise(resolve => setTimeout(resolve, 3050));
 const location = { name: 'Cedar downtown', line1: '101 Main Street', city: 'Columbia', state: 'SC', zip: '29201' }, newYork = { ...location, state: 'NY', zip: '10001' };
 let serial = 0;
 const apply = async (value = {}) => {
  serial += 1;
  const email = `applicant-${serial}@example.test`;
  const pending = await h.api('/api/barrow/applications', { name: `Applicant Company ${serial}`, ein: `12-345678${serial}`, contactName: 'River Buyer', email, phone: '803 555 0101', annualVolumeUsd: 90000, requestedTermsDays: 0, locations: [location], consent: true, website: '', formToken: form.formToken, ...value }, { as: '' });
  const code = h.mail.requests.findLast(row => row.message.to.includes(email) && row.message.subject === 'Verify your trade application').message.text.match(/code is (\d{6})/)[1];
  const response = await h.request('/api/barrow/applications/verify', { method: 'POST', body: { id: pending.id, code }, as: '' });
  assert.equal(response.status, 200);
  return { id: pending.id, email, session: { as: response.headers.getSetCookie().map(part => part.split(';')[0]).join('; ') } };
 };
 const board = async (who = {}, view = 'all') => (await h.api(`/api/barrow/followups?view=${view}`, undefined, who)).tasks.filter(task => task.kind === 'application');
 const taskFor = async id => (await board()).find(task => task.sourceId === id);
 const review = async id => (await h.api('/api/barrow/applications')).applications.find(application => application.id === id);
 const statusMails = email => h.mail.requests.filter(row => row.message.to.includes(email) && row.message.subject === 'Your trade application status changed').map(row => row.message.text);

 // 1. No certificate, Southeast: routed to the territory reviewer with the two-day deadline and the prepared request.
 const first = await apply();
 let task = await taskFor(first.id);
 assert.equal(task.ownerId, manager.id); assert.equal(task.status, 'open'); assert.equal(task.nextContactDate, easternDay(2)); assert.equal(task.priority, 2); assert.equal(task.escalated, undefined);
 assert.match(task.reason, /Southeast without a certificate/); assert.match(task.reason, /territory Southeast/); assert.match(task.reason, /no payment terms requested; no certificate attached/);
 assert.equal(task.sourcePath, `/app?application=${first.id}`);
 assert.deepEqual((await board(admin)).map(row => row.id), [task.id], 'the territory reviewer sees it');
 assert.deepEqual((await board(manager.who)).map(row=>row.id), [task.id], 'entitled functional reviewer sees the application task');
 assert.deepEqual(await board(finance.who), [], 'certificate-only finance cannot read application tasks');
 await h.command('followup.update',{id:task.id,revision:task.revision,close:true,resolution:'Not authorized.'},{...finance.who,status:403});
 const csv=await (await h.request('/api/barrow/export/followups.csv',manager.who)).text();assert.ok(csv.includes(task.id));
 await h.api('/api/barrow/followups', undefined, { ...buyer, status: 403 });
 assert.deepEqual(statusMails(first.email), [], 'verifying is the applicant’s own change: no status email');
 let row = await review(first.id);
 assert.deepEqual([row.review.ruleName, row.review.territory, row.review.reviewer, row.review.escalationPerson, row.review.deadline, row.review.preparedRequest, row.review.escalatedSince], ['Southeast without a certificate', 'Southeast', name(manager.id), name(ownerId), easternDay(2), prepared, null]);
 // Requested terms and volume route the others; an unmatched application goes to the owner with three days.
 const terms = await apply({ requestedTermsDays: 60, locations: [newYork] });
 assert.deepEqual([(await taskFor(terms.id)).ownerId, (await taskFor(terms.id)).nextContactDate, (await taskFor(terms.id)).application.ruleId], [ownerId, easternDay(1), 'net-terms']);
 assert.match((await taskFor(terms.id)).reason, /Net 60 terms requested; no certificate attached/);
 assert.equal((await review(terms.id)).value.requestedTermsDays, 60);
 const large = await apply({ annualVolumeUsd: 250000, locations: [newYork] });
 assert.deepEqual([(await taskFor(large.id)).application.ruleId, (await taskFor(large.id)).nextContactDate], ['large', easternDay(5)]);
 const plain = await apply({ locations: [{ ...location, state: 'GA', zip: '30301' }] });
 assert.deepEqual([(await taskFor(plain.id)).ownerId, (await taskFor(plain.id)).nextContactDate, (await taskFor(plain.id)).application.ruleId], [ownerId, easternDay(3), null]);

 // 2. Past the deadline the open task escalates (priority 1, escalation person recorded); refresh keeps it escalated.
 const stored = JSON.parse((await h.db.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(task.id).first()).value_json);
 stored.application.deadline = stored.nextContactDate = easternDay(-1);
 await h.db.prepare('UPDATE bw_followups SET value_json=? WHERE id=?').bind(JSON.stringify(stored), task.id).run(); // stands in for the passing days
 task = await taskFor(first.id);
 assert.equal(task.priority, 1); assert.deepEqual(task.escalated, { since: easternDay(0), toId: ownerId }); assert.match(task.reason, /Escalated since .* until a decision \(approve, decline or withdrawal\) or an explicit closure/);
 await h.command('followup.refresh', {}, manager.who);
 task = await taskFor(first.id);
 assert.equal(task.status, 'open'); assert.equal(task.priority, 1); assert.ok(task.escalated);
 assert.equal((await review(first.id)).review.escalatedSince, easternDay(0));
 const termTask=await taskFor(terms.id), termValue=JSON.parse((await h.db.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(termTask.id).first()).value_json);
 termValue.application.deadline=easternDay(-1);await h.db.prepare('UPDATE bw_followups SET value_json=? WHERE id=?').bind(JSON.stringify(termValue),termTask.id).run();
 assert.equal((await taskFor(terms.id)).escalated.toId,manager.id,'an entitled manager can also receive escalation');

 // 3. The reviewer sends the reviewed prepared request: one generic status email (state and link, never the request text); the escalation persists.
 row = await review(first.id);
 row = await h.command('application.request-information', { id: row.id, revision: row.revision, reason: row.review.preparedRequest, duplicateReviews: [] }, manager.who);
 assert.deepEqual(row.statusEmail, { state: 'information requested', status: 'accepted' });
 assert.equal(statusMails(first.email).length, 1);
 const [notice] = statusMails(first.email);
 assert.match(notice, /status is now: information requested/); assert.ok(notice.includes(`/apply?application=${first.id}`)); assert.equal(notice.includes('resale'), false, 'the request text stays behind the applicant’s fresh code');
 const mine = await h.api('/api/barrow/applications/mine', undefined, first.session);
 assert.equal(mine.state, 'information requested'); assert.ok(mine.history.some(entry => entry.reason === prepared), 'the applicant reads the reviewed request in the portal');
 task = await taskFor(first.id);
 assert.equal(task.status, 'open'); assert.equal(task.priority, 1); assert.equal(task.escalated.since, easternDay(0), 'a queued email does not end the escalation'); assert.match(task.reason, /Information requested from the applicant/);
 // Moving the next contact date does not hide it: an escalated task stays due.
 await h.command('followup.update', { id: task.id, revision: task.revision, nextContactDate: easternDay(10) }, manager.who);
 assert.ok((await board({}, 'due')).some(row => row.sourceId === first.id));
 // Screening is unavailable: an upload cannot answer the request or change its review deadline.
 const refused=await h.api('/api/barrow/applications/respond', { revision: mine.revision, document: pdf }, {...first.session,status:503});
 assert.equal(refused.error.code,'APPLICATION_DOCUMENTS_UNAVAILABLE');
 assert.deepEqual(await h.api('/api/barrow/applications/mine',undefined,first.session),mine);
 task = await taskFor(first.id);
 assert.equal(task.status, 'open'); assert.ok(task.escalated); assert.match(task.reason, /Information requested from the applicant/);
 assert.equal(statusMails(first.email).length, 1);

 // 4. Only a recorded decision (or the applicant's withdrawal) ends it; approval sends one generic status email beside the invitation.
 row = await review(first.id);
 const approved = await h.command('application.approve', { id: row.id, revision: row.revision, reason: 'Trade criteria reviewed; approve without documents.', duplicateReviews: [], account: { pierCustomerId: products.customer.id, termsDays: 30, minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 2 }] } });
 assert.equal(approved.state, 'approved'); assert.deepEqual(approved.statusEmail, { state: 'approved', status: 'accepted' });
 assert.match(statusMails(first.email).at(-1), /status is now: approved/);
 task = await taskFor(first.id);
 assert.equal(task.status, 'closed'); assert.equal(task.resolution, 'Decision recorded: application approved.'); assert.equal(task.escalated, undefined);
 await h.command('followup.refresh', {});
 assert.equal((await taskFor(first.id)).status, 'closed', 'refresh never reopens a decided application');
 assert.deepEqual((await review(first.id)).statusEmails.map(mail => [mail.state, mail.status]), [['information requested', 'accepted'], ['approved', 'accepted']]);
 const declined = await review(large.id);
 await h.command('application.decline', { id: declined.id, revision: declined.revision, reason: 'Outside our trade criteria.', duplicateReviews: [] });
 assert.equal((await taskFor(large.id)).resolution, 'Decision recorded: application declined.');
 assert.deepEqual(statusMails(large.email).map(text => [/status is now: declined/.test(text), text.includes('criteria')]), [[true, false]]);
 const view = await h.api('/api/barrow/applications/mine', undefined, terms.session);
 await h.api('/api/barrow/applications/respond', { action: 'withdraw', revision: view.revision }, terms.session);
 assert.equal((await taskFor(terms.id)).resolution, 'Decision recorded: application withdrawn.');
 assert.deepEqual(statusMails(terms.email), [], 'a withdrawal is the applicant’s own change');

 // 5. Explicit closure by a person stands: later activity never reopens it.
 let open = (await board()).find(row => row.sourceId === plain.id);
 await h.command('followup.update',{id:open.id,revision:open.revision,ownerId:manager.id},manager.who);
 open=(await board()).find(row=>row.id===open.id);assert.equal(open.ownerId,manager.id);
 await h.command('followup.update', { id: open.id, revision: open.revision, close: true, resolution: 'Reviewer explicitly closed the application task.' }, manager.who);
 assert.equal((await taskFor(plain.id)).status, 'closed');
 await h.command('followup.refresh', {});
 assert.equal((await taskFor(plain.id)).status, 'closed');
 // Narrowing closes every task door on the next request; saved rules re-check recipients and fall back to the owner.
 managerGrant=await h.command('staff.update',{userId:manager.id,revision:managerGrant.revision,policy:{...managerPolicy,entitlements:[]},reason:'Remove application review.'})
 assert.deepEqual(await board(manager.who),[]);
 await h.command('followup.update',{id:open.id,revision:open.revision,ownerId:ownerId},{...manager.who,status:403});
 assert.equal((await h.request('/api/barrow/export/followups.csv',manager.who)).status,200);
 assert.equal((await (await h.request('/api/barrow/export/followups.csv',manager.who)).text()).includes(first.id),false);
 const rerouted=await apply({name:'Synthetic rerouted applicant',ein:'34-5678901'});assert.equal((await taskFor(rerouted.id)).ownerId,ownerId);
 await save({status:400},{revision:saved.revision});
 const audit = (await h.api('/api/barrow/audit?limit=200')).events.map(event => event.action);
 for (const action of ['application.task-opened', 'application.task-updated', 'application.task-closed', 'application.routing-saved', 'application.status-email']) assert.ok(audit.includes(action), action);
});
