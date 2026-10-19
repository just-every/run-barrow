import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
import { installation,stock,accountValue,archive,restore } from './harness.mjs';

test('Barrow wholesale public HTTP journey with real Pier and D1',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());
 const products=await stock(pier);
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let buyer,other,order,grant,account;
 await t.test('native invitation, customer isolation and direct-handler authorization',async()=>{
  assert.equal((await h.request('/api/barrow/state',{as:''})).status,401);
  account=await h.command('account.save',{id:'cedar',value:accountValue(products.customer.id)});
  await h.command('account.save',{id:'other',value:{...accountValue(products.customer.id,'other@example.test'),name:'Harbour Provisions',prices:[{sku:'OAT-1',unitCents:7200,minQty:1}]}});
  buyer=await h.signIn('buyer@example.test');other=await h.signIn('other@example.test');
  const state=await h.api('/api/barrow/state',undefined,{as:buyer});assert.equal(state.accounts.length,1);assert.equal(state.accounts[0].id,'cedar');
  await h.api('/api/barrow/catalogue?accountId=other',undefined,{as:buyer,status:404});
  await h.command('account.save',{id:'stolen',value:accountValue(products.customer.id)},{as:buyer,status:403});
  await h.command('account.save',{id:'changed',value:accountValue(products.customer.id)},{headers:{origin:'https://other.invalid'},status:403});
 });
 await t.test('agreed prices, minimums and stock validated server-side',async()=>{
  const c=await h.api('/api/barrow/catalogue?accountId=cedar',undefined,{as:buyer});assert.equal(c.items[0].available,'24');assert.equal(c.items[0].unitCents,6500);assert.equal(JSON.stringify(c).includes('7200'),false);
  for(const lines of [[{sku:'OAT-1',quantity:1}],[{sku:'OAT-1',quantity:25}],[{sku:'OTHER',quantity:2}],[{sku:'OAT-1',quantity:2.5}]]) await h.command('order.prepare',{accountId:'cedar',lines},{as:buyer,status:lines[0].quantity===2.5?400:409});
  order=await h.command('order.prepare',{accountId:'cedar',reference:'PO-October',lines:[{sku:'OAT-1',quantity:18}],unitCents:1},{as:buyer});assert.equal(order.totalCents,117000);
  const state=await pier.api('/api/pier/state');assert.equal(state.orders.length,0);
 });
 await t.test('agents prepare only and persons approve with recorded identity',async()=>{
  grant=await h.api('/api/barrow/agent-token',{});
  const agent={headers:{authorization:`Bearer ${grant.token}`},as:''};
  const directory=await mkdtemp(join(tmpdir(),'barrow-commands-'));let draft;
  try {
   const tokenFile=join(directory,'agent.txt'),cookieFile=join(directory,'pier.txt'),input=join(directory,'order.json');
   await writeFile(tokenFile,grant.token,{mode:0o600});await writeFile(cookieFile,pier.cookie,{mode:0o600});
   await writeFile(input,JSON.stringify({accountId:'cedar',lines:[{sku:'OAT-1',quantity:18}]}));
   await exec(process.execPath,[resolve('scripts/connect-pier.mjs'),'--origin',pier.origin,'--session-file',cookieFile],{cwd:directory});
   assert.ok((await readFile(join(directory,'.dev.vars'),'utf8')).includes('PIER_ORIGIN='));
   const command=resolve('scripts/barrow.mjs'),flags=['--origin',h.origin,'--token-file',tokenFile];
   const catalogue=JSON.parse((await exec(process.execPath,[command,'catalogue',...flags,'--account','cedar'])).stdout);assert.equal(catalogue.items[0].unitCents,6500);
   draft=JSON.parse((await exec(process.execPath,[command,'prepare-order',...flags,'--input',input])).stdout).result;
  }finally{await rm(directory,{recursive:true,force:true})}
  assert.match(draft.preparedBy,/^agent:/);
  await h.command('order.submit',{orderId:draft.id},{...agent,status:403});
  await h.command('order.approve',{orderId:draft.id},{...agent,status:403});
  await h.api('/api/barrow/imports/preview',{csv:'bad'},{...agent,status:403});
  await h.command('order.submit',{orderId:order.id},{as:other,status:404});
  order=await h.command('order.submit',{orderId:order.id},{as:buyer});
  await h.command('order.approve',{orderId:order.id},{as:buyer,status:403});
  order=await h.command('order.approve',{orderId:order.id});assert.equal(order.status,'approved');assert.ok(order.approvedBy);assert.ok(order.approvedAt);assert.ok(order.submittedBy);
  await h.command('order.approve',{orderId:order.id});assert.equal((await pier.api('/api/pier/state')).orders.length,1);
  await h.command('order.submit',{orderId:draft.id},{as:buyer});
  const short=await h.command('order.approve',{orderId:draft.id});assert.equal(short.status,'shortfall');
  assert.equal((await h.request(`/api/barrow/invoices/${short.id}.csv`)).status,409);
  const state=await pier.api('/api/pier/state');assert.equal(state.positions[0].available,'0');
  await h.api('/api/barrow/agent-token/revoke',{});await h.api('/api/barrow/state',undefined,{...agent,status:401});
 });
 await t.test('invoice export is stable exact-cent snapshot on agreed terms',async()=>{
  const first=await (await h.request(`/api/barrow/invoices/${order.id}.csv`,{as:buyer})).text();assert.ok(first.includes('117000'));assert.ok(first.includes('6500'));assert.ok(first.includes('PO-October'));assert.ok(first.includes('"USD"'));
  const days=(Date.parse(order.invoice.dueAt)-Date.parse(order.invoice.issuedAt))/86400000;assert.equal(days,30);
  await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:7,prices:[{sku:'OAT-1',unitCents:9900,minQty:1}]}});
  const second=await (await h.request(`/api/barrow/invoices/${order.id}.csv`,{as:buyer})).text();assert.equal(first,second);
  assert.equal((await h.request(`/api/barrow/invoices/${order.id}.csv`,{as:other})).status,404);
  await h.command('account.erase',{accountId:'cedar',confirm:'ERASE'},{status:409});
 });
 await t.test('move-in dry run, explicit review, journal, replay and guarded undo',async()=>{
  const fixture=await readFile('fixtures/trade-accounts.csv','utf8');
  const csv=[fixture.trim(),...Array.from({length:12},(_,i)=>`partner-${i},Trade partner ${i},partner-${i}@example.test,pier-partner-${i},30,0,OAT-1,6500,1`)].join('\n')+'\n';
  const preview=await h.api('/api/barrow/imports/preview',{csv});assert.equal((await h.api('/api/barrow/state')).accounts.length,2);
  await h.api('/api/barrow/imports/apply',{csv,fingerprint:'0'.repeat(64)},{status:409});
  let job=await h.api('/api/barrow/imports/apply',{csv,fingerprint:preview.fingerprint});assert.notEqual(job.state,'completed','a bounded job has remaining work');
  const partial=await h.api(`/api/barrow/imports/${job.id}`);assert.ok(partial.originals.length);const jobId=job.id;
  for(let batch=0;job.state!=='completed'&&batch<5;batch++) job=await h.api('/api/barrow/imports/apply',{csv,fingerprint:preview.fingerprint});
  assert.equal(job.id,jobId);assert.equal(job.state,'completed');
  const repeated=await h.api('/api/barrow/imports/apply',{csv,fingerprint:preview.fingerprint});assert.equal(repeated.id,job.id);
  const journal=await h.api(`/api/barrow/imports/${job.id}`);assert.ok(journal.originals.length);
  let undone=await h.api(`/api/barrow/imports/${job.id}/undo`,{});for(let batch=0;undone.state!=='undone'&&batch<5;batch++)undone=await h.api(`/api/barrow/imports/${job.id}/undo`,{});assert.equal(undone.state,'undone');assert.equal((await h.api('/api/barrow/state')).accounts.length,2);
 });
 await t.test('imports cannot reassign existing account identity or undo a native edit',async()=>{
  const csv='accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty\ncedar,Cedar Street Pantry,intruder@example.test,'+products.customer.id+',30,0,OAT-1,100,1\n';
  const preview=await h.api('/api/barrow/imports/preview',{csv});
  await h.api('/api/barrow/imports/apply',{csv,fingerprint:preview.fingerprint},{status:409});
  assert.equal((await h.api('/api/barrow/state',undefined,{as:buyer})).accounts[0].value.email,'buyer@example.test');
  const fresh=csv.replace('cedar,Cedar Street Pantry,intruder@example.test','native-change,Cedar Street Pantry,native@example.test');
  const plan=await h.api('/api/barrow/imports/preview',{csv:fresh});const job=await h.api('/api/barrow/imports/apply',{csv:fresh,fingerprint:plan.fingerprint});
  const native=(await h.api('/api/barrow/state')).accounts.find(a=>a.id==='native-change');
  await h.command('account.save',{id:native.id,revision:native.revision,value:{...native.value,name:'Owner corrected name'}});
  const refused=await h.api(`/api/barrow/imports/${job.id}/undo`,{},{status:409});assert.equal(refused.error.code,'NATIVE_EDIT_CONFLICT');
  assert.equal((await h.api('/api/barrow/state')).accounts.find(a=>a.id==='native-change').value.name,'Owner corrected name');
  await h.command('account.erase',{accountId:'native-change',confirm:'ERASE'});
 });
 await t.test('installation archive restores records and excludes sessions and agent secrets',async()=>{
  const data=await archive(h);const names=data[0].tables.map(x=>x.name);assert.ok(names.includes('bw_orders'));assert.ok(!names.includes('oa_sessions'));assert.ok(!names.includes('bw_agent_tokens'));
  const target=await installation();try{await restore(target,data);const state=await target.api('/api/barrow/state');assert.equal(state.orders.length,2);assert.equal(state.accounts.length,2);assert.equal(state.orders.find(o=>o.id===order.id).totalCents,117000);
   const again=await archive(target);assert.deepEqual(again.filter(x=>x.kind==='part').flatMap(x=>x.items),data.filter(x=>x.kind==='part').flatMap(x=>x.items));
  }finally{await target.close()}
 });
});

