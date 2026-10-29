import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, archive, restore, activateStaff } from './harness.mjs';

const day = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 86400000));
const rule = (more = {}) => ({ id: 'spring', rep: 'avery', from: day(-1), rateBps: 1000, basis: 'acceptance', splits: [{ rep: 'avery', shareBps: 6000 }, { rep: 'blair', shareBps: 4000 }], ...more });
async function fixture(t, prices) {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const bindings = { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie };
 const h = await installation({ bindings }); t.after(() => h.close());
 let account = await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), assignedRep: 'avery', minimumCents: 0, ...(prices ? { prices } : {}) } });
 const buyer = { as: await h.signIn(account.value.email) };
 const place = async (reference, lines = [{ sku: 'OAT-1', quantity: 4 }]) => {
  const draft = await h.command('order.prepare', { accountId: account.id, reference, lines }, buyer);
  await h.command('order.submit', { orderId: draft.id }, buyer);
  return h.command('order.approve', { orderId: draft.id });
 };
 const ship = async (order, quantity) => {
  const upstream = (await pier.api('/api/pier/state')).orders.find(row => row.id === order.pierOrderId);
  return pier.command('dispatch.create', { orderId: upstream.id, shipmentReference: `SHIP-${order.id}`, lines: [{ orderLineId: upstream.lines[0].id, quantity: String(quantity) }] });
 };
 const receive = (shipment, quantity) => pier.command('return.create', { shipmentId: shipment.id, shipmentLineId: shipment.lines[0].id, locationId: products.location.id, quantity: String(quantity), reason: 'Received damaged merchandise' });
 return { h, pier, products, account, bindings, buyer, place, ship, receive };
}
const cents = rows => rows.map(row => [row.rep, row.grossCents, row.reversedCents, row.netCents]);

