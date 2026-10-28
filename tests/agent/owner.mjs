/** Drive only production HTTP doors; no SQL, substitute accounts or real credentials. */
export default async function initialize({ request, origin, email, displayName, claim }) {
 try {
 const bootstrap = await request(new URL(claim.path, origin), {
  method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: claim.token, displayName, returnTo: '/app' }),
 });
 if (bootstrap.status !== 303) return bootstrap;
 const cookies = bootstrap.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
 const headers = { Origin: origin, Cookie: cookies };
 const setup = await request(new URL('/setup', origin), {
  method: 'POST', redirect: 'manual', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ displayName, confirm: 'yes' }).toString(),
 });
 if (setup.status !== 303) throw new Error('Native first-run setup refused');
 await setup.body?.cancel();
 const command = async (type, payload) => {
  const response = await request(new URL('/api/barrow/commands', origin), {
   method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }),
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(`Native ${type} refused: HTTP ${response.status} ${body.error?.code ?? ''} ${body.error?.message ?? ''}`);
  return body.result;
 };
 await command('account.save', { id: 'cedar', value: { name: 'Cedar Street Pantry', email: 'cedar@example.com', pierCustomerId: 'wholesale-week', termsDays: 30, minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 1 }], currency: 'USD' } });
 await command('list.save', { accountId: 'cedar', name: 'Autumn replenishment', shared: true, lines: [{ sku: 'OAT-1', quantity: '2' }] });
 await command('order.prepare', { accountId: 'cedar', reference: 'PO-Autumn', lines: [{ sku: 'OAT-1', quantity: 2 }] });
 return bootstrap;
 } catch (error) {
  console.error(error instanceof Error ? error.message : 'Native initialization failed');
  throw error;
 }
}
