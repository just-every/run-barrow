import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac,randomBytes } from 'node:crypto';
import { installation,stock,accountValue,archive,restore } from './harness.mjs';
import { easternDay } from '../eastern-day.mjs';
async function quoting(t,bindings,https) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const inventory=await stock(pier,'80');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,...bindings},https});t.after(()=>h.close());
 await h.command('account.save',{id:'cedar',value:{...accountValue(inventory.customer.id),prices:[{sku:'OAT-1',unitCents:6500,minQty:1}]}});
 const other=await pier.command('party.save',{name:'Wren Market',kind:'customer'});
 await h.command('account.save',{id:'wren',value:{...accountValue(other.id,'wren@example.test'),name:'Wren Market',prices:[{sku:'OAT-1',unitCents:6500,minQty:1}]}});
 const buyer={as:await h.signIn('buyer@example.test')},wren={as:await h.signIn('wren@example.test')};
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 return {h,pier,buyer,wren,agent,quoteOf:(id,opts={})=>h.api(`/api/barrow/quotes/${id}`,undefined,opts)};
}
test('AUTO-003 / ORD-005 / DATA-001 / DATA-002 / DATA-004 / AUTO-005 / OPS-001 / INT-015: quote emails preserve audiences and links, expiry is once per revision, signed bounce creates an owned persistent failed-contact task and restore sends nothing',async t=>{
 const key=randomBytes(32),{h,buyer,wren,agent,quoteOf}=await quoting(t,{MAIL_WEBHOOK_SECRET:'whsec_'+key.toString('base64'),MAIL_EVENT_TENANT:'barrow-test'},true);
 const admin={as:await h.signIn('rep@example.test','admin')};
 const quote=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:5}]},buyer);
 const quoteMail=()=>h.mail.deliveries.filter(row=>row.message.subject===`Barrow quote ${quote.id}`);
 assert.deepEqual(quoteMail().map(row=>row.message.to[0]).sort(),['owner@example.test','rep@example.test']);
 const ready=await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,validUntil:easternDay(0),lines:[{sku:'OAT-1',quantity:5}]});
 const sent=quoteMail().find(row=>row.message.to.includes('buyer@example.test'));
 assert.deepEqual(quoteMail().filter(row=>row.message.text.includes('expires after today')).map(row=>row.message.to[0]).sort(),['buyer@example.test','owner@example.test','rep@example.test']);
 assert.ok(sent);assert.match(sent.message.text,new RegExp(`/app\\?quote=${quote.id}`));
 assert.equal((await h.request(`/api/barrow/quotes/${quote.id}`,buyer)).status,200);
 assert.equal((await h.request(`/api/barrow/quotes/${quote.id}`,wren)).status,404);
 assert.equal((await h.request(`/api/barrow/quotes/${quote.id}`,{as:''})).status,401);
 const before=quoteMail().length;
 await h.command('quote.message',{quoteId:quote.id,body:'Staff-only delivery concern',internal:true});
 assert.equal(quoteMail().length,before+1);assert.deepEqual(quoteMail().at(-1).message.to,['rep@example.test']);
 assert.ok(!(await quoteOf(quote.id,buyer)).thread.some(row=>row.kind==='internal'));
 assert.ok((await quoteOf(quote.id,admin)).thread.some(row=>row.kind==='internal'&&row.body==='Staff-only delivery concern'));
 const buyerCount=quoteMail().filter(row=>row.message.to.includes('buyer@example.test')).length;
 await h.command('quote.message',{quoteId:quote.id,body:'Buyer-visible delivery update'});
 assert.equal(quoteMail().filter(row=>row.message.to.includes('buyer@example.test')).length,buyerCount+1);
 const count=quoteMail().length;
 await h.command('quote-mail.dispatch',{});await h.command('quote-mail.dispatch',{});
 assert.equal(quoteMail().length,count);
 await h.command('quote-mail.dispatch',{}, {...buyer,status:403});await h.command('quote-mail.dispatch',{}, {...agent,status:403});
 const webhookEvents=new Map();
 const webhook=async(id,messageId=sent.id,to='buyer@example.test',signature=true,type='email.bounced')=>{
  const timestamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify({type,created_at:new Date(Date.now()-1000+webhookEvents.size).toISOString(),data:{email_id:messageId,to:[to]}});
  if(!webhookEvents.has(id))webhookEvents.set(id,{timestamp,body});
  const saved=webhookEvents.get(id);
  const digest=createHmac('sha256',key).update(`${id}.${saved.timestamp}.${saved.body}`).digest('base64');
  return h.raw('/api/barrow/quote-mail/webhook',{method:'POST',headers:{'svix-id':id,'svix-timestamp':saved.timestamp,'svix-signature':'v1,'+(signature?digest:Buffer.alloc(32).toString('base64'))},body:saved.body});
 };
 assert.equal((await webhook('invalid',sent.id,'buyer@example.test',false)).status,400);
 assert.equal((await webhook('foreign','unrelated-provider-message')).status,400);
 assert.equal((await webhook('recipient',sent.id,'wren@example.test')).status,400);
 assert.equal((await webhook('delivered',sent.id,'buyer@example.test',true,'email.delivered')).status,200);
 assert.ok(!(await h.api('/api/barrow/diagnostics')).notifications.deliveries.some(row=>row.id===sent.key));
 assert.equal((await webhook('bounced')).status,200);
 // Replay the identical authenticated provider event, with its original bytes and signature.
 assert.equal((await webhook('bounced')).status,200);
 // INT-013: a later-arriving older nonterminal provider state cannot undo a bounce or open another task.
 const olderBody=JSON.stringify({type:'email.sent',created_at:new Date(Date.now()-60000).toISOString(),data:{email_id:sent.id,to:['buyer@example.test']}}),olderAt=String(Math.floor(Date.now()/1000));
 const olderSignature=createHmac('sha256',key).update(`synthetic-barrow-older.${olderAt}.${olderBody}`).digest('base64');
 assert.equal((await h.raw('/api/barrow/quote-mail/webhook',{method:'POST',headers:{'svix-id':'synthetic-barrow-older','svix-timestamp':olderAt,'svix-signature':'v1,'+olderSignature},body:olderBody})).status,200);
 const incoming=(await h.api('/api/barrow/webhooks')).incoming;
 assert.equal(incoming.find(row=>row.event_id==='bounced').duplicate_count,1);
 assert.match(incoming.find(row=>row.event_id==='synthetic-barrow-older').result,/out of order/);
 assert.equal((await h.api('/api/barrow/diagnostics')).notifications.deliveries.find(row=>row.id===sent.key).status,'bounced');
 const changed={type:'email.complained',created_at:new Date().toISOString(),data:{email_id:sent.id,to:['buyer@example.test']}},changedBody=JSON.stringify(changed),changedAt=String(Math.floor(Date.now()/1000));
 const changedSignature=createHmac('sha256',key).update(`bounced.${changedAt}.${changedBody}`).digest('base64');
 assert.equal((await h.raw('/api/barrow/quote-mail/webhook',{method:'POST',headers:{'svix-id':'bounced','svix-timestamp':changedAt,'svix-signature':'v1,'+changedSignature},body:changedBody})).status,400);
 assert.ok(!quoteMail().some(row=>JSON.stringify(row.message).includes('Staff-only delivery concern')));
 assert.equal((await h.api('/api/barrow/retention')).quoteDeliveryRetention.kind,'messages');
 const tasks=()=>h.api('/api/barrow/followups?view=all');
 let failed=(await tasks()).tasks.filter(row=>row.kind==='quote-mail');
 assert.equal(failed.length,1);assert.ok(failed[0].ownerId);assert.equal(failed[0].status,'open');
 await h.command('quote-mail.dispatch',{});
 assert.equal((await tasks()).tasks.filter(row=>row.kind==='quote-mail').length,1);
 const contacted=await h.command('followup.update',{id:failed[0].id,revision:failed[0].revision,contact:{outcome:'failed',note:'Mailbox still unavailable'}});
 assert.equal(contacted.status,'open');
 await h.command('quote.accept',{quoteId:quote.id,number:ready.revisions.at(-1).number},buyer);
 await h.command('followup.refresh',{});
 assert.equal((await tasks()).tasks.find(row=>row.id===contacted.id).status,'open');
 const acceptedMail=quoteMail().filter(row=>row.message.text.includes('accepted'));
 assert.ok(acceptedMail.length);
 const beforeAcceptedDispatch=quoteMail().length;await h.command('quote-mail.dispatch',{});assert.equal(quoteMail().length,beforeAcceptedDispatch);
 const resolved=await h.command('followup.update',{id:contacted.id,revision:contacted.revision,close:true,resolution:'Buyer reached by phone; correct email confirmed'});
 assert.equal(resolved.status,'closed');
 const diagnostics=await h.api('/api/barrow/diagnostics');assert.ok(!diagnostics.notifications.deliveries.some(row=>row.task_id===resolved.id));
 // A separate refused network submission also creates owned work and is never labelled sent/delivered.
 h.mail.reject=true;
 await h.command('quote.message',{quoteId:quote.id,body:'New delivery update'},admin);
 assert.ok((await tasks()).tasks.some(row=>row.kind==='quote-mail'&&row.status==='open'));
 h.mail.reject=false;
 const reopened=(await tasks()).tasks.find(row=>row.id===resolved.id);assert.equal(reopened.status,'open');
 await h.command('followup.update',{id:reopened.id,revision:reopened.revision,close:true,resolution:'Later failure reviewed with the buyer; contact completed.'});
 const supplierExport=await h.api('/api/barrow/export.json');assert.ok(supplierExport.quotedeliveries.length);assert.equal(supplierExport.manifest.counts.quotedeliveries,supplierExport.quotedeliveries.length);
 assert.equal((await h.api('/api/barrow/export.json',undefined,buyer)).quotedeliveries,undefined);
 assert.equal((await h.request('/api/barrow/export/quotedeliveries.csv',buyer)).status,403);
 assert.ok((await(await h.request('/api/barrow/export/quotedeliveries.csv')).text()).includes(sent.id));
 const nextKey=randomBytes(32);await h.configure({MAIL_WEBHOOK_SECRET:'whsec_'+nextKey.toString('base64')});await h.command('quote-mail.dispatch',{});
 assert.equal((await webhook('old-key-after-rotation')).status,400);
 await h.configure({MAIL_WEBHOOK_SECRET:undefined});await h.command('quote-mail.dispatch',{});assert.equal((await webhook('revoked-key')).status,503);
 await h.configure({MAIL_WEBHOOK_SECRET:'whsec_'+key.toString('base64')});await h.command('quote-mail.dispatch',{});
 const audit=await h.api('/api/barrow/audit?search=quote-mail');
 for(const action of ['quote-mail.secret-configured','quote-mail.secret-rotated','quote-mail.secret-revoked','quote-mail.contact-opened','quote-mail.delivery-event'])assert.ok(JSON.stringify(audit).includes(action),action);
 assert.ok(JSON.stringify(audit).includes('system'));
 const snapshot=await archive(h),target=await installation();t.after(()=>target.close());
 for(const secret of [key.toString('base64'),nextKey.toString('base64'),'test-network-edge'])assert.ok(!JSON.stringify(snapshot).includes(secret));
 await restore(target,snapshot);
 await target.command('quote-mail.dispatch',{});
 assert.equal(target.mail.deliveries.length,0);
 assert.equal((await target.api('/api/barrow/export.json')).quotedeliveries.length,supplierExport.quotedeliveries.length);
 assert.ok((await target.api('/api/barrow/followups?view=all')).tasks.some(row=>row.id===resolved.id&&row.status==='closed'));
});


