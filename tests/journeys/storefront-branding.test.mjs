// Built native storefront and HTTP settings; the connected pinned Pier remains the stock authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {installation,stock,accountValue,activateStaff} from '../api/harness.mjs';
import {captureWidths,signedContext} from './browser-helpers.mjs';

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
 await owner.reload();await owner.getByRole('button',{name:'Orders',exact:true}).click();const review=owner.locator('article.br-order').filter({hasText:'synthetic-barrow-675'});await review.getByRole('button',{name:'Approve & reserve stock',exact:true}).click();await expect(review.getByText('approved',{exact:true})).toBeVisible();
 await customer.reload();await customer.getByRole('button',{name:'Orders',exact:true}).click();await expect(card.getByText('approved',{exact:true})).toBeVisible();await card.getByText('Order confirmations',{exact:true}).click();await expect(card.getByRole('link',{name:'Download confirmation 2 PDF',exact:true})).toBeVisible();await captureWidths(customer,'storefront-buyer-confirmation');await noIconWithoutTooltip(customer);
 const selected=(await h.api('/api/barrow/orders/search?reference=synthetic-barrow-675',undefined,buyer)).orders.find(order=>order.reference==='synthetic-barrow-675');assert.ok(selected);
 const confirmations=(await h.api(`/api/barrow/orders/${selected.id}/confirmations`,undefined,buyer)).confirmations;assert.equal(confirmations.at(-1).snapshot.totalCents,13000);assert.deepEqual(confirmations.at(-1).snapshot.seller,legal.identity);
 await captureWidths(wren,'storefront-second-buyer');
 assert.ok(contrast('713f7b','ffffff')>=4.5);
});
