// Test-only paid/provider edge. No native authorization or persistence is replaced.
const origin = 'https://barrow-agent-inventory.example.invalid';
export default {
 async fetch(request) {
  const url = new URL(request.url);
  if (url.origin !== origin || request.method !== 'GET' || url.pathname !== '/api/pier/state'
   || request.headers.get('origin') !== origin || request.headers.get('cookie') !== 'barrow-agent-conformance') return new Response('Invalid inventory request', { status: 403 });
  return Response.json({
   parties: [{ id: 'wholesale-week', kind: 'customer', name: 'Cedar Street Pantry' }],
   items: [{ id: 'oat-case', sku: 'OAT-1', name: 'Oat cases', unit: 'case', archived: false }],
   locations: [{ id: 'main-bin', kind: 'bin', warehouse: 'Main' }],
   positions: [{ itemId: 'oat-case', locationId: 'main-bin', status: 'sellable', available: '24' }],
   orders: [], purchaseOrders: [],
  });
 },
};
