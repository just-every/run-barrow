import { runPricing } from '../base/run-pricing'
import type { RunData } from '../base/run-site'
import input from './run.json'

export const run: RunData = { ...input, pricing: runPricing }
