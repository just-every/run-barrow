import { buyingProfilesFixture } from './buying-profiles-fixture.mjs';
import { activateStaff } from './harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

test('PRI-002 / PRI-007: dated volume/graduated breaks, account/group precedence and approved overrides explain and freeze exact commercial totals',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'500');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 const easternDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
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
 const grant=await h.api('/api/barrow/agent-token',{});const agent={as:'',headers:{authorization:`Bearer ${grant.token}`}};const agentDraft=await h.command('order.prepare',{accountId:account.id,lines:[{sku:'OAT-1',quantity:3,unitCents:1}]},agent);assert.equal(agentDraft.totalCents,999);assert.ok(agentDraft.preparedBy.startsWith('agent:'));
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
 let preview=await f.preview();assert.equal(preview.basisCents,4004);assert.equal(preview.totalCents,3604);assert.equal(preview.discountCents,400);assert.equal(preview.beforeMarginCents,2004);assert.equal(preview.marginCents,2404);
 const draft=await f.prepare();assert.equal(draft.totalCents,3604);
 const removed=await f.prepare([lines[0]],{replaces:draft.id});assert.equal(removed.totalCents,1602);assert.equal(removed.lines[0].promotion,undefined);assert.equal((await h.api('/api/barrow/orders/'+draft.id,undefined,buyer)).status,'superseded');
 await f.save([offer,{...offer,id:'exclusive',name:'Priority exclusive',bps:2500,priority:20}]);
 preview=await f.preview();assert.equal(preview.totalCents,3004);assert.equal(preview.discountCents,1000);assert.equal(preview.marginCents,1804);assert.deepEqual(preview.lines.map(l=>l.promotion.offers.map(o=>o.id)),[['exclusive'],['exclusive']]);
 await h.command('order.submit',{orderId:removed.id},buyer);
 const {order,credit,payload}=await promotedReturn(f);assert.equal(order.totalCents,3004);assert.equal(credit.amountCents,751);assert.equal(credit.lines[0].basis.promotion.discountCents,500);
 await f.save([{...offer,bps:9000}]);const replay=await h.command('credit.issue',payload);assert.equal(replay.id,credit.id);assert.equal(replay.amountCents,751);
 const report=await h.api('/api/barrow/reports/quotes?from=2000-01-01&to=2099-12-31&currency=USD');assert.equal(report.totals.promotedOrders,1);assert.equal(report.totals.promotionGrossCents,3004);assert.equal(report.totals.promotionDiscountCents,1000);assert.equal(report.totals.promotionReturnedCents,751);assert.equal(report.totals.netPromotedCents,2253);assert.deepEqual(report.promotionOffers,[{id:'exclusive',name:'Priority exclusive',orders:1,discountCents:1000,grossCents:3004,returnedCents:751,netCents:2253}]);assert.match(report.definitions.promotions,/frozen offer IDs/);
 assert.equal(report.byProduct.find(r=>r.name===lines[0].sku).netPromotedCents,751);assert.equal(report.byProduct.find(r=>r.name===lines[1].sku).netPromotedCents,1502);
 const other=await h.api('/api/barrow/reports/quotes?accountId=wren&from=2000-01-01&to=2099-12-31&currency=CAD');assert.equal(other.totals.promotedOrders,0);
 const current=await h.api('/api/barrow/orders/'+order.id,undefined,buyer);assert.deepEqual(current,order);assert.equal((await h.api('/api/barrow/credits?orderId='+order.id)).credits.length,1);
 const state=await h.api('/api/barrow/export.json');assert.ok(state.lines.some(l=>l.orderId===order.id&&JSON.parse(l.promotion).offers[0].id==='exclusive'));
 // Successive physical receipts consume original net cents, including the final rounding residue.
 await f.save([{...offer,bps:2500}]);let odd=await f.prepare(lines.map(l=>({...l,quantity:3})));await h.command('order.submit',{orderId:odd.id},buyer);odd=await h.command('order.approve',{orderId:odd.id});assert.equal(odd.lines[0].lineCents,2252);
 const upstream=(await f.pier.api('/api/pier/state')).orders.find(o=>o.id===odd.pierOrderId),shipment=await f.pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'Rounding residue shipment',lines:upstream.lines.map(l=>({orderLineId:l.id,quantity:l.quantity}))}),amounts=[];
 for(let n=0;n<3;n++){const receipt=await f.pier.command('return.create',{shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:f.source.location.id,quantity:'1',reason:'Received original discounted unit.'});const note=await h.command('credit.issue',{orderId:odd.id,returnId:receipt.id,lines:[{line:1,quantity:1}],reason:'Reverse only remaining original net value.'});amounts.push(note.amountCents)}assert.deepEqual(amounts,[751,751,750]);
 const allReturns=await h.api('/api/barrow/reports/quotes?from=2000-01-01&to=2099-12-31&currency=USD');assert.equal(allReturns.totals.promotionReturnedCents,3003);assert.equal(allReturns.totals.netPromotedCents,4505);

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
 await h.command('promotion.save',{revision:null,offers:[]},{status:409});await h.command('promotion.save',{revision:f.settings.revision,offers:[{...offer,bps:10001}]},{status:400});
});
