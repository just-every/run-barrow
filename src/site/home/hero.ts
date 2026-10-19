// 01 · The approved market-week hero: the show floor, the stockist map and the Juniper & Vale line sheet,
// painted (public/site/hero-*.avif|webp is the clean plate, with every word, card, cursor and note removed)
// and set here as HTML at the desk's positions. Positions are the desk's 1536 x 1024 pixels (--x, --y, --w),
// scaled with the stage from 1200 px up; below that the same elements stack under crops of the art.
import { actions, siteHeader } from '../shell/chrome'
import { cursor, glyph, icon, nb, note, ok, type Brand, type Icon } from '../shell/html'
import { dress } from './drawings'

const at = (x: number, y: number, w: number, extra = '') => `style="--x:${x};--y:${y};--w:${w}${extra}"`

interface Card { x: number; y: number; w: number; lead: { glyph?: Brand; icon?: Icon; tone?: string }; title: string; lines: string[] }

const leadMark = ({ glyph: brand, icon: name, tone }: Card['lead']) => brand ? glyph(brand, 'card-glyph') : icon(name!, `card-icon${tone ? ` tone-${tone}` : ''}`)
const card = (c: Card, className: string) => `<li class="${className}" ${at(c.x, c.y, c.w)}>${leadMark(c.lead)}<div><p class="hc-title">${c.title}</p>${c.lines.map(line => `<p>${line}</p>`).join('')}</div></li>`

const floor: Card[] = [
  { x: 800, y: 92, w: 214, lead: { icon: 'calendar', tone: 'blue' }, title: 'Market week', lines: [`${nb('Mon Oct 19')} – ${nb('Thu Oct 22')}`, '4 reps on iPad', '63 orders written'] },
  { x: 612, y: 330, w: 270, lead: { glyph: 'mountain' }, title: 'Ridgeline Supply', lines: ['Bozeman Outfitters', 'spring prebook', `Feb ${nb('$4,120.00')} + Mar ${nb('$3,360.00')} =`, '<strong class="hc-big">$7,480.00</strong>', `<strong>30% deposit ${nb('$2,244.00')}</strong>`] },
  { x: 930, y: 336, w: 250, lead: { glyph: 'leaf' }, title: 'Juniper &amp; Vale', lines: ['Marlowe Boutique, Savannah', '2214 scanned', `${nb('1X–3X')} at $52.00`] },
  { x: 1176, y: 259, w: 286, lead: { icon: 'wifi', tone: 'red' }, title: `Hall Wi-Fi down ${nb('Tue Oct 20')}`, lines: ['11 drafts kept on Dana Ortiz’s iPad →', `synced ${nb('6:42 pm')}`, `1 price changed → buyer re-confirmed ${ok}`] },
  { x: 1268, y: 385, w: 244, lead: { glyph: 'gift' }, title: 'Tidewater Gifts, Norfolk VA', lines: ['walk-up', 'trade application sent'] },
]

const row: Card[] = [
  { x: 20, y: 855, w: 156, lead: { glyph: 'candle' }, title: 'Ember Hollow Candle Co.', lines: ['312 stockists', '<strong>41 states</strong>'] },
  { x: 183, y: 855, w: 160, lead: { icon: 'truck', tone: 'blue' }, title: 'Sonoma Mercantile', lines: ['PO 5521', '24 cases × 6 = 144 candles', `× $14.00 = <strong>${nb('$2,016.00')}</strong>`, `net 30 · UPS ${nb('Tue Oct 13')}`] },
  { x: 350, y: 855, w: 155, lead: { icon: 'box', tone: 'green' }, title: 'Birch &amp; Fern, Burlington VT', lines: ['parcel 2 of 2 delayed', `${nb('Thu Oct 15')} →`, `delivered ${nb('Mon Oct 19')} ${ok}`] },
  { x: 512, y: 855, w: 173, lead: { icon: 'card', tone: 'ink' }, title: 'Harbor Home, Mystic CT', lines: [`invoice 2208 ${nb('$1,836.00')}`, `ACH returned ${nb('Mon Oct 19')} →`, `card ${nb('Wed Oct 21')}`, `<span class="settled">settled ${ok}</span>`] },
  { x: 692, y: 855, w: 181, lead: { icon: 'doc', tone: 'blue' }, title: 'Brightwater Market', lines: ['statement', `${nb('$4,210.00')} − ${nb('$2,500.00')} paid =`, `<strong>${nb('$1,710.00')}</strong> due ${nb('Mon Nov 2')}`] },
]

const sizes = ['S', 'M', 'L', 'XL', '1X', '2X', '3X']
const marlowe = ['2', '4', '4', '2', '2', '–', '–']

