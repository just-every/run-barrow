import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {cutoverFixture} from '../api/cutover-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('owner corrects cited cutover mappings, reviews missing releases and ledger differences, activates once and sees native-edit undo refusal at desktop and phone',async t=>{
 const f=await cutoverFixture(t,{built:true,https:true}),{h,input}=f;
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Move in',exact:true}).click();const review=page.getByRole('region',{name:'Cutover review',exact:true});
 await review.getByLabel('Incumbent workbook (XLSX, at most 1 MiB)',{exact:false}).setInputFiles({name:input.workbook.name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(input.workbook.base64,'base64')});
 await review.getByText('Ready: '+input.workbook.name,{exact:true}).waitFor();
 await review.getByLabel('Ledger export (CSV, at most 1 MiB)',{exact:false}).setInputFiles({name:input.ledger.name,mimeType:'text/csv',buffer:Buffer.from(input.ledger.csv)});
 await review.getByText('Ready: '+input.ledger.name,{exact:true}).waitFor();
 await review.getByLabel('Existing target account IDs, separated by commas',{exact:false}).fill('cedar, birch');
 await review.getByLabel('Mapping run ID',{exact:false}).fill(input.runId);
 await review.getByLabel('I authorize native read-only tools',{exact:false}).check();
 const cards=review.locator(':scope > .br-card');await captureRegionWidths(page,cards.nth(0),'cutover-source-scope');
 await review.getByRole('button',{name:'Compare supplied exports',exact:true}).click();
 await review.getByText(/Missing release coverage: orders:order-a declares 2/).waitFor();
 await expect(review.getByRole('button',{name:'Activate reviewed retained history',exact:true})).toBeDisabled();
 await captureRegionWidths(page,cards.nth(1),'cutover-ambiguous-mappings');
 // Same-name companies are resolved by their source IDs and explicit native IDs.
 await review.getByLabel('Target for accounts:source-a',{exact:true}).selectOption('cedar');
 await review.getByLabel('Target for accounts:source-b',{exact:true}).selectOption('birch');
 await review.getByRole('button',{name:'Recompare corrected mappings',exact:true}).click();
 await expect(review.getByText('The displayed comparison is stale.',{exact:false})).toHaveCount(0);
 for(const [key,value] of Object.entries(f.mappings)) {
  const select=review.getByLabel('Target for '+key,{exact:true});if(await select.inputValue()!==value)await select.selectOption(value);
 }
 const recompare=review.getByRole('button',{name:'Recompare corrected mappings',exact:true});if(await recompare.count())await recompare.click();
 await expect(review.getByText('The displayed comparison is stale.',{exact:false})).toHaveCount(0);
 await expect(review.getByRole('table').first()).toContainText('-3000');
 await expect(review.getByText('ledger.csv',{exact:true}).first()).toBeVisible();
 await captureRegionWidths(page,cards.nth(1),'cutover-reconciled-mappings');
 await review.getByLabel('Owner disposition for differences and missing releases (required)',{exact:false}).fill(f.approve({}).disposition);
 await review.getByLabel('I approve every exact mapping',{exact:false}).check();
 await review.getByLabel('I approve the per-currency counts',{exact:false}).check();
 // Correct one reviewed mapping: both signoffs become invalid until a new comparison.
 await review.getByLabel('Target for prices:price-a',{exact:true}).selectOption('retain-history');
 await expect(review.getByRole('button',{name:'Activate reviewed retained history',exact:true})).toBeDisabled();
 await expect(review.getByLabel('I approve every exact mapping',{exact:false})).not.toBeChecked();
 await review.getByLabel('Target for prices:price-a',{exact:true}).selectOption('cedar/OAT-1');
 await review.getByRole('button',{name:'Recompare corrected mappings',exact:true}).click();
 await review.getByLabel('Owner disposition for differences and missing releases (required)',{exact:false}).fill(f.approve({}).disposition);
 await review.getByLabel('I approve every exact mapping',{exact:false}).check();await review.getByLabel('I approve the per-currency counts',{exact:false}).check();
 const before=(await f.pier.api('/api/pier/state')).orders,mail=h.mail.deliveries.length;
 await review.getByRole('button',{name:'Activate reviewed retained history',exact:true}).click();
 await review.getByRole('button',{name:'Retained history activated',exact:true}).waitFor();
 await expect(cards.nth(2)).toContainText('active');await captureRegionWidths(page,cards.nth(2),'cutover-approved-history');
 const active=(await h.api('/api/barrow/cutover')).imports[0];assert.equal(active.state,'active');assert.deepEqual((await f.pier.api('/api/pier/state')).orders,before);assert.equal(h.mail.deliveries.length,mail);
 const account=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:45}});
 await review.getByRole('button',{name:'Review cutover undo',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Undo retained history activation?',exact:true});await dialog.getByRole('button',{name:'Undo cutover activation',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Native records changed');await captureRegionWidths(page,dialog,'cutover-native-edit-refusal');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await h.api('/api/barrow/accounts/by-id/cedar')).value.termsDays,45);
 // This screen's controls all have visible words; it has no icon-only controls.
 assert.deepEqual(await page.getByRole('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent?.trim()).map(button=>button.getAttribute('aria-label'))),[]);
});
