import assert from 'node:assert/strict'
import {mkdir,readFile} from 'node:fs/promises'
import {schemaErrors} from '../../src/modules/agent-door/conformance/schema.mjs'

export const errorCode=answer=>answer.result?._meta?.['com.runeditrun/error']?.code??answer.body?.error?.data?.code

/** Both transports exercise the production handler; credentials stay in memory. */
export function publicMcp(request,origin,token) {
 let id=0
 return async(method,params={})=>{
  const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})})
  const body=await response.json()
  return {status:response.status,body,result:body.result,headers:response.headers}
 }
}

export function nativeCommands({request,origin,cookie}) {
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 return async(type,payload)=>{
  const response=await request(origin+'/api/barrow/commands',{method:'POST',headers,body:JSON.stringify({type,payload})})
  const body=await response.json()
  return {status:response.status,body,result:body.result}
 }
}

/** One read-only sanity journey, reused by HTTP and signed Business conformance. */
export async function proveCartFormParity({request,origin,cookie,tool,accountId,cart}) {
 const command=nativeCommands({request,origin,cookie})
 const headers={Cookie:cookie,Origin:origin}
 const read=async path=>{
  const response=await request(origin+path,{headers});assert.equal(response.status,200)
  return response.json()
 }
 const before=await read('/api/barrow/state'),audit=await read('/api/barrow/audit')
 for(const layout of ['vertical','matrix']) {
  for(const supplied of [{cart},{},{cart:[]}]) {
   const args={accountId,layout,...supplied},native=await command('cart.form',args),answer=await tool('barrow.cart.form',args)
   assert.equal(native.status,200)
   assert.equal(answer.status,200);assert.ok(!answer.result?.isError,JSON.stringify(answer.result))
   assert.deepEqual(answer.result.structuredContent,native.result,'MCP retains the native filename, currency and exact CSV bytes')
  }
 }
 const after=await read('/api/barrow/state')
 assert.deepEqual(after,before,'Form reads cause no native commercial changes')
 assert.deepEqual(await read('/api/barrow/audit'),audit,'Form reads create no commercial audit event')
 console.log('PROBE BASE-AGENT-002 parity: populated vertical and matrix carts, omitted and empty carts -> identical native and MCP forms; no commercial writes')
}

/** The advertised schema must describe results that actually crossed MCP. */
export function validateFormResult(schema,result) {
 assert.deepEqual(schemaErrors(schema,result),[])
 for(const key of ['filename','currency','csv']) {
  const missing={...result};delete missing[key]
  assert.ok(schemaErrors(schema,missing).length,'Output schema rejects a missing '+key)
  assert.ok(schemaErrors(schema,{...result,[key]:1}).length,'Output schema rejects a non-string '+key)
 }
}

/** Real built-page downloads; assertions run at 1440, optional proof also at 390. */
export async function proveCartFormDownloads({h,as,accountId,cart,mcp}) {
 const {chromium,expect}=await import('@playwright/test')
 const {signedContext}=await import('../journeys/browser-helpers.mjs')
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 try {
  const context=await signedContext(browser,h,as)
  try {
   const page=await context.newPage();await page.goto(h.origin+'/app')
   await page.getByRole('button',{name:'Paste or upload CSV',exact:true}).click()
   let dialog=page.getByRole('dialog',{name:'Add lines by paste or CSV',exact:true})
   await dialog.getByLabel('Paste lines',{exact:true}).fill(cart.map(line=>line.sku+' '+line.quantity).join('\n'))
   await dialog.getByRole('button',{name:'Preview pasted lines',exact:true}).click()
   await dialog.getByRole('button',{name:'Replace cart',exact:true}).click()
   await expect(dialog).not.toBeVisible()
   await page.getByRole('button',{name:'Paste or upload CSV',exact:true}).click()
   dialog=page.getByRole('dialog',{name:'Add lines by paste or CSV',exact:true})
   const evidence=process.env.BARROW_AGENT_EVIDENCE
   if(evidence)await mkdir(evidence,{recursive:true})
   for(const width of evidence?[1440,390]:[1440]) {
    await page.setViewportSize({width,height:1000})
    for(const layout of ['vertical','matrix']) {
     const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/barrow/commands')&&response.request().postDataJSON()?.type==='cart.form')
     const downloadPromise=page.waitForEvent('download')
     await dialog.getByRole('button',{name:layout==='vertical'?'Download order form (one row per item)':'Download order form (style × size)',exact:true}).click()
     const [response,download]=await Promise.all([responsePromise,downloadPromise])
     const native=(await response.json()).result,answer=await mcp('tools/call',{name:'barrow.cart.form',arguments:{accountId,layout,cart}})
     const result=answer.result?.structuredContent
     assert.equal(response.status(),200);assert.ok(!answer.result?.isError)
     assert.deepEqual(result,native)
     assert.equal(download.suggestedFilename(),result.filename)
     assert.equal(await download.failure(),null)
     assert.deepEqual(await readFile(await download.path()),Buffer.from(result.csv),'Actual browser CSV bytes match MCP')
    }
    if(width===1440) {
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
     assert.deepEqual(await dialog.locator('button').evaluateAll(elements=>elements.filter(e=>e.checkVisibility()&&!/[A-Za-z0-9]/.test(e.textContent??'')&&!e.getAttribute('aria-describedby')).map(e=>e.outerHTML)),[])
    }
    if(evidence)await dialog.screenshot({path:evidence+'/cart-form-'+width+'.png'})
   }
   console.log('PROBE BASE-AGENT-002 downloads: built-page populated forms -> native filename, currency and exact MCP CSV bytes at 1440'+(evidence?' and 390':''))
  } finally {await context.close()}
 } finally {await browser.close()}
}
