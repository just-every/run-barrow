import test from 'node:test';
import assert from 'node:assert/strict';
import {activateStaff} from './harness.mjs';
import {sheetFixture} from './line-sheet-fixture.mjs';

test('recipient seasonal sheets retain exact variants, columns, ship windows and revision, and revocation closes every sheet door',async t=>{
 const f=await sheetFixture(t),{h,sheet,other,buyers}=f;
 const policy=role=>({role,accounts:['cedar'],warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0});
 const manager=await activateStaff(h,'merchandiser@example.test',policy('sales-manager')),rep=await activateStaff(h,'salesrep@example.test',policy('rep')),operations=await activateStaff(h,'warehouse@example.test',policy('operations'));
 const book=await(await h.request('/api/barrow/price-book.csv?accountId=cedar',manager.who)).text();assert.ok(book.includes('USD'));
 const scopedBook=await h.command('price-book.import',{accountId:'cedar',revision:f.cedar.revision,csv:book},manager.who);assert.equal(scopedBook.value.currency,'USD');
 const publish={accountId:'cedar',name:'Scoped manager sheet',season:'Spring',display:'both',shipStart:`${new Date().getUTCFullYear()+1}-03-01`,shipEnd:`${new Date().getUTCFullYear()+1}-03-31`,skus:f.skus};
 const managed=await h.command('sheet.publish',publish,manager.who);await h.command('sheet.revoke',{sheetId:managed.id,revision:managed.revision},manager.who);
 await h.command('sheet.publish',{...publish,accountId:'wren'},{...manager.who,status:404});
 for(const who of [rep.who,operations.who]){await h.command('sheet.publish',publish,{...who,status:403});await h.command('sheet.revoke',{sheetId:sheet.id,revision:sheet.revision},{...who,status:403});}
 await h.api(`/api/barrow/line-sheets/${other.id}`,undefined,{...manager.who,status:404});
 const page=await h.api(`/api/barrow/line-sheets/${sheet.id}`,undefined,buyers.cedar);assert.equal(page.season,`Spring ${new Date().getUTCFullYear()+1}`);assert.equal(page.shipStart.slice(-5),'03-01');assert.equal(page.shipEnd.slice(-5),'03-31');assert.deepEqual(page.items.map(i=>i.sku),f.skus);assert.deepEqual(page.packs,f.packs);assert.equal(page.items[0].available,'100');assert.equal(page.items[0].barcode,'synthetic-barrow-1');
 for(const suffix of ['','.pdf','.csv']){
  await h.api(`/api/barrow/line-sheets/${sheet.id}${suffix}`,undefined,{...buyers.wren,status:404});await h.api(`/api/barrow/line-sheets/${other.id}${suffix}`,undefined,{...buyers.cedar,status:404});
 }
 await h.command('sheet.publish',{accountId:'cedar',name:'unauthorized'}, {...buyers.cedar,status:403});
 await h.command('sheet.preview',{sheetId:sheet.id,revision:sheet.revision,lines:[]}, {...buyers.wren,status:404});
 await h.command('sheet.revoke',{sheetId:sheet.id,revision:sheet.revision});
 assert.deepEqual((await h.api('/api/barrow/line-sheets?accountId=cedar',undefined,buyers.cedar)).sheets,[]);
 for(const suffix of ['','.pdf','.csv'])await h.api(`/api/barrow/line-sheets/${sheet.id}${suffix}`,undefined,{...buyers.cedar,status:404});
 for(const type of ['sheet.view','sheet.preview'])await h.command(type,{sheetId:sheet.id,revision:sheet.revision,kind:'open',skus:[],lines:[{sku:f.skus[0],quantity:1}]},{...buyers.cedar,status:404});
 await h.command('order.prepare',{accountId:'cedar',lineSheetId:sheet.id,lineSheetRevision:sheet.revision,lines:[{sku:f.skus[0],quantity:1}]},{...buyers.cedar,status:404});
 assert.equal((await h.api(`/api/barrow/line-sheets/${other.id}`,undefined,buyers.wren)).currency,'CAD');
});

