import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {prebookFixture,season} from '../api/prebook-fixture.mjs';
import {signedContext} from './browser-helpers.mjs';
async function open(page,h){
 await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Orders',exact:true}).click();
}
// Assertions run at desktop width. Phone captures record the same final changed screen.
async function capture(page,card,name){
 const directory=process.env.BARROW_JOURNEY_EVIDENCE??'/tmp/barrow-prebook-screens';await mkdir(directory,{recursive:true});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await card.scrollIntoViewIfNeeded();await card.screenshot({path:`${directory}/${name}-${width}.png`,animations:'disabled'})}
 await page.setViewportSize({width:1440,height:1000});
}
test('buyer acknowledges a seasonal deposit requirement and both buyer and operations see released and delayed commitments separately',async t=>{
 const {h,pier,source,po,buyer,published,payload}=await prebookFixture(t,{built:true,https:true});
 const draft=await h.command('order.prepare',payload,buyer);
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const owner=await signedContext(browser,h),customer=await signedContext(browser,h,buyer.as);t.after(()=>owner.close());t.after(()=>customer.close());
 const page=await owner.newPage(),buyerPage=await customer.newPage();await open(page,h);await open(buyerPage,h);
 const buyerCard=buyerPage.locator('article.br-order').filter({hasText:'Reference: SPRING-2027'});
 await expect(buyerCard.getByRole('region',{name:`Seasonal commitment ${draft.id}`,exact:true})).toContainText('USD 195.00');
 await buyerCard.getByRole('checkbox',{name:/I acknowledge the deposit requirement/}).check();
 await buyerCard.getByRole('button',{name:'Submit for supplier review',exact:true}).click();await expect(buyerCard).toContainText('Seasonal commitment against incoming supply');
 let booked=await h.api(`/api/barrow/orders/${draft.id}`);assert.equal(booked.status,'prebook');
 await h.command('prebook.close',{id:season.id,revision:published.revision,reason:'Supplier closed spring intake after buyer review.'});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'Spring first receipt',lines:[{poLineId:po.lines[0].id,locationId:source.location.id,quantity:'6',cost:'20.00'}]});
 const release=await h.command('prebook.release',{orderId:booked.id,revision:booked.revision,windowId:'first',reason:'Supplier prepared the received first release.'});
 await page.reload();await page.getByRole('button',{name:'Orders',exact:true}).click();
 const releaseCard=page.locator('article.br-order').filter({hasText:'Release of prebook '+booked.id});await releaseCard.getByRole('button',{name:'Approve & reserve stock',exact:true}).click();await expect(releaseCard.getByRole('link',{name:'Download invoice CSV',exact:true})).toBeVisible();
 booked=await h.api(`/api/barrow/orders/${booked.id}`);await h.command('prebook.delay',{orderId:booked.id,revision:booked.revision,windowId:'second',requestedDate:'2027-03-15',reason:'Supplier reported a delayed style; agreed cancel dates remain unchanged.'});
 for(const [screen,label] of [[page,'operations'],[buyerPage,'buyer']]){
  await screen.reload();await screen.getByRole('button',{name:'Orders',exact:true}).click();
  const card=screen.locator('article.br-order').filter({hasText:'Reference: SPRING-2027'}).filter({has:screen.getByRole('heading',{name:'Seasonal commitment',exact:true})});
  const summary=card.getByRole('region',{name:`Seasonal commitment ${booked.id}`,exact:true});
  await expect(card.locator('tbody tr')).toHaveCount(2);await expect(card.locator('tbody tr').nth(0).locator('td').nth(1)).toHaveText('6');await expect(card.locator('tbody tr').nth(1).locator('td').nth(1)).toHaveText('4');
  await expect(summary).toContainText('Committed 6 case · Released 6 · Outstanding 0');await expect(summary).toContainText('Committed 4 case · Released 0 · Outstanding 4');await expect(summary).toContainText('Supplier reported a delayed style');
  assert.equal(await screen.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await card.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
  await capture(screen,card,'prebook-'+label);
 }
 assert.equal((await h.api(`/api/barrow/orders/${release.id}`)).status,'approved');
});
