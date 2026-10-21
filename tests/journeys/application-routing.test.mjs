// Manual AUTO-001 journey: built HTTPS Worker, real D1/Pier, only Resend's edge faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock } from '../api/harness.mjs';
import { captureWidths, signedContext } from './browser-helpers.mjs';

test('the owner routes applications by territory and the escalated review task stays on the board until a decision at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier);
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.signIn('territory-owner@example.test', 'admin');

 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 t.after(() => browser.close());
 const context = await signedContext(browser, h); t.after(() => context.close());
 const owner = await context.newPage();
 await owner.goto(h.origin + '/app');
 if (new URL(owner.url()).pathname === '/setup') {
  await owner.getByLabel('Your name').fill('synthetic-barrow-400');
  await owner.getByRole('checkbox').check();
  await owner.getByRole('button', { name: 'Finish setup', exact: true }).click();
 }
 await owner.getByRole('button', { name: 'Accounts', exact: true }).click();
 const routing = owner.getByRole('region', { name: 'Application routing', exact: true });
 await routing.getByText('No routing rules', { exact: false }).waitFor();
 await captureWidths(owner, 'application-routing-empty');
 const people = (await h.api('/api/barrow/application-rules')).reviewers, label = role => { const person = people.find(row => row.role === role); return `${person.name} (${role})` };
 await routing.getByRole('button', { name: 'Add a rule', exact: true }).click();
 const form = routing.getByRole('form', { name: 'Application routing rules', exact: true });
 await form.getByLabel('Rule ID', { exact: true }).fill('southeast');
 await form.getByLabel('Rule name', { exact: true }).fill('Southeast without a certificate');
 await form.getByLabel('Requested location states (comma separated)', { exact: true }).fill('SC, NC');
 await form.getByLabel('Certificate condition', { exact: true }).selectOption('missing');
 await form.getByLabel('Rule 1 territory label', { exact: true }).fill('Southeast');
 await form.getByLabel('Rule 1 reviewer', { exact: true }).selectOption({ label: label('admin') });
 await form.getByLabel('Rule 1 escalation person', { exact: true }).selectOption({ label: label('owner') });
 await form.getByLabel('Rule 1 deadline days', { exact: true }).fill('2');
 await form.getByLabel('Reason for this routing change', { exact: true }).fill('Southeast applications without a certificate go to the territory owner.');
 await captureWidths(owner, 'application-routing-rule-form');
 await form.getByRole('button', { name: 'Save application routing', exact: true }).click();
 await expect(form.getByLabel('Rule ID', { exact: true })).toHaveValue('southeast');
 await expect.poll(async () => (await h.api('/api/barrow/application-rules')).rules.length).toBe(1);
 await captureWidths(owner, 'application-routing-saved');

 // An applicant in the Southeast verifies without a certificate; the routed task appears on the owner's board.
 const apiForm = await h.api('/api/barrow/applications/form', undefined, { as: '' });
 await new Promise(resolve => setTimeout(resolve, 3050));
 const pending = await h.api('/api/barrow/applications', { name: 'Palmetto & Pine Provisions', ein: '12-3456789', contactName: 'River Buyer', email: 'applicant@example.test', phone: '803 555 0101', annualVolumeUsd: 90000, locations: [{ name: 'Downtown', line1: '101 Main Street', city: 'Columbia', state: 'SC', zip: '29201' }], consent: true, website: '', formToken: apiForm.formToken }, { as: '' });
 const code = h.mail.requests.findLast(row => row.message.to.includes('applicant@example.test') && row.message.subject === 'Verify your trade application').message.text.match(/code is (\d{6})/)[1];
 assert.equal((await h.request('/api/barrow/applications/verify', { method: 'POST', body: { id: pending.id, code }, as: '' })).status, 200);
 await owner.reload();
 await owner.getByRole('button', { name: 'Data', exact: true }).click();
 await owner.getByLabel('Queue view').selectOption('all');
 const task = owner.locator('article').filter({ hasText: 'Review trade application Palmetto & Pine Provisions' });
 await task.getByText(/routed by “Southeast without a certificate” to territory Southeast; no certificate attached/).waitFor();
 await captureWidths(owner, 'application-task-routed');

 // Past its deadline the task escalates and stays; the decision, not any message, ends it.
 const taskId = `application:${pending.id}`, stored = JSON.parse((await h.db.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(taskId).first()).value_json);
 stored.nextContactDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() - 86400000));
 await h.db.prepare('UPDATE bw_followups SET value_json=? WHERE id=?').bind(JSON.stringify(stored), taskId).run(); // stands in for the passing days
 await owner.reload();
 await owner.getByRole('button', { name: 'Data', exact: true }).click();
 await owner.getByLabel('Queue view').selectOption('all');
 await task.getByText(/Escalated: the review deadline .* passed with no decision/).waitFor();
 await captureWidths(owner, 'application-task-escalated');
 const row = (await h.api('/api/barrow/applications')).applications.find(application => application.id === pending.id);
 await h.command('application.request-information', { id: row.id, revision: row.revision, reason: 'Please attach your state resale certificate.', duplicateReviews: [] });
 await owner.reload();
 await owner.getByRole('button', { name: 'Data', exact: true }).click();
 await owner.getByLabel('Queue view').selectOption('all');
 await task.getByText(/Information requested from the applicant/).waitFor();
 const open = (await h.api('/api/barrow/applications')).applications.find(application => application.id === pending.id);
 await h.command('application.decline', { id: open.id, revision: open.revision, reason: 'Outside our trade criteria.', duplicateReviews: [] });
 await owner.reload();
 await owner.getByRole('button', { name: 'Data', exact: true }).click();
 await owner.getByLabel('Queue view').selectOption('all');
 await task.getByText('Resolution: Decision recorded: application declined.').waitFor();
 await captureWidths(owner, 'application-task-closed-by-decision');
});
