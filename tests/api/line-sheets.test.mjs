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
  const order=await h.command('order.prepare',{accountId:d.account_id,lineSheetId:sheet.id,lineSheetRevision:sheet.revision,campaignDeliveryId:d.id,reference:'synthetic-barrow-campaign-'+i,lines:p.cart},who[i]);
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
