import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {faireFixture,ingestFixture} from './faire-fixture.mjs';
import {csvRows} from './line-sheet-fixture.mjs';
import {archive,installation,restore,accountValue,stock} from './harness.mjs';

test('Faire HTTP intake resumes paged reads, holds unknown SKUs for owner review and deduplicates source orders without collection',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'24');
 const f=await faireFixture(t,{bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}}),{h,state}=f;
 const account=(await h.api('/api/barrow/state')).accounts.find(row=>row.id==='cedar');
 await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,pierCustomerId:source.customer.id}});
 let native=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-mixed-1',lines:[{sku:'OAT-1',quantity:4}]});
 await h.command('order.submit',{orderId:native.id});native=await h.command('order.approve',{orderId:native.id});
 const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===native.pierOrderId);
 await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-mixed-2',lines:[{orderLineId:upstream.lines[0].id,quantity:'2'}]});
 const pierValues=report=>report.lines.map(row=>[row.orderId,row.ordered,row.shipped,row.allocated,row.outstanding,row.fillBasisPoints,row.warehouses]);
 const baseline=await h.api('/api/barrow/reports/fulfillment');
 assert.deepEqual(pierValues(baseline),[[native.id,'4','2','2','2',5000,[{warehouse:'New York',allocated:'2',shipped:'2'}]]]);
 await f.poll({},{status:409});assert.equal(state.requests.length,0);
 await f.configure(true,{status:409});await f.configure(false);let result=await f.preview();assert.deepEqual(result.orders.map(row=>row.source_id),['synthetic-barrow-order-1']);assert.equal(result.sync[0].cursor,'synthetic-barrow-cursor-2');assert.equal(result.orders[0].state,'review');
 await f.match(result.orders[0],{},{status:409});assert.equal((await f.read()).orders[0].state,'review');
 result=await f.match(result.orders[0],{'OAT-1':'OAT-1'});assert.equal(result.orders[0].state,'ingested');assert.equal(result.orders[0].matched.lines[0].quantity,3);assert.equal(result.orders[0].matched.lines[0].unitCents,6500);assert.equal(result.orders[0].source.commissionBps,1500);assert.deepEqual(result.orders[0].source.commissionFlatFee,{currency:'USD',amountMinor:1000});assert.deepEqual(result.orders[0].source.payoutFee,{currency:'USD',amountMinor:130});
 await f.preview({},{status:503});assert.equal((await f.read()).sync[0].cursor,'synthetic-barrow-cursor-2');assert.equal((await f.read()).orders.length,1);
 state.failSecond=false;result=await f.preview();assert.equal(state.requests.at(-1).cursor,'synthetic-barrow-cursor-2');assert.deepEqual(result.orders.map(row=>row.source_id),['synthetic-barrow-order-1','synthetic-barrow-order-2']);assert.equal(result.sync[0].complete,1);
 const initialReview=await h.api('/api/barrow/connectors/inspect',{revision:null,reason:'Owner compares original Faire orders before enabling intake.'});
 assert.deepEqual(initialReview.review.faire[0].totals,[{currency:'USD',sourceCount:2,nativeCount:1,sourceCents:29900,nativeCents:19500,differenceCents:10400}]);
 assert.deepEqual(initialReview.review.issues.filter(row=>row.kind.startsWith('unmapped')).map(row=>[row.record,row.kind]),[['synthetic-barrow-order-2','unmapped-customer'],['synthetic-barrow-order-2:synthetic-barrow-item-2','unmapped-item']]);
 await f.configure(true,{status:409});assert.equal((await f.read()).sync[0].enabled,0);
 const unknown=result.orders[1];assert.equal(unknown.state,'review');assert.equal(unknown.source.commissionBps,null);assert.equal(unknown.source.payoutFee,null);await f.match(unknown,{'UNKNOWN-1':'NOT-A-CATALOG-SKU'},{status:409});await f.match(unknown,{'UNKNOWN-1':'OAT-1'},{status:409},{revision:'stale'});await f.match(unknown,{'UNKNOWN-1':'OAT-1'},{status:409},{accountId:'foreign'});
 result=await f.match(unknown,{'UNKNOWN-1':'OAT-1'});assert.equal(result.orders[1].matched.lines[0].sku,'OAT-1');assert.equal(result.orders[1].matched.lines[0].unitCents,5200);assert.equal(result.orders[1].matched.lines[0].quantity,2);
 await f.configure();assert.equal((await f.match(unknown,{'UNKNOWN-1':'OAT-1'})).replayed,true);await f.poll({restart:true});await f.poll();result=await f.read();assert.deepEqual(result.orders.map(row=>[row.source_id,row.state,row.settlementOwner,row.collection]),[['synthetic-barrow-order-1','ingested','Faire','No Barrow collection'],['synthetic-barrow-order-2','ingested','Faire','No Barrow collection']]);
 assert.deepEqual(state.requests.map(row=>row.cursor),[null,'synthetic-barrow-cursor-2','synthetic-barrow-cursor-2',null,'synthetic-barrow-cursor-2',null,'synthetic-barrow-cursor-2',null,'synthetic-barrow-cursor-2',null,'synthetic-barrow-cursor-2']);assert.ok(state.requests.every(row=>row.method==='GET'&&row.path==='/external-api/v2/orders'&&row.limit==='50'));await h.command('card.prepare',{orderId:'synthetic-barrow-order-1'},{status:404});assert.equal(state.paymentRequests,0);assert.deepEqual((await h.api('/api/barrow/state')).orders.map(row=>row.id),[native.id]);assert.deepEqual((await h.api('/api/barrow/export.json')).cardpayments,[]);
 await h.command('account.erase',{accountId:'cedar',confirm:'ERASE'},{status:409});
 const report=await h.api('/api/barrow/reports/fulfillment?accountId=cedar');assert.deepEqual(pierValues(report),pierValues(baseline));assert.equal(report.status,'read');assert.equal(report.channelLines.length,2);assert.deepEqual(report.channelLines.map(line=>[line.orderId,line.ordered,line.shipped,line.warehouse,line.delivery]),[['synthetic-barrow-order-1','3','unknown','unknown','unknown'],['synthetic-barrow-order-2','2','unknown','unknown','unknown']]);assert.deepEqual((await h.api('/api/barrow/reports/fulfillment?accountId=foreign')).channelLines,[]);assert.deepEqual((await h.api('/api/barrow/reports/fulfillment?warehouse=New+York')).channelLines,[]);
 await f.configure(false);await f.poll({},{status:409});
 const owner=(await h.api('/api/barrow/state')).actor;
 let reviewRevision=initialReview.revision;const reviewedRevisions=[initialReview.revision];
 const inspect=async()=>{const result=await h.api('/api/barrow/connectors/inspect',{revision:reviewRevision,reason:'Owner compares original Faire orders before enabling intake.'});reviewRevision=result.revision;reviewedRevisions.push(result.revision);return result.review};
 state.orders[0].items[0].quantity=4;
 let review=await inspect(),brand=review.faire[0];
 assert.deepEqual(brand.authority,{orders:'Faire',prices:'Faire',settlement:'Faire',accounts:'Barrow',inventory:'Pier'});
 assert.deepEqual(brand.totals,[{currency:'USD',sourceCount:2,nativeCount:2,sourceCents:36400,nativeCents:29900,differenceCents:6500}]);
 assert.deepEqual(review.issues.filter(row=>row.kind!=='connection').map(row=>[row.record,row.kind,row.owner]),[['synthetic-barrow-order-1','source-difference',owner.id],['brand1:USD','value-difference',owner.id]]);
 assert.equal(brand.samples[0].lines[0].quantity,4);assert.equal(brand.enabled,false);
 await f.configure(true,{status:409});assert.equal((await f.read()).sync[0].enabled,0);
 result=await f.preview({restart:true});const current=result.orders[0];assert.equal(current.state,'review');await f.match(current,{'OAT-1':'OAT-1'});await f.preview();
 review=await inspect();brand=review.faire[0];assert.deepEqual(brand.totals,[{currency:'USD',sourceCount:2,nativeCount:2,sourceCents:36400,nativeCents:36400,differenceCents:0}]);assert.deepEqual(review.issues.filter(row=>row.kind!=='connection'),[]);
 const completedAt=new Date(Date.now()-600000).toISOString();await h.db.prepare('UPDATE bw_faire_sync SET completed_at=? WHERE brand=?').bind(completedAt,'brand1').run();
 review=await inspect();brand=review.faire[0];assert.equal(brand.lastSyncAt,completedAt);assert.ok(brand.lagSeconds>=600&&brand.lagSeconds<620);await f.configure();
 const priorSamples=brand.samples,priorRead=brand.lastSuccessfulAt,priorSync=brand.lastSyncAt;
 await h.configure({FAIRE_CONNECTIONS:undefined});review=await inspect();brand=review.faire[0];
 assert.equal(brand.state,'unavailable');assert.equal(brand.lastSuccessfulAt,priorRead);assert.equal(brand.lastSyncAt,priorSync);assert.deepEqual(brand.samples,priorSamples);
 assert.deepEqual(review.issues.filter(row=>row.kind==='faire-connection').map(row=>[row.record,row.owner]),[['brand1',owner.id]]);
 await f.configure(true,{status:503});await f.poll({restart:true},{status:503});assert.equal((await f.read()).orders.length,2);assert.equal((await f.read()).orders[0].matched.lines[0].quantity,4);
 assert.equal((await f.configure(false)).sync[0].enabled,0);assert.equal((await f.read()).orders.length,2);
 const events=(await h.api('/api/barrow/audit?person='+encodeURIComponent(owner.id))).events.filter(row=>row.action==='connector.inspected');assert.equal(events.length,5);assert.deepEqual(events.map(event=>event.revision).sort(),reviewedRevisions.sort());
 const auditCsv=await (await h.request('/api/barrow/audit.csv?person='+encodeURIComponent(owner.id))).text();for(const event of events){assert.equal(event.actorId,owner.id);assert.equal(event.actorKind,'human');assert.equal(event.source,'connector.review');assert.equal(event.reason,'Owner compares original Faire orders before enabling intake.');assert.ok(event.createdAt);assert.ok(event.revision);assert.ok(auditCsv.includes(event.id))}
 assert.ok(!JSON.stringify(review).includes('accessToken'));assert.ok(!auditCsv.includes('synthetic-barrow-1'));

});

