import { installation, stock, accountValue } from './harness.mjs';

export async function buyingProfilesFixture(t, options = {}) {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const inventory = await stock(pier, '100');
 const h = await installation({ https: true, ...options, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie, ...options.bindings } }); t.after(() => h.close());
 const account = await h.command('account.save', { id: 'synthetic-barrow-801', value: { ...accountValue(inventory.customer.id, 'synthetic-barrow-801@example.test'), name: 'Cedar Street Pantry', minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents: 5100, minQty: 1 }] } });
 const buyer = { as: await h.signIn(account.value.email) };
 const buyerId = (await h.api('/api/barrow/state', undefined, buyer)).actor.id;
 const brands = [], profiles = [];
 const specifications = [
  { brandId: 'synthetic-barrow-802', profileId: 'synthetic-barrow-803', name: 'Mill House Foods', profileName: 'Mill House standard buying', seller: { legalName: 'Mill House Foods LLC', address: '25 Broadway, New York, NY 10004', registration: 'synthetic-barrow-804' }, currency: 'USD', unitCents: 6501, termsDays: 30, series: 'synthetic-barrow-805' },
  { brandId: 'synthetic-barrow-806', profileId: 'synthetic-barrow-807', name: 'North Shore Pantry', profileName: 'North Shore Canadian buying', seller: { legalName: 'North Shore Pantry Inc.', address: '20 Bay Street, Toronto, ON M5J 2N8', registration: 'synthetic-barrow-808' }, currency: 'CAD', unitCents: 8303, termsDays: 14, series: 'synthetic-barrow-809' },
 ];
 for (const value of specifications) {
  await h.command('terms.publish', { series: value.series, title: `${value.name} sales terms`, body: `Orders from ${value.seller.legalName} are recorded in ${value.currency}. Contact the seller before returning goods. Payment terms appear on each order.` });
  brands.push(await h.command('brand.save', { id: value.brandId, revision: null, value: { name: value.name, seller: value.seller, currency: value.currency, termsSeries: value.series, requireAcceptance: true } }));
  profiles.push(await h.command('profile.save', { id: value.profileId, revision: null, accountId: account.id, value: { brandId: value.brandId, name: value.profileName, prices: [{ sku: 'OAT-1', unitCents: value.unitCents, minQty: 1 }], minimumCents: 0, termsDays: value.termsDays } }));
 }
 const grant = (index, approved = true, who = {}) => h.command('profile.grant', { profileId: profiles[index].id, userId: buyerId, approved, reason: approved ? 'Supplier approved this account buyer for the selected brand and its exact price book.' : 'Supplier revoked this buyer’s access to the selected buying profile.' }, who);
 await grant(0);
 const read = (who = buyer) => h.api(`/api/barrow/buying-profiles?accountId=${account.id}`, undefined, who);
 const catalogue = (index, who = buyer) => h.api(`/api/barrow/catalogue?${new URLSearchParams({ accountId: account.id, profileId: profiles[index].id })}`, undefined, who);
 const prepare = (index, extra = {}, who = buyer) => h.command('order.prepare', { accountId: account.id, profileId: profiles[index].id, reference: `synthetic-barrow-${810 + index}`, lines: [{ sku: 'OAT-1', quantity: 2 }], ...extra }, who);
 const terms = (index, who = buyer) => h.api(`/api/barrow/sales-terms?${new URLSearchParams({ accountId: account.id, profileId: profiles[index].id })}`, undefined, who);
 return { h, pier, inventory, account, buyer, buyerId, brands, profiles, specifications, grant, read, catalogue, prepare, terms };
}