test('REP-004: dated split commissions keep approved discounts, original attribution and source-linked shipment/return cents through transfers, replay and restore; payment earnings require allocated principal', async t => {
 const { h, pier, account, bindings, buyer, place, ship, receive } = await fixture(t, [{ sku: 'OAT-1', unitCents: 6500, minQty: 1, pricing: { effectiveFrom: day(-1), effectiveTo: day(1), accountDiscountBps: 1000 } }]);
 const policy = await h.command('commission.settings', { revision: null, rules: [rule({ id: 'broad', rateBps: 5000 }), rule({ accountId: 'cedar', sku: 'OAT-1', from: day(0), to: day(0) }), rule({ id: 'future', accountId: 'cedar', sku: 'OAT-1', from: day(1), rateBps: 9000 })], reason: 'Approve spring territory split on discounted merchandise' });
 const original = await place('PO-COMMISSION-1');
 assert.equal(original.lines[0].lineCents, 23400);
 let report = await h.api('/api/barrow/reports/commissions');
 assert.deepEqual(cents(report.rows), [['avery', 1404, 0, 1404], ['blair', 936, 0, 936]]);
 assert.ok(report.rows.every(row => row.ruleId === 'spring' && row.ruleRevision === policy.revision && row.basisCents === 23400 && row.currency === 'USD'));
 const snapshotRows = structuredClone(report.rows);
 await h.command('order.approve', { orderId: original.id });
 assert.deepEqual((await h.api('/api/barrow/reports/commissions')).rows, snapshotRows);
 const shipment = await ship(original, 4), returned = await receive(shipment, 1);
 report = await h.api('/api/barrow/reports/commissions');
 assert.deepEqual(cents(report.rows), [['avery', 1404, 351, 1053], ['blair', 936, 234, 702]]);
 assert.ok(report.rows.every(row => row.shipmentIds.includes(shipment.id) && row.returnIds.includes(returned.id) && row.sourceOrderId === original.pierOrderId));
 const afterReturn = structuredClone(report.rows);
 // Transferring a profile and replacing policy does not reconstruct historical attribution.
 await h.command('account.save', { id: account.id, revision: account.revision, value: { ...account.value, assignedRep: 'nova' } });
 let current = await h.command('commission.settings', { revision: policy.revision, rules: [rule({ id: 'nova-shipped', rep: 'nova', basis: 'shipment', rateBps: 1250, splits: [{ rep: 'nova', shareBps: 10000 }] })], reason: 'Transfer future sales only to Nova' });
 assert.deepEqual((await h.api('/api/barrow/reports/commissions')).rows, afterReturn);
 const next = await place('PO-COMMISSION-2');
 report = await h.api('/api/barrow/reports/commissions?rep=nova');
 assert.deepEqual(cents(report.rows), [['nova', 0, 0, 0]]);
 const nextShipment = await ship(next, 2);
 report = await h.api('/api/barrow/reports/commissions?rep=nova');
 assert.deepEqual(cents(report.rows), [['nova', 1463, 0, 1463]]);
 await receive(nextShipment, 1);
 report = await h.api('/api/barrow/reports/commissions?rep=nova');
 assert.deepEqual(cents(report.rows), [['nova', 1463, 732, 731]]);
 assert.equal(report.rows[0].ruleRevision, current.revision);
 current = await h.command('commission.settings', { revision: current.revision, rules: [rule({ id: 'nova-paid', rep: 'nova', basis: 'payment', splits: [{ rep: 'nova', shareBps: 10000 }] })], reason: 'Earn on payment only when verified payment records exist' });
 const unpaid = await place('PO-COMMISSION-PAYMENT');
 report = await h.api('/api/barrow/reports/commissions');
 assert.deepEqual(cents(report.rows.filter(row => row.orderId === unpaid.id)), [['nova', 0, 0, 0]]);
 assert.match(JSON.stringify(report.notes), /not recorded/i);
 const csv = await (await h.request('/api/barrow/reports/commissions.csv?rep=avery')).text();
 assert.ok(csv.includes(original.id) && csv.includes(returned.id) && csv.includes(policy.revision) && csv.includes('1053'));
 assert.ok(!csv.includes(next.id));
 // All report reads and the downloadable statement are effect-free and never double reverse a return.
 assert.deepEqual((await h.api('/api/barrow/reports/commissions')).rows, report.rows);
 const target = await installation({ bindings }); t.after(() => target.close());
 await restore(target, await archive(h));
 assert.deepEqual((await target.api('/api/barrow/reports/commissions')).rows, report.rows);
 assert.deepEqual(await target.api('/api/barrow/commissions'), current);
 const audit = await h.api('/api/barrow/audit?search=commission.settings');
 assert.ok(audit.events.some(row => row.reason === 'Transfer future sales only to Nova' && row.revision === report.rows.find(row => row.orderId === next.id).ruleRevision));
 // Commission decisions stay within existing supplier authority, including order-shaped public doors.
 const { token } = await h.api('/api/barrow/agent-token', {});
 const agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 for (const actor of [buyer, agent]) {
  for (const path of ['/api/barrow/commissions', '/api/barrow/reports/commissions', '/api/barrow/reports/commissions.csv']) assert.equal((await h.request(path, actor)).status, 403);
  await h.command('commission.settings', { revision: current.revision, rules: [], reason: 'Unauthorized change' }, { ...actor, status: 403 });
 }
 assert.ok(!JSON.stringify(await h.api(`/api/barrow/orders/${original.id}`, undefined, buyer)).includes('shareBps'));
 assert.ok(!JSON.stringify(await h.api('/api/barrow/state', undefined, buyer)).includes('shareBps'));
 await pier.close();
 const blind = await h.api('/api/barrow/reports/commissions');
 assert.ok(blind.rows.every(row => row.netCents === null && row.reversedCents === null));
});

