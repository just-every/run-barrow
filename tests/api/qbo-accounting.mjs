import assert from 'node:assert/strict';
import {qboFixture} from './qbo-fixture.mjs';
import {archive,restore,installation,accountValue,activateStaff} from './harness.mjs';
import {verifiedRequest,erasurePreview,erasurePayload} from './retention-fixture.mjs';
export async function qboAccounting(t) {
 await qboOriginalBlockers(t);
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
 edge.currency='CAD';edge.token='2';run=await f.resume(await f.start());state=await f.workspace();observation=state.observations.find(o=>o.runId===run.id);
 statement=await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,buyer);assert.equal(statement.ledgerComparisons.find(r=>r.currency==='CAD').sources[0].status,'Currency mismatch');assert.equal(statement.ledgerComparisons.find(r=>r.currency==='USD').ledgerCents,0);
 // A human acknowledgment retains attribution; a later source revision creates fresh owned work.
 task=(await h.api('/api/barrow/followups?view=all')).tasks.find(r=>r.kind==='qbo');const acknowledged=await h.command('followup.update',{id:task.id,revision:task.revision,close:true,resolution:'Owner acknowledged this exact source revision after external review; native money is unchanged.'});assert.ok(acknowledged.resolvedBy&&acknowledged.resolvedAt);
 followups=await h.command('followup.refresh',{});assert.equal(followups.tasks.filter(r=>r.kind==='qbo'&&r.status==='open').length,1);assert.equal(followups.tasks.filter(r=>r.kind==='qbo'&&r.status==='closed').length,1);
 const sourceTask=followups.tasks.find(r=>r.kind==='qbo'&&r.status==='open');followups=await h.command('followup.refresh',{});assert.equal(followups.tasks.filter(r=>r.kind==='qbo'&&r.status==='open').length,1);assert.equal(followups.tasks.find(r=>r.id===sourceTask.id).status,'open');
 edge.currency='USD';edge.total=130;edge.balance=130;edge.token='3';await f.resume(await f.start());followups=await h.command('followup.refresh',{});assert.ok(followups.tasks.filter(r=>r.kind==='qbo').every(r=>r.status==='closed'));assert.match(followups.tasks.find(r=>r.id===sourceTask.id).resolution,/revision 3/);
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

