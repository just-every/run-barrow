# Changes

## 2026-10-19

- Rebuilt the workspace as the owner-picked order pad: one top bar, a large style card beside a size matrix (styles down, sizes across, Units and Line $), a price change settled inside its own row, and a sticky footer with the running total. Accounts, orders, move-in, data, sign-in and setup take the same look.
- The order pad groups SKUs that end in a size into one style row, jumps to a scanned or typed SKU, and opens a draft to re-prepare it at today's prices.
- New orders record their currency (USD); the invoice CSV reads it, and earlier records keep AUD.
- The demo tells Juniper & Vale's Atlanta market week with US stockists and USD prices.

## 2026-10-16

- Built the picked market-awning design across the run-site homepage, native sign-in and setup, and all wholesale workspace screens. Shared self-hosted Barlow type and tokens replace Outfit and teal styling.
- Added on-site Markdown guides for getting started, trade accounts, ordering, move-in, agent drafts and backup/restore, with the Run Barrow path at `/run`. Installed `/` remains the Lobby.
- Added the run-site deployment configuration and workflow with publishing disabled by default. Updated the pinned RER CLI to 0.2.21.