test('line-sheet size runs and fixed assortments preview exact extended-size prices, preserve Pier SKU quantities, and refuse unavailable sizes without redistribution',async t=>{
 const f=await sheetFixture(t),{h,pier,sheet,buyers}=f;
 const cart=await f.preview(sheet,{lines:[],packs:[{id:'size-run',quantity:1},{id:'case',quantity:2}]});assert.equal(cart.ready,true);assert.deepEqual(cart.cart.map(l=>[l.sku,l.quantity]),f.skus.map(sku=>[sku,5]));assert.deepEqual(cart.lines.map(l=>[l.unitCents,l.lineCents]),[[1201,6005],[1201,6005],[1601,8005]]);assert.equal(cart.totalCents,20015);
 const draft=await f.prepare(sheet,cart);assert.deepEqual(draft.lines.map(l=>[l.sku,l.quantity,l.unitCents,l.msrpCents]),[[f.skus[0],5,1201,2402],[f.skus[1],5,1201,undefined],[f.skus[2],5,1601,3202]]);
 await h.command('order.submit',{orderId:draft.id},buyers.cedar);const accepted=await h.command('order.approve',{orderId:draft.id});assert.equal(accepted.status,'approved');
 const upstream=(await pier.api('/api/pier/state')).orders.find(o=>o.id===accepted.pierOrderId);assert.deepEqual(upstream.lines.map(l=>[l.itemId,l.quantity,l.reserved]),f.variants.map(item=>[item.id,'5','5']));
 // Consume only the extended size in Pier, independently of Barrow's matrix.
 const consuming=await pier.command('order.create',{customerId:f.source.customer.id,lines:[{itemId:f.variants[2].id,quantity:'95'}]});assert.equal(consuming.lines[0].reserved,'95');
 const unavailable=await f.preview(sheet,{lines:[],packs:[{id:'size-run',quantity:1}]});assert.equal(unavailable.ready,false);assert.equal(unavailable.cart,undefined);assert.match(unavailable.lines.find(l=>l.sku===f.skus[2]).problem,/only 0/);assert.deepEqual(unavailable.lines.map(l=>l.quantity),['1','1','1']);
 await h.command('order.prepare',{accountId:'cedar',lineSheetId:sheet.id,lineSheetRevision:sheet.revision,lines:[{sku:f.skus[2],quantity:1}]},{...buyers.cedar,status:409});
 assert.equal((await pier.api('/api/pier/state')).orders.length,2);
 const form=await(await h.request(`/api/barrow/line-sheets/${sheet.id}.csv`,buyers.cedar)).text();assert.ok(form.includes('"3XL"'));
 const csv='style,name,S,M,3XL\nTEE-BLUE,Blue linen tee,2,3,0\n';
 const replace=await f.preview(sheet,{csv,mode:'replace',cart:[{sku:f.skus[0],quantity:4}]});assert.deepEqual(replace.cart.map(l=>[l.sku,l.quantity]),[[f.skus[0],2],[f.skus[1],3]]);
 const merge=await f.preview(sheet,{csv,mode:'merge',cart:[{sku:f.skus[0],quantity:4}]});assert.deepEqual(merge.cart.map(l=>[l.sku,l.quantity]),[[f.skus[0],6],[f.skus[1],3]]);
 // Inherited PRI-003: a buyer chooses a correction; the sheet never silently rounds it.
 let account=await h.api('/api/barrow/accounts/by-id/cedar');account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.map(p=>p.sku===f.skus[0]?{...p,minQty:2,casePack:2}:p)}});const current=await f.publish(account,'both');
 const invalid=await f.preview(current,{lines:[{sku:f.skus[0],quantity:3}]});assert.equal(invalid.ready,false);assert.deepEqual(invalid.lines[0].choices,['2','4']);
 const corrected=await f.preview(current,{lines:[{sku:f.skus[0],quantity:3}],set:{[`${f.skus[0]}|each`]:'4'}});assert.equal(corrected.ready,true);assert.equal(corrected.cart[0].quantity,4);
 const hidden=await f.preview(current,{csv:'sku,quantity\nsynthetic-barrow-hidden,1'});assert.equal(hidden.ready,false);assert.match(hidden.rows[0].message,/not on this account/);
});

