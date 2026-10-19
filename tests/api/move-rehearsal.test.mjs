import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

const header = 'accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty';

test('MOVE-007: a reconciled account/price rehearsal compares source and planned totals, refuses unknown SKUs and records the approved fingerprint, read-only until apply', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier);
 await pier.command('item.save', { sku: 'KALE-1', name: 'Kale chips', unit: 'case', packSize: '1' });
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 5000 } });
 const rows = sku => [
  `cedar,Cedar Street Pantry,buyer@example.test,${products.customer.id},30,5000,OAT-1,7000,2`,
  `birch,Birch Lane Grocer,birch@example.test,pier-birch,30,10000,OAT-1,6400,1`,
  `birch,Birch Lane Grocer,birch@example.test,pier-birch,30,10000,KALE-1,3100,6`,
  `wren,Wren & Co.,wren@example.test,pier-wren,14,0,${sku},2500,1`,
 ];
 const source = sku => `${header}\n${rows(sku).join('\n')}\n`;
 const effects = async () => ({ pier: (await pier.api('/api/pier/state')).commands?.length, state: JSON.stringify(await h.api('/api/barrow/state')), mail: (await h.db.prepare('SELECT COUNT(*) AS n FROM rer_mail_development_outbox').first()).n, audit: (await h.db.prepare('SELECT COUNT(*) AS n FROM bw_audit').first()).n });

 // The rehearsal: source against planned counts and USD sums; the unknown SKU is a named error.
 const before = await effects();
 const rehearsal = await h.api('/api/barrow/imports/preview', { csv: source('NOPE-1') });
 assert.deepEqual(rehearsal.reconciliation.source, { accounts: 3, prices: 4, unitCentsUsd: 7000 + 6400 + 3100 + 2500, minimumCentsUsd: 15000 });
 assert.deepEqual(rehearsal.reconciliation.planned, { accounts: 3, prices: 4, unitCentsUsd: 19000, minimumCentsUsd: 15000, create: 2, update: 1, unchanged: 0 });
 assert.equal(rehearsal.reconciliation.matches, true); assert.deepEqual(rehearsal.reconciliation.rejectedColumns, []);
 assert.deepEqual(rehearsal.reconciliation.unknownSkus, ['NOPE-1']);
 const unknown = rehearsal.diagnostics.find(row => row.code === 'IMPORT_SKU_UNKNOWN');
 assert.equal(unknown.severity, 'error'); assert.match(unknown.message, /Wren & Co\. \(wren\): SKU NOPE-1 is not an active item in the connected Pier catalog/);
 assert.equal((await h.api('/api/barrow/imports/apply', { csv: source('NOPE-1'), fingerprint: rehearsal.fingerprint }, { status: 409 })).error.code, 'IMPORT_DIAGNOSTICS');
 // Preview and a refused apply write nothing: no account, invitation, order or Pier command.
 assert.deepEqual(await effects(), before);

 // Correct the SKU in the source, rehearse again and apply with the owner's recorded approval of that fingerprint.
 const corrected = await h.api('/api/barrow/imports/preview', { csv: source('KALE-1') });
 assert.deepEqual(corrected.reconciliation.unknownSkus, []); assert.equal(corrected.diagnostics.filter(row => row.severity === 'error').length, 0);
 assert.match(corrected.reconciliation.skuCheck, /Checked against the connected Pier catalog/);
 let job = await h.api('/api/barrow/imports/apply', { csv: source('KALE-1'), fingerprint: corrected.fingerprint });
 for (let batch = 0; job.state !== 'completed' && batch < 5; batch++) job = await h.api('/api/barrow/imports/apply', { csv: source('KALE-1'), fingerprint: corrected.fingerprint });
 assert.equal(job.state, 'completed');
 const state = await h.api('/api/barrow/state');
 assert.deepEqual(state.accounts.map(account => [account.id, account.value.prices.length]), [['birch', 2], ['cedar', 1], ['wren', 1]]);
 const approvals = (await h.api('/api/barrow/audit')).events.filter(event => event.action === 'import.approved');
 assert.equal(approvals.length, 1); assert.equal(approvals[0].actorId, state.actor.id); assert.equal(approvals[0].revision, corrected.fingerprint);
 assert.match(approvals[0].reason, /3 accounts \(2 new, 1 updated, 0 unchanged\), 4 price rows, USD 19000 unit cents and 15000 minimum cents/);

 // With Pier unreachable the SKU check did not run, the rehearsal says so, and apply refuses.
 const cut = await installation({ bindings: { PIER_ORIGIN: 'http://127.0.0.1:9', PIER_SESSION: 'pier=offline' } }); t.after(() => cut.close());
 const blind = await cut.api('/api/barrow/imports/preview', { csv: source('KALE-1') });
 assert.match(blind.reconciliation.skuCheck, /Did not run: Pier was unreachable/);
 assert.ok(blind.diagnostics.some(row => row.code === 'IMPORT_SKU_UNCHECKED' && row.severity === 'error'));
 assert.equal((await cut.api('/api/barrow/imports/apply', { csv: source('KALE-1'), fingerprint: blind.fingerprint }, { status: 409 })).error.code, 'IMPORT_DIAGNOSTICS');
});
