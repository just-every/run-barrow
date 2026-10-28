import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installation, accountValue, archive, restore } from './harness.mjs';
const financialCard=payment=>Object.fromEntries(['id','accountId','orderId','currency','amountCents','surchargeCents','state','createdAt','updatedAt','latestFinancialAt','capturedAt','providerPaymentId'].filter(key=>payment[key]!==undefined).map(key=>[key,payment[key]]));
function erasedCardHistory(bundle,card) {
 const items=bundle.flatMap(part=>part.items??[]),row=items.find(item=>item.table==='bw_card_payments'&&item.row.id===card.payment.id)?.row;
 assert.ok(row,'Financial payment history remains in the owner archive');
 const payment=JSON.parse(row.value_json);assert.deepEqual(financialCard(payment),financialCard(card.payment));assert.equal(payment.restored,true);
 for(const key of ['card','paymentMethodId','setupSessionId','checkoutUrl','actionUrl'])assert.equal(key in payment,false,'Erased card custody: '+key);
 assert.deepEqual(JSON.parse(items.find(item=>item.table==='bw_card_events'&&item.row.id===card.event.id).row.value_json),card.event);
}

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
 const days={poDocuments:30,media:null,messages:90,commercialHistory:1,applicationRecords:null};
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
 // Archive history includes a post-floor capture and an in-floor cancellation.
 // The event is newer than its payment summary, so neither source may be ignored.
 for(const id of ['old','commercial','fresh'])await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.status','approved','$.preparedAt','2010-01-01T00:00:00.000Z','$.approvedAt','2010-01-01T00:00:00.000Z','$.invoice.issuedAt','2010-01-01T00:00:00.000Z') WHERE id=?").bind(id).run();
 await historicalCard(h,{id:'historical-capture',accountId:account.id,orderId:'old',at:'2016-02-29T12:34:56.789Z'});
 await historicalCard(h,{id:'historical-recent-po',accountId:account.id,orderId:'fresh',at:'2016-02-29T12:34:56.789Z'});
 await historicalCard(h,{id:'historical-cancellation',accountId:account.id,orderId:'commercial',at:'2016-02-29T12:34:56.789Z',eventAt:'2024-02-29T12:34:56.789Z',state:'cancelled'});
 await historicalCreditEvents(h);
 // An archived dated obligation has a known financial instant, independent of the host clock.
 const scheduledAt='2024-02-29T12:43:56.789Z',scheduled={id:'synthetic-barrow-721',accountId:account.id,orderId:'fresh',orderRevision:'fresh',currency:'USD',amountCents:500,surchargeCents:0,state:'prepared',scheduleId:'synthetic-barrow-722',dueDate:'2024-03-15',scheduledBy:'historical-owner',scheduledAt,createdAt:scheduledAt,updatedAt:scheduledAt,latestFinancialAt:scheduledAt};
 await h.db.prepare('INSERT INTO bw_card_payments VALUES(?,?,?,?,?)').bind(scheduled.id,account.id,'fresh',JSON.stringify(scheduled),scheduled.id).run();
 const before=await archive(h),original=await h.api('/api/barrow/orders/old');
 let review=await h.api('/api/barrow/retention');
 assert.deepEqual(review.documents.filter(row=>row.eligible).map(row=>row.orderId),['expired-commercial','old']);
 assert.equal(review.documents.find(row=>row.orderId==='commercial').reason,'Commercial evidence: seven-year minimum');
 assert.equal(review.documents.find(row=>row.orderId==='commercial').commercialMinimumUntil,'2031-02-28T12:42:56.789Z');
 assert.equal(review.documents.find(row=>row.orderId==='old').commercialMinimumUntil,'2023-02-28T12:34:56.789Z');
 assert.equal(review.documents.find(row=>row.orderId==='fresh').commercialMinimumUntil,'2031-02-28T12:43:56.789Z');
 assert.equal(review.documents.find(row=>row.orderId==='fresh').expiresAt,new Date(Date.parse((await h.api('/api/barrow/orders/fresh')).document.uploadedAt)+30*86400000).toISOString());
 const payload=row=>({orderId:row.orderId,sha256:row.sha256,revision:row.revision,policyRevision:policy.revision,confirm:'ERASE',reason:'Owner reviewed expired attachment'});
 await h.command('retention.erase-document',payload(review.documents.find(row=>row.orderId==='commercial')),{status:409});
 await h.command('retention.erase-document',payload(review.documents.find(row=>row.orderId==='fresh')),{status:409});
 const old=review.documents.find(row=>row.orderId==='old');
 const held=await h.command('retention.request',{accountId:account.id,held:true,reason:'Preserve pending legal review'});
 review=await h.api('/api/barrow/retention');assert.ok(review.documents.every(row=>row.held&&!row.eligible));
 assert.equal(review.requests[0].held,1);assert.equal(review.requests[0].revision,held.revision);
 await h.command('retention.erase-document',payload(old),{status:409});
 await h.command('account.erase',{accountId:account.id,confirm:'ERASE'},{status:409});
 assert.equal((await h.request('/api/barrow/orders/old/document',buyer)).status,200);
 const released=await h.command('retention.request',{accountId:account.id,revision:held.revision,held:false,reason:'Attributed release after legal review'});
 const releaseReview=await h.api('/api/barrow/retention');assert.equal(releaseReview.requests[0].requested_by,(await h.api('/api/barrow/state')).actor.id);assert.equal(releaseReview.requests[0].revision,released.revision);assert.equal(releaseReview.requests[0].held,0);
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
 assert.match(review.custody.stripe,/Stripe/);assert.match(review.custody.stripe,/No Stripe erasure/);
 for(const kind of ['barrow','identity','inventory','accounting','mail','backups'])assert.ok(review.custody[kind]);
 const audit=await h.api('/api/barrow/audit?search=retention');
 assert.ok(JSON.stringify(audit).includes('retention.document-erased'));
 const after=await archive(h),target=await installation();t.after(()=>target.close());
 const cardRows=bundle=>bundle.flatMap(part=>part.items??[]).filter(item=>['bw_card_payments','bw_card_events'].includes(item.table)).map(item=>item.table==='bw_card_payments'?{table:item.table,payment:financialCard(JSON.parse(item.row.value_json))}:item);assert.equal(cardRows(before).filter(item=>item.table==='bw_card_payments').length,4);assert.equal(cardRows(before).filter(item=>item.table==='bw_card_events').length,4);assert.deepEqual(cardRows(after),cardRows(before));
 await restore(target,after);
 assert.equal((await target.request('/api/barrow/orders/old/document')).status,404);
 assert.deepEqual((await target.api('/api/barrow/retention')).receipts,review.receipts);
 assert.deepEqual(cardRows(await archive(target)),cardRows(before));
 const stale=await installation();t.after(()=>stale.close());
 await restore(stale,before,{status:400,laterJournal:{sourceIdentity:after[0].sourceIdentity,epoch:after[0].epoch,journal:after[0].journal}});
 assert.equal((await stale.api('/api/barrow/state')).orders.length,0);
});

