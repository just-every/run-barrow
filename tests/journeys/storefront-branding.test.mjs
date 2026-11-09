// Built native storefront and HTTP settings; the connected pinned Pier remains the stock authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {installation,stock,accountValue,activateStaff,archive,restore} from '../api/harness.mjs';
import {captureWidths,captureRegionWidths,signedContext} from './browser-helpers.mjs';
import {jpeg,withExif,imageSha} from '../fixtures/confirmation-image.mjs';

const email=number=>['synthetic-barrow-'+number,'example.test'].join(String.fromCharCode(64));
async function open(page,h) {
 await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup') {
  await page.getByLabel('Your name').fill('Merchant owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 }
 await page.getByRole('button',{name:'Orders',exact:true}).waitFor();
}
async function noIconWithoutTooltip(page) {
 assert.deepEqual(await page.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).map(element=>element.outerHTML)),[]);
}
function contrast(first,second) {
 const luminance=hex=>hex.match(/\w\w/g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
 const a=luminance(first),b=luminance(second);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

test('owner publishes and revises merchant identity, unsafe saves change nothing, and two buyers keep exact prices through validation and supplier confirmation',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'100');
 const second=await pier.command('party.save',{name:'Wren Market',kind:'customer'});
 const h=await installation({built:true,https:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id,email(671)),name:'Cedar Market'}});
 await h.command('account.save',{id:'wren',value:{...accountValue(second.id,email(672)),name:'Wren Market',minimumCents:0,prices:[{sku:'OAT-1',unitCents:7200,minQty:1}]}});
 const buyer={as:await h.signIn(email(671))},other={as:await h.signIn(email(672))};
 const legal=await h.command('seller.identity',{revision:null,legalName:'Mill House Foods LLC',address:'12 Spring Street, New York'});
 let existing=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-670',lines:[{sku:'OAT-1',quantity:2}]},buyer);
 existing=await h.command('order.submit',{orderId:existing.id},buyer);existing=await h.command('order.approve',{orderId:existing.id});
 const before={accounts:(await h.api('/api/barrow/state')).accounts,order:await h.api('/api/barrow/orders/'+existing.id),confirmations:await h.api(`/api/barrow/orders/${existing.id}/confirmations`),seller:await h.api('/api/barrow/seller-identity'),pdf:await(await h.request(`/api/barrow/orders/${existing.id}/confirmations/2.pdf`)).arrayBuffer(),stock:(await pier.api('/api/pier/state')).orders};
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 async function pageFor(as) {const context=await signedContext(browser,h,as);t.after(()=>context.close());const page=await context.newPage();await open(page,h);return page}
 const owner=await pageFor(h.cookie);await owner.getByRole('button',{name:'Settings',exact:true}).click();
 const settings=owner.getByRole('region',{name:'Storefront identity',exact:true});
 await settings.getByLabel('Merchant display name',{exact:true}).fill('Mill House Trade');
 await settings.getByLabel('Support contact URL',{exact:true}).fill('https://support.synthetic-barrow.test/help');
 await settings.getByLabel('Accent color',{exact:true}).selectOption('forest');await settings.getByLabel('Page color',{exact:true}).selectOption('white');
 await settings.getByLabel('Publication reason',{exact:true}).fill('Owner reviewed the merchant identity and support destination.');
 await settings.getByRole('checkbox').check();await settings.getByRole('button',{name:'Publish storefront identity',exact:true}).click();
 await expect(owner.locator('.br-brand')).toHaveText('Mill House Trade');await expect(settings.getByRole('status')).toContainText('Storefront identity published');
 await expect(owner.getByRole('link',{name:'Contact support · support.synthetic-barrow.test',exact:true})).toHaveAttribute('href','https://support.synthetic-barrow.test/help');
 const published=(await h.api('/api/barrow/state')).settings.storefrontBranding;assert.ok(published.revision);
 await noIconWithoutTooltip(owner);await captureWidths(owner,'storefront-owner-published');
 const stale=await pageFor(h.cookie);await stale.getByRole('button',{name:'Settings',exact:true}).click();const staleSettings=stale.getByRole('region',{name:'Storefront identity',exact:true});await expect(staleSettings.getByLabel('Merchant display name',{exact:true})).toHaveValue('Mill House Trade');
 await settings.getByLabel('Merchant display name',{exact:true}).fill('Mill House Wholesale');await settings.getByLabel('Accent color',{exact:true}).selectOption('plum');await settings.getByLabel('Publication reason',{exact:true}).fill('Owner approved the revised display name and plum accent.');await settings.getByRole('checkbox').check();await settings.getByRole('button',{name:'Publish storefront identity',exact:true}).click();await expect(owner.locator('.br-brand')).toHaveText('Mill House Wholesale');
 await staleSettings.getByLabel('Merchant display name',{exact:true}).fill('Stale merchant name');await staleSettings.getByLabel('Publication reason',{exact:true}).fill('This earlier review must be rejected.');await staleSettings.getByRole('checkbox').check();await staleSettings.getByRole('button',{name:'Publish storefront identity',exact:true}).click();await expect(staleSettings.getByRole('alert')).toContainText('Storefront settings changed');await staleSettings.getByRole('button',{name:'Reload storefront settings',exact:true}).click();await expect(staleSettings.getByLabel('Merchant display name',{exact:true})).toHaveValue('Mill House Wholesale');
 const current=(await h.api('/api/barrow/state')).settings.storefrontBranding;
 const payload={...current,reviewed:true,reason:'Owner reviews this storefront publication.'};
 const credentialUrl=new URL('https://support.synthetic-barrow.test/');credentialUrl.username='synthetic-barrow-676';credentialUrl.password='synthetic-barrow-677';
 const admin={as:await h.signIn(email(673),'admin')};
 const staff=await activateStaff(h,email(674),{role:'sales-manager',accounts:'all',warehouses:'all',reports:['sales'],discountLimitCents:0,stockExceptionLimitCents:0});
 const credential=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:'Bearer '+credential.token}};
 for(const [who,status] of [[buyer,403],[other,403],[admin,403],[staff.who,403],[agent,403],[{as:''},401],[{headers:{origin:'https://foreign.synthetic-barrow.test'}},403]])await h.command('storefront.save',{...payload,displayName:'Unauthorized identity'},{...who,status});
 for(const invalid of [{reviewed:false},{accent:'#fff'},{canvas:'black'},{supportUrl:'javascript:alert(1)'},{supportUrl:credentialUrl.href},{displayName:''}])await h.command('storefront.save',{...payload,...invalid},{status:400});
 assert.deepEqual((await h.api('/api/barrow/state')).settings.storefrontBranding,current);
 await h.command('storefront.save',{...payload,revision:published.revision},{status:409});
 const concurrent=await Promise.all([h.request('/api/barrow/commands',{method:'POST',body:{type:'storefront.save',payload}}),h.request('/api/barrow/commands',{method:'POST',body:{type:'storefront.save',payload}})]);assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,409]);
 await h.api('/api/barrow/agent-token/revoke',{});await h.command('storefront.save',payload,{...agent,status:401});
 const after=(await h.api('/api/barrow/state')).settings.storefrontBranding;
 console.log('PROBE CAT-005 authority: native commands with stale, concurrent, buyer, admin, staff, agent and foreign-origin saves -> one current owner effect, unsafe attempts refused');
 assert.deepEqual((await h.api('/api/barrow/state')).accounts,before.accounts);assert.deepEqual(await h.api('/api/barrow/seller-identity'),legal);assert.deepEqual(await h.api('/api/barrow/orders/'+existing.id),before.order);assert.deepEqual(await h.api(`/api/barrow/orders/${existing.id}/confirmations`),before.confirmations);assert.deepEqual(Buffer.from(await(await h.request(`/api/barrow/orders/${existing.id}/confirmations/2.pdf`)).arrayBuffer()),Buffer.from(before.pdf));assert.deepEqual((await pier.api('/api/pier/state')).orders,before.stock);
 const ownerId=(await h.api('/api/barrow/state')).actor.id;
 const events=(await h.api('/api/barrow/audit')).events.filter(event=>event.action==='storefront.published');assert.equal(events.length,3);assert.ok(events.every(event=>event.actorId===ownerId));
 const auditCsv=await(await h.request('/api/barrow/audit.csv')).text();assert.ok(auditCsv.includes(after.revision));
 const customer=await pageFor(buyer.as),wren=await pageFor(other.as);
 for(const [page,cents,accountId,who] of [[customer,6500,'cedar',buyer],[wren,7200,'wren',other]]) {
  await expect(page.locator('.br-brand')).toHaveText('Mill House Wholesale');await expect(page).toHaveTitle('Mill House Wholesale');await expect(page.getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);
  const catalog=await h.api('/api/barrow/catalogue?accountId='+accountId,undefined,who);assert.deepEqual(catalog.items.map(item=>item.unitCents),[cents]);
  await expect(page.getByRole('region',{name:'Size matrix',exact:true})).toContainText('USD '+(cents/100).toFixed(2));
  const style=await page.locator('.barrow').evaluate(element=>({accent:getComputedStyle(element).getPropertyValue('--br-storefront-accent').trim(),canvas:getComputedStyle(element).getPropertyValue('--br-storefront-canvas').trim()}));assert.deepEqual(style,{accent:'#713f7b',canvas:'#ffffff'});
  await noIconWithoutTooltip(page);
 }
 // Test one width; capture the same changed screens at desktop and phone widths.
 const matrix=customer.getByRole('region',{name:'Size matrix',exact:true}),quantity=matrix.getByRole('spinbutton').first();await quantity.fill('1');await customer.getByRole('button',{name:'Prepare draft',exact:true}).click();await expect(customer.getByRole('region',{name:'Review these problems',exact:true})).toContainText(/minimum|quantit|at least/);await expect(quantity).toHaveAttribute('aria-invalid','true');await captureWidths(customer,'storefront-buyer-validation');
 await quantity.fill('2');await customer.getByLabel('Your purchase order / reference',{exact:true}).fill('synthetic-barrow-675');await customer.getByRole('button',{name:'Prepare draft',exact:true}).click();
 const card=customer.locator('article.br-order').filter({hasText:'synthetic-barrow-675'});await expect(card).toContainText('USD 130.00');await card.getByRole('button',{name:'Submit for supplier review',exact:true}).click();await expect(card.getByText('submitted',{exact:true})).toBeVisible();
 await owner.reload();await owner.getByRole('button',{name:'Orders',exact:true}).click();const review=owner.locator('article.br-order').filter({hasText:'synthetic-barrow-675'});
 // Finish the real Pier handoff before checking its rendered result; clicking
 // starts an async command and does not mean its HTTP response has arrived.
 const [approval]=await Promise.all([owner.waitForResponse(response=>response.url()===h.origin+'/api/barrow/commands'&&response.request().method()==='POST'&&response.request().postDataJSON()?.type==='order.approve'),review.getByRole('button',{name:'Approve & reserve stock',exact:true}).click()]);
 assert.equal(approval.status(),200);await expect(review.getByText('approved',{exact:true})).toBeVisible();
 await customer.reload();await customer.getByRole('button',{name:'Orders',exact:true}).click();await expect(card.getByText('approved',{exact:true})).toBeVisible();await card.getByText('Order confirmations',{exact:true}).click();await expect(card.getByRole('link',{name:'Download confirmation 2 PDF',exact:true})).toBeVisible();await captureWidths(customer,'storefront-buyer-confirmation');await noIconWithoutTooltip(customer);
 const selected=(await h.api('/api/barrow/state',undefined,buyer)).orders.find(order=>order.reference==='synthetic-barrow-675');assert.ok(selected);
 const confirmations=(await h.api(`/api/barrow/orders/${selected.id}/confirmations`,undefined,buyer)).confirmations;assert.equal(confirmations.at(-1).snapshot.totalCents,13000);assert.deepEqual(confirmations.at(-1).snapshot.seller,legal.identity);
 console.log('PROBE CAT-005 shopping: native buyer pages and supplier approval -> USD 65.00 and USD 72.00 isolated prices, linked quantity refusal, approved USD 130.00 confirmation with the original legal seller');
 await captureWidths(wren,'storefront-second-buyer');
 // Exercise the supported combinations through the publishing door and inspect actual rendered controls.
 await owner.getByRole('button',{name:'Settings',exact:true}).click();
 const accentChoices=await settings.getByLabel('Accent color',{exact:true}).locator('option').evaluateAll(options=>options.map(option=>option.value));
 const canvasChoices=await settings.getByLabel('Page color',{exact:true}).locator('option').evaluateAll(options=>options.map(option=>option.value));
 const hex=rgb=>rgb.match(/\d+/g).slice(0,3).map(value=>Number(value).toString(16).padStart(2,'0')).join('');
 for(const accent of accentChoices)for(const canvas of canvasChoices) {
  const revision=(await h.api('/api/barrow/state')).settings.storefrontBranding.revision;
  await h.command('storefront.save',{...payload,revision,accent,canvas});await owner.reload();await owner.getByRole('button',{name:'Settings',exact:true}).click();
  const buttonColors=await settings.getByRole('button',{name:'Reload storefront settings',exact:true}).evaluate(element=>{const style=getComputedStyle(element);return {ink:style.color,paper:style.backgroundColor}});
  assert.ok(contrast(hex(buttonColors.ink),hex(buttonColors.paper))>=4.5);
  const supportColors=await owner.locator('.br-support').evaluate(element=>({ink:getComputedStyle(element).color,paper:getComputedStyle(element.closest('.barrow')).backgroundColor}));
  assert.ok(contrast(hex(supportColors.ink),hex(supportColors.paper))>=4.5);
  await settings.getByLabel('Publication reason',{exact:true}).fill('Owner reviews the selected accessible color combination.');await settings.getByRole('checkbox').check();
  const primary=await settings.getByRole('button',{name:'Publish storefront identity',exact:true}).evaluate(element=>({ink:getComputedStyle(element).color,paper:getComputedStyle(element).backgroundColor}));
  assert.ok(contrast(hex(primary.ink),hex(primary.paper))>=4.5);
 }
 await settings.getByLabel('Accent color',{exact:true}).selectOption('plum');await settings.getByLabel('Page color',{exact:true}).selectOption('white');await settings.getByLabel('Publication reason',{exact:true}).fill('Owner retains the approved final merchant colors.');await settings.getByRole('checkbox').check();await settings.getByRole('button',{name:'Publish storefront identity',exact:true}).click();await expect(settings.getByRole('status')).toContainText('Storefront identity published');
 assert.deepEqual(await settings.locator('input,select,textarea,button,label,p').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(element).fontSize)<13).map(element=>element.tagName)),[]);

 // The same native journey continues through owner-reviewed merchandising and each buyer's current assortment.
 const products=[];
 for(const [sku,name] of [['FIELD-S','Field S'],['FIELD-M','Field M'],['PRIVATE-S','Private S']])products.push(await pier.command('item.save',{sku,name,unit:'case',packSize:'1'}));
 const po=await pier.command('po.draft',{supplierId:source.supplier.id,promiseDate:'2027-03-01',reason:'Synthetic storefront assortment',lines:products.map(item=>({itemId:item.id,quantity:'20',price:'20.00'}))});
 await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'synthetic-barrow-701',lines:po.lines.map(line=>({poLineId:line.id,locationId:source.location.id,quantity:'20',cost:'20.00'}))});
 for(const [id,prices] of [['cedar',[{sku:'OAT-1',unitCents:6500,msrpCents:13000,minQty:2,units:[{code:'pallet',baseQuantity:'2',unitCents:12000,packContents:'2 cases per pallet'}]},{sku:'FIELD-S',unitCents:5501,msrpCents:11001,minQty:1},{sku:'FIELD-M',unitCents:5700,msrpCents:14250,minQty:1}]],['wren',[{sku:'OAT-1',unitCents:7200,minQty:1,units:[{code:'pallet',baseQuantity:'2',unitCents:14000,packContents:'2 cases per pallet'}]},{sku:'PRIVATE-S',unitCents:2000,msrpCents:5000,minQty:1}]]]) {
  const account=await h.api('/api/barrow/accounts/by-id/'+id);await h.command('account.save',{id,revision:account.revision,value:{...account.value,prices}});
 }
 let attributes=await h.command('variant.attributes',{revision:null,variants:[{sku:'OAT-1',style:'Oat',color:'Natural',size:'Case'}]});
 attributes=await h.command('variant.image',{revision:attributes.revision,sku:'OAT-1',contentBase64:withExif.toString('base64')});
 assert.equal(attributes.variants['OAT-1'].image.sha256,imageSha);
 await owner.reload();await owner.getByRole('button',{name:'Settings',exact:true}).click();
 await settings.getByLabel('Storefront logo',{exact:true}).selectOption(imageSha);
 await settings.getByLabel('Storefront prices',{exact:true}).selectOption('both');
 await settings.getByLabel('catalog navigation label',{exact:true}).fill('Shop collections');
 await settings.getByRole('button',{name:'Move orders earlier',exact:true}).click();await settings.getByRole('button',{name:'Move orders earlier',exact:true}).click();
 await settings.getByRole('button',{name:'Add collection',exact:true}).click();await settings.getByLabel('Collection 1 name',{exact:true}).fill('Field sizes');await settings.getByLabel('Collection 1 SKUs',{exact:true}).fill('FIELD-S\nFIELD-M');
 await settings.getByRole('button',{name:'Add collection',exact:true}).click();await settings.getByLabel('Collection 2 name',{exact:true}).fill('Pantry');await settings.getByLabel('Collection 2 SKUs',{exact:true}).fill('OAT-1');
 await settings.getByRole('button',{name:'Add collection',exact:true}).click();await settings.getByLabel('Collection 3 name',{exact:true}).fill('Private range');await settings.getByLabel('Collection 3 SKUs',{exact:true}).fill('PRIVATE-S');
 await settings.getByLabel('Publication reason',{exact:true}).fill('Owner publishes reviewed collections, navigation, exact prices and the stored logo for signed-in pages.');await settings.getByRole('checkbox').check();await settings.getByRole('button',{name:'Publish storefront identity',exact:true}).click();await expect(settings.getByRole('status')).toContainText('Storefront identity published');
 let configured=(await h.api('/api/barrow/storefront/settings')).branding;
 await captureRegionWidths(owner,settings,'storefront-owner-merchandising');
 assert.equal(configured.logo.sha256,imageSha);assert.equal(configured.collections.length,3);assert.equal(configured.navigation[0].page,'orders');
 for(const who of [buyer,other,admin,staff.who,{as:''}])await h.api('/api/barrow/storefront/settings',undefined,{...who,status:who.as?403:401});
 const ownerPayload={...configured,logoSha256:imageSha,reviewed:true,reason:'Owner reviews the complete storefront configuration.'};
 for(const invalid of [{logoSha256:'f'.repeat(64)},{navigation:[{page:'catalog',label:'Only catalog'}]},{navigation:configured.navigation.map(item=>({...item,label:'Duplicate'}))},{collections:[{id:'bad',name:'Bad',skus:['OAT-1','OAT-1']}]},{priceDisplay:'unsafe'}])await h.command('storefront.save',{...ownerPayload,...invalid},{status:400});
 await h.command('storefront.save',{...ownerPayload,priceDisplay:'retail'},{...buyer,status:403});
 assert.deepEqual((await h.api('/api/barrow/storefront/settings')).branding,configured);
 // Removing the product's current image must not break the deliberately published logo.
 await h.command('variant.image',{revision:attributes.revision,sku:'OAT-1',remove:true});
 for(const [page,who,accountId,expected] of [[customer,buyer,'cedar',[['collection-1',['FIELD-S','FIELD-M']],['collection-2',['OAT-1']]]],[wren,other,'wren',[['collection-2',['OAT-1']],['collection-3',['PRIVATE-S']]]]]) {
  const state=(await h.api('/api/barrow/state',undefined,who)).settings.storefrontBranding;
  assert.deepEqual(state.collections,[]);assert.equal(Buffer.from(state.logoSrc.split(',')[1],'base64').equals(jpeg),true);
  const catalog=await h.api('/api/barrow/catalogue?accountId='+accountId,undefined,who);assert.deepEqual(catalog.storefront.collections.map(value=>[value.id,value.skus]),expected);
  await page.reload();await page.getByRole('button',{name:'Shop collections',exact:true}).click();
  await expect(page.locator('.br-brand img')).toHaveJSProperty('naturalWidth',4);
  assert.deepEqual(await page.getByRole('navigation',{name:'Storefront pages',exact:true}).getByRole('button').allTextContents(),['Orders','Shop collections','Line sheets','Company']);
 }
 await customer.getByLabel('Collection',{exact:true}).selectOption('collection-1');
 let matrixMerch=customer.getByRole('region',{name:'Size matrix',exact:true});
 await expect(matrixMerch.locator('[data-storefront-price="FIELD-S"]')).toHaveText('Wholesale USD 55.01MSRP USD 110.01Margin 50.00%');
 await expect(matrixMerch.locator('[data-storefront-price="FIELD-M"]')).toHaveText('Wholesale USD 57.00MSRP USD 142.50Margin 60.00%');
 await expect(matrixMerch.locator('[data-storefront-price="OAT-1"]')).toHaveCount(0);
 await matrixMerch.getByRole('spinbutton',{name:'S quantity for Field',exact:true}).fill('1.5');await customer.getByLabel('Collection',{exact:true}).selectOption('collection-2');await customer.getByRole('button',{name:'Prepare draft',exact:true}).click();await expect(customer.getByLabel('Collection',{exact:true})).toHaveValue('');await customer.getByRole('region',{name:'Review these problems',exact:true}).getByRole('link',{name:/FIELD-S/}).click();await expect(matrixMerch.getByRole('spinbutton',{name:'S quantity for Field',exact:true})).toBeFocused();
 await matrixMerch.getByRole('spinbutton',{name:'S quantity for Field',exact:true}).fill('1');await matrixMerch.getByRole('spinbutton',{name:'M quantity for Field',exact:true}).fill('1');
 await customer.getByLabel('Collection',{exact:true}).selectOption('collection-2');await expect(customer.getByRole('region',{name:'Browse collections',exact:true})).toContainText('All selected quantities are retained');await expect(customer.getByRole('status').filter({hasText:'2 units'})).toContainText('USD 112.01');
 await customer.getByRole('button',{name:'Show the whole cart',exact:true}).click();await expect(matrixMerch.getByRole('spinbutton',{name:'S quantity for Field',exact:true})).toHaveValue('1');
 await customer.getByLabel('Your purchase order / reference',{exact:true}).fill('synthetic-barrow-702');await customer.getByRole('button',{name:'Prepare draft',exact:true}).click();
 const merchOrder=customer.locator('article.br-order').filter({hasText:'synthetic-barrow-702'});await expect(merchOrder).toContainText('USD 112.01');await merchOrder.getByRole('button',{name:'Submit for supplier review',exact:true}).click();
 await owner.reload();await owner.getByRole('button',{name:'Orders',exact:true}).click();const merchReview=owner.locator('article.br-order').filter({hasText:'synthetic-barrow-702'});await merchReview.getByRole('button',{name:'Approve & reserve stock',exact:true}).click();await expect(merchReview.getByText('approved',{exact:true})).toBeVisible();
 const merchRecord=(await h.api('/api/barrow/state',undefined,buyer)).orders.find(value=>value.reference==='synthetic-barrow-702');assert.equal(merchRecord.totalCents,11201);assert.deepEqual(merchRecord.lines.map(line=>line.unitCents),[5501,5700]);
 assert.equal((await h.api(`/api/barrow/orders/${merchRecord.id}/confirmations`,undefined,buyer)).confirmations.at(-1).snapshot.totalCents,11201);
 assert.deepEqual(Buffer.from(await(await h.request(`/api/barrow/orders/${existing.id}/confirmations/2.pdf`)).arrayBuffer()),Buffer.from(before.pdf));
 await customer.getByRole('button',{name:'Shop collections',exact:true}).click();await customer.getByLabel('Collection',{exact:true}).selectOption('collection-1');await noIconWithoutTooltip(customer);await captureWidths(customer,'storefront-collections-both');
 await customer.getByRole('button',{name:'Order by selling unit',exact:true}).click();
 const bothUnits=customer.getByRole('dialog',{name:'Order by selling unit',exact:true});
 await expect(bothUnits.getByRole('combobox',{name:/^Selling unit for line 1/}).locator('option')).toHaveText(['case · 1 case · Wholesale USD 65.00 | MSRP USD 130.00 | Margin 50.00% per case','pallet · 2 cases per pallet · Wholesale USD 120.00 | MSRP USD 260.00 | Margin 53.85% per pallet']);
 await expect(bothUnits.locator('[data-selling-unit-price="1"]')).toHaveText('Wholesale USD 120.00 | MSRP USD 260.00 | Margin 53.85% per pallet');
 await bothUnits.getByRole('button',{name:'Cancel',exact:true}).click();
 const publishMode=async display=>{const current=(await h.api('/api/barrow/storefront/settings')).branding;return h.command('storefront.save',{...current,logoSha256:imageSha,priceDisplay:display,reviewed:true,reason:'Owner reviews the storefront price display.'})};
 await publishMode('retail');await customer.reload();await customer.getByRole('button',{name:'Shop collections',exact:true}).click();await customer.getByLabel('Collection',{exact:true}).selectOption('collection-1');
 await expect(customer.getByRole('region',{name:'Size matrix',exact:true}).locator('[data-storefront-price="FIELD-S"]')).toHaveText('MSRP USD 110.01');
 await expect(customer.getByRole('region',{name:'Size matrix',exact:true})).not.toContainText('Wholesale');
 // Selling-unit shopping uses the same merchant display while charging only the negotiated wholesale total.
 await customer.getByRole('button',{name:'Order by selling unit',exact:true}).click();
 const unitDialog=customer.getByRole('dialog',{name:'Order by selling unit',exact:true});
 const unitOptions=unitDialog.getByRole('combobox',{name:/^Selling unit for line 1/});
 await expect(unitOptions.locator('option')).toHaveText(['case · 1 case · MSRP USD 130.00 per case','pallet · 2 cases per pallet · MSRP USD 260.00 per pallet']);
 await expect(unitOptions).not.toContainText('Wholesale');
 await unitOptions.selectOption('pallet');await unitDialog.getByLabel('Quantity for line 1',{exact:true}).fill('2');
 await expect(unitDialog.getByText('Total:',{exact:false})).toContainText('USD 240.00');
 await expect(unitDialog.locator('[data-selling-unit-price="1"]')).toHaveText('MSRP USD 260.00 per pallet');
 await captureWidths(customer,'storefront-unit-retail');
 await unitDialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await wren.reload();await wren.getByRole('button',{name:'Shop collections',exact:true}).click();await wren.getByLabel('Collection',{exact:true}).selectOption('collection-2');await expect(wren.getByRole('region',{name:'Size matrix',exact:true}).locator('[data-storefront-price="OAT-1"]')).toHaveText('MSRP absent');
 await captureWidths(wren,'storefront-retail-missing');
 await wren.getByRole('button',{name:'Order by selling unit',exact:true}).click();
 const missingUnits=wren.getByRole('dialog',{name:'Order by selling unit',exact:true});
 await expect(missingUnits.getByRole('combobox',{name:/^Selling unit for line 1/}).locator('option')).toHaveText(['case · 1 case · MSRP absent per case','pallet · 2 cases per pallet · MSRP absent per pallet']);
 await missingUnits.getByRole('button',{name:'Cancel',exact:true}).click();
 await publishMode('wholesale');await customer.reload();await customer.getByRole('button',{name:'Shop collections',exact:true}).click();await customer.getByLabel('Collection',{exact:true}).selectOption('collection-1');await expect(customer.getByRole('region',{name:'Size matrix',exact:true}).locator('[data-storefront-price="FIELD-M"]')).toHaveText('Wholesale USD 57.00');
 await customer.getByRole('button',{name:'Order by selling unit',exact:true}).click();
 await expect(unitOptions.locator('option')).toHaveText(['case · 1 case · Wholesale USD 65.00 per case','pallet · 2 cases per pallet · Wholesale USD 120.00 per pallet']);
 await unitOptions.selectOption('pallet');await unitDialog.getByLabel('Quantity for line 1',{exact:true}).fill('2');
 await unitDialog.getByLabel('Purchase order / reference',{exact:true}).fill('synthetic-barrow-703');await unitDialog.getByRole('button',{name:'Prepare unit draft',exact:true}).click();
 await expect(unitDialog).toHaveCount(0);
 const unitRecord=(await h.api('/api/barrow/state',undefined,buyer)).orders.find(value=>value.reference==='synthetic-barrow-703');
 assert.equal(unitRecord.totalCents,24000);assert.equal(unitRecord.lines[0].unitCents,12000);assert.equal(unitRecord.lines[0].baseQuantity,'4');
 await publishMode('both');
 console.log('PROBE CAT-005 A: buyer Order by selling unit under Retail only -> exact MSRP USD 130.00 per case and USD 260.00 per pallet, no wholesale option price; absent MSRP stays absent; both displays exact margin; two pallets prepare USD 240.00 wholesale');
 const backup=await archive(h);const restored=await installation();t.after(()=>restored.close());await restore(restored,backup);
 const restoredBrand=(await restored.api('/api/barrow/state')).settings.storefrontBranding;
 const savedBrand=(await h.api('/api/barrow/state')).settings.storefrontBranding;assert.deepEqual(restoredBrand,savedBrand);
 await restored.command('storefront.save',{...ownerPayload,displayName:'Stale archived review'},{status:409});assert.deepEqual((await restored.api('/api/barrow/state')).settings.storefrontBranding,savedBrand);
 console.log('PROBE CAT-005 custody: native archive restore -> exact published logo, collections and navigation retained; stale approval remains refused');
 console.log('PROBE CAT-005 collections: owner publication -> exact approved SKU intersections; buyer settings refused, hidden ranges omitted, collection switching retains the USD 112.01 cart');
 console.log('PROBE CAT-005 prices: configured wholesale, retail and both -> per-size USD 55.01 and USD 57.00, optional MSRP and exact margins; supplier confirmation remains USD 112.01 wholesale');
 console.log('PROBE CAT-005 logo and navigation: accepted stored JPEG and reviewed page order -> decoded logo after product removal and Orders, Shop collections, Line sheets; old confirmation bytes unchanged');

 const finalSettings=(await h.api('/api/barrow/state')).settings.storefrontBranding;
 const finalPublicSettings=(await h.api('/api/barrow/state',undefined,buyer)).settings.storefrontBranding;
 assert.equal((await h.request('/auth/signout',{method:'POST',body:{}})).status,204);
 await h.command('storefront.save',{...payload,revision:finalSettings.revision,displayName:'Revoked owner attempt'},{status:401});
 assert.deepEqual((await h.api('/api/barrow/state',undefined,buyer)).settings.storefrontBranding,finalPublicSettings);
 console.log('PROBE CAT-005 branding: native Settings -> '+finalSettings.displayName+', persisted support '+finalSettings.supportUrl+', eight rendered color combinations meet contrast 4.5; revoked owner session refused');
});