test('REP-004: policy validation, current revisions, effective precedence, mixed-unit allocation and full return/cancellation reversals conserve original cents', async t => {
 const { h, account, place, ship, receive } = await fixture(t, [{ sku: 'OAT-1', unitCents: 101, minQty: 1, units: [{ code: 'triple', baseQuantity: '3', unitCents: 301, packContents: 'Three base units' }] }]);
 let policy = await h.command('commission.settings', { revision: null, rules: [rule({ from: day(-1), to: day(1), rateBps: 3333, splits:[{rep:'avery',shareBps:3000},{rep:'blair',shareBps:3000},{rep:'casey',shareBps:4000}] })], reason: 'Approve exact split and mixed-unit terms' });
 await h.command('commission.settings', { revision: null, rules: [], reason: 'Stale policy' }, { status: 409 });
 for (const bad of [rule({ splits: [{ rep: 'avery', shareBps: 9999 }] }), rule({ from: '2026-02-30' }), rule({ rateBps: 10001 }), rule({ basis: 'invoice' }), rule({ splits: [{ rep: 'avery', shareBps: 5000 }, { rep: 'avery', shareBps: 5000 }] })]) await h.command('commission.settings', { revision: policy.revision, rules: [bad], reason: 'Invalid rule' }, { status: 400 });
 const mixed = await place('PO-MIXED', [{ sku: 'OAT-1', quantity: 3 }, { sku: 'OAT-1', unit: 'triple', quantity: 1 }]);
 let report = await h.api('/api/barrow/reports/commissions');
 assert.equal(report.rows.reduce((sum, row) => sum + row.grossCents, 0), 201);
 const shipment = await ship(mixed, 6); await receive(shipment, 3);
 report = await h.api('/api/barrow/reports/commissions');
 // Half-up returned merchandise: 152 + 151 cents. Remaining line bases 151 + 150 earn 50 + 50 cents.
 assert.equal(report.rows.reduce((sum, row) => sum + row.netCents, 0), 100);
 assert.ok(report.rows.every(row=>row.reversedCents>=0&&row.netCents<=row.grossCents));
 await receive(shipment, 3);
 report = await h.api('/api/barrow/reports/commissions');
 assert.equal(report.rows.reduce((sum, row) => sum + row.netCents, 0), 0);
 assert.equal(report.rows.reduce((sum, row) => sum + row.reversedCents, 0), 201);
 const cancelled = await place('PO-CANCEL-COMMISSION', [{ sku: 'OAT-1', quantity: 3 }]);
 await h.command('order.cancel', { orderId: cancelled.id, reason: 'Buyer cancelled before shipment' });
 const cancelledRows = (await h.api('/api/barrow/reports/commissions')).rows.filter(row => row.orderId === cancelled.id);
 assert.ok(cancelledRows.length > 0 && cancelledRows.every(row => row.netCents === 0));
 assert.equal(cancelledRows.reduce((sum, row) => sum + row.reversedCents, 0), 101);
 // Removing rules changes only later approvals; earlier records never gain an invented rule.
 await h.command('commission.settings', { revision: policy.revision, rules: [], reason: 'Retire plan for new approvals' });
 await place('PO-NO-RULE', [{ sku: 'OAT-1', quantity: 3 }]);
 const noRule = await h.api('/api/barrow/reports/commissions');
 const unmatched=noRule.rows.filter(row=>row.orderId!==mixed.id&&row.orderId!==cancelled.id);
 assert.ok(unmatched.length>0&&unmatched.every(row=>row.ruleId===null&&row.netCents===null));
});


