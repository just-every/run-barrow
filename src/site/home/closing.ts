// 13 · Monday after market. Orders out, money in: the approved mark placed large, a neutral dotted connector
// from each blade to a set-type tag led by its brand's own glyph (Tidewater on the ultramarine blade, Juniper &
// Vale on the celadon one), then the close and the footer.
import { actions, siteFooter } from '../shell/chrome'
import { glyph, icon, ok, type Brand } from '../shell/html'

// The art box is 1536 x 640 desk pixels; the mark sits at x 380, y 70, 560 wide. Pins are points on each
// blade (as fractions of the mark's square), tags are boxes in the art.
const MARK = { x: 380, y: 70, size: 560 }
const pins: [number, number][] = [[.211, .228], [.453, .188], [.653, .303], [.802, .476], [.863, .688]]
const tags: { lead: Brand | 'calendar'; name: string; text: string; x: number; y: number }[] = [
  { lead: 'gift', name: 'Tidewater Gifts', text: `Salt Marsh Provisions approved ${ok}`, x: 40, y: 58 },
  { lead: 'candle', name: 'Ember Hollow', text: `10 show orders shipped ${ok}`, x: 560, y: 18 },
  { lead: 'mountain', name: 'Ridgeline Supply', text: `13 orders in NetSuite ${ok}`, x: 900, y: 150 },
  { lead: 'leaf', name: 'Juniper &amp; Vale', text: `21 show orders confirmed ${ok}`, x: 1010, y: 290 },
  { lead: 'calendar', name: 'Spring ’27', text: 'first window ships Mon Feb 1', x: 1040, y: 470 },
]
// Where each connector meets its tag (desk pixels): below the two top tags, at the left end of the three on the right.
const ends: [number, number][] = [[420, 101], [598, 61], [900, 172], [1010, 312], [1040, 492]]

export function closing(): string {
  const pin = ([fx, fy]: [number, number]) => [MARK.x + fx * MARK.size, MARK.y + fy * MARK.size] as const
  const wires = pins.map((p, index) => { const [x, y] = pin(p); const [ex, ey] = ends[index]; return `<path d="M${x.toFixed(1)} ${y.toFixed(1)}L${ex} ${ey}"/>` }).join('')
  const dots = pins.map(p => { const [x, y] = pin(p); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>` }).join('')
  return '<section class="closing" aria-labelledby="closing-title"><div class="wrap">'
    + `<div class="close-art"><img class="close-mark" src="/brand/mark.svg" alt="Barrow’s mark: five colorway blades fanned on one ink rivet" width="560" height="560" loading="lazy">`
    + `<svg class="close-wires" viewBox="0 0 1536 640" preserveAspectRatio="none" aria-hidden="true"><g class="wire-lines">${wires}</g><g class="wire-pins">${dots}</g></svg>`
    + `<ul class="close-tags">${tags.map(tag => `<li style="--x:${tag.x};--y:${tag.y}">${tag.lead === 'calendar' ? icon('calendar', 'tag-icon') : glyph(tag.lead, 'tag-glyph')}<span><b>${tag.name}</b> · ${tag.text}</span></li>`).join('')}</ul></div>`
    + '<h2 id="closing-title" class="center xxl">Monday after market. <span class="line">Orders out, money in.</span></h2>'
    + `<p class="close-sub">100% free and open source. MIT licensed.</p>${actions(false)}</div>`
    + `${siteFooter()}</section>`
}
