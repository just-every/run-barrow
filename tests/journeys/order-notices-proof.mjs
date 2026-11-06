import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {captureRegionWidths} from './browser-helpers.mjs';

export async function proveOrderNoticeScreens({h,order,ownerPage,buyerPage}) {
 async function open(page) {
  await page.reload();await page.getByRole('button',{name:'Orders',exact:true}).click();
  const panel=page.getByRole('region',{name:'Order notices',exact:true});
  await expect(panel.getByRole('heading',{name:'Order notices',exact:true})).toBeVisible();return panel;
 }
 let panel=await open(buyerPage),accepted=panel.getByRole('article',{name:'Order accepted for '+order.id,exact:true});
 await expect(accepted).toContainText('Unread');
 await accepted.getByRole('button',{name:'Open current source',exact:true}).click();
 await expect(panel.getByRole('region',{name:'Current notice source',exact:true})).toContainText('Current order status: approved');
 await accepted.getByRole('button',{name:'Mark as read',exact:true}).click();await expect(accepted).toContainText('Read');
 assert.equal((await h.api('/api/barrow/order-notices')).notices.find(row=>row.orderId===order.id&&row.kind==='accepted').readAt,null);
 const returned=panel.getByRole('article',{name:'Return decision recorded for '+order.id,exact:true});
 await returned.getByRole('button',{name:'Open current source',exact:true}).click();
 await expect(panel.getByRole('region',{name:'Current notice source',exact:true})).toContainText('Requested 3 · approved 2');
 await captureRegionWidths(buyerPage,panel,'order-notices-buyer');
 await buyerPage.getByRole('button',{name:'Settings',exact:true}).click();
 const settings=buyerPage.getByRole('region',{name:'Order notice preferences',exact:true}),dispatch=settings.getByLabel('Dispatch recorded',{exact:true});
 await expect(dispatch).toBeChecked();await dispatch.uncheck();await expect(dispatch).toBeEnabled();
 await captureRegionWidths(buyerPage,settings,'order-notices-settings');
 await buyerPage.getByRole('button',{name:'Orders',exact:true}).click();panel=buyerPage.getByRole('region',{name:'Order notices',exact:true});
 await expect(panel.getByRole('article',{name:'Dispatch recorded for '+order.id,exact:true})).toHaveCount(0);
 panel=await open(ownerPage);await expect(panel.getByRole('article',{name:'Dispatch recorded for '+order.id,exact:true})).toBeVisible();
 const reviewerReturn=panel.getByRole('article',{name:'Return decision recorded for '+order.id,exact:true});await reviewerReturn.getByRole('button',{name:'Open current source',exact:true}).click();
 await expect(panel.getByRole('region',{name:'Current notice source',exact:true})).toContainText('Requested 3 · approved 2');
 await expect(panel).not.toContainText('USD');
 assert.equal(await panel.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
 assert.equal(await panel.locator('p,label,button,a').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(element).fontSize)<13).length),0);
 await captureRegionWidths(ownerPage,panel,'order-notices-reviewer');
 await panel.getByRole('button',{name:'View order',exact:true}).click();
 await expect(ownerPage.locator('#order-result-'+order.id)).toBeFocused();
 console.log('PROBE AUTO-004 screens: buyer reads a return decision, reviewer opens its current source, buyer suppresses dispatch alerts -> independent state and source navigation; captured at 1440 and 390.');
}
