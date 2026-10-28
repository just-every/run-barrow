import { fail } from './model'
/** Exact invoice allocation; original line order breaks equal-remainder ties, with freight last. */
export function distribute(amountCents: number, weights: number[]): number[] {
 if (!Number.isSafeInteger(amountCents) || amountCents < 0 || weights.some(weight => !Number.isSafeInteger(weight) || weight < 0)) fail('REPORT_ALLOCATION', 'Invoice allocations require nonnegative integer cents.', 409)
 const total = weights.reduce((sum, weight) => sum + BigInt(weight), 0n)
 if (BigInt(amountCents) > total) fail('REPORT_ALLOCATION', 'Recorded allocations exceed the original invoice basis.', 409)
 if (!amountCents) return weights.map(() => 0)
 const shares = weights.map((weight, index) => ({ index, cents: Number(BigInt(amountCents) * BigInt(weight) / total), remainder: BigInt(amountCents) * BigInt(weight) % total }))
 const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
 const extra = amountCents - shares.reduce((sum, share) => sum + share.cents, 0)
 for (let index = 0; index < extra; index++) ranked[index].cents++
 return shares.map(share => share.cents)
}

