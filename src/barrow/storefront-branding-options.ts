// All supported accents retain readable white button text and links on either canvas.
export const storefrontAccents = {
 blue: { name: 'Blue', color: '#1f3fe0' },
 forest: { name: 'Forest', color: '#166534' },
 plum: { name: 'Plum', color: '#713f7b' },
 brick: { name: 'Brick', color: '#9c2f26' },
} as const
export const storefrontCanvases = {
 mist: { name: 'Mist', color: '#f6f7fb' },
 white: { name: 'White', color: '#ffffff' },
} as const
export type StorefrontBranding = {
 displayName: string
 supportUrl: string
 accent: keyof typeof storefrontAccents
 canvas: keyof typeof storefrontCanvases
 revision: string | null
}
export const defaultStorefrontBranding: StorefrontBranding = {
 displayName: 'Barrow', supportUrl: '', accent: 'blue', canvas: 'mist', revision: null,
}
