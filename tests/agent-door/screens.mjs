import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'

/** Assert limit usage in Verify; optionally capture disposable installation screens. */
export async function captureAgents({request,origin,cookie,limits}) {
 const directory=process.env.BARROW_AGENT_EVIDENCE
 if(!directory&&!limits)return
 const {chromium}=await import('@playwright/test')
 if(directory)await mkdir(directory,{recursive:true})
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
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
  const pages=limits?[[limits.name,'/agents']]:[['agents','/agents'],['approval-unavailable','/agents/approvals/unavailable']]
  for(const state of ['pending','executed','refused','rejected','expired']) {
   const approval=approvals.find(item=>item.state===state)
   if(approval&&!limits)pages.push(['approval-'+state,'/agents/approvals/'+encodeURIComponent(approval.id)])
  }
  const page=await context.newPage()
  async function capture(name,path) {
   for(const width of directory?[1440,390]:[1440]) {
    await page.setViewportSize({width,height:1000})
    await page.goto(origin+path)
    if(width===1440){
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
     if(limits)for(const [decision,count]of Object.entries(limits.counts)){
      const cell=page.locator('[data-agents-count][data-class="standard"][data-decision="'+decision+'"]')
      assert.equal(await cell.textContent(),String(count),'Person-visible class counts match the actual calls, including replay')
     }
    }
    if(directory)await page.screenshot({path:directory+'/'+name+'-'+width+'.png',fullPage:true})
   }
  }
  for(const [name,path] of pages)await capture(name,path)
  if(limits){await context.close();return}
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
