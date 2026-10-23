# Self-hosted type

Barrow's look (design desk, 19 Oct 2026): a heavy ink serif for headings and money totals, a clean sans with tabular figures for everything else, a marker hand for the cinnabar notes and a mono for commands. Every file is served from this folder; no page requests third-party fonts.

| Family | Use | File | Source | Licence |
| --- | --- | --- | --- | --- |
| Source Serif 4 (variable: weight 200–900, optical size) | headings, the wordmark, account names and totals | `source-serif-4/source-serif-4-latin-standard-normal.woff2` | `@fontsource-variable/source-serif-4` 5.3.1 (Adobe, via Google Fonts) | SIL OFL 1.1, `source-serif-4/OFL.txt` |
| Inter (variable: weight 100–900) | body, cards, tables, UI | `inter/inter-latin-wght-normal.woff2` | `@fontsource-variable/inter` 5.3.0 | SIL OFL 1.1, `inter/OFL.txt` |
| Kalam 700 | handwritten notes ("reorder!", "ship Feb") and the handwritten PO | `kalam/kalam-latin-700-normal.woff2` | `@fontsource/kalam` 5.3.0 (Indian Type Foundry) | SIL OFL 1.1, `kalam/OFL.txt` |
| JetBrains Mono (variable: weight 100–800) | commands and code | `jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2` | `@fontsource-variable/jetbrains-mono` 5.3.0 | SIL OFL 1.1, `jetbrains-mono/OFL.txt` |

`public/rer-theme.css` declares the faces, so the installer serves them too, and names the families once as tokens; the app, the run site and Base's pages read those tokens. `fonts.css` keeps form controls in the page font and carries Barrow's own tokens and the rules that dress Base's pages, which Base's theme grammar keeps out of `/rer-theme.css`. Every page links `/fonts/fonts.css` with the theme. `src/base/font-head.ts` preloads Inter for the app and the native sign-in and setup documents.
