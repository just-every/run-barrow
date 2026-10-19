// Explicit release/manual journey: slow fresh-install and restore work stays outside push Verify.
// Run: node --test tests/journeys/installation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { workspace, removeWorkspace, freshCheckout, rer, start, signIn, api, capture } from './install-harness.mjs';

test('BASE-001: fresh native setup, Lobby and app work without Pier; CLI export and empty restore preserve the installation', async t => {
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