test('line-sheet buyer opens and visible-item views appear independently in the scoped quote conversion report',async t=>{
 const f=await sheetFixture(t),{h,buyers,sheet,other}=f;
 for(const [s,who] of [[sheet,buyers.cedar],[other,buyers.wren]]){
  await h.command('sheet.view',{sheetId:s.id,revision:s.revision,kind:'open',skus:[]},who);await h.command('sheet.view',{sheetId:s.id,revision:s.revision,kind:'view',skus:f.skus.slice(0,2)},who);
 }
 await h.command('sheet.view',{sheetId:sheet.id,revision:sheet.revision,kind:'open',skus:[]});
 const report=await h.api('/api/barrow/reports/quotes');assert.equal(report.lineSheets.length,2);assert.deepEqual(report.lineSheets.map(r=>[r.opens,r.views,r.itemsViewed]),[[1,1,2],[1,1,2]]);assert.notEqual(report.lineSheets[0].buyerId,report.lineSheets[1].buyerId);assert.deepEqual(report.lineSheets[0].bySku,f.skus.slice(0,2).map(sku=>({sku,views:1})));
 const scoped=await h.api('/api/barrow/reports/quotes?accountId=cedar');assert.equal(scoped.lineSheets.length,1);assert.equal(scoped.lineSheets[0].accountId,'cedar');assert.equal(scoped.lineSheets[0].buyerEmail,'buyer@example.test');assert.equal(scoped.lineSheets[0].sheetName,'Spring collection');assert.deepEqual((await h.api('/api/barrow/reports/quotes?from=2000-01-01&to=2000-01-02')).lineSheets,[]);
 await h.api('/api/barrow/reports/quotes',undefined,{...buyers.cedar,status:403});
 await h.command('sheet.view',{sheetId:sheet.id,revision:sheet.revision,kind:'view',skus:['synthetic-barrow-hidden']},{...buyers.cedar,status:400});
});

