import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'

/** Optional captures of the real disposable production installation. */
export async function captureAgents({request,origin,cookie}) {
 const directory=process.env.BARROW_AGENT_EVIDENCE
 if(!directory)return
 const {chromium}=await import('@playwright/test')
 await mkdir(directory,{recursive:true})
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']})
 try {
  const context=await browser.newContext()
  await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:origin}}))
  await context.route(origin+'/**',async route=>{
   const incoming=route.request(),response=await request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(incoming.postDataBuffer()?{body:incoming.postDataBuffer()}:{}),redirect:'manual'})
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
  })
  const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
  const response=await request(origin+'/agents/api/approvals',{headers})
  assert.ok(response.ok)
  const {approvals}=await response.json()
  const pages=[['agents','/agents'],['approval-unavailable','/agents/approvals/unavailable']]
  for(const state of ['pending','executed','refused','rejected','expired']) {
   const approval=approvals.find(item=>item.state===state)
   if(approval)pages.push(['approval-'+state,'/agents/approvals/'+encodeURIComponent(approval.id)])
  }
  const page=await context.newPage()
  async function capture(name,path) {
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000})
    await page.goto(origin+path)
    if(width===1440)assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    await page.screenshot({path:directory+'/'+name+'-'+width+'.png',fullPage:true})
   }
  }
  for(const [name,path] of pages)await capture(name,path)
  const pause=await request(origin+'/agents/api/pause',{method:'POST',headers,body:'{"paused":true}'})
  assert.ok(pause.ok);await pause.body?.cancel()
  try {await capture('agents-paused','/agents')}
  finally {
   const resume=await request(origin+'/agents/api/pause',{method:'POST',headers,body:'{"paused":false}'})
   assert.ok(resume.ok);await resume.body?.cancel()
  }
  await context.close()
 } finally {await browser.close()}
}

/** Attribution is a user outcome in Verify; only saving image files is optional. */
export async function captureAttribution({request,origin,cookie,preparations,approved,offered}) {
 const {chromium,expect}=await import('@playwright/test')
 const directory=process.env.BARROW_AGENT_EVIDENCE
 if(directory)await mkdir(directory,{recursive:true})
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']})
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:origin}}))
  await context.route(origin+'/**',async route=>{
   const incoming=route.request(),response=await request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(incoming.postDataBuffer()?{body:incoming.postDataBuffer()}:{}),redirect:'manual'})
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
  })
  const page=await context.newPage()
  await page.goto(origin+'/app')
  const draft=preparations.find(row=>row.phase==='held'&&row.tool==='barrow.orders.prepare')
  await expect(page.locator('.br-pad-context')).toContainText('Prepared by '+draft.provenance.label)
  if(directory)await page.screenshot({path:directory+'/attribution-pad-1440.png',fullPage:true})
  await page.getByRole('button',{name:'Orders',exact:true}).click()
  const card=page.locator('.br-order').filter({has:page.locator('.br-order-id',{hasText:approved.id})})
  await card.getByText('Order history & Pier details',{exact:true}).click()
  await expect(card.locator('dt').filter({hasText:'Prepared by'}).locator('..').locator('dd')).toHaveText(approved.agentPreparation.label)
  for(const [label,name] of [['Submitted by','You'],['Approved by','Avery stock operator']])
   await expect(card.locator('dt').filter({hasText:label}).locator('..').locator('dd')).toHaveText(name)
  const proposal=page.locator('article').filter({has:page.getByRole('heading',{name:'Proposal '+offered.number+' · offered · latest revision',exact:true})}).last()
  await expect(proposal.getByText('Prepared by '+offered.preparedBy.label,{exact:true})).toBeVisible()
  await expect(proposal.getByText('Manager approval:',{exact:false})).toContainText(offered.managerApproval.by)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  if(directory) {
   await page.screenshot({path:directory+'/attribution-orders-1440.png',fullPage:true})
   await page.setViewportSize({width:390,height:1000})
   await page.screenshot({path:directory+'/attribution-orders-390.png',fullPage:true})
   const draftCard=page.locator('.br-order').filter({has:page.locator('.br-order-id',{hasText:draft.result.id})})
   await draftCard.getByRole('button',{name:'Open in order pad',exact:true}).click()
   await page.locator('.br-pad-context').waitFor({state:'visible'})
   await page.evaluate(()=>document.fonts.ready)
   await page.screenshot({path:directory+'/attribution-pad-390.png',fullPage:true})
  }
  await context.close()
  console.log('PROBE BASE-AGENT-008 screens: built order pad, order history and proposal review -> exact agent preparation and separate person decisions at 1440; candidate captures at 1440 and 390')
 } finally {await browser.close()}
}
