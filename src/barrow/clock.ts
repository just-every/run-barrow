import { demoEffect } from '../modules/demo/index.mjs'
import { demoStoryClock } from '../demo-data'
// A real install reads the real clock. The demo's story stands at Tue Oct 20, 2026, 6:42 pm ET (the hall's sync),
// so while real time is earlier its stock reads, drafts, approvals and invoices take the story clock.
export const now = () => demoEffect(() => new Date(), () => new Date(Math.max(Date.now(), demoStoryClock)))
