import {erasurePreview,erasurePayload,verifiedRequest} from './retention-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';
import { cutoverFixture,cutoverWorkbook } from './cutover-fixture.mjs';

const header = 'accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty';

test('MOVE-007: a reconciled account/price rehearsal compares source and planned totals, refuses unknown SKUs and records the approved fingerprint, read-only until apply', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier);
 await pier.command('item.save', { sku: 'KALE-1', name: 'Kale chips', unit: 'case', packSize: '1' });
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 5000 } });
 const rows = sku => [
  `cedar,Cedar Street Pantry,buyer@example.test,${products.customer.id},30,5000,OAT-1,7000,2`,
  `birch,Birch Lane Grocer,birch@example.test,pier-birch,30,10000,OAT-1,6400,1`,
  `birch,Birch Lane Grocer,birch@example.test,pier-birch,30,10000,KALE-1,3100,6`,
  `wren,Wren & Co.,wren@example.test,pier-wren,14,0,${sku},2500,1`,
 ];
 const source = sku => `${header}\n${rows(sku).join('\n')}\n`;
 const effects = async () => ({ pier: (await pier.api('/api/pier/state')).commands?.length, state: JSON.stringify(await h.api('/api/barrow/state')), mail: (await h.db.prepare('SELECT COUNT(*) AS n FROM rer_mail_development_outbox').first()).n, audit: (await h.db.prepare('SELECT COUNT(*) AS n FROM bw_audit').first()).n });

 // The rehearsal: source against planned counts and USD sums; the unknown SKU is a named error.
 const before = await effects();
 const rehearsal = await h.api('/api/barrow/imports/preview', { csv: source('NOPE-1') });
 assert.deepEqual(rehearsal.reconciliation.source, { accounts: 3, prices: 4, unitCentsUsd: 7000 + 6400 + 3100 + 2500, minimumCentsUsd: 15000 });
 assert.deepEqual(rehearsal.reconciliation.planned, { accounts: 3, prices: 4, unitCentsUsd: 19000, minimumCentsUsd: 15000, create: 2, update: 1, unchanged: 0 });
 assert.equal(rehearsal.reconciliation.matches, true); assert.deepEqual(rehearsal.reconciliation.rejectedColumns, []);
 assert.deepEqual(rehearsal.reconciliation.unknownSkus, ['NOPE-1']);
 const unknown = rehearsal.diagnostics.find(row => row.code === 'IMPORT_SKU_UNKNOWN');
 assert.equal(unknown.severity, 'error'); assert.match(unknown.message, /Wren & Co\. \(wren\): SKU NOPE-1 is not an active item in the connected Pier catalog/);
 assert.equal((await h.api('/api/barrow/imports/apply', { csv: source('NOPE-1'), fingerprint: rehearsal.fingerprint }, { status: 409 })).error.code, 'IMPORT_DIAGNOSTICS');
 // Preview and a refused apply write nothing: no account, invitation, order or Pier command.
 assert.deepEqual(await effects(), before);

 // Correct the SKU in the source, rehearse again and apply with the owner's recorded approval of that fingerprint.
 const corrected = await h.api('/api/barrow/imports/preview', { csv: source('KALE-1') });
 assert.deepEqual(corrected.reconciliation.unknownSkus, []); assert.equal(corrected.diagnostics.filter(row => row.severity === 'error').length, 0);
 assert.match(corrected.reconciliation.skuCheck, /Checked against the connected Pier catalog/);
 let job = await h.api('/api/barrow/imports/apply', { csv: source('KALE-1'), fingerprint: corrected.fingerprint });
 for (let batch = 0; job.state !== 'completed' && batch < 5; batch++) job = await h.api('/api/barrow/imports/apply', { csv: source('KALE-1'), fingerprint: corrected.fingerprint });
 assert.equal(job.state, 'completed');
 const state = await h.api('/api/barrow/state');
 assert.deepEqual(state.accounts.map(account => [account.id, account.value.prices.length]), [['birch', 2], ['cedar', 1], ['wren', 1]]);
 const approvals = (await h.api('/api/barrow/audit')).events.filter(event => event.action === 'import.approved');
 assert.equal(approvals.length, 1); assert.equal(approvals[0].actorId, state.actor.id); assert.equal(approvals[0].revision, corrected.fingerprint);
 assert.match(approvals[0].reason, /3 accounts \(2 new, 1 updated, 0 unchanged\), 4 price rows, USD 19000 unit cents and 15000 minimum cents/);

 // With Pier unreachable the SKU check did not run, the rehearsal says so, and apply refuses.
 const cut = await installation({ bindings: { PIER_ORIGIN: 'http://127.0.0.1:9', PIER_SESSION: 'pier=offline' } }); t.after(() => cut.close());
 const blind = await cut.api('/api/barrow/imports/preview', { csv: source('KALE-1') });
 assert.match(blind.reconciliation.skuCheck, /Did not run: Pier was unreachable/);
 assert.ok(blind.diagnostics.some(row => row.code === 'IMPORT_SKU_UNCHECKED' && row.severity === 'error'));
 assert.equal((await cut.api('/api/barrow/imports/apply', { csv: source('KALE-1'), fingerprint: blind.fingerprint }, { status: 409 })).error.code, 'IMPORT_DIAGNOSTICS');
});

