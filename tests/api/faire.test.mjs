import test from 'node:test';
import assert from 'node:assert/strict';
import {faireFixture,ingestFixture} from './faire-fixture.mjs';
import {archive,installation,restore} from './harness.mjs';

test('Faire HTTP intake resumes paged reads, holds unknown SKUs for owner review and deduplicates source orders without collection',async t=>{
 const f=await faireFixture(t),{h,state}=f;
 await f.poll({},{status:409});assert.equal(state.requests.length,0);
 await f.configure();let result=await f.poll();assert.deepEqual(result.orders.map(row=>row.source_id),['synthetic-barrow-order-1']);assert.equal(result.sync[0].cursor,'synthetic-barrow-cursor-2');assert.equal(result.orders[0].state,'review');
 await f.match(result.orders[0],{},{status:409});assert.equal((await f.read()).orders[0].state,'review');
 result=await f.match(result.orders[0],{'OAT-1':'OAT-1'});assert.equal(result.orders[0].state,'ingested');assert.equal(result.orders[0].matched.lines[0].quantity,3);assert.equal(result.orders[0].matched.lines[0].unitCents,6500);assert.equal(result.orders[0].source.commissionBps,1500);assert.deepEqual(result.orders[0].source.commissionFlatFee,{currency:'USD',amountMinor:1000});assert.deepEqual(result.orders[0].source.payoutFee,{currency:'USD',amountMinor:130});
 await f.poll({},{status:503});assert.equal((await f.read()).sync[0].cursor,'synthetic-barrow-cursor-2');assert.equal((await f.read()).orders.length,1);
 state.failSecond=false;result=await f.poll();assert.equal(state.requests.at(-1).cursor,'synthetic-barrow-cursor-2');assert.deepEqual(result.orders.map(row=>row.source_id),['synthetic-barrow-order-1','synthetic-barrow-order-2']);assert.equal(result.sync[0].complete,1);
 const unknown=result.orders[1];assert.equal(unknown.state,'review');assert.equal(unknown.source.commissionBps,null);assert.equal(unknown.source.payoutFee,null);await f.match(unknown,{'UNKNOWN-1':'NOT-A-CATALOG-SKU'},{status:409});await f.match(unknown,{'UNKNOWN-1':'OAT-1'},{status:409},{revision:'stale'});await f.match(unknown,{'UNKNOWN-1':'OAT-1'},{status:409},{accountId:'foreign'});
 result=await f.match(unknown,{'UNKNOWN-1':'OAT-1'});assert.equal(result.orders[1].matched.lines[0].sku,'OAT-1');assert.equal(result.orders[1].matched.lines[0].unitCents,5200);assert.equal(result.orders[1].matched.lines[0].quantity,2);
 assert.equal((await f.match(unknown,{'UNKNOWN-1':'OAT-1'})).replayed,true);await f.poll({restart:true});await f.poll();result=await f.read();assert.deepEqual(result.orders.map(row=>[row.source_id,row.state,row.settlementOwner,row.collection]),[['synthetic-barrow-order-1','ingested','Faire','No Barrow collection'],['synthetic-barrow-order-2','ingested','Faire','No Barrow collection']]);
 assert.deepEqual(state.requests.map(row=>row.cursor),[null,'synthetic-barrow-cursor-2','synthetic-barrow-cursor-2',null,'synthetic-barrow-cursor-2']);assert.ok(state.requests.every(row=>row.method==='GET'&&row.path==='/external-api/v2/orders'&&row.limit==='50'));await h.command('card.prepare',{orderId:'synthetic-barrow-order-1'},{status:404});assert.equal(state.paymentRequests,0);assert.equal((await h.api('/api/barrow/state')).orders.length,0);assert.deepEqual((await h.api('/api/barrow/export.json')).cardpayments,[]);
 await h.command('account.erase',{accountId:'cedar',confirm:'ERASE'},{status:409});
 const report=await h.api('/api/barrow/reports/fulfillment?accountId=cedar');assert.deepEqual(report.channelLines.map(line=>[line.orderId,line.ordered,line.shipped,line.warehouse,line.delivery]),[['synthetic-barrow-order-1','3','unknown','unknown','unknown'],['synthetic-barrow-order-2','2','unknown','unknown','unknown']]);assert.deepEqual((await h.api('/api/barrow/reports/fulfillment?accountId=foreign')).channelLines,[]);assert.deepEqual((await h.api('/api/barrow/reports/fulfillment?warehouse=New+York')).channelLines,[]);
 await f.configure(false);await f.poll({},{status:409});
});

