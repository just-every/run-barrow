// Explicit release/manual journey: slow fresh-install and restore work stays outside push Verify.
// Run: node --test tests/journeys/installation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { workspace, removeWorkspace, freshCheckout, rer, start, signIn, api, capture } from './install-harness.mjs';

test('BASE-001 / RPT-006: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation', async t => {
 const directory = await workspace();
 let running, browser;
 t.after(async () => {
  try { if (running) await running.stop(); }
  finally { try { await browser?.close(); } finally { await removeWorkspace(directory); } }
 });
 const root = await freshCheckout(directory, 'first');
 const declared = await Promise.all(['edition.json', 'rer-project.json', 'deploy.json', 'wrangler.jsonc'].map(async file => [file, await readFile(join(root, file), 'utf8')]));
 running = await start(root);
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 const first = await signIn(browser, running);
 const native = await api(first.context, running, '/api/barrow/state');
 assert.equal(native.actor.role, 'owner'); assert.equal(native.connection.configured, false);
 const saved = await api(first.context, running, '/api/barrow/commands', { type: 'account.save', payload: { id: 'cedar', value: { name: 'Cedar Street Pantry', email: 'cedar@example.test', pierCustomerId: 'source-customer', termsDays: 30, minimumCents: 10000, prices: [{ sku: 'OAT-1', unitCents: 6501, minQty: 2 }] } } });
 const reportSchedule = await api(first.context, running, '/api/barrow/commands', { type: 'report.save', payload: { name: 'Monthly Cedar aging', reportType: 'finance', filters: { accountId: 'cedar' }, recipientIds: [native.actor.id] } });
 const reportRun = await api(first.context, running, '/api/barrow/commands', { type: 'report.run', payload: { scheduleId: reportSchedule.result.id } });
 const reportPath = `/api/barrow/report-runs/${reportRun.result.id}.json`;
 const frozen = await first.context.request.get(running.origin + reportPath); assert.equal(frozen.status(), 200);
 for (const width of [1440, 390]) {
  await first.page.setViewportSize({ width, height: 1000 });
  await first.page.goto(running.origin + '/');
  assert.equal(await first.page.locator('html').getAttribute('data-state'), 'claimed');
  const entry = first.page.getByRole('link', { name: 'Sign in', exact: true }); await entry.waitFor();
  await capture(first.page, `base-lobby-${width}`); await entry.click();
  const owner = first.page.getByRole('link', { name: 'Sign in as Barrow installation owner', exact: true });
  await owner.waitFor(); await capture(first.page, `base-signin-${width}`); await owner.click();
  await first.page.getByRole('button', { name: 'Data', exact: true }).waitFor();
  await first.page.reload();
  await first.page.getByRole('alert').filter({ hasText: 'Pier' }).waitFor();
  await capture(first.page, `base-missing-connection-${width}`);
  await first.page.getByRole('button', { name: 'Data', exact: true }).click();
  const panel = first.page.getByRole('region', { name: 'Saved monthly reports' });
  await panel.getByRole('heading', { name: 'Monthly Cedar aging', exact: true }).waitFor();
  const shot = async (name, target = panel.locator('form')) => { await target.scrollIntoViewIfNeeded(); await capture(first.page, `rpt006-${name}-${width}`, false); assert.equal(await first.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false); };
  await shot('saved');
  await panel.getByLabel('Report name', { exact: true }).fill(`Cedar monthly sales ${width}`);
  await panel.getByLabel('Saved account ID (optional)').fill('cedar');
  await panel.getByLabel('Saved SKU (optional)').fill('OAT-1');
  await panel.getByRole('group', { name: 'Staff recipients' }).getByRole('checkbox').first().check();
  await panel.getByRole('button', { name: 'Save monthly report', exact: true }).click();
  const scheduleCard = panel.locator('article').filter({ has: first.page.getByRole('heading', { name: `Cedar monthly sales ${width}`, exact: true }) });
  await scheduleCard.waitFor(); await shot('created', scheduleCard);
  await scheduleCard.getByRole('button', { name: 'Run previous month now', exact: true }).click();
  const runCard = panel.locator('article').filter({ has: first.page.getByRole('heading', { name: new RegExp(`Cedar monthly sales ${width} ·`) }) });
  await runCard.getByRole('link', { name: 'Download frozen report', exact: true }).waitFor();
  const downloadPath = await runCard.getByRole('link', { name: 'Download frozen report', exact: true }).getAttribute('href');
  const snapshot = await first.context.request.get(running.origin + downloadPath); assert.equal(snapshot.status(), 200);
  assert.equal((await snapshot.json()).name, `Cedar monthly sales ${width}`); await shot('frozen', runCard);
  await scheduleCard.getByRole('button', { name: 'Remove me from this report', exact: true }).click();
  await scheduleCard.getByText('Removed', { exact: false }).waitFor();
  assert.equal((await first.context.request.get(running.origin + downloadPath)).status(), 403); await shot('revoked', scheduleCard);
  await panel.getByLabel('Report name', { exact: true }).fill(`Cedar recovery ${width}`);
  await panel.getByLabel('Saved account ID (optional)').fill('missing-account');
  await panel.getByRole('group', { name: 'Staff recipients' }).getByRole('checkbox').first().check();
  await panel.getByRole('button', { name: 'Save monthly report', exact: true }).click();
  await panel.getByRole('alert').waitFor(); await shot('error', panel.getByRole('alert'));
  await panel.getByLabel('Saved account ID (optional)').fill('cedar');
  await panel.getByRole('button', { name: 'Save monthly report', exact: true }).click();
  await panel.getByRole('heading', { name: `Cedar recovery ${width}`, exact: true }).waitFor();
  assert.equal(await panel.getByRole('alert').count(), 0); await shot('recovered', panel.getByRole('heading', { name: `Cedar recovery ${width}`, exact: true }));
  const unavailable = await first.context.request.get(running.origin + '/api/barrow/catalogue?accountId=cedar');
  assert.equal(unavailable.status(), 503); assert.equal((await unavailable.json()).error.code, 'PIER_UNAVAILABLE');
 }
 await first.context.close(); await running.stop(); running = null;
 const output = join(directory, 'barrow.rer'); await rer(root, ['export', '--output', output]);
 const manifest = JSON.parse((await readFile(output, 'utf8')).split('\n')[0]);
 assert.deepEqual([...manifest.migrations].sort(), (await readdir(join(root, 'migrations/core'))).filter(name => name.endsWith('.sql')).sort());
 const restoredRoot = await freshCheckout(directory, 'restored');
 // The documented restore first prepares an empty checkout, then native dev sets up its new local owner.
 await rer(restoredRoot, ['install']);
 await rer(restoredRoot, ['import', '--input', output, '--yes']);
 running = await start(restoredRoot);
 const restored = await signIn(browser, running);
 const after = await api(restored.context, running, '/api/barrow/state');
 assert.deepEqual(after.accounts, [saved.result]); assert.deepEqual(after.orders, []);
 assert.equal(after.connection.configured, false); assert.equal(after.actor.role, 'owner');
 const reportState = await api(restored.context, running, '/api/barrow/report-schedules');
 assert.equal(reportState.schedules.find(row => row.id === reportSchedule.result.id).restored, 1);
 assert.equal((await restored.context.request.get(running.origin + reportPath)).status(), 403);
 const replay = await restored.context.request.post(running.origin + '/api/barrow/commands', { headers: { origin: running.origin }, data: { type: 'report.run', payload: { scheduleId: reportSchedule.result.id } } });
 assert.equal(replay.status(), 404);
 await api(restored.context, running, '/api/barrow/commands', { type: 'report.dispatch', payload: {} });
 for (const [file, before] of declared) assert.equal(await readFile(join(restoredRoot, file), 'utf8'), before, `${file} identity changed`);
 const health = await restored.context.request.get(running.origin + '/health'); assert.equal((await health.json()).status, 'ok');
 for (const width of [1440, 390]) {
  await restored.page.setViewportSize({ width, height: 1000 });
  await restored.page.goto(running.origin + '/app');
  await restored.page.getByRole('button', { name: 'Data', exact: true }).waitFor();
  await restored.page.getByRole('alert').filter({ hasText: 'Pier' }).waitFor();
  await capture(restored.page, `base-restored-${width}`);
 }
 await restored.context.close(); await running.stop(); running = null;
 const reexport = join(directory, 'restored.rer');
 await rer(restoredRoot, ['export', '--output', reexport]);
 const restoredManifest = JSON.parse((await readFile(reexport, 'utf8')).split('\n')[0]);
 assert.deepEqual(restoredManifest.migrations, manifest.migrations);
});

