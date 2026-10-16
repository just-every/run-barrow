import { createFileRoute } from '@tanstack/react-router'
import { BarrowApp } from '../barrow/ui/app'

export const Route = createFileRoute('/app')({
  // Everything the first view needs starts with the document: the stylesheets directly (no @import hop),
  // the font weights they use, and the records request (BarrowApp's first load reads it).
  head: () => ({
    meta: [{ title: 'Barrow' }],
    links: [
      ...['/barrow/components.css', '/barrow/shell.css', '/barrow/tables.css'].map(href => ({ rel: 'stylesheet', href })),
      ...['/fonts/barlow/medium.ttf', '/fonts/barlow/semibold.ttf', '/fonts/barlow-condensed/bold.ttf'].map(href => ({ rel: 'preload', href, as: 'font', type: 'font/ttf', crossOrigin: 'anonymous' })),
      { rel: 'preload', href: '/api/barrow/state', as: 'fetch', crossOrigin: 'anonymous' },
    ],
  }),
  component: BarrowApp,
})
