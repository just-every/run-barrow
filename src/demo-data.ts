// One supplier story, shared by the seed and the private Pier demo response: Juniper & Vale (apparel,
// Charleston SC) at Atlanta market week, as it stood at Tue Oct 20, 2026, 6:44 pm ET, the evening the hall Wi-Fi came back.
export const demoPierOrigin = 'https://stock.demo.invalid'
/** The story's clock: Tue Oct 20, 2026, 6:42 pm ET, when the hall synced. Demo stock reads and new records never read earlier. */
export const demoStoryClock = Date.parse('2026-10-20T22:42:00Z')

const core = ['S', 'M', 'L', 'XL']
const extended = ['1X', '2X', '3X']
// Spring '27 line sheet rev 3. A SKU is one style in one size; the order pad groups them back into styles.
export const demoStyles = [
  { code: '2214', name: 'Wrap Dress', cents: 4800, extendedCents: 5200, sizes: [...core, ...extended] },
  { code: '2219', name: 'Tee', cents: 2200, sizes: core },
  { code: '2223', name: 'Linen Shirt', cents: 3800, sizes: core },
  { code: '2227', name: 'Wide-Leg Pant', cents: 4400, sizes: core },
  { code: '2236', name: 'Cardigan', cents: 5600, sizes: core },
  { code: '2241', name: 'Linen Pant', cents: 4200, sizes: core },
]
const onHand: Record<string, number> = { S: 84, M: 132, L: 120, XL: 72, '1X': 36, '2X': 28, '3X': 18 }
export const demoSku = (code: string, size: string) => `JV-${code}-${size}`
export const demoProducts = demoStyles.flatMap((style, index) => style.sizes.map(size => ({
  sku: demoSku(style.code, size), name: `${style.code} ${style.name} · ${size}`, unit: 'each',
  cents: extended.includes(size) ? style.extendedCents ?? style.cents : style.cents,
  available: onHand[size] + index * 6,
})))

// Stockists on the Boutique price list unless a price list says otherwise.
// Towns come from the run site's records; a stockist the page never places keeps no town.
export const demoCustomers: { id: string; name: string; buyer: string; termsDays: number; list?: 'volume'; city?: string; state?: string }[] = [
  { id: 'palmetto', name: 'Palmetto & Pine', buyer: 'lena', termsDays: 30, city: 'Columbia', state: 'SC' },
  { id: 'marlowe', name: 'Marlowe Boutique', buyer: 'nia', termsDays: 30, city: 'Savannah', state: 'GA' },
  { id: 'bayside', name: 'Bayside Threads', buyer: 'orders', termsDays: 30, city: 'Charleston', state: 'SC' },
  { id: 'wren', name: 'Wren & Co.', buyer: 'buying', termsDays: 30, city: 'Asheville', state: 'NC' },
  { id: 'ivy-oak', name: 'Ivy & Oak', buyer: 'sam', termsDays: 30, city: 'Austin', state: 'TX' },
  { id: 'halseys', name: 'Halsey’s', buyer: 'buyer', termsDays: 14, list: 'volume', city: 'Raleigh', state: 'NC' },
  { id: 'magnolia', name: 'Magnolia & Moss', buyer: 'hello', termsDays: 30 },
  { id: 'linen-porch', name: 'The Linen Porch', buyer: 'shop', termsDays: 30 },
  { id: 'sweetgrass', name: 'Sweetgrass Supply', buyer: 'orders', termsDays: 30 },
  { id: 'fig-thread', name: 'Fig & Thread', buyer: 'buyer', termsDays: 0 },
  { id: 'blue-heron', name: 'Blue Heron Goods', buyer: 'orders', termsDays: 30 },
  { id: 'larkin-lowe', name: 'Larkin & Lowe', buyer: 'buying', termsDays: 30 },
]
/** The Volume price list takes $2.00 off every style except the Tee, which takes $1.00. */
export const demoPrice = (customer: { list?: string }, product: { sku: string; cents: number }) =>
  customer.list === 'volume' ? product.cents - (product.sku.includes('-2219-') ? 100 : 200) : product.cents

