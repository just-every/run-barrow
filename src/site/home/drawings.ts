// The page's drawn product pictures. The 2214 Wrap Dress is one vector drawing (public/site/dress-2214.svg,
// traced from the desk's dress and printed with the hero's small red-orange and celadon flowers) at every size;
// the mug, bowl, pitcher, pack and cap are the desk's own small drawings.

export const dress = (className: string, alt = ''): string => `<img class="${className}" src="/site/dress-2214.svg" alt="${alt}" width="310" height="470" loading="lazy">`

export const drawing = (name: 'mug' | 'bowl' | 'pitcher' | 'pack-cap' | 'tee', width: number, height: number, className: string, alt = ''): string =>
  `<picture class="${className}"><source type="image/avif" srcset="/site/${name}.avif"><img src="/site/${name}.webp" alt="${alt}" width="${width}" height="${height}" loading="lazy"></picture>`
