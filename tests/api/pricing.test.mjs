import { buyingProfilesFixture } from './buying-profiles-fixture.mjs';
import { activateStaff } from './harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

test('PRI-002 / PRI-007: dated volume/graduated breaks, account/group precedence and approved overrides explain and freeze exact commercial totals',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'500');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,BARROW_TEST_CLOCK:'2026-10-27T12:00:00Z'}});t.after(()=>h.close());
 const easternDay='2026-10-27';
 const period={effectiveFrom:'2000-01-01',effectiveTo:'2099-12-31'};
 const rule={...period,mode:'volume',breaks:[{fromQuantity:'10',unitCents:800}],groupDiscount:{name:'Independent stores',bps:2000},accountDiscountBps:1000};
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),minimumCents:0,prices:[{sku:'OAT-1',unitCents:1000,minQty:1,pricing:rule,units:[{code:'pallet',baseQuantity:'12',unitCents:10000,packContents:'12 cases',pricing:{...period,mode:'graduated',breaks:[{fromQuantity:'2',unitCents:9000}]}},{code:'measured',baseQuantity:'1',unitCents:333,packContents:'Measured cases',quantityKind:'measured',pricing:{...period,accountDiscountBps:5000}}]}]}});
 const buyer=await h.signIn(account.value.email),as={as:buyer};
 // Each order carries its own PO: a repeated PO is ORD-007's numbered-release journey.
 let prepared=0;const prepare=(quantity,extra={})=>h.command('order.prepare',{accountId:account.id,reference:`PO-PRICE-RULES-${++prepared}`,lines:[{sku:'OAT-1',quantity,...extra}]},as);
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
 const grant=await h.api('/api/barrow/agent-token',{});const agent={as:'',headers:{authorization:`Bearer ${grant.token}`}};const agentDraft=await h.command('order.prepare',{accountId:account.id,lines:[{sku:'OAT-1',quantity:3,unitCents:1}]},agent);assert.equal(agentDraft.totalCents,999);assert.equal(agentDraft.preparedBy,'Barrow scoped agent for Supplier');
 await h.command('account.save',{id:account.id,revision:account.revision,value:account.value},{as:'',headers:{authorization:`Bearer ${grant.token}`},status:403});
});

test('MSRP books import and edit exact USD/CAD cents and preserve configured sheet, PDF and order document prices without changing wholesale totals',async t=>{
 const {sheetFixture,csvRows}=await import('./line-sheet-fixture.mjs');
 const f=await sheetFixture(t),{h,cedar,wren,sheet,other,buyers}=f;
 for(const [a,s,who,code,base,display] of [[cedar,sheet,buyers.cedar,'USD',1201,'both'],[wren,other,buyers.wren,'CAD',1303,'wholesale']]){
  const book=csvRows(await (await h.request(`/api/barrow/price-book.csv?accountId=${a.id}`)).text());assert.equal(book.rows.length,3);assert.equal(book.rows[0].currency,code);assert.equal(book.rows[0].unitCents,String(base));assert.equal(book.rows[0].msrpCents,String(base*2));assert.equal(book.rows[1].msrpCents,'');
  await h.api(`/api/barrow/price-book.csv?accountId=${a.id}`,undefined,{...who,status:403});
  const form=await h.command('cart.form',{accountId:a.id,layout:'vertical',cart:[{sku:f.skus[0],quantity:3}]},who),formRows=csvRows(form.csv);assert.equal(form.currency,code);assert.equal(formRows.rows[0].quantity,'3');
  if(code==='CAD'){assert.equal(formRows.rows[0].currency,'CAD');assert.equal(formRows.rows[0].unitPrice,'13.03');assert.ok(!formRows.header.includes('unitPriceUsd'));const roundTrip=await h.command('cart.preview',{accountId:a.id,csv:form.csv,mode:'replace'},who);assert.equal(roundTrip.totalCents,3909);assert.equal(roundTrip.currency,'CAD');}
  const page=await h.api(`/api/barrow/line-sheets/${s.id}`,undefined,who);assert.equal(page.currency,code);assert.equal(page.items[0].unitCents,base);
  const pdf=await (await h.request(`/api/barrow/line-sheets/${s.id}.pdf`,who)).text();assert.ok(pdf.includes(`Wholesale ${code} ${Math.trunc(base/100)}.${String(base%100).padStart(2,'0')}`));
  if(display==='both'){assert.equal(page.items[0].msrpCents,base*2);assert.equal(page.items[0].marginBps,5000);assert.equal(page.items[1].msrpCents,null);assert.equal(page.items[1].marginBps,null);assert.ok(pdf.includes('Margin 50.00%'));assert.ok(pdf.includes('MSRP absent'));}
  else {assert.equal('msrpCents'in page.items[0],false);assert.equal('marginBps'in page.items[0],false);assert.ok(!pdf.includes('MSRP'));assert.ok(!pdf.includes('Margin'));}
  const cart=await f.preview(s,{lines:[{sku:f.skus[0],quantity:3}]},who);assert.equal(cart.totalCents,base*3);
  let order=await f.prepare(s,cart,who);assert.equal(order.totalCents,base*3);assert.equal(order.currency,code);assert.equal(order.lines[0].msrpCents,base*2);
  order=await h.command('order.submit',{orderId:order.id},who);
  const path=`/api/barrow/orders/${order.id}/confirmations/1`;
  const csv=csvRows(await (await h.request(path+'.csv',who)).text()),document=await (await h.request(path+'.pdf',who)).text();assert.equal(csv.rows[0].unit_cents,String(base));assert.equal(csv.rows[0].order_total_cents,String(base*3));assert.equal(csv.rows[0].currency,code);assert.ok(document.includes(`${code} ${(base*3/100).toFixed(2)}`));
  if(display==='both'){assert.equal(csv.rows[0].msrp_cents,String(base*2));assert.equal(csv.rows[0].margin_bps,'5000');assert.ok(document.includes('MSRP'));assert.ok(document.includes('Margin 50.00%'));}
  else {assert.ok(!csv.header.includes('msrp_cents'));assert.ok(!csv.header.includes('margin_bps'));assert.ok(!document.includes('MSRP'));assert.ok(!document.includes('Margin'));}
  if(display==='both'){
   const before=await h.api('/api/barrow/confirmation-layouts');
   const sparse=await h.command('confirmation-layout.save',{revision:before.revision,name:'Sparse price handoff',columns:['sku','unit_cents'],makeDefault:true});
   const handoff=csvRows(await(await h.request(path+'.csv',who)).text());assert.equal(handoff.rows[0].currency,code);assert.equal(handoff.rows[0].msrp_cents,String(base*2));assert.equal(handoff.rows[0].unit_cents,String(base));
   const bulk=await h.request('/api/barrow/confirmations/export.csv',{method:'POST',body:{confirmations:[{orderId:order.id,number:1}],layout:sparse.defaultId}});assert.equal(bulk.status,200);assert.equal(csvRows(await bulk.text()).rows[0].currency,code);
   await h.command('confirmation-layout.default',{revision:sparse.revision,id:before.defaultId});
  }
 }
 // Edited optional MSRP is exact and absent values stay absent; old published documents keep their revision.
 const edited=await h.command('account.save',{id:cedar.id,revision:cedar.revision,value:{...cedar.value,prices:cedar.value.prices.map((p,i)=>i===0?{...p,msrpCents:3001}:p)}});
 assert.equal(edited.value.prices[0].msrpCents,3001);assert.equal(edited.value.prices[1].msrpCents,undefined);
 const newSheet=await f.publish(edited,'both'),newPage=await h.api(`/api/barrow/line-sheets/${newSheet.id}`,undefined,buyers.cedar);assert.equal(newPage.items[0].marginBps,5998);
 const old=await h.api(`/api/barrow/line-sheets/${sheet.id}`,undefined,buyers.cedar);assert.equal(old.items[0].msrpCents,2402);
 await f.prepare(sheet,{cart:[{sku:f.skus[0],quantity:1}]},buyers.cedar).then(()=>assert.fail('stale published book admitted')).catch(e=>assert.match(e.message,/recipient book or sheet changed/));
 const retailAccount=await h.command('account.save',{id:edited.id,revision:edited.revision,value:{...edited.value,priceDisplay:{confirmation:'retail',orderCsv:'retail'}}});
 const retail=await f.publish(retailAccount,'retail'),retailPage=await h.api(`/api/barrow/line-sheets/${retail.id}`,undefined,buyers.cedar);assert.equal('unitCents'in retailPage.items[0],false);assert.equal(retailPage.items[0].msrpCents,3001);
 const retailPdf=await(await h.request(`/api/barrow/line-sheets/${retail.id}.pdf`,buyers.cedar)).text();assert.ok(retailPdf.includes('MSRP USD 30.01'));assert.ok(!retailPdf.includes('Wholesale USD'));assert.ok(!retailPdf.includes('Margin'));
 const cart=await f.preview(retail,{lines:[{sku:f.skus[0],quantity:1}]});const draft=await f.prepare(retail,cart);await h.command('order.submit',{orderId:draft.id},buyers.cedar);
 const path=`/api/barrow/orders/${draft.id}/confirmations/1`,csv=csvRows(await(await h.request(path+'.csv',buyers.cedar)).text()),pdf=await(await h.request(path+'.pdf',buyers.cedar)).text();assert.ok(!csv.header.includes('unit_cents'));assert.ok(!csv.header.includes('line_cents'));assert.ok(!csv.header.includes('margin_bps'));assert.equal(csv.rows[0].msrp_cents,'3001');assert.equal(csv.rows[0].order_total_cents,'1201');assert.ok(pdf.includes('MSRP USD 30.01'));assert.ok(!pdf.includes('Wholesale USD'));assert.ok(!pdf.includes('Margin'));
 // A CAD quote must not inherit USD delivery rates merely because the preview omitted a currency field.
 const quote=await h.command('quote.request',{accountId:'wren',lines:[{sku:f.skus[0],quantity:1}]},buyers.wren);
 await h.command('shipping.settings',{revision:null,methods:[{id:'parcel',name:'USD parcel',kind:'parcel',accountIds:[],states:[],warehouses:[],minCents:0,maxCents:null,baseCents:1500,handlingCents:0,freeOverCents:null,transitMinDays:2,transitMaxDays:5,quoteRequired:false}]});
 assert.equal((await h.api(`/api/barrow/shipping/options?quoteId=${quote.id}`,undefined,{...buyers.wren,status:409})).error.code,'SHIPPING_CURRENCY');
 assert.equal((await h.api(`/api/barrow/quotes/${quote.id}`,undefined,buyers.wren)).currency,'CAD');
});

