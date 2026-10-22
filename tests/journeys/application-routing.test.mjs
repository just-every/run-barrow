// Manual AUTO-001 journey: built HTTPS Worker, real D1/Pier, only Resend's edge faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock, activateStaff } from '../api/harness.mjs';
import { captureWidths, signedContext } from './browser-helpers.mjs';

test('applications route by territory to a reviewer with a prepared request, the applicant gets generic status emails, and the escalated task stays on the board through the request until a decision at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 await stock(pier);
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
 const manager=await activateStaff(h,'routing-reviewer@example.test',{role:'sales-manager',accounts:'all',warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0,entitlements:['applications']});
 const prepared = 'Please attach your South Carolina resale certificate.';
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
 await form.getByLabel('Rule 1 reviewer', { exact: true }).selectOption(manager.id);
 await form.getByLabel('Rule 1 escalation person', { exact: true }).selectOption({ label: label('owner') });
 await form.getByLabel('Rule 1 deadline days', { exact: true }).fill('2');
 await form.getByLabel('Rule 1 prepared request', { exact: true }).fill(prepared);
 await form.getByLabel('Reason for this routing change', { exact: true }).fill('Southeast applications without a certificate go to the territory owner.');
 await captureWidths(owner, 'application-routing-rule-form');
 await form.getByRole('button', { name: 'Save application routing', exact: true }).click();
 await expect(form.getByLabel('Rule ID', { exact: true })).toHaveValue('southeast');
 await expect.poll(async () => (await h.api('/api/barrow/application-rules')).rules.length).toBe(1);
 await captureWidths(owner, 'application-routing-saved');

 // A Southeast applicant applies on the public form without a certificate, asking for Net 30 terms, and verifies.
 const visitor = await browser.newContext({ ignoreHTTPSErrors: true }); t.after(() => visitor.close());
 const page = await visitor.newPage();
 await page.goto(h.origin + '/apply');
 const apply = page.getByRole('form', { name: 'Public trade form' });
 for (const [field, value] of Object.entries({ 'Company legal name': 'Palmetto & Pine Provisions', 'EIN, never a Social Security number': '12-3456789', 'Contact name': 'River Buyer', 'Contact email': 'applicant@example.test', 'Contact phone': '803 555 0101', 'Expected annual volume in whole USD': '90000', 'Location name': 'Downtown', 'Address line 1': '101 Main Street', City: 'Columbia', 'US state': 'SC', 'ZIP code': '29201' })) await apply.getByLabel(field, { exact: true }).fill(value);
 await apply.getByLabel('Requested payment terms', { exact: true }).selectOption({ label: 'Net 30' });
 await apply.getByRole('checkbox', { name: 'Your details and documents go only to the supplier' }).check();
 await captureWidths(page, 'application-form-requested-terms');
 await page.waitForTimeout(3100);
 await expect(apply.getByLabel('Resale certificates', {exact:false})).toBeDisabled();
 const refused=await page.request.post(h.origin+'/api/barrow/applications',{headers:{origin:h.origin},data:{documents:[{name:'unsafe.pdf',contentBase64:Buffer.from('%PDF-1.4 /OpenAction /JavaScript synthetic-barrow-403').toString('base64')}]}});
 assert.equal(refused.status(),503);assert.equal((await refused.json()).error.code,'APPLICATION_DOCUMENTS_UNAVAILABLE');
 await captureWidths(page,'application-document-screening-unavailable');
 assert.equal((await h.api('/api/barrow/applications')).applications.length,0);
 await apply.getByRole('button', { name: 'Submit and request verification code' }).click();
 await page.getByRole('status').filter({ hasText: 'Verification accepted' }).waitFor();
 const code = h.mail.requests.findLast(row => row.message.to.includes('applicant@example.test') && row.message.subject === 'Verify your trade application').message.text.match(/code is (\d{6})/)[1];
 await page.getByLabel('Verification code', { exact: true }).fill(code);
 await page.getByRole('button', { name: 'Verify email and view application' }).click();
 await page.getByText('Status: submitted', { exact: true }).waitFor();
 const [application] = (await h.api('/api/barrow/applications')).applications;
 assert.equal(application.value.requestedTermsDays, 30);

 const reviewerContext=await signedContext(browser,h,manager.who.as);t.after(()=>reviewerContext.close());
 const reviewer=await reviewerContext.newPage();await reviewer.goto(h.origin+'/app');
 const queue = async () => { await reviewer.reload(); await reviewer.getByRole('button', { name: 'Follow-ups', exact: true }).click(); await reviewer.getByLabel('Queue view').selectOption('all') };
 await queue();
 const task = reviewer.locator('article').filter({ hasText: 'Review trade application Palmetto & Pine Provisions' });
 await task.getByText(/routed by “Southeast without a certificate” to territory Southeast; Net 30 terms requested; no certificate attached/).waitFor();
 await captureWidths(reviewer, 'application-task-routed');

 // Past its deadline the task escalates to the named escalation person.
 const taskId = `application:${application.id}`, stored = JSON.parse((await h.db.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(taskId).first()).value_json);
 stored.application.deadline = stored.nextContactDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() - 86400000));
 await h.db.prepare('UPDATE bw_followups SET value_json=? WHERE id=?').bind(JSON.stringify(stored), taskId).run(); // stands in for the passing days
 await queue();
 await task.getByText(new RegExp(`Escalated since .* to ${people.find(row => row.role === 'owner').name}`)).first().waitFor();
 await captureWidths(reviewer, 'application-task-escalated');

 // The reviewer sends the reviewed prepared request from the application; the applicant gets a generic status email and the escalation stays.
 await reviewer.getByRole('button', { name: 'Accounts', exact: true }).click();
 const review = reviewer.getByRole('region', { name: 'Trade applications' });
 await review.getByLabel('Application', { exact: false }).selectOption({ label: 'Palmetto & Pine Provisions · submitted' });
 const panel = review.getByRole('group', { name: 'Routing and review deadline' });
 await panel.getByText(/Escalated since .* It stays escalated until a decision or an explicit closure/).waitFor();
 await panel.getByRole('button', { name: 'Use the prepared request' }).click();
 await expect(review.getByLabel('Decision reason (shown to applicant)')).toHaveValue(prepared);
 await captureWidths(reviewer, 'application-review-prepared-request');
 await review.getByRole('button', { name: 'Request missing certificate' }).click();
 await review.getByRole('heading', { name: 'Palmetto & Pine Provisions · information requested' }).waitFor();
 await panel.getByText(/Status emails to the applicant: .* information requested: accepted/).waitFor();
 const notice = h.mail.requests.findLast(row => row.message.to.includes('applicant@example.test') && row.message.subject === 'Your trade application status changed').message;
 assert.match(notice.text, /status is now: information requested/); assert.equal(notice.text.includes('resale'), false);
 await page.reload(); await page.getByText('Status: information requested', { exact: true }).waitFor();
 await page.getByText(prepared, { exact: false }).waitFor();
 await queue();
 await task.getByText(/Information requested from the applicant/).waitFor();
 await task.getByText(/Escalated since/).first().waitFor();
 await captureWidths(reviewer, 'application-task-escalated-after-request');

 // With screening unavailable the certificate request stays open; only the recorded decision closes the task.
 assert.equal(await page.getByRole('button',{name:'Answer information request'}).count(),0);
 await page.getByText('Status: information requested', { exact: true }).waitFor();
 await queue();
 await task.getByText(/Information requested from the applicant/).waitFor();
 await task.getByText(/Escalated since/).first().waitFor();
 await reviewer.getByRole('button', { name: 'Accounts', exact: true }).click();
 await review.getByLabel('Application', { exact: false }).selectOption({ label: 'Palmetto & Pine Provisions · information requested' });
 await review.getByLabel('Decision reason (shown to applicant)').fill('Outside our current trade criteria.');
 await review.getByRole('button', { name: 'Decline application', exact: true }).click();
 await review.getByRole('heading', { name: 'Palmetto & Pine Provisions · declined' }).waitFor();
 await queue();
 await task.getByText('Resolution: Decision recorded: application declined.').waitFor();
 await captureWidths(reviewer, 'application-task-closed-by-decision');
 await page.reload(); await page.getByText('Status: declined', { exact: true }).waitFor();
 const grant=(await h.api('/api/barrow/staff/members')).members.find(row=>row.userId===manager.id);
 await h.command('staff.revoke',{userId:manager.id,revision:grant.revision,reason:'End application reviewer routing access.'});
 await reviewer.reload();await reviewer.getByRole('button',{name:'Orders',exact:true}).waitFor();
 assert.equal(await reviewer.getByRole('region',{name:'Trade applications'}).count(),0);
 await captureWidths(reviewer,'application-routing-reviewer-revoked');
 assert.equal(h.mail.requests.filter(row => row.message.to.includes('applicant@example.test') && row.message.subject === 'Your trade application status changed').length, 2);
});