test('Faire owner decisions are private, attributed, append-only and fully exported; restored reads require fresh consent',async t=>{
 const f=await faireFixture(t),{h}=f;await ingestFixture(f);
 const owner=(await h.api('/api/barrow/state')).actor;
 await f.configure(false);await f.configure(true);
 const decisions=(await h.api('/api/barrow/audit')).events.filter(row=>row.action==='faire.configured');
 assert.equal(decisions.length,3);assert.equal(new Set(decisions.map(row=>row.revision)).size,3,'Every consent decision needs a distinct revision');
 assert.deepEqual(decisions.map(row=>row.source),['faire.configure.enable','faire.configure.disable','faire.configure.enable']);
 const buyer={as:await h.signIn('buyer@example.test')},admin={as:await h.signIn('admin@example.test','admin')},token=await h.api('/api/barrow/agent-token',{}),agent={headers:{authorization:'Bearer '+token.token},as:''};
 for(const who of [buyer,admin,agent]){
  await h.api('/api/barrow/faire',undefined,{...who,status:403});await f.configure(true,{...who,status:403});await f.poll({},{...who,status:403});await f.match((await f.read()).orders[0],{'OAT-1':'OAT-1'},{...who,status:403});
 }
 let events=[],cursor;do{const page=await h.api('/api/barrow/audit?'+new URLSearchParams({limit:'2',...(cursor?{cursor}:{})}));events.push(...page.events);cursor=page.nextCursor}while(cursor);
 const faire=events.filter(row=>row.action.startsWith('faire.'));assert.deepEqual(faire.map(row=>row.action).sort(),['faire.configured','faire.configured','faire.configured','faire.order-ingested','faire.order-ingested','faire.page-reconciled','faire.page-reconciled']);
 for(const row of faire){assert.equal(row.actorId,owner.id);assert.equal(row.actorKind,'human');assert.ok(row.source.startsWith('faire.'));assert.ok(row.reason);assert.match(row.createdAt,/^\d{4}-\d\d-\d\dT/);assert.match(row.revision,/^[a-f0-9]{64}$/)}
 const scoped=await h.api('/api/barrow/audit?accountId=cedar');assert.deepEqual(scoped.events.filter(row=>row.action==='faire.order-ingested').map(row=>row.orderId).sort(),['synthetic-barrow-order-1','synthetic-barrow-order-2']);
 const csv=await h.request('/api/barrow/audit.csv');assert.equal(csv.status,200);const csvText=await csv.text();for(const row of faire){assert.ok(csvText.includes(row.id));assert.ok(csvText.includes(row.source));assert.ok(csvText.includes(row.reason));assert.ok(csvText.includes(row.revision));assert.ok(csvText.includes(row.createdAt));assert.ok(csvText.includes(row.actorId))}
 for(const who of [buyer,agent]){await h.api('/api/barrow/audit',undefined,{...who,status:403});await h.api('/api/barrow/audit.csv',undefined,{...who,status:403})}
 await h.api('/api/barrow/audit',{reason:'Changed'},{method:'POST',status:404});await h.api('/api/barrow/audit/'+faire[0].id,undefined,{method:'DELETE',status:404});assert.equal((await h.api('/api/barrow/audit?orderId=synthetic-barrow-order-1')).events.filter(row=>row.action==='faire.order-ingested').length,1);
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.faireorders.length,2);assert.equal((await h.request('/api/barrow/export/faireorders.csv')).status,200);assert.equal((await h.api('/api/barrow/export.json',undefined,buyer)).faireorders,undefined);
 const lines=await archive(h),serialized=JSON.stringify(lines);assert.ok(!serialized.includes('synthetic-barrow-1'));assert.ok(!serialized.includes('accessToken'));
 const restored=await installation({bindings:f.bindings});t.after(()=>restored.close());await restore(restored,lines);assert.equal((await restored.api('/api/barrow/faire')).orders.length,2);assert.equal((await restored.api('/api/barrow/faire')).sync[0].enabled,0);await restored.api('/api/barrow/faire/poll',{brand:'brand1'},{status:409});
});

