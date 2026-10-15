import { createFileRoute } from '@tanstack/react-router'
import { BarrowApp } from '../barrow/ui/app'

export const Route = createFileRoute('/app')({
  head: () => ({ meta: [{ title: 'Barrow · Wholesale' }], links: [{ rel: 'stylesheet', href: '/barrow.css' }] }),
  component: BarrowApp,
})
