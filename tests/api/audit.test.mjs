import test from 'node:test';
import assert from 'node:assert/strict';
import {installation,stock,accountValue,archive,restore} from './harness.mjs';

test('DATA-002: every current commercial mutation has searchable, attributed, append-only audit and complete safe CSV custody',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'500');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 const owner=(await h.api('/api/barrow/state')).actor;
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),prices:[{sku:'OAT-1',unitCents:6500,minQty:1,pricing:{effectiveFrom:'2000-01-01',effectiveTo:'2099-12-31',accountDiscountBps:500,override:{unitCents:6000,reason:'Approved showroom opening discount'}}}]}});
 await h.command('account.invite',{accountId:account.id});const buyer=await h.signIn(account.value.email),as={as:buyer};
 const grant=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${grant.token}`}};
 const agentDraft=await h.command('order.prepare',{accountId:account.id,lines:[{sku:'OAT-1',quantity:3}]},agent);
 let draft=await h.command('order.prepare',{accountId:account.id,replaces:agentDraft.id,reference:'AUDIT-ORDER',lines:[{sku:'OAT-1',quantity:2}]},as);
 await h.command('order.submit',{orderId:draft.id},as);const approved=await h.command('order.approve',{orderId:draft.id});assert.equal(approved.status,'approved');
 const comparison=await h.command('order.reorder-preview',{orderId:approved.id,selections:[{sku:'OAT-1'}]},as);const reordered=await h.command('order.reorder',{orderId:approved.id,selections:[{sku:'OAT-1'}],fingerprint:comparison.fingerprint,acknowledged:true},as);
 draft=await h.command('order.prepare',{accountId:account.id,reference:'AUDIT-SHORT',lines:[{sku:'OAT-1',quantity:10}]},as);
 await pier.command('order.create',{customerId:source.customer.id,lines:[{itemId:source.item.id,quantity:'497'}]});await h.command('order.submit',{orderId:draft.id},as);assert.equal((await h.command('order.approve',{orderId:draft.id})).status,'shortfall');await h.command('order.refresh',{orderId:draft.id});
 account=await h.command('account.save',{id:account.id,revision:account.revision,reason:' =Supplier reviewed the seasonal agreement',value:{...account.value,prices:[]}});
 const csv=(id,name,email,cents)=>`accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty\n${id},${name},${email},${source.customer.id},30,0,OAT-1,${cents},1\n`;
 const apply=async text=>{const p=await h.api('/api/barrow/imports/preview',{csv:text});return h.api('/api/barrow/imports/apply',{csv:text,fingerprint:p.fingerprint})};
 const text=csv('canal','Canal Market','canal@example.test',6500),preview=await h.api('/api/barrow/imports/preview',{csv:text});const reviewed={csv:text,fingerprint:preview.fingerprint};let job=await h.api('/api/barrow/imports/apply',reviewed);await h.api('/api/barrow/imports/apply',reviewed);await h.api(`/api/barrow/imports/${job.id}/undo`,{});
 let spare=await h.command('account.save',{id:'spare',duplicateReviews:[{id:account.id,revision:account.revision}],value:{...accountValue(source.customer.id,'spare@example.test'),name:'Spare Stockist'}});
 job=await apply(csv('spare','Spare Stockist','spare@example.test',7000));await h.api(`/api/barrow/imports/${job.id}/undo`,{});
 spare=(await h.api('/api/barrow/state')).accounts.find(a=>a.id==='spare');await h.command('account.erase',{accountId:spare.id,confirm:'ERASE'});
 const read=async query=>h.api('/api/barrow/audit?'+new URLSearchParams(query));
 const all=async query=>{let cursor,events=[];do{const page=await read({...query,limit:2,...(cursor?{cursor}:{})});events.push(...page.events);cursor=page.nextCursor}while(cursor);return events};
 const collision=await h.command('account.save',{id:approved.id,duplicateReviews:[{id:account.id,revision:account.revision}],value:{...accountValue(source.customer.id,'collision@example.test'),name:'Distinct account with overlapping order ID',minimumCents:0,prices:[]}});
 const events=await all({});assert.equal(events.find(e=>e.action==='account.saved'&&e.accountId===collision.id).orderId,null);assert.ok((await all({orderId:approved.id})).every(e=>e.action.startsWith('order.')));assert.equal(new Set(events.map(e=>e.id)).size,events.length);
 const actions=new Set(events.map(e=>e.action));for(const action of ['account.saved','account.invitation-requested','price.approved','price.removed','order.prepared','order.superseded','order.submitted','order.approved','order.reserved','order.shortfall','agent.granted','import.account-applied','import.account-restored','import.account-removed','account.erased'])assert.ok(actions.has(action),`Missing current event ${action}`);
 assert.ok(events.some(e=>e.action.startsWith('account.duplicates-reviewed')));assert.ok(events.some(e=>e.orderId===reordered.id&&e.source==='order.reorder'));
 assert.equal(events.filter(e=>e.action==='import.account-applied'&&e.accountId==='canal').length,1);
 assert.equal(events.find(e=>e.subjectId===agentDraft.id&&e.action==='order.prepared').actorKind,'agent');
 const human=events.find(e=>e.orderId===approved.id&&e.action==='order.submitted');assert.equal(human.actorKind,'human');assert.equal(human.actorId,(await h.api('/api/barrow/state',undefined,as)).actor.id);assert.ok(human.createdAt);assert.ok(human.revision);assert.ok(human.source);assert.ok(human.reason);
 assert.ok(events.some(e=>e.action==='price.approved'&&e.reason==='Approved showroom opening discount'));
 assert.ok((await all({accountId:'cedar'})).every(e=>e.accountId==='cedar'));assert.ok((await all({orderId:approved.id})).every(e=>e.orderId===approved.id));
 assert.ok((await all({person:'Supplier'})).every(e=>e.actorId===owner.id));assert.ok((await all({person:account.value.email})).every(e=>e.actorId===human.actorId));
 for(const e of events){assert.ok(e.source,e.action);assert.ok(e.reason,e.action);assert.ok(e.revision,e.action)}
 await h.api('/api/barrow/audit',undefined,{...as,status:403});await h.api('/api/barrow/audit.csv',undefined,{...agent,status:403});
 const before=JSON.stringify(await all({}));await h.api('/api/barrow/audit',{action:'edited'},{method:'POST',status:404});await h.api('/api/barrow/audit/'+events[0].id,undefined,{method:'DELETE',status:404});assert.equal(JSON.stringify(await all({})),before);
 await h.api('/api/barrow/agent-token/revoke',{});assert.ok((await all({})).some(e=>e.action==='agent.revoked'&&e.actorId===owner.id));
 // Real-shaped historical fixture crosses a full export page; no historical source/reason is invented.
 await h.db.batch(Array.from({length:250},(_,i)=>h.db.prepare('INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at) VALUES(?,?,?,?,?)').bind(`historical-${i}`,'cedar',owner.id,'account.saved','2026-01-01T12:00:00.000Z')));
 const legacy=(await read({limit:1})).events[0];assert.equal(legacy.source,null);assert.equal(legacy.reason,null);assert.equal(legacy.revision,null);assert.equal(legacy.accountOrigin,'current-relation');
 const exported=await h.request('/api/barrow/audit.csv?limit=1');assert.equal(exported.status,200);const exportedText=await exported.text();const complete=await all({});for(const event of complete)assert.ok(exportedText.includes(`"${event.id}"`),event.id);assert.ok(exportedText.includes(`"'=Supplier reviewed the seasonal agreement"`));assert.ok(!exportedText.includes(grant.token));assert.ok(!exportedText.includes(pier.cookie));
 const target=await installation();t.after(()=>target.close());await restore(target,await archive(h));const restoredText=await (await target.request('/api/barrow/audit.csv')).text();for(const event of complete)assert.ok(restoredText.includes(`"${event.id}"`));
 await h.api('/api/barrow/audit?cursor=0',undefined,{status:400});await h.api('/api/barrow/audit?limit=no',undefined,{status:400});
});
