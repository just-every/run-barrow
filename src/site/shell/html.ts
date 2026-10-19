// Small HTML helpers shared by the run site's pages: escaping, the one brand glyph set, line icons and checks.

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

/**
 * The four brands' filled glyphs, drawn once per page as symbols (the desk's glyphs.py set):
 * Juniper & Vale's celadon leaf, Ember Hollow's saffron candle, Ridgeline Supply's green mountain
 * and Tidewater Gifts' ultramarine gift box. Every card at every width uses these.
 */
export type Brand = 'leaf' | 'candle' | 'mountain' | 'gift'

export const glyphDefs = '<svg class="glyph-defs" aria-hidden="true" focusable="false" width="0" height="0"><defs>'
  + '<symbol id="g-leaf" viewBox="0 0 32 32"><path d="M5.5 26.5C5 15 12.5 5.6 27 4.8c.4 13.6-7.8 22-21.5 21.7z" fill="#8fbf9f"/><path d="M4 28.5 21.5 11" stroke="#4f8a63" stroke-width="1.6" stroke-linecap="round" fill="none"/></symbol>'
  + '<symbol id="g-candle" viewBox="0 0 32 32"><path d="M16 2.6c2.6 3.3 3.9 5.6 3.9 7.4a3.9 3.9 0 0 1-7.8 0c0-1.8 1.3-4.1 3.9-7.4z" fill="#f98e4e"/><path d="M16 7.6c1 1.3 1.5 2.2 1.5 2.9a1.5 1.5 0 0 1-3 0c0-.7.5-1.6 1.5-2.9z" fill="#fcd464"/><rect x="9" y="14.5" width="14" height="15.5" rx="2.6" fill="#f7b21b"/><rect x="9" y="14.5" width="14" height="3.4" rx="1.7" fill="#e39a00" opacity=".35"/></symbol>'
  + '<symbol id="g-mountain" viewBox="0 0 32 32"><path d="M1.5 27.5 12.2 9.4l4.6 7.4 3.4-5.2 10.3 15.9z" fill="#1d9455"/><path d="m12.2 9.4 3.1 5-1.9 1.4-1.2-1.6-1.9 1.9-1.4-1.3z" fill="#fff"/></symbol>'
  + '<symbol id="g-gift" viewBox="0 0 32 32"><path d="M15.4 9.6c-1.4-3.4-4.9-5.6-7-4-1.8 1.4-.7 4.3 2.8 4.3M16.6 9.6c1.4-3.4 4.9-5.6 7-4 1.8 1.4.7 4.3-2.8 4.3" stroke="#1f3fe0" stroke-width="2.2" fill="none" stroke-linecap="round"/><rect x="3.5" y="10" width="25" height="6.4" rx="1.4" fill="#1f3fe0"/><rect x="5.5" y="17.8" width="21" height="11.2" rx="1.4" fill="#1f3fe0"/><path d="M14.6 10h2.8v19h-2.8z" fill="#fff"/></symbol>'
  + '</defs></svg>'

export const glyph = (brand: Brand, className = 'glyph'): string => `<svg class="${className}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><use href="#g-${brand}"/></svg>`

const iconPaths = {
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h1M11.5 13h1M15.5 13h1M7.5 16.5h1M11.5 16.5h1"/>',
  wifi: '<path d="M2.5 9.2a14 14 0 0 1 19 0M5.6 12.6a9.5 9.5 0 0 1 12.8 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19.2" r="1.1" fill="currentColor" stroke="none"/>',
  truck: '<path d="M2.5 6.5h11v10h-11zM13.5 10h4l3.5 3.5v3h-7.5"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  box: '<path d="m12 3 8.5 4.2v9.6L12 21l-8.5-4.2V7.2z" fill="currentColor" fill-opacity=".14"/><path d="m3.5 7.2 8.5 4.2 8.5-4.2M12 11.4V21"/>',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 9.5h19M6 15h4"/>',
  doc: '<path d="M6 2.8h8l4.5 4.5v13.9H6z"/><path d="M14 2.8v4.5h4.5M9 12h6.5M9 15.5h6.5M9 8.5h2.5"/>',
  plane: '<path d="m21.5 3-19 7.6 7 2.6 2.6 7.3z"/><path d="m9.5 13.2 12-10.2"/>',
  camera: '<rect x="2.5" y="6.5" width="19" height="13.5" rx="2.5"/><path d="m8.5 6.5 1.6-2.7h3.8l1.6 2.7"/><circle cx="12" cy="13.2" r="3.6"/>',
  store: '<path d="M3.5 9.5 5 4h14l1.5 5.5M3.5 9.5h17M3.5 9.5v10.5h17V9.5M9.5 20v-6h5v6"/>',
  arrow: '<path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
} as const
export type Icon = keyof typeof iconPaths

export const icon = (name: Icon, className = 'icon'): string => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`

/** One green check for a done step, as text so it sits on the line it closes. */
export const ok = '<span class="ok" aria-label="done">✓</span>'

/** A cursor with its owner's name tag: Sam Lee in ultramarine, Dana Ortiz in pink. */
export const cursor = (name: 'Sam Lee' | 'Dana Ortiz', className = ''): string => `<span class="cursor ${name === 'Sam Lee' ? 'cursor-sam' : 'cursor-dana'}${className ? ` ${className}` : ''}" aria-hidden="true"><svg viewBox="0 0 16 20"><path d="M1.5 1.5v15.2l4.2-4.1 2.7 6 2.6-1.2-2.7-5.9h5.9z"/></svg><span>${name}</span></span>`

/** A cinnabar handwritten note ("reorder!", "ship Feb"). */
export const note = (text: string, className = ''): string => `<span class="hand-note${className ? ` ${className}` : ''}">${text}</span>`

/** A line that must never break inside: dates, IDs, money and commands. */
export const nb = (text: string): string => `<span class="nb">${text}</span>`
