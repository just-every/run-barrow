import assert from 'node:assert/strict';
import {xeroFixture} from './xero-fixture.mjs';
import {archive,restore,installation,accountValue} from './harness.mjs';
import {verifiedRequest,erasurePreview,erasurePayload} from './retention-fixture.mjs';
export async function xeroAccounting(t) {
 const f=await xeroFixture(t),{h,pier,edge,buyer,order}=f;
 // OAuth initiation, company binding and exact signed-in person authority through HTTP.
 await h.command('xero.begin',{tenant:'12345678-1234-4234-8234-123456789012',mode:'sandbox',consent:true,reason:'Buyer cannot authorize company accounting.'},{...buyer,status:403});
 edge.expiresIn=1;const authorization=await f.begin();assert.equal((await h.request(f.callback(authorization),buyer)).status,403);
 edge.tenant='99999999-9999-4999-8999-999999999999';assert.equal((await h.request(f.callback(authorization))).status,403);assert.equal((await f.workspace()).configured,false);edge.tenant='12345678-1234-4234-8234-123456789012';const renewed=await f.begin();authorization.authorizationUrl=renewed.authorizationUrl;
 {const response=await h.request(f.callback(authorization));assert.equal(response.status,303,JSON.stringify({body:await response.text(),calls:edge.calls}));}assert.equal((await h.request(f.callback(authorization))).status,403);
 const {token}=await h.api('/api/barrow/agent-token',{});const agent={as:'',headers:{authorization:'Bearer '+token}};
 assert.equal((await h.request('/api/barrow/xero',agent)).status,403);
 assert.equal((await h.api('/api/barrow/qbo')).configured,false);
 assert.ok(!JSON.stringify(await f.workspace()).includes('synthetic-barrow-903'));
 const consentUrl=new URL(authorization.authorizationUrl);assert.deepEqual(consentUrl.searchParams.get('scope').split(' ').sort(),['offline_access','accounting.transactions.read','accounting.contacts.read','accounting.settings.read'].sort());
 edge.expiresIn=3600;await f.mappings();assert.equal(edge.refreshes,1);
 // One bounded page persists 50 observations, then failure leaves the checkpoint unchanged and owned.
 edge.count=50;let run=await f.start();run=await f.resume(run);assert.equal(run.state,'reading');assert.equal(run.position,2);
 edge.fail=true;await h.command('xero.resume',{id:run.id,revision:run.revision,reason:'Resume interrupted read.'},{status:409});
 let state=await f.workspace(),failed=state.runs.find(row=>row.id===run.id);assert.equal(failed.position,2);assert.equal(failed.state,'failed');
 let diagnostic=await h.api('/api/barrow/diagnostics');assert.ok(diagnostic.accounting.some(row=>row.correlationId===run.id&&row.ownerId&&row.action.includes('resume')));
 assert.deepEqual((await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer)).ledgerComparisons,[]);
 edge.fail=false;run=await f.resume(failed);assert.equal(run.state,'complete');assert.equal(run.position,2);assert.equal((await f.workspace()).observations.length,50);
 assert.equal((await f.resume(run)).state,'complete');
 // New fully observed run is the sole current comparison basis. No native financial row is rewritten.
 edge.count=1;run=await f.resume(await f.start());state=await f.workspace();let observation=state.observations.find(o=>o.runId===run.id);
 await h.command('xero.link',{id:observation.id,revision:observation.revision,orderId:order.id,orderRevision:order.revision,reason:'Review exact existing native invoice against this company source.'});
 const duplicate=state.observations.find(o=>o.sourceId==='101');await h.command('xero.link',{id:duplicate.id,revision:duplicate.revision,orderId:order.id,orderRevision:order.revision,reason:'A second source invoice cannot reuse the same native invoice.'},{status:409});
 let statement=await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer);
 assert.deepEqual(statement.ledgerComparisons.map(r=>[r.currency,r.nativeCents,r.ledgerCents,r.differenceCents,r.status]),[['USD',13000,13000,0,'Matched']]);assert.equal(statement.ledgerComparisons[0].sources[0].sourceId,'100');
 for(const suffix of ['.csv','.pdf']){const output=await (await h.request('/api/barrow/statements/cedar'+suffix+'?to=2026-11-06',buyer)).text();assert.ok(output.includes('12345678-1234-4234-8234-123456789012')&&output.includes('100')&&output.includes('Matched'))}
 let finance=await h.api('/api/barrow/reports/finance?asOf=2026-11-06');assert.equal(finance.ledgerReconciliation[0].differenceCents,0);assert.ok((await (await h.request('/api/barrow/reports/finance.csv?asOf=2026-11-06')).text()).includes('12345678-1234-4234-8234-123456789012'));
 const party=await pier.command('party.save',{name:'Different company',kind:'customer'});const foreignEmail=['synthetic-barrow-908','example.test'].join('@');await h.command('account.save',{id:'foreign',value:{...accountValue(party.id,foreignEmail),name:'Different company'}});const foreign={as:await h.signIn(foreignEmail)};
 assert.equal((await h.request('/api/barrow/xero/observations/'+observation.id,foreign)).status,404);assert.equal((await h.request('/api/barrow/statements/cedar?to=2026-11-06',foreign)).status,404);
 assert.equal((await h.request('/api/barrow/xero/observations/'+observation.id,agent)).status,403);
 assert.deepEqual((await h.api('/api/barrow/statements/cedar?to=2026-11-05',undefined,buyer)).ledgerComparisons,[]);
 // A same-total source line edit is a conflict against the original reviewed basis.
 edge.quantity=1;edge.unitAmount=130;run=await f.resume(await f.start());state=await f.workspace();const edited=state.observations.find(o=>o.runId===run.id);
 assert.equal((await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer)).ledgerComparisons[0].sources[0].status,'Upstream issued invoice changed');
 await h.command('xero.link',{id:edited.id,revision:edited.revision,orderId:order.id,orderRevision:order.revision,reason:'A same-total line edit cannot silently replace the reviewed issued basis.'},{status:409});assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),order);
 edge.quantity=2;edge.unitAmount=65;
 // Upstream edits and partial settlement are visible conflicts; no payment or issued snapshot changes.
 edge.total=140;edge.balance=75;edge.token='1';edge.updated='2028-02-29T12:34:56.789Z';run=await f.resume(await f.start());state=await f.workspace();observation=state.observations.find(o=>o.runId===run.id);
 statement=await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer);
 assert.equal(statement.ledgerComparisons[0].differenceCents,5500);assert.equal(statement.ledgerComparisons[0].sources[0].status,'Upstream invoice total changed');assert.equal(statement.sections[0].closingCents,13000);
 await h.command('xero.link',{id:observation.id,revision:observation.revision,orderId:order.id,orderRevision:order.revision,reason:'Wrong total cannot overwrite issued native invoice.'},{status:409});assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),order);
 let followups=await h.command('followup.refresh',{});let task=followups.tasks.find(r=>r.kind==='xero');assert.ok(task.ownerId&&task.status==='open'&&task.sourceId==='100');
 followups=await h.command('followup.refresh',{});assert.equal(followups.tasks.filter(r=>r.kind==='xero').length,1);
 await h.command('followup.update',{id:task.id,revision:task.revision,contact:{outcome:'failed',note:'Source owner has not acknowledged the invoice difference.'}});assert.equal((await h.api('/api/barrow/followups?view=all')).tasks.find(r=>r.id===task.id).status,'open');
 // Currency mismatch remains isolated and no cross-currency aggregate is fabricated.
 edge.currency='CAD';edge.token='2';run=await f.resume(await f.start());state=await f.workspace();observation=state.observations.find(o=>o.runId===run.id);
 statement=await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer);assert.equal(statement.ledgerComparisons.find(r=>r.currency==='CAD').sources[0].status,'Currency mismatch');assert.equal(statement.ledgerComparisons.find(r=>r.currency==='USD').ledgerCents,0);
 // A human acknowledgment retains attribution; a later source revision creates fresh owned work.
 task=(await h.api('/api/barrow/followups?view=all')).tasks.find(r=>r.kind==='xero');const acknowledged=await h.command('followup.update',{id:task.id,revision:task.revision,close:true,resolution:'Owner acknowledged this exact source revision after external review; native money is unchanged.'});assert.ok(acknowledged.resolvedBy&&acknowledged.resolvedAt);
 followups=await h.command('followup.refresh',{});assert.equal(followups.tasks.filter(r=>r.kind==='xero'&&r.status==='open').length,1);assert.equal(followups.tasks.filter(r=>r.kind==='xero'&&r.status==='closed').length,1);
 const sourceTask=followups.tasks.find(r=>r.kind==='xero'&&r.status==='open');followups=await h.command('followup.refresh',{});assert.equal(followups.tasks.filter(r=>r.kind==='xero'&&r.status==='open').length,1);assert.equal(followups.tasks.find(r=>r.id===sourceTask.id).status,'open');
 edge.currency='USD';edge.total=130;edge.balance=130;edge.token='3';await f.resume(await f.start());followups=await h.command('followup.refresh',{});assert.ok(followups.tasks.filter(r=>r.kind==='xero').every(r=>r.status==='closed'));assert.match(followups.tasks.find(r=>r.id===sourceTask.id).resolution,/Source-linked Xero invoice/);
 // Native revision and source reference changes require explicit review before another page.
 run=await f.start();const account=await h.command('account.save',{id:'cedar',revision:f.account.revision,value:{...f.account.value,termsDays:45}});await h.command('xero.resume',{id:run.id,revision:run.revision,reason:'Stale native mapping must refuse.'},{status:409});
 edge.referenceToken='2';await h.command('xero.references',{kind:'Contact',reason:'Read changed source revision.'});await h.command('xero.mapping',{kind:'Contact',sourceId:'10',sourceToken:'0',nativeId:'cedar',nativeRevision:account.revision,revision:state.mappings.find(r=>r.kind==='Contact').revision,reason:'Stale source reference must refuse.'},{status:409});
 // Custody is independent of connection credentials; later erasure journals fence older archives.
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);assert.ok(exported.xeroobservations.length>=1);assert.deepEqual(exported.qboobservations,[]);
 const scopedCsv=await (await h.request('/api/barrow/export/xeroobservations.csv',buyer)).text();assert.ok(scopedCsv.includes('12345678-1234-4234-8234-123456789012')&&scopedCsv.includes('13000'));
 assert.equal((await h.request('/api/barrow/export/xeroobservations.csv',agent)).status,403);assert.ok(!JSON.stringify(exported).includes('must-not-retain'));
 const retentionPolicy=await h.command('retention.settings',{revision:null,days:{poDocuments:1,media:null,messages:null,commercialHistory:1,applicationRecords:null},reason:'Owner reviewed configured expiry while retaining provider financial floors.'});
 const documentReview=(await h.api('/api/barrow/retention')).documents.find(row=>row.orderId===order.id);assert.equal(documentReview.expiresAt,'2026-11-07T15:00:00.000Z');assert.equal(documentReview.commercialMinimumUntil,'2035-02-28T12:34:56.789Z');assert.equal(documentReview.eligible,false);
 await h.command('retention.erase-document',{orderId:order.id,sha256:order.document.sha256,revision:order.revision,policyRevision:retentionPolicy.revision,confirm:'ERASE',reason:'A provider financial event still protects this PO.'},{status:409});
 const before=await archive(h);assert.ok(!JSON.stringify(before).includes('synthetic-barrow-904'));const custody=await h.db.prepare('SELECT secret_cipher FROM bw_xero_connection').first();assert.ok(!JSON.stringify(before).includes(custody.secret_cipher));
 await verifiedRequest(h,'cedar',true);let preview=await erasurePreview(h);assert.ok(preview.custody.accounting.includes('Xero'));
 assert.equal(preview.items.find(item=>item.id==='order:'+order.id).floorUntil,'2035-02-28T12:34:56.789Z');
 await h.command('retention.erase-account',erasurePayload(preview),{status:409});await verifiedRequest(h);preview=await erasurePreview(h);await h.command('retention.erase-account',{...erasurePayload(preview),deleteOrderIds:[order.id]},{status:409});assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),order);const receipt=await h.command('retention.erase-account',erasurePayload(preview));assert.ok(receipt.actorId&&receipt.custody.accounting.includes('No Xero deletion'));
 assert.equal((await h.request('/api/barrow/xero/observations/'+observation.id,buyer)).status,401);
 const restored=await installation();t.after(()=>restored.close());await restore(restored,before);assert.equal((await restored.api('/api/barrow/xero')).configured,false);assert.ok((await restored.db.prepare('SELECT * FROM bw_xero_erased').all()).results.some(r=>r.contact_id==='10'));
 const raw=await restored.db.prepare('SELECT value_json FROM bw_orders WHERE id=?').bind(order.id).first();assert.ok(JSON.parse(raw.value_json).invoice);
 // Local disconnect ends read authority and provider revocation is reported accurately.
 state=await f.workspace();const oldConnection=await h.db.prepare('SELECT * FROM bw_xero_connection').first();const disconnected=await h.command('xero.disconnect',{revision:state.connection.revision,reason:'Owner revokes the original company connection.'});assert.equal(disconnected.providerRevoked,true);assert.equal(edge.revoked,true);assert.equal((await f.workspace()).configured,false);await h.command('xero.resume',{id:run.id,revision:run.revision,reason:'Revoked connection cannot resume.'},{status:409});
 await h.db.prepare('INSERT INTO bw_xero_connection VALUES(1,?,?,?,?,?,?,?)').bind(oldConnection.tenant,oldConnection.mode,oldConnection.state,oldConnection.secret_cipher,oldConnection.expires_at,oldConnection.revision,oldConnection.owner_id).run();
 const calls=edge.calls.length;await h.command('xero.references',{kind:'Contact',reason:'A D1 rewind cannot resurrect independently revoked credentials.'},{status:409});assert.equal(edge.calls.length,calls);assert.equal((await f.workspace()).connection.state,'reconnect');
 const audit=await (await h.request('/api/barrow/audit.csv?search=xero')).text();assert.ok(audit.includes('xero.mapping-reviewed')&&audit.includes('xero.invoice-linked')&&audit.includes('xero.disconnected'));assert.ok(!audit.includes('synthetic-barrow-903')&&!audit.includes('synthetic-barrow-904'));
}
