import { createFileRoute } from '@tanstack/react-router'
import { BarrowApp } from '../barrow/ui/app'

export const Route = createFileRoute('/app')({
  // Styles and fonts start with the document. Records load only after the buyer's current usage acceptance is checked.
  head: () => ({
    meta: [{ title: 'Barrow' }],
    links: [
      ...['/barrow/components.css', '/barrow/shell.css', '/barrow/pad.css', '/barrow/lists.css'].map(href => ({ rel: 'stylesheet', href })),
      { rel: 'preload', href: '/fonts/source-serif-4/source-serif-4-latin-standard-normal.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
    ],
  }),
  component: BarrowApp,
})