// One ordered-account erasure behaviour, including its authorization, hold and
// atomic snapshot guards. Historical records are fixture input, never an oracle.
import {randomBytes,createHmac} from 'node:crypto';
import {orderedAccountFixture,historicalCard,historicalCreditEvents,erasurePreview,erasurePayload,verifiedRequest} from './retention-fixture.mjs';
test('ordered-account owner erasure revokes access, redacts personal classes, preserves financial evidence and returns attributed custody',async t=>{
 const key=randomBytes(32),h=await installation({bindings:{MAIL_WEBHOOK_SECRET:'whsec_'+key.toString('base64'),MAIL_EVENT_TENANT:'synthetic-barrow-47'}});t.after(()=>h.close());
 const f=await orderedAccountFixture(h,{cardHistory:true}),creditHistory=await historicalCreditEvents(h,'cedar-expired'),admin={as:await h.signIn('synthetic-barrow-51@example.test','admin')};
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 for(const actor of [f.buyer,admin,agent]){await h.command('retention.preview',{accountId:'cedar'},{...actor,status:403});await h.command('retention.erase-account',{accountId:'cedar',confirm:'ERASE',reason:'Unauthorized erasure'},{...actor,status:403})}
 await verifiedRequest(h,'cedar',true);let preview=await erasurePreview(h),payload=erasurePayload(preview);
 assert.equal(preview.held,true);assert.equal(preview.classes.find(row=>row.kind==='mail event payloads').count,2);assert.equal(preview.classes.find(row=>row.kind==='mail event payloads').action,'remove');assert.ok(preview.classes.every(row=>row.action));assert.ok(preview.items.every(row=>row.reason&&'floorUntil'in row));assert.equal(preview.items.find(row=>row.id==='order:cedar-recent').action,'keep unchanged');
 await h.command('retention.erase-account',payload,{status:409});
 assert.equal(preview.items.find(row=>row.id==='order:cedar-expired').floorUntil,'2031-02-28T12:42:56.789Z');assert.equal(preview.items.find(row=>row.id==='card-event:'+f.card.event.id).floorUntil,'2031-02-28T12:42:56.789Z');
 const original=await h.api('/api/barrow/orders/cedar-recent'),originalQuote=await h.db.prepare('SELECT value_json FROM bw_quotes WHERE id=?').bind(f.quotes[1].id).first(),originalCommission=await h.db.prepare('SELECT value_json FROM bw_order_commissions WHERE order_id=?').bind(original.id).first(),originalConfirmation=await h.db.prepare('SELECT value_json FROM bw_confirmations WHERE order_id=?').bind(original.id).first();
 const heldReceipt=await h.command('retention.revoke-access',payload);assert.equal(heldReceipt.mode,'revoke');
 assert.equal((await h.request('/api/barrow/state',f.buyer)).status,401);
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM bw_usage_acceptances WHERE user_id=?').bind(f.person.id).first()).n,1,'Hold preserves opaque usage-consent history');
 assert.equal((await h.db.prepare('SELECT email FROM oa_operators WHERE id=?').bind(f.person.id).first()).email,f.email,'Hold leaves identifying text unchanged');
 assert.equal((await h.api('/api/barrow/quotes/'+f.quotes[0].id)).thread.find(row=>row.id===f.message.id).body,'Personal note '+f.email);
 await verifiedRequest(h,'cedar',false);preview=await erasurePreview(h);payload=erasurePayload(preview);
 await h.command('retention.erase-account',{...payload,confirm:'no'},{status:400});
 await h.command('retention.erase-account',{...payload,policyRevision:'stale'},{status:409});
 // A message arriving after preview invalidates the whole dry-run fingerprint.
 await h.command('quote.message',{quoteId:f.quotes[0].id,body:'A new owner note after preview'});
 await h.command('retention.erase-account',payload,{status:409});
 preview=await erasurePreview(h);payload=erasurePayload(preview);
 const exportJob=await h.api('/api/barrow/portability/exports',{});
 const ledgerBefore=await h.db.prepare('SELECT * FROM bw_quote_mail WHERE id=?').bind(f.ledger.id).first();
 const receipt=await h.command('retention.erase-account',{...payload,exclusions:[{id:'message:'+f.note.id,reason:'Owner retained this specific internal note under an individually recorded exclusion.'}]});
 assert.equal(receipt.items.find(row=>row.id==='card-payment:'+f.card.payment.id).action,'keep financial history');assert.match(receipt.custody.stripe,/Stripe/);assert.deepEqual(await h.api('/api/barrow/orders/cedar-expired'),f.orders[1]);
 assert.equal(receipt.actorId,(await h.api('/api/barrow/state')).actor.id);assert.equal(JSON.stringify(receipt).includes(f.email),false,'The retained receipt uses opaque item identifiers, never an erased mail recipient');assert.equal(receipt.exclusions.length,1);assert.ok(receipt.backupWindows.paidUntil>receipt.at);assert.ok(receipt.backupWindows.freeUntil>receipt.at);
 assert.equal(receipt.request.channel,'In-app owner review');assert.ok(receipt.request.verificationNote);assert.ok(receipt.classes.find(row=>row.kind==='commercial audit').count>0);
 const account=await h.api('/api/barrow/accounts/by-id/cedar');assert.equal(account.id,f.account.id);assert.equal(account.value.lifecycle,'closed');assert.match(account.value.email,/@erased\.invalid$/);assert.notEqual(account.value.email,(await h.db.prepare('SELECT email FROM oa_operators WHERE id=?').bind(f.person.id).first()).email);assert.equal(account.value.name,f.account.value.name);assert.deepEqual(account.value.prices,f.account.value.prices);
 const person=await h.db.prepare('SELECT * FROM oa_operators WHERE id=?').bind(f.person.id).first();assert.equal(person.status,'inactive');assert.equal(person.display_name,'Erased buyer');assert.match(person.email,/^erased-.*@erased\.invalid$/);
 for(const table of ['oa_sessions','oa_tokens','oa_credentials','oa_step_up_challenges','oa_external_identities'])assert.equal((await h.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE operator_id=?`).bind(f.person.id).first()).n,0);
 for(const table of ['bw_locations','bw_lists','bw_followups'])assert.equal((await h.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id='cedar'`).first()).n,0);
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM oa_logout_events').first()).n,1);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM oa_invitation_cancellations WHERE operator_id=?').bind('synthetic-barrow-53').first()).n,1);
 assert.deepEqual(await h.api('/api/barrow/orders/cedar-recent'),original);assert.deepEqual(await h.db.prepare('SELECT value_json FROM bw_quotes WHERE id=?').bind(f.quotes[1].id).first(),originalQuote);assert.deepEqual(await h.db.prepare('SELECT value_json FROM bw_order_commissions WHERE order_id=?').bind(original.id).first(),originalCommission);assert.deepEqual(await h.db.prepare('SELECT value_json FROM bw_confirmations WHERE order_id=?').bind(original.id).first(),originalConfirmation);
 const thread=(await h.api('/api/barrow/quotes/'+f.quotes[0].id)).thread,erased=thread.find(row=>row.id===f.message.id);assert.equal(erased.body,'[Erased message]');assert.equal(erased.authorId,f.person.id);assert.equal(erased.at,f.message.at);assert.deepEqual(erased.erasedAttachment,{type:'application/pdf',size:f.bytes.length,sha256:f.sha256});assert.equal(thread.find(row=>row.id===f.note.id).body,'Internal personal note '+f.email);
 const application=(await h.api('/api/barrow/applications')).applications.find(row=>row.id===f.applicationId);assert.equal(application.value.contactName,'Erased buyer');assert.equal(application.value.phone,'');assert.deepEqual(application.value.locations,[]);assert.match(application.value.email,/@erased\.invalid$/);assert.equal((await h.request('/api/barrow/applications/'+f.applicationId+'/documents/synthetic-barrow-72')).status,503,'Retained certificates remain quarantined without a scanner');
 const retainedArchive=await archive(h),certificate=retainedArchive.flatMap(part=>part.items??[]).find(item=>item.table==='bw_application_documents'&&item.row.id==='synthetic-barrow-72')?.row;assert.ok(certificate,'Approved certificate stays in owner backup custody under the account financial floor');assert.equal(certificate.content_base64,f.bytes.toString('base64'));assert.equal(certificate.sha256,f.sha256);
 for(const entry of creditHistory){const record=retainedArchive.flatMap(part=>part.items??[]).find(item=>item.table===entry.table&&item.row.id===entry.id);assert.ok(record);assert.equal(JSON.parse(record.row.value_json).amountCents,100);assert.equal(receipt.items.find(item=>item.id===entry.table+':'+entry.id).action,'keep financial history')}assert.ok(receipt.items.some(item=>item.id==='refund-event:synthetic-barrow-613'));
 erasedCardHistory(retainedArchive,f.card);assert.equal((await h.command('card.capture',{paymentId:f.card.payment.id,reason:'Erased payment authority must stay revoked'},{status:409})).error.code,'RESTORED');
 assert.equal((await h.request(f.message.attachment.path)).status,404);assert.equal((await h.request(f.retained.attachment.path)).status,200);assert.equal((await h.request('/api/barrow/orders/cedar-recent/document')).status,200);
 const ledger=await h.db.prepare('SELECT * FROM bw_quote_mail WHERE id=?').bind(f.ledger.id).first();assert.equal(ledger.provider_message_id,'synthetic-barrow-46');assert.equal(ledger.status,ledgerBefore.status);for(const field of ['recipient','submission_json','sender_result_json'])assert.equal(ledger[field],null);assert.equal(ledger.summary,'[Erased notice]');
 for(const table of ['rer_mail_event_receipts','rer_mail_event_states'])assert.equal((await h.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
 const timestamp=Math.floor(Date.now()/1000).toString(),eventId='synthetic-barrow-52',body=JSON.stringify({type:'email.bounced',created_at:new Date().toISOString(),data:{email_id:'synthetic-barrow-46',to:[f.email]}}),signature=createHmac('sha256',key).update(eventId+'.'+timestamp+'.'+body).digest('base64');
 const late=await h.raw('/api/barrow/quote-mail/webhook',{method:'POST',headers:{'content-type':'application/json','svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature},body});assert.equal(late.status,200);assert.equal((await late.json()).ignored,true);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM rer_mail_event_receipts').first()).n,0);
 const audit=await h.db.prepare("SELECT * FROM bw_audit WHERE id='synthetic-barrow-44'").first();assert.equal(audit.actor_id,f.person.id);assert.equal(audit.action,'historical.note');assert.equal(JSON.parse(audit.context_json).revision,'synthetic-barrow-45');assert.equal(JSON.parse(audit.context_json).reason.includes('Annual plan'),true);assert.equal(JSON.parse(audit.context_json).reason.includes(' Ann '),false);assert.equal(audit.context_json.includes('555-0100'),false);assert.equal(audit.context_json.includes('101 Main Street'),false);assert.equal(audit.context_json.includes(f.email),false);assert.equal(audit.context_json.includes('synthetic-barrow-41'),false);assert.equal((await h.db.prepare("SELECT value FROM oa_auth_audit WHERE id='synthetic-barrow-42'").first()).value.includes(f.email),false);
 assert.equal((await h.request(`/api/barrow/portability/exports/${exportJob.id}/download`)).status,404);
 const exported=await h.api('/api/barrow/export.json');assert.match(exported.accounts[0].email,/@erased\.invalid$/);assert.equal(exported.quotemessages.find(row=>row.id===f.message.id).body,'[Erased message]');assert.equal(exported.quotemessages.find(row=>row.id===f.message.id).attachmentSha256,f.sha256);assert.ok(receipt.custody.inventory.includes('Pier'));assert.ok(receipt.custody.accounting.includes('payment'));assert.ok(receipt.custody.exports.includes('Already-downloaded'));
 await h.command('retention.erase-account',erasurePayload(await erasurePreview(h)),{status:409});
});