// The original independent FIX verdict's public doors stay in the existing accounting journey.
async function qboOriginalBlockers(t) {
 const f=await qboFixture(t),{h,pier,order,edge}=f;
 await f.connect();await f.mappings();let run=await f.resume(await f.start());
 const observation=(await f.workspace()).observations.find(row=>row.runId===run.id);
 const other=await pier.command('party.save',{name:'Wren Market',kind:'customer'});
 await h.command('account.save',{id:'wren',value:{...accountValue(other.id,'synthetic-barrow-951@example.test'),name:'Wren Market'}});
 const policy={role:'finance',accounts:['wren'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0};
 const {who,grant}=await activateStaff(h,'synthetic-barrow-950@example.test',policy);
 let board=await h.command('followup.refresh',{}),original=board.tasks.find(row=>row.kind==='qbo');assert.ok(original.ownerId);
 const ownState=await h.api('/api/barrow/state',undefined,who);assert.deepEqual(ownState.accounts.map(row=>row.id),['wren']);
 assert.equal((await h.api('/api/barrow/followups?view=all',undefined,who)).tasks.some(row=>row.kind==='qbo'),false);
 assert.equal((await (await h.request('/api/barrow/export/followups.csv',who)).text()).includes('cedar'),false);
 assert.equal((await h.command('followup.refresh',{},who)).tasks.some(row=>row.kind==='qbo'),false);
 assert.equal((await h.request('/api/barrow/qbo/observations/'+observation.id,who)).status,404);
 await h.command('followup.update',{id:original.id,revision:original.revision,close:true,resolution:'Foreign task must not be mutable.'},{...who,status:404});
 assert.deepEqual((await h.api('/api/barrow/followups?view=all')).tasks.find(row=>row.id===original.id),original);
 let currentGrant=await h.command('staff.update',{userId:grant.userId,revision:grant.revision,policy:{...policy,accounts:['cedar']},reason:'Owner explicitly grants Cedar finance work.'});
 assert.ok((await h.api('/api/barrow/followups?view=all',undefined,who)).tasks.some(row=>row.id===original.id));
 assert.ok((await (await h.request('/api/barrow/export/followups.csv',who)).text()).includes('cedar'));
 await h.command('staff.update',{userId:grant.userId,revision:currentGrant.revision,policy,reason:'Owner narrows finance access back to Wren.'});
 assert.equal((await h.command('followup.refresh',{},who)).tasks.some(row=>row.kind==='qbo'),false);
 // Resolve the unlinked case, then a terms change must create exactly one current stale-mapping task.
 await h.command('qbo.link',{id:observation.id,revision:observation.revision,orderId:order.id,orderRevision:order.revision,reason:'Review exact original issued invoice.'});
 board=await h.command('followup.refresh',{});assert.ok(board.tasks.filter(row=>row.kind==='qbo').every(row=>row.status==='closed'));
 const a=await h.api('/api/barrow/accounts/by-id/cedar');const changed=await h.command('account.save',{id:a.id,revision:a.revision,value:{...a.value,termsDays:45}});
 assert.equal((await h.api('/api/barrow/statements/cedar?to=2026-11-06',undefined,f.buyer)).ledgerComparisons[0].sources[0].status,'Reference mapping missing or stale');
 board=await h.command('followup.refresh',{});let open=board.tasks.filter(row=>row.kind==='qbo'&&row.status==='open');assert.equal(open.length,1);assert.ok(open[0].ownerId);assert.equal(open[0].resolution,undefined);
 assert.equal((await h.command('followup.refresh',{})).tasks.filter(row=>row.kind==='qbo'&&row.status==='open').length,1);
 const mapping=(await f.workspace()).mappings.find(row=>row.kind==='Customer');
 await h.command('qbo.mapping',{kind:'Customer',sourceId:mapping.source_id,sourceToken:mapping.token,nativeId:'cedar',nativeRevision:changed.revision,revision:mapping.revision,reason:'Owner reviews the changed native commercial terms.'});
 board=await h.command('followup.refresh',{});assert.ok(board.tasks.filter(row=>row.kind==='qbo').every(row=>row.status==='closed'));
 // A reviewed USD55 correction matches the provider; a later USD5 correction is fresh work.
 edge.balance=75;await f.resume(await f.start());board=await h.command('followup.refresh',{});assert.equal(board.tasks.filter(row=>row.kind==='qbo'&&row.status==='open').length,1);
 const correct=(amountCents,sourceReference)=>h.command('credit.issue',{orderId:order.id,kind:'price-correction',sourceReference,lines:[{line:1,quantity:1,amountCents}],reason:'Owner reviews the original source price correction.'});
 const first=await correct(5500,'First reviewed correction'),firstDetail=await h.api('/api/barrow/credits/'+first.id);board=await h.command('followup.refresh',{});assert.ok(board.tasks.filter(row=>row.kind==='qbo').every(row=>row.status==='closed'));
 await correct(500,'Further reviewed correction');await f.resume(await f.start());
 let source=(await h.api('/api/barrow/reports/finance?asOf=2026-11-06')).ledgerReconciliation[0].sources[0];assert.deepEqual([source.status,source.nativeCents,source.ledgerCents],['Balance differs',7000,7500]);
 board=await h.command('followup.refresh',{});open=board.tasks.filter(row=>row.kind==='qbo'&&row.status==='open');assert.equal(open.length,1);assert.ok(open[0].ownerId);assert.equal(open[0].resolution,undefined);
 const taskId=open[0].id;await f.resume(await f.start());board=await h.command('followup.refresh',{});assert.deepEqual(board.tasks.filter(row=>row.kind==='qbo'&&row.status==='open').map(row=>row.id),[taskId]);
 // A later provider update supersedes current work truthfully, without duplicate open tasks.
 edge.token='1';edge.balance=80;await f.resume(await f.start());board=await h.command('followup.refresh',{});open=board.tasks.filter(row=>row.kind==='qbo'&&row.status==='open');assert.equal(open.length,1);assert.notEqual(open[0].id,taskId);assert.match(board.tasks.find(row=>row.id===taskId).resolution,/Superseded/);
 assert.deepEqual((await h.api('/api/barrow/orders/'+order.id)).invoice,order.invoice);
 assert.deepEqual(await h.api('/api/barrow/credits/'+first.id),firstDetail);
 await qboUnusedCustody(t);
}
async function qboUnusedCustody(t) {
 const f=await qboFixture(t),{h,pier}=f,party=await pier.command('party.save',{name:'Provider-only account',kind:'customer'});
 const initial=await h.command('account.save',{id:'provider-only',value:{...accountValue(party.id,'synthetic-barrow-952@example.test'),name:'Provider-only account'}});
 await f.connect();await h.command('qbo.references',{kind:'Customer',reason:'Review provider-only customer.'});
 const ref=(await f.workspace()).references.find(row=>row.kind==='Customer');
 await h.command('qbo.mapping',{kind:'Customer',sourceId:ref.source_id,sourceToken:ref.token,nativeId:initial.id,nativeRevision:initial.revision,revision:null,reason:'Bind actual provider-only native account.'});
 for(const [kind,target] of [['Item','OAT-1'],['Account','receivables'],['TaxCode','reviewed tax reference']])await f.map(kind,target);
 const run=await f.resume(await f.start()),observation=(await f.workspace()).observations.find(row=>row.runId===run.id);
 const original=await h.api('/api/barrow/qbo/observations/'+observation.id),before=await archive(h);
 await h.command('account.erase',{accountId:initial.id,confirm:'ERASE'});
 assert.equal((await h.request('/api/barrow/accounts/by-id/'+initial.id)).status,404);
 const replacementParty=await pier.command('party.save',{name:'Replacement company',kind:'customer'});
 const replacement=await h.command('account.save',{id:initial.id,value:{...accountValue(replacementParty.id,'synthetic-barrow-953@example.test'),name:'Replacement company'}});
 const buyer={as:await h.signIn(replacement.value.email)};
 assert.equal((await h.request('/api/barrow/qbo/observations/'+observation.id,buyer)).status,404);
 assert.deepEqual((await h.api('/api/barrow/export.json',undefined,buyer)).qboobservations,[]);
 assert.deepEqual((await h.api('/api/barrow/statements/'+initial.id+'?to=2026-11-06',undefined,buyer)).ledgerComparisons.flatMap(row=>row.sources),[]);
 const retained=(await f.workspace()).observations.find(row=>row.id===original.id);assert.deepEqual(retained,original);
 assert.ok(!(await f.workspace()).mappings.some(row=>row.kind==='Customer'));
 await h.command('qbo.mapping',{kind:'Customer',sourceId:ref.source_id,sourceToken:ref.token,nativeId:replacement.id,nativeRevision:replacement.revision,revision:null,reason:'Erased provider custody cannot transfer to the replacement.'},{status:409});
 await h.command('qbo.link',{id:observation.id,revision:observation.revision,orderId:f.order.id,orderRevision:f.order.revision,reason:'Retained erased observation cannot be linked again.'},{status:409});
 // Restore an archive predating deletion: mappings are excluded, so the independent journal's IDs matter.
 const restored=await installation();t.after(()=>restored.close());await restore(restored,before);
 assert.equal((await restored.request('/api/barrow/accounts/by-id/'+initial.id)).status,404);
 const fresh=await restored.command('account.save',{id:initial.id,value:{...replacement.value,pierCustomerId:'synthetic-barrow-954'}}),who={as:await restored.signIn(fresh.value.email)};
 assert.equal((await restored.request('/api/barrow/qbo/observations/'+observation.id,who)).status,404);
 assert.deepEqual((await restored.api('/api/barrow/export.json',undefined,who)).qboobservations,[]);
 assert.deepEqual((await restored.api('/api/barrow/qbo')).observations.find(row=>row.id===original.id),original);
 assert.ok((await restored.db.prepare('SELECT * FROM bw_qbo_erased').all()).results.some(row=>row.realm===ref.realm&&row.customer_id===ref.source_id));
}