test('Faire owner decisions are private, attributed, append-only and fully exported; restored reads require fresh consent',async t=>{
 const f=await faireFixture(t),{h}=f;
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const destinationRevision=hash([f.origin,'brand1']);
 const sources=[
  {id:'synthetic-barrow-order-1',retailerId:'synthetic-barrow-retailer-1',state:'PROCESSING',currency:'USD',lines:[{id:'synthetic-barrow-item-1',sourceSku:'OAT-1',quantity:3,unitCents:6500}],commissionBps:1500,commissionFlatFee:{currency:'USD',amountMinor:1000},payoutFee:{currency:'USD',amountMinor:130},shipments:[]},
  {id:'synthetic-barrow-order-2',retailerId:'synthetic-barrow-retailer-2',state:'NEW',currency:'USD',lines:[{id:'synthetic-barrow-item-2',sourceSku:'UNKNOWN-1',quantity:2,unitCents:5200}],commissionBps:null,commissionFlatFee:null,payoutFee:null,shipments:[]}
 ];
 const expected=[];
 const decision=async (value,run)=>{const from=Date.now();const result=await run();expected.push({...value,from,to:Date.now()});return result};
 const consent=async (enabled,reason)=>decision({action:'faire.configured',source:enabled?'faire.configure.enable':'faire.configure.disable',reason},()=>h.api('/api/barrow/faire/configure',{brand:'brand1',enabled,reason}));
 const reconciliationReason='Owner read and durably staged one source page; original Faire IDs deduplicate replay. No collection or inventory effect.';
 await consent(false,'synthetic-barrow-owner-initial-disable');
 let result=await decision({action:'faire.page-reconciled',source:'faire.poll',revision:hash([destinationRevision,null,'synthetic-barrow-cursor-2',[sources[0]]]),reason:reconciliationReason},()=>f.preview());
 assert.equal(result.orders[0].revision,hash(sources[0]));
 await decision({action:'faire.order-ingested',orderId:sources[0].id,source:'faire.match',revision:hash(sources[0]),reason:'synthetic-barrow-reviewed-first-mapping'},()=>f.match(result.orders[0],{'OAT-1':'OAT-1'},{},{reason:'synthetic-barrow-reviewed-first-mapping'}));
 f.state.failSecond=false;
 result=await decision({action:'faire.page-reconciled',source:'faire.poll',revision:hash([destinationRevision,'synthetic-barrow-cursor-2',null,[sources[1]]]),reason:reconciliationReason},()=>f.preview());
 assert.equal(result.orders[1].revision,hash(sources[1]));
 await decision({action:'faire.order-ingested',orderId:sources[1].id,source:'faire.match',revision:hash(sources[1]),reason:'synthetic-barrow-reviewed-second-mapping'},()=>f.match(result.orders[1],{'UNKNOWN-1':'OAT-1'},{},{reason:'synthetic-barrow-reviewed-second-mapping'}));
 const owner=(await h.api('/api/barrow/state')).actor;
 await consent(true,'synthetic-barrow-owner-enable-1');await consent(false,'synthetic-barrow-owner-disable');await consent(true,'synthetic-barrow-owner-enable-2');
 const decisions=(await h.api('/api/barrow/audit')).events.filter(row=>row.action==='faire.configured');
 assert.equal(decisions.length,4);assert.equal(new Set(decisions.map(row=>row.revision)).size,4,'Every consent decision needs a distinct revision');
 assert.deepEqual(decisions.map(row=>row.source),['faire.configure.enable','faire.configure.disable','faire.configure.enable','faire.configure.disable']);
 const buyer={as:await h.signIn('buyer@example.test')},admin={as:await h.signIn('admin@example.test','admin')},token=await h.api('/api/barrow/agent-token',{}),agent={headers:{authorization:'Bearer '+token.token},as:''};
 for(const who of [buyer,admin,agent]){
  await h.api('/api/barrow/faire',undefined,{...who,status:403});await f.configure(true,{...who,status:403});await f.poll({},{...who,status:403});await f.preview({},{...who,status:403});await h.api('/api/barrow/connectors',undefined,{...who,status:403});await h.api('/api/barrow/connectors/inspect',{reason:'Unauthorized'},{...who,status:403});await f.match((await f.read()).orders[0],{'OAT-1':'OAT-1'},{...who,status:403});
 }
 let events=[],cursor;do{const page=await h.api('/api/barrow/audit?'+new URLSearchParams({limit:'2',...(cursor?{cursor}:{})}));events.push(...page.events);cursor=page.nextCursor}while(cursor);
 const faire=events.filter(row=>row.action.startsWith('faire.'));assert.deepEqual(faire.map(row=>row.action).sort(),['faire.configured','faire.configured','faire.configured','faire.configured','faire.order-ingested','faire.order-ingested','faire.page-reconciled','faire.page-reconciled']);
 const assertDecision=row=>{
  const value=expected.find(value=>value.action===row.action&&value.reason===row.reason&&(value.revision===undefined||value.revision===row.revision));
  assert.ok(value,'Decision must match independently expected action, reason and exact reviewed revision');
  assert.equal(row.actorId,owner.id);assert.equal(row.actorKind,'human');assert.equal(row.source,value.source);assert.equal(row.reason,value.reason);
  assert.equal(row.orderId==='unrecorded'?undefined:row.orderId||undefined,value.orderId);
  if(value.revision!==undefined)assert.equal(row.revision,value.revision);else assert.match(row.revision,/^[a-f0-9]{64}$/);
  assert.match(row.createdAt,/^\d{4}-\d\d-\d\dT/);
  assert.ok(Date.parse(row.createdAt)>=value.from&&Date.parse(row.createdAt)<=value.to,'Decision time must fall within its own public request');
 };
 const decisionKey=row=>JSON.stringify([row.action,row.source,row.orderId==='unrecorded'?undefined:row.orderId||undefined,row.action==='faire.configured'?undefined:row.revision,row.reason]);
 const expectedKeys=expected.map(decisionKey).sort();
 assert.equal(expected.length,8);assert.deepEqual(faire.map(decisionKey).sort(),expectedKeys);for(const row of faire)assertDecision(row);
 const scoped=await h.api('/api/barrow/audit?accountId=cedar');assert.deepEqual(scoped.events.filter(row=>row.action==='faire.order-ingested').map(row=>row.orderId).sort(),['synthetic-barrow-order-1','synthetic-barrow-order-2']);
 const csv=await h.request('/api/barrow/audit.csv?limit=2');assert.equal(csv.status,200);const exportedAudit=csvRows(await csv.text()).rows.filter(row=>row.action.startsWith('faire.'));
 assert.equal(exportedAudit.length,8,'Complete CSV includes every Faire decision beyond the requested page size');
 assert.deepEqual(exportedAudit.map(row=>row.id),faire.map(row=>row.id));assert.deepEqual(exportedAudit.map(decisionKey).sort(),expectedKeys);for(const row of exportedAudit)assertDecision(row);
 for(const who of [buyer,agent]){await h.api('/api/barrow/audit',undefined,{...who,status:403});await h.api('/api/barrow/audit.csv',undefined,{...who,status:403})}
 await h.api('/api/barrow/audit',{reason:'Changed'},{method:'POST',status:404});await h.api('/api/barrow/audit/'+faire[0].id,undefined,{method:'DELETE',status:404});assert.equal((await h.api('/api/barrow/audit?orderId=synthetic-barrow-order-1')).events.filter(row=>row.action==='faire.order-ingested').length,1);
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.faireorders.length,2);assert.equal((await h.request('/api/barrow/export/faireorders.csv')).status,200);assert.equal((await h.api('/api/barrow/export.json',undefined,buyer)).faireorders,undefined);
 const lines=await archive(h),serialized=JSON.stringify(lines);assert.ok(!serialized.includes('synthetic-barrow-1'));assert.ok(!serialized.includes('accessToken'));
 const restored=await installation({bindings:f.bindings});t.after(()=>restored.close());await restore(restored,lines);assert.equal((await restored.api('/api/barrow/faire')).orders.length,2);assert.equal((await restored.api('/api/barrow/faire')).sync[0].enabled,0);await restored.api('/api/barrow/faire/poll',{brand:'brand1'},{status:409});
});

