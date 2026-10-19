// 08 · Interlude: Ember Hollow's Asheville dock on Mon Oct 26, ten plain cartons on an ultramarine pallet.
// The painting (public/site/interlude-*) has blank labels; each label's stockist and town is set here at the
// desk's position (1536 x 1024 pixels). On phones the labels keep only the glyph and the list follows the art.
import { glyph, ok } from '../shell/html'

const labels: [number, number, number, number, string, string][] = [
  [492, 296, 645, 368, 'Lantern &amp; Loom', 'Santa Fe, NM'], [691, 295, 845, 367, 'Oak Street General', 'Bentonville, AR'], [891, 295, 1043, 367, 'Copper Kettle', 'Duluth, MN'],
  [450, 468, 624, 547, 'Prairie Goods', 'Lawrence, KS'], [685, 467, 851, 544, 'Salt &amp; Cedar', 'Bend, OR'], [912, 467, 1085, 545, 'Little Fig', 'Fort Collins, CO'],
  [377, 644, 540, 722, 'Larkspur Row', 'Boulder, CO'], [587, 644, 746, 721, 'Driftwood &amp; Daughter', 'Galveston, TX'], [792, 644, 951, 721, 'Bluebird Mercantile', 'Missoula, MT'], [998, 644, 1158, 721, 'Hollis Street Goods', 'Halifax, VA'],
]

export function interlude(): string {
  const set = (type: string) => [768, 1152, 1536].map(w => `/site/interlude-${w}.${type} ${w}w`).join(', ')
  return '<section class="interlude" aria-label="Mon Oct 26 at Ember Hollow’s Asheville dock: 10 show orders out the door"><div class="il-stage">'
    + `<picture class="il-art"><source media="(max-width: 759px)" type="image/avif" srcset="/site/interlude-phone.avif"><source media="(max-width: 759px)" type="image/webp" srcset="/site/interlude-phone.webp">`
    + `<source type="image/avif" srcset="${set('avif')}" sizes="min(100vw, 1536px)"><img src="/site/interlude-1536.webp" srcset="${set('webp')}" sizes="min(100vw, 1536px)" alt="Ten white cartons stacked on an ultramarine pallet at the open door of Ember Hollow’s Asheville dock, saffron candle jars on the shelves behind." width="1536" height="1024" loading="lazy"></picture>`
    + labels.map(([x0, y0, x1, y1, name, town]) => `<p class="il-label" style="--x:${x0};--y:${y0};--w:${x1 - x0};--h:${y1 - y0}">${glyph('candle', 'il-glyph')}<span><b>${name}</b><span>${town}</span></span></p>`).join('')
    + `<p class="il-chip">${glyph('candle', 'il-glyph')}<span><b>Mon Oct 26</b> · 10 show orders out the door ${ok}</span></p></div>`
    + `<ul class="il-list" aria-label="The ten cartons">${labels.map(([, , , , name, town]) => `<li><b>${name}</b> ${town}</li>`).join('')}</ul></section>`
}
