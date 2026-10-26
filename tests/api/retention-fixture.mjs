import assert from 'node:assert/strict';
// Historical archive fixture: public commands cannot backdate financial events.
// The assertions and all erasure decisions use authenticated HTTP doors.
import {createHash} from 'node:crypto';
import {accountValue} from './harness.mjs';
export async function historicalCard(h,{id,accountId,orderId,at,eventAt=at,state='captured'}) {
 const payment={id,accountId,orderId,currency:'USD',amountCents:13000,surchargeCents:0,state,createdAt:at,updatedAt:at,latestFinancialAt:at,providerPaymentId:'synthetic-barrow-payment-'+id,card:{brand:'visa',last4:'4242',funding:'credit',state:'NY'},paymentMethodId:'synthetic-barrow-method-'+id,setupSessionId:'synthetic-barrow-checkout-'+id,checkoutUrl:'https://checkout.stripe.com/c/pay/'+id,actionUrl:'https://hooks.stripe.com/3d_secure/'+id,...(state==='captured'?{capturedAt:at}:{})};
 const event={id:'evt_'+id,type:state==='captured'?'payment_intent.succeeded':'payment_intent.canceled',providerPaymentId:payment.providerPaymentId,state,amountCents:payment.amountCents,currency:payment.currency,verifiedAt:eventAt};
 await h.db.prepare('INSERT INTO bw_card_payments(id,account_id,order_id,value_json,revision) VALUES(?,?,?,?,?)').bind(id,accountId,orderId,JSON.stringify(payment),id).run();
 await h.db.prepare('INSERT INTO bw_card_events(id,payment_id,created_at,value_json) VALUES(?,?,?,?)').bind(event.id,id,eventAt,JSON.stringify(event)).run();
 return {payment,event};
}
export async function orderedAccountFixture(h,{accountId='cedar',email='synthetic-barrow-31@example.test',existingAccount,cardHistory=false}={}) {
 const account=existingAccount??await h.command('account.save',{id:accountId,value:{...accountValue('synthetic-barrow-32',email),minimumCents:0,prices:[{sku:'OAT-1',unitCents:6500,minQty:1}]}});
 const buyer={as:await h.signIn(email)},person=(await h.api('/api/barrow/state',undefined,buyer)).actor;
 const bytes=Buffer.from('%PDF-1.4 synthetic-barrow-33'),sha256=createHash('sha256').update(bytes).digest('hex'),recent=new Date().toISOString(),old='2010-02-28T12:00:00.000Z';
 const line={sku:'OAT-1',name:'Granola',itemId:'synthetic-barrow-34',quantity:2,unitCents:6500,minQty:1,lineCents:13000};
 const signatureBytes=Buffer.from([137,80,78,71,13,10,26,10]),signatureSha256=createHash('sha256').update(signatureBytes).digest('hex');
 const orders=[];
 for(const [suffix,at] of [['recent',recent],['expired',old]]) {
  const id=accountId+'-'+suffix,document={name:'synthetic-barrow-35.pdf',type:'application/pdf',size:bytes.length,sha256,uploadedBy:person.id,uploadedAt:old};
  const order={id,accountId,accountRevision:account.revision,customerName:account.value.name,reference:'synthetic-barrow-36 '+suffix,lines:[line],totalCents:13000,currency:'USD',termsDays:30,status:'approved',preparedBy:person.id,preparedAt:old,approvedBy:'historical-owner',approvedAt:at,pierCustomerId:'synthetic-barrow-32',pierOrigin:'https://inventory.example.test',pierOrderId:'synthetic-barrow-37-'+suffix,invoice:{number:'INV-'+id,issuedAt:at,dueAt:at},billTo:{id:'historical',name:'Trade buyer',line1:'101 Main Street',city:'Columbia',state:'SC',zip:'29201',email},shipTo:{id:'historical',name:'Trade buyer',line1:'101 Main Street',city:'Columbia',state:'SC',zip:'29201'},instructions:'Call '+email,revision:id,document,termsAcceptance:{series:'historical',version:1,title:'Historical sales terms',contentSha256:sha256,how:'rep-signature',acceptedBy:person.id,acceptedAt:at,printedName:'Trade buyer',signatureSha256}};
  await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id,accountId,JSON.stringify(order),id).run();
  await h.db.prepare('INSERT INTO bw_order_documents VALUES(?,?,?,?,?,?)').bind(id,document.name,document.type,bytes.length,sha256,bytes.toString('base64')).run();
  await h.db.prepare('INSERT INTO bw_confirmations VALUES(?,?,?,?,?)').bind(id,1,'accepted',at,JSON.stringify({orderId:id,snapshot:order})).run();
  await h.db.prepare('INSERT INTO bw_order_commissions VALUES(?,?)').bind(id,JSON.stringify({orderId:id,totalCents:13000,currency:'USD',rep:'synthetic-barrow-38'})).run();
  await h.db.prepare('INSERT INTO bw_terms_signatures VALUES(?,?,?)').bind(id,signatureSha256,signatureBytes.toString('base64')).run();
  orders.push(order);
 }
 const card=cardHistory?await historicalCard(h,{id:accountId+'-card',accountId,orderId:orders[1].id,at:'2024-02-29T12:34:56.789Z'}):null;
 const quotes=[];
 for(const [id,orderId] of [['Q-10001',undefined],['Q-10002',orders[0].id]]) {
  const quote={id,accountId,customerName:account.value.name,currency:'USD',status:orderId?'accepted':'requested',requestedBy:person.id,requestedAt:old,note:'Contact '+email,request:[line],revisions:[],...(orderId?{accepted:{revision:1,by:person.id,at:recent,orderId}}:{}),revision:id};
  await h.db.prepare('INSERT INTO bw_quotes VALUES(?,?,?,?,?)').bind(id,accountId,JSON.stringify(quote),id,orderId??null).run();quotes.push(quote);
 }
 const attachment={name:'synthetic-barrow-39.pdf',contentBase64:bytes.toString('base64')};
 const message=await h.command('quote.message',{quoteId:quotes[0].id,body:'Personal note '+email,attachment},buyer);
 const note=await h.command('quote.message',{quoteId:quotes[0].id,body:'Internal personal note '+email,internal:true});
 const retained=await h.command('quote.message',{quoteId:quotes[1].id,body:'Converted quote personal note '+email,attachment},buyer);
 const live=await h.command('location.save',{accountId,kind:'ship-to',value:{name:'Personal address',line1:'101 Main Street',city:'Columbia',state:'SC',zip:'29201'}});
 await h.command('location.archive',{id:live.id,revision:live.revision,accountId});
 const contact=await h.command('location.save',{accountId,kind:'contact',value:{name:'Ann',email,phone:'555-0100',role:'Buyer'}});
 await h.command('list.save',{accountId,name:'Private replenishment',shared:false,lines:[{sku:'OAT-1',quantity:2}]},buyer);
 await h.db.prepare('INSERT INTO bw_followups VALUES(?,?,?,?)').bind('synthetic-barrow-40',accountId,JSON.stringify({id:'synthetic-barrow-40',accountId,contacts:[{note:email}]}),'synthetic-barrow-40').run();
 await h.db.prepare('INSERT INTO oa_external_identities VALUES(?,?,?)').bind('https://signin.example.test','synthetic-barrow-41',person.id).run();
 await h.db.prepare('INSERT INTO oa_auth_audit VALUES(?,?,?,?,?)').bind('synthetic-barrow-42',person.id,'linked',email+' synthetic-barrow-41',Date.now()).run();
 await h.db.prepare('INSERT INTO oa_logout_events VALUES(?,?,?)').bind('https://signin.example.test','synthetic-barrow-43',Date.now()).run();
 await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES('synthetic-barrow-53','synthetic-barrow-53@example.test','Cancelled buyer','member','inactive',1,0)").run();
 await h.db.prepare('INSERT INTO oa_invitation_cancellations VALUES(?,?)').bind('synthetic-barrow-53',1).run();
 await h.db.prepare('INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json) VALUES(?,?,?,?,?,?)').bind('synthetic-barrow-44',accountId,person.id,'historical.note',old,JSON.stringify({accountId,orderId:orders[0].id,revision:'synthetic-barrow-45',source:'historical',reason:'Annual plan; Ann called 555-0100 about 101 Main Street. Contact '+email+' and synthetic-barrow-41'})).run();
 const ledger=await h.db.prepare('SELECT id FROM bw_quote_mail WHERE account_id=? ORDER BY rowid LIMIT 1').bind(accountId).first();
 await h.db.prepare("UPDATE bw_quote_mail SET status='accepted',provider_message_id=?,recipient=?,submission_json=?,sender_result_json=? WHERE id=?").bind('synthetic-barrow-46',email,JSON.stringify({to:email,body:'Personal body'}),JSON.stringify({to:email}),ledger.id).run();
 const event={providerMessageId:'synthetic-barrow-46',recipients:[email],payload:'Personal body'};
 await h.db.prepare('INSERT INTO rer_mail_event_receipts VALUES(?,?,?,?,?,?,?,?,?)').bind('resend','synthetic-barrow-47','quotes','synthetic-barrow-48','synthetic-barrow-49',JSON.stringify(event),'synthetic-barrow-50',1,0).run();
 await h.db.prepare('INSERT INTO rer_mail_event_states VALUES(?,?,?,?,?,?,?,?,?)').bind('resend','synthetic-barrow-47','quotes','synthetic-barrow-46',email,'delivered',Date.now(),'synthetic-barrow-48',1).run();
 const applicationId='synthetic-barrow-71',application={name:account.value.name,email,ein:null,noEin:true,contactName:'Ann',phone:'555-0100',annualVolumeUsd:100000,requestedTermsDays:30,locations:[live.value],consent:true};
 await h.db.prepare('INSERT INTO bw_applications VALUES(?,?,?,?,?,?,?)').bind(applicationId,JSON.stringify(application),applicationId,'approved',accountId,old,old).run();
 await h.db.prepare('INSERT INTO bw_application_documents VALUES(?,?,?,?,?,?,?,?)').bind('synthetic-barrow-72',applicationId,'certificate.pdf','application/pdf',bytes.length,sha256,bytes.toString('base64'),old).run();
 await h.db.prepare('INSERT INTO bw_application_history VALUES(?,?,?,?,?,?)').bind('synthetic-barrow-73',applicationId,'approved','Annual review with Ann at '+email,person.id,old).run();
 const usage=await h.command('usage.publish',{title:'Portal usage',body:'Buyer reviewed the portal usage terms before ordering.'});await h.command('usage.accept',{...usage,accepted:true},buyer);
 return {account,buyer,person,orders,quotes,message,note,retained,live,contact,email,bytes,sha256,ledger,applicationId,signatureBytes,card};
}
export async function erasurePreview(h,accountId='cedar') {return h.command('retention.preview',{accountId})}
export const erasurePayload=preview=>({accountId:preview.accountId,accountRevision:preview.accountRevision,requestRevision:preview.requestRevision,policyRevision:preview.policyRevision,reviewHash:preview.reviewHash,confirm:'ERASE',reason:'Owner verified this erasure request and reviewed every retained class.'});
export async function verifiedRequest(h,accountId='cedar',held=false) {const requests=(await h.api('/api/barrow/retention')).requests;return h.command('retention.request',{accountId,revision:requests.find(row=>row.account_id===accountId)?.revision??null,requester:'Verified account representative',channel:'In-app owner review',verificationNote:'Owner independently verified the representative and scope.',reason:held?'Preserve pending legal review':'Verified request; owner explicitly released the hold',held})}