/** The scheduled price update, effective Tue Oct 20, 12:00 pm: 2219 Tee $22.00 → $23.00 on Palmetto & Pine's list. */
export const demoPriceUpdate = { customer: 'palmetto', style: '2219', cents: 2300 }

type Quantities = Record<string, number>
// Orders as the season left them at 6:44 pm Tue Oct 20 (ET); at is when each was written.
export const demoOrders: { id: string; customer: string; reference: string; at: string; status: 'draft' | 'submitted' | 'approved'; agent?: true; lines: Record<string, Quantities> }[] = [
  { id: 'JV-10392', customer: 'bayside', reference: 'Spring 27 line sheet', at: '2026-10-12T14:20:00Z', status: 'approved', lines: { 2214: { S: 6, M: 6, L: 6, XL: 6 }, 2236: { S: 3, M: 3, L: 3, XL: 3 }, 2223: { S: 1, M: 2, L: 2, XL: 1 }, 2219: { S: 3, M: 3, L: 3, XL: 3 } } },
  { id: 'JV-10397', customer: 'wren', reference: 'WREN-SP27', at: '2026-10-13T13:05:00Z', status: 'approved', lines: { 2214: { S: 3, M: 3, L: 3, XL: 3 }, 2227: { S: 3, M: 3, L: 3, XL: 3 }, 2236: { S: 3, M: 4, L: 4, XL: 4 } } },
  { id: 'JV-10401', customer: 'ivy-oak', reference: 'PO 1179', at: '2026-10-14T16:30:00Z', status: 'approved', lines: { 2214: { S: 6, M: 6, L: 6, XL: 6, '1X': 2, '2X': 2, '3X': 2 }, 2219: { S: 3, M: 3, L: 3, XL: 3 } } },
  { id: 'JV-10418', customer: 'marlowe', reference: 'Market week · booth', at: '2026-10-19T15:42:00Z', status: 'approved', lines: { 2214: { S: 2, M: 4, L: 4, XL: 2, '1X': 2 }, 2219: { S: 3, M: 3, L: 3, XL: 3 } } },
  { id: 'JV-10424', customer: 'magnolia', reference: 'Market week · booth', at: '2026-10-19T19:15:00Z', status: 'submitted', lines: { 2227: { S: 2, M: 3, L: 3, XL: 2 }, 2241: { S: 2, M: 2, L: 2 }, 2219: { S: 3, M: 3, L: 3, XL: 3 } } },
  { id: 'JV-10427', customer: 'linen-porch', reference: 'Market week · booth', at: '2026-10-20T14:48:00Z', status: 'draft', lines: { 2223: { S: 2, M: 2, L: 2, XL: 2 }, 2241: { S: 2, M: 3, L: 3, XL: 2 } } },
  { id: 'JV-10431', customer: 'palmetto', reference: 'Market week · booth', at: '2026-10-20T17:30:00Z', status: 'draft', lines: { 2214: { S: 2, M: 4, L: 4, XL: 2 }, 2219: { S: 3, M: 6, L: 6, XL: 3 }, 2241: { S: 2, M: 2, L: 2 } } },
  { id: 'JV-10433', customer: 'sweetgrass', reference: 'Market week · booth', at: '2026-10-20T18:52:00Z', status: 'draft', lines: { 2214: { S: 2, M: 2, L: 2, XL: 2, '1X': 1, '2X': 1 }, 2236: { M: 2, L: 2 } } },
  { id: 'JV-10436', customer: 'halseys', reference: 'Reorder · Volume', at: '2026-10-20T20:05:00Z', status: 'draft', agent: true, lines: { 2214: { S: 3, M: 3, L: 3, XL: 3 }, 2219: { S: 6, M: 6, L: 6, XL: 6 } } },
  { id: 'JV-10438', customer: 'fig-thread', reference: 'Market week · booth', at: '2026-10-20T21:16:00Z', status: 'draft', lines: { 2227: { S: 2, M: 2, L: 2, XL: 2 }, 2219: { S: 3, M: 3, L: 3, XL: 3 } } },
]
export const demoItemId = (sku: string) => `demo-item-${sku}`
export const demoCustomerId = (id: string) => `demo-customer-${id}`