const csvRows = text => {
 const [columns, ...rows] = text.trim().split('\r\n').map(row => row.slice(1, -1).split('","').map(value => value.replaceAll('""', '"')));
 return rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
};

test('CAT-006: one company buyer deliberately selects approved brand price books; exact currencies, sellers and accepted terms survive orders, invoices and later seller edits', async t => {
 const f = await buyingProfilesFixture(t), { h, account, buyer, buyerId, profiles, brands, specifications } = f;
 assert.deepEqual((await f.read()).profiles.map(profile => profile.id), [profiles[0].id]);
 assert.equal((await f.read({})).profiles.length, 2);
 await f.catalogue(1, { ...buyer, status: 404 });
 await f.prepare(1, {}, { ...buyer, status: 404 });
 await f.terms(1, { ...buyer, status: 404 });
 const initial = await f.catalogue(0);
 assert.equal(initial.currency, specifications[0].currency); assert.equal(initial.items[0].unitCents, specifications[0].unitCents);
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const staff = await activateStaff(h, 'synthetic-barrow-812@example.test', { role: 'sales-manager', accounts: 'all', warehouses: 'all', reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0 });
 for (const who of [buyer, agent, staff.who]) {
  await h.command('brand.save', { id: brands[0].id, revision: brands[0].revision, value: brands[0].value }, { ...who, status: 403 });
  await h.command('profile.save', { id: profiles[0].id, revision: profiles[0].revision, accountId: account.id, value: profiles[0].value }, { ...who, status: 403 });
  await f.grant(1, true, { ...who, status: 403 });
 }
 await h.command('brand.save', { id: brands[0].id, revision: brands[0].revision, value: { ...brands[0].value, currency: 'CAD' } }, { status: 409 });
 await h.command('profile.save', { id: profiles[0].id, revision: profiles[0].revision, accountId: account.id, value: { ...profiles[0].value, brandId: brands[1].id } }, { status: 409 });
 await f.grant(1);
 assert.deepEqual(new Set((await f.read()).profiles.map(profile => profile.id)), new Set(profiles.map(profile => profile.id)));
 const orders = [];
 for (let index = 0; index < profiles.length; index++) {
  const spec = specifications[index], profile = profiles[index], catalogue = await f.catalogue(index);
  assert.equal(catalogue.currency, spec.currency); assert.equal(catalogue.items[0].unitCents, spec.unitCents);
  let order = await f.prepare(index, { currency: index === 0 ? 'CAD' : 'USD', totalCents: 1, lines: [{ sku: 'OAT-1', quantity: 2, unitCents: 1 }] });
  assert.equal(order.accountId, account.id); assert.equal(order.currency, spec.currency);
  assert.equal(order.lines[0].unitCents, spec.unitCents); assert.equal(order.totalCents, spec.unitCents * 2); assert.equal(order.termsDays, spec.termsDays);
  assert.equal(order.buyingProfile.id, profile.id); assert.equal(order.buyingProfile.brandId, spec.brandId);
  assert.deepEqual(order.buyingProfile.seller, spec.seller); assert.equal(order.buyingProfile.currency, spec.currency);
  await h.command('order.submit', { orderId: order.id }, { ...buyer, status: 409 });
  const before = (await f.terms(index)).assignment.current;
  if (index === 0) {
   await h.command('terms.publish', { series: spec.series, title: 'Mill House updated sales terms', body: 'Contact Mill House Foods before returning goods. The current order records its agreed currency and payment date.' });
   await h.command('order.submit', { orderId: order.id, termsAcceptance: { version: before.version, accepted: true } }, { ...buyer, status: 409 });
  }
  const current = (await f.terms(index)).assignment.current;
  order = await h.command('order.submit', { orderId: order.id, termsAcceptance: { version: current.version, accepted: true } }, buyer);
  assert.equal(order.termsAcceptance.series, spec.series); assert.equal(order.termsAcceptance.version, current.version); assert.equal(order.termsAcceptance.acceptedBy, buyerId);
  order = await h.command('order.approve', { orderId: order.id }); assert.equal(order.status, 'approved'); orders.push(order);
  const response = await h.request(`/api/barrow/invoices/${order.id}.csv`, buyer); assert.equal(response.status, 200);
  const [line] = csvRows(await response.text());
  assert.equal(line.currency, spec.currency); assert.equal(line.unit_cents, String(spec.unitCents)); assert.equal(line.invoice_total_cents, String(spec.unitCents * 2));
  assert.equal(line.buying_profile_id, profile.id); assert.equal(line.brand_id, spec.brandId);
  assert.equal(line.seller_legal_name, spec.seller.legalName); assert.equal(line.seller_address, spec.seller.address); assert.equal(line.seller_registration, spec.seller.registration);
 }
 await f.prepare(1, { replaces: (await f.prepare(0)).id }, { ...buyer, status: 409 });
 let brandedQuote=await h.command('quote.request',{accountId:account.id,profileId:profiles[0].id,lines:[{sku:'OAT-1',quantity:2}]},buyer);
 const validity=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
 brandedQuote=await h.command('quote.propose',{quoteId:brandedQuote.id,revision:brandedQuote.revision,validUntil:validity,lines:[{sku:'OAT-1',quantity:2}]});
 const quoteTerms=(await f.terms(0)).assignment.current;
 const converted=await h.command('quote.accept',{quoteId:brandedQuote.id,number:1,termsAcceptance:{version:quoteTerms.version,accepted:true}},buyer);
 assert.deepEqual(converted.order.buyingProfile.seller,specifications[0].seller);assert.equal(converted.order.lines[0].unitCents,specifications[0].unitCents);

 const historical = await h.api(`/api/barrow/orders/${orders[0].id}`, undefined, buyer);
 await h.command('brand.save', { id: brands[0].id, revision: brands[0].revision, value: { ...brands[0].value, seller: { ...brands[0].value.seller, legalName: 'Mill House Foods Wholesale LLC', address: '50 Broadway, New York, NY 10004' } } });
 assert.deepEqual((await h.api(`/api/barrow/orders/${historical.id}`, undefined, buyer)).buyingProfile, historical.buyingProfile);
 const invoice = await h.request(`/api/barrow/invoices/${historical.id}.csv`, buyer);
 assert.equal(csvRows(await invoice.text())[0].seller_legal_name, historical.buyingProfile.seller.legalName);
 const exported = await h.api('/api/barrow/export.json');
 for (const order of orders) {
  const row = exported.orders.find(row => row.id === order.id);
  assert.deepEqual(row.buyingProfile, order.buyingProfile); assert.equal(row.currency, order.currency); assert.equal(row.totalCents, order.totalCents);
 }
 const revokedDraft=await f.prepare(1);
 await f.grant(1, false);
 await h.command('order.submit',{orderId:revokedDraft.id,termsAcceptance:{version:1,accepted:true}},{...buyer,status:404});
 assert.ok(!(await f.read()).profiles.some(profile => profile.id === profiles[1].id));
 await f.prepare(1, {}, { ...buyer, status: 404 });
 const pierOrders = (await f.pier.api('/api/pier/state')).orders;
 for (const order of orders) assert.ok(pierOrders.some(upstream => upstream.id === order.pierOrderId));
 const backup=await archive(h),recovered=await installation();t.after(()=>recovered.close());await restore(recovered,backup);
 const restored=(await recovered.api('/api/barrow/export.json'));
 assert.ok(restored.profileapprovals.length);assert.ok(restored.profileapprovals.every(approval=>approval.restored===1));
 assert.deepEqual(restored.orders.find(order=>order.id===orders[0].id).buyingProfile,orders[0].buyingProfile);
 const unusedParty=await f.pier.command('party.save',{name:'Birch Hollow Market',kind:'customer'});
 const unused=await h.command('account.save',{id:'synthetic-barrow-816',value:{...accountValue(unusedParty.id,'synthetic-barrow-816@example.test'),name:'Birch Hollow Market'}});
 const unusedBuyer={as:await h.signIn(unused.value.email)},unusedId=(await h.api('/api/barrow/state',undefined,unusedBuyer)).actor.id;
 const unusedProfile=await h.command('profile.save',{id:'synthetic-barrow-817',accountId:unused.id,value:{...profiles[1].value}});
 await h.command('profile.grant',{profileId:unusedProfile.id,userId:unusedId,approved:true,reason:'Supplier approved this existing buyer for this account only.'});
 await h.command('account.erase',{accountId:unused.id,confirm:'ERASE'});
 const erased=await h.api('/api/barrow/export.json');
 assert.ok(!erased.buyingprofiles.some(profile=>profile.accountId===unused.id));assert.ok(!erased.profileapprovals.some(approval=>approval.accountId===unused.id));
 await h.api(`/api/barrow/catalogue?accountId=${unused.id}&profileId=${unusedProfile.id}`,undefined,{...unusedBuyer,status:404});

});