test('Faire refuses invalid credentials, foreign destinations and malformed source pages without advancing a checkpoint',async t=>{
 const f=await faireFixture(t),{h,state}=f;
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:'https://untrusted.example.test',accessToken:'synthetic-barrow-1'}})});await f.configure(true,{status:503});assert.equal(state.requests.length,0);
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-wrong'}})});await f.configure(false);await f.preview({},{status:503});await f.configure(true,{status:409});assert.equal((await f.read()).sync[0].cursor,null);assert.equal((await f.read()).orders.length,0);assert.equal(state.unauthorized,2);
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-2',appCredentials:'synthetic-barrow-3'}})});state.orders[0].items[0].quantity=-1;await f.preview({},{status:400});assert.equal((await f.read()).sync[0].cursor,null);assert.equal((await f.read()).orders.length,0);
 state.orders[0].items[0].quantity=3;await f.preview();assert.equal((await f.read()).orders.length,1);assert.equal((await f.read()).sync[0].cursor,'synthetic-barrow-cursor-2');
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-2',appCredentials:'synthetic-barrow-3'},brand2:{origin:f.origin,accessToken:'synthetic-barrow-4',appCredentials:'synthetic-barrow-3'}})});await h.api('/api/barrow/faire/configure',{brand:'brand2',enabled:false,reason:'Owner authorizes a separately granted OAuth brand.'});await h.api('/api/barrow/faire/preview',{brand:'brand2'});assert.deepEqual((await f.read()).orders.map(row=>[row.brand,row.source_id]),[['brand1','synthetic-barrow-order-1'],['brand2','synthetic-barrow-order-3']]);
 const count=state.requests.length;
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-2',appCredentials:'synthetic-barrow-3'},alias:{appCredentials:'synthetic-barrow-3',accessToken:'synthetic-barrow-2',origin:f.origin}})});
 await h.api('/api/barrow/faire/configure',{brand:'alias',enabled:true,reason:'Attempt a reordered alias of the same grant.'},{status:503});
 assert.equal(state.requests.length,count);assert.deepEqual((await f.read()).orders.map(row=>[row.brand,row.source_id]),[['brand1','synthetic-barrow-order-1'],['brand2','synthetic-barrow-order-3']]);
 await h.configure({FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin:f.origin,accessToken:'synthetic-barrow-2',appCredentials:'synthetic-barrow-3'},brand2:{origin:f.origin,accessToken:'synthetic-barrow-4',appCredentials:'synthetic-barrow-3'}})});
 state.failSecond=false;state.orders[1].retailer_id=state.orders[0].retailer_id;
 await f.preview();await h.command('account.save',{id:'birch',value:{...accountValue('synthetic-barrow-customer-2','birch@example.test'),name:'Birch Lane Pantry',minimumCents:0}});
 let rows=(await f.read()).orders.filter(row=>row.brand==='brand1');await f.match(rows[0],{'OAT-1':'OAT-1'});await f.match(rows[1],{'UNKNOWN-1':'OAT-1'},{},{accountId:'birch'});
 const reviewed=await h.api('/api/barrow/connectors/inspect',{revision:null,reason:'Owner reviews explicit retailer mappings without merging accounts.'});
 assert.deepEqual(reviewed.review.faire[0].duplicates,[{retailer:'synthetic-barrow-retailer-1',accounts:['birch','cedar']}]);
 assert.deepEqual(reviewed.review.issues.filter(row=>row.kind==='duplicate-customer').map(row=>row.record),['synthetic-barrow-retailer-1']);
 assert.equal((await h.api('/api/barrow/state')).accounts.length,2);
});

