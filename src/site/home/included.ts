import { scenery } from './shared'

const paths = [
  '<path d="m4 17 13-13h10v10L14 27z"/><circle cx="23" cy="8" r="1"/>',
  '<path d="M7 3h13l6 6v20H7zM20 3v7h6M12 15h9M12 20h9M12 25h5"/>',
  '<path d="M7 3h13l6 6v20H7zM20 3v7h6M12 15h9M12 20h6"/>',
  '<path d="m7 24 2-7L23 3l6 6-14 14zM20 6l6 6M5 29h23"/>',
  '<path d="M5 10a13 13 0 1 1-1 10M4 3v8h8M17 8v10l7 4"/>',
  '<path d="M10 12H5v17h24V12h-5M17 23V2m-7 7 7-7 7 7"/>',
]
const labels = ['Per-SKU minimums', 'Order minimums', 'PO references', 'Agent drafts', 'Order history', 'Export and restore']

export function includedSection(): string {
  return `<section class="home-included" aria-labelledby="home-included-title"><div class="home-included-art" aria-hidden="true">${scenery('left')}</div><div class="home-included-content"><h2 id="home-included-title">Also included</h2><ul>${labels.map((label, index) => `<li class="home-card"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[index]}</svg><span>${label}</span></li>`).join('')}</ul></div></section>`
}