test('promotion mix qualification, removal, exclusive precedence and source-priced partial returns reconcile once in the scoped conversion report',async t=>{
 const {promotionFixture,promotedReturn}=await import('./promotion-fixture.mjs');const f=await promotionFixture(t),{h,buyer,lines,offer}=f;
 let preview=await f.preview();assert.equal(preview.currentTotalCents,3204);assert.equal(preview.basisCents,4004);assert.equal(preview.totalCents,3604);assert.equal(preview.discountCents,400);assert.equal(preview.beforeMarginCents,2004);assert.equal(preview.marginCents,2404);
 const draft=await f.prepare();assert.equal(draft.totalCents,3604);
 const removed=await f.prepare([lines[0]],{replaces:draft.id});assert.equal(removed.totalCents,1602);assert.equal(removed.lines[0].promotion,undefined);assert.equal((await h.api('/api/barrow/orders/'+draft.id,undefined,buyer)).status,'superseded');
 await f.save([offer,{...offer,id:'exclusive',name:'Priority exclusive',bps:2500,priority:20}]);
 preview=await f.preview();assert.equal(preview.totalCents,3004);assert.equal(preview.discountCents,1000);assert.equal(preview.marginCents,1804);assert.deepEqual(preview.lines.map(l=>l.promotion.offers.map(o=>o.id)),[['exclusive'],['exclusive']]);
 await h.command('order.submit',{orderId:removed.id},buyer);
 const {order,credit,payload}=await promotedReturn(f);assert.equal(order.totalCents,3004);assert.equal(credit.amountCents,751);assert.equal(credit.lines[0].basis.promotion.discountCents,500);assert.deepEqual(order.lines.map(l=>[l.promotion.basisCents,l.promotion.discountCents,l.promotion.offers]),[[2002,500,[{id:'exclusive',name:'Priority exclusive',discountCents:500}]],[2002,500,[{id:'exclusive',name:'Priority exclusive',discountCents:500}]]]);
 await f.save([{...offer,bps:9000}]);const replay=await h.command('credit.issue',payload);assert.equal(replay.id,credit.id);assert.equal(replay.amountCents,751);
 const report=await h.api('/api/barrow/reports/quotes?from=2000-01-01&to=2099-12-31&currency=USD');assert.equal(report.totals.promotedOrders,1);assert.equal(report.totals.promotionGrossCents,3004);assert.equal(report.totals.promotionDiscountCents,1000);assert.equal(report.totals.promotionReturnedCents,751);assert.equal(report.totals.netPromotedCents,2253);assert.deepEqual(report.promotionOffers,[{id:'exclusive',name:'Priority exclusive',orders:1,discountCents:1000,grossCents:3004,returnedCents:751,netCents:2253}]);assert.match(report.definitions.promotions,/frozen offer IDs/);
 assert.equal(report.byProduct.find(r=>r.name===lines[0].sku).netPromotedCents,751);assert.equal(report.byProduct.find(r=>r.name===lines[1].sku).netPromotedCents,1502);
 const other=await h.api('/api/barrow/reports/quotes?accountId=wren&from=2000-01-01&to=2099-12-31&currency=CAD');assert.equal(other.totals.promotedOrders,0);
 const current=await h.api('/api/barrow/orders/'+order.id,undefined,buyer);assert.deepEqual(current,order);assert.equal((await h.api('/api/barrow/credits?orderId='+order.id)).credits.length,1);
 const state=await h.api('/api/barrow/export.json');assert.deepEqual(state.lines.filter(l=>l.orderId===order.id).map(l=>JSON.parse(l.promotion)),[{basisCents:2002,discountCents:500,offers:[{id:'exclusive',name:'Priority exclusive',discountCents:500}]},{basisCents:2002,discountCents:500,offers:[{id:'exclusive',name:'Priority exclusive',discountCents:500}]}]);
 // Successive physical receipts consume original net cents, including the final rounding residue.
 await f.save([{...offer,bps:2500}]);let odd=await f.prepare(lines.map(l=>({...l,quantity:3})));await h.command('order.submit',{orderId:odd.id},buyer);odd=await h.command('order.approve',{orderId:odd.id});assert.equal(odd.lines[0].lineCents,2252);
 const upstream=(await f.pier.api('/api/pier/state')).orders.find(o=>o.id===odd.pierOrderId),shipment=await f.pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'Rounding residue shipment',lines:upstream.lines.map(l=>({orderLineId:l.id,quantity:l.quantity}))}),amounts=[];
 for(let n=0;n<3;n++){const receipt=await f.pier.command('return.create',{shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:f.source.location.id,quantity:'1',reason:'Received original discounted unit.'});const note=await h.command('credit.issue',{orderId:odd.id,returnId:receipt.id,lines:[{line:1,quantity:1}],reason:'Reverse only remaining original net value.'});amounts.push(note.amountCents)}assert.deepEqual(amounts,[751,751,750]);
 const allReturns=await h.api('/api/barrow/reports/quotes?from=2000-01-01&to=2099-12-31&currency=USD');assert.equal(allReturns.totals.promotionReturnedCents,3003);assert.equal(allReturns.totals.netPromotedCents,4505);

 // Fixed historical preparation instants isolate period, account and currency independently.
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.preparedAt','2026-04-12T16:00:00Z') WHERE id IN (?,?)").bind(order.id,odd.id).run();
 const scoped=()=>h.api('/api/barrow/reports/quotes?from=2026-04-01&to=2026-04-30&currency=USD&accountId=cedar');
 const april=await scoped();assert.deepEqual([april.totals.promotedOrders,april.totals.promotionDiscountCents,april.totals.promotionGrossCents,april.totals.promotionReturnedCents,april.totals.netPromotedCents],[2,2502,7508,3003,4505]);
 assert.deepEqual(april.byRep.map(r=>[r.name,r.promotedOrders,r.promotionDiscountCents,r.promotionGrossCents,r.promotionReturnedCents,r.netPromotedCents]),[['Unassigned',2,2502,7508,3003,4505]]);
 assert.deepEqual(april.byCohort.map(r=>[r.name,r.promotedOrders,r.promotionDiscountCents,r.promotionGrossCents,r.promotionReturnedCents,r.netPromotedCents]),[['2026-04',2,2502,7508,3003,4505]]);
 assert.deepEqual(april.byProduct.map(r=>[r.name,r.promotedOrders,r.promotionDiscountCents,r.promotionGrossCents,r.promotionReturnedCents,r.netPromotedCents]),[[lines[1].sku,2,1251,3754,0,3754],[lines[0].sku,2,1251,3754,3003,751]]);
 for(const query of ['from=2026-05-01&to=2026-05-31&currency=USD&accountId=cedar','from=2026-04-01&to=2026-04-30&currency=USD&accountId=wren','from=2026-04-01&to=2026-04-30&currency=CAD&accountId=cedar']){const empty=await h.api('/api/barrow/reports/quotes?'+query);assert.deepEqual([empty.totals.promotedOrders,empty.totals.promotionDiscountCents,empty.totals.promotionGrossCents,empty.totals.promotionReturnedCents,empty.totals.netPromotedCents],[0,0,0,0,0]);assert.deepEqual(empty.promotionOffers,[]);}
 // Each non-placed state and cancellation is excluded, even with a frozen promotion.
 const ignored=await f.prepare();await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.preparedAt','2026-04-12T16:00:00Z') WHERE id=?").bind(ignored.id).run();
 assert.equal((await scoped()).totals.promotedOrders,2);await h.command('order.submit',{orderId:ignored.id},buyer);assert.equal((await scoped()).totals.promotedOrders,3);await h.command('order.approve',{orderId:ignored.id});await h.command('order.cancel',{orderId:ignored.id,reason:'Supplier cancelled this promoted order before dispatch.'});assert.equal((await scoped()).totals.promotedOrders,2);
 await f.pier.close();const unknown=await scoped();assert.equal(unknown.returnsSource,'unavailable');assert.deepEqual([unknown.totals.promotedOrders,unknown.totals.promotionGrossCents,unknown.totals.promotionReturnedCents,unknown.totals.netPromotedCents],[2,7508,null,null]);
 assert.deepEqual(unknown.promotionOffers.map(r=>[r.id,r.returnedCents,r.netCents]),[['exclusive',null,null],['spring-mix',null,null]]);
 for(const rows of [unknown.byProduct,unknown.byRep,unknown.byCohort]){assert.ok(rows.length>0);for(const row of rows)assert.deepEqual([row.promotionReturnedCents,row.netPromotedCents],[null,null]);}


});