test('Faire refuses invalid credentials, foreign destinations and malformed source pages without advancing a checkpoint',async t=>{
 const f=await faireFixture(t),{h,state}=f;
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:'https://untrusted.example.test',accessToken:'synthetic-barrow-1'}})});await f.configure(true,{status:503});assert.equal(state.requests.length,0);
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-wrong'}})});await f.configure();await f.poll({},{status:503});assert.equal((await f.read()).sync[0].cursor,null);assert.equal((await f.read()).orders.length,0);assert.equal(state.unauthorized,1);
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-2',appCredentials:'synthetic-barrow-3'}})});state.orders[0].items[0].quantity=-1;await f.poll({},{status:400});assert.equal((await f.read()).sync[0].cursor,null);assert.equal((await f.read()).orders.length,0);
 state.orders[0].items[0].quantity=3;await f.poll();assert.equal((await f.read()).orders.length,1);assert.equal((await f.read()).sync[0].cursor,'synthetic-barrow-cursor-2');
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-2',appCredentials:'synthetic-barrow-3'},brand2:{origin:f.origin,accessToken:'synthetic-barrow-4',appCredentials:'synthetic-barrow-3'}})});await h.api('/api/barrow/faire/configure',{brand:'brand2',enabled:true,reason:'Owner authorizes a separately granted OAuth brand.'});await h.api('/api/barrow/faire/poll',{brand:'brand2'});assert.deepEqual((await f.read()).orders.map(row=>[row.brand,row.source_id]),[['brand1','synthetic-barrow-order-1'],['brand2','synthetic-barrow-order-3']]);
 const count=state.requests.length;
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-2',appCredentials:'synthetic-barrow-3'},alias:{appCredentials:'synthetic-barrow-3',accessToken:'synthetic-barrow-2',origin:f.origin}})});
 await h.api('/api/barrow/faire/configure',{brand:'alias',enabled:true,reason:'Attempt a reordered alias of the same grant.'},{status:503});
 assert.equal(state.requests.length,count);assert.deepEqual((await f.read()).orders.map(row=>[row.brand,row.source_id]),[['brand1','synthetic-barrow-order-1'],['brand2','synthetic-barrow-order-3']]);

});

test('Faire refuses an older overlapping page after a newer complete poll returns to the same checkpoint',async t=>{
 const f=await faireFixture(t);await ingestFixture(f);
 f.state.orders[0].items[0].quantity=4;
 const held=f.holdNextPage(),older=f.h.request('/api/barrow/faire/poll',{method:'POST',body:{brand:'brand1',restart:true}});
 await held.ready;
 f.state.orders[0].items[0].quantity=8;
 await f.poll({restart:true});await f.poll();
 const before=await f.read();assert.equal(before.orders[0].source.lines[0].quantity,8);assert.equal(before.sync[0].cursor,null);assert.equal(before.sync[0].complete,1);
 held.release();const response=await older;assert.equal(response.status,409,'An older page must not overwrite a newer complete poll');
 const after=await f.read();assert.equal(after.orders[0].source.lines[0].quantity,8);assert.deepEqual(after.sync,before.sync);
 const reviewed=await f.match(after.orders[0],{'OAT-1':'OAT-1'});assert.equal(reviewed.orders[0].matched.lines[0].quantity,8);
 const withdrawn=f.holdNextPage(),pending=f.h.request('/api/barrow/faire/poll',{method:'POST',body:{brand:'brand1',restart:true}});await withdrawn.ready;
 await f.configure(false);await f.configure(true);withdrawn.release();assert.equal((await pending).status,409,'A consent change invalidates every in-flight read');
 assert.equal((await f.read()).orders[0].source.lines[0].quantity,8);
});
