import assert from 'node:assert/strict';
import {qboFixture} from './qbo-fixture.mjs';
import {archive,restore,installation,accountValue} from './harness.mjs';
import {verifiedRequest,erasurePreview,erasurePayload} from './retention-fixture.mjs';
export async function qboAccounting(t) {
 const f=await qboFixture(t),{h,pier,edge,buyer,order}=f;
 // OAuth initiation, company binding and exact signed-in person authority through HTTP.
 await h.command('qbo.begin',{realm:'123456',mode:'sandbox',consent:true,reason:'Buyer cannot authorize company accounting.'},{...buyer,status:403});
 edge.expiresIn=1;const authorization=await f.begin();assert.equal((await h.request(f.callback(authorization),buyer)).status,403);
 assert.equal((await h.request(f.callback(authorization).replace('realmId=123456','realmId=999999'))).status,403);
 {const response=await h.request(f.callback(authorization));assert.equal(response.status,303,JSON.stringify({body:await response.text(),calls:edge.calls}));}assert.equal((await h.request(f.callback(authorization))).status,403);
 const {token}=await h.api('/api/barrow/agent-token',{});const agent={as:'',headers:{authorization:'Bearer '+token}};
 assert.equal((await h.request('/api/barrow/qbo',agent)).status,403);
 edge.expiresIn=3600;await f.mappings();assert.equal(edge.refreshes,1);
 // One bounded page persists 50 observations, then failure leaves the checkpoint unchanged and owned.
 edge.count=50;let run=await f.start();run=await f.resume(run);assert.equal(run.state,'reading');assert.equal(run.position,51);
 edge.fail=true;await h.command('qbo.resume',{id:run.id,revision:run.revision,reason:'Resume interrupted read.'},{status:409});
 let state=await f.workspace(),failed=state.runs.find(row=>row.id===run.id);assert.equal(failed.position,51);assert.equal(failed.state,'failed');
 let diagnostic=await h.api('/api/barrow/diagnostics');assert.ok(diagnostic.accounting.some(row=>row.correlationId===run.id&&row.ownerId&&row.action.includes('resume')));
 assert.deepEqual((await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer)).ledgerComparisons,[]);
 edge.fail=false;run=await f.resume(failed);assert.equal(run.state,'complete');assert.equal(run.position,51);assert.equal((await f.workspace()).observations.length,50);
 assert.equal((await f.resume(run)).state,'complete');
 // New fully observed run is the sole current comparison basis. No native financial row is rewritten.
 edge.count=1;run=await f.resume(await f.start());state=await f.workspace();let observation=state.observations.find(o=>o.runId===run.id);
 await h.command('qbo.link',{id:observation.id,revision:observation.revision,orderId:order.id,orderRevision:order.revision,reason:'Review exact existing native invoice against this company source.'});
 const duplicate=state.observations.find(o=>o.sourceId==='101');await h.command('qbo.link',{id:duplicate.id,revision:duplicate.revision,orderId:order.id,orderRevision:order.revision,reason:'A second source invoice cannot reuse the same native invoice.'},{status:409});
 let statement=await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer);
 assert.deepEqual(statement.ledgerComparisons.map(r=>[r.currency,r.nativeCents,r.ledgerCents,r.differenceCents,r.status]),[['USD',13000,13000,0,'Matched']]);assert.equal(statement.ledgerComparisons[0].sources[0].sourceId,'100');
 for(const suffix of ['.csv','.pdf']){const output=await (await h.request('/api/barrow/statements/cedar'+suffix+'?to=2026-11-06',buyer)).text();assert.ok(output.includes('123456')&&output.includes('100')&&output.includes('Matched'))}
 let finance=await h.api('/api/barrow/reports/finance?asOf=2026-11-06');assert.equal(finance.ledgerReconciliation[0].differenceCents,0);assert.ok((await (await h.request('/api/barrow/reports/finance.csv?asOf=2026-11-06')).text()).includes('123456'));
 const party=await pier.command('party.save',{name:'Different company',kind:'customer'});const foreignEmail=['synthetic-barrow-908','example.test'].join('@');await h.command('account.save',{id:'foreign',value:{...accountValue(party.id,foreignEmail),name:'Different company'}});const foreign={as:await h.signIn(foreignEmail)};
 assert.equal((await h.request('/api/barrow/qbo/observations/'+observation.id,foreign)).status,404);assert.equal((await h.request('/api/barrow/statements/cedar?to=2026-11-06',foreign)).status,404);
 assert.equal((await h.request('/api/barrow/qbo/observations/'+observation.id,agent)).status,403);
 assert.deepEqual((await h.api('/api/barrow/statements/cedar?to=2026-11-05',undefined,buyer)).ledgerComparisons,[]);
 // Upstream edits and partial settlement are visible conflicts; no payment or issued snapshot changes.
 edge.total=140;edge.balance=75;edge.token='1';edge.updated='2028-02-29T12:34:56.789Z';run=await f.resume(await f.start());state=await f.workspace();observation=state.observations.find(o=>o.runId===run.id);
 statement=await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer);
 assert.equal(statement.ledgerComparisons[0].differenceCents,5500);assert.equal(statement.ledgerComparisons[0].sources[0].status,'Upstream invoice total changed');assert.equal(statement.sections[0].closingCents,13000);
 await h.command('qbo.link',{id:observation.id,revision:observation.revision,orderId:order.id,orderRevision:order.revision,reason:'Wrong total cannot overwrite issued native invoice.'},{status:409});assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),order);
 let followups=await h.command('followup.refresh',{});let task=followups.tasks.find(r=>r.kind==='qbo');assert.ok(task.ownerId&&task.status==='open'&&task.sourceId==='100');
 followups=await h.command('followup.refresh',{});assert.equal(followups.tasks.filter(r=>r.kind==='qbo').length,1);
 await h.command('followup.update',{id:task.id,revision:task.revision,contact:{outcome:'failed',note:'Source owner has not acknowledged the invoice difference.'}});assert.equal((await h.api('/api/barrow/followups?view=all')).tasks.find(r=>r.id===task.id).status,'open');
 // Currency mismatch remains isolated and no cross-currency aggregate is fabricated.
 edge.currency='CAD';run=await f.resume(await f.start());state=await f.workspace();observation=state.observations.find(o=>o.runId===run.id);
 statement=await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer);assert.equal(statement.ledgerComparisons.find(r=>r.currency==='CAD').sources[0].status,'Currency mismatch');assert.equal(statement.ledgerComparisons.find(r=>r.currency==='USD').ledgerCents,0);
 // Native revision and source reference changes require explicit review before another page.
 run=await f.start();const account=await h.command('account.save',{id:'cedar',revision:f.account.revision,value:{...f.account.value,termsDays:45}});await h.command('qbo.resume',{id:run.id,revision:run.revision,reason:'Stale native mapping must refuse.'},{status:409});
 edge.referenceToken='2';await h.command('qbo.references',{kind:'Customer',reason:'Read changed source revision.'});await h.command('qbo.mapping',{kind:'Customer',sourceId:'10',sourceToken:'0',nativeId:'cedar',nativeRevision:account.revision,revision:state.mappings.find(r=>r.kind==='Customer').revision,reason:'Stale source reference must refuse.'},{status:409});
 // Custody is independent of connection credentials; later erasure journals fence older archives.
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);assert.ok(exported.qboobservations.length>=1);assert.ok(!JSON.stringify(exported).includes('must-not-retain'));
 const before=await archive(h);assert.ok(!JSON.stringify(before).includes('synthetic-barrow-904'));const custody=await h.db.prepare('SELECT secret_cipher FROM bw_qbo_connection').first();assert.ok(!JSON.stringify(before).includes(custody.secret_cipher));
 await verifiedRequest(h,'cedar',true);let preview=await erasurePreview(h);assert.ok(preview.custody.accounting.includes('QuickBooks'));
 assert.equal(preview.items.find(item=>item.id==='order:'+order.id).floorUntil,'2035-02-28T12:34:56.789Z');
 await h.command('retention.erase-account',erasurePayload(preview),{status:409});await verifiedRequest(h);preview=await erasurePreview(h);const receipt=await h.command('retention.erase-account',erasurePayload(preview));assert.ok(receipt.actorId&&receipt.custody.accounting.includes('No QuickBooks deletion'));
 assert.equal((await h.request('/api/barrow/qbo/observations/'+observation.id,buyer)).status,401);
 const restored=await installation();t.after(()=>restored.close());await restore(restored,before);assert.equal((await restored.api('/api/barrow/qbo')).configured,false);assert.ok((await restored.db.prepare('SELECT * FROM bw_qbo_erased').all()).results.some(r=>r.customer_id==='10'));
 const raw=await restored.db.prepare('SELECT value_json FROM bw_orders WHERE id=?').bind(order.id).first();assert.ok(JSON.parse(raw.value_json).invoice);
 // Local disconnect ends read authority and provider revocation is reported accurately.
 state=await f.workspace();const oldConnection=await h.db.prepare('SELECT * FROM bw_qbo_connection').first();const disconnected=await h.command('qbo.disconnect',{revision:state.connection.revision,reason:'Owner revokes the original company connection.'});assert.equal(disconnected.providerRevoked,true);assert.equal(edge.revoked,true);assert.equal((await f.workspace()).configured,false);await h.command('qbo.resume',{id:run.id,revision:run.revision,reason:'Revoked connection cannot resume.'},{status:409});
 await h.db.prepare('INSERT INTO bw_qbo_connection VALUES(1,?,?,?,?,?,?,?)').bind(oldConnection.realm,oldConnection.mode,oldConnection.state,oldConnection.secret_cipher,oldConnection.expires_at,oldConnection.revision,oldConnection.owner_id).run();
 const calls=edge.calls.length;await h.command('qbo.references',{kind:'Customer',reason:'A D1 rewind cannot resurrect independently revoked credentials.'},{status:409});assert.equal(edge.calls.length,calls);assert.equal((await f.workspace()).connection.state,'reconnect');
 const audit=await (await h.request('/api/barrow/audit.csv?search=qbo')).text();assert.ok(audit.includes('qbo.mapping-reviewed')&&audit.includes('qbo.invoice-linked')&&audit.includes('qbo.disconnected'));assert.ok(!audit.includes('synthetic-barrow-903')&&!audit.includes('synthetic-barrow-904'));
}
