import assert from 'node:assert/strict';
import {after} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const {chromium}=createRequire(resolve('package.json'))('@playwright/test');
const launch=chromium.launch.bind(chromium);
let contexts=0,limited=0;
const clients=new Set();
chromium.launch=async options=>{
 const browser=await launch(options),newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await newContext(options);
  contexts++;clients.add(options.extraHTTPHeaders?.['CF-Connecting-IP']);
  context.on('response',response=>{
   if(response.status()===429){limited++;console.error('Unexpected HTTP 429 at '+new URL(response.url()).pathname)}
  });
  return context;
 };
 return browser;
};
after(()=>{
 console.log(`STOREFRONT_RESULT pid=${process.pid} browser_contexts=${contexts} distinct_clients=${clients.size} http_429=${limited}`);
 assert.equal(contexts,20);
 assert.equal(clients.size,contexts);
 assert.ok(!clients.has(undefined));
 assert.equal(limited,0);
});
console.log(`STOREFRONT_REPEAT pid=${process.pid} repetitions=5 head=${execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}`);
// Cache-bust only the journey registration. Its harness and browser helper stay
// loaded once, and Node's test-concurrency=1 runs all five cases serially.
for(let iteration=1;iteration<=5;iteration++) {
 const journey=pathToFileURL(resolve('tests/journeys/storefront-branding.test.mjs'));
 journey.searchParams.set('iteration',String(iteration));
 await import(journey.href);
}