test('Faire refuses an older overlapping page after a newer complete poll returns to the same checkpoint',async t=>{
 const f=await faireFixture(t);await ingestFixture(f);
 f.state.orders[0].items[0].quantity=4;
 const held=f.holdNextPage(),older=f.h.request('/api/barrow/faire/poll',{method:'POST',body:{brand:'brand1',restart:true}});
 await held.ready;
 f.state.orders[0].items[0].quantity=8;
 await f.poll({restart:true});await f.poll();
 const reconciledBefore=(await f.h.api('/api/barrow/audit')).events.filter(row=>row.action==='faire.page-reconciled').map(row=>row.id);
 const before=await f.read();assert.equal(before.orders[0].source.lines[0].quantity,8);assert.equal(before.sync[0].cursor,null);assert.equal(before.sync[0].complete,1);
 held.release();const response=await older;assert.equal(response.status,409,'An older page must not overwrite a newer complete poll');
 const after=await f.read();assert.equal(after.orders[0].source.lines[0].quantity,8);assert.deepEqual(after.sync,before.sync);
 assert.deepEqual((await f.h.api('/api/barrow/audit')).events.filter(row=>row.action==='faire.page-reconciled').map(row=>row.id),reconciledBefore,'A refused stale page leaves no reconciliation event');
 const reviewed=await f.match(after.orders[0],{'OAT-1':'OAT-1'});assert.equal(reviewed.orders[0].matched.lines[0].quantity,8);
 const withdrawn=f.holdNextPage(),pending=f.h.request('/api/barrow/faire/poll',{method:'POST',body:{brand:'brand1',restart:true}});await withdrawn.ready;
 await f.configure(false);await f.configure(true);withdrawn.release();assert.equal((await pending).status,409,'A consent change invalidates every in-flight read');
 assert.equal((await f.read()).orders[0].source.lines[0].quantity,8);
});
