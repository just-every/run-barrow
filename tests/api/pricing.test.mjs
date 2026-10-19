import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

test('PRI-002: dated volume/graduated breaks, account/group precedence and approved overrides explain and freeze exact commercial totals',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'500');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 const easternDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const period={effectiveFrom:'2000-01-01',effectiveTo:'2099-12-31'};
 const rule={...period,mode:'volume',breaks:[{fromQuantity:'10',unitCents:800}],groupDiscount:{name:'Independent stores',bps:2000},accountDiscountBps:1000};
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),minimumCents:0,prices:[{sku:'OAT-1',unitCents:1000,minQty:1,pricing:rule,units:[{code:'pallet',baseQuantity:'12',unitCents:10000,packContents:'12 cases',pricing:{...period,mode:'graduated',breaks:[{fromQuantity:'2',unitCents:9000}]}},{code:'measured',baseQuantity:'1',unitCents:333,packContents:'Measured cases',quantityKind:'measured',pricing:{...period,accountDiscountBps:5000}}]}]}});
 const buyer=await h.signIn(account.value.email),as={as:buyer};
 const prepare=(quantity,extra={})=>h.command('order.prepare',{accountId:account.id,reference:'PO-PRICE-RULES',lines:[{sku:'OAT-1',quantity,...extra}]},as);
 const update=async pricing=>account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.map(p=>({...p,pricing}))}});
 const below=await prepare(9);assert.equal(below.totalCents,8100);assert.ok(below.lines[0].pricing.reason.includes('Account discount'));
 const at=await prepare(10);assert.equal(at.totalCents,7200);assert.equal(at.lines[0].unitCents,800);assert.ok(at.lines[0].pricing.reason.includes('Volume break at 10'));assert.equal(at.lines[0].pricing.discountBps,1000);
 const after=await prepare(11);assert.equal(after.totalCents,7920);
 // Historical fixtures represent the same saved rule after its effective date elapsed,
 // without an account edit/revision change. Submission and first approval recheck dates.
 const historical={...account.value,prices:account.value.prices.map(p=>({...p,pricing:{...p.pricing,effectiveTo:'2001-01-01'}}))};
 await h.db.prepare('UPDATE bw_accounts SET value_json=? WHERE id=?').bind(JSON.stringify(historical),account.id).run();
 assert.equal((await h.command('order.submit',{orderId:after.id},{...as,status:409})).error.code,'PRICE_CHANGED');
 const submitted={...at,status:'submitted',submittedBy:(await h.api('/api/barrow/state',undefined,as)).actor.id};
 await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(submitted),at.id).run();
 assert.equal((await h.command('order.approve',{orderId:at.id},{status:409})).error.code,'PRICE_CHANGED');
 await h.db.prepare('UPDATE bw_accounts SET value_json=? WHERE id=?').bind(JSON.stringify(account.value),account.id).run();

 assert.equal((await pier.api('/api/pier/state')).orders.length,0);
 // The account override is an existing supplier approval, never an agent-provided price.
 await update({...rule,override:{unitCents:701,reason:'Approved opening-season deal'}});
 let order=await prepare(11,{unitCents:1,lineCents:1,pricing:{reason:'forged'}});assert.equal(order.totalCents,7711);assert.equal(order.lines[0].pricing.discountBps,0);assert.ok(order.lines[0].pricing.reason.includes('Approved opening-season deal'));
 await h.command('account.save',{id:account.id,revision:account.revision,value:account.value},{...as,status:403});
 await h.command('order.submit',{orderId:order.id},as);order=await h.command('order.approve',{orderId:order.id});assert.equal(order.status,'approved');
 const snapshot=JSON.stringify(order),download=()=>h.request(`/api/barrow/invoices/${order.id}.csv`,as).then(r=>r.text()),issued=await download();assert.ok(issued.includes('Approved opening-season deal'));assert.ok(issued.includes('7711'));
 await update({...rule,mode:'graduated'});
 const graduated=await prepare(11);assert.equal(graduated.totalCents,9720);assert.deepEqual(graduated.lines[0].pricing.segments,[{quantity:'10',unitCents:1000},{quantity:'1',unitCents:800}]);
 // Group discount is eligible only when no account discount is present; zero is an explicit account rule.
 const {accountDiscountBps,...group}=rule;await update(group);assert.equal((await prepare(10)).totalCents,6400);
 await update({...group,accountDiscountBps:0});assert.equal((await prepare(10)).totalCents,8000);
 await update({...rule,effectiveFrom:'2098-01-01'});const future=await prepare(10);assert.equal(future.totalCents,10000);assert.ok(future.lines[0].pricing.reason.startsWith('Outside effective period'));
 await update({...rule,effectiveTo:'2001-01-01'});assert.equal((await prepare(10)).totalCents,10000);
 await update({...rule,effectiveFrom:easternDay,effectiveTo:easternDay});assert.equal((await prepare(10)).totalCents,7200);
 await update({...rule,override:{unitCents:333,reason:'Exact cent case price'}});assert.equal((await prepare(3)).totalCents,999);
 assert.equal((await prepare(1,{unit:'measured'})).totalCents,167);assert.equal((await prepare(1.5,{unit:'measured'})).totalCents,250);
 const mixed=await h.command('order.prepare',{accountId:account.id,lines:[{sku:'OAT-1',unit:'pallet',quantity:3},{sku:'OAT-1',quantity:1}]},as);assert.equal(mixed.totalCents,29333);assert.equal(mixed.lines[0].baseQuantity,'36');assert.equal(mixed.lines[0].pricing.lineCents,29000);
 // Legacy CSV has no pricing columns and must retain native approved rules, as it retains units.
 const csv=`accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty\ncedar,${account.value.name},${account.value.email},${source.customer.id},30,0,OAT-1,1000,1\n`;
 const preview=await h.api('/api/barrow/imports/preview',{csv});await h.api('/api/barrow/imports/apply',{csv,fingerprint:preview.fingerprint});
 account=(await h.api('/api/barrow/state')).accounts[0];assert.equal(account.value.prices[0].pricing.override.unitCents,333);assert.equal(account.value.prices[0].units[0].pricing.mode,'graduated');
 const review=await h.command('order.reorder-preview',{orderId:order.id,selections:[{sku:'OAT-1'}]},as);assert.equal(review.totalCents,3663);assert.ok(review.lines[0].differences.includes('Pricing rule or line total changed'));
 const repeat=await h.command('order.reorder',{orderId:order.id,selections:[{sku:'OAT-1'}],fingerprint:review.fingerprint,acknowledged:true},as);assert.equal(repeat.totalCents,review.totalCents);
 assert.equal(JSON.stringify((await h.api('/api/barrow/state')).orders.find(o=>o.id===order.id)),snapshot);assert.equal(await download(),issued);
 const backup=await archive(h),destination=await installation();t.after(()=>destination.close());await restore(destination,backup);const restored=await destination.api('/api/barrow/state');assert.deepEqual(restored.orders.find(o=>o.id===order.id),order);assert.deepEqual(restored.accounts[0].value.prices,account.value.prices);
 for(const pricing of [{...rule,breaks:[{fromQuantity:'10',unitCents:800},{fromQuantity:'9',unitCents:700}]},{...rule,accountDiscountBps:10001},{...rule,effectiveFrom:'2026-02-30'},{...rule,override:{unitCents:1,reason:''}}]) await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:[{...account.value.prices[0],pricing}]}},{status:400});
 const grant=await h.api('/api/barrow/agent-token',{});const agent={as:'',headers:{authorization:`Bearer ${grant.token}`}};const agentDraft=await h.command('order.prepare',{accountId:account.id,lines:[{sku:'OAT-1',quantity:3,unitCents:1}]},agent);assert.equal(agentDraft.totalCents,999);assert.ok(agentDraft.preparedBy.startsWith('agent:'));
 await h.command('account.save',{id:account.id,revision:account.revision,value:account.value},{as:'',headers:{authorization:`Bearer ${grant.token}`},status:403});
});
