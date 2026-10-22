// INT-013: native owner session and built Data panel, only the external receiver is faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {installation,accountValue} from '../api/harness.mjs';
import {webhookReceiver,webhookSecret,elapseWebhook} from '../api/webhook-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';
test('owner subscribes a trusted endpoint, inspects failed attempts and dead letter, replays one signed event until acknowledged and revokes custody at desktop and phone',async t=>{
 const receiver=webhookReceiver(),h=await installation({built:true,https:true,networkEdge:receiver.fetch});t.after(()=>h.close());
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Data',exact:true}).click();const card=page.getByRole('region',{name:'Outbound webhooks',exact:true});
 await card.getByLabel('Owner-named HTTPS endpoint',{exact:true}).fill('https://receiver.synthetic-barrow.com/events');
 await card.getByLabel('Shared signing secret',{exact:true}).fill(webhookSecret);
 await card.getByRole('checkbox',{name:'order.submitted',exact:true}).uncheck();await card.getByRole('checkbox',{name:'account.saved',exact:true}).check();
 await card.getByLabel('Subscription reason',{exact:true}).fill('Owner authorizes this synthetic receiver for minimal account events.');
 await expect(card.getByRole('button',{name:'Subscribe endpoint',exact:true})).toBeDisabled();
 await card.getByRole('checkbox',{name:'I authorize sending these minimal events to the endpoint named above.',exact:true}).check();
 await captureRegionWidths(page,card,'webhook-explicit-owner-consent');
 await card.getByRole('button',{name:'Subscribe endpoint',exact:true}).click();await card.getByText('Subscription active for future events.',{exact:true}).waitFor();await expect(card.getByLabel('Shared signing secret',{exact:true})).toHaveValue('');
 await h.command('account.save',{id:'cedar',value:accountValue('synthetic-barrow-1')});await card.getByRole('button',{name:'Refresh webhook state',exact:true}).click();await expect(card.getByText('account.saved · queued',{exact:true})).toBeVisible();
 await card.getByLabel('Recovery or custody change reason',{exact:true}).fill('Owner reviewed receiver failure and requests recovery.');
 await captureRegionWidths(page,card,'webhook-locally-queued');
 for(let attempt=0;attempt<6;attempt++){
  if(attempt)await elapseWebhook(h);
  await card.getByRole('button',{name:'Dispatch due webhooks',exact:true}).click();
  await expect(card.getByText(`account.saved · ${attempt===5?'dead-letter':'retrying'}`,{exact:true})).toBeVisible();
  await expect(card.getByText(new RegExp(` · ${attempt+1} attempts · `))).toBeVisible();
 }
 await card.getByText('Attempt history',{exact:true}).click();await expect(card.getByText(/Attempt 6 ·/)).toBeVisible();await captureRegionWidths(page,card,'webhook-dead-letter-attempts');
 const event=(await h.api('/api/barrow/webhooks')).deliveries[0].event_id;
 await card.getByRole('button',{name:'Replay same event',exact:true}).click();await card.getByText('Replay locally queued; external acceptance pending.',{exact:true}).waitFor();await expect(card.getByText('account.saved · queued',{exact:true})).toBeVisible();await captureRegionWidths(page,card,'webhook-replay-pending-acknowledgment');
 receiver.status=204;await elapseWebhook(h);await card.getByRole('button',{name:'Dispatch due webhooks',exact:true}).click();await expect(card.getByText('account.saved · acknowledged',{exact:true})).toBeVisible();assert.equal(receiver.effects.size,1);assert.ok(receiver.effects.has(event));
 await expect(card.getByText('Unresolved handoffs:',{exact:false})).toContainText('0');await captureRegionWidths(page,card,'webhook-acknowledged');
 await card.getByLabel('Replacement signing secret',{exact:true}).fill('synthetic-barrow-987654321');await card.getByRole('button',{name:'Rotate signing secret',exact:true}).click();await expect(card.getByLabel('Replacement signing secret',{exact:true})).toHaveValue('');
 await card.getByRole('button',{name:'Revoke subscription',exact:true}).click();await expect(card.getByText(/signing secret revoked/)).toBeVisible();await captureRegionWidths(page,card,'webhook-revoked-custody');
});
