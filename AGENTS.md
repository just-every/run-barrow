# Barrow

## Launch for review

Run `rer dev` from the checkout root and nothing else. It installs and sets up a fresh checkout itself. Give it at least ten minutes; if interrupted, run the same command again. Never ask for an email, port, password or answers file for a review. Share the printed `RER_READY` address and private `RER_OPEN` link only with the owner. Stop with `rer dev --stop`; a refusal names its next command. Without rer, install it once with `npx -y @runeditrun/rer@0.2.21 cli install` and add `$HOME/.local/bin` to PATH.

## Work in this seed

Read README.md and ACCEPTANCE.md. The package pins the published RER CLI; do not vendor CLI copies. Base auth copies remain exact at the recorded Base revision. Barrow owns its app/API and import target adapters. Pier owns stock allocation; never add a second stock ledger or a production mock. Buyer account identity cannot be reassigned by changing its email. Preserve declared project, package, edition, Worker and D1 IDs.

For real owner setup use `rer install`, `rer setup --owner-email you@example.com`, then `rer dev`. Local email links appear only in the private development outbox. Stop dev/preview before build, verify, export or import. `rer verify` is CI's full check; local iteration runs touched tests. No tests in build/deploy. Test cap: 200. See SEED-COMMAND-CONTRACT.md for reset, transfer and deploy effects.

Never print secret values, read ~/.env, or dump environments. Heavy work requires 1-minute load at most 36, nice 15 and one job at a time. Stop only your own process IDs. Never edit sibling repositories or force push. Before public pushes, run Base's publication scan on the exact commit/tree without exclusions. Keep research and local screenshots outside this public repository.
