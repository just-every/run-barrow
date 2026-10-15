export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

export const actions = (): string => '<div class="home-actions"><a class="home-button" href="/run">Run Barrow <span aria-hidden="true">→</span></a><a class="home-button" href="https://demo.run-barrow.com/">Try the demo</a><a class="home-link" href="/docs">Read the docs</a></div>'

export const drawnButton = (label: string): string => `<span class="home-drawn-button">${label}</span>`

export const scenery = (side: 'left' | 'right' | 'both' = 'right', awning = true): string => `<div class="home-scenery" aria-hidden="true">${awning ? '<div class="home-awning"></div>' : ''}${side !== 'right' ? '<img class="home-olive home-olive-left" src="/landing/olive-left.webp" alt="" loading="lazy">' : ''}${side !== 'left' ? '<img class="home-olive home-olive-right" src="/landing/olive-right.webp" alt="" loading="lazy">' : ''}<div class="home-counter"></div></div>`
