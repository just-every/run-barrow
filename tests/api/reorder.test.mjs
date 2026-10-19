import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderFixture } from './reorder-fixture.mjs';

test('ORD-003: search six-month history, selectively reorder with current SKU/price/minimum/stock review and preserve the original', async t => {
 const fixture=await reorderFixture(t);
 const {pier,products,h,buyer,original,snapshot,date}=fixture;let {account}=fixture;
 const search=async query=>(await h.api(`/api/barrow/orders/history?${new URLSearchParams(query)}`,undefined,{as:buyer})).orders;
 for(const query of [{po:'spring-po'},{from:date,to:date},{sku:'tea-1'},{location:'brooklyn'},{po:'SPRING',from:date,to:date,sku:'JAM-1',location:'flagship'}]) assert.deepEqual((await search(query)).map(order=>order.id),[original.id]);
 for(const query of [{po:'absent'},{from:'2099-01-01'},{to:'2000-01-01'},{sku:'OAT-2'},{location:'Queens'}]) assert.equal((await search(query)).length,0);
 await h.api('/api/barrow/orders/history?from=2026-02-31',undefined,{as:buyer,status:400});
 await h.api('/api/barrow/orders/history?from=2026-06-01&to=2026-01-01',undefined,{as:buyer,status:400});
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:7,prices:[{sku:'OAT-2',unitCents:7001,minQty:2},{sku:'TEA-1',unitCents:6501,minQty:1},{sku:'JAM-1',unitCents:6500,minQty:1}]}});
 const preview=selections=>h.command('order.reorder-preview',{orderId:original.id,selections},{as:buyer});
 const all=original.lines.map(line=>({sku:line.sku}));
 let review=await preview(all);
 assert.ok(review.blockers.some(message=>message.includes('OAT-1')));
 assert.equal(review.lines.find(line=>line.originalSku==='OAT-1').available,null);
 const selections=[{sku:'OAT-1',replacementSku:'OAT-2'},{sku:'TEA-1'},{sku:'JAM-1'}];
 review=await preview(selections);
 assert.deepEqual(review.blockers,[]);assert.equal(review.totalCents,3*(7001+6501+6500));
 const oats=review.lines.find(line=>line.originalSku==='OAT-1');
 assert.equal(oats.sku,'OAT-2');assert.equal(oats.quantity,3);assert.equal(oats.originalUnitCents,6500);assert.equal(oats.unitCents,7001);assert.equal(oats.originalMinQty,1);assert.equal(oats.minQty,2);assert.equal(oats.available,'100');
 assert.ok(oats.differences.some(message=>message.startsWith('Replacement:')));assert.ok(oats.differences.includes('Unit price or currency changed'));assert.ok(oats.differences.includes('Minimum quantity changed'));
 assert.equal(review.originalCurrency,'AUD');assert.equal(review.currency,'USD');assert.equal(review.originalTermsDays,30);assert.equal(review.termsDays,7);
 const reorder=extra=>h.command('order.reorder',{orderId:original.id,selections,fingerprint:review.fingerprint,reference:'AUTUMN-REPEAT',...extra},{as:buyer,status:extra.status??200});
 assert.equal((await reorder({acknowledged:false,status:409})).error.code,'REORDER_CHANGED');
 const selected=await preview([{sku:'TEA-1'}]);assert.equal(selected.lines.length,1);assert.equal(selected.totalCents,19503);
 const duplicate=await h.command('order.reorder-preview',{orderId:original.id,selections:[{sku:'TEA-1'},{sku:'TEA-1'}]},{as:buyer,status:400});assert.equal(duplicate.error.code,'LINES');
 // A material account change invalidates the reviewed comparison.
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.map(p=>({...p,unitCents:p.unitCents+1}))}});
 assert.equal((await reorder({acknowledged:true,status:409})).error.code,'REORDER_CHANGED');
 review=await preview(selections);
 const draft=await reorder({acknowledged:true,totalCents:1,lines:[{sku:'JAM-1',quantity:999}],status:200});
 assert.equal(draft.status,'draft');assert.equal(draft.reorderedFrom,original.id);assert.equal(draft.deliveryLocation,'Brooklyn flagship');assert.equal(draft.reorderReview.acknowledgedBy,(await h.api('/api/barrow/state',undefined,{as:buyer})).actor.id);
 assert.equal(draft.totalCents,3*(7002+6502+6501));assert.equal(draft.reference,'AUTUMN-REPEAT');assert.equal(draft.termsDays,7);
 assert.deepEqual(draft.lines.map(line=>line.sku),review.lines.map(line=>line.sku));assert.ok(draft.lines.every(line=>line.quantity===3));
 assert.equal(draft.reorderReview.fingerprint,review.fingerprint);
 // The ordinary public review/submit door remains the final human checkout step.
 assert.equal((await h.command('order.submit',{orderId:draft.id},{as:buyer})).status,'submitted');
 // Current stock and minimums never silently change a historical commitment.
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,minimumCents:1000000,prices:account.value.prices.map(p=>({...p,minQty:4}))}});
 const blocked=await preview(selections);assert.ok(blocked.blockers.some(s=>s.includes('current minimum')));assert.ok(blocked.blockers.some(s=>s.includes('order minimum')));
 assert.equal((await h.command('order.reorder',{orderId:original.id,selections,fingerprint:blocked.fingerprint,acknowledged:true},{as:buyer,status:409})).error.code,'REORDER_BLOCKED');
 await pier.command('order.create',{customerId:products.customer.id,lines:[{itemId:products.item.id,quantity:'97'}]});
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,minimumCents:0,prices:[{sku:'OAT-1',unitCents:6500,minQty:1}]}});
 const short=await preview([{sku:'OAT-1'}]);assert.ok(short.blockers.some(s=>s.includes('insufficient current availability')));
 const foreign=await h.signIn('another@example.test');
 assert.equal((await h.api('/api/barrow/orders/history',undefined,{as:foreign})).orders.length,0);
 await h.command('order.reorder-preview',{orderId:original.id,selections},{as:foreign,status:404});
 const {token}=await h.api('/api/barrow/agent-token',{});
 await h.command('order.reorder',{orderId:original.id,selections},{as:'',headers:{authorization:`Bearer ${token}`},status:403});
 assert.equal(JSON.stringify((await h.api('/api/barrow/state',undefined,{as:buyer})).orders.find(order=>order.id===original.id)),snapshot);
 assert.equal((await pier.api('/api/pier/state')).orders.length,2); // Original approval plus explicit stock exhaustion; reordering reserved nothing.
});
