# Validation record

Checked locally on 28 September 2026.

## Passed

- TypeScript strict type check.
- 25 automated accounting, validation, and CSV checks (`npm test`).
- Next.js production compilation, type validation, route generation, and static page generation.
- Generated Drizzle migration applied successfully to local Cloudflare D1.
- 13 HTTP integration checks against the actual local Next.js/D1 application: unauthenticated access, first-admin setup, HttpOnly/SameSite cookie attributes, one-time setup enforcement, empty workspace, origin checks, persisted records, competing revisions, batch saves, duplicate attendance, audit history, archived-ID reuse, logout, and password sign-in. The checks group related assertions into 13 scenarios.
- Browser checks at desktop and 390-pixel phone widths: combined search/meal filters, meal expense creation, attendance selection/save, credit-only settlements, and filtered resident statements.
- No application errors reported by the browser during the checked flows.

The local integration account and its records were removed after testing. No production data was used.

## Accounting coverage

Tests cover integer-paisa conservation, deterministic residual allocation, zero-eater guards, fractional stays, all shared-allocation methods, direct fuel charged exactly once, concurrent average fuel entries, no automatic fuel cap, immutable saved rates, effective/closing dates, invalid references, duplicate attendance, residence dates, refunds/reimbursements, linked personal purchases, historical recalculation, as-of balances, and ledger-to-settlement agreement.

## Deployment status

The source includes Cloudflare Worker/D1 configuration and GitHub verification/deployment workflows. A remote GitHub destination, Cloudflare authentication, and a real D1 binding must be supplied before publication. There is no public deployment or remote repository yet.

Production Free-plan CPU consumption, actual remote account limits, live deployment behavior, and real-device browser behavior have not been measured. The browser mobile check uses a phone-sized viewport.

Units removal: typecheck and all 26 tests pass. Legacy weighted shared expenses are converted atomically to exact manual allocations, with original payloads retained in audit history. Member units are removed on authenticated record access.