test('AUTO-003 / DATA-003: expiry withdrawal, missing buyers, same-key retry window and unused-account custody erasure stay explicit through restore',async t=>{
 const key=randomBytes(32),secret='whsec_'+key.toString('base64'),{h,buyer,wren,pier}=await quoting(t,{MAIL_WEBHOOK_SECRET:secret,MAIL_EVENT_TENANT:'barrow-test'},true);
 const deliveries=async()=> (await h.command('quote-mail.dispatch',{})).deliveries;
 // Queue while unconfigured, then supersede the last-day revision before enabling submission.
 await h.configure({MAIL_WEBHOOK_SECRET:undefined});
 let q=await h.command('quote.request',{accountId:'wren',lines:[{sku:'OAT-1',quantity:5}]});
 q=await h.command('quote.propose',{quoteId:q.id,revision:q.revision,validUntil:easternDay(0),lines:[{sku:'OAT-1',quantity:5}]});
 const expiry=(await deliveries()).filter(row=>row.quote_id===q.id&&row.kind==='expiry');assert.equal(expiry.length,2);
 q=await h.command('quote.propose',{quoteId:q.id,revision:q.revision,validUntil:easternDay(2),lines:[{sku:'OAT-1',quantity:5}]});
 await h.configure({MAIL_WEBHOOK_SECRET:secret});let rows=await deliveries();
 assert.ok(expiry.every(row=>rows.find(after=>after.id===row.id).status==='withdrawn'));
 assert.ok(!h.mail.deliveries.some(row=>expiry.some(old=>old.id===row.key)));
 let discount=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:5}]});
 discount=await h.command('quote.propose',{quoteId:discount.id,revision:discount.revision,validUntil:easternDay(0),lines:[{sku:'OAT-1',quantity:5,unitCents:5000}]});
 assert.equal(discount.status,'awaiting-approval');assert.ok(!(await deliveries()).some(row=>row.quote_id===discount.id&&row.kind==='expiry'));
 // Acceptance before submission withdraws every pending last-day reminder.
 await h.configure({MAIL_WEBHOOK_SECRET:undefined});
 let accepted=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:5}]});
 accepted=await h.command('quote.propose',{quoteId:accepted.id,revision:accepted.revision,validUntil:easternDay(0),lines:[{sku:'OAT-1',quantity:5}]});
 const pending=(await deliveries()).filter(row=>row.quote_id===accepted.id&&row.kind==='expiry');assert.equal(pending.length,2);
 await h.command('quote.accept',{quoteId:accepted.id,number:accepted.revisions.at(-1).number},buyer);
 await h.configure({MAIL_WEBHOOK_SECRET:secret});rows=await deliveries();
 assert.ok(pending.every(row=>rows.find(after=>after.id===row.id).status==='withdrawn'));
 assert.ok(!h.mail.deliveries.some(row=>pending.some(old=>old.id===row.key)));
 // Missing active member is a withdrawn row and an owned task, never an address guess.
 await h.command('account.save',{id:'unused',value:{...accountValue('historical-unused','unused@example.test'),name:'Unused Market'}});
 // Historical archive fixture: the quote was removed at source, leaving delivery custody to erase.
 const at=new Date().toISOString();
 await h.db.prepare("INSERT INTO bw_quote_mail(id,notice_id,quote_id,account_id,audience,recipient_id,recipient,summary,kind,actor_id,expiry_revision,status,provider_message_id,created_at,updated_at) VALUES('historical',NULL,'Q-legacy','unused','buyer','former-user','unused@example.test','Historical quote','expiry','system',1,'accepted','provider-historical',?,?)").bind(at,at).run();
 const timestamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify({type:'email.bounced',created_at:at,data:{email_id:'provider-historical',to:['unused@example.test']}}),signature=createHmac('sha256',key).update(`historical.${timestamp}.${body}`).digest('base64');
 const callback=()=>h.raw('/api/barrow/quote-mail/webhook',{method:'POST',headers:{'svix-id':'historical','svix-timestamp':timestamp,'svix-signature':'v1,'+signature},body});
 assert.equal((await callback()).status,200);
 assert.ok((await h.api('/api/barrow/followups?view=all')).tasks.some(row=>row.accountId==='unused'));
 const before=await archive(h);await h.command('account.erase',{accountId:'unused',confirm:'ERASE'});
 assert.ok(!(await deliveries()).some(row=>row.account_id==='unused'));assert.equal((await callback()).status,400);
 const after=await archive(h),target=await installation();t.after(()=>target.close());
 await restore(target,before,{status:400,laterJournal:{sourceIdentity:after[0].sourceIdentity,epoch:after[0].epoch,journal:after[0].journal}});
 // A real rate-limited sender response retries within its window with the same stable provider key.
 h.mail.failStatus=429;await h.command('quote.message',{quoteId:q.id,body:'Replenishment update'});
 let limited=(await h.api('/api/barrow/export.json')).quotedeliveries.find(row=>row.status==='rate_limited');assert.ok(limited);
 h.mail.failStatus=undefined;await deliveries();assert.ok(h.mail.deliveries.some(row=>row.key===limited.id));
 assert.ok(h.mail.requests.filter(row=>row.key===limited.id).length>=2);
 h.mail.failStatus=429;await h.command('quote.message',{quoteId:q.id,body:'Later update'});
 limited=(await h.api('/api/barrow/export.json')).quotedeliveries.find(row=>row.status==='rate_limited');assert.ok(limited);
 // Historical elapsed-time fixture; the public dispatch must refuse a blind resubmit after the window.
 await h.db.prepare('UPDATE bw_quote_mail SET first_attempt_at=? WHERE id=?').bind(new Date(Date.now()-25*60*60*1000).toISOString(),limited.id).run();
 h.mail.failStatus=undefined;const attempts=h.mail.requests.length;await deliveries();assert.equal(h.mail.requests.length,attempts);
 assert.ok((await h.api('/api/barrow/followups?view=all')).tasks.some(row=>row.sourceId===q.id&&row.status==='open'));
 // Current recipient authority is rechecked after queueing, through the native identity door.
 await h.configure({MAIL_WEBHOOK_SECRET:undefined});
 await h.command('quote.message',{quoteId:q.id,body:'Queued before access removal'});
 const queued=(await deliveries()).filter(row=>row.quote_id===q.id&&row.status==='not configured');assert.ok(queued.length);
 const people=await h.api('/auth/operators'),person=people.find(row=>row.email==='wren@example.test');assert.ok(person);
 await h.api('/auth/operator/status',{operatorId:person.id,status:'inactive'});
 await h.configure({MAIL_WEBHOOK_SECRET:secret});rows=await deliveries();
 assert.ok(queued.every(row=>rows.find(after=>after.id===row.id).status==='withdrawn'));
 assert.ok(!h.mail.deliveries.some(row=>queued.some(old=>old.id===row.key)));
 const missingParty=await pier.command('party.save',{name:'Missing buyer Market',kind:'customer'});
 const missing=await h.command('account.save',{id:'missing',value:{...accountValue(missingParty.id,'missing@example.test'),name:'Missing buyer Market'}});
 // A request needs live catalogue stock but no invented buyer identity.
 const requested=await h.command('quote.request',{accountId:missing.id,lines:[{sku:'OAT-1',quantity:5}]});
 await h.command('quote.propose',{quoteId:requested.id,revision:requested.revision,validUntil:easternDay(2),lines:[{sku:'OAT-1',quantity:5}]});
 assert.ok((await deliveries()).some(row=>row.quote_id===requested.id&&row.status==='withdrawn'&&row.reason==='no authorized buyer recipient'));
 assert.ok((await h.api('/api/barrow/followups?view=all')).tasks.some(row=>row.sourceId===requested.id&&row.ownerId));
 assert.equal((await h.raw('/api/barrow/quote-mail/webhook',{method:'GET'})).status,405);
 assert.equal((await h.raw('/api/barrow/quote-mail/webhook',{method:'POST',body:'x'.repeat(1024*1024+1)})).status,413);
});
