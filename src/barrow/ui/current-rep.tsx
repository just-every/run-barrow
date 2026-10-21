import type { CurrentRep as Rep } from './types'

/** ACC-006: the buyer sees who holds their account today, by name only. */
export function CurrentRep({ reps }: { reps?: Rep[] }) {
  if (!reps?.length) return null
  const primary = reps.filter(rep => !rep.coverage), covering = reps.filter(rep => rep.coverage)
  return <p className="br-quiet-text" data-current-rep>{primary.length ? `Your rep: ${primary.map(rep => rep.name).join(', ')}.` : 'Your account has no primary rep today.'}{covering.map(rep => ` ${rep.name} is covering through ${rep.through}.`).join('')}</p>
}
