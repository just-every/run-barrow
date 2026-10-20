import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installation, accountValue, archive, restore } from './harness.mjs';

test('DATA-003 / DATA-001: owner review, legal holds, seven-year commercial floor, attributed PO erasure receipt and restore fence', async t => {
 const h=await installation();t.after(()=>h.close());
 const account=await h.command('account.save',{id:'cedar',value:accountValue('historical-pier-customer')});
 const buyer={as:await h.signIn(account.value.email)},admin={as:await h.signIn('admin@example.test','admin')};
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 for(const actor of [buyer,admin,agent]) {
  assert.equal((await h.request('/api/barrow/retention',actor)).status,403);
  await h.command('retention.settings',{reason:'Unauthorized setting'}, {...actor,status:403});
 }
 const unused=await h.command('account.save',{id:'unused',value:{...accountValue('historical-unused','unused@example.test'),name:'Unused separate business'}});
 const unusedHold=await h.command('retention.request',{accountId:unused.id,held:true,reason:'Preserve unused account pending review'});
 await h.command('account.erase',{accountId:unused.id,confirm:'ERASE'},{status:409});
 await h.command('retention.request',{accountId:unused.id,revision:unusedHold.revision,held:false,reason:'Owner released unused account hold'});
 await h.command('account.erase',{accountId:unused.id,confirm:'ERASE'});
 assert.equal((await h.api('/api/barrow/retention')).requests.length,0);
 const days={poDocuments:30,media:null,messages:90,commercialHistory:1};
 let policy=await h.command('retention.settings',{revision:null,days,reason:'Owner reviewed retention periods'});
 assert.deepEqual(policy.days,days);
 await h.command('retention.settings',{revision:null,days,reason:'Stale policy'}, {status:409});
 await h.command('retention.settings',{revision:policy.revision,days:{...days,poDocuments:0},reason:'Invalid days'}, {status:400});
 // Historical archive fixture: dates/financial events cannot be backdated through product commands.
 // All retention behavior below is exercised through authenticated public HTTP doors.
 const bytes=Buffer.from('%PDF-1.4 historical purchase order'),sha256=createHash('sha256').update(bytes).digest('hex');
 const at=days=>new Date(Date.now()-days*86400000).toISOString();
 for(const [id,status,age,financialAge] of [['old','draft',60,null],['fresh','draft',1,null],['commercial','approved',3000,5],['expired-commercial','approved',3000,3000]]) {
  const order={id,accountId:account.id,accountRevision:account.revision,customerName:account.value.name,reference:id,lines:[],totalCents:0,currency:'USD',termsDays:30,status,preparedBy:'historical',preparedAt:at(age),pierCustomerId:'historical-pier-customer',pierOrigin:'https://inventory.example.test',revision:id,document:{name:'po.pdf',type:'application/pdf',size:bytes.length,sha256,uploadedBy:'historical',uploadedAt:at(age)},...(financialAge!==null?{approvedAt:at(financialAge),invoice:{number:id,issuedAt:at(financialAge),dueAt:at(financialAge)}}:{})};
  await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id,account.id,JSON.stringify(order),id).run();
  await h.db.prepare('INSERT INTO bw_order_documents VALUES(?,?,?,?,?,?)').bind(id,'po.pdf','application/pdf',bytes.length,sha256,bytes.toString('base64')).run();
 }
 const before=await archive(h),original=await h.api('/api/barrow/orders/old');
 let review=await h.api('/api/barrow/retention');
 assert.deepEqual(review.documents.filter(row=>row.eligible).map(row=>row.orderId),['expired-commercial','old']);
 assert.equal(review.documents.find(row=>row.orderId==='commercial').reason,'Commercial evidence: seven-year minimum');
 const payload=row=>({orderId:row.orderId,sha256:row.sha256,revision:row.revision,policyRevision:policy.revision,confirm:'ERASE',reason:'Owner reviewed expired attachment'});
 const old=review.documents.find(row=>row.orderId==='old');
 const held=await h.command('retention.request',{accountId:account.id,held:true,reason:'Preserve pending legal review'});
 review=await h.api('/api/barrow/retention');assert.ok(review.documents.every(row=>row.held&&!row.eligible));
 assert.equal(review.requests[0].held,1);assert.equal(review.requests[0].revision,held.revision);
 await h.command('retention.erase-document',payload(old),{status:409});
 await h.command('account.erase',{accountId:account.id,confirm:'ERASE'},{status:409});
 assert.equal((await h.request('/api/barrow/orders/old/document',buyer)).status,200);
 await h.command('retention.request',{accountId:account.id,revision:held.revision,held:false,reason:'Attributed release after legal review'});
 await h.command('retention.erase-document',{...payload(old),sha256:'wrong'},{status:409});
 await h.command('retention.erase-document',{...payload(old),confirm:'no'},{status:400});
 for(const actor of [buyer,admin,agent])await h.command('retention.erase-document',payload(old),{...actor,status:403});
 const receipt=await h.command('retention.erase-document',payload(old));
 assert.equal(receipt.sha256,sha256);assert.equal(receipt.commercialHistory,'preserved');assert.ok(receipt.erasedBy);assert.ok(receipt.erasedAt);
 assert.equal((await h.request('/api/barrow/orders/old/document',buyer)).status,404);
 assert.deepEqual(await h.api('/api/barrow/orders/old'),original);
 for(const actor of [{},buyer]) {
  const exported=await h.api('/api/barrow/export.json',undefined,actor);
  assert.deepEqual(exported.documents.map(row=>row.orderId),['fresh','commercial','expired-commercial']);
  assert.equal(exported.manifest.counts.documents,3);
  const csv=await (await h.request('/api/barrow/export/documents.csv',actor)).text();
  assert.ok(!csv.includes('\"old\"'));assert.ok(csv.includes('expired-commercial'));
 }
 for(const id of ['fresh','commercial','expired-commercial'])assert.equal((await h.request(`/api/barrow/orders/${id}/document`,buyer)).status,200);
 await h.command('retention.erase-document',payload(old),{status:404});
 review=await h.api('/api/barrow/retention');assert.equal(review.receipts.length,1);assert.equal(review.receipts[0].actor_id,receipt.erasedBy);
 assert.equal(review.custody.inventory,'Pier retains its own inventory and order history; no erasure sent.');
 for(const kind of ['barrow','identity','inventory','accounting','mail','backups'])assert.ok(review.custody[kind]);
 const audit=await h.api('/api/barrow/audit?search=retention');
 assert.ok(JSON.stringify(audit).includes('retention.document-erased'));
 const after=await archive(h),target=await installation();t.after(()=>target.close());
 await restore(target,after);
 assert.equal((await target.request('/api/barrow/orders/old/document')).status,404);
 assert.deepEqual((await target.api('/api/barrow/retention')).receipts,review.receipts);
 const stale=await installation();t.after(()=>stale.close());
 await restore(stale,before,{status:400,laterJournal:{sourceIdentity:after[0].sourceIdentity,epoch:after[0].epoch,journal:after[0].journal}});
 assert.equal((await stale.api('/api/barrow/state')).orders.length,0);
});