test('fixed bundle requirements, dated account eligibility, ordered stacking and stale promotion drafts are enforced through public commands',async t=>{
 const {promotionFixture}=await import('./promotion-fixture.mjs');const f=await promotionFixture(t),{h,offer,lines,buyer}=f;
 const fixed={...offer,id:'fixed',kind:'fixed',quantities:Object.fromEntries(lines.map(l=>[l.sku,2]))};await f.save([fixed]);assert.equal((await f.preview()).totalCents,3604);assert.equal((await f.preview([{...lines[0],quantity:1},lines[1]])).discountCents,0);
 const stack={...offer,id:'first',stackable:true,priority:30};await f.save([stack,{...stack,id:'second',bps:2000,priority:20},{...offer,id:'lower-exclusive',bps:9000,priority:10}]);let preview=await f.preview();assert.equal(preview.totalCents,2308);assert.deepEqual(preview.lines[0].promotion.offers.map(o=>o.id),['first','second']);
 await f.save([{...offer,from:'1900-01-01',to:'1900-12-31'}]);assert.equal((await f.preview()).discountCents,0);
 await f.save([{...offer,from:'2199-01-01',to:'2199-12-31'}]);assert.equal((await f.preview()).discountCents,0);
 await f.save([{...offer,accounts:['wren']}]);assert.equal((await f.preview()).discountCents,0);
 await f.save([offer]);const draft=await f.prepare();await f.save([{...offer,bps:1500}]);const refused=await h.command('order.submit',{orderId:draft.id},{...buyer,status:409});assert.equal(refused.error.code,'PRICE_CHANGED');
 await h.command('promotion.save',{revision:f.settings.revision,offers:[offer]}, {...buyer,status:403});await h.command('promotion.preview',{accountId:'cedar',lines},{...buyer,status:403});assert.equal((await h.request('/api/barrow/promotions',buyer)).status,403);
 const revise=await f.prepare();await h.command('order.submit',{orderId:revise.id},buyer);const submitted=await h.api('/api/barrow/orders/'+revise.id,undefined,buyer);const revised=await h.command('order.revise',{orderId:submitted.id,revision:submitted.revision,changes:[{line:0,quantity:1}]},buyer);assert.equal(revised.totalCents,2403);assert.ok(revised.lines.every(l=>!l.promotion));

 const noCost=await h.command('promotion.preview',{accountId:'cedar',lines});assert.deepEqual([noCost.currentTotalCents,noCost.costCents,noCost.beforeMarginCents,noCost.marginCents,noCost.marginImpactCents,noCost.marginBps],[3204,null,null,null,null,null]);
 const admin={as:await h.signIn('admin@example.test','admin')};const adminSaved=await h.command('promotion.save',{revision:f.settings.revision,offers:[{...offer,name:'Admin spring',bps:1500}]},admin);assert.notEqual(adminSaved.revision,f.settings.revision);assert.deepEqual((await h.api('/api/barrow/promotions')).offers.map(o=>[o.id,o.name,o.bps]),[['spring-mix','Admin spring',1500]]);assert.equal((await f.preview()).totalCents,3404);
 let revision=adminSaved.revision;
 const publish=async offers=>{const saved=await h.command('promotion.save',{revision,offers});revision=saved.revision;return saved};
 await publish([offer]);const unrelated=await f.preview([...lines,{sku:f.skus[2],quantity:2}]);assert.equal(unrelated.totalCents,5206);assert.deepEqual(unrelated.lines.map(l=>[l.sku,l.lineCents,l.promotion?.discountCents??0]),[[lines[0].sku,1802,200],[lines[1].sku,1802,200],[f.skus[2],1602,0]]);
 const twice=await f.preview(lines.map(l=>({...l,quantity:4})));assert.deepEqual([twice.basisCents,twice.discountCents,twice.totalCents],[8008,800,7208]);assert.deepEqual(twice.lines.map(l=>l.promotion.offers),[[{id:'spring-mix',name:'Spring mix',discountCents:400}],[{id:'spring-mix',name:'Spring mix',discountCents:400}]]);
 await publish([{...offer,id:'z-tie',bps:9000},{...offer,id:'a-tie',bps:2500}]);const tied=await f.preview();assert.equal(tied.totalCents,3004);assert.deepEqual(tied.lines.map(l=>l.promotion.offers.map(o=>o.id)),[['a-tie'],['a-tie']]);
 let account=(await h.api('/api/barrow/state')).accounts.find(a=>a.id==='cedar');
 const changePrices=async edit=>account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.map(edit)}});
 await changePrices(p=>({...p,pricing:{effectiveFrom:'2000-01-01',effectiveTo:'2099-12-31',groupDiscount:{name:'Trade group',bps:3000}},units:[{code:'pair',baseQuantity:'2',unitCents:2002,packContents:'Two pieces'}]}));
 await publish([{...offer,bps:2500}]);const grouped=await f.preview();assert.deepEqual([grouped.currentTotalCents,grouped.basisCents,grouped.totalCents],[2802,4004,3004]);
 const pairs=lines.map(l=>({...l,quantity:1,unit:'pair'}));const mixedUnits=await f.preview(pairs);assert.equal(mixedUnits.totalCents,3004);assert.deepEqual(mixedUnits.lines.map(l=>l.baseQuantity),['2','2']);
 await publish([fixed]);assert.equal((await f.preview(pairs)).totalCents,3604);assert.equal((await f.preview([pairs[0],{...lines[1],quantity:1}])).discountCents,0);
 await changePrices(p=>({...p,pricing:{effectiveFrom:'2000-01-01',effectiveTo:'2099-12-31',override:{unitCents:701,reason:'Supplier approved price'}}}));
 await publish([offer]);const overridden=await f.preview();assert.equal(overridden.totalCents,2804);assert.ok(overridden.lines.every(l=>!l.promotion));
 await changePrices(p=>({...p,pricing:{effectiveFrom:'2000-01-01',effectiveTo:'2099-12-31',accountDiscountBps:2000}}));
 const requested=await h.command('quote.request',{accountId:'cedar',lines},buyer);const proposed=await h.command('quote.propose',{quoteId:requested.id,revision:requested.revision,validUntil:'2099-12-31',lines:lines.map(l=>({...l,unitCents:700}))});
 const allowed=await h.command('quote.approve',{quoteId:requested.id,revision:proposed.revision,number:1,reason:'Explicit negotiated offer'});const accepted=await h.command('quote.accept',{quoteId:allowed.id,number:1},buyer);const quoted=await h.api('/api/barrow/orders/'+accepted.order.id,undefined,buyer);assert.equal(quoted.totalCents,2800);assert.ok(quoted.lines.every(l=>l.quote&&!l.promotion));
 const awaiting=await f.prepare();await h.command('order.submit',{orderId:awaiting.id},buyer);await publish([{...offer,bps:1500}]);assert.equal((await h.command('order.approve',{orderId:awaiting.id},{status:409})).error.code,'PRICE_CHANGED');assert.equal((await h.api('/api/barrow/orders/'+awaiting.id)).status,'submitted');
 // A placed stacked order appears under both frozen offers, but only once in the summary.
 await publish([stack,{...stack,id:'second',bps:2000,priority:20}]);const stacked=await f.prepare();await h.command('order.submit',{orderId:stacked.id},buyer);await h.command('order.approve',{orderId:stacked.id});
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.preparedAt','2026-06-12T16:00:00Z') WHERE id=?").bind(stacked.id).run();
 const stackedReport=await h.api('/api/barrow/reports/quotes?from=2026-06-01&to=2026-06-30&currency=USD');assert.deepEqual([stackedReport.totals.promotedOrders,stackedReport.totals.promotionDiscountCents,stackedReport.totals.promotionGrossCents,stackedReport.totals.promotionReturnedCents,stackedReport.totals.netPromotedCents],[1,896,2308,0,2308]);assert.deepEqual(stackedReport.promotionOffers,[{id:'first',name:'Spring mix',orders:1,discountCents:320,grossCents:2308,returnedCents:0,netCents:2308},{id:'second',name:'Spring mix',orders:1,discountCents:576,grossCents:2308,returnedCents:0,netCents:2308}]);
 await h.command('promotion.save',{revision:null,offers:[]},{status:409});await h.command('promotion.save',{revision,offers:[{...offer,bps:10001}]},{status:400});
});

