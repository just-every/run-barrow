// PRI-003: a SKU's combined base quantity is valid when it is at least the minimum, a whole number of case packs,
// and the minimum plus a whole number of increments. Rules count whole base units; quantities are exact to 6 decimals.
const SCALE = 1000000n
type Rule = { minQty: number; casePack?: number; increment?: number }
const micro = (value: string) => {
 const [whole, fraction = ''] = value.split('.')
 return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0').slice(0, 6))
}
const text = (value: bigint) => `${value / SCALE}${value % SCALE ? '.' + (value % SCALE).toString().padStart(6, '0').replace(/0+$/, '') : ''}`
const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : a
// An unset case pack or increment imposes nothing, so measured quantities stay exact to 6 decimals.
const valid = (q: bigint, rule: Rule) => {
 const min = BigInt(rule.minQty) * SCALE
 return q >= min && (!rule.casePack || q % (BigInt(rule.casePack) * SCALE) === 0n) && (!rule.increment || (q - min) % (BigInt(rule.increment) * SCALE) === 0n)
}
/** The smallest valid quantity: minimum + k × increment for the first k that is a whole number of case packs. */
export function firstValid(rule: Rule) {
 const pack = BigInt(rule.casePack ?? 1), step = BigInt(rule.increment ?? 1), min = BigInt(rule.minQty)
 for (let k = 0n; k < pack / gcd(pack, step); k++) if ((min + k * step) % pack === 0n) return (min + k * step) * SCALE
 return undefined
}
/** The nearest valid quantities at or below and above `q`; valid quantities repeat every lcm(case pack, increment). */
function nearest(q: bigint, rule: Rule) {
 if (!rule.casePack && !rule.increment) return { above: BigInt(rule.minQty) * SCALE }
 const pack = BigInt(rule.casePack ?? 1), step = BigInt(rule.increment ?? 1), period = pack / gcd(pack, step) * step * SCALE, first = firstValid(rule)
 if (first === undefined) return {}
 const below = q < first ? undefined : first + (q - first) / period * period
 return { below, above: below === undefined ? first : below + period }
}
export type QuantityProblem = { reason: string; below?: string; above?: string }
export function quantityProblem(base: string, rule: Rule, unit = 'units'): QuantityProblem | null {
 const q = micro(base)
 if (valid(q, rule)) return null
 const { below, above } = nearest(q, rule)
 const reasons = [
  q < BigInt(rule.minQty) * SCALE ? `the minimum is ${rule.minQty} ${unit}` : '',
  rule.casePack && q % (BigInt(rule.casePack) * SCALE) !== 0n ? `it ships in case packs of ${rule.casePack} ${unit}` : '',
  rule.increment && q >= BigInt(rule.minQty) * SCALE && (q - BigInt(rule.minQty) * SCALE) % (BigInt(rule.increment) * SCALE) !== 0n ? `above the minimum it is ordered in steps of ${rule.increment} ${unit}` : '',
 ].filter(Boolean)
 return { reason: reasons.join(' and ') || 'the quantity does not meet this SKU’s ordering rules', ...(below !== undefined ? { below: text(below) } : {}), ...(above !== undefined ? { above: text(above) } : {}) }
}
/** A buyer-facing sentence naming the problem and the explicit corrections; nothing is applied for the buyer. */
export function quantityMessage(sku: string, base: string, problem: QuantityProblem, unit = 'units') {
 const choices = [problem.below, problem.above].filter((value): value is string => value !== undefined)
 return `${sku}: ${base} ${unit} cannot be ordered because ${problem.reason}. Choose ${choices.map(value => `${value} ${unit}`).join(' or ')} instead.`
}