function lineSheet(): string {
  return `<div class="hero-sheet">`
    + `<div class="hs-head" ${at(962, 497, 360)}>${glyph('leaf', 'hs-glyph')}<div><p class="hs-brand">Juniper &amp; Vale</p><p class="hs-meta">Spring ’27 line sheet · rev 3 · wholesale + MSRP · ${nb('Wed Oct 7')}</p></div></div>`
    + `<span class="hs-flats">${dress('hs-dress', 'The 2214 Wrap Dress: white with small red-orange and celadon flowers and a tie belt')}</span>`
    + `<dl class="hs-prices" ${at(1209, 568, 110)}><dt>2214 Wrap Dress</dt><div><dt>S–XL</dt><dd>$48.00</dd></div><div><dt>1X–3X</dt><dd>$52.00</dd></div><div><dt>MSRP</dt><dd>$118.00</dd></div></dl>`
    + `<span class="hs-reorder" ${at(1118, 668, 80)}>${note('reorder!')}</span>`
    + `<div class="hs-matrix" ${at(930, 707, 412)}><table><caption class="visually-hidden">Marlowe Boutique’s 2214 size run</caption><thead><tr><th scope="col"><span class="visually-hidden">Stockist</span></th>${sizes.map(size => `<th scope="col">${size}</th>`).join('')}<th scope="col">Total</th></tr></thead>`
    + `<tbody><tr><th scope="row">Marlowe Boutique</th>${marlowe.map(value => `<td>${value}</td>`).join('')}<td>14</td></tr></tbody></table>`
    + `<p class="hs-sum">S2 M4 L4 XL2 (12) × $48.00 + 1X 2 × $52.00 = ${nb('$680.00')}</p></div>`
    + `<picture class="hs-tee"><source type="image/avif" srcset="/site/tee.avif"><img src="/site/tee.webp" alt="" width="84" height="80" loading="lazy"></picture>`
    + `<div class="hs-tee-text" ${at(1044, 806, 236)}><p class="hs-strong">2219 Tee</p><p>entered 10 · case pack 6 → 12 suggested</p><p>buyer accepted ${ok}</p></div>`
    + `<span class="hs-ship" ${at(1282, 808, 84)}>${note('ship Feb')}</span>`
    + `<div class="hs-foot" ${at(930, 893, 446)}><div>${icon('plane', 'hs-icon')}<div><p>Sent to 28 stockists ${nb('Thu Oct 8')}</p><p class="hs-big">11 orders · ${nb('$18,940.00')}</p></div></div>`
    + `<div>${icon('camera', 'hs-icon')}<div><p class="hs-strong">Photographed PO</p><p>Ivy &amp; Oak, Austin → Ridgeline Supply</p><p>14-line draft · approved by Sam Lee ${ok}</p></div></div></div>`
    + `${cursor('Sam Lee', 'hs-sam')}${cursor('Dana Ortiz', 'hs-dana')}</div>`
}

const art = (name: string, alt: string, width: number, height: number, className: string, widths?: number[]) => {
  const set = (type: string) => widths ? widths.map(w => `/site/${name}-${w}.${type} ${w}w`).join(', ') : `/site/${name}.${type}`
  const size = widths ? ' sizes="(min-width: 1200px) min(100vw, 1680px), 100vw"' : ''
  return `<picture class="${className}"><source type="image/avif" srcset="${set('avif')}"${size}><img src="${widths ? `/site/${name}-1536.webp` : `/site/${name}.webp`}" srcset="${set('webp')}"${size} alt="${alt}" width="${width}" height="${height}"${widths ? ' fetchpriority="high"' : ' loading="lazy"'}></picture>`
}

export function hero(): string {
  return '<section class="hero" aria-labelledby="hero-title"><div class="hero-stage">'
    + art('hero', 'Market week from above: a busy show floor with Juniper &amp; Vale, Ember Hollow Candle Co. and Tidewater Gifts booths, a US map of stockists with routes from one Asheville warehouse, and the Juniper &amp; Vale spring line sheet.', 1536, 1024, 'hero-plate', [768, 1152, 1536])
    + siteHeader()
    + `<div class="hero-copy"><h1 id="hero-title">Wholesale orders, <span class="line">shipped and <em>paid.</em></span></h1>`
    + '<p class="hero-sub">Barrow gives each stockist its own prices and line sheets, takes orders online, from reps and at trade shows, and follows every order to delivery and payment.</p>'
    + '<p class="hero-alt">100% free, open source alternative to <strong>NuORDER</strong>, <strong>Pepperi</strong> and <strong>Brandboom</strong></p>'
    + `${actions()}</div>`
    + art('hero-floor', '', 526, 258, 'hero-floor-art')
    + `<ul class="hero-cards hero-floor" aria-label="Market week on the show floor">${floor.map(c => card(c, 'hero-card')).join('')}</ul>`
    + `<div class="hero-map">${art('hero-map', '', 748, 354, 'hero-map-art')}<span class="map-label" aria-hidden="true">Phoenix</span></div>`
    + `<ul class="hero-cards hero-row" aria-label="Ember Hollow’s orders, followed to the door and the bank">${row.map(c => card(c, 'hero-card hero-row-card')).join('')}</ul>`
    + lineSheet()
    + '</div></section>'
}
