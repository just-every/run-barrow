import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
/** Inspect the existing native Orders screen, without adding UI or authority. */
export async function captureStaffDraft({request,origin,cookie,draft,kind='staff'}) {
 const directory=process.env.BARROW_AGENT_EVIDENCE
 if(!directory)return
 const {chromium}=await import('@playwright/test')
 await mkdir(directory,{recursive:true})
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',args:['--no-sandbox']})
 try {
  const context=await browser.newContext()
  await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:origin}}))
  await context.route(origin+'/**',async route=>{
   const incoming=route.request(),response=await request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(incoming.postDataBuffer()?{body:incoming.postDataBuffer()}:{}),redirect:'manual'})
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
  })
  const page=await context.newPage()
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000})
   await page.goto(origin+'/app')
   await page.getByRole('button',{name:'Orders',exact:true}).click()
   await page.getByLabel('Purchase order / reference',{exact:true}).fill(draft.reference)
   const card=page.locator('article.br-order').filter({has:page.getByText(draft.id,{exact:true})}).last()
   await card.getByText('Order history & Pier details',{exact:true}).click()
   if(width===1440)await card.getByText(draft.preparedBy,{exact:false}).waitFor()
   await page.screenshot({path:directory+'/'+kind+'-draft-'+width+'.png',fullPage:true})
  }
  await context.close()
 } finally {await browser.close()}
}
