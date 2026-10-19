// 05 · Wi-Fi down at 10:15. Every order kept: the page's one failure, on white: the timeline from the red 10:15 node
// to the green 6:42 sync, the sync queue and Palmetto & Pine's price diff, re-confirmed at 7:05 pm.
import { cursor, glyph, nb, ok } from '../shell/html'

const steps = [
  { time: '10:15 am', kind: 'red', body: `Hall Wi-Fi down · offline · prices as of ${nb('10:14 am')}`, extra: '<span class="pill pill-red">offline</span>' },
  { time: `10:15 am – ${nb('6:38 pm')}`, kind: 'ring', body: '11 drafts kept on Dana’s iPad · queued' },
  { time: '12:00 pm', kind: 'dashed', body: `Scheduled price update takes effect: <span class="nb">2219 Tee $22.00 → $23.00</span>`, extra: '<em class="muted">not on the iPad yet</em>' },
  { time: '6:42 pm', kind: 'green', body: 'Back online · 11 uploaded' },
  { time: '7:05 pm', kind: 'green', body: `Lena Ross re-confirmed ${ok}` },
]

export function offlineSection(): string {
  return '<section class="section offline" aria-labelledby="offline-title"><div class="wrap">'
    + '<div class="split-head"><div><p class="eyebrow">Offline · Juniper &amp; Vale · Tue Oct 20</p>'
    + '<h2 id="offline-title" class="h-l">Wi-Fi down at 10:15. <span class="line">Every order kept.</span></h2></div>'
    + '<p class="lede">The hall lost its connection for eight hours. Every draft went up once, and the one changed price went back to the buyer.</p></div>'
    + '<div class="offline-grid">'
    + `<ol class="timeline">${steps.map(step => `<li class="tl-${step.kind}"><span class="tl-time">${step.time}</span><span class="tl-node" aria-hidden="true"></span><div><p>${step.body}</p>${step.extra ?? ''}</div></li>`).join('')}</ol>`
    + '<div class="offline-cards">'
    + `<div class="card sync-queue">${glyph('leaf', 'card-glyph lg')}<div><p class="serif-title lg">Sync queue · Dana Ortiz’s iPad</p><p>11 drafts · 10 accepted as written ${ok} · 1 price changed</p><p>1 response lost at 6:42 → resent → still one order ${ok}</p></div></div>`
    + '<div class="card diff"><p class="serif-title">Palmetto &amp; Pine, Columbia SC · <span class="diff-sub">written offline 1:30 pm at the old price</span></p>'
    + '<table><caption class="visually-hidden">Palmetto &amp; Pine’s order before and after the price update</caption><tbody>'
    + `<tr><th scope="row">2219 Tee</th><td><s>18 × $22.00 = $396.00</s></td><td class="arrow" aria-hidden="true">→</td><td class="new">18 × $23.00 = ${nb('$414.00')}</td></tr>`
    + '<tr><th scope="row">2214 Wrap Dress</th><td>12 × $48.00 = $576.00</td><td></td><td class="muted">unchanged</td></tr>'
    + '<tr><th scope="row">2241 Linen Pant</th><td>6 × $42.00 = $252.00</td><td></td><td class="muted">unchanged</td></tr>'
    + `<tr class="total"><th scope="row">Total</th><td><s>$1,224.00</s></td><td class="arrow" aria-hidden="true">→</td><td class="new">${nb('$1,242.00')} (+$18.00)</td></tr></tbody></table>`
    + `<p class="bar bar-green">Sent back to Lena Ross · re-confirmed ${nb('7:05 pm')} ${ok}</p></div>`
    + `<div class="card keeps"><p>Marlowe Boutique’s Monday order keeps $22.00 ${ok}</p></div></div></div>`
    + `<div class="offline-pill"><p class="pill pill-green lg wide">Hall Wi-Fi down ${nb('Tue Oct 20')} · 11 drafts kept · synced ${nb('6:42 pm')} · 1 price changed → buyer re-confirmed ${ok}</p>${cursor('Dana Ortiz', 'offline-dana')}</div>`
    + '</div></section>'
}
