// run-barrow.com's homepage, built from the design desk's approved page (19 Oct 2026, page-s1) in its order:
// 01 hero, 02 the season, 03 line sheet, 04 market week, 05 offline, 06 new stockist, 07 prebook, 08 interlude,
// 09 photographed PO, 10 follow-through (the wash band), 11 connected, 12 moving in, 13 closing and footer.
// Painted art appears only in the hero and the interlude; every card and screen is HTML and CSS.
import { documentHtml } from '../shell/chrome'
import { agentPoSection } from './agent-po'
import { boothSection } from './booth'
import { closing } from './closing'
import { connectedSection } from './connected'
import { followSection } from './follow'
import { hero } from './hero'
import { interlude } from './interlude'
import { lineSheetSection } from './linesheet'
import { moveInSection } from './move-in'
import { offlineSection } from './offline'
import { prebookSection } from './prebook'
import { seasonSection } from './season'
import { walkUpSection } from './walkup'

// Draws the dotted wires between cards once the layout is known (03 send card to sheets, 09 PO lines to the
// agent's rows), and gives the terminal its Copy button.
const SCRIPT = "(()=>{const draw=()=>{document.querySelectorAll('[data-wires]').forEach(box=>{const svg=box.querySelector(':scope>.wires');if(!svg)return;const b=box.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${b.width} ${b.height}`);svg.innerHTML=box.dataset.wires.split(';').map(pair=>{const[a,z]=pair.split('>').map(s=>box.querySelector(s));if(!a||!z||!a.offsetParent||!z.offsetParent)return'';const r=a.getBoundingClientRect(),q=z.getBoundingClientRect();const x1=r.right-b.left,y1=r.top+r.height/2-b.top,x2=q.left-b.left,y2=q.top+q.height/2-b.top,m=(x1+x2)/2;return`<path d=\"M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}\"/>`}).join('')})};addEventListener('load',draw);addEventListener('resize',draw);document.fonts&&document.fonts.ready.then(draw);document.querySelectorAll('.copy').forEach(button=>{button.hidden=false;button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.querySelector('span').textContent='Copied';setTimeout(()=>{button.querySelector('span').textContent='Copy'},1600)}catch{}})})})()"

export function homeHtml(styles: string[]): string {
  const body = '<main id="main">' + hero() + seasonSection() + lineSheetSection() + boothSection() + offlineSection() + walkUpSection() + prebookSection()
    + interlude() + agentPoSection() + followSection() + connectedSection() + moveInSection() + closing() + '</main>'
  return documentHtml({
    title: 'Barrow — wholesale orders, shipped and paid',
    description: 'Barrow gives each stockist its own prices and line sheets, takes orders online, from reps and at trade shows, and follows every order to delivery and payment. 100% free and open source.',
    styles,
  }, body, 'home', SCRIPT)
}
