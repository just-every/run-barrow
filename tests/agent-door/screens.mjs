import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'

/** Optional captures of the real disposable production installation. */
export async function captureAgents({request,origin,cookie}) {
 const directory=process.env.BARROW_AGENT_EVIDENCE
 if(!directory)return
 const {chromium}=await import('@playwright/test')
 await mkdir(directory,{recursive:true})
 const browser=await chromium.launch({args:['--no-sandbox']})
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
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
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