test('scheduled book revisions quote exact USD prices on either side of midnight Eastern and refuse stale cart and quote acceptance',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'500');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,BARROW_TEST_CLOCK:'2030-01-02T04:59:59Z'}});t.after(()=>h.close());
 const prices=[{sku:'OAT-1',unitCents:1201,minQty:1}],revised=[{sku:'OAT-1',unitCents:1303,minQty:1}];
 let a=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),minimumCents:0,currency:'USD',prices,priceRevisions:[{effectiveFrom:'2030-01-02',prices:revised}]}});
 const buyer={as:await h.signIn(a.value.email)};
 await h.command('brand.save',{id:'scheduled-usd',value:{name:'Scheduled seller',currency:'USD',seller:{legalName:'Synthetic Barrow Seller',address:'101 Main Street, New York NY 10001'}}});
 const profile=await h.command('profile.save',{id:'scheduled-profile',accountId:a.id,value:{brandId:'scheduled-usd',name:'Scheduled buyer book',minimumCents:0,termsDays:30,prices,priceRevisions:a.value.priceRevisions}});
 const buyerId=(await h.api('/api/barrow/state',undefined,buyer)).actor.id;await h.command('profile.grant',{profileId:profile.id,userId:buyerId,approved:true,reason:'Supplier approves the scheduled USD book.'});
 const request=()=>h.command('quote.request',{accountId:a.id,profileId:profile.id,lines:[{sku:'OAT-1',quantity:3}]},buyer);
 const before=await request();assert.deepEqual(before.request.map(l=>[l.unitCents,l.lineCents]),[[1201,3603]]);assert.equal(before.currency,'USD');
 await h.command('quote.propose',{quoteId:before.id,revision:before.revision,lines:[{sku:'OAT-1',quantity:3}],termsDays:30,shipping:'No delivery charge',validUntil:'2030-01-30'});
 const sheet=await h.command('sheet.publish',{accountId:a.id,name:'Before scheduled prices',season:'Winter',skus:['OAT-1'],display:'wholesale',shipStart:'2030-01-01',shipEnd:'2030-01-31'});
 const draft=await h.command('order.prepare',{accountId:a.id,reference:'Before effective book',lines:[{sku:'OAT-1',quantity:3}]},buyer);assert.equal(draft.totalCents,3603);
 await h.configure({BARROW_TEST_CLOCK:'2030-01-02T05:00:00Z'});
 const after=await request();assert.deepEqual(after.request.map(l=>[l.unitCents,l.lineCents]),[[1303,3909]]);assert.equal(after.currency,'USD');assert.ok((await(await h.request('/api/barrow/price-book.csv?accountId=cedar')).text()).includes('1303'));
 assert.equal((await h.command('order.submit',{orderId:draft.id},{...buyer,status:409})).error.code,'PRICE_CHANGED');
 assert.equal((await h.command('order.prepare',{accountId:a.id,lineSheetId:sheet.id,lineSheetRevision:sheet.revision,lines:[{sku:'OAT-1',quantity:3}]},{...buyer,status:409})).error.code,'CHANGED');
 assert.equal((await h.command('quote.accept',{quoteId:before.id,number:1},{...buyer,status:409})).error.code,'QUOTE_STALE');
 assert.deepEqual((await h.api('/api/barrow/quotes/'+before.id,undefined,buyer)).request.map(l=>[l.unitCents,l.lineCents]),[[1201,3603]]);
 await h.command('quote.propose',{quoteId:after.id,revision:after.revision,lines:[{sku:'OAT-1',quantity:3}],termsDays:30,shipping:'No delivery charge',validUntil:'2030-01-30'});
 const accepted=(await h.command('quote.accept',{quoteId:after.id,number:1},buyer)).order;assert.equal(accepted.totalCents,3909);
 await h.command('account.save',{id:a.id,revision:a.revision,value:a.value},{...buyer,status:403});
 for(const priceRevisions of [[{effectiveFrom:'2030-02-30',prices}],[{effectiveFrom:'2030-01-02',prices},{effectiveFrom:'2030-01-02',prices}],[{effectiveFrom:'2030-01-02',prices:[{...prices[0],unitCents:1.5}]}]])await h.command('account.save',{id:a.id,revision:a.revision,value:{...a.value,priceRevisions}},{status:409});
 a=await h.command('price-book.import',{accountId:a.id,revision:a.revision,csv:'sku,currency,unitCents,msrpCents,minQty\nOAT-1,USD,1409,,1\n'});
 assert.equal(a.value.prices[0].unitCents,1201);assert.equal(a.value.priceRevisions[0].prices[0].unitCents,1409);
 const revisedQuote=await h.command('quote.request',{accountId:a.id,lines:[{sku:'OAT-1',quantity:3}]},buyer);assert.deepEqual(revisedQuote.request.map(l=>[l.unitCents,l.lineCents]),[[1409,4227]]);
 assert.deepEqual((await request()).request.map(l=>[l.unitCents,l.lineCents]),[[1303,3909]],'The independent brand book is unchanged by the account CSV import.');
 const basis={asOf:'2030-01-01',numerator:1,denominator:1,source:'Synthetic recorded USD reference'};
 a=await h.command('account.save',{id:a.id,revision:a.revision,value:{...a.value,usdConversion:basis,priceRevisions:[...a.value.priceRevisions,{effectiveFrom:'2030-02-01',prices:[{sku:'OAT-1',unitCents:1709,minQty:1}]}]}});
 const csv=`accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty\ncedar,${a.value.name},${a.value.email},${source.customer.id},30,0,OAT-1,1411,1\n`;
 const preview=await h.api('/api/barrow/imports/preview',{csv});await h.api('/api/barrow/imports/apply',{csv,fingerprint:preview.fingerprint});
 const imported=await h.api('/api/barrow/accounts/by-id/cedar');assert.deepEqual(imported.value.priceRevisions,a.value.priceRevisions);assert.deepEqual(imported.value.usdConversion,basis);assert.equal(imported.value.prices[0].unitCents,1411);
 assert.deepEqual((await h.command('quote.request',{accountId:a.id,lines:[{sku:'OAT-1',quantity:3}]},buyer)).request.map(l=>[l.unitCents,l.lineCents]),[[1409,4227]]);
 const backup=await archive(h),restored=await installation();t.after(()=>restored.close());await restore(restored,backup);assert.deepEqual((await restored.api('/api/barrow/accounts/by-id/cedar')).value.priceRevisions,a.value.priceRevisions);
});

