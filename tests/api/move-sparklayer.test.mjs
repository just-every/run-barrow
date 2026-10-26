import test from 'node:test';
import assert from 'node:assert/strict';
import {sparkFixture} from './sparklayer-fixture.mjs';
import {archive,installation,restore} from './harness.mjs';

test('SparkLayer detailed activity reconciles original scoped order and quote history, maps source rules, applies once and exports private current-price lists',async t=>{
 const {h,pier,input,preview,apply}=await sparkFixture(t),mail=h.mail.deliveries.length,before=await pier.api('/api/pier/state');
 const initial=await h.api('/api/barrow/export.json'),report=await preview();
 assert.deepEqual(report.source,{documents:2,lines:2,lists:1,listLines:1});assert.equal(report.planned.documents,report.source.documents);assert.equal(report.planned.lists,report.source.lists);
 assert.deepEqual(report.totals,[{currency:'CAD',orders:0,quotes:1,totalCents:7000,shippingCents:0,quantity:1},{currency:'USD',orders:1,quotes:0,totalCents:13600,shippingCents:600,quantity:2}]);assert.deepEqual(report.plannedTotals,report.totals);assert.deepEqual(report.byStatus,[{currency:'CAD',type:'quote',status:'Open',count:1,totalCents:7000},{currency:'USD',type:'order',status:'Shipped',count:1,totalCents:13600}]);
 assert.equal(report.incomplete,true);assert.deepEqual(report.scope,input.scope);assert.match(report.missing.join(' '),/not a full tenant archive/);assert.equal(report.matches,true);
 assert.deepEqual(await h.api('/api/barrow/export.json').then(v=>({...v,manifest:{...v.manifest,exportedAt:initial.manifest.exportedAt}})),initial);
 assert.equal((await h.api('/api/barrow/imports/sparklayer')).history.length,0);
 assert.equal((await h.api('/api/barrow/imports/sparklayer/apply',{...input,fingerprint:'0'.repeat(64),reason:'Reviewed'},{status:409})).error.code,'IMPORT_CHANGED');
 const changed=structuredClone(input);changed.scope.filters=[];assert.equal((await h.api('/api/barrow/imports/sparklayer/apply',{...changed,fingerprint:report.fingerprint,reason:'Reviewed'},{status:409})).error.code,'IMPORT_CHANGED');
 const applied=await apply(report);assert.equal(applied.planned.newDocuments,2);assert.equal((await apply(report)).replayed,true);
 const history=(await h.api('/api/barrow/imports/sparklayer')).history;assert.equal(history.length,2);
 const order=history.find(doc=>doc.document_type==='order').value,quote=history.find(doc=>doc.document_type==='quote').value;
 assert.equal(order.tracking,'synthetic-barrow-1');assert.equal(order.shippingCents,600);assert.equal(order.status,'Shipped');assert.equal(order.originals[0].fields['Custom PO'],'PO-source-1');assert.equal(quote.type,'quote');assert.equal(quote.currency,'CAD');
 const account=await h.api('/api/barrow/accounts/by-id/cedar');assert.deepEqual([account.value.prices[0].casePack,account.value.prices[0].increment],[2,2]);
 const lists=(await h.api('/api/barrow/lists?accountId=cedar')).lists;assert.equal(lists.length,1);const list=lists[0];assert.equal(list.shared,false);assert.deepEqual(list.lines,[{sku:'OAT-1',quantity:'4'}]);
 await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.map(p=>({...p,unitCents:7000}))}});
 const cart=await h.command('cart.preview',{listId:list.id,mode:'replace'});assert.equal(cart.totalCents,28000);assert.equal(cart.ready,true);assert.equal(cart.lines[0].unitCents,7000);
 const buyer={as:await h.signIn('buyer@example.test')};assert.equal((await h.api('/api/barrow/lists?accountId=cedar',undefined,buyer)).lists.length,0);
 const shared=await h.command('list.save',{listId:list.id,revision:list.revision,shared:true});assert.equal((await h.command('cart.preview',{listId:shared.id},buyer)).totalCents,28000);
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.sourcehistory.length,2);assert.equal(exported.sourceimports.length,1);assert.equal(exported.lists.length,1);assert.equal(exported.manifest.counts.sourcehistory,2);assert.equal(exported.manifest.counts.lists,1);
 assert.match(await (await h.request('/api/barrow/export/sourcehistory.csv')).text(),/PO-source-1/);assert.match(await (await h.request('/api/barrow/export/lists.csv')).text(),/Store replenishment/);
 const mine=await h.api('/api/barrow/export.json',undefined,buyer);assert.equal(mine.sourcehistory,undefined);assert.equal(mine.sourceimports,undefined);assert.equal(mine.lists.length,1);
 const audit=(await h.api('/api/barrow/audit?action=import.approved')).events.find(e=>e.revision===report.fingerprint);assert.equal(audit.source,'sparklayer.apply');assert.equal(audit.actorKind,'human');assert.ok(audit.reason);
 assert.equal((await h.api('/api/barrow/state')).orders.length,0);assert.deepEqual((await pier.api('/api/pier/state')).orders,before.orders);assert.equal(h.mail.deliveries.length,mail+1);
 const again=await preview();assert.equal(again.planned.newDocuments,0);assert.equal(again.planned.newLists,0);await apply(again);assert.equal((await h.api('/api/barrow/imports/sparklayer')).history.length,2);
 const lines=await archive(h),restored=await installation();t.after(()=>restored.close());await restore(restored,lines);assert.equal((await restored.api('/api/barrow/imports/sparklayer')).history.length,2);assert.equal(restored.mail.deliveries.length,0);
});