test('rep performance: real assignment transfer and return preserve both private statements, activity goals, source metrics and reconciled manager payroll', async t=>{
 const {h,pier,account,buyer,ship,receive}=await fixture(t);
 const staffPolicy=(role,extra={})=>({role,accounts:[],warehouses:[],reports:['commissions'],discountLimitCents:0,stockExceptionLimitCents:0,...extra});
 const a=await activateStaff(h,'avery@example.test',staffPolicy('rep',{commissionRep:'avery'}));
 const b=await activateStaff(h,'blair@example.test',staffPolicy('rep',{commissionRep:'blair'}));
 const manager=await activateStaff(h,'morgan@example.test',staffPolicy('sales-manager',{accounts:'all',warehouses:'all'}));
 const assignment=await h.command('rep.assign',{userId:a.id,kind:'account',target:account.id,reason:'Avery owns this sales book.'},manager.who);
 let settings=await h.command('commission.settings',{revision:null,rules:[rule({basis:'shipment'})],reason:'Approved shipment basis and split.'},manager.who);
 const prepareAndPlace=async(who,reference,quantity)=>{
  const draft=await h.command('order.prepare',{accountId:account.id,reference,lines:[{sku:'OAT-1',quantity}]},who);
  await h.command('order.submit',{orderId:draft.id},buyer);
  return h.command('order.approve',{orderId:draft.id});
 };
 const original=await prepareAndPlace(a.who,'Avery original shipment',4),shipment=await ship(original,4);
 const targetInput={userId:a.id,from:day(-1),to:day(1),completedVisits:2,newAccounts:1,revision:null,reason:'Prioritize two completed showroom visits and one new company.'};
 for(const who of [a.who,b.who,manager.who,buyer])await h.command('rep.target.save',targetInput,{...who,status:403});
 const goalAdmin={as:await h.signIn('director@example.test','admin')};
 const mailBeforeGoals=h.mail.requests.length;
 let goal=await h.command('rep.target.save',targetInput);
 await h.command('rep.target.save',targetInput,{status:409});
 goal=await h.command('rep.target.save',{...targetInput,revision:goal.revision,completedVisits:3,reason:'Administrator revised this activity plan.'},goalAdmin);
 assert.equal(h.mail.requests.length,mailBeforeGoals);
 const targetExport=await h.api('/api/barrow/export.json');assert.equal(targetExport.reptargets[0].revision,goal.revision);assert.equal(targetExport.manifest.counts.reptargets,1);
 assert.equal((await h.api('/api/barrow/export.json',undefined,buyer)).reptargets,undefined);
 await h.api('/api/barrow/export/reptargets.csv',undefined,{...manager.who,status:403});
 let visit=await h.command('visit.schedule',{accountId:account.id,kind:'showroom',date:day(0),time:'10:30',agenda:'Show the spring collection.'},a.who);
 visit=await h.command('visit.record',{id:visit.id,revision:visit.revision,note:'Buyer reviewed the full range.',status:'completed'},a.who);
 let quote=await h.command('quote.request',{accountId:account.id,lines:[{sku:'OAT-1',quantity:2}]},a.who);
 quote=await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,validUntil:day(1),lines:[{sku:'OAT-1',quantity:2}],reason:'Current agreed prices.'},a.who);
 await h.command('quote.accept',{quoteId:quote.id,revision:quote.revision,number:1},buyer);
 const period=`from=${day(-1)}&to=${day(1)}`;
 const before=await h.api('/api/barrow/reports/rep-performance?'+period,undefined,manager.who);
 const aBefore=before.rows.find(row=>row.userId===a.id);
 assert.equal(aBefore.workload.primaryAccounts,1);assert.equal(aBefore.visits.completed,1);assert.equal(aBefore.accounts.new,1);
 assert.deepEqual(aBefore.quotes.acceptanceRate,{numerator:1,denominator:1,bps:10000});
 assert.ok(aBefore.sources.some(source=>source.id===visit.id&&source.kind==='visit'));
 assert.ok(aBefore.sources.some(source=>source.id===quote.id&&source.kind==='quote'));
 assert.equal(before.targets.find(row=>row.userId===a.id).completedVisits,3);assert.equal(before.canEditTargets,false);
 const own=await h.api('/api/barrow/reports/rep-performance?'+period,undefined,a.who);
 assert.ok(own.rows.every(row=>row.userId===a.id||row.userId===null&&row.rep==='avery'));
 assert.ok(own.targets.every(row=>row.userId===a.id));assert.equal(own.reps.length,0);
 for(const suffix of ['', '.csv']){
  await h.api('/api/barrow/reports/rep-performance'+suffix+'?'+period+'&userId='+b.id,undefined,{...a.who,status:403});
  await h.api('/api/barrow/reports/rep-performance'+suffix+'?'+period+'&rep=blair',undefined,{...a.who,status:403});
  for(const who of [buyer,{as:''}])assert.equal((await h.request('/api/barrow/reports/rep-performance'+suffix+'?'+period,who)).status,who.as===''?401:403);
 }
 await h.command('rep.transfer',{id:assignment.id,revision:assignment.revision,toUserId:b.id,reason:'Transfer future access and attribution to Blair.'},manager.who);
 settings=await h.command('commission.settings',{revision:settings.revision,rules:[rule({rep:'blair',basis:'shipment',splits:[{rep:'blair',shareBps:10000}]})],reason:'Blair owns new shipment commissions.'},manager.who);
 const next=await prepareAndPlace(b.who,'Blair after transfer',2);await ship(next,2);
 const returned=await receive(shipment,1);
 const statements=await h.api('/api/barrow/reports/commissions',undefined,manager.who);
 const old=statements.rows.filter(row=>row.orderId===original.id),fresh=statements.rows.filter(row=>row.orderId===next.id);
 assert.deepEqual(cents(old),[['avery',1560,390,1170],['blair',1040,260,780]]);
 assert.deepEqual(cents(fresh),[['blair',1300,0,1300]]);
 assert.ok(old.every(row=>row.returnIds.includes(returned.id)&&row.shipmentIds.includes(shipment.id)&&row.ruleRevision!==settings.revision));
 const payroll=statements.totals.reduce((sum,row)=>sum+row.netCents,0);
 assert.equal(payroll,statements.rows.reduce((sum,row)=>sum+row.netCents,0));assert.equal(payroll,3250);
 for(const label of ['avery','blair']){
  const response=await h.request('/api/barrow/reports/commissions.csv?rep='+label,manager.who),csv=await response.text();
  assert.equal(response.status,200);assert.ok(csv.includes(original.id));assert.ok(csv.includes(returned.id));
 }
 const bStatement=await h.api('/api/barrow/reports/commissions',undefined,b.who);assert.ok(bStatement.rows.every(row=>row.rep==='blair'));assert.equal(bStatement.totals[0].netCents,2080);
 await h.api('/api/barrow/reports/commissions?rep=avery',undefined,{...b.who,status:403});
 await h.api('/api/barrow/reports/commissions?accountId=cedar',undefined,{...a.who,status:403});
 assert.deepEqual((await h.api('/api/barrow/reports/commissions',undefined,a.who)).rows,[]);
 const after=await h.api('/api/barrow/reports/rep-performance?'+period,undefined,manager.who);
 assert.equal(after.rows.find(row=>row.userId===a.id).workload.primaryAccounts,0);assert.equal(after.rows.find(row=>row.userId===b.id).workload.primaryAccounts,1);
 const ownAfter=await h.api('/api/barrow/reports/rep-performance?'+period,undefined,a.who);
 assert.ok(ownAfter.rows.every(row=>row.sources.length===0));assert.equal(ownAfter.targets[0].revision,goal.revision);
 const csv=await(await h.request('/api/barrow/reports/rep-performance.csv?'+period,manager.who)).text();assert.ok(csv.includes(visit.id)&&csv.includes(quote.id)&&csv.includes(goal.id));
 assert.ok((await h.api('/api/barrow/audit?search=rep.target.save')).events.some(event=>event.revision===goal.revision&&event.reason.includes('No compensation effect')));
 const archived=await archive(h);
 const restored=await installation();t.after(()=>restored.close());await restore(restored,archived);
 const restoredGoals=await restored.request('/api/barrow/export/reptargets.csv');
 assert.equal(restoredGoals.status,200);assert.ok((await restoredGoals.text()).includes(goal.revision));
 await h.command('staff.revoke',{userId:b.id,revision:b.grant.revision,reason:'End performance and compensation access.'});
 assert.equal((await h.request('/api/barrow/reports/rep-performance?'+period,b.who)).status,403);
});