test('explicit foreign currency books preserve exact cents in every commercial document and disclose a frozen dated USD reporting basis',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'500');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,BARROW_TEST_CLOCK:'2030-01-03T12:00:00Z'}});t.after(()=>h.close());
 const basis={asOf:'2030-01-02',numerator:73,denominator:100,source:'Synthetic supplier daily reference'};
 let a=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),minimumCents:0,currency:'CAD',prices:[{sku:'OAT-1',unitCents:1303,minQty:1}],usdConversion:basis}});
 const buyer={as:await h.signIn(a.value.email)},records=[];
 for(const currency of ['CAD','EUR','GBP']) {
  a=await h.command('account.save',{id:a.id,revision:a.revision,value:{...a.value,currency}});
  const csv=`accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty\ncedar,${a.value.name},${a.value.email},${source.customer.id},30,0,OAT-1,${currency==='EUR'?1411:1423},1\n`;
  assert.equal((await h.api('/api/barrow/imports/preview',{csv},{status:409})).error.code,'ACCOUNT_CURRENCY');
  const unchanged=await h.api('/api/barrow/accounts/by-id/cedar');assert.equal(unchanged.revision,a.revision);assert.equal(unchanged.value.prices[0].unitCents,1303);assert.deepEqual(unchanged.value.usdConversion,basis);

  const quote=await h.command('quote.request',{accountId:a.id,lines:[{sku:'OAT-1',quantity:3}]},buyer);
  assert.equal(quote.currency,currency);assert.deepEqual(quote.request.map(l=>[l.unitCents,l.lineCents]),[[1303,3909]]);
  const proposed=await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,validUntil:'2030-01-31',lines:[{sku:'OAT-1',quantity:3}]});assert.equal(proposed.currency,currency);assert.equal(proposed.revisions[0].totalCents,3909);
  let order=await h.command('order.prepare',{accountId:a.id,reference:'Original '+currency,lines:[{sku:'OAT-1',quantity:3,unitCents:1}],currency:'USD'},buyer);
  assert.equal(order.currency,currency);assert.equal(order.totalCents,3909);assert.deepEqual(order.lines.map(l=>[l.quantity,l.unitCents,l.lineCents]),[[3,1303,3909]]);assert.deepEqual(order.usdConversion,basis);
  await h.command('order.submit',{orderId:order.id},buyer);order=await h.command('order.approve',{orderId:order.id});assert.equal(order.status,'approved');
  const invoice=await(await h.request(`/api/barrow/invoices/${order.id}.csv`,buyer)).text();assert.ok(invoice.includes(currency));assert.ok(invoice.includes('3909'));
  const confirmation=await(await h.request(`/api/barrow/orders/${order.id}/confirmations/1.csv`,buyer)).text();assert.ok(confirmation.includes(currency));assert.ok(confirmation.includes('3909'));assert.ok(confirmation.includes('1303'));
  const pdf=await(await h.request(`/api/barrow/orders/${order.id}/confirmations/1.pdf`,buyer)).text();assert.ok(pdf.includes(currency+' 39.09'));
  const statement=await h.api('/api/barrow/statements/cedar?to=2030-01-31',undefined,buyer);assert.equal(statement.sections.find(s=>s.currency===currency).closingCents,3909);
  for(const suffix of ['.csv','.pdf']){const document=await(await h.request('/api/barrow/statements/cedar'+suffix+'?to=2030-01-31',buyer)).text();assert.ok(document.includes(currency));assert.ok(document.includes(suffix==='.csv'?'3909':'39.09'))}
  records.push({order,invoice,confirmation,pdf});
 }
 a=await h.command('account.save',{id:a.id,revision:a.revision,value:{...a.value,usdConversion:{...basis,numerator:99},prices:[{sku:'OAT-1',unitCents:9999,minQty:1}]}});
 const finance=await h.api('/api/barrow/reports/finance?asOf=2030-01-31'),sales=await h.api('/api/barrow/reports/sales?from=2030-01-01&to=2030-01-31');
 assert.equal(finance.rows.length,3);assert.equal(sales.rows.length,3);
 for(const report of [finance,sales])assert.deepEqual(report.rows.map(row=>[row.currency,row.usdCents,row.usdConversionDate,row.usdRateNumerator,row.usdRateDenominator,row.usdConversionSource]).sort(),['CAD','EUR','GBP'].map(currency=>[currency,2854,'2030-01-02',73,100,basis.source]));
 for(const report of ['finance','sales']){const csv=await(await h.request(`/api/barrow/reports/${report}.csv?asOf=2030-01-31&from=2030-01-01&to=2030-01-31`)).text();assert.ok(csv.includes('2854'));assert.ok(csv.includes('2030-01-02'));assert.ok(csv.includes(basis.source))}
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);assert.deepEqual(exported.orders.map(o=>[o.currency,o.totalCents]).sort(),[['CAD',3909],['EUR',3909],['GBP',3909]]);assert.ok(exported.lines.every(l=>l.unitCents===1303&&l.lineCents===3909));
 for(const {order,invoice,confirmation,pdf}of records){assert.equal(await(await h.request(`/api/barrow/invoices/${order.id}.csv`,buyer)).text(),invoice);assert.equal(await(await h.request(`/api/barrow/orders/${order.id}/confirmations/1.csv`,buyer)).text(),confirmation);assert.equal(await(await h.request(`/api/barrow/orders/${order.id}/confirmations/1.pdf`,buyer)).text(),pdf)}
 const noBasis=await h.command('account.save',{id:a.id,revision:a.revision,value:{...a.value,usdConversion:undefined}});
 const plain=await h.command('order.prepare',{accountId:a.id,reference:'No inferred conversion',lines:[{sku:'OAT-1',quantity:1}]},buyer);await h.command('order.submit',{orderId:plain.id},buyer);await h.command('order.approve',{orderId:plain.id});assert.equal((await h.api('/api/barrow/reports/finance?asOf=2030-01-31')).rows.find(r=>r.orderId===plain.id).usdCents,null);
 await h.command('account.save',{id:a.id,revision:noBasis.revision,value:{...noBasis.value,usdConversion:{...basis,denominator:0}}},{status:409});
});