test('independent erasure journal reapplies after D1 rewind and old archive import; missing or incomplete journal refuses data and auth',async t=>{
 const h=await installation();t.after(()=>h.close());const f=await orderedAccountFixture(h);await verifiedRequest(h);
 const archivedCard=await historicalCard(h,{id:'archived-personal-card',accountId:'cedar',orderId:'cedar-recent',at:'2016-02-29T12:34:56.789Z'});
 const before=await archive(h);
 // The old archive predates the card event. Replaying the erasure receipt must
 // retain the financial floor the owner actually reviewed, even on that copy.
 const laterCard=await historicalCard(h,{id:'later-financial-event',accountId:'cedar',orderId:'cedar-expired',at:'2024-02-29T12:34:56.789Z'});
 await historicalCreditEvents(h,'cedar-expired');
 const preview=await erasurePreview(h),receipt=await h.command('retention.erase-account',erasurePayload(preview)),after=await archive(h);
 const missing=await installation();t.after(()=>missing.close());
 const refused=await missing.api('/api/barrow/portability/imports',{manifest:before[0],confirmed:true},{status:400});assert.equal(refused.error.code,'ERASURE_JOURNAL_REQUIRED');assert.equal((await missing.api('/api/barrow/state')).accounts.length,0);
 const target=await installation();t.after(()=>target.close());await restore(target,before);
 const state=await target.api('/api/barrow/state');assert.match(state.accounts[0].value.email,/@erased\.invalid$/);assert.equal((await target.api('/api/barrow/quotes/'+f.quotes[0].id)).thread.find(row=>row.id===f.message.id).body,'[Erased message]');assert.equal((await target.api('/api/barrow/retention')).accountReceipts.at(-1).id,receipt.id);assert.equal(target.mail.deliveries.length,0);
 assert.deepEqual(await target.api('/api/barrow/orders/cedar-expired'),f.orders[1]);assert.match((await target.api('/api/barrow/retention')).accountReceipts.at(-1).custody.stripe,/Stripe/);
 erasedCardHistory(await archive(target),archivedCard);assert.equal((await target.command('card.refresh',{paymentId:archivedCard.payment.id},{status:409})).error.code,'RESTORED');
 // A platform restore rewinds the identity and D1 receipt too. R2 stays intact.
 await h.db.prepare('DELETE FROM bw_account_erasure_journal').run();await h.db.prepare('UPDATE bw_accounts SET value_json=?,revision=? WHERE id=?').bind(JSON.stringify(f.account.value),f.account.revision,f.account.id).run();await h.db.prepare("UPDATE oa_operators SET email=?,display_name='Trade buyer',status='active' WHERE id=?").bind(f.email,f.person.id).run();await h.db.prepare('UPDATE bw_quote_entries SET body=?,attachment_name=?,attachment_base64=? WHERE id=?').bind('Rewound personal note '+f.email,'personal.pdf',f.bytes.toString('base64'),f.message.id).run();
 await h.db.prepare('UPDATE bw_card_payments SET value_json=? WHERE id=?').bind(JSON.stringify(laterCard.payment),laterCard.payment.id).run();
 assert.equal((await h.request('/api/barrow/state',f.buyer)).status,401);assert.match((await h.api('/api/barrow/accounts/by-id/cedar')).value.email,/@erased\.invalid$/);assert.equal((await h.api('/api/barrow/quotes/'+f.quotes[0].id)).thread.find(row=>row.id===f.message.id).body,'[Erased message]');
 erasedCardHistory(await archive(h),laterCard);
 const bucket=await h.mf.getR2Bucket('ERASURE_JOURNAL'),keys=(await bucket.list({prefix:'account-erasure/v1/'})).objects,objectKey=keys.find(row=>row.key.endsWith('.json')).key,body=await (await bucket.get(objectKey)).text();await bucket.delete(objectKey);
 assert.equal((await h.request('/api/barrow/export.json')).status,503);assert.equal((await h.request('/auth/session')).status,503);await bucket.put(objectKey,body);
 const marker=keys.find(row=>row.key.endsWith('.complete')).key;await bucket.delete(marker);await h.db.prepare('DELETE FROM bw_account_erasure_journal').run();assert.equal((await h.request('/api/barrow/state')).status,503,'Uncommitted/indeterminate intent cannot silently erase or serve');
 // A later checkpoint still refuses the old archive wholesale through Base.
 const stale=await installation();t.after(()=>stale.close());await restore(stale,before,{status:400,laterJournal:{sourceIdentity:after[0].sourceIdentity,epoch:after[0].epoch,journal:after[0].journal},journalSource:target});
});