test('a draft whose prices moved is replaced by the order prepared from it, then approved and invoiced once',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());
 const products=await stock(pier);
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 const account=await h.command('account.save',{value:{...accountValue(products.customer.id),city:'Columbia',state:'SC'}});
 assert.doesNotMatch(account.id,/^[0-9a-f]{8}-/);
 const draft=await h.command('order.prepare',{accountId:account.id,reference:'Market week · booth',lines:[{sku:'OAT-1',quantity:4}]});
 await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:[{sku:'OAT-1',unitCents:6600,minQty:2}]}});
 assert.equal((await h.command('order.submit',{orderId:draft.id},{status:409})).error.code,'PRICE_CHANGED');
 const order=await h.command('order.prepare',{accountId:account.id,reference:draft.reference,replaces:draft.id,lines:[{sku:'OAT-1',quantity:4}]});
 const [prefix,number]=draft.id.split('-');assert.equal(order.id,`${prefix}-${Number(number)+1}`);
 assert.equal(order.replaces,draft.id);assert.equal(order.totalCents,26400);
 let state=await h.api('/api/barrow/state');
 assert.deepEqual(state.orders.filter(o=>o.status==='draft').map(o=>o.id),[order.id]);
 assert.equal(state.orders.find(o=>o.id===draft.id).supersededBy,order.id);
 await h.command('order.prepare',{accountId:account.id,replaces:draft.id,lines:[{sku:'OAT-1',quantity:4}]},{status:409});
 await h.command('order.submit',{orderId:order.id});
 assert.equal((await h.command('order.approve',{orderId:order.id})).status,'approved');
 const invoice=await (await h.request(`/api/barrow/invoices/${order.id}.csv`)).text();assert.ok(invoice.includes(`"BAR-${order.id}"`));assert.ok(invoice.includes('"26400"'));
 state=await h.api('/api/barrow/state');
 assert.deepEqual(state.orders.filter(o=>o.status!=='superseded').map(o=>o.id),[order.id]);
 assert.equal(state.accounts[0].value.city,'Columbia');
});

test('erasing imported unused account retires custody and fences old restores',async t=>{
 const h=await installation();t.after(()=>h.close());
 const csv='accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty\nerase-me,Cedar Street Pantry,erase@example.test,pier-cedar,30,0,OAT-1,6500,1\n';
 const preview=await h.api('/api/barrow/imports/preview',{csv});await h.api('/api/barrow/imports/apply',{csv,fingerprint:preview.fingerprint});
 const before=await archive(h);
 await h.command('account.erase',{accountId:'erase-me',confirm:'ERASE'});assert.equal((await h.api('/api/barrow/state')).accounts.length,0);
 const after=await archive(h);assert.equal(JSON.stringify(after).includes('erase@example.test'),false);
 const target=await installation();try{await restore(target,before,{status:400,laterJournal:{sourceIdentity:after[0].sourceIdentity,epoch:after[0].epoch,journal:after[0].journal}});assert.equal((await target.api('/api/barrow/state')).accounts.length,0)}finally{await target.close()}
});
