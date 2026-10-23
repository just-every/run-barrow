import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const directory=process.env.BARROW_JOURNEY_EVIDENCE??'/tmp/sx-barrow-c25-screens';
export async function captureWidths(page,name) {
 await mkdir(directory,{recursive:true});await page.evaluate(()=>scrollTo(0,0));
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${width}: horizontal overflow`);
  await page.screenshot({path:`${directory}/${name}-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
}
export async function signedContext(browser,h,cookie=h.cookie) {
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin,httpOnly:true,secure:true,sameSite:'Strict'})));
 return context;
}

/** Capture the clause's own card at desktop/phone widths without unrelated Data panels. */
export async function captureRegionWidths(page,region,name) {
 await mkdir(directory,{recursive:true});
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});await region.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${width}: horizontal overflow`);
  // Keep the real sticky navigation above the clipped card, rather than
  // letting locator.screenshot scroll a tall card underneath that header.
  const inset=await page.locator('header').first().evaluate(element=>element.getBoundingClientRect().height);
  await page.evaluate(amount=>scrollBy(0,-amount),inset+12);
  const box=await region.boundingBox(),scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
  assert.ok(box,`${name}: visible card`);
  await page.screenshot({path:`${directory}/${name}-${width}.png`,fullPage:true,clip:{x:box.x+scroll.x,y:box.y+scroll.y,width:box.width,height:box.height},animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:1000});
}
