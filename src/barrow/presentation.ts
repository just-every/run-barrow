import { fail, text } from './model'

export type Presentation = { title: string; introduction: string; sections: Array<{ title: string; text: string; skus: string[] }> }
/** Rebuilt editorial content references native eligible variants, never incumbent private layouts. */
export function presentation(value: unknown, eligible: string[]): Presentation | undefined {
 if (value === undefined) return undefined
 if (!value || typeof value !== 'object') fail('PRESENTATION', 'Supply presentation text and named product collections.', 400)
 const input = value as Presentation
 if (!Array.isArray(input.sections) || !input.sections.length || input.sections.length > 20) fail('PRESENTATION', 'A presentation needs between one and twenty collections.', 400)
 const sections = input.sections.map(section => {
  if (!Array.isArray(section?.skus) || !section.skus.length || section.skus.length > 100 || new Set(section.skus).size !== section.skus.length || section.skus.some(sku => !eligible.includes(sku))) fail('PRESENTATION', 'Each collection must name distinct variants on this recipient sheet.', 400)
  return { title: text(section.title, 'Collection title', 100), text: text(section.text, 'Collection text', 3000), skus: [...section.skus] }
 })
 return { title: text(input.title, 'Presentation title', 100), introduction: text(input.introduction, 'Presentation introduction', 3000), sections }
}