test('SparkLayer refuses unmapped identities, malformed rows, conflicting replay and stale native approval; summary scope remains explicitly incomplete',async t=>{
 const {h,input,preview,apply}=await sparkFixture(t);
 for(const mutate of [p=>delete p.authority.products['product-1'],p=>delete p.authority.customers['store-1'],p=>p.activity.csv+='malformed\n',p=>p.activity.columns={shipping:'Missing shipping column'},p=>p.scope.from='2026-10-20',p=>p.activity.csv=p.activity.csv.replace(',2,65.00,',',0,65.00,'),p=>p.activity.csv=p.activity.csv.replace('136.00','1e2'),p=>p.activity.csv=p.activity.csv.replace('Order,USD','Invoice,USD')]) {
  const bad=structuredClone(input);mutate(bad);assert.equal((await h.request('/api/barrow/imports/sparklayer/preview',{method:'POST',body:bad})).status,400);
 }
 const report=await preview(),account=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:45}});
 assert.equal((await h.api('/api/barrow/imports/sparklayer/apply',{...input,fingerprint:report.fingerprint,reason:'Old approval'},{status:409})).error.code,'IMPORT_CHANGED');
 await apply(await preview());input.activity.csv=input.activity.csv.replace('136.00','137.00');const conflict=await preview();assert.equal(conflict.matches,false);assert.match(conflict.errors.join(' '),/changed after import/);assert.equal((await h.api('/api/barrow/imports/sparklayer/apply',{...input,fingerprint:conflict.fingerprint,reason:'Conflicting source'},{status:409})).error.code,'IMPORT_UNRESOLVED');
 input.tenant='synthetic-barrow-42';input.activity.mode='summary';input.activity.csv='ID,Customer ID,Type,Currency,Total\nsummary-1,store-1,Order,USD,13.00\n';input.lists=[];
 const summary=await preview();assert.equal(summary.source.lines,0);assert.match(summary.missing.join(' '),/no detailed lines/);await apply(summary);
 const buyer={as:await h.signIn('buyer@example.test')};for(const path of ['/api/barrow/imports/sparklayer','/api/barrow/export/sourcehistory.csv'])assert.equal((await h.request(path,buyer)).status,403);
 const {token}=await h.api('/api/barrow/agent-token',{});const agent={as:'',headers:{authorization:`Bearer ${token}`}};assert.equal((await h.request('/api/barrow/imports/sparklayer/preview',{...agent,method:'POST',body:input})).status,403);
});


test('SparkLayer account erasure retires shared originals and history atomically and prevents closed-account source reactivation',async t=>{
 const {h,preview,apply,input}=await sparkFixture(t);await apply(await preview());
 await h.command('account.erase',{accountId:'cedar',confirm:'ERASE'});
 const retired=await h.api('/api/barrow/imports/sparklayer');assert.equal(retired.history.length,0);assert.ok(retired.imports.every(row=>row.source_json==='{}'&&row.report_json==='{}'));
 assert.equal((await h.db.prepare('SELECT count(*) AS n FROM bw_import_lists').first()).n,0);
 assert.equal(JSON.stringify(await archive(h)).includes('PO-source-1'),false);
 const missing=await preview();assert.equal(missing.matches,false);assert.match(missing.errors.join(' '),/Missing mapped account/);
 assert.equal((await h.api('/api/barrow/imports/sparklayer/apply',{...input,fingerprint:missing.fingerprint,reason:'Do not revive erased custody'},{status:409})).error.code,'IMPORT_UNRESOLVED');
});
