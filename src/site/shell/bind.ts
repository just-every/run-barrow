// Line breaking for the run site's text (code blocks aside). Every page passes through bindText once:
// - a separator, arrow or operator stays with the word before it, and a check with its line;
// - IDs, times, dates, a town with its state, and the page's people and products never break inside
//   ("JV-10001", "7:12 am", "Mon Feb 1", "Mystic CT", "Sam Lee", "Ridge Flask 20 oz").

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
const STATE = '(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])'

// The people, stockists and products the page names in its cards, as written in its HTML. (The brands' own
// names may stack, as the desk sets them beside the season's lanes; the interlude's carton labels wrap.)
const NAMES = [
  'Sam Lee', 'Dana Ortiz', 'Nia Brooks', 'Lena Ross', 'Erin Walsh', 'Hannah Pierce', 'Marcus Bell', 'Kendra Hayes', 'Tessa Monroe',
  'Jake Holloway', 'Cole Avery', 'Rosa Delgado', 'Grace Whitfield',
  'Summit 28L Pack', 'Ridge Flask 20 oz', 'Trail Cap', 'Basin Rain Shell', 'Canyon Hip Pack', '2214 Wrap Dress', '2219 Tee', '2241 Linen Pant',
  'Harbor Mug', 'Tide Bowl', 'Gull Pitcher',
  'Marlowe Boutique', 'Sonoma Mercantile', 'Harbor Home', 'Brightwater Market', 'Bozeman Outfitters', 'Palmetto &amp; Pine', 'Salt Marsh Provisions',
  'Birch &amp; Fern', 'Ivy &amp; Oak', 'Bayside Threads',
]

const TOKEN = new RegExp([
  `\\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) ${MONTH} \\d{1,2}(?:–\\d{1,2})?(?:, \\d{4})?\\b`,
  `\\b${MONTH} (?:\\d{1,2}(?:–\\d{1,2})?(?:, \\d{4})?|\\d{4})\\b`,
  '\\b\\d{1,2}:\\d\\d(?: ?[ap]m)?(?: [PMCE]T)?\\b',
  '\\b[A-Z]{2,}-\\d[\\dA-Z]*(?:-[\\dA-Z]+)*\\b',
  '\\b(?:PO|[Ii]nvoice) \\d{3,}\\b',
  '\\b[A-Za-z]+(?:-[A-Za-z]+)+\\b',
  `\\b[A-Z][a-z]+,? ${STATE}\\b(?![\\w-])`,
  ...NAMES.map(name => `\\b${name}\\b`),
].join('|'), 'g')

const eyebrows = (html: string) => html.replace(/(<p class="eyebrow[^"]*">)([\s\S]*?)(<\/p>)/g, (_, open: string, text: string, close: string) => open + text.split(' · ').map(part => `<span class="nb">${part}</span>`).join(' · ') + close)

const bindTokens = (text: string) => text.replace(TOKEN, token => `<span class="nb">${token}</span>`)

// A tag, with any ">" inside its quoted attribute values (data-wires=".q1 .po-q>.r1 .dot") kept in the tag.
const TAG = /(<(?:[^>"']|"[^"]*"|'[^']*')*>)/

export const bindText = (html: string): string => eyebrows(html).split(/(<pre[\s\S]*?<\/pre>|<script[\s\S]*?<\/script>)/).map((part, index) => index % 2 ? part : part
  .split(TAG).map((piece, at) => at % 2 ? piece : bindTokens(piece.replace(/ ([·→=+×–−—])(?= |$)/g, '\u00a0$1'))).join('')
  .replaceAll(' <span class="ok"', '\u00a0<span class="ok"')).join('')
