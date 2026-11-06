import test from 'node:test';
import assert from 'node:assert/strict';
const {xeroFixture,xeroFinance}=await import('/workspace/run-barrow/tests/api/xero-fixture.mjs');
const {accountValue}=await import('/workspace/run-barrow/tests/api/harness.mjs');
const legacy='offline_access accounting.transactions.read accounting.contacts.read accounting.settings.read';
async function connected(t){const f=await xeroFixture(t);f.edge.scope=legacy;await f.connect();return f}
test('Privacy: account scope applies before finance task admission',async t=>{
 const f=await connected(t),{h,edge,order}=f;await f.mappings();let run=await f.resume(await f.start()),ob=(await f.workspace()).observations.find(row=>row.runId===run.id);
 await h.command('xero.link',{id:ob.id,revision:ob.revision,orderId:order.id,orderRevision:order.revision,reason:'Review issued source.'});
 edge.balance=75;await f.resume(await f.start());let task=(await h.command('followup.refresh',{})).tasks.find(row=>row.kind==='xero');
 await h.command('followup.update',{id:task.id,revision:task.revision,contact:{outcome:'failed',note:'synthetic-barrow-private-note'}});
 const party=await f.pier.command('party.save',{name:'Different company',kind:'customer'});
 await h.command('account.save',{id:'foreign',value:{...accountValue(party.id,['synthetic-barrow-912','example.test'].join('@')),name:'Different company'}});
 const {who}=await xeroFinance(h,['foreign']);
 assert.ok(!JSON.stringify(await h.api('/api/barrow/followups?view=all',undefined,who)).includes('synthetic-barrow-private-note'));
 assert.ok(!(await (await h.request('/api/barrow/export/followups.csv',who)).text()).includes('synthetic-barrow-private-note'));
});
test('Account references: an active bank without optional Code remains reviewable',async t=>{
 const f=await connected(t);f.edge.accountCode=null;await f.map('Account','reviewed bank reference');
 assert.ok((await f.workspace()).mappings.some(row=>row.kind==='Account'&&row.source_id==='12345678-1234-4234-8234-123456789030'));
});
test('Voided source: formerly matched invoice remains source-linked and owned',async t=>{
 const f=await connected(t),{h,edge,order,buyer}=f;await f.mappings();let run=await f.resume(await f.start()),ob=(await f.workspace()).observations.find(row=>row.runId===run.id);
 await h.command('xero.link',{id:ob.id,revision:ob.revision,orderId:order.id,orderRevision:order.revision,reason:'Review issued source.'});
 edge.invoiceStatus='VOIDED';await f.resume(await f.start());
 const rows=(await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer)).ledgerComparisons;
 assert.equal(rows[0].differenceCents,13000);assert.equal(rows[0].sources[0]?.sourceId,'100');
 assert.ok((await h.command('followup.refresh',{})).tasks.some(row=>row.kind==='xero'&&row.ownerId&&row.status==='open'));
});

test('OAuth: current granular read permissions connect a newly registered app',async t=>{
 const f=await xeroFixture(t),authorization=await f.begin(),response=await f.h.request(f.callback(authorization));
 assert.equal(response.status,303,await response.text());
});
