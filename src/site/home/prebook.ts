// 07 · Prebooked in October, shipped in two windows: a six-month calendar strip on a linear axis (Oct 1, 2026 –
// Mar 31, 2027; every mark at its own date), the SO-48790 prebook hanging from Oct 22 and the 30% deposit card.
import { glyph, nb, ok } from '../shell/html'
import { drawing } from './drawings'

const DAYS = 182
const months = [['Oct 2026', 0, 31], ['Nov', 31, 30], ['Dec', 61, 31], ['Jan 2027', 92, 31], ['Feb', 123, 28], ['Mar', 151, 31]] as const
const p = (offset: number) => (offset / DAYS).toFixed(4)
const mid = (offset: number) => ((offset + .5) / DAYS).toFixed(4)

const windows = [
  { name: 'Feb window', when: `${nb('Mon Feb 1 – Mon Feb 15')} · cancel after ${nb('Fri Feb 26')}`, lines: [['Summit 28L Pack', '24 × $74.00', '$1,776.00'], ['Trail Cap', '48 × $14.00', '$672.00'], ['Basin Rain Shell', '16 × $104.50', '$1,672.00']], total: '$4,120.00' },
  { name: 'Mar window', when: `${nb('Mon Mar 1 – Mon Mar 15')} · cancel after ${nb('Fri Mar 26')}`, lines: [['Canyon Hip Pack', '48 × $26.00', '$1,248.00'], ['Ridge Flask 20 oz', '96 × $11.50', '$1,104.00'], ['Trail Cap', '72 × $14.00', '$1,008.00']], total: '$3,360.00' },
]

export function prebookSection(): string {
  return '<section class="section prebook" aria-labelledby="prebook-title"><div class="wrap">'
    + '<div class="split-head"><div><p class="eyebrow">Prebook · Ridgeline Supply · Thu Oct 22</p>'
    + '<h2 id="prebook-title" class="h-m">Prebooked in October, <span class="line">shipped in two windows.</span></h2></div>'
    + '<p class="lede">Bozeman Outfitters booked spring in one sitting: two ship windows and a 30% deposit.</p></div>'
    + '<div class="cal" role="img" aria-label="October 2026 to March 2027: prebook written Thu Oct 22, prebook closes Fri Nov 20, Basin Rain Shell inbound Mon Jan 18, ship windows Feb 1–15 and Mar 1–15.">'
    + months.map(([name, start, length]) => `<span class="cal-month" style="--a:${p(start)};--w:${p(length)}"><b>${name}</b></span>`).join('')
    + `<span class="cal-mark cal-now" style="--p:${mid(21)}"><span class="cal-dot"></span><span class="cal-label">Thu Oct 22</span></span>`
    + `<span class="cal-mark cal-close" style="--p:${mid(50)}"><span class="cal-chip">Spring ’27 prebook closes Fri Nov 20</span><span class="cal-dot sm"></span></span>`
    + `<span class="cal-mark cal-inbound" style="--p:${mid(109)}"><span class="cal-dot sm"></span><span class="cal-label">Basin Rain Shell inbound <br>Mon Jan 18</span></span>`
    + `<span class="cal-window" style="--a:${p(123)};--w:${p(15)}"><span class="cal-bar"></span><span class="cal-label">Feb 1–15</span></span>`
    + `<span class="cal-window" style="--a:${p(151)};--w:${p(15)}"><span class="cal-bar"></span><span class="cal-label">Mar 1–15</span></span>`
    + '</div>'
    + `<div class="pb-grid" style="--now:${mid(21)}"><article class="card pb-order"><span class="pb-hang" aria-hidden="true"></span>`
    + `<div class="card-head">${glyph('mountain', 'card-glyph xxl')}<div><h3 class="serif-title xl">SO-48790 · Bozeman Outfitters, Bozeman MT</h3><p class="muted">Cole Avery · written by Jake Holloway</p></div></div>`
    + drawing('pack-cap', 272, 204, 'pb-art', 'A green trail pack and a sage cap, drawn')
    + windows.map(w => `<div class="pb-window"><p class="pb-when"><b>${w.name}</b> · ${w.when}</p><table><caption class="visually-hidden">${w.name}</caption><tbody>${w.lines.map(([name, qty, total]) => `<tr><th scope="row">${name}</th><td>${qty}</td><td class="num">${total}</td></tr>`).join('')}`
      + `<tr class="sub"><th scope="row">window total</th><td></td><td class="num"><b>${w.total}</b></td></tr></tbody></table></div>`).join('')
    + '<p class="pb-total serif-title xl">Total $7,480.00</p><p class="muted">Montana · no sales tax</p></article>'
    + `<aside class="card pb-deposit"><p class="chip-grey">NetSuite · Boise · Feb lines promised ${ok} · prebook, not available-now</p><p class="pb-dep">30% deposit ${nb('$2,244.00')}</p>`
    + `<p>ACH authorized at the booth</p><p class="green">pending → settled ${nb('Tue Oct 27')} ${ok}</p><p class="rule">Applied: Feb ${nb('$1,236.00')} · Mar ${nb('$1,008.00')}</p><p class="rule">Due on shipment: Feb ${nb('$2,884.00')} · Mar ${nb('$2,352.00')}</p></aside></div>`
    + '</div></section>'
}
