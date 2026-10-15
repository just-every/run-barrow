import { createFileRoute } from '@tanstack/react-router'
import { BarrowApp } from '../barrow/ui/app'

export const Route = createFileRoute('/app')({
  head: () => ({ meta: [{ title: 'Barrow' }], links: [{ rel: 'stylesheet', href: '/barrow.css' }] }),
  component: BarrowApp,
})
