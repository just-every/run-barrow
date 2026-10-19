// 11 · Your systems stay in charge: a 2×2 grid of connector cards led by the brand glyphs, with health dots.
import { glyph, ok, type Brand } from '../shell/html'

const cards: [Brand, string, string[]][] = [
  ['mountain', 'Ridgeline Supply · NetSuite', [`13 sales orders acknowledged (12 show orders + Ivy &amp; Oak’s PO) ${ok}`, 'SO-48790 Bozeman prebook · 2 releases', 'stock by warehouse · Boise synced 6 min ago', '0 unmapped']],
  ['candle', 'Ember Hollow · QuickBooks Online + Faire', [`invoices 2196, 2208, 2212, 2231 synced ${ok}`, 'Harbor Home: returned ACH reversed, card payment posted', `Faire: 9 October orders brought in under their Faire IDs · paid through Faire, never charged again ${ok}`]],
  ['leaf', 'Juniper &amp; Vale · Shopify', ['186 styles · 1,914 variants matched to Shopify', '21 show orders + 11 line-sheet orders as wholesale orders', `retail store and prices untouched ${ok}`]],
  ['gift', 'Tidewater Gifts · nightly file feed', [`stock file in 2:00 am ${ok}`, '15 order files out and acknowledged (14 show orders + Salt Marsh)', '0 rows held']],
]

export function connectedSection(): string {
  return '<section class="section connected" aria-labelledby="connected-title"><div class="wrap">'
    + '<p class="eyebrow center">Connected · All four brands · Mon Oct 26</p>'
    + '<h2 id="connected-title" class="center xxl">Your systems <span class="line">stay in charge.</span></h2>'
    + '<p class="lede center">NetSuite, QuickBooks, Shopify, Faire or a nightly file: stock and books stay where they live, and each order lands once.</p>'
    + '<div class="cx-grid"><span class="cx-wire" aria-hidden="true"></span>'
    + cards.map(([brand, title, lines]) => `<article class="card cx-card"><span class="health" role="img" aria-label="connected and healthy"></span><h3>${glyph(brand, 'card-glyph xxl')}<span class="serif-title lg">${title}</span></h3><ul>${lines.map(line => `<li>${line}</li>`).join('')}</ul></article>`).join('')
    + '</div></div></section>'
}
