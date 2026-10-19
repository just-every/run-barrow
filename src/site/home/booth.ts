// 04 · Written at the booth, size by size: Dana's iPad screen as a flat card (the 2214 page beside Marlowe's
// size matrix, the 2219 case-pack suggestion and order JV-10418 with Nia's signature) over the four-rep booth strip.
import { cursor, glyph, nb, note, ok, type Brand } from '../shell/html'
import { dress } from './drawings'

const sizes = ['S', 'M', 'L', 'XL', '1X', '2X', '3X']
const run = ['2', '4', '4', '2', '2', '–', '–']
const reps: [Brand, string, string][] = [['leaf', 'Juniper &amp; Vale', 'Dana Ortiz · 21'], ['candle', 'Ember Hollow', 'Rosa Delgado · 16'], ['gift', 'Tidewater Gifts', 'Marcus Bell · 14'], ['mountain', 'Ridgeline Supply', 'Jake Holloway · 12']]

export function boothSection(): string {
  return '<section class="section booth" aria-labelledby="booth-title"><div class="wrap booth-grid">'
    + '<div class="booth-copy"><p class="eyebrow">Market week · Juniper &amp; Vale · Mon Oct 19</p>'
    + '<h2 id="booth-title" class="h-m">Written at the booth, <span class="line">size by size.</span></h2>'
    + '<p class="lede">Dana scanned the hang tag, filled the size run beside the line sheet, and Nia signed on the iPad.</p></div>'
    + '<div class="booth-pad card">'
    + `<div class="pad-style"><p class="pill pill-green sm">Hang tag scanned · 2214 Wrap Dress · Floral · added ${ok}</p><h3 class="serif-title xl">2214 Wrap Dress</h3>`
    + `${dress('pad-dress', 'The 2214 Wrap Dress: white with small red-orange and celadon flowers and a tie belt')}<p class="pad-price">${nb('S–XL $48.00')} · ${nb('1X–3X $52.00')}</p></div>`
    + '<div class="pad-order"><h3 class="serif-title lg">Marlowe Boutique</h3>'
    + `<div class="pad-matrix"><table><caption class="visually-hidden">Marlowe Boutique’s 2214 size run</caption><thead><tr>${sizes.map(size => `<th scope="col">${size}</th>`).join('')}<th scope="col">Total</th></tr></thead>`
    + `<tbody><tr>${run.map(value => `<td>${value}</td>`).join('')}<td><b>14</b></td></tr></tbody></table>${cursor('Dana Ortiz', 'pad-dana')}${note('ship Feb', 'pad-ship')}</div>`
    + `<p class="pad-sum">12 × $48.00 + 2 × $52.00 = ${nb('$680.00')}</p>`
    + `<p class="pad-tee"><b>2219 Tee</b> · entered 10 · case pack 6 → 12 suggested · Nia accepted ${ok} · 12 × $22.00 = ${nb('$264.00')}</p>`
    + '<div class="pad-confirm"><h4 class="serif-title">JV-10418 · Marlowe Boutique, Savannah GA</h4>'
    + `<p>$680.00 + $264.00 = ${nb('$944.00')}</p><p>ship ${nb('Mon Feb 1 – Mon Feb 15')} · cancel after ${nb('Fri Feb 26')}</p><p>net 30</p><p>Georgia resale certificate on file · tax $0.00</p>`
    + `<p class="signature" aria-label="Signed by Nia Brooks"><span>Nia Brooks</span></p><p class="pad-signed">Sales terms v2 · signed by Nia Brooks, owner · ${nb('11:42 am')} ${ok}</p></div>`
    + '</div></div>'
    + `<ul class="booth-strip">${reps.map(([brand, name, line]) => `<li class="card">${glyph(brand, 'card-glyph xl')}<div><p class="serif-title">${name}</p><p class="muted">${line}</p></div></li>`).join('')}`
    + `<li class="booth-total"><p class="pill pill-green lg">63 orders written ${ok}</p></li></ul>`
    + '</div></section>'
}
