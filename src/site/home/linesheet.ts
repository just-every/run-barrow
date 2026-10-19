// 03 · One line sheet, each stockist's own prices: the 28 priced PDFs fanned with stockist tabs, Hannah's send
// card wired to Marlowe's wholesale + MSRP sheet and Halsey's wholesale-only sheet, and the results by Fri Oct 16.
import { cursor, glyph, nb, note, ok } from '../shell/html'
import { dress } from './drawings'

const retail = ['S–XL $48.00', '1X–3X $52.00', 'MSRP $118.00']
const fan = [
  { name: 'Bayside Threads', tone: 'saffron', prices: retail },
  { name: 'Wren &amp; Co.', tone: 'apricot', prices: retail },
  { name: 'Ivy &amp; Oak', tone: 'celadon', prices: retail },
  { name: 'Halsey’s', tone: 'denim', prices: ['S–XL $46.00', '1X–3X $50.00', 'wholesale only'] },
]

const sheet = (title: string, sub: string, rows: [string, string][], extra = '') => `<article class="ls-sheet">`
  + `<header><span class="pdf-chip">PDF</span><p class="ls-sheet-title">${title}</p><p class="ls-sheet-sub">${sub}</p></header><div class="ls-dress-wrap">${dress('ls-sheet-dress')}${extra}</div>`
  + `<p class="ls-style">2214 Wrap Dress</p><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></article>`

export function lineSheetSection(): string {
  return '<section class="section linesheet" aria-labelledby="linesheet-title"><div class="wrap ls-grid">'
    + '<div class="ls-copy"><p class="eyebrow">Line sheet · Juniper &amp; Vale · Wed Oct 7 – Fri Oct 16</p>'
    + '<h2 id="linesheet-title" class="h-m">One line sheet, <span class="line">each stockist’s own prices.</span></h2>'
    + '<p class="lede">Hannah sent Spring ’27 to 28 boutiques in one go. Each opened its own prices; 11 ordered from the page.</p></div>'
    + '<div class="ls-send card">'
    + `<div class="card-head">${glyph('leaf', 'card-glyph lg')}<div><p class="serif-title">Spring ’27 line sheet · rev 3</p><p class="muted">sent ${nb('Thu Oct 8, 9:00 am')} by Hannah Pierce</p></div></div>`
    + '<p class="ls-segment">Segment: Boutiques · ordered Spring ’26 · 30 accounts · 28 sent · 2 left out</p>'
    + '<ul class="ls-left-out"><li>left out: 1 account on hold</li><li>left out: 1 account closed</li></ul>'
    + `<p class="bar bar-green">Each stockist’s own priced PDF attached ${ok}</p></div>`
    + '<figure class="ls-fan"><div class="ls-fan-sheets">'
    + fan.map((item, index) => `<div class="ls-fan-sheet f${index}"><span class="ls-tab tone-${item.tone}">${item.name}</span><span class="pdf-chip">PDF</span>${dress('ls-fan-dress')}<p class="ls-fan-prices">${item.prices.map(price => `<span>${price}</span>`).join('')}</p></div>`).join('')
    + '</div><figcaption>28 priced PDFs · one per stockist</figcaption></figure>'
    + '<div class="ls-recipients"><span class="wire w1" aria-hidden="true"></span><span class="wire w2" aria-hidden="true"></span>'
    + sheet('Marlowe Boutique', 'wholesale + MSRP', [['S–XL', '$48.00'], ['1X–3X', '$52.00'], ['MSRP', '$118.00'], ['margin', `${nb('$70.00 (59%)')} / ${nb('$66.00 (56%)')}`]])
    + sheet('Halsey’s, Raleigh NC', 'Volume price list · wholesale only', [['S–XL', '$46.00'], ['1X–3X', '$50.00']], `<span class="sticky">${note('their price book, not Marlowe’s')}</span>`)
    + '</div>'
    + '<div class="ls-results card"><div class="ls-results-head"><h3 class="serif-title xl">By Fri Oct 16</h3>'
    + '<ul class="ls-stats"><li><b>28</b> delivered</li><li><b>23</b> opened</li><li><b>11</b> ordered from their link</li><li class="money"><b>$18,940.00</b></li></ul></div>'
    + '<table class="ls-table"><caption class="visually-hidden">Orders from the line sheet by Fri Oct 16</caption><tbody>'
    + '<tr><th scope="row">Bayside Threads, Charleston SC</th><td>$2,316.00</td></tr><tr><th scope="row">Wren &amp; Co., Asheville NC</th><td>$1,944.00</td></tr>'
    + `<tr class="hl"><th scope="row">Ivy &amp; Oak, Austin TX ${cursor('Sam Lee', 'ls-sam')}</th><td>$1,728.00</td></tr><tr><th scope="row">+ 8 more</th><td>$12,952.00</td></tr></tbody></table></div>`
    + '</div></section>'
}
