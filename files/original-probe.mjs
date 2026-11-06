import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {userInfo} from 'node:os';
const root=process.cwd(),load=path=>import(pathToFileURL(root+'/'+path).href);
const {returnClaimsFixture}=await load('tests/api/return-claims-fixture.mjs');
const {chromium,expect}=await load('node_modules/@playwright/test/index.mjs');
const {signedContext}=await load('tests/journeys/browser-helpers.mjs');
const cleanup=[],t={after:fn=>cleanup.push(fn)};
try {
 console.log('STEP creating real pinned-Pier fixture');
 const f=await returnClaimsFixture(t,{built:true}),{h,pier,buyer,order}=f;
 console.log('STEP fixture ready');
 let claim=await f.request();
 claim=await h.command('return.decide',{id:claim.id,revision:claim.revision,orderRevision:order.revision,quantity:2,instructions:'Bring authorized cartons to the returns desk.',reason:'Two cartons approved; one remains disputed.'});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});cleanup.push(()=>browser.close());
 const buyerContext=await signedContext(browser,h,buyer.as),ownerContext=await signedContext(browser,h);cleanup.push(()=>buyerContext.close(),()=>ownerContext.close());
 const bp=await buyerContext.newPage(),op=await ownerContext.newPage();
 async function start(page){await page.goto(h.origin+'/app');if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();}}
 await start(bp);await start(op);
 async function capture(page,region,name){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
  await region.scrollIntoViewIfNeeded();
  const inset=await page.locator('header').first().evaluate(e=>e.getBoundingClientRect().height);await page.evaluate(n=>scrollBy(0,-n),inset+12);
  const box=await region.boundingBox(),scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));assert.ok(box);
  const bytes=await page.screenshot({fullPage:true,clip:{x:box.x+scroll.x,y:box.y+scroll.y,width:box.width,height:box.height},animations:'disabled'});
  const encoded=bytes.toString('base64');for(let i=0;i<encoded.length;i+=8000)console.log('IMAGEPART '+name+' '+i+' '+encoded.slice(i,i+8000));
 }
 for(const width of [1440,390]){
  for(const [actor,page]of [['buyer',bp],['reviewer',op]]){
   await page.setViewportSize({width,height:1000});
   await page.getByRole('button',{name:'Orders',exact:true}).click();
   const panel=page.getByRole('region',{name:'Order notices',exact:true});
   const returned=panel.getByRole('article',{name:'Return decision recorded for '+order.id,exact:true});
   await returned.getByRole('button',{name:'Open current source',exact:true}).click();
   await expect(panel.getByRole('region',{name:'Current notice source',exact:true})).toContainText('Requested 3 · approved 2');
   await expect(panel).not.toContainText('USD');
   const accepted=panel.getByRole('article',{name:'Order accepted for '+order.id,exact:true});
   if(width===1440){await accepted.getByRole('button',{name:'Mark as read',exact:true}).click();await expect(accepted).toContainText('Read');}
   await capture(page,panel,actor+'-orders-'+width);
   await panel.getByRole('button',{name:'View order',exact:true}).click();await expect(page.locator('#order-result-'+order.id)).toBeFocused();
   await page.getByRole('button',{name:'Settings',exact:true}).click();
   const prefs=page.getByRole('region',{name:'Order notice preferences',exact:true}),toggle=prefs.getByRole('group',{name:'Cedar Street Pantry',exact:true}).getByLabel('Dispatch recorded',{exact:true});
   await expect(toggle).toBeEnabled();await toggle.uncheck();await expect(toggle).toBeEnabled();await toggle.check();await expect(toggle).toBeEnabled();
   await capture(page,prefs,actor+'-settings-'+width);
  }
 }
 console.log('PROBE screens PASS buyer/reviewer Orders, current-source read, read command, order focus, Settings save at 1440 and 390');
 // Migration setup only: these newly introduced tables are empty immediately after
 // 0077 is applied to a live installation whose native orders already exist.
 // All commercial records below are created through the real public HTTP doors.
 let split=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-gate-existing',lines:[{sku:'OAT-1',quantity:10}]},buyer);
 await h.command('order.submit',{orderId:split.id},buyer);split=await h.command('order.approve',{orderId:split.id});
 await h.db.batch(['bw_order_notice_reads','bw_order_notice_preferences','bw_order_notices','bw_order_notice_accounts'].map(table=>h.db.prepare('DELETE FROM '+table)));
 const before=(await h.api('/api/barrow/order-notices',undefined,buyer)).notices;
 const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===split.pierOrderId),dispatches=[];
 for(const quantity of ['4','6'])dispatches.push(await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-gate-dispatch-'+quantity,lines:[{orderLineId:upstream.lines[0].id,quantity}]}));
 await h.command('order.refresh',{orderId:split.id});
 const reads=await Promise.all([h.api('/api/barrow/order-notices',undefined,buyer),h.api('/api/barrow/order-notices',undefined,buyer)]);
 console.log('PROBE existing-account-dispatch '+JSON.stringify({setup:'post-0077 empty notice tables; existing approved native order',before:before.length,realPierDispatches:dispatches.map(row=>row.id),observed:reads.map(read=>read.notices.filter(row=>row.orderId===split.id).length),expected:2,result:reads.every(read=>read.notices.filter(row=>row.orderId===split.id).length===2)?'PASS':'FAIL'}));
 assert.equal(reads[0].notices.filter(row=>row.orderId===split.id&&row.kind==='shipment').length,2,'Existing approved order must produce its two new actual dispatch notices after migration');
} finally {for(const fn of cleanup.reverse())await fn();}