test('post-floor review defaults to personal redaction; explicit order deletion leaves reconciliable totals and exclusions have recorded reasons',async t=>{
 const h=await installation();t.after(()=>h.close());const f=await orderedAccountFixture(h);await verifiedRequest(h);
 let preview=await erasurePreview(h);assert.equal(preview.items.find(row=>row.id==='order:cedar-expired').floorUntil,'2017-02-28T12:00:00.000Z');
 await h.command('retention.erase-account',{...erasurePayload(preview),deleteOrderIds:['cedar-recent']},{status:409});
 await h.command('retention.erase-account',{...erasurePayload(preview),exclusions:[{id:'message:'+f.message.id,reason:''}]},{status:400});
 const receipt=await h.command('retention.erase-account',erasurePayload(await erasurePreview(h))),old=await h.api('/api/barrow/orders/cedar-expired');assert.equal(old.billTo,undefined);assert.equal(old.shipTo,undefined);assert.equal(old.termsAcceptance.printedName,'[Erased personal details]');assert.equal(old.totalCents,13000);assert.equal(old.preparedBy,f.person.id);assert.equal(old.reference,f.orders[1].reference);assert.equal((await h.request('/api/barrow/orders/cedar-expired/document')).status,404);assert.equal((await h.request('/api/barrow/orders/cedar-expired/terms-signature')).status,404);const retainedSignature=await h.request('/api/barrow/orders/cedar-recent/terms-signature');assert.equal(retainedSignature.status,200);assert.deepEqual(Buffer.from(await retainedSignature.arrayBuffer()),f.signatureBytes);assert.equal(receipt.deletedOrders.length,0);
 const other=await installation();t.after(()=>other.close());const g=await orderedAccountFixture(other);await historicalCard(other,{id:'expired-card-history',accountId:'cedar',orderId:'cedar-expired',at:'2016-02-29T12:34:56.789Z'});await verifiedRequest(other);
 const deleted=await other.command('retention.erase-account',{...erasurePayload(await erasurePreview(other)),deleteOrderIds:['cedar-expired']});assert.deepEqual(deleted.deletedOrders,[{id:'cedar-expired',currency:'USD',totalCents:13000,invoiceNumber:'INV-cedar-expired'}]);assert.equal((await other.request('/api/barrow/orders/cedar-expired')).status,404);assert.equal((await other.api('/api/barrow/orders/cedar-recent')).totalCents,13000);
 const retained=(await archive(other)).flatMap(part=>part.items??[]).find(item=>item.table==='bw_card_payments'&&item.row.id==='expired-card-history');assert.ok(retained);assert.equal(JSON.parse(retained.row.value_json).orderId,deleted.deletedOrders[0].id);assert.equal(JSON.parse(retained.row.value_json).amountCents,deleted.deletedOrders[0].totalCents);
});

