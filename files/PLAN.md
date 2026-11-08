# BAR-002 investigation plan

1. Read Barrow's contract, failing test, invoice probe and historical failed job (42426600897 / 128566138413) once. Compare main with known-green a465fabc.
2. Install pinned dependencies, preserve fleet hooks, obtain pinned Pier source only via gh api, and reproduce the unchanged physical order-guarantee test file with a bounded command on main.
3. Exercise the existing business-clock injection at 2026-11-07T01:00:00Z and 2026-11-08T00:00:00Z under UTC and Australia/Sydney. Inspect actual generated PDF bytes to distinguish product corruption from test extraction faults. Main currently equals the known-green commit, so its unchanged checkout is also the baseline comparison.
4. Fix the demonstrated cause without removing, skipping or loosening assertions. Add focused regression coverage within the existing touched test if necessary. Leave workflow and clause judgments unchanged; do not commit generated contract views or fleet evidence.
5. Rebase unpublished work onto current main, run the touched file at both dates/timezones, run barrow-1 once and typecheck. Regenerate sources.lock.json last and check it. Run the available publication scan on the exact candidate.
6. Create a fleet-authored commit, inspect every outgoing commit's identity and trailers, push cloud/sx-barrow-bar002-1 through the guard, and inspect exact-SHA Verify via REST with at most ten GitHub command calls total and at least 300 seconds between reads of a run.
7. Save complete public-safe reports and actual receipts in this packet, publish the explicit selection to evidence/sx-barrow-bar002-1, and return product provenance and the sx inbox line.