test('RPT-006: native account directory and selectors keep later-page accounts reachable without full-directory browser loads', async t => {
 const directory=await workspace();let running,browser;
 t.after(async()=>{try{if(running)await running.stop()}finally{try{await browser?.close()}finally{await removeWorkspace(directory)}}});
 const root=await freshCheckout(directory,'accounts');running=await start(root);
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const {context,page}=await signIn(browser,running);
 for(let i=0;i<55;i++)await api(context,running,'/api/barrow/commands',{type:'account.save',payload:{id:`sample-${String(i).padStart(2,'0')}`,value:{name:`Sample company ${String(i).padStart(2,'0')}`,email:`sample-${i}@example.test`,pierCustomerId:`source-${i}`,termsDays:30,minimumCents:10000,prices:[{sku:'OAT-1',unitCents:6500,minQty:2}]}}});
 const state=await api(context,running,'/api/barrow/state');assert.equal(state.accounts.length,25);assert.equal(state.accountPage.hasNext,true);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(running.origin+'/app');
  const shot=async(name,target)=>{if(target)await target.scrollIntoViewIfNeeded();await capture(page,`rpt006-accounts-${name}-${width}`,false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)};
  await page.getByRole('button',{name:'Accounts',exact:true}).click();
  const cards=page.getByRole('region',{name:'Trade account directory'});
  await cards.getByText('Account page 1 · 25 shown',{exact:true}).waitFor();assert.equal(await cards.locator('article').count(),25);await shot('first',cards);
  await cards.getByRole('button',{name:'Next accounts',exact:true}).click();await cards.getByText('Account page 2 · 25 shown',{exact:true}).waitFor();await shot('second',cards);
  await cards.getByRole('button',{name:'Next accounts',exact:true}).click();await cards.getByText('Account page 3 · 5 shown',{exact:true}).waitFor();assert.equal(await cards.getByRole('button',{name:'Next accounts',exact:true}).isDisabled(),true);await shot('last',cards);
  await cards.getByLabel('Sort trade accounts').selectOption('name-desc');await cards.getByText('Account page 1 · 25 shown',{exact:true}).waitFor();assert.equal(await cards.locator('article h2').first().textContent(),'Sample company 54');await shot('sorted',cards);
  await cards.getByLabel('Find trade accounts').fill('no matching company');await cards.getByText('No matching trade accounts on this page.').waitFor();await shot('empty',cards);
  await page.route('**/api/barrow/accounts?*',route=>route.abort());
  await cards.getByLabel('Find trade accounts').fill('sample-54');await cards.getByRole('alert').waitFor();await shot('error',cards);
  await page.unroute('**/api/barrow/accounts?*');await cards.getByRole('button',{name:'Retry accounts',exact:true}).click();
  await cards.getByText('Account page 1 · 1 shown',{exact:true}).waitFor();await shot('recovered',cards);
  await cards.getByRole('button',{name:'Prepare order',exact:true}).click();await page.getByRole('heading',{name:'Sample company 54',exact:true,level:1}).waitFor();
  const padPicker=page.getByRole('group',{name:'Trade account selection'});
  await padPicker.getByLabel('Find trade accounts').fill('sample-53');await padPicker.getByText('Account page 1 · 1 shown',{exact:true}).waitFor();
  // Paging/searching never changes the chosen account until an explicit selection.
  assert.equal(await padPicker.getByLabel('Trade account',{exact:true}).inputValue(),'sample-54');await shot('pad-selected',padPicker);
  await padPicker.getByLabel('Trade account',{exact:true}).selectOption('sample-53');await page.getByRole('heading',{name:'Sample company 53',exact:true,level:1}).waitFor();
  await page.getByRole('button',{name:'Accounts',exact:true}).click();await cards.getByText('Account page 1 · 25 shown',{exact:true}).waitFor();
  await cards.getByLabel('Find trade accounts').fill(width===1440?'sample-00':'sample-01');await cards.getByText('Account page 1 · 1 shown',{exact:true}).waitFor();
  await cards.getByRole('button',{name:'Edit account',exact:true}).click();const form=cards.locator('form');
  await form.getByLabel('Business name',{exact:true}).fill('Sample company 54');await form.getByText('sample-54',{exact:false}).waitFor();
  assert.equal(await form.getByRole('button',{name:'Save account',exact:true}).isDisabled(),true);
  await form.getByRole('button',{name:'Confirm separate companies',exact:true}).click();await shot('duplicate-review',form.getByText('Keep their accounts, sign-in emails and history separate.'));
  await form.getByRole('button',{name:'Save account',exact:true}).click();await form.waitFor({state:'detached'});
  const edited=await api(context,running,`/api/barrow/accounts/by-id/sample-${width===1440?'00':'01'}`);assert.equal(edited.value.email,`sample-${width===1440?'0':'1'}@example.test`);assert.equal(edited.value.name,'Sample company 54');
  // Every other existing selector uses the same paged source, including accounts not in workspace page one.
  const locations=page.getByLabel('Locations',{exact:true});
  await locations.getByLabel('Find trade accounts').fill('sample-54');await locations.getByText('Account page 1 · 1 shown',{exact:true}).waitFor();
  await locations.getByLabel('Trade account',{exact:true}).selectOption('sample-54');await locations.getByRole('form',{name:'Add a location'}).waitFor();await shot('locations',locations);
  await page.getByRole('button',{name:'Orders',exact:true}).click();const statement=page.getByRole('region',{name:'Account statement'});
  await statement.getByText('Account page 1 · 25 shown',{exact:true}).waitFor();
  await statement.getByRole('button',{name:'Next accounts',exact:true}).click();await statement.getByText('Account page 2 · 25 shown',{exact:true}).waitFor();
  await statement.getByRole('button',{name:'Next accounts',exact:true}).click();await statement.getByText('Account page 3 · 5 shown',{exact:true}).waitFor();
  await statement.getByLabel('Trade account',{exact:true}).selectOption('sample-54');await statement.getByText(/^Sample company 54 ·/).waitFor();await statement.getByText('No invoices in this period.',{exact:true}).waitFor();await shot('statement',statement);
  await page.getByRole('button',{name:'Data',exact:true}).click();
  const fulfillment=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Fulfillment & backorders',exact:true})}).first();
  await fulfillment.getByLabel('Find trade accounts').fill('sample-54');await fulfillment.getByText('Account page 1 · 1 shown',{exact:true}).waitFor();await fulfillment.getByLabel('Trade account',{exact:true}).selectOption('sample-54');await shot('fulfillment',fulfillment);
  const erasure=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Erase an unused trade account',exact:true})}).first();
  await erasure.getByLabel('Find trade accounts').fill('sample-54');await erasure.getByText('Account page 1 · 1 shown',{exact:true}).waitFor();await erasure.getByLabel('Trade account',{exact:true}).selectOption('sample-54');
  await erasure.getByRole('button',{name:'Review account erasure',exact:true}).click();await page.getByRole('dialog').getByRole('heading',{name:'Erase Sample company 54?',exact:true}).waitFor();await shot('erasure',page.getByRole('dialog'));await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
 }
 await context.close();await running.stop();running=null;
});
