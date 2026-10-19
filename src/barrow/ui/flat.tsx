// Barrow keeps no product images. The pad draws a flat for the garment its style name names, in the
// run site's line (the 2214 Wrap Dress is the site's own drawing); any other style gets its code on a tile.
const flats: [RegExp, string][] = [
  [/dress/i, '/site/dress-2214.svg'],
  [/\btee\b|t-shirt/i, '/barrow/flats/tee.svg'],
  [/shirt|blouse|popover/i, '/barrow/flats/shirt.svg'],
  [/wide[- ]leg/i, '/barrow/flats/wide-pant.svg'],
  [/pant|trouser/i, '/barrow/flats/pant.svg'],
  [/cardigan|sweater/i, '/barrow/flats/cardigan.svg'],
]

export function Flat({ name, code, large = false }: { name: string; code: string; large?: boolean }) {
  const source = flats.find(([pattern]) => pattern.test(name))?.[1]
  return <span className={`br-flat${large ? ' br-flat-large' : ''}`} aria-hidden="true">
    {source ? <img src={source} alt="" loading="lazy" /> : <span className="br-flat-code">{code.slice(-6)}</span>}
  </span>
}