test('ordered imported account retires its original without deleting commercial records, and the same public journal transport restores it safely',async t=>{
 const {stock}=await import('./harness.mjs'),pier=await installation({pier:true});t.after(()=>pier.close());const inventory=await stock(pier);
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 const email='synthetic-barrow-61@example.test',csv='accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty\ncedar,Cedar Street Pantry,'+email+','+inventory.customer.id+',30,0,OAT-1,6500,1\n';
 const reviewed=await h.api('/api/barrow/imports/preview',{csv}),job=await h.api('/api/barrow/imports/apply',{csv,fingerprint:reviewed.fingerprint});
 assert.equal(job.state,'completed');assert.ok((await h.api('/api/barrow/imports/'+job.id)).originals.some(row=>row.original.status==='retained'));
 const imported=await h.api('/api/barrow/accounts/by-id/cedar'),f=await orderedAccountFixture(h,{existingAccount:imported,email});await verifiedRequest(h);const older=await archive(h);
 const receipt=await h.command('retention.erase-account',erasurePayload(await erasurePreview(h)));
 const custody=await h.api('/api/barrow/imports/'+job.id);assert.equal(custody.originals.some(row=>row.original.status==='retained'),false);assert.equal(JSON.stringify(custody).includes(email),false);assert.equal((await h.api('/api/barrow/orders/cedar-recent')).totalCents,13000);
 const target=await installation();t.after(()=>target.close());await restore(target,older);assert.match((await target.api('/api/barrow/accounts/by-id/cedar')).value.email,/@erased\.invalid$/);assert.equal((await target.api('/api/barrow/retention')).accountReceipts.find(row=>row.id===receipt.id).id,receipt.id);assert.equal((await target.api('/api/barrow/imports/'+job.id)).originals.some(row=>row.original.status==='retained'),false);
});

