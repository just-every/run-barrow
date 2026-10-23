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
 assert.equal(corrected.canApply,true);
 const source=corrected.proposals.find(row=>row.source.kind==='receivables'&&row.source.currency==='USD');
 assert.equal(source.source.citation.artifact,'ledger.csv');assert.equal(source.source.citation.row,2);
 assert.equal(corrected.totals.find(row=>row.kind==='receivables'&&row.currency==='USD').sourceQuantity,null);
 assert.equal(source.source.amountCents,10000);assert.ok(source.differences.some(value=>value.includes('10000, target 13000')));
 assert.equal(corrected.proposals.find(row=>row.source.kind==='orders').source.citation.sheet,'Orders');
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
