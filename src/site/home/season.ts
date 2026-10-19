// 02 · Four weeks, line sheet to paid: one swimlane card on a linear date axis, Wed Oct 7 – Mon Nov 2, 2026.
// Each date is a cell (27 cells); an all-day stop sits at its cell's centre and a timed stop at its time.
// Atlanta market week is a pale band over exactly the Mon Oct 19 – Thu Oct 22 cells, drawn behind the labels.
import { glyph, nb, note, ok, type Brand } from '../shell/html'

const CELLS = 27
const day = (date: number, month: 'Oct' | 'Nov' = 'Oct') => month === 'Oct' ? date - 7 : 24 + date
const at = (cell: number, fraction = .5) => ((cell + fraction) / CELLS).toFixed(5)

interface Stop { p: string; side: 'above' | 'below'; tone?: 'amber' | 'red'; align?: 'end'; lines: string[]; dot?: 'up' | 'down' }
interface Track { stops: Stop[]; links: { from: string; to: string; dashed?: boolean; tone?: 'amber' }[] }
interface Lane { brand: Brand; name: string; tracks: Track[] }

const s = (cell: number, side: Stop['side'], lines: string[], extra: Partial<Stop> = {}): Stop => ({ p: at(cell), side, lines, ...extra })

const lanes: Lane[] = [
  { brand: 'leaf', name: 'Juniper &amp; Vale', tracks: [{
    stops: [
      s(day(7), 'above', ['Wed Oct 7', 'line sheet rev 3']),
      s(day(8), 'below', ['Thu Oct 8', 'sent to 28 stockists']),
      s(day(16), 'above', ['Fri Oct 16', `11 orders · ${nb('$18,940.00')}`], { align: 'end' }),
      s(day(19), 'below', ['Mon Oct 19', `Marlowe Boutique ${nb('$944.00')}`, 'signed at the booth']),
      { p: at(day(20), 10.25 / 24), side: 'above', tone: 'red', dot: 'up', lines: ['Tue Oct 20, 10:15 am', 'Wi-Fi down', `<b>6:42 pm · 11 drafts synced ${ok}</b>`] },
      { p: at(day(20), 18.7 / 24), side: 'above', dot: 'down', lines: [] },
    ],
    links: [{ from: at(day(7)), to: at(day(20), 10.25 / 24) }],
  }] },
  { brand: 'candle', name: 'Ember Hollow', tracks: [
    { stops: [
      s(day(13), 'above', ['Tue Oct 13', 'Sonoma Mercantile ships UPS'], { align: 'end' }),
      s(day(15), 'below', ['Thu Oct 15', 'Birch &amp; Fern', 'parcel 2 delayed'], { tone: 'amber' }),
      s(day(19), 'above', ['Mon Oct 19', `parcel 2 delivered ${ok}`]),
    ], links: [{ from: at(day(15)), to: at(day(19)), dashed: true, tone: 'amber' }] },
    { stops: [
      s(day(19), 'below', ['Mon Oct 19', 'Harbor Home', 'ACH returned'], { tone: 'amber' }),
      s(day(21), 'above', ['Wed Oct 21', `paid by card ${ok}`]),
      s(day(2, 'Nov'), 'below', ['Mon Nov 2', 'Brightwater Market', `paid · $0.00 due ${ok}`], { align: 'end' }),
    ], links: [{ from: at(day(19)), to: at(day(21)), dashed: true, tone: 'amber' }] },
  ] },
  { brand: 'mountain', name: 'Ridgeline Supply', tracks: [{
    stops: [
      s(day(22), 'above', ['Thu Oct 22', 'Bozeman Outfitters prebook', `${nb('$7,480.00')} · deposit ${nb('$2,244.00')}`], { align: 'end' }),
      s(day(23), 'below', ['Fri Oct 23', 'Ivy &amp; Oak photographed PO', '→ 14 lines accepted']),
      s(day(27), 'above', ['Tue Oct 27', `deposit settled ${ok}`]),
    ], links: [{ from: at(day(22)), to: at(day(27)) }] }] },
  { brand: 'gift', name: 'Tidewater Gifts', tracks: [{
    stops: [
      s(day(21), 'below', ['Wed Oct 21', 'walk-up, Salt Marsh Provisions']),
      s(day(26), 'above', ['Mon Oct 26', `approved · first order ${nb('$436.60')} ${ok}`]),
    ], links: [{ from: at(day(21)), to: at(day(26)) }] }] },
]

const ticks = Array.from({ length: CELLS }, (_, cell) => cell)
const labelled: Record<number, string> = { [day(7)]: 'Wed Oct 7', [day(12)]: 'Mon Oct 12', [day(26)]: 'Mon Oct 26', [day(2, 'Nov')]: 'Mon Nov 2' }

const stopHtml = (stop: Stop) => `<li class="ss ss-${stop.side}${stop.tone ? ` ss-${stop.tone}` : ''}${stop.align ? ' ss-end' : ''}${stop.dot ? ` ss-dot-${stop.dot}` : ''}" style="--p:${stop.p}">`
  + `<span class="ss-dot" aria-hidden="true"></span>${stop.lines.length ? `<span class="ss-label"><b>${stop.lines[0]}</b>${stop.lines.slice(1).map(line => `<span>${line}</span>`).join('')}</span>` : ''}</li>`

const trackHtml = (track: Track) => `<div class="season-track">${track.links.map(link => `<span class="ss-link${link.dashed ? ' dashed' : ''}${link.tone ? ` ${link.tone}` : ''}" style="--a:${link.from};--b:${link.to}" aria-hidden="true"></span>`).join('')}`
  + `<ol>${track.stops.map(stopHtml).join('')}</ol></div>`

export function seasonSection(): string {
  return '<section class="section season" aria-labelledby="season-title"><div class="wrap">'
    + '<p class="eyebrow center">One season · Four brands · Wed Oct 7 – Mon Nov 2</p>'
    + '<h2 id="season-title" class="center xl">Four weeks, <span class="line">line sheet to paid.</span></h2>'
    + '<p class="lede center">Four brands, one market season. Every order written, shipped and paid, in order.</p>'
    + '<div class="season-card card">'
    + `<div class="season-axis" aria-hidden="true"><span class="season-band"><b>Atlanta market week</b><span>Mon Oct 19 – Thu Oct 22</span></span>${ticks.map(cell => `<span class="tick${labelled[cell] ? ' major' : ''}" style="--p:${at(cell)}">${labelled[cell] ? `<span>${labelled[cell]}</span>` : ''}</span>`).join('')}</div>`
    + `<div class="season-lanes">${lanes.map(lane => `<div class="season-lane${lane.tracks.length > 1 ? ' two' : ''}"><h3>${glyph(lane.brand, 'lane-glyph')}<span>${lane.name}</span></h3><div class="season-tracks">${lane.tracks.map(trackHtml).join('')}</div></div>`).join('')}`
    + '<span class="season-band-fill" aria-hidden="true"></span></div>'
    + `<div class="season-foot"><p class="pill pill-green">Market week · 4 reps on iPad · 63 orders written · all synced ${ok}</p>${note('nothing retyped!')}</div>`
    + '</div></div></section>'
}