test('owner upgrades existing erasure receipts into the independent journal; malformed or unauthorized journal transport is refused',async t=>{
 const h=await installation();t.after(()=>h.close());const f=await orderedAccountFixture(h),admin={as:await h.signIn('synthetic-barrow-62@example.test','admin')};
 const bundle=await h.api('/api/barrow/erasure-journal');assert.equal(bundle.entries.length,0);
 for(const who of [f.buyer,admin]){await h.api('/api/barrow/erasure-journal',undefined,{...who,status:403});await h.api('/api/barrow/erasure-journal',{bundle,confirm:'JOURNAL',reason:'Unauthorized journal'},{...who,status:403})}
 await h.api('/api/barrow/erasure-journal',{bundle,confirm:'no',reason:'Missing explicit confirmation'},{status:400});
 const broken={...bundle,entries:[{body:'{}',fingerprint:'0'.repeat(64)}]};await h.api('/api/barrow/erasure-journal',{bundle:broken,confirm:'JOURNAL',reason:'Malformed journal must not become trusted'},{status:409});
 // Model an upgrade from the pre-R2 release: it already erased one PO and
 // retained its original receipt, but had no independent journal binding.
 await h.db.prepare('DELETE FROM bw_order_documents WHERE order_id=?').bind('cedar-expired').run();await h.db.prepare('INSERT INTO bw_erasure_receipts VALUES(?,?,?,?,?,?,?)').bind('00000000-0000-4000-8000-000000000063','cedar-expired','cedar',f.sha256,(await h.api('/api/barrow/state')).actor.id,'2020-01-01T00:00:00.000Z','Previously authorized owner PO erasure').run();
 const bucket=await h.mf.getR2Bucket('ERASURE_JOURNAL');for(const row of (await bucket.list()).objects)await bucket.delete(row.key);
 assert.equal((await h.request('/api/barrow/state')).status,503);
 const initialized=await h.api('/api/barrow/erasure-journal',{initialize:true,confirm:'JOURNAL',reason:'Owner reviewed existing receipts and established their outside-D1 journal before upgrade use.'});assert.equal(initialized.operations,1);
 const saved=await h.api('/api/barrow/erasure-journal');assert.equal(saved.entries.length,1);await h.db.prepare('DELETE FROM bw_account_erasure_journal').run();await h.db.prepare('INSERT INTO bw_order_documents VALUES(?,?,?,?,?,?)').bind('cedar-expired','old.pdf','application/pdf',f.bytes.length,f.sha256,f.bytes.toString('base64')).run();assert.equal((await h.request('/api/barrow/orders/cedar-expired/document')).status,404);
});