test('seasonal brand profile requires current approval and keeps the exact CAD seller, deposit and linked invoice without mixing currencies',async t=>{
 const {prebookFixture}=await import('./prebook-fixture.mjs');
 const f=await prebookFixture(t),{h,pier,product,po,buyer,account,publication,input}=f;
 const brand=await h.command('brand.save',{id:'synthetic-barrow-710',revision:null,value:{name:'Canadian seasonal seller',seller:{legalName:'Synthetic Barrow Canada Inc.',address:'20 Bay Street, Toronto, ON'},currency:'CAD'}});
 const profile=await h.command('profile.save',{id:'synthetic-barrow-711',revision:null,accountId:account.id,value:{brandId:brand.id,name:'Canadian seasonal buying',minimumCents:0,termsDays:14,prices:[{sku:'OAT-1',unitCents:8303,minQty:1},{sku:'RYE-1',unitCents:3400,minQty:1}]}});
 await h.command('prebook.publish',{...publication,id:'spring-cad',name:'Spring Canada',currency:'CAD',revision:null});
 const request={...input,profileId:profile.id,currency:'USD',totalCents:1,prebook:{seasonId:'spring-cad',windowIds:['first','second']}};
 await h.command('order.prepare',request,{...buyer,status:404});
 const buyerId=(await h.api('/api/barrow/state',undefined,buyer)).actor.id;
 await h.command('profile.grant',{profileId:profile.id,userId:buyerId,approved:true,reason:'Supplier approved this exact company purchaser for the Canadian seller.'});
 const draft=await h.command('order.prepare',request,buyer);assert.equal(draft.currency,'CAD');assert.equal(draft.totalCents,86824);assert.equal(draft.prebook.depositCents,26048);assert.equal(draft.buyingProfile.brandId,brand.id);assert.equal(draft.buyingProfile.seller.legalName,'Synthetic Barrow Canada Inc.');
 await h.command('order.prepare',{...request,lines:[{sku:'OAT-1',quantity:8,brandId:'synthetic-barrow-foreign'},{sku:'RYE-1',quantity:6}]},{...buyer,status:409});
 await h.command('order.submit',{orderId:draft.id},buyer);const order=await h.command('order.approve',{orderId:draft.id});
 const payment=await f.deposit(order);assert.equal(payment.currency,'CAD');assert.equal(payment.amountCents,26048);assert.equal(payment.surchargeCents,0);
 await h.command('prebook.close',{id:'spring-cad',revision:(await h.api('/api/barrow/prebook-seasons')).revision,reason:'Canadian intake finished.'});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'Canadian release source stock',lines:[{poLineId:po.lines[0].id,locationId:product.location.id,quantity:'12',cost:'20.00'}]});
 const release=await h.command('prebook.release',{orderId:order.id,windowId:'first',revision:order.revision,reason:'Release first Canadian commitment.'});
 const child=await h.command('order.approve',{orderId:release.releaseId});assert.equal(child.currency,'CAD');assert.equal(child.totalCents,66424);assert.deepEqual(child.buyingProfile,order.buyingProfile);
 const csv=await (await h.request('/api/barrow/invoices/'+child.id+'.csv',buyer)).text();assert.ok(csv.includes('CAD'));assert.ok(csv.includes('66424'));assert.ok(csv.includes('Synthetic Barrow Canada Inc.'));
 const report=await h.api('/api/barrow/reports/sales?from=2027-01-01&to=2027-12-31');assert.equal(report.totals.length,1);assert.equal(report.totals[0].currency,'CAD');assert.equal(report.totals[0].bookedCents,86824);assert.equal(report.totals[0].invoicedCents,66424);
 await h.command('profile.grant',{profileId:profile.id,userId:buyerId,approved:false,reason:'Supplier revoked Canadian purchasing.'});
 await h.command('order.prepare',request,{...buyer,status:404});
});