export async function historicalCreditEvents(h,orderId='commercial',accountId='cedar') {
 const rows=[['bw_credit_notes','synthetic-barrow-601','2024-02-29T12:35:56.789Z'],['bw_credit_applications','synthetic-barrow-602','2024-02-29T12:36:56.789Z'],['bw_card_allocations','synthetic-barrow-603','2024-02-29T12:37:56.789Z'],['bw_credit_refunds','synthetic-barrow-604','2024-02-29T12:38:56.789Z']];
 for(const [table,id,at] of rows){
  const value={id,accountId,orderId,orderRevision:'synthetic-barrow-605',currency:'USD',amountCents:100,returnId:'synthetic-barrow-606',createdAt:at,updatedAt:at,latestFinancialAt:at,completedAt:at,actorId:'synthetic-barrow-607',reason:'Recorded historical commercial event',revision:id,lines:[],creditId:rows[0][1],paymentId:'synthetic-barrow-608',providerPaymentId:'synthetic-barrow-609',providerRefundId:'synthetic-barrow-610',providerAccountId:'synthetic-barrow-611',installationId:'synthetic-barrow-612',livemode:false,status:'succeeded'};
  const source=table==='bw_credit_notes'?value.returnId:table==='bw_card_allocations'?value.paymentId:value.creditId;
  await h.db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,?,?)`).bind(id,accountId,orderId,source,JSON.stringify(value),id).run();
  const preview=await h.command('retention.preview',{accountId});assert.equal(preview.items.find(row=>row.id==='order:'+orderId).floorUntil,at.replace('2024-02-29','2031-02-28'));
 }
 const event={id:'synthetic-barrow-613',type:'refund.updated',status:'succeeded',amountCents:100,currency:'USD',providerRefundId:'synthetic-barrow-610',verifiedAt:'2024-02-29T12:39:56.789Z'};
 await h.db.prepare('INSERT INTO bw_refund_events VALUES(?,?,?,?)').bind(event.id,rows[3][1],event.verifiedAt,JSON.stringify(event)).run();
 assert.equal((await h.command('retention.preview',{accountId})).items.find(row=>row.id==='order:'+orderId).floorUntil,'2031-02-28T12:39:56.789Z');
 return rows.map(([table,id])=>({table,id}));
}
