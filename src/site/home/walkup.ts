// 06 · Walk-up Wednesday, stockist by Monday: Salt Marsh Provisions' prospect card joined by a dotted Wed → Mon
// path to the approved stockist card.
import { glyph, icon, nb, ok } from '../shell/html'
import { drawing } from './drawings'

const lines: [ReturnType<typeof drawing>, string, string, string][] = [
  [drawing('mug', 78, 64, 'wu-thumb'), 'Harbor Mug', '4 cases × 6 = 24 × $9.50', '$228.00'],
  [drawing('bowl', 80, 55, 'wu-thumb'), 'Tide Bowl', '2 cases × 4 = 8 × $16.00', '$128.00'],
  [drawing('pitcher', 78, 86, 'wu-thumb'), 'Gull Pitcher', '1 case × 2 = 2 × $28.00', '$56.00'],
]

export function walkUpSection(): string {
  return '<section class="section walkup" aria-labelledby="walkup-title"><div class="wrap">'
    + `<p class="eyebrow center ink">New stockist · Tidewater Gifts · Wed Oct 21 <span aria-hidden="true">→</span><span class="visually-hidden">to</span> Mon Oct 26</p>`
    + '<h2 id="walkup-title" class="center xxl">Walk-up Wednesday, <span class="line">stockist by Monday.</span></h2>'
    + '<p class="lede center">A shop owner stopped at the booth. Marcus took her details and first order; Kendra approved her Monday.</p>'
    + '<div class="wu-grid">'
    + `<article class="card wu-prospect"><div class="card-head">${glyph('gift', 'card-glyph xl')}<div><p class="wu-title">Prospect · ${nb('Wed Oct 21, 2:40 pm')} · Marcus Bell’s iPad</p><p class="muted">Salt Marsh Provisions · Beaufort SC · Tessa Monroe, owner</p></div></div>`
    + `<ul class="chips"><li>EIN ${ok}</li><li>bill-to and ship-to ${ok}</li><li>SC resale certificate photo ${ok}</li><li>source: Atlanta market week</li></ul>`
    + '<p class="wu-sub">Draft from the show price book</p>'
    + `<table class="wu-lines"><caption class="visually-hidden">Salt Marsh Provisions’ first draft</caption><tbody>${lines.map(([art, name, math, total]) => `<tr><td class="wu-art">${art}</td><th scope="row">${name}</th><td>${math}</td><td class="num">${total}</td></tr>`).join('')}</tbody></table>`
    + `<p class="wu-total"><b>$412.00</b> · over the $250.00 minimum ${ok}</p><p class="wu-foot">Draft kept · no stock held yet · trade application sent ${nb('2:41 pm')}</p></article>`
    + `<div class="wu-path" aria-hidden="true"><span class="wu-chip">${icon('calendar', 'icon')}Wed → Mon</span></div>`
    + `<article class="card wu-stockist"><div class="card-head">${glyph('gift', 'card-glyph xl')}<p class="wu-title">Stockist · Mon Oct 26</p></div>`
    + `<ol class="wu-steps"><li><b>9:40 am</b> · Approved by Kendra Hayes · no duplicate company · SC resale certificate approved ${ok}</li><li><b>10:05 am</b> · Tessa signed in · portal terms accepted · draft confirmed ${ok}</li></ol>`
    + `<p class="wu-money"><b>$412.00</b> + UPS Ground $24.60 · tax $0.00 (resale) = <b>${nb('$436.60')}</b></p>`
    + `<p class="bar bar-green lg">paid by card ${ok} · ships ${nb('Tue Oct 27')}</p></article>`
    + '</div></div></section>'
}