test('campaign sends resolve thirty accounts, preserve private prices and normal ordering, attribute only linked orders, and never resend a recipient',async t=>{
 const {campaignFixture}=await import('./campaign-fixture.mjs'),f=await campaignFixture(t),{h}=f;
 assert.equal(f.campaignMail().length,0);
 const before=h.mail.deliveries.length,tested=await h.command('campaign.test',{id:f.draft.id,revision:f.draft.revision,accountId:'wren'});
 assert.equal(tested.status,'accepted');assert.equal(h.mail.deliveries.length,before+1);assert.deepEqual(h.mail.deliveries.at(-1).message.to,[(await h.api('/api/barrow/state')).actor.email]);
 const c=await f.send();assert.equal(f.campaignMail().length,28);assert.equal(c.counts.accepted,28);assert.equal(c.counts.delivered,0);assert.equal(c.counts.suppressed,1);assert.deepEqual(c.excluded.map(r=>[r.accountId,r.reason]),[['synthetic-barrow-29','pending or no approved purchaser'],['synthetic-barrow-30','closed']]);
 for(const sent of f.campaignMail()){assert.equal(sent.message.attachments.length,1);assert.match(Buffer.from(sent.message.attachments[0].content,'base64').toString(),/^%PDF/)}
 assert.equal((await f.webhook(c.deliveries.find(d=>d.status==='accepted'),'email.delivered',false,'synthetic-barrow-forged')).status,400);
 let delivered=await f.receive(c);assert.equal(delivered.counts.delivered,28);
 const recipients=[c.deliveries.find(d=>d.account_id==='cedar'&&d.status==='accepted'),c.deliveries.find(d=>d.account_id==='wren')],who=[f.second,f.buyers.wren],prices=[1201,1303];
 for(let i=0;i<2;i++){
  const d=recipients[i],sheet=await h.api('/api/barrow/campaign-deliveries/'+d.id,undefined,who[i]);assert.equal(sheet.items[0].unitCents,prices[i]);assert.deepEqual(sheet.suggestions,[{sku:f.skus[0],quantity:2}]);
  const pdf=await(await h.request('/api/barrow/line-sheets/'+sheet.id+'.pdf',who[i])).text();assert.ok(pdf.includes('USD '+(prices[i]/100).toFixed(2)));assert.ok(!pdf.includes('USD '+(prices[1-i]/100).toFixed(2)));
  await h.command('sheet.view',{sheetId:sheet.id,revision:sheet.revision,kind:'open',skus:[]},who[i]);await h.command('sheet.view',{sheetId:sheet.id,revision:sheet.revision,kind:'view',skus:[f.skus[0]]},who[i]);
  const p=await h.command('sheet.preview',{sheetId:sheet.id,revision:sheet.revision,mode:'replace',lines:[{sku:f.skus[0],quantity:3}]},who[i]);assert.equal(p.totalCents,3*prices[i]);
  const order=await h.command('order.prepare',{accountId:d.account_id,lineSheetId:sheet.id,lineSheetRevision:sheet.revision,...(i===0?{campaignDeliveryId:d.id}:{}),reference:'synthetic-barrow-campaign-'+i,lines:p.cart},who[i]);
  await h.command('order.submit',{orderId:order.id,revision:order.revision},who[i]);
 }
 await h.api('/api/barrow/campaign-deliveries/'+recipients[0].id,undefined,{...f.buyers.wren,status:404});
 await h.api('/api/barrow/line-sheets/'+recipients[0].sheet_id,undefined,{...f.buyers.wren,status:404});
 const ordinary=await h.command('order.prepare',{accountId:'wren',reference:'synthetic-barrow-ordinary',lines:[{sku:f.skus[0],quantity:1}]},f.buyers.wren);await h.command('order.submit',{orderId:ordinary.id,revision:ordinary.revision},f.buyers.wren);
 delivered=await h.api('/api/barrow/campaigns/'+c.id);assert.deepEqual(delivered.counts,{delivered:28,accepted:0,bounced:0,suppressed:1,opened:2,viewed:2,ordered:2});assert.equal(delivered.orderValue.USD,7512);
 const report=await h.api('/api/barrow/reports/quotes?from=2026-10-01&to=2026-10-31'),row=report.campaigns.find(r=>r.id===c.id);assert.deepEqual([row.delivered,row.opened,row.viewed,row.ordered,row.orderValueCents],[28,2,2,2,7512]);
 const resend=await f.send();assert.equal(f.campaignMail().length,28);assert.equal(resend.counts.delivered,28);
 await h.command('campaign.send',{id:c.id,revision:c.revision},{...f.buyers.wren,status:403});
 const grant=await h.api('/api/barrow/agent-token',{});await h.command('campaign.send',{id:c.id,revision:c.revision},{headers:{authorization:'Bearer '+grant.token},status:403});
});