test('native cutover agent cites workbook and ledger mappings, reconciles missing releases, binds owner sign-off and preserves native edits',async t=>{
 const f=await cutoverFixture(t),{h,pier,input}=f;
 const native=async()=>({accounts:(await h.api('/api/barrow/export.json')).accounts,orders:(await h.api('/api/barrow/export.json')).orders,locations:(await h.api('/api/barrow/export.json')).locations,pier:(await pier.api('/api/pier/state')).orders,mail:h.mail.deliveries.length});
 const admin={as:await h.signIn('admin@example.test','admin')},buyer={as:f.buyer};
 const credential=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${credential.token}`}};
 const before=await native();
 await h.api('/api/barrow/cutover/preview',{...input,consent:false},{status:400});
 const first=await h.api('/api/barrow/cutover/preview',input);
 assert.equal(first.proposals.filter(row=>row.source.kind==='accounts').every(row=>!row.targetId&&row.candidates.length===2),true);
 assert.ok(first.issues.some(issue=>issue.includes('declares 2, export supplies 1')));
 assert.equal((await h.api('/api/barrow/cutover')).imports.length,0);
 assert.deepEqual(await native(),before);
 const corrected=await h.api('/api/barrow/cutover/preview',{...input,mappings:f.mappings});
 assert.deepEqual([...new Set(corrected.proposals.map(row=>row.source.kind))].sort(),['accounts','locations','orders','prices','receivables','releases','variants']);
 assert.equal(corrected.canApply,true);assert.equal(corrected.nativeAvailability.releases,'retained-history-only');assert.equal(corrected.totals.find(row=>row.kind==='releases').targetCount,0);
 const source=corrected.proposals.find(row=>row.source.kind==='receivables'&&row.source.currency==='USD');
 assert.equal(source.source.citation.artifact,'ledger.csv');assert.equal(source.source.citation.row,2);
 assert.equal(corrected.totals.find(row=>row.kind==='receivables'&&row.currency==='USD').sourceQuantity,null);
 assert.equal(source.source.amountCents,10000);assert.ok(source.differences.some(value=>value.includes('10000, target 13000')));
 assert.equal(corrected.proposals.find(row=>row.source.kind==='orders').source.citation.sheet,'Order/Quote');
 assert.deepEqual(corrected.totals.filter(row=>row.kind==='receivables').map(row=>[row.currency,row.sourceCents,row.targetCents,row.differenceCents]),[['CAD',14000,0,14000],['USD',10000,13000,-3000]]);
 assert.equal(corrected.provenance.costCents,0);assert.equal(corrected.provenance.contactCount,0);
 const accepted=f.approve(corrected);
 await h.api('/api/barrow/cutover/apply',{...accepted,approveBalances:false},{status:400});
 await h.api('/api/barrow/cutover/apply',{...accepted,workbook:cutoverWorkbook({quantity:'3'})},{status:409});
 await h.api('/api/barrow/cutover/preview',{...input,workbook:cutoverWorkbook({formula:true})},{status:400});
 await h.api('/api/barrow/cutover/preview',{...input,mappings:{...f.mappings,'prices:price-a':'birch/OAT-1'}},{status:400});
 for(const who of [admin,buyer,agent])for(const [path,body] of [['/api/barrow/cutover',undefined],['/api/barrow/cutover/preview',input],['/api/barrow/cutover/apply',accepted]])await h.api(path,body,{...who,status:403});
 const attempts=await Promise.all([h.api('/api/barrow/cutover/apply',accepted),h.api('/api/barrow/cutover/apply',accepted)]);
 const applied=attempts[0];assert.equal(attempts[1].id,applied.id);
 assert.equal(applied.state,'active');assert.equal(applied.approved_by,(await h.api('/api/barrow/state')).actor.id);
 assert.deepEqual(applied.source.artifacts.map(row=>row.base64),[input.workbook.base64,Buffer.from(input.ledger.csv).toString('base64')]);
 assert.equal(applied.report.approvedMappings,true);assert.equal(applied.report.approvedBalances,true);
 assert.deepEqual(await native(),before);
 assert.equal((await h.api('/api/barrow/cutover/apply',accepted)).id,applied.id);
 assert.equal((await h.api('/api/barrow/cutover')).imports.length,1);
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.cutovers[0].fingerprint,corrected.fingerprint);
 assert.equal((await h.api('/api/barrow/export.json',undefined,buyer)).cutovers,undefined);
 assert.equal((await h.request('/api/barrow/export/cutovers.csv',buyer)).status,403);
 assert.equal((await h.api('/api/barrow/cutover/'+applied.id+'/undo',{})).state,'undone');
 assert.equal((await h.api('/api/barrow/cutover/apply',accepted)).state,'undone');
 const nextInput={...input,mappings:f.mappings,runId:'synthetic-barrow-37'};
 const next=await h.api('/api/barrow/cutover/preview',nextInput);
 const nextAccepted={...f.approve(next),...nextInput};const active=await h.api('/api/barrow/cutover/apply',nextAccepted);
 const restored=await installation();t.after(()=>restored.close());await restore(restored,await archive(h));
 assert.equal((await restored.api('/api/barrow/cutover/'+active.id)).state,'undone');
 const staleInput={...nextInput,runId:'synthetic-barrow-38'},stale=await h.api('/api/barrow/cutover/preview',staleInput);
 await h.command('account.save',{id:'cedar',revision:f.cedar.revision,value:{...f.cedar.value,termsDays:45}});
 await h.api('/api/barrow/cutover/apply',{...f.approve(stale),...staleInput},{status:409});
 const refusal=await h.api('/api/barrow/cutover/'+active.id+'/undo',{}, {status:409});assert.equal(refusal.error.code,'NATIVE_EDIT_CONFLICT');
 assert.equal((await h.api('/api/barrow/accounts/by-id/cedar')).value.termsDays,45);
 await verifiedRequest(h,'cedar');const erasure=await erasurePreview(h);
 assert.equal(erasure.classes.find(row=>row.kind==='cutover source custody').count,2);
 await h.command('retention.erase-account',erasurePayload(erasure));
 for(const id of [applied.id,active.id]){const erased=await h.api('/api/barrow/cutover/'+id);assert.equal(erased.state,'erased');assert.deepEqual(erased.source,{});assert.deepEqual(erased.report,{})}
 const audit=(await h.api('/api/barrow/audit')).events.filter(row=>row.action==='cutover.approved');assert.equal(audit.length,2);assert.equal(audit[0].actorId,applied.approved_by);
});

test('owner rehearses and reconciles a source delta, signs scoped authority and exports only new orders; rollback preserves a dependent shipment',async t=>{
 const {deltaFixture}=await import('./delta-fixture.mjs');const f=await deltaFixture(t),{h,pier}=f;
 const path='/api/barrow/cutover/deltas';
 const effects=async()=>({native:await h.api('/api/barrow/orders/'+f.order.id),pier:(await pier.api('/api/pier/state')).orders,mail:h.mail.deliveries.length});
 const before=await effects();
 await h.api(path,{...f.baseline,freezeOrderEntry:false},{status:400});
 let session=await h.api(path,f.baseline),id=session.id;
 assert.equal(session.state,'rehearsal');assert.equal(session.source.records.filter(row=>row.kind==='orders').length,2);
 const prepare=()=>h.command('order.prepare',{accountId:'cedar',reference:'PO-POST-CUTOFF',lines:[{sku:'OAT-1',quantity:6}]},{as:f.buyer});
 await h.command('order.prepare',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:2}]},{as:f.buyer,status:409});
 await h.api(path+'/'+id+'/feed/run',{revision:session.revision,consent:true,reason:'No early export allowed.'},{status:409});
 const baselineFingerprint=session.fingerprint;
 session=await h.api(path+'/'+id+'/compare',{...f.delta,revision:session.revision});
 assert.notEqual(session.fingerprint,baselineFingerprint);
 const changed=session.report.changes.find(row=>row.sourceKey==='orders:order-a');assert.equal(changed.change,'changed');assert.equal(changed.before.quantity,2);assert.equal(changed.after.quantity,3);assert.equal(changed.after.citation.sheet,'Order/Quote');
 await f.write('products.csv','sku,name,unit,casePack,increment\nOAT-1,Toasted oat granola,case,6,2\nBAD-1,Invalid case,case,no,2\n');
 session=await h.api(path+'/'+id+'/feed/rehearse',{revision:session.revision,config:f.config,consent:true,reason:'Review the actual ERP source files in isolation.'});
 assert.equal(session.feed.rehearsal.products,1);assert.equal(session.feed.rehearsal.unresolvedErrors,1);
 const invalid=session.feed.rehearsal.files.find(row=>row.kind==='products');assert.equal(invalid.errors[0].row,3);assert.equal(invalid.errors[0].owner,(await h.api('/api/barrow/state')).actor.id);
 assert.deepEqual(await f.files(),[]);assert.deepEqual(await effects(),before);
 const signoff=()=>({revision:session.revision,fingerprint:session.fingerprint,cutoffAt:new Date().toISOString(),authorities:f.authorities,consent:true,reason:'Owner approved every source difference and per-record system; the bridge delivers only genuinely new accepted native orders.'});
 await h.api(path+'/'+id+'/signoff',signoff(),{status:409});
 await f.write('products.csv','sku,name,unit,casePack,increment\nOAT-1,Toasted oat granola,case,6,2\n');
 session=await h.api(path+'/'+id+'/feed/rehearse',{revision:session.revision,config:f.config,consent:true,reason:'Correct the malformed product row, retaining its owned report.'});
 assert.equal(session.feed.rehearsal.unresolvedErrors,0);assert.equal(session.feed.rehearsal.productRows[0].casePack,6);assert.equal(session.feed.rehearsal.productRows[0].increment,2);assert.equal(session.feed.rehearsal.atsRows[0].incomingDate,null);
 const replay=await h.api(path+'/'+id+'/feed/rehearse',{revision:session.revision,config:f.config,consent:true,reason:'Replay identical files without duplicating the isolated rows.'});assert.equal(replay.revision,session.revision);assert.equal(replay.feed.rehearsal.files.length,session.feed.rehearsal.files.length);
 await h.api(path+'/'+id+'/signoff',{...signoff(),authorities:{}},{status:400});
 const admin={as:await h.signIn('synthetic-barrow-8@example.test','admin')};await h.api(path,undefined,{...admin,status:403});await h.api(path,undefined,{as:f.buyer,status:403});
 session=await h.api(path+'/'+id+'/signoff',signoff());assert.equal(session.state,'signedoff');assert.ok(session.excludedOrderIds.includes(f.order.id));assert.deepEqual(session.authorities,f.authorities);
 assert.equal((await h.api('/api/barrow/accounts/by-id/cedar')).value.prices[0].casePack,6);
 await h.command('order.prepare',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:2}]},{as:f.buyer,status:409});
 const savedArchive=await archive(h),restored=await installation();t.after(()=>restored.close());await restore(restored,savedArchive);
 assert.equal((await restored.api(path+'/'+id)).state,'inactive');await restored.api(path+'/'+id+'/feed/run',{revision:(await restored.api(path+'/'+id)).revision,consent:true,reason:'Restored authority cannot export.'},{status:409});
 let order=await prepare();await h.command('order.submit',{orderId:order.id},{as:f.buyer});order=await h.command('order.approve',{orderId:order.id});
 const blockedWrite=f.sftp.pauseWrites();t.after(()=>f.sftp.resumeWrites());
 const sending=h.request(path+'/'+id+'/feed/run',{method:'POST',body:{revision:session.revision,consent:true,reason:'Deliver the first post-cutoff accepted order to the pinned ERP directory.'}});
 await Promise.race([blockedWrite,sending.then(()=>{throw Error('The destination run completed before its retained write.')}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('The destination did not reach its retained write.')),15000);timer.unref()})]);
 try {
  await h.api(path+'/'+id+'/rollback',{revision:session.revision,consent:true,resumeNativeOnly:true,reason:'An in-flight destination write must finish before rollback.'},{status:409});
  await h.command('order.cancel',{orderId:order.id,reason:'Do not race a retained external file snapshot.'},{status:409});
 }finally{f.sftp.resumeWrites()}
 const sent=await sending;assert.equal(sent.status,200);session=await sent.json();
 let names=await f.files();assert.equal(names.length,1);assert.equal(session.feed.deliveries.length,1);let delivery=session.feed.deliveries[0];assert.equal(delivery.orderId,order.id);assert.equal(delivery.state,'sent');
 const content=await f.readFile(names[0]);assert.ok(content.includes(order.id));assert.ok(!content.includes(f.order.id));assert.ok(content.includes('USD'));assert.ok(content.includes('39000'));assert.ok(content.includes('6500'));assert.equal(delivery.layout.id,f.config.layoutId);
 const {unlink}=await import('node:fs/promises'),{join}=await import('node:path');await unlink(join(f.sftp.directory,'exports',names[0]));
 session=await h.api(path+'/'+id+'/feed/run',{revision:session.revision,consent:true,reason:'Resend the missing unacknowledged file using its exact durable identity.'});assert.deepEqual(await f.files(),names);assert.equal(await f.readFile(names[0]),content);assert.equal(session.feed.deliveries[0].id,delivery.id);
 await f.ack(names[0]+'.ack.json',{identity:delivery.id,orderId:order.id,orderRevision:'synthetic-barrow-wrong-revision',status:'processed'});
 session=await h.api(path+'/'+id+'/feed/run',{revision:session.revision,consent:true,reason:'A mismatched acknowledgment leaves the exact handoff pending.'});assert.equal(session.feed.deliveries[0].error,'FEED_ACK_INVALID');assert.notEqual(session.feed.deliveries[0].state,'processed');
 await f.ack(names[0]+'.ack.json',{identity:delivery.id,orderId:order.id,orderRevision:delivery.orderRevision,status:'processed'});
 session=await h.api(path+'/'+id+'/feed/run',{revision:session.revision,consent:true,reason:'Reconcile the ERP processed acknowledgment with its exact delivery.'});assert.equal(session.feed.deliveries[0].state,'processed');
 const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===order.pierOrderId);
 await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-9',lines:[{orderLineId:upstream.lines[0].id,quantity:'1'}]});
 const current=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:current.id,revision:current.revision,value:{...current.value,termsDays:45}});
 const shipped=(await pier.api('/api/pier/state')).shipments;
 session=await h.api(path+'/'+id+'/rollback',{revision:session.revision,consent:true,resumeNativeOnly:true,reason:'Stop migration delivery while preserving the post-cutoff shipment and later native account edit.'});
 assert.equal(session.state,'rolledback');assert.ok(session.report.rollback.dispositions.some(row=>row.id===order.id&&row.disposition==='preserved-commercial-dependency'));assert.ok(session.report.rollback.dispositions.some(row=>row.id==='cedar'&&row.disposition==='preserved-native-edit'));
 assert.equal((await h.api('/api/barrow/accounts/by-id/cedar')).value.termsDays,45);assert.deepEqual((await pier.api('/api/pier/state')).shipments,shipped);assert.equal((await h.api('/api/barrow/orders/'+order.id)).pierOrderId,order.pierOrderId);
 await h.api(path+'/'+id+'/feed/run',{revision:session.revision,consent:true,reason:'Rolled-back delivery stays stopped.'},{status:409});assert.deepEqual(await f.files(),names);
 assert.ok(session.report.rollback.dispositions.some(row=>row.kind==='native-unit-mapping'&&row.id==='cedar'&&row.disposition==='blocked'));
 assert.equal((await h.api('/api/barrow/accounts/by-id/birch')).value.prices[0].casePack,undefined);
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.deltas.find(row=>row.id===id).state,'rolledback');assert.equal(exported.deltasources.filter(row=>row.session_id===id).length,2);assert.equal(JSON.stringify(exported.deltas).includes('synthetic-barrow-2'),false);
 const events=(await h.api('/api/barrow/audit')).events;assert.ok(events.some(row=>row.action==='delta.signedoff'));assert.ok(events.some(row=>row.action==='feed.export-reconciled'));
 await verifiedRequest(h,'cedar');const erasure=await erasurePreview(h);assert.equal(erasure.classes.find(row=>row.kind==='cutover source custody').count,1);await h.command('retention.erase-account',erasurePayload(erasure));
 const erased=await h.api(path+'/'+id);assert.equal(erased.state,'erased');assert.deepEqual(erased.source,{});assert.deepEqual(erased.feed,{});assert.deepEqual(erased.report,{});
 assert.ok((await h.api('/api/barrow/export.json')).deltasources.filter(row=>row.session_id===id).every(row=>row.source_json==='{}'&&row.report_json==='{}'));
});
