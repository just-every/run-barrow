// Builder's local browser use, deliberately separate from CI's small integration suite.
// All supplied business records are test fixtures; stock is the real pinned Pier Worker.
import { installation,stock } from './api/harness.mjs';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir,writeFile,readFile,chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {createRedaction} from '@runeditrun/rer/redaction';
import {localVariables} from '@runeditrun/rer/local/environment';
const output=resolve(process.env.BARROW_SCREENSHOTS??'/tmp/barrow-builder-screenshots');await mkdir(output,{recursive:true});
const pier=await installation({pier:true});const items=await stock(pier,'100');
let server,browser,log='';
async function shot(page,name){for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'page fits viewport')}}
try {
 let vars='';try{vars=await readFile('.dev.vars','utf8')}catch{}
 vars=vars.split('\n').filter(line=>!/^PIER_(ORIGIN|SESSION)=/.test(line)).join('\n').replace(/\n*$/,'\n');
 await writeFile('.dev.vars',vars+`PIER_ORIGIN=${JSON.stringify(pier.origin)}\nPIER_SESSION=${JSON.stringify(pier.cookie)}\n`,{mode:0o600});await chmod('.dev.vars',0o600);
 server=spawn(process.execPath,['node_modules/@runeditrun/rer/global/rer.mjs','dev','--foreground'],{stdio:['ignore','pipe','pipe'],env:{...process.env,RER_SERVER_JOURNEY:'1'}});
 for(const stream of [server.stdout,server.stderr])stream.on('data',b=>{log+=b});
 console.log('Journey: starting rer dev with real Pier.');let open;for(let i=0;i<1200;i++){open=log.match(/RER_OPEN (http[^\s]+)/)?.[1];if(open)break;if(server.exitCode!==null)throw Error('rer dev exited before readiness; private logs retained only in memory.');await new Promise(r=>setTimeout(r,500))}
 assert.ok(open,'rer dev became ready');console.log('Journey: rer dev is ready; opening the portal.');const origin=new URL(open).origin;
 browser=await chromium.launch({headless:true});const owner=await browser.newContext({viewport:{width:1440,height:1000}});const page=await owner.newPage();
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.goto(open);await page.waitForLoadState('networkidle');
 if(new URL(page.url()).pathname==='/setup'){await shot(page,'setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 // Switch the automatic dev identity to an ordinary mailed owner session.
 const session=await (await owner.request.get(origin+'/auth/session')).json();
 await page.goto(origin+'/signin?returnTo=%2Fapp');await page.getByLabel('Email').fill(session.operator.email);await page.getByRole('button',{name:'Email a sign-in link',exact:true}).click();
 const ownerListing=await (await owner.request.get(origin+'/__dev/outbox')).text();let ownerLink;
 for(const [,path] of ownerListing.matchAll(/href="(\/__dev\/outbox\?message=[^"]+)"/g)) {const detail=await (await owner.request.get(origin+path.replaceAll('&amp;','&'))).text();if(detail.includes(session.operator.email)){ownerLink=detail.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&');if(ownerLink)break}}
 assert.ok(ownerLink,'ordinary owner sign-in delivered');await page.goto(new URL(ownerLink,origin).href);await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.goto(origin+'/app');await page.getByRole('button',{name:'Add trade account'}).waitFor();
 await page.getByRole('button',{name:'Add trade account'}).click();
 await page.getByLabel('Business name',{exact:true}).fill('Cedar Street Pantry');await page.getByLabel('Customer email',{exact:true}).fill('cedar@example.test');await page.getByLabel('Account ID').fill('cedar');await page.getByLabel('Pier customer ID',{exact:true}).fill(items.customer.id);await page.getByLabel('Minimum order (AUD cents)',{exact:true}).fill('10000');await page.getByLabel('Agreed prices').fill('OAT-1,6500,2');await shot(page,'account-editor');await page.getByRole('button',{name:'Save account',exact:true}).click();await page.getByRole('button',{name:'Send invitation',exact:true}).waitFor();await shot(page,'accounts');
 await page.getByRole('button',{name:'Send invitation',exact:true}).click();await page.getByText('Invitation requested.',{exact:false}).waitFor();
 const listing=await (await owner.request.get(origin+'/__dev/outbox')).text();let link;
 for(const [,path] of listing.matchAll(/href="(\/__dev\/outbox\?message=[^"]+)"/g)) {const detail=await (await owner.request.get(origin+path.replaceAll('&amp;','&'))).text();if(detail.includes('cedar@example.test')){link=detail.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&');if(link)break}}
 assert.ok(link,'invitation delivered to development outbox');
 const buyer=await browser.newContext({viewport:{width:1440,height:1000}});const customer=await buyer.newPage();customer.on('pageerror',e=>pageErrors.push(e.message));await customer.goto(new URL(link,origin).href);await shot(customer,'invitation');await customer.getByRole('button',{name:'Confirm',exact:true}).click();await customer.getByLabel('Quantity for Toasted oat granola').waitFor();await shot(customer,'customer-catalogue');
 await customer.getByLabel('Quantity for Toasted oat granola').fill('4');await customer.getByLabel('Your purchase order / reference').fill('CEDAR-OCT-001');await customer.getByRole('button',{name:'Prepare draft',exact:true}).click();await customer.getByRole('button',{name:'Submit for supplier review',exact:true}).waitFor();await shot(customer,'customer-draft');await customer.getByRole('button',{name:'Submit for supplier review',exact:true}).click();await customer.getByText('Submitted for supplier review. Stock is not reserved yet.',{exact:true}).waitFor();await shot(customer,'customer-submitted');
 await page.reload();await page.getByRole('button',{name:'Orders',exact:true}).click();await page.getByRole('button',{name:'Approve & reserve stock',exact:true}).waitFor();await shot(page,'supplier-review');await page.getByRole('button',{name:'Approve & reserve stock',exact:true}).click();await page.getByRole('link',{name:'Download invoice CSV',exact:true}).waitFor();await shot(page,'supplier-reserved');
 const invoice=await (await owner.request.get(origin+await page.getByRole('link',{name:'Download invoice CSV'}).getAttribute('href'))).text();assert.ok(invoice.includes('26000'));assert.ok(invoice.includes('CEDAR-OCT-001'));
 await customer.reload();await customer.getByRole('button',{name:'Orders',exact:true}).click();await customer.getByRole('link',{name:'Download invoice CSV'}).waitFor();await shot(customer,'customer-invoice');
 await page.getByRole('button',{name:'Move in',exact:true}).click();const csv=await readFile('fixtures/trade-accounts.csv','utf8');await page.getByLabel('CSV source',{exact:true}).fill(csv);await page.getByRole('button',{name:'Run dry run',exact:true}).click();await page.getByRole('button',{name:'Apply reviewed import',exact:true}).waitFor();await shot(page,'move-in-preview');await page.getByRole('button',{name:'Apply reviewed import',exact:true}).click();await page.getByText('Import completed. Accounts are available in the workspace.',{exact:true}).waitFor();await page.getByRole('button',{name:'View',exact:true}).first().click();await page.getByRole('button',{name:'Review undo',exact:true}).waitFor();await shot(page,'move-in-journal');await page.getByRole('button',{name:'Review undo',exact:true}).click();await shot(page,'move-in-undo-confirm');await page.getByRole('button',{name:'Undo import',exact:true}).click();await page.getByText('Undo finished. Review the journal for preserved records.',{exact:true}).waitFor();await shot(page,'move-in-undone');
 await page.getByRole('button',{name:'Data',exact:true}).click();await shot(page,'data');await page.getByRole('button',{name:'Create private agent credential',exact:true}).click();const token=await page.getByLabel('Private credential',{exact:true}).inputValue();assert.ok(token);await page.getByRole('button',{name:'Hide credential',exact:true}).click();
 const draft=await fetch(origin+'/api/barrow/commands',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({type:'order.prepare',payload:{accountId:'cedar',reference:'AGENT-PREPARED',lines:[{sku:'OAT-1',quantity:2}]}})});assert.equal(draft.status,200);
 await page.getByRole('button',{name:'Revoke my agent credentials',exact:true}).click();await page.getByText('Your agent credentials have been revoked.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Orders',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Orders',exact:true}).click();await page.getByText('Reference: AGENT-PREPARED',{exact:true}).waitFor();await shot(page,'agent-draft');
 await page.getByRole('button',{name:'Accounts',exact:true}).click();await page.getByRole('button',{name:'Add trade account'}).click();await page.getByLabel('Business name',{exact:true}).fill('Sample Trade Account');await page.getByLabel('Customer email',{exact:true}).fill('unused@example.test');await page.getByLabel('Account ID').fill('unused');await page.getByLabel('Pier customer ID',{exact:true}).fill(items.customer.id);await page.getByRole('button',{name:'Save account',exact:true}).click();await page.getByText('Trade account saved.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByRole('combobox').selectOption('unused');await page.getByRole('button',{name:'Review account erasure',exact:true}).click();await page.getByLabel('Type ERASE to confirm',{exact:true}).fill('ERASE');await shot(page,'erasure-confirm');await page.getByRole('button',{name:'Permanently erase account',exact:true}).click();await page.getByText('Account erasure completed.',{exact:true}).waitFor();await shot(page,'erased');
 const signedOut=await browser.newContext();const signin=await signedOut.newPage();await signin.goto(origin+'/signin');await shot(signin,'sign-in');await signedOut.close();
 assert.deepEqual(pageErrors,[],'no browser exceptions');console.log('Builder journey passed: real rer dev, invitation, customer order, supplier reservation, invoice, move-in/undo and agent prepare/revoke. Screenshots captured at 1440 and 390.');
}catch(error){
 const redact=createRedaction();redact.addSecrets(pier.cookie);try{redact.addSecrets(Object.values(localVariables(await readFile('.dev.vars','utf8'))))}catch{}
 console.error(redact.redact(log.split('\n').filter(line=>!line.includes('RER_OPEN')).join('\n')).slice(-6000));throw error;
}finally{
 await browser?.close();
 if(server){const stop=spawn(process.execPath,['node_modules/@runeditrun/rer/global/rer.mjs','dev','--stop'],{stdio:'ignore'});await new Promise(resolve=>stop.once('close',resolve));if(server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('close',resolve))}}
 await pier.close();
}