test('scheduled campaigns resolve new buyers once, respect current rep authority, and cannot send or expose erased or restored recipient history',async t=>{
 const {archive,restore,installation}=await import('./harness.mjs'),clock='2026-10-28T12:00:00.000Z',key=Buffer.from('synthetic-barrow-031');
 const f=await sheetFixture(t,{https:true,bindings:{BARROW_TEST_CLOCK:clock,MAIL_WEBHOOK_SECRET:'wh'+'sec_'+key.toString('base64'),MAIL_EVENT_TENANT:'synthetic-barrow-32'}}),{h}=f;
 const list=await h.command('list.save',{accountId:'wren',name:'Spring suggestions',shared:true,lines:[{sku:f.skus[0],quantity:'2'}]});
 const segment=await h.command('segment.save',{name:'Reviewed seasonal buyers',filters:{accountIds:['wren']}});
 const draft=await h.command('campaign.save',{name:'Scheduled spring',subject:'Your scheduled selection',message:'Review these quantities through the ordinary cart.',source:{kind:'list',id:list.id},season:'Spring 2027',shipStart:'2027-03-01',shipEnd:'2027-03-31',segmentId:segment.id,attachmentFormat:'xlsx'});
 const testCopy=await h.command('campaign.test',{id:draft.id,revision:draft.revision,accountId:'wren'});assert.equal(testCopy.status,'accepted');
 const selfAttachment=h.mail.deliveries.at(-1).message.attachments[0];assert.equal(selfAttachment.filename,'line-sheet.xlsx');
 await h.command('campaign.schedule',{id:draft.id,revision:draft.revision,dueAt:'2026-10-28T13:00:00.000Z'});
 const outgoing=()=>h.mail.deliveries.filter(d=>d.message.subject===draft.subject);
 await (await h.mf.getWorker()).scheduled();assert.equal(outgoing().length,0);
 await h.command('campaign.send',{id:draft.id,revision:draft.revision},{status:409});
 await h.configure({BARROW_TEST_CLOCK:'2026-10-28T14:00:00.000Z'});await (await h.mf.getWorker()).scheduled();
 assert.equal(outgoing().length,1);assert.equal(outgoing()[0].message.attachments[0].filename,'line-sheet.xlsx');
 const readXlsx=(await import('read-excel-file/node')).default,workbook=(await readXlsx(Buffer.from(outgoing()[0].message.attachments[0].content,'base64')))[0].data;
 assert.ok(workbook.some(row=>row.includes('CAD')&&row.includes('1303')));assert.ok(!workbook.some(row=>row.includes('1201')));
 const first=await h.api('/api/barrow/campaigns/'+draft.id),recipient=first.deliveries[0];
 assert.deepEqual((await h.api('/api/barrow/campaign-deliveries/'+recipient.id,undefined,f.buyers.wren)).suggestions,[{sku:f.skus[0],quantity:2}]);
 const privateBook=await h.request('/api/barrow/campaign-deliveries/'+recipient.id+'.xlsx',f.buyers.wren);assert.equal(privateBook.status,200);assert.equal((await h.request('/api/barrow/campaign-deliveries/'+recipient.id+'.xlsx',f.buyers.cedar)).status,404);
 await h.command('segment.save',{id:segment.id,revision:segment.revision,name:segment.name,filters:{accountIds:['wren','cedar']}});
 await h.command('campaign.send',{id:draft.id,revision:draft.revision});assert.equal(outgoing().length,2);await (await h.mf.getWorker()).scheduled();assert.equal(outgoing().length,2);
 const policy=role=>({role,accounts:['cedar'],warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0}),email=n=>['synthetic-barrow-'+n,'example.test'].join('@');
 const rep=await activateStaff(h,email(41),policy('rep')),operations=await activateStaff(h,email(42),policy('operations'));
 const send={name:'Assigned account campaign',subject:'Assigned spring selection',message:'Only your currently assigned company receives this.',source:{kind:'sheet',id:f.sheet.id},filters:{accountIds:['cedar']}};
 await h.command('campaign.save',{...send,source:{kind:'sheet',id:f.other.id}},{...rep.who,status:404});
 await h.command('campaign.save',send,{...operations.who,status:403});
 const repCampaign=await h.command('campaign.save',send,rep.who);const repSent=await h.command('campaign.send',{id:repCampaign.id,revision:repCampaign.revision},rep.who);assert.deepEqual(repSent.deliveries.map(d=>d.account_id),['cedar']);
 const scheduled=await h.command('campaign.save',{...send,subject:'Revoked schedule'},rep.who);await h.command('campaign.schedule',{id:scheduled.id,revision:scheduled.revision,dueAt:'2026-10-28T16:00:00.000Z'},rep.who);
 await h.command('staff.revoke',{userId:rep.grant.userId,revision:rep.grant.revision,reason:'Owner ended current campaign authority.'});
 await h.api('/api/barrow/campaigns/'+repCampaign.id,undefined,{...rep.who,status:403});
 const count=h.mail.deliveries.length;await h.configure({BARROW_TEST_CLOCK:'2026-10-28T17:00:00.000Z'});await (await h.mf.getWorker()).scheduled();assert.equal(h.mail.deliveries.length,count);assert.equal((await h.api('/api/barrow/campaigns/'+scheduled.id)).state,'withdrawn');
 // The same campaign doors retain a branded seller, independent recipient books and mandatory terms.
 const terms=await h.command('terms.publish',{series:'synthetic-barrow-51',title:'Synthetic branded sales terms',body:'Review the exact Canadian seller and current terms before ordering.'});
 const brand=await h.command('brand.save',{id:'synthetic-barrow-52',revision:null,value:{name:'Synthetic Canadian brand',currency:'CAD',seller:{legalName:'Synthetic supplier corporation',address:'Synthetic registered business address'},termsSeries:terms.series,requireAcceptance:true}});
 const profiles={};
 for(const [id,unitCents] of [['cedar',1001],['wren',2003]])profiles[id]=await h.command('profile.save',{id:'synthetic-barrow-profile-'+id,accountId:id,value:{name:'Independent branded book '+id,brandId:brand.id,minimumCents:0,termsDays:14,prices:[{sku:f.skus[0],unitCents,minQty:1}]}});
 const buyerIds={cedar:(await h.api('/api/barrow/state',undefined,f.buyers.cedar)).actor.id,wren:(await h.api('/api/barrow/state',undefined,f.buyers.wren)).actor.id};
 const approve=(id,approved)=>h.command('profile.grant',{profileId:profiles[id].id,userId:buyerIds[id],approved,reason:'Owner explicitly reviewed this buyer’s branded profile authority.'});
 await approve('cedar',true);
 const sourceOrder=await h.command('order.prepare',{accountId:'cedar',profileId:profiles.cedar.id,lines:[{sku:f.skus[0],quantity:4}]},f.buyers.cedar);
 const wrenAccount=await h.api('/api/barrow/accounts/by-id/wren');await h.command('account.save',{id:'wren',revision:wrenAccount.revision,value:{...wrenAccount.value,territory:'South',assignedRep:'Synthetic South team',channel:'Wholesale',tags:['focus']}});
 const branded=await h.command('campaign.save',{name:'Branded campaign',subject:'Branded seasonal suggestions',message:'Your approved Canadian seller and buying profile apply.',source:{kind:'order',id:sourceOrder.id},season:'Spring 2027',shipStart:'2027-03-01',shipEnd:'2027-03-31',profileByAccount:{cedar:profiles.cedar.id,wren:profiles.wren.id},filters:{accountIds:['cedar','wren']}});
 const firstBrand=await h.command('campaign.send',{id:branded.id,revision:branded.revision});assert.equal(firstBrand.deliveries.length,1);assert.equal(firstBrand.excluded[0].reason,'buying profile not approved or not mapped for this recipient');
 await approve('wren',true);const fullBrand=await h.command('campaign.send',{id:branded.id,revision:branded.revision});assert.equal(fullBrand.deliveries.length,2);
 const brandedRecipient=fullBrand.deliveries.find(d=>d.account_id==='wren'),brandedSheet=await h.api('/api/barrow/campaign-deliveries/'+brandedRecipient.id,undefined,f.buyers.wren);assert.equal(brandedSheet.buyingProfile.seller.legalName,'Synthetic supplier corporation');assert.equal(brandedSheet.items[0].unitCents,2003);assert.deepEqual(brandedSheet.suggestions,[{sku:f.skus[0],quantity:4,...(sourceOrder.lines[0].unit?{unit:sourceOrder.lines[0].unit}:{})}]);
 const brandedPdf=await(await h.request('/api/barrow/campaign-deliveries/'+brandedRecipient.id+'.pdf',f.buyers.wren)).text();assert.ok(brandedPdf.includes('Synthetic supplier corporation'));assert.ok(brandedPdf.includes('CAD 20.03'));
 const brandedPreview=await h.command('sheet.preview',{sheetId:brandedSheet.id,revision:brandedSheet.revision,mode:'replace',lines:brandedSheet.suggestions},f.buyers.wren);
 const brandedOrder=await h.command('order.prepare',{accountId:'wren',profileId:profiles.wren.id,lineSheetId:brandedSheet.id,lineSheetRevision:brandedSheet.revision,campaignDeliveryId:brandedRecipient.id,lines:brandedPreview.cart},f.buyers.wren);assert.equal(brandedOrder.totalCents,8012);assert.equal(brandedOrder.currency,'CAD');
 await h.command('order.submit',{orderId:brandedOrder.id,revision:brandedOrder.revision},{...f.buyers.wren,status:409});
 const submitted=await h.command('order.submit',{orderId:brandedOrder.id,revision:brandedOrder.revision,termsAcceptance:{version:terms.version,accepted:true}},f.buyers.wren);assert.equal(submitted.buyingProfile.seller.legalName,'Synthetic supplier corporation');assert.equal(submitted.termsAcceptance.series,terms.series);
 const filtered=await h.command('campaign.save',{name:'Season activity segment',subject:'Reviewed returning stockist',message:'A currently eligible stockist receives a new proposed assortment.',source:{kind:'products'},lines:[{sku:f.skus[0],quantity:1}],season:'Spring 2027',shipStart:'2027-03-01',shipEnd:'2027-03-31',filters:{channel:'Wholesale',territory:'South',assignedRep:'Synthetic South team',tag:'focus',season:'Spring 2027',lastSeason:{season:'Spring 2027',currency:'CAD',minCents:8000,maxCents:9000}}});
 const filteredSend=await h.command('campaign.send',{id:filtered.id,revision:filtered.revision});assert.deepEqual(filteredSend.deliveries.map(d=>d.account_id),['wren']);
 const lookbook=await h.command('sheet.publish',{accountId:'cedar',profileId:profiles.cedar.id,name:'Seasonal lookbook',season:'Spring 2027',display:'wholesale',shipStart:'2027-03-01',shipEnd:'2027-03-31',skus:[f.skus[0]],presentation:{title:'Synthetic spring story',introduction:'An eligible collection',sections:[{title:'First collection',text:'Review these live products.',skus:[f.skus[0]]}]}});
 const editorial=await h.command('campaign.save',{name:'Lookbook campaign',subject:'Private seasonal presentation',message:'Review the live collection and your own book.',source:{kind:'sheet',id:lookbook.id},filters:{accountIds:['cedar']}}),editorialSent=await h.command('campaign.send',{id:editorial.id,revision:editorial.revision});
 assert.equal((await h.api('/api/barrow/campaign-deliveries/'+editorialSent.deliveries[0].id,undefined,f.buyers.cedar)).presentation.title,'Synthetic spring story');
 await approve('wren',false);assert.ok(!(await h.api('/api/barrow/line-sheets?accountId=wren',undefined,f.buyers.wren)).sheets.some(s=>s.id===brandedSheet.id));assert.equal((await h.request('/api/barrow/campaign-deliveries/'+brandedRecipient.id+'.pdf',f.buyers.wren)).status,404);
 const {createHmac}=await import('node:crypto'),eventId='synthetic-barrow-erasure-event',eventTimestamp=String(Math.floor(Date.now()/1000)),eventBody=JSON.stringify({type:'email.delivered',created_at:new Date(Date.now()-1000).toISOString(),data:{email_id:recipient.provider_message_id,to:[f.wren.value.email]}}),eventSignature=createHmac('sha256',key).update(`${eventId}.${eventTimestamp}.${eventBody}`).digest('base64');
 assert.equal((await h.raw('/api/barrow/campaign-mail/webhook',{method:'POST',headers:{'svix-id':eventId,'svix-timestamp':eventTimestamp,'svix-signature':'v1,'+eventSignature},body:eventBody})).status,200);
 const before=await archive(h),copy=await installation({https:true,bindings:{PIER_ORIGIN:f.pier.origin,PIER_SESSION:f.pier.cookie}});t.after(()=>copy.close());await restore(copy,before);
 await copy.command('campaign.send',{id:draft.id,revision:draft.revision},{status:409});await (await copy.mf.getWorker()).scheduled();assert.equal(copy.mail.deliveries.filter(d=>d.message.subject===draft.subject).length,0);
 const backupEmail=email(43),backup={as:await h.signIn(backupEmail)};
 await h.command('company.invite',{accountId:'wren',email:backupEmail,name:'Synthetic remaining administrator',policy:{rights:['administrator','purchaser'],locations:'all',perOrderLimitCents:null,approvalLimitCents:null},reason:'Retain an authorized company administrator during user erasure.'});
 const invitation=h.mail.requests.findLast(r=>r.message.to.includes(backupEmail)&&r.message.text.includes('companyInvitation')).message,acceptance=new URL(invitation.text.match(/https?:\/\/\S+/)[0]);
 await h.command('company.accept',{invitationId:acceptance.searchParams.get('companyInvitation'),token:acceptance.searchParams.get('companyToken')},backup);
 const buyerId=(await h.api('/api/barrow/state',undefined,f.buyers.wren)).actor.id;
 const member=(await h.api('/api/barrow/company/members?accountId=wren')).members.find(m=>m.userId===buyerId);
 const erasure=await h.command('company.erase',{memberId:member.id,revision:member.revision,confirm:'ERASE',reason:'Owner reviewed the company buyer erasure.'});
 await h.api('/api/barrow/campaign-deliveries/'+recipient.id,undefined,{...f.buyers.wren,status:401});
 assert.ok(!(await h.api('/api/barrow/campaigns/'+draft.id)).deliveries.some(d=>d.id===recipient.id));
 const after=await archive(h);
 const campaignPayloads=after.flatMap(part=>part.items??[]).filter(item=>item.table==='rer_mail_event_receipts'&&item.row.event_namespace==='campaigns');assert.ok(!campaignPayloads.some(item=>item.row.event_json.includes(f.wren.value.email)));
 // Rewinding D1 cannot resurrect a recipient or the provider payload: the independent journal re-applies first.
 const original=before.flatMap(part=>part.items??[]),deliveryRows=original.filter(item=>item.table==='bw_campaign_deliveries'&&item.row.recipient_id===buyerId),receiptRows=original.filter(item=>['rer_mail_event_receipts','rer_mail_event_states'].includes(item.table)&&item.row.event_namespace==='campaigns');
 for(const item of [...deliveryRows,...receiptRows]){const keys=Object.keys(item.row);await h.db.prepare(`INSERT OR REPLACE INTO ${item.table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(key=>item.row[key])).run()}
 await h.db.prepare('DELETE FROM bw_account_erasure_journal WHERE id=?').bind(erasure.revision).run();
 await h.api('/api/barrow/state');assert.ok(!(await h.api('/api/barrow/campaigns/'+draft.id)).deliveries.some(d=>d.id===recipient.id));
 const rewound=await archive(h);assert.ok(!rewound.flatMap(part=>part.items??[]).some(item=>item.table==='rer_mail_event_receipts'&&item.row.event_namespace==='campaigns'&&item.row.event_json.includes(f.wren.value.email)));
 const fenced=await installation();t.after(()=>fenced.close());const refused=await restore(fenced,before,{laterJournal:{sourceIdentity:after[0].sourceIdentity,epoch:after[0].epoch,journal:after[0].journal},status:400});assert.notEqual(refused.error,'later_journal');assert.equal((await fenced.api('/api/barrow/state')).accounts.length,0);
});
