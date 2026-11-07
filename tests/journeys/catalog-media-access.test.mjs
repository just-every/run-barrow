import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mediaFixture,mediaPath,mediaReason,mediaPolicy} from '../api/catalog-media-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('owner reviews catalog membership and staff scope in Settings; entitled manager reviews replacement and sees revocation through the built page',async t=>{
 const {h,manager,replacementSha,catalogs}=await mediaFixture(t,{built:true,https:true});
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const ownerContext=await signedContext(browser,h);t.after(()=>ownerContext.close());const owner=await ownerContext.newPage();await owner.goto(h.origin+'/app');
 if(new URL(owner.url()).pathname==='/setup'){await owner.getByLabel('Your name').fill('Supplier owner');await owner.getByRole('checkbox').check();await owner.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await owner.getByRole('button',{name:'Settings',exact:true}).click();const settings=owner.getByRole('region',{name:'Catalog media',exact:true});await settings.waitFor();
 await settings.getByText('Catalog membership settings',{exact:true}).click();
 const firstCatalog=settings.getByRole('group',{name:'Catalog membership 1',exact:true});await expect(firstCatalog.getByLabel('OAT-1',{exact:true})).toBeChecked();await firstCatalog.getByLabel('Catalog name',{exact:true}).fill(catalogs[0].name);await settings.getByLabel('Membership review reason',{exact:true}).fill(mediaReason);
 await settings.getByRole('button',{name:'Save reviewed membership',exact:true}).click();await expect(settings.getByRole('status')).toContainText('Owner-reviewed catalog membership saved.');
 await captureRegionWidths(owner,settings,'catalog-media-owner-membership');
 await owner.getByRole('button',{name:'Team',exact:true}).click();const team=owner.getByRole('region',{name:'Team access',exact:true});
 await team.getByRole('button',{name:/Edit access for synthetic-barrow-901/}).click();
 const form=owner.getByRole('form',{name:'Edit staff access',exact:true});
 await expect(form.getByLabel('Prepare and replace accepted catalog images',{exact:true})).toBeChecked();await expect(form.getByLabel('Spring pantry (spring)',{exact:true})).toBeChecked();
 await form.getByLabel('Winter pantry (winter)',{exact:true}).check();await form.getByLabel('Reason for this access change',{exact:true}).fill('Owner explicitly adds the second reviewed catalog.');
 await form.getByRole('button',{name:'Save staff access',exact:true}).click();await expect(owner.getByRole('form',{name:'Invite staff',exact:true})).toBeVisible();
 await captureRegionWidths(owner,team,'catalog-media-owner-grant');
 const context=await signedContext(browser,h,manager.who.as);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 await page.getByRole('button',{name:'Settings',exact:true}).click();const media=page.getByRole('region',{name:'Catalog media',exact:true});
 await media.getByLabel('Media catalog',{exact:true}).selectOption('spring');await media.getByLabel('Imported variant',{exact:true}).selectOption('OAT-1');
 await media.getByLabel('Accepted image reference',{exact:true}).selectOption(replacementSha);await media.getByLabel('Image slot',{exact:true}).fill('1');
 await media.getByRole('button',{name:'Prepare media match',exact:true}).click();const review=media.getByLabel('Review catalog media',{exact:true});await expect(review).toContainText('OAT-1');await expect(review).toContainText(replacementSha);
 await review.getByLabel('Media approval reason',{exact:true}).fill('Manager reviewed the stored JPEG and exact slot replacement.');await review.getByLabel('I reviewed this exact media replacement',{exact:true}).check();
 await captureRegionWidths(page,media,'catalog-media-manager-review');
 await review.getByRole('button',{name:'Apply reviewed replacement',exact:true}).click();await expect(media.getByRole('status')).toContainText('Reviewed media replacement saved.');
 await expect(media.getByRole('list',{name:'Current catalog image slots',exact:true})).toContainText(replacementSha);
 const attrs=await h.api('/api/barrow/variant-attributes');assert.equal(attrs.variants['OAT-1'].image.sha256,replacementSha);
 await captureRegionWidths(page,media,'catalog-media-manager-applied');
 // A review held open in the browser cannot survive narrowing the owner grant.
 await media.getByRole('button',{name:'Prepare media match',exact:true}).click();await review.waitFor();await review.getByLabel('Media approval reason',{exact:true}).fill('Review remains open while the owner changes this grant.');await review.getByLabel('I reviewed this exact media replacement',{exact:true}).check();
 const grant=(await h.api('/api/barrow/staff/members')).members.find(row=>row.userId===manager.id);
 await h.command('staff.update',{userId:grant.userId,revision:grant.revision,policy:mediaPolicy(['winter']),reason:mediaReason});
 await review.getByRole('button',{name:'Apply reviewed replacement',exact:true}).click();await expect(media.getByRole('alert')).toContainText('does not permit');
 assert.deepEqual(await h.api('/api/barrow/variant-attributes'),attrs);
 await captureRegionWidths(page,media,'catalog-media-manager-narrowed');
 await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(media.getByLabel('Media catalog',{exact:true}).getByRole('option')).toHaveText(['Choose a catalog','Winter pantry']);
 const state=await h.api(mediaPath);const after=(await h.api('/api/barrow/staff/members')).members.find(row=>row.userId===manager.id);
 await h.command('staff.revoke',{userId:after.userId,revision:after.revision,reason:mediaReason});await page.reload();await expect(page.getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);
 assert.ok(state.catalogs.find(row=>row.id==='spring').variants.some(row=>row.sku==='OAT-1'&&row.slots['1'].sha256===replacementSha));
});
